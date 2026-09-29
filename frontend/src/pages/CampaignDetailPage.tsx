import React, { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { PreTxModal } from "../components/PreTxModal";
import { TxTrackerModal, TxStep } from "../components/TxTrackerModal";
import { ShareModal } from "../components/ShareModal";
import {
  Clock,
  Users,
  ShieldCheck,
  CheckCircle2,
  Share2,
  AlertCircle,
  Sparkles,
  Lock,
  ArrowLeft,
  KeyRound,
  FileCheck,
  Check,
} from "lucide-react";

interface CampaignDetailPageProps {
  campaignId: string;
  onBack: () => void;
  onGoToOrders: () => void;
}

export const CampaignDetailPage: React.FC<CampaignDetailPageProps> = ({
  campaignId,
  onBack,
  onGoToOrders,
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { account, commitToBuyOnchain } = useWeb3();

  const [campaign, setCampaign] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isPreTxOpen, setIsPreTxOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Tx tracking state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>("AUTH");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  const fetchCampaign = () => {
    fetch(`/api/campaigns/${campaignId}`)
      .then((r) => r.json())
      .then((data) => {
        setCampaign(data.campaign);
        setSeller(data.seller);
      })
      .catch((e) => console.warn("Error fetching campaign", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCampaign();
  }, [campaignId]);

  if (loading || !campaign) {
    return (
      <div style={{ textAlign: "center", padding: "5rem 1rem", color: "var(--text-muted)" }}>
        Đang tải thông tin chiến dịch từ Arc Testnet...
      </div>
    );
  }

  const currentTier = campaign.tiers[campaign.currentUnlockedTier] || campaign.tiers[0];
  const currentPrice = Number(currentTier.price) / 1e6;
  const lowestPrice = Number(campaign.tiers[campaign.tiers.length - 1].price) / 1e6;
  const currentMetric = campaign.metric === "BUYER_COUNT" ? campaign.totalBuyerCount : campaign.totalUnitsCommitted;

  const handleConfirmPurchase = async (params: { quantity: number; requireEarlySlot: boolean }) => {
    if (!account) {
      alert("Vui lòng kết nối ví hoặc đăng nhập trước khi mua!");
      return;
    }

    setIsPreTxOpen(false);
    setIsTxModalOpen(true);
    setTxStep("AUTH");
    setTxError(null);
    setTxHash(null);
    setIsCommitting(true);

    try {
      // 1. Request EIP-712 buy authorization from backend
      const authRes = await fetch("/api/orders/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}`,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          quantity: params.quantity,
          walletAddress: account,
        }),
      });

      const authData = await authRes.json();
      if (!authRes.ok) {
        throw new Error(authData.error || "Failed to obtain buy authorization");
      }

      // 2. Approve USDC & commit to buy on Arc Testnet Smart Contract
      setTxStep("APPROVE");
      setTxStep("BROADCAST");

      const result = await commitToBuyOnchain({
        campaignId: campaign.onchainCampaignId,
        campaignIdentity: authData.campaignIdentity,
        quantity: params.quantity,
        requireEarlySlot: params.requireEarlySlot,
        maxAuthQuantity: authData.maxQuantity,
        authDeadline: authData.deadline,
        authSignature: authData.signature,
        lockedUnitPriceUSDC: currentTier.price,
      });

      setTxHash(result.txHash);
      setTxStep("SYNCING");
      await new Promise((r) => setTimeout(r, 1500));
      setTxStep("CONFIRMED");

      // Trigger victory celebration
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      // Refresh campaign state
      fetchCampaign();
    } catch (err: any) {
      setTxStep("FAILED");
      setTxError(err.message);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div>
      {/* Back button */}
      <button
        className="btn btn-secondary btn-sm"
        onClick={onBack}
        style={{ marginBottom: "1.5rem" }}
      >
        <ArrowLeft size={16} /> Quay lại danh sách
      </button>

      <div className="campaign-detail-grid">
        {/* Left Column: Details & Tier Progression */}
        <div>
          {/* Main Visual Header */}
          <div
            style={{
              position: "relative",
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              height: "320px",
              marginBottom: "1.5rem",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <img
              src={campaign.thumbnailUrl}
              alt={campaign.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(7, 9, 14, 0.95) 0%, transparent 60%)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: "2rem",
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <span className="badge badge-sla">SLA Giao hàng {campaign.deliverySlaSeconds / 3600}h</span>
                {campaign.earlyRebateEnabled && (
                  <span className="badge badge-early">Early Supporter Rebate</span>
                )}
                <span className="badge badge-verified-seller">Arc Testnet Escrow</span>
              </div>
              <h1 style={{ fontSize: "1.85rem", lineHeight: 1.25, color: "#fff" }}>
                {campaign.title}
              </h1>
            </div>
          </div>

          {/* Seller Profile & Verification Badges */}
          <div
            className="glass-card"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1.5rem",
              padding: "1.25rem 1.5rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                Người bán / Nhà phân phối
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <strong style={{ fontSize: "1.05rem" }}>{seller?.displayName || "Seller"}</strong>
                {seller?.verifiedSellerBadge && (
                  <span className="badge badge-verified-seller" title="Xác minh danh tính & tư cách pháp nhân">
                    <CheckCircle2 size={12} /> Seller Verified
                  </span>
                )}
                {seller?.verifiedRightsBadge && (
                  <span className="badge badge-verified-rights" title="Xác minh quyền phân phối bản quyền">
                    <ShieldCheck size={12} /> Rights Verified
                  </span>
                )}
              </div>
              {seller?.bio && (
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                  {seller.bio}
                </p>
              )}
            </div>

            <button className="btn btn-secondary btn-sm" onClick={() => setIsShareOpen(true)}>
              <Share2 size={15} />
              Chia sẻ / QR
            </button>
          </div>

          {/* Interactive Tier Ladder Visualizer */}
          <div className="glass-card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Sparkles size={18} color="var(--primary-light)" />
                {t("tierProgression")}
              </h3>
              <span style={{ fontSize: "0.85rem", color: "var(--cyan)" }}>
                Chỉ số: {campaign.metric === "BUYER_COUNT" ? "Số người mua đủ điều kiện" : "Số đơn vị thanh toán"}
              </span>
            </div>

            <div className="tier-ladder">
              {campaign.tiers.map((tier: any, idx: number) => {
                const isUnlocked = idx <= campaign.currentUnlockedTier;
                const isActive = idx === campaign.currentUnlockedTier;
                const tierPrice = Number(tier.price) / 1e6;

                return (
                  <div
                    key={idx}
                    className={`tier-step ${isActive ? "active" : isUnlocked ? "unlocked" : ""}`}
                  >
                    <div className="tier-step-left">
                      <div className="tier-badge-number">
                        {isUnlocked ? <Check size={14} /> : idx + 1}
                      </div>
                      <div>
                        <div className="tier-info-title">
                          Tier {idx + 1}: Ngưỡng đạt {tier.threshold}{" "}
                          {campaign.metric === "BUYER_COUNT" ? "người mua" : "đơn vị"}
                        </div>
                        <div className="tier-info-sub">
                          {isUnlocked
                            ? isActive
                              ? "★ Đang áp dụng mức giá này"
                              : "Đã vượt qua mức này"
                            : `Cần thêm ${tier.threshold - currentMetric} nữa để mở khóa`}
                        </div>
                      </div>
                    </div>

                    <div className="tier-price-tag font-mono">
                      ${tierPrice} <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>USDC</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.25)",
                borderRadius: "var(--radius-md)",
                padding: "0.85rem 1.25rem",
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              💡 <strong>Cơ chế Rebate tự động:</strong> Bạn sẽ thanh toán ở mức giá tier hiện tại (<strong>${currentPrice} USDC</strong>). Nếu chiến dịch kết thúc đạt tier tốt hơn (thấp nhất <strong>${lowestPrice} USDC</strong>), bạn sẽ được rút phần tiền chênh lệch (Rebate) trực tiếp từ Smart Contract về ví của mình!
            </div>
          </div>

          {/* Delivery & Protection Terms */}
          <div className="glass-card">
            <h3 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>{t("deliveryInfo")}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  padding: "1rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--cyan)", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                  <KeyRound size={16} /> {t("deliveryMethod")}
                </div>
                <div style={{ fontWeight: 600 }}>{campaign.deliveryMethod}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  Mã hóa AES-256 bảo vệ offchain, chỉ buyer mới có thể giải mã.
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  padding: "1rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--warning)", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                  <Clock size={16} /> {t("deliverySla")}
                </div>
                <div style={{ fontWeight: 600 }}>{campaign.deliverySlaSeconds / 3600} giờ sau khi đóng</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  Nếu quá hạn không giao, hợp đồng tự động kích hoạt Full Refund 100%.
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--radius-md)",
                fontSize: "0.85rem",
                color: "#6ee7b7",
              }}
            >
              <ShieldCheck size={20} style={{ flexShrink: 0, marginTop: "0.15rem" }} />
              <div>
                <strong>{t("disputeWindow")}:</strong> {t("disputeWindowDesc")}. Tiền của bạn không bao giờ được chuyển cho seller nếu bạn mở tranh chấp hợp lệ. Có fallback trực tiếp trên Arc Smart Contract nếu mạng internet/backend gặp sự cố!
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Checkout Action Card */}
        <div>
          <div className="glass-card highlight" style={{ position: "sticky", top: "5.5rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
              {t("currentPrice")}
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <span
                className="font-mono"
                style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--cyan)" }}
              >
                ${currentPrice}
              </span>
              <span style={{ color: "var(--text-muted)" }}>USDC / đơn vị</span>
            </div>

            {/* Campaign Summary Stats */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                padding: "1rem",
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                marginBottom: "1.5rem",
                fontSize: "0.88rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Đã tham gia:</span>
                <span className="font-mono" style={{ fontWeight: 600 }}>
                  {currentMetric} {campaign.metric === "BUYER_COUNT" ? "người" : "đơn vị"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Giới hạn mỗi ví:</span>
                <span className="font-mono">{campaign.maxPerAccount} đơn vị</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Thời gian còn lại:</span>
                <span style={{ color: "var(--warning)", fontWeight: 600 }}>
                  {Math.max(0, Math.floor((campaign.endTime - Date.now() / 1000) / 86400))} ngày
                </span>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              style={{ width: "100%", justifyContent: "center", marginBottom: "0.75rem" }}
              onClick={() => setIsPreTxOpen(true)}
            >
              {t("commitToBuy")}
            </button>

            <button
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setIsShareOpen(true)}
            >
              <Share2 size={16} />
              {t("shareCampaign")}
            </button>

            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textAlign: "center",
                marginTop: "1.25rem",
                lineHeight: 1.4,
              }}
            >
              🔒 Khóa điều khoản tài chính bất biến trên Arc Testnet. Gas thanh toán bằng USDC Native.
            </div>
          </div>
        </div>
      </div>

      {/* Pre-Tx Modal */}
      <PreTxModal
        isOpen={isPreTxOpen}
        onClose={() => setIsPreTxOpen(false)}
        campaign={campaign}
        isLoading={isCommitting}
        onConfirm={handleConfirmPurchase}
      />

      {/* Tx Tracker Modal */}
      <TxTrackerModal
        isOpen={isTxModalOpen}
        step={txStep}
        txHash={txHash}
        errorMessage={txError}
        onClose={() => {
          setIsTxModalOpen(false);
          if (txStep === "CONFIRMED") onGoToOrders();
        }}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        campaignId={campaign.id}
        campaignTitle={campaign.title}
      />
    </div>
  );
};
