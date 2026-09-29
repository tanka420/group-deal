import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { Store, ShieldCheck, X, Sparkles, CheckCircle2 } from "lucide-react";
import { ethers } from "ethers";

interface SellerRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SellerRegisterModal: React.FC<SellerRegisterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, setupSellerProfile } = useAuth();
  const { account } = useWeb3();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [payoutWallet, setPayoutWallet] = useState(account || user?.activeWallet || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !payoutWallet) {
      setError("Vui lòng nhập tên người bán và địa chỉ ví nhận tiền payout.");
      return;
    }

    if (!ethers.isAddress(payoutWallet)) {
      setError("Địa chỉ ví payout không hợp lệ!");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let signer: ethers.Signer | undefined;
      const normalizedPayout = ethers.getAddress(payoutWallet);
      const isCircleWallet = user?.circleWallet?.address?.toLowerCase() === normalizedPayout.toLowerCase();

      if (!isCircleWallet) {
        if (window.ethereum) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          signer = await provider.getSigner();
        } else {
          throw new Error("Vui lòng kết nối MetaMask để chứng thực quyền kiểm soát ví nhận tiền ngoài.");
        }
      }

      await setupSellerProfile({
        displayName,
        bio,
        payoutWallet: normalizedPayout,
        signer,
      });

      alert("🎉 Đăng ký Kênh Người Bán thành công! Bạn đã có thể tạo chiến dịch và giao sản phẩm số.");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Lỗi đăng ký người bán");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Store size={22} color="var(--primary-light)" />
            <h3 style={{ fontSize: "1.2rem" }}>Đăng ký mở Kênh Người Bán</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
          Để đảm bảo an toàn tài chính, người bán phải chứng minh quyền kiểm soát địa chỉ ví nhận tiền (Payout Wallet) bằng chữ ký mật mã trước khi được phép mở chiến dịch.
        </p>

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

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Tên thương hiệu / Tên người bán</label>
            <input
              type="text"
              className="form-input"
              placeholder="VD: Vietnam AI Academy, DevTools Studio..."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Giới thiệu ngắn gọn (Bio)</label>
            <textarea
              className="form-textarea"
              placeholder="Mô tả lĩnh vực kinh doanh sản phẩm số, uy tín, chính sách hỗ trợ..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{ minHeight: "80px" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Địa chỉ ví nhận doanh thu (Payout Wallet)</label>
            <input
              type="text"
              className="form-input font-mono"
              placeholder="0x..."
              value={payoutWallet}
              onChange={(e) => setPayoutWallet(e.target.value)}
              required
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Khoản thanh toán khi chiến dịch hoàn tất sẽ chỉ có thể rút về địa chỉ ví này.
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.82rem",
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
            }}
          >
            <ShieldCheck size={18} color="var(--primary-light)" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <div>
              Hệ thống sẽ yêu cầu ví ký một thông điệp xác thực chứng minh bạn sở hữu private key của ví nhận tiền. Thao tác ký này <strong>hoàn toàn miễn phí, không tốn gas</strong>.
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={isLoading}>
              {isLoading ? "Đang ký chứng thực..." : "Ký chứng thực & Mở Kênh"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
