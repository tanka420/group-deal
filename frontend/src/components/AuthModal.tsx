import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mail, CheckCircle2, Wallet, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useWeb3 } from "../context/Web3Context";
import { WalletManager } from "./WalletManager";
import { focusPageElement } from "../utils/focus";
import { authErrorMessage, authProgressText, requiresWalletReload } from "../services/authPresentation";
import { messageText, type UiMessage } from "../utils/uiMessage";

interface AuthModalProps { isOpen: boolean; onClose: () => void }
type Action = "SEND" | "VERIFY" | "WALLET" | null;

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { requestOtp, verifyOtp, user, token, circleReady, circleInitState, prepareCircle, circleProgress, circleCredentials } = useAuth();
  const { externalWalletConfigured, loginWithExternalWallet } = useWeb3();
  const { language } = useLanguage();
  const text = (vi: string, en: string) => language === "en" ? en : vi;
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<"REQUIRED" | "INVALID" | null>(null);
  const [step, setStep] = useState<"EMAIL" | "OTP">("EMAIL");
  const [action, setAction] = useState<Action>(null);
  const [error, setError] = useState<UiMessage | null>(null);
  const [walletReloadRequired, setWalletReloadRequired] = useState(false);
  const panel = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null), errorElement = useRef<HTMLParagraphElement>(null), emailInput = useRef<HTMLInputElement>(null);
  const epoch = useRef(0), actionRef = useRef<Action>(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  const emailReauthentication = Boolean(user?.loginMethod === "CIRCLE_EMAIL" && !circleCredentials);
  const providerHandoff = action === "VERIFY" || action === "WALLET";

  useEffect(()=>{if(isOpen&&(!user||emailReauthentication)&&prepareCircle)void prepareCircle().catch(()=>{});},[isOpen,user?.id,emailReauthentication,prepareCircle]);

  // A late request from a closed dialog or a different account cannot change this view.
  useLayoutEffect(() => {
    epoch.current++; actionRef.current = null;
    setAction(null); setError(null); setStep("EMAIL"); setEmail(""); setEmailError(null); setWalletReloadRequired(false);
    return () => { epoch.current++; actionRef.current = null; };
  }, [isOpen, user?.id]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.getElementById("root"), wasInert = app?.inert;
    const overflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    heading.current?.focus();
    // Provider approval portals stay usable outside the inert application root.
    const providerOpen = () => {
      if (actionRef.current === "VERIFY" || actionRef.current === "WALLET") return true;
      const frame = document.getElementById("sdkIframe");
      if (frame && frame.getBoundingClientRect().width > 0 && frame.getBoundingClientRect().height > 0 && getComputedStyle(frame).display !== "none") return true;
      const reown = document.querySelector("w3m-modal") as (HTMLElement & { open?: boolean }) | null;
      return Boolean(reown?.open || reown?.hasAttribute("open"));
    };
    let focusFrame = 0;
    const revealControl = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !panel.current?.contains(target) || providerOpen()) return;
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        if (document.activeElement === target && panel.current?.contains(target) && !providerOpen()) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      });
    };
    const keydown = (event: KeyboardEvent) => {
      if (providerOpen() || !panel.current?.contains(event.target as Node)) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])'))
        .filter(el => el.getClientRects().length > 0 && !el.closest("[hidden],[inert]"));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", revealControl);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", revealControl);
      cancelAnimationFrame(focusFrame);
      if (app) app.inert = Boolean(wasInert);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) focusPageElement(previous);
    };
  }, [isOpen]);

  useEffect(() => { if (isOpen && error) errorElement.current?.focus(); }, [isOpen, error]);
  useEffect(() => { if (isOpen && step === "OTP") document.getElementById("circle-otp-instructions")?.focus(); }, [isOpen, step]);

  const run = async (next: Exclude<Action, null>) => {
    if (actionRef.current || !isOpen) return;
    if (next === "SEND") {
      const invalid = !email.trim() ? "REQUIRED" : !emailInput.current?.validity.valid ? "INVALID" : null;
      setEmailError(invalid);
      if (invalid) { setError(null); emailInput.current?.focus(); return; }
    }
    const current = epoch.current;
    actionRef.current = next; setAction(next); setError(null);
    const valid = () => epoch.current === current;
    try {
      if (next === "SEND") { await requestOtp(email.trim()); if (valid()) setStep("OTP"); }
      else { if (next === "VERIFY") await verifyOtp(email.trim()); else await loginWithExternalWallet(); if (valid()) closeRef.current(); }
    } catch (failure) { if (valid()) { setError(authErrorMessage(failure, next)); if(next === "WALLET" && requiresWalletReload(failure)) setWalletReloadRequired(true); } }
    finally { if (valid()) { actionRef.current = null; setAction(null); } }
  };
  if (!isOpen) return null;
  return createPortal(
    <div className="modal-overlay auth-overlay" onClick={event => { if (event.target === event.currentTarget && !actionRef.current) onClose(); }}>
      <div className="modal-content auth-dialog" ref={panel} role="dialog" aria-modal={!providerHandoff} aria-labelledby="auth-title" aria-describedby={!user || emailReauthentication ? "auth-security" : undefined}>
        <div className="modal-header">
          <div className="auth-title"><h2 id="auth-title" ref={heading} tabIndex={-1}>{user ? text("Tài khoản của bạn", "Your account") : text("Chọn phương thức đăng nhập", "Choose a sign-in method")}</h2></div>
          <button type="button" className="modal-close" onClick={onClose} disabled={providerHandoff} aria-label={text("Đóng đăng nhập", "Close sign-in")}><X size={18} aria-hidden="true"/></button>
        </div>
        {error && <p ref={errorElement} tabIndex={-1} role="alert" className="notice notice-error">{messageText(error, language)}</p>}
        {user && <section className="auth-method" aria-label={text("Thông tin tài khoản", "Account information")}>
          <h3><CheckCircle2 size={18} aria-hidden="true"/><span className="address-value">{user.email || text("Tài khoản ví", "Wallet account")}</span></h3>
          <dl className="detail-list"><dt>{text("Ví hoạt động", "Active wallet")}</dt><dd className="address-value font-mono">{user.activeWallet || text("Chưa chọn ví", "No wallet selected")}</dd><dt>{text("Vai trò", "Roles")}</dt><dd>{user.roles.map(role => ({buyer: text("Người mua", "Buyer"), seller: text("Người bán", "Seller"), operator: text("Vận hành", "Operator")}[role] || role)).join(", ")}</dd></dl>
        </section>}
        {!user || emailReauthentication ? <div>
          {emailReauthentication && <p className="notice">{text("Đăng nhập lại để tiếp tục với ví email.", "Sign in again to continue with your email wallet.")}</p>}
          {step === "EMAIL" ? <>
            <section className="auth-method" aria-labelledby="auth-wallet-title">
              <h3 id="auth-wallet-title"><Wallet size={20} aria-hidden="true"/>{text("Đăng nhập bằng ví", "Sign in with a wallet")}</h3>
              <button type="button" className="btn btn-primary" onClick={() => void run("WALLET")} disabled={!!action || !externalWalletConfigured || walletReloadRequired}>{action === "WALLET" ? text("Đang chờ ví và chữ ký…", "Waiting for wallet approval…") : text("Kết nối ví", "Connect wallet")}</button>
              {!externalWalletConfigured && <p className="muted" role="status">{text("Kết nối ví tạm chưa sẵn sàng.", "Wallet connection is temporarily unavailable.")}</p>}
              {walletReloadRequired && <button type="button" className="btn btn-secondary" disabled={!!action} onClick={() => window.location.reload()}>{text("Tải lại trang để kết nối ví", "Reload page to connect wallet")}</button>}
            </section>
            <p className="auth-divider">{text("hoặc", "or")}</p>
            <form noValidate onSubmit={event => { event.preventDefault(); void run("SEND"); }} className="auth-method" aria-labelledby="auth-email-title">
              <h3 id="auth-email-title"><Mail size={20} aria-hidden="true"/>{text("Đăng nhập bằng email", "Sign in with email")}</h3>
              <div className="form-group"><label className="form-label" htmlFor="circle-login-email">{text("Địa chỉ email", "Email address")}</label><input ref={emailInput} id="circle-login-email" type="email" className="form-input" value={email} onChange={event => { setEmail(event.target.value); setEmailError(null); }} required autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} disabled={!!action} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "circle-email-error" : undefined}/>{emailError&&<p id="circle-email-error" className="field-error" role="alert">{emailError==="REQUIRED"?text("Nhập địa chỉ email.","Enter your email address."):text("Nhập địa chỉ email hợp lệ.","Enter a valid email address.")}</p>}</div>
              {circleInitState==='INITIALIZING'&&<p role="status">{text('Đang kết nối…','Connecting…')}</p>}
              {circleInitState==='UNAVAILABLE'&&prepareCircle&&<button type="button" className="btn btn-secondary" disabled={!!action} onClick={()=>{document.getElementById("circle-login-email")?.focus();void prepareCircle().catch(()=>{});}}>{text('Thử lại kết nối','Retry connection')}</button>}
              <button type="submit" className="btn btn-secondary" disabled={!!action || !circleReady}>{action === "SEND" ? text("Đang gửi OTP…", "Sending OTP…") : text("Gửi mã OTP", "Send OTP")}</button>
            </form>
          </> : <form onSubmit={event => { event.preventDefault(); void run("VERIFY"); }} className="auth-method">
            <p id="circle-otp-instructions" tabIndex={-1}>{text("Mã OTP đã được gửi tới", "An OTP has been sent to")} <strong className="address-value">{email.trim()}</strong>. {text("Nhập mã trong cửa sổ Circle.", "Enter the code in Circle’s window.")}</p>
            <div className="auth-actions"><button type="button" className="btn btn-secondary" disabled={!!action || !circleReady} onClick={() => void run("SEND")}>{text("Gửi lại mã", "Resend code")}</button><button type="button" className="btn btn-secondary" disabled={!!action} onClick={() => { setStep("EMAIL"); setError(null); }}>{text("Đổi email", "Change email")}</button><button type="submit" className="btn btn-primary" disabled={!!action}>{action === "VERIFY" ? text("Đang xác thực…", "Authenticating…") : text("Nhập mã OTP", "Enter OTP")}</button></div>
          </form>}
          {action && <p role="status" className="auth-progress">{action === "SEND" ? text("Đang yêu cầu mã đăng nhập qua email…", "Requesting an email sign-in code…") : action === "WALLET" ? text("Hoàn tất lựa chọn ví và chữ ký trong cửa sổ ví. Bạn có thể từ chối tại đó.", "Complete the wallet selection and signature in your wallet window. You can decline there.") : authProgressText(circleProgress, language)}</p>}
          <p id="auth-security" className="auth-security muted"><ShieldCheck size={16} aria-hidden="true"/>{text("Bạn tự phê duyệt OTP hoặc chữ ký. Không nhập seed phrase hay private key vào GroupDeal.", "You approve the OTP or signature yourself. Do not enter a seed phrase or private key into GroupDeal.")}</p>
        </div> : <div>
          {token && <WalletManager token={token} userId={user.id} embedded/>}
        </div>}
      </div>
    </div>, document.body,
  );
};
