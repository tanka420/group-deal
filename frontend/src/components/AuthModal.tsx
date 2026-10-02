import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useWeb3 } from "../context/Web3Context";
import { X, Mail, Sparkles, CheckCircle2, Wallet, ShieldCheck } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    requestOtp,
    verifyOtp,
    user,
    circleReady,
    circleProgress,
    circleCredentials,
  } = useAuth();
  const {
    connectExternalWallet,
    externalWalletConfigured,
    loginWithExternalWallet,
    switchToCircleWallet,
  } = useWeb3();
  const { t } = useLanguage();

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"EMAIL" | "OTP">("EMAIL");
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailReauthentication = Boolean(user?.loginMethod === "CIRCLE_EMAIL" && !circleCredentials);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestOtp(email);
      setStep("OTP");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(email);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWalletLogin = async () => {
    setWalletLoading(true);
    setError(null);
    try {
      await loginWithExternalWallet();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWalletLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles size={20} color="var(--primary-light)" />
            <h3 style={{ fontSize: "1.25rem" }}>
              {user ? "Tài khoản của bạn" : "Đăng nhập GroupDeal"}
            </h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Đóng đăng nhập">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(244, 63, 94, 0.15)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              borderRadius: "var(--radius-md)",
              color: "#fda4af",
              fontSize: "0.85rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        {!user || emailReauthentication ? (
          <div>
            {step === "EMAIL" ? (
              <div>
                <div
                  style={{
                    padding: "1rem",
                    border: "1px solid rgba(34, 211, 238, 0.3)",
                    borderRadius: "var(--radius-lg)",
                    background: "rgba(34, 211, 238, 0.06)",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", marginBottom: "0.55rem" }}>
                    <Wallet size={20} color="var(--cyan)" />
                    <strong>Đăng nhập bằng ví EVM</strong>
                  </div>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.5, marginBottom: "0.8rem" }}>
                    Dùng MetaMask, Rabby, Trust Wallet hoặc ví tương thích Reown. Bạn chỉ ký thông điệp đăng nhập một lần; không có giao dịch và không tốn USDC.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={() => void handleWalletLogin()}
                    disabled={walletLoading || !externalWalletConfigured}
                  >
                    {walletLoading
                      ? "Đang chờ ví và chữ ký..."
                      : externalWalletConfigured
                        ? "Kết nối và đăng nhập bằng ví"
                        : "Reown AppKit chưa được cấu hình"}
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                  <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>HOẶC</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                </div>

                <form onSubmit={handleSendOtp}>
                  <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", marginBottom: "0.55rem" }}>
                    <Mail size={20} color="var(--primary-light)" />
                    <strong>Đăng nhập Gmail và tạo ví Circle</strong>
                  </div>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.5, marginBottom: "1rem" }}>
                    Circle gửi OTP và tạo ví EOA user-controlled trên Arc Testnet. GroupDeal chỉ lưu địa chỉ công khai và mã định danh ví, không giữ private key.
                  </p>
                  <div className="form-group">
                    <label className="form-label" htmlFor="circle-login-email">Địa chỉ Email</label>
                    <div style={{ position: "relative" }}>
                      <Mail
                        size={18}
                        color="var(--text-muted)"
                        style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)" }}
                      />
                      <input
                        id="circle-login-email"
                        type="email"
                        className="form-input"
                        placeholder="ban@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        style={{ paddingLeft: "2.75rem" }}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-secondary" style={{ width: "100%" }} disabled={loading || !circleReady}>
                    {loading
                      ? "Đang gửi OTP..."
                      : circleReady
                        ? "Gửi mã OTP qua Circle"
                        : "Circle Wallet chưa được cấu hình"}
                  </button>
                </form>
              </div>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1rem" }}>
                  OTP đã được Circle gửi tới <strong>{email}</strong>. Nhấn nút bên dưới để mở cửa sổ xác thực bảo mật của Circle; mã OTP không đi qua GroupDeal.
                </p>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setStep("EMAIL")}
                  >
                    Quay lại
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    disabled={loading}
                  >
                    {loading ? circleProgress || "Đang xác thực và tạo ví..." : "Mở xác thực Circle"}
                  </button>
                </div>
                {loading && (
                  <div style={{ marginTop: "0.8rem", color: "var(--cyan)", fontSize: "0.78rem", lineHeight: 1.45 }}>
                    {circleProgress || "Đang xử lý..."}
                  </div>
                )}
              </form>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem", marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.45 }}>
              <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              Cả hai lựa chọn đều yêu cầu người dùng tự phê duyệt. GroupDeal không nhận seed phrase hoặc private key.
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-lg)",
                padding: "1.25rem",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <CheckCircle2 size={18} color="var(--success)" />
                <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                  {user.email || (user.activeWallet ? `${user.activeWallet.slice(0, 8)}...${user.activeWallet.slice(-4)}` : "Tài khoản ví")}
                </span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                Ví hoạt động:{" "}
                <span className="font-mono" style={{ color: "var(--cyan)" }}>
                  {user.activeWallet}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Vai trò: {user.roles.join(", ")}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                disabled={!user.circleWallet}
                onClick={() => {
                  switchToCircleWallet();
                  onClose();
                }}
              >
                {circleCredentials ? "Dùng ví Circle User-Controlled EOA" : "Xác thực lại Circle để ký giao dịch"}
              </button>
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={async () => {
                  await connectExternalWallet();
                  onClose();
                }}
              >
                Kết nối ví EVM ngoài qua Reown AppKit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
