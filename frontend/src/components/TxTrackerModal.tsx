import React from "react";
import { useLanguage } from "../context/LanguageContext";
import { CheckCircle2, Clock, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

export type TxStep = "AUTH" | "APPROVE" | "BROADCAST" | "SYNCING" | "PENDING_CHECK" | "CONFIRMED" | "REVERTED" | "FAILED";

interface TxTrackerModalProps {
  isOpen: boolean;
  step: TxStep;
  txHash: string | null;
  errorMessage: string | null;
  onClose: () => void;
  onCheck?: () => void;
}

export const TxTrackerModal: React.FC<TxTrackerModalProps> = ({
  isOpen,
  step,
  txHash,
  errorMessage,
  onClose,
  onCheck,
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "480px", textAlign: "center" }}>
        <div style={{ margin: "1rem auto 1.5rem" }}>
          {step === "CONFIRMED" ? (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                boxShadow: "0 0 25px rgba(16, 185, 129, 0.3)",
              }}
            >
              <CheckCircle2 size={36} color="var(--success)" />
            </div>
          ) : step === "REVERTED" || step === "FAILED" ? (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(244, 63, 94, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
              }}
            >
              <AlertTriangle size={36} color="var(--danger)" />
            </div>
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(99, 102, 241, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
              }}
            >
              <Loader2 size={36} color="var(--primary-light)" className="animate-spin" />
            </div>
          )}
        </div>

        <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
          {step === "CONFIRMED"
            ? t("txConfirmed")
            : step === "REVERTED" || step === "FAILED"
            ? "Giao dịch thất bại"
            : step === "PENDING_CHECK" ? "Cần kiểm tra giao dịch cũ" : "Đang xử lý trên Arc Testnet..."}
        </h3>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
          {step === "AUTH" && "1/3. Đang ký chứng thực quyền mua EIP-712..."}
          {step === "APPROVE" && "2/3. Đang cấp quyền chi tiêu USDC cho Smart Contract..."}
          {step === "BROADCAST" && "3/3. Đang cam kết USDC & mở khóa tier trên Arc Testnet..."}
          {step === "SYNCING" && "Đang đồng bộ hóa dữ liệu Onchain vào hệ thống GroupDeal..."}
          {step === "PENDING_CHECK" && (errorMessage || "Chưa xác nhận được đơn hàng. Không mua lại khi trạng thái giao dịch cũ chưa rõ.")}
          {step === "CONFIRMED" &&
            "Bằng chứng onchain đã được xác nhận. Đơn hàng của bạn đã được ghi nhận an toàn."}
          {(step === "REVERTED" || step === "FAILED") &&
            (errorMessage || "Giao dịch bị hoàn tác do không thỏa điều kiện onchain.")}
        </p>

        {txHash && (
          <div
            style={{
              background: "rgba(0, 0, 0, 0.3)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 1rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Tx Hash:</span>
            <a
              href={`https://testnet.arcscan.app/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono"
              style={{
                color: "var(--cyan)",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              {txHash.substring(0, 10)}...{txHash.substring(txHash.length - 8)}
              <ExternalLink size={13} />
            </a>
          </div>
        )}

        {step === "PENDING_CHECK" && onCheck && <button type="button" className="btn btn-secondary" onClick={onCheck} style={{ width: "100%", marginBottom: "0.5rem" }}>
          Kiểm tra lại giao dịch / đơn cũ
        </button>}
        {(step === "CONFIRMED" || step === "REVERTED" || step === "FAILED" || step === "PENDING_CHECK") && (
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={onClose}>
            {step === "CONFIRMED" ? "Xem đơn hàng của tôi" : "Đóng"}
          </button>
        )}
      </div>
    </div>
  );
};
