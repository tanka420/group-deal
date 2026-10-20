import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { store, TransactionalStore } from '../src/db/store';
import { SessionService, SessionRegistry } from '../src/services/sessionService';
import { SellerIdentityRegistry } from '../src/services/sellerIdentityService';
import { sellerIdentityRouter } from '../src/routes/sellerIdentityRoutes';
import { canonicalSocialLink, sellerUsername, type SocialProvider } from '../src/domain/sellerIdentity';
import { config } from '../src/config';
import { StorageConflict } from '../src/db/rowPersistence';
import { OperationPreparationService } from '../src/services/operationPreparationService';
import { BackupService } from '../src/services/backupService';
async function main() {
    assert.ok(store.isIsolated);
    let checks = 0;
    const check = (f: () => void) => { f(); checks++; }, a = 'identity-seller-a', b = 'identity-seller-b';
    for (const id of [a, b])
        store.db.users[id] = { id, email: id + '@fixture.invalid', createdAt: Date.now(), roles: ['buyer', 'seller'], activeWallet: null, sellerProfile: { displayName: id, bio: 'fixture', payoutWallet: '0x0000000000000000000000000000000000000001', verifiedRightsBadge: false, verifiedSellerBadge: false } };
    store.save();
    const tokenA = SessionService.issue(store.db.users[a]), tokenB = SessionService.issue(store.db.users[b]), pa = SessionService.authenticate(tokenA), pb = SessionService.authenticate(tokenB), origin = config.allowedOrigins[0], credentials = () => ({ clientId: 'fixture-id', secret: 'fixture-secret' });
    let calls = 0, subject = '123456', login = 'fixture-user', exchangeError = false;
    const exchange = async (p: SocialProvider) => { calls++; if (exchangeError)
        throw Error('simulated outage'); return canonicalSocialLink(p, p === 'github' ? { id: Number(subject), login } : p === 'x' ? { data: { id: subject, username: 'fixture_user' } } : { id: subject, username: 'fixture.user' }, Date.now()); }, service = new SellerIdentityRegistry(store, { credentials, exchange });
    const financial = JSON.stringify({ orders: store.db.orders, campaigns: store.db.campaigns, flows: store.db.walletFlows, signers: store.db.signerReservations, resources: store.db.resourceGrants });
    check(() => assert.equal(service.status(pa).identity.revision, 0));
    check(() => assert.equal(sellerUsername.safeParse('Admin').success, false));
    check(() => assert.equal(sellerUsername.safeParse('ab').success, false));
    check(() => assert.equal(sellerUsername.parse(' My_seller1 '), 'my_seller1'));
    const saved = service.username(pa, { username: 'MY_SELLER1', expectedRevision: 0 });
    check(() => assert.equal(saved.identity.username, 'my_seller1'));
    check(() => assert.equal(service.username(pa, { username: 'my_seller1', expectedRevision: 0 }).identity.revision, 1));
    check(() => assert.throws(() => service.username(pb, { username: 'my_seller1', expectedRevision: 0 }), /SELLER_USERNAME_UNAVAILABLE/));
    check(() => assert.throws(() => service.username(pa, { username: 'another_name', expectedRevision: 1 }), /SELLER_USERNAME_ALREADY_SET/));
    check(() => assert.equal(service.publicIdentity(a).username, 'my_seller1'));
    check(() => assert.throws(() => service.publicIdentity('__proto__'), /SELLER_NOT_FOUND/));
    const start = service.start(pa, 'github', origin), url = new URL(start.authorizationUrl);
    check(() => assert.equal(url.origin, 'https://github.com'));
    check(() => assert.equal(url.searchParams.get('code_challenge_method'), 'S256'));
    check(() => assert.equal(url.searchParams.get('scope'), 'read:user'));
    check(() => assert.equal(url.searchParams.get('redirect_uri'), origin + '/seller/profile'));
    const attemptId = crypto.createHash('sha256').update(start.state).digest('hex');
    check(() => assert.ok(store.db.sellerSocialAttempts![attemptId].verifierEncrypted?.startsWith('v2:')));
    check(() => assert.equal(JSON.stringify(service.status(pa)).includes('verifier'), false));
    await assert.rejects(() => service.complete(pb, 'github', { state: start.state, code: 'fixture-code' }, origin), /SOCIAL_CALLBACK_INVALID/);
    checks++;
    await assert.rejects(() => service.complete(pa, 'x', { state: start.state, code: 'fixture-code' }, origin), /SOCIAL_CALLBACK_INVALID/);
    checks++;
    await assert.rejects(() => service.complete(pa, 'github', { state: start.state, code: 'fixture-code' }, 'https://evil.invalid'), /SOCIAL_CALLBACK_INVALID/);
    checks++;
    const linked = await service.complete(pa, 'github', { state: start.state, code: 'fixture-code' }, origin);
    check(() => assert.equal(linked.identity?.links.github?.url, 'https://github.com/fixture-user'));
    check(() => assert.equal(store.db.sellerSocialAttempts![attemptId].verifierEncrypted, undefined));
    const callsBefore = calls;
    await service.complete(pa, 'github', { state: start.state, code: 'fixture-code' }, origin);
    check(() => assert.equal(calls, callsBefore));
    check(() => assert.equal(service.publicIdentity(a).links.length, 1));
    const deniedDuplicate = service.start(pb, 'github', origin);
    await assert.rejects(() => service.complete(pb, 'github', { state: deniedDuplicate.state, code: 'fixture-code' }, origin), /SOCIAL_ALREADY_LINKED/);
    checks++;
    check(() => assert.equal(service.publicIdentity(b).links.length, 0));
    const stale = service.start(pa, 'discord', origin), rev = service.status(pa).identity.revision, unlinked = service.unlink(pa, 'github', { expectedRevision: rev });
    check(() => assert.equal(unlinked.identity.links.github, undefined));
    check(() => assert.equal(service.publicIdentity(a).links.length, 0));
    await assert.rejects(() => service.complete(pa, 'discord', { state: stale.state, code: 'fixture-code' }, origin), /SELLER_IDENTITY_CHANGED/);
    checks++;
    await service.complete(pa, 'github', { state: start.state, code: 'fixture-code' }, origin);
    check(() => assert.equal(service.publicIdentity(a).links.length, 0));
    const moved = service.start(pb, 'github', origin);
    await service.complete(pb, 'github', { state: moved.state, code: 'fixture-code' }, origin);
    check(() => assert.equal(service.publicIdentity(b).links[0].providerUserId, subject));
    login = 'renamed-user';
    const refreshed = service.start(pb, 'github', origin);
    await service.complete(pb, 'github', { state: refreshed.state, code: 'fixture-code' }, origin);
    check(() => assert.equal(service.publicIdentity(b).links[0].url, 'https://github.com/renamed-user'));
    subject = '987654';
    const foreign = service.start(pb, 'github', origin);
    await assert.rejects(() => service.complete(pb, 'github', { state: foreign.state, code: 'fixture-code' }, origin), /SOCIAL_UNLINK_FIRST/);
    checks++;
    check(() => assert.equal(service.publicIdentity(b).links[0].providerUserId, '123456'));
    const denied = service.start(pa, 'discord', origin), cancelled = await service.complete(pa, 'discord', { state: denied.state, denied: true }, origin);
    check(() => assert.equal(cancelled.cancelled, true));
    await assert.rejects(() => service.complete(pa, 'discord', { state: denied.state, code: 'fixture-code' }, origin), /SOCIAL_CALLBACK_ALREADY_USED/);
    checks++;
    exchangeError = true;
    const outage = service.start(pa, 'x', origin);
    await assert.rejects(() => service.complete(pa, 'x', { state: outage.state, code: 'fixture-code' }, origin), /SOCIAL_PROVIDER_UNAVAILABLE/);
    checks++;
    await assert.rejects(() => service.complete(pa, 'x', { state: outage.state, code: 'fixture-code' }, origin), /SOCIAL_CALLBACK_ALREADY_USED/);
    checks++;
    exchangeError = false;
    const sessionChanged = service.start(pa, 'discord', origin), newToken = SessionService.issue(store.db.users[a]), newProof = SessionService.authenticate(newToken);
    await assert.rejects(() => service.complete(newProof, 'discord', { state: sessionChanged.state, code: 'fixture-code' }, origin), /SOCIAL_CALLBACK_INVALID/);
    checks++;
    const unconfigured = new SellerIdentityRegistry(store, { credentials: () => undefined, exchange });
    check(() => assert.throws(() => unconfigured.start(pa, 'x', origin), /SOCIAL_PROVIDER_NOT_CONFIGURED/));
    check(() => assert.ok(unconfigured.status(pa).providers.every(p => !p.configured)));
    check(() => assert.throws(() => canonicalSocialLink('github', { id: 123, login: '../evil' }, Date.now()), /SOCIAL_PROFILE_INVALID/));
    check(() => assert.throws(() => (OperationPreparationService as any).authority({ auth: { user: store.db.users[a], sessions: {} }, priorDirty: false, targetsDirty: false }, a, undefined, 'PUBLISH'), /SELLER_USERNAME_REQUIRED/));
    check(() => assert.doesNotThrow(() => (OperationPreparationService as any).authority({ auth: { user: store.db.users[a], sessions: {}, sellerIdentity: store.db.sellerIdentities![a] }, priorDirty: false, targetsDirty: false }, a, undefined, 'PUBLISH')));
    check(() => assert.doesNotThrow(() => (OperationPreparationService as any).authority({ auth: { user: store.db.users[a], sessions: {} }, prior: {}, priorDirty: false, targetsDirty: false }, a, undefined, 'PUBLISH')));
    const peer = new TransactionalStore(path.dirname(store.filePath));
    try {
        const registry = new SellerIdentityRegistry(peer, { credentials, exchange }), r = service.status(pa).identity.revision;
        service.unlink(pb, 'github', { expectedRevision: service.status(pb).identity.revision });
        check(() => assert.throws(() => registry.start(pa, 'x', origin), /SELLER_IDENTITY_CONFLICT/));
        check(() => assert.equal(service.status(pa).identity.revision, r));
    }
    finally {
        peer.close();
    }
    const restarted = new TransactionalStore(path.dirname(store.filePath));
    try {
        check(() => assert.equal(new SellerIdentityRegistry(restarted, { credentials, exchange }).status(pa).identity.username, 'my_seller1'));
    }
    finally {
        restarted.close();
    }
    const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'groupdeal-identity-restore-')), target = new TransactionalStore(restoreDir);
    try {
        const backup = BackupService.createEncryptedBackup(path.join(restoreDir, 'encrypted'), store);
        BackupService.restoreEncryptedBackup(backup.backupPath, target);
        check(() => assert.deepEqual(target.db.sellerIdentities, store.db.sellerIdentities));
        check(() => assert.deepEqual(target.db.sellerSocialOwners, store.db.sellerSocialOwners));
        check(() => assert.deepEqual(target.db.sellerSocialAttempts, store.db.sellerSocialAttempts));
    }
    finally {
        target.close();
    }
    const app = express();
    app.use(express.json());
    app.use('/api/seller/identity', sellerIdentityRouter);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', r));
    try {
        const base = 'http://127.0.0.1:' + (server.address() as any).port + '/api/seller/identity', r = await fetch(base);
        check(() => assert.equal(r.status, 401));
        const pub = await fetch(base + '/public/' + a);
        check(() => assert.equal(pub.status, 200));
        const bad = await fetch(base + '/username', { method: 'POST', headers: { Authorization: 'Bearer ' + tokenA, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'spoof', expectedRevision: 1, userId: b }) });
        check(() => assert.equal(bad.status, 400));
        const publicBody = await pub.json();
        check(() => assert.equal(JSON.stringify(publicBody).includes('sessionKey'), false));
    }
    finally {
        server.close();
    }
    check(() => assert.equal(JSON.stringify({ orders: store.db.orders, campaigns: store.db.campaigns, flows: store.db.walletFlows, signers: store.db.signerReservations, resources: store.db.resourceGrants }), financial));
    console.log(JSON.stringify({ result: 'SELLER_IDENTITY_SCOPED_PASS', checks, liveProviderCalls: 0, liveDatabaseAccessed: false }));
    store.close();
}
main().catch(e => { console.error(e); process.exitCode = 1; });
