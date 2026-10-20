export type Provider = 'github' | 'x' | 'discord';
export type IdentityLink = {
    provider: Provider;
    providerUserId: string;
    username: string;
    url: string;
    verifiedAt: number;
};
export type Identity = {
    userId: string;
    username?: string;
    revision: number;
    links: Partial<Record<Provider, IdentityLink>>;
    updatedAt: number;
};
export const providers = ['github', 'x', 'discord'] as const;
export const providerName = (p: Provider) => p === 'github' ? 'GitHub' : p === 'x' ? 'X' : 'Discord';
export function readLink(value: unknown): IdentityLink { const l = value as IdentityLink; if (!l || !providers.includes(l.provider) || typeof l.providerUserId !== 'string' || !/^\d{1,30}$/.test(l.providerUserId) || typeof l.username !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(l.username) || !Number.isSafeInteger(l.verifiedAt) || l.verifiedAt < 0)
    throw Error('SOCIAL_RESPONSE_INVALID'); const expected = l.provider === 'github' ? 'https://github.com/' + l.username : l.provider === 'x' ? 'https://x.com/' + l.username : 'https://discord.com/users/' + l.providerUserId; if (l.url !== expected)
    throw Error('SOCIAL_RESPONSE_INVALID'); return l; }
export function readIdentity(value: unknown, id: string): Identity { const i = value as Identity; if (!i || i.userId !== id || !Number.isSafeInteger(i.revision) || i.revision < 0 || i.username !== undefined && !/^[a-z][a-z0-9_]{2,29}$/.test(i.username) || !i.links || Array.isArray(i.links) || Object.keys(i.links).some(k => !providers.includes(k as Provider)))
    throw Error('SOCIAL_RESPONSE_INVALID'); for (const [k, l] of Object.entries(i.links))
    if (readLink(l).provider !== k)
        throw Error('SOCIAL_RESPONSE_INVALID'); return i; }
export function authorizationUrl(value: unknown, p: Provider, state: string) { if (typeof value !== 'string')
    throw Error('SOCIAL_RESPONSE_INVALID'); const u = new URL(value), base = p === 'github' ? 'https://github.com/login/oauth/authorize' : p === 'x' ? 'https://x.com/i/oauth2/authorize' : 'https://discord.com/oauth2/authorize'; if (u.origin + u.pathname !== base || u.username || u.password || u.hash || u.searchParams.get('state') !== state || u.searchParams.get('redirect_uri') !== location.origin + '/seller/profile')
    throw Error('SOCIAL_RESPONSE_INVALID'); return u.href; }
