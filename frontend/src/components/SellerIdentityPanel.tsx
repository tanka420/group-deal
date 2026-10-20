import '../styles/seller-identity.css';
import { useEffect, useId, useRef, useState } from 'react';
import { Github, Link as LinkIcon, MessageCircle, Unlink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { authorizationUrl, providerName, providers, readIdentity, type Provider, type Identity } from '../services/sellerIdentity';
export function SellerIdentityPanel() {
    const { user, token, getSessionEpoch } = useAuth(), { language } = useLanguage(), text = (vi: string, en: string) => language === 'en' ? en : vi, id = user?.id ?? '', seller = Boolean(user?.roles.includes('seller')), field = useId(), key = 'groupdeal_social_' + id, epoch = useRef(0), lock = useRef(false), callbackHandled = useRef(false), loadRequest = useRef(0);
    const [identity, setIdentity] = useState<Identity | null>(null), [configured, setConfigured] = useState<Provider[]>([]), [username, setUsername] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false), [unlinking, setUnlinking] = useState<Provider | null>(null);
    useEffect(() => { const g = ++epoch.current; lock.current = false; setBusy(false); setIdentity(null); setConfigured([]); setMessage(''); setUnlinking(null); const controller = new AbortController(); void load(g, controller.signal); return () => { epoch.current++; controller.abort(); }; }, [id, token]);
    async function call(path: string, body?: unknown, signal?: AbortSignal) {
        const response = await fetch('/api/seller/identity' + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }), value = await response.json();
        if (!response.ok)
            throw Error(typeof value.error === 'string' ? value.error : 'SELLER_IDENTITY_UNAVAILABLE');
        return value;
    }
    function accept(v: any) {
        const next = readIdentity(v.identity, id);
        if (v.providers) {
            if (!Array.isArray(v.providers) || v.providers.length !== 3 || v.providers.some((r: any) => !providers.includes(r.provider) || typeof r.configured !== 'boolean') || new Set(v.providers.map((r: any) => r.provider)).size !== 3)
                throw Error('SOCIAL_RESPONSE_INVALID');
            setConfigured(v.providers.filter((r: any) => r.configured).map((r: any) => r.provider));
        }
        setIdentity(next);
        setUsername(next.username ?? '');
    }
    async function load(g = epoch.current, signal?: AbortSignal) {
        if (!id || !token)
            return;
        const request = ++loadRequest.current;
        try {
            const v = await call('', undefined, signal);
            if (g !== epoch.current || request !== loadRequest.current)
                return;
            accept(v);
            if (!callbackHandled.current) {
                const q = new URLSearchParams(location.search), state = q.get('state'), code = q.get('code'), denied = q.has('error');
                if (state && (code || denied)) {
                    callbackHandled.current = true;
                    history.replaceState(history.state, '', '/seller/profile');
                    let saved: any;
                    try {
                        saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
                    }
                    catch { }
                    if (!saved || saved.userId !== id || saved.state !== state || !providers.includes(saved.provider) || saved.expiresAt < Date.now()) {
                        sessionStorage.removeItem(key);
                        throw Error('SOCIAL_CALLBACK_CONTEXT_CHANGED');
                    }
                    await run(async () => {
                        const result = await call('/social/' + saved.provider + '/complete', { state, ...(denied ? { denied: true } : { code }) });
                        if (g !== epoch.current)
                            return;
                        sessionStorage.removeItem(key);
                        if (result.identity)
                            accept(result);
                        setMessage(result.cancelled ? text('Đã hủy liên kết.', 'Linking cancelled.') : text('Đã xác thực liên kết tài khoản.', 'Account link verified.'));
                    });
                }
            }
        }
        catch (e) {
            if (g === epoch.current && !signal?.aborted) {
                setFailed(true);
                setMessage(errorText(e));
            }
        }
    }
    function errorText(e: unknown) {
        const code = e instanceof Error ? e.message : '';
        const messages: Record<string, [
            string,
            string
        ]> = { SELLER_USERNAME_UNAVAILABLE: ['Username đã được sử dụng. Chọn tên khác.', 'Username is taken. Choose another.'], SELLER_USERNAME_ALREADY_SET: ['Username đã được chốt. Tải lại hồ sơ.', 'Username has already been set. Reload the profile.'], SOCIAL_ALREADY_LINKED: ['Tài khoản này đang liên kết nơi khác. Ngắt tại tài khoản cũ rồi xác thực lại.', 'This account is linked elsewhere. Unlink it there and authorize again.'], SOCIAL_PROVIDER_NOT_CONFIGURED: ['Dịch vụ chưa được cấu hình. Liên hệ quản trị viên.', 'This provider has not been configured. Contact the administrator.'], SOCIAL_CALLBACK_EXPIRED: ['Liên kết hết hạn. Bắt đầu xác thực mới.', 'Linking expired. Start a new authorization.'], SOCIAL_UNLINK_FIRST: ['Ngắt tài khoản hiện tại trước khi liên kết tài khoản khác cùng dịch vụ.', 'Unlink the current account before linking another account on this provider.'], SOCIAL_CALLBACK_CONTEXT_CHANGED: ['Phiên hoặc yêu cầu liên kết đã đổi. Không xác thực callback này; bắt đầu lại.', 'The session or linking request changed. This callback was not accepted; start again.'], SOCIAL_RATE_LIMIT: ['Đã đạt giới hạn xác thực. Thử lại sau 10 phút.', 'Authorization limit reached. Try again after 10 minutes.'] };
        return messages[code]?.[language === 'en' ? 1 : 0] ?? text('Chưa xác nhận được thay đổi. Tải lại hồ sơ trước khi thử tiếp.', 'The change could not be confirmed. Reload the profile before continuing.');
    }
    async function run(work: () => Promise<void>) {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setFailed(false);
        setMessage('');
        const g = epoch.current, session = getSessionEpoch();
        try {
            await work();
            if (g !== epoch.current || session !== getSessionEpoch())
                return;
        }
        catch (e) {
            if (g === epoch.current) {
                setFailed(true);
                setMessage(errorText(e));
            }
        }
        finally {
            if (g === epoch.current) {
                lock.current = false;
                setBusy(false);
            }
        }
    }
    async function save() {
        if (!identity)
            return;
        await run(async () => {
            const g = epoch.current, v = await call('/username', { username, expectedRevision: identity.revision });
            if (g !== epoch.current)
                return;
            accept(v);
            setMessage(text('Đã lưu username.', 'Username saved.'));
        });
    }
    async function start(p: Provider) {
        await run(async () => {
            const g = epoch.current, v = await call('/social/' + p + '/start', {});
            if (g !== epoch.current)
                return;
            if (typeof v.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(v.state) || v.provider !== p || !Number.isSafeInteger(v.expiresAt) || v.expiresAt < Date.now())
                throw Error('SOCIAL_RESPONSE_INVALID');
            const url = authorizationUrl(v.authorizationUrl, p, v.state);
            sessionStorage.setItem(key, JSON.stringify({ userId: id, provider: p, state: v.state, expiresAt: v.expiresAt }));
            location.assign(url);
        });
    }
    async function unlink() {
        if (!unlinking || !identity)
            return;
        const p = unlinking;
        await run(async () => {
            const g = epoch.current, v = await call('/social/' + p + '/unlink', { expectedRevision: identity.revision });
            if (g !== epoch.current)
                return;
            accept(v);
            setUnlinking(null);
            sessionStorage.removeItem(key);
            setMessage(text('Đã ngắt liên kết tại GroupDeal.', 'Link removed from GroupDeal.'));
        });
    }
    return <section className="session-review seller-identity-panel" aria-labelledby={field + '-title'}><h2 id={field + '-title'}>{seller ? text('Username & liên kết xã hội', 'Username & social links') : text('Username GroupDeal', 'GroupDeal username')}</h2><p className="muted">{seller ? text('Seller cần username trước khi xuất bản deal mới. Mỗi tài khoản xã hội chỉ liên kết với một tài khoản GroupDeal.', 'Sellers need a username before publishing a new deal. Each social account can be linked to one GroupDeal account.') : text('Username của buyer là tùy chọn. Khi trở thành seller, bạn cần username trước khi đăng bán mới.', 'A buyer username is optional. If you become a seller, choose one before publishing a new deal.')}</p>{identity ? <><form onSubmit={e => { e.preventDefault(); void save(); }} className="seller-identity-form"><label htmlFor={field}>{text('Username GroupDeal', 'GroupDeal username')}</label><input id={field} className="form-input" value={username} onChange={e => setUsername(e.target.value)} pattern="[a-z][a-z0-9_]{2,29}" minLength={3} maxLength={30} required readOnly={Boolean(identity.username)} disabled={busy} autoComplete="username" aria-describedby={field + '-help'}/><p id={field + '-help'} className="muted">{text('3–30 ký tự: chữ thường, số, dấu _. Bắt đầu bằng chữ. Chọn một lần để giữ định danh ổn định.', '3–30 characters: lowercase letters, numbers and _. Start with a letter. Choose once to keep your identity stable.')}</p>{!identity.username && <button className="btn btn-primary" disabled={busy}>{text('Lưu username', 'Save username')}</button>}</form>{seller && <><ul className="seller-social-list">{providers.map(p => { const link = identity.links[p], Icon = p === 'github' ? Github : p === 'discord' ? MessageCircle : LinkIcon; return <li key={p}><div className="ui-row"><Icon size={18} aria-hidden="true"/><strong>{providerName(p)}</strong>{link ? <a href={link.url} rel="noopener noreferrer" target="_blank">{link.username}</a> : <span className="muted">{configured.includes(p) ? text('Chưa liên kết', 'Not linked') : text('Chưa cấu hình dịch vụ', 'Provider not configured')}</span>}</div>{link ? <><small>{text('Đã xác thực lúc', 'Verified at')} {new Date(link.verifiedAt).toLocaleString(language === 'en' ? 'en-GB' : 'vi-VN')}</small><button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => setUnlinking(p)}><Unlink size={15} aria-hidden="true"/>{text('Ngắt liên kết', 'Unlink')}</button></> : <button type="button" className="btn btn-sm btn-secondary" disabled={busy || !configured.includes(p)} onClick={() => void start(p)}>{text('Xác thực liên kết', 'Verify link')}</button>}</li>; })}</ul>{unlinking && <div className="notice" role="group" aria-label={text('Xác nhận ngắt liên kết', 'Confirm unlink')}><p>{text('Ngắt liên kết', 'Unlink')} {providerName(unlinking)}? {text('Hồ sơ công khai sẽ bỏ liên kết này. Muốn chuyển sang GroupDeal khác cần xác thực lại.', 'This link will be removed from your public profile. Moving it to another GroupDeal account requires authorization again.')}</p><div className="action-row"><button type="button" className="btn btn-danger" disabled={busy} onClick={() => void unlink()}>{text('Xác nhận ngắt', 'Confirm unlink')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setUnlinking(null)}>{text('Giữ liên kết', 'Keep linked')}</button></div></div>}</>}</> : <p role="status">{text('Đang tải định danh…', 'Loading identity…')}</p>}{message && <p role={failed ? 'alert' : 'status'} className={failed ? 'notice notice-error' : 'notice'}>{message}</p>}<button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => void load()}>{text('Tải lại định danh', 'Reload identity')}</button>{seller && <p className="muted">{text('Xác thực chỉ chứng minh liên kết tại thời điểm ghi nhận, không chứng nhận uy tín hoặc quyền phân phối.', 'Verification proves the account link at the recorded time; it does not certify reputation or distribution rights.')}</p>}</section>;
}
