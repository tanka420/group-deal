import React, { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { X, ShieldCheck, AlertCircle, Sparkles, Fuel } from "lucide-react";

interface PreTxModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: any;
  onConfirm: (params: { quantity: number; requireEarlySlot: boolean }) => void;
  isLoading: boolean;
}

export const PreTxModal: React.FC<PreTxModalProps> = ({
  isOpen,
  onClose,
  campaign,
  onConfirm,
  isLoading,
}) => {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [requireEarlySlot, setRequireEarlySlot] = useState(false);
  const [agreed, setAgreed] = useState(false);

  if (!isOpen || !campaign) return null;

  const currentTier = campaign.tiers[campaign.currentUnlockedTier];
  const unitPriceUSDC = Number(currentTier.price) / 1e6;
  const totalGrossUSDC = (unitPriceUSDC * quantity).toFixed(2);
  const estimatedGasUSDC = "0.005"; // Arc Testnet native USDC gas fee

  const earlyRebateUSDC =
    campaign.earlyRebateEnabled && campaign.earlyRebateAmount
      ? (Number(campaign.earlyRebateAmount) / 1e6).toFixed(2)
      : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldCheck size={22} color="var(--primary-light)" />
            <h3 style={{ fontSize: "1.2rem" }}>{t("confirmOrderTitle")}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <h4 style={{ fontSize: "1.05rem", marginBottom: "0.25rem" }}>{campaign.title}</h4>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Danh mục: {campaign.category} | SLA giao hàng: {campaign.deliverySlaSeconds / 3600}h
          </span>
        </div>

        {/* Quantity selector */}
        <div className="form-group">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label className="form-label">{t("quantity")}</label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Tối đa {campaign.maxPerAccount} đơn vị/tài khoản
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1 || isLoading}
              style={{ width: "36px", height: "36px" }}
            >
              -
            </button>
            <input
              type="number"
              className="form-input"
              value={quantity}
              readOnly
              style={{ textAlign: "center", fontWeight: 700, width: "80px" }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setQuantity((q) => Math.min(campaign.maxPerAccount, q + 1))}
              disabled={quantity >= campaign.maxPerAccount || isLoading}
              style={{ width: "36px", height: "36px" }}
            >
              +
            </button>
          </div>
        </div>

        {/* Financial Breakdown Table */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-lg)",
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
              {t("unitPriceLocked")}:
            </span>
            <span className="font-mono" style={{ fontWeight: 600 }}>
              ${unitPriceUSDC.toFixed(2)} USDC
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
              {t("quantity")}:
            </span>
            <span className="font-mono">{quantity}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Fuel size={14} color="var(--warning)" />
              {t("estimatedGas")}:
            </span>
            <span className="font-mono" style={{ color: "var(--warning)" }}>
              ~{estimatedGasUSDC} USDC
            </span>
          </div>

          <div
            style={{
              height: "1px",
              background: "var(--border-subtle)",
              margin: "0.75rem 0",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{t("totalCommitment")}:</span>
            <span
              className="font-mono"
              style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--cyan)" }}
            >
              ${totalGrossUSDC} USDC
            </span>
          </div>
        </div>

        {/* Early supporter optional slot */}
        {campaign.earlyRebateEnabled && (
          <div
            style={{
              background: "rgba(236, 72, 153, 0.08)",
              border: "1px solid rgba(236, 72, 153, 0.3)",
              borderRadius: "var(--radius-md)",
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <Sparkles size={16} color="#f472b6" />
              <strong style={{ fontSize: "0.88rem", color: "#f472b6" }}>
                Ưu đãi Early Supporter khả dụng (Giảm ${earlyRebateUSDC} cho unit đầu)
              </strong>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                cursor: "pointer",
                marginTop: "0.5rem",
              }}
            >
              <input
                type="checkbox"
                checked={requireEarlySlot}
                onChange={(e) => setRequireEarlySlot(e.target.checked)}
              />
              {t("requireEarlySlot")}
            </label>
          </div>
        )}

        {/* Terms Agreement Checkbox */}
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.65rem",
            fontSize: "0.82rem",
            color: "var(--text-muted)",
            cursor: "pointer",
            marginBottom: "1.5rem",
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>{t("termsAgreement")}</span>
        </label>

        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          disabled={!agreed || isLoading}
          onClick={() => onConfirm({ quantity, requireEarlySlot })}
        >
          {isLoading ? "Đang xử lý trên Arc..." : t("approveAndCommit")}
        </button>
      </div>
    </div>
  );
};
