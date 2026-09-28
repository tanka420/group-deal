import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useWeb3 } from "../context/Web3Context";
import { X, Mail, KeyRound, Wallet, Sparkles, CheckCircle2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { requestOtp, verifyOtp, user } = useAuth();
  const { connectInjectedWallet, switchToCircleWallet, walletMode } = useWeb3();
  const { t } = useLanguage();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"EMAIL" | "OTP">("EMAIL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestOtp(email);
      setStep("OTP");
      if (res.code) {
        setDevCode(res.code);
        setCode(res.code); // auto-fill in development for fast testing
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(email, code);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles size={20} color="var(--primary-light)" />
            <h3 style={{ fontSize: "1.25rem" }}>
              {user ? "Tài khoản của bạn" : "Đăng nhập GroupDeal"}
            </h3>
          </div>
          <button className="modal-close" onClick={onClose}>
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

        {!user ? (
          <div>
            {step === "EMAIL" ? (
              <form onSubmit={handleSendOtp}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
                  Đăng nhập bằng Email OTP. Hệ thống sẽ tự động tạo ví Circle User-Controlled EOA trên Arc Testnet để bạn sẵn sàng tham gia mua chung.
                </p>
                <div className="form-group">
                  <label className="form-label">Địa chỉ Email</label>
                  <div style={{ position: "relative" }}>
                    <Mail
                      size={18}
                      color="var(--text-muted)"
                      style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      type="email"
                      className="form-input"
                      placeholder="ban@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={{ paddingLeft: "2.75rem" }}
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
                  {loading ? "Đang gửi..." : "Gửi mã OTP qua Email"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1rem" }}>
                  Mã OTP 6 số đã được gửi tới <strong>{email}</strong>.
                </p>

                {devCode && (
                  <div
                    style={{
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8rem",
                      color: "#6ee7b7",
                      marginBottom: "1rem",
                    }}
                  >
                    Testnet Demo Code: <strong>{devCode}</strong>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Nhập mã xác thực (OTP)</label>
                  <div style={{ position: "relative" }}>
                    <KeyRound
                      size={18}
                      color="var(--text-muted)"
                      style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="123456"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      style={{ paddingLeft: "2.75rem", letterSpacing: "0.2em", fontSize: "1.1rem" }}
                    />
                  </div>
                </div>
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
                    {loading ? "Đang xác thực..." : "Xác nhận & Đăng nhập"}
                  </button>
                </div>
              </form>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                margin: "1.5rem 0 1rem",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
              }}
            >
              <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }}></div>
              <span>HOẶC</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }}></div>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={async () => {
                try {
                  await connectInjectedWallet();
                  onClose();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              <Wallet size={18} />
              Kết nối ví EVM ngoài (MetaMask / Browser)
            </button>
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
                <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{user.email}</span>
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
                onClick={() => {
                  switchToCircleWallet();
                  onClose();
                }}
              >
                Dùng ví Circle User-Controlled EOA
              </button>
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={async () => {
                  await connectInjectedWallet();
                  onClose();
                }}
              >
                Chuyển sang ví MetaMask
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
