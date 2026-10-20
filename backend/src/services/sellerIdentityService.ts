import crypto from 'node:crypto';
import { z } from 'zod';
import { store, TransactionalStore } from '../db/store';
import { StorageConflict, LegacyWriterConflict, type SellerIdentityState, type SellerIdentityPlan } from '../db/rowPersistence';
import { SessionService, SessionError, type SessionProof } from './sessionService';
import { config } from '../config';
import { encryptEntitlement, decryptEntitlement } from '../utils/crypto';
import { assertNewBusinessAction } from '../domain/accountAccess';
import { sellerUsername, socialProvider, socialAttemptSchema, readSellerIdentity, canonicalSocialLink, SellerIdentityError, type SocialProvider, type SellerIdentityRecord, type SocialAttempt, type SocialLink } from '../domain/sellerIdentity';
const digest = (s: string) => crypto.createHash('sha256').update(s).digest('hex'), key = (c: string, k: string) => JSON.stringify([c, k]), ownerKey = (p: SocialProvider, id: string) => digest(p + ':' + id), providers = { github: { authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', profile: 'https://api.github.com/user', scope: 'read:user' }, x: { authorize: 'https://x.com/i/oauth2/authorize', token: 'https://api.x.com/2/oauth2/token', profile: 'https://api.x.com/2/users/me', scope: 'users.read tweet.read' }, discord: { authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', profile: 'https://discord.com/api/v10/users/@me', scope: 'identify' } };
const revision = z.number().int().nonnegative(), stateInput = z.string().regex(/^[A-Za-z0-9_-]{43}$/), idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).refine(s => !['__proto__', 'constructor', 'prototype'].includes(s));
type ProviderConfig = {
    clientId: string;
    secret: string;
};
type Dependencies = {
    credentials: (p: SocialProvider) => ProviderConfig | undefined;
    exchange: (p: SocialProvider, c: ProviderConfig, a: SocialAttempt, code: string) => Promise<SocialLink>;
};
function credentials(p: SocialProvider) { const prefix = 'GROUPDEAL_SOCIAL_' + p.toUpperCase(), clientId = process.env[prefix + '_CLIENT_ID'], secret = process.env[prefix + '_CLIENT_SECRET']; return clientId && secret && !/[\s\u0000-\u001f]/.test(clientId + secret) && clientId.length < 512 && secret.length < 2048 ? { clientId, secret } : undefined; }
async function jsonResponse(response: Response) { if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel();
    throw new SellerIdentityError('SOCIAL_PROVIDER_UNAVAILABLE', 502);
} const reader = response.body?.getReader(); if (!reader)
    throw new SellerIdentityError('SOCIAL_PROVIDER_UNAVAILABLE', 502); let text = '', length = 0; const decoder = new TextDecoder(); for (;;) {
    const { done, value } = await reader.read();
    if (done)
        break;
    length += value.length;
    if (length > 32768) {
        await reader.cancel();
        throw new SellerIdentityError('SOCIAL_PROVIDER_UNAVAILABLE', 502);
    }
    text += decoder.decode(value, { stream: true });
} try {
    return JSON.parse(text + decoder.decode());
}
catch {
    throw new SellerIdentityError('SOCIAL_PROVIDER_UNAVAILABLE', 502);
} }
async function exchange(p: SocialProvider, c: ProviderConfig, a: SocialAttempt, code: string) { const d = providers[p], params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: a.redirectUri, code_verifier: decryptEntitlement(a.verifierEncrypted!), client_id: c.clientId }), headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'GroupDeal/1.0' }; if (p === 'x')
    headers.Authorization = 'Basic ' + Buffer.from(c.clientId + ':' + c.secret).toString('base64');
else
    params.set('client_secret', c.secret); const t = await jsonResponse(await fetch(d.token, { method: 'POST', headers, body: params, redirect: 'error', signal: AbortSignal.timeout(12000) })); if (typeof t.access_token !== 'string' || !t.access_token || t.access_token.length > 8192 || /[\s\u0000-\u001f]/.test(t.access_token) || String(t.token_type).toLowerCase() !== 'bearer')
    throw new SellerIdentityError('SOCIAL_PROVIDER_UNAVAILABLE', 502); const profile = await jsonResponse(await fetch(d.profile, { headers: { Authorization: 'Bearer ' + t.access_token, Accept: 'application/json', 'User-Agent': 'GroupDeal/1.0' }, redirect: 'error', signal: AbortSignal.timeout(12000) })); return canonicalSocialLink(p, profile, Date.now()); }
export class SellerIdentityRegistry {
    constructor(private database: TransactionalStore, private deps: Dependencies = { credentials, exchange }) { }
    private actor(proof: SessionProof, s: SellerIdentityState) { const user = SessionService.assertCommitted(proof, s.auth); if (proof.record.realm === 'ADMIN')
        throw new SessionError('AUTH_SESSION_REALM_REQUIRED', 403); return user; }
    private run<T>(proof: SessionProof, keys: [
        string,
        string
    ][], fn: (s: SellerIdentityState, i: SellerIdentityRecord) => SellerIdentityPlan<T>): T { try {
        return this.database.mutateSellerIdentity(proof.account.id, proof.key, keys, s => { this.actor(proof, s); return fn(s, readSellerIdentity(s.identity, proof.account.id)); });
    }
    catch (e) {
        if (e instanceof StorageConflict || e instanceof LegacyWriterConflict)
            throw new SellerIdentityError('SELLER_IDENTITY_CONFLICT');
        throw e;
    } }
    private configuration(p: SocialProvider) { const c = this.deps.credentials(p); if (!c)
        throw new SellerIdentityError('SOCIAL_PROVIDER_NOT_CONFIGURED', 503); return c; }
    public status(proof: SessionProof) { const s = this.database.readSellerIdentity(proof.account.id, proof.key); this.actor(proof, s); return { identity: readSellerIdentity(s.identity, proof.account.id), providers: socialProvider.options.map(provider => ({ provider, configured: Boolean(this.deps.credentials(provider)) })), serverTime: Date.now() }; }
    public publicIdentity(id: string) { if (!idSchema.safeParse(id).success)
        throw new SellerIdentityError('SELLER_NOT_FOUND', 404); const s = this.database.readSellerIdentity(id, ''); if (!s.auth.user?.roles.includes('seller') || !s.auth.user.sellerProfile)
        throw new SellerIdentityError('SELLER_NOT_FOUND', 404); const i = readSellerIdentity(s.identity, id); return { sellerId: id, username: i.username ?? null, links: Object.values(i.links), projection: 'VERIFIED_LINKS_AT_RECORDED_TIME', serverTime: Date.now() }; }
    public username(proof: SessionProof, input: unknown) { const p = z.object({ username: sellerUsername, expectedRevision: revision }).strict().parse(input), id = proof.account.id; return this.run(proof, [['sellerIdentities', id], ['sellerUsernames', p.username]], (s, i) => { if (i.username === p.username && s.rows[key('sellerUsernames', p.username)] === id)
        return { result: { identity: i } }; if (i.revision !== p.expectedRevision)
        throw new SellerIdentityError('SELLER_IDENTITY_CHANGED'); if (i.username)
        throw new SellerIdentityError('SELLER_USERNAME_ALREADY_SET'); assertNewBusinessAction(s.auth.user, 'SELLER'); const owner = s.rows[key('sellerUsernames', p.username)]; if (owner !== undefined && owner !== id)
        throw new SellerIdentityError('SELLER_USERNAME_UNAVAILABLE'); const value = { ...i, username: p.username, revision: i.revision + 1, updatedAt: Date.now() }; return { result: { identity: value }, writes: [{ collection: 'sellerIdentities', key: id, value }, { collection: 'sellerUsernames', key: p.username, value: id }], audit: { action: 'SELLER_USERNAME_SET', details: { username: p.username, revision: value.revision } } }; }); }
    public start(proof: SessionProof, p: SocialProvider, origin: string) { p = socialProvider.parse(p); const c = this.configuration(p); if (!config.allowedOrigins.includes(origin) || new URL(origin).origin !== origin || !origin.startsWith('https://') && process.env.NODE_ENV !== 'test')
        throw new SellerIdentityError('SOCIAL_ORIGIN_INVALID', 403); const raw = crypto.randomBytes(32).toString('base64url'), id = digest(raw), verifier = crypto.randomBytes(32).toString('base64url'), redirectUri = origin + '/seller/profile', now = Date.now(), auth = new URL(providers[p].authorize); for (const [k, v] of Object.entries({ client_id: c.clientId, response_type: 'code', redirect_uri: redirectUri, scope: providers[p].scope, state: raw, code_challenge: digestBase64(verifier), code_challenge_method: 'S256' }))
        auth.searchParams.set(k, v); return this.run(proof, [['sellerSocialAttempts', id], ['sellerIdentityRates', proof.account.id]], (s, i) => { assertNewBusinessAction(s.auth.user, 'SELLER'); const old = s.rows[key('sellerIdentityRates', proof.account.id)] as {
        count: number;
        startedAt: number;
    } | undefined; if (old && (!Number.isSafeInteger(old.count) || !Number.isSafeInteger(old.startedAt) || old.count < 0 || old.startedAt > now))
        throw new SellerIdentityError('SELLER_IDENTITY_UNAVAILABLE', 503); const rate = !old || now - old.startedAt >= 600000 ? { count: 0, startedAt: now } : old; if (rate.count >= 10)
        throw new SellerIdentityError('SOCIAL_RATE_LIMIT', 429); const a: SocialAttempt = { id, userId: proof.account.id, sessionKey: proof.key, provider: p, origin, redirectUri, verifierEncrypted: encryptEntitlement(verifier), createdAt: now, expiresAt: now + 300000, state: 'PENDING', baseRevision: i.revision }; return { result: { provider: p, state: raw, authorizationUrl: auth.href, expiresAt: a.expiresAt }, writes: [{ collection: 'sellerSocialAttempts', key: id, value: a }, { collection: 'sellerIdentityRates', key: proof.account.id, value: { ...rate, count: rate.count + 1 } }] }; }); }
    public async complete(proof: SessionProof, p: SocialProvider, input: unknown, origin: string) { p = socialProvider.parse(p); const body = z.object({ state: stateInput, code: z.string().min(1).max(4096).regex(/^[^\s\u0000-\u001f]+$/).optional(), denied: z.boolean().optional() }).strict().parse(input); if (Boolean(body.code) === Boolean(body.denied))
        throw new SellerIdentityError('SOCIAL_CALLBACK_INVALID', 400); const id = digest(body.state), keys: [
        string,
        string
    ][] = [['sellerSocialAttempts', id], ['sellerIdentities', proof.account.id]]; const attempt = this.run<SocialAttempt>(proof, keys, (s, i) => { const a = s.rows[key('sellerSocialAttempts', id)] as SocialAttempt | undefined; this.owned(a, proof, p, origin, id); if (a!.state === 'COMMITTED')
        return { result: { ...a!, result: i.links[p] } }; if (a!.state !== 'PENDING')
        throw new SellerIdentityError('SOCIAL_CALLBACK_ALREADY_USED'); if (a!.baseRevision !== i.revision)
        throw new SellerIdentityError('SELLER_IDENTITY_CHANGED'); const next = { ...a!, state: body.denied ? 'CANCELLED' as const : 'EXCHANGING' as const, ...(body.denied ? { verifierEncrypted: undefined } : {}) }; return { result: next, writes: [{ collection: 'sellerSocialAttempts', key: id, value: next }] }; }); if (attempt.state === 'COMMITTED')
        return { identity: this.status(proof).identity }; if (attempt.state === 'CANCELLED')
        return { cancelled: true }; let link: SocialLink; try {
        link = await this.deps.exchange(p, this.configuration(p), attempt, body.code!);
    }
    catch {
        this.run(proof, keys, s => { const a = s.rows[key('sellerSocialAttempts', id)] as SocialAttempt | undefined; this.owned(a, proof, p, origin, id); return { result: null, writes: [{ collection: 'sellerSocialAttempts', key: id, value: { ...a!, state: 'FAILED', verifierEncrypted: undefined } }] }; });
        throw new SellerIdentityError('SOCIAL_PROVIDER_UNAVAILABLE', 502);
    } const binding = ownerKey(p, link.providerUserId); return this.run(proof, [...keys, ['sellerSocialOwners', binding]], (s, i) => { const a = s.rows[key('sellerSocialAttempts', id)] as SocialAttempt | undefined; this.owned(a, proof, p, origin, id); assertNewBusinessAction(s.auth.user, 'SELLER'); if (a!.state !== 'EXCHANGING' || i.revision !== a!.baseRevision)
        throw new SellerIdentityError('SELLER_IDENTITY_CHANGED'); if (i.links[p] && i.links[p]!.providerUserId !== link.providerUserId)
        throw new SellerIdentityError('SOCIAL_UNLINK_FIRST'); const owner = s.rows[key('sellerSocialOwners', binding)]; if (owner !== undefined && owner !== proof.account.id)
        throw new SellerIdentityError('SOCIAL_ALREADY_LINKED'); link = canonicalSocialLink(p, p === 'github' ? { id: Number(link.providerUserId), login: link.username } : p === 'x' ? { data: { id: link.providerUserId, username: link.username } } : { id: link.providerUserId, username: link.username }, link.verifiedAt); const value = { ...i, links: { ...i.links, [p]: link }, revision: i.revision + 1, updatedAt: Date.now() }; return { result: { identity: value }, writes: [{ collection: 'sellerIdentities', key: i.userId, value }, { collection: 'sellerSocialOwners', key: binding, value: i.userId }, { collection: 'sellerSocialAttempts', key: id, value: { ...a!, state: 'COMMITTED', result: link, verifierEncrypted: undefined } }], audit: { action: 'SELLER_SOCIAL_LINKED', details: { provider: p, providerUserId: link.providerUserId, revision: value.revision } } }; }); }
    private owned(a: SocialAttempt | undefined, proof: SessionProof, p: SocialProvider, origin: string, id: string) { if (!socialAttemptSchema.safeParse(a).success || !a || a.id !== id || a.expiresAt - a.createdAt !== 300000 || a.redirectUri !== a.origin + '/seller/profile' || (['PENDING', 'EXCHANGING'].includes(a.state) && !a.verifierEncrypted) || a.userId !== proof.account.id || a.sessionKey !== proof.key || a.provider !== p || a.origin !== origin)
        throw new SellerIdentityError('SOCIAL_CALLBACK_INVALID', 403); if (Date.now() < a.createdAt || Date.now() >= a.expiresAt)
        throw new SellerIdentityError('SOCIAL_CALLBACK_EXPIRED'); }
    public unlink(proof: SessionProof, p: SocialProvider, input: unknown) { p = socialProvider.parse(p); const body = z.object({ expectedRevision: revision }).strict().parse(input), first = this.status(proof).identity, old = first.links[p]; if (!old)
        throw new SellerIdentityError('SOCIAL_LINK_NOT_FOUND', 404); const binding = ownerKey(p, old.providerUserId); return this.run(proof, [['sellerIdentities', proof.account.id], ['sellerSocialOwners', binding]], (s, i) => { if (i.revision !== body.expectedRevision || i.links[p]?.providerUserId !== old.providerUserId || s.rows[key('sellerSocialOwners', binding)] !== i.userId)
        throw new SellerIdentityError('SELLER_IDENTITY_CHANGED'); const links = { ...i.links }; delete links[p]; const value = { ...i, links, revision: i.revision + 1, updatedAt: Date.now() }; return { result: { identity: value }, writes: [{ collection: 'sellerIdentities', key: i.userId, value }, { collection: 'sellerSocialOwners', key: binding, value: undefined }], audit: { action: 'SELLER_SOCIAL_UNLINKED', details: { provider: p, revision: value.revision } } }; }); }
}
function digestBase64(s: string) { return crypto.createHash('sha256').update(s).digest('base64url'); }
export const SellerIdentityService = new SellerIdentityRegistry(store);
