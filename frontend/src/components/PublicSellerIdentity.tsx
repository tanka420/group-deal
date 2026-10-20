import '../styles/seller-identity.css';
import { useEffect, useState } from 'react';
import { Github, Link as LinkIcon, MessageCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { providerName, readLink, type IdentityLink } from '../services/sellerIdentity';
export function PublicSellerIdentity({ sellerId }: {
    sellerId: string;
}) { const { language } = useLanguage(), [view, setView] = useState<{
    username: string | null;
    links: IdentityLink[];
} | null>(null), [error, setError] = useState(false); useEffect(() => { setView(null); setError(false); const c = new AbortController(); void fetch('/api/seller/identity/public/' + encodeURIComponent(sellerId), { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.any([c.signal, AbortSignal.timeout(12000)]) }).then(async (r) => { if (!r.ok)
    throw Error(); const v = await r.json(); if (v.sellerId !== sellerId || v.username !== null && (typeof v.username !== 'string' || !/^[a-z][a-z0-9_]{2,29}$/.test(v.username)) || !Array.isArray(v.links) || v.links.length > 3)
    throw Error(); const links = v.links.map(readLink); if (new Set(links.map((l: IdentityLink) => l.provider)).size !== links.length)
    throw Error(); if (!c.signal.aborted)
    setView({ username: v.username, links }); }).catch(() => { if (!c.signal.aborted)
    setError(true); }); return () => c.abort(); }, [sellerId]); if (error)
    return <p className="muted">{language === 'en' ? 'Verified social links are unavailable.' : 'Chưa tải được liên kết xã hội đã xác thực.'}</p>; if (!view)
    return null; return <div className="seller-public-identity">{view.username && <p className="font-mono">@{view.username}</p>}{view.links.length > 0 && <><ul className="seller-social-public">{view.links.map(l => { const Icon = l.provider === 'github' ? Github : l.provider === 'discord' ? MessageCircle : LinkIcon; return <li key={l.provider}><a href={l.url} rel="noopener noreferrer" target="_blank" className="ui-row" aria-label={providerName(l.provider) + ' · ' + l.username}><Icon size={17} aria-hidden="true"/>{l.username}</a></li>; })}</ul><small className="muted">{language === 'en' ? 'Account links verified at the recorded time; not a reputation endorsement.' : 'Liên kết tài khoản đã xác thực tại thời điểm ghi nhận; không phải chứng nhận uy tín.'}</small></>}</div>; }
