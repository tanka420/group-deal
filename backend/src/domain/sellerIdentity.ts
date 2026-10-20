import { z } from 'zod';
export const socialProvider = z.enum(['github', 'x', 'discord']);
export type SocialProvider = z.infer<typeof socialProvider>;
export class SellerIdentityError extends Error {
    constructor(public readonly code: string, public readonly status = 409) { super(code); }
}
const reserved = new Set(['admin', 'administrator', 'api', 'groupdeal', 'operator', 'support', 'system', 'root', 'security', 'help', 'null', 'undefined', 'constructor', 'prototype', '__proto__']);
export const sellerUsername = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,29}$/).refine(s => !reserved.has(s));
export const socialLinkSchema = z.object({ provider: socialProvider, providerUserId: z.string().regex(/^[0-9]{1,30}$/), username: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/), url: z.string().url(), verifiedAt: z.number().int().nonnegative() }).strict();
export type SocialLink = z.infer<typeof socialLinkSchema>;
export type SellerIdentityRecord = {
    userId: string;
    username?: string;
    revision: number;
    links: Partial<Record<SocialProvider, SocialLink>>;
    updatedAt: number;
};
export type SocialAttempt = {
    id: string;
    userId: string;
    sessionKey: string;
    provider: SocialProvider;
    origin: string;
    redirectUri: string;
    verifierEncrypted?: string;
    createdAt: number;
    expiresAt: number;
    state: 'PENDING' | 'EXCHANGING' | 'COMMITTED' | 'CANCELLED' | 'FAILED';
    baseRevision: number;
    result?: SocialLink;
};
export const socialAttemptSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), userId: z.string().min(1).max(128), sessionKey: z.string().min(1).max(256), provider: socialProvider, origin: z.string().url(), redirectUri: z.string().url(), verifierEncrypted: z.string().min(1).max(2048).optional(), createdAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(), state: z.enum(['PENDING', 'EXCHANGING', 'COMMITTED', 'CANCELLED', 'FAILED']), baseRevision: z.number().int().nonnegative(), result: socialLinkSchema.optional() }).strict();
export function canonicalSocialLink(provider: SocialProvider, profile: unknown, now: number): SocialLink {
    const p = profile as Record<string, unknown>;
    let id: unknown, username: unknown;
    if (provider === 'github') {
        id = p?.id;
        username = p?.login;
        if (typeof id === 'number') {
            if (!Number.isSafeInteger(id) || id <= 0)
                throw new SellerIdentityError('SOCIAL_PROFILE_INVALID', 502);
            id = String(id);
        }
    }
    else if (provider === 'x') {
        const d = p?.data as Record<string, unknown>;
        id = d?.id;
        username = d?.username;
    }
    else {
        id = p?.id;
        username = p?.username;
    }
    const parsed = socialLinkSchema.safeParse({ provider, providerUserId: id, username, url: 'https://placeholder.invalid', verifiedAt: now });
    if (!parsed.success)
        throw new SellerIdentityError('SOCIAL_PROFILE_INVALID', 502);
    const value = parsed.data;
    if (provider === 'github' && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value.username) || provider === 'x' && !/^[A-Za-z0-9_]{1,15}$/.test(value.username))
        throw new SellerIdentityError('SOCIAL_PROFILE_INVALID', 502);
    return { ...value, url: provider === 'github' ? 'https://github.com/' + value.username : provider === 'x' ? 'https://x.com/' + value.username : 'https://discord.com/users/' + value.providerUserId };
}
export function readSellerIdentity(value: unknown, userId: string): SellerIdentityRecord {
    if (value === undefined)
        return { userId, revision: 0, links: {}, updatedAt: 0 };
    const s = z.object({ userId: z.literal(userId), username: sellerUsername.optional(), revision: z.number().int().nonnegative(), links: z.object({ github: socialLinkSchema.optional(), x: socialLinkSchema.optional(), discord: socialLinkSchema.optional() }).strict(), updatedAt: z.number().int().nonnegative() }).strict().safeParse(value);
    if (!s.success)
        throw new SellerIdentityError('SELLER_IDENTITY_UNAVAILABLE', 503);
    for (const [k, link] of Object.entries(s.data.links)) {
        if (!link || link.provider !== k || canonicalSocialLink(link.provider, link.provider === 'github' ? { id: Number(link.providerUserId), login: link.username } : link.provider === 'x' ? { data: { id: link.providerUserId, username: link.username } } : { id: link.providerUserId, username: link.username }, link.verifiedAt).url !== link.url)
            throw new SellerIdentityError('SELLER_IDENTITY_UNAVAILABLE', 503);
    }
    return s.data;
}
