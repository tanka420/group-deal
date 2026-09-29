import React, { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  TrendingUp,
  Clock,
  Users,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
} from "lucide-react";

interface ExplorePageProps {
  onSelectCampaign: (campaignId: string) => void;
}

export const ExplorePage: React.FC<ExplorePageProps> = ({ onSelectCampaign }) => {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data.campaigns || []);
      })
      .catch((e) => console.warn("Failed to fetch campaigns", e))
      .finally(() => setLoading(false));
  }, []);

  const categories = [
    { id: "ALL", label: t("filterAll") },
    { id: "Giáo dục & Khóa học", label: "Khóa học AI & Tech" },
    { id: "Công cụ lập trình", label: "Bản quyền & SaaS Seats" },
    { id: "Thiết kế & Giao diện", label: "Design System & Assets" },
  ];

  const filteredCampaigns =
    selectedCategory === "ALL"
      ? campaigns
      : campaigns.filter((c) => c.category === selectedCategory);

  // Time remaining helper
  const formatTimeLeft = (endTime: number) => {
    const diff = endTime - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "Đã kết thúc";
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    return `${days} ngày ${hours}h`;
  };

  // Dynamic metrics calculation from real campaign data
  const totalVolumeUSDC = campaigns.reduce((acc, c) => {
    return acc + Number(c.totalGrossCommitted || 0) / 1e6;
  }, 0);

  const activeCampaignsCount = campaigns.filter(
    (c) => c.status === "ACTIVE" || c.status === "PUBLISHED"
  ).length;

  const discounts = campaigns
    .map((c) => {
      if (c.tiers && c.tiers.length >= 2) {
        const initialPrice = Number(c.tiers[0].price);
        const lowestPrice = Number(c.tiers[c.tiers.length - 1].price);
        if (initialPrice > 0) {
          return ((initialPrice - lowestPrice) / initialPrice) * 100;
        }
      }
      return 0;
    })
    .filter((d) => d > 0);

  const avgDiscount =
    discounts.length > 0
      ? (discounts.reduce((a, b) => a + b, 0) / discounts.length).toFixed(1)
      : "0";

  return (
    <div>
      {/* Hero Section */}
      <section style={{ textAlign: "center", padding: "3rem 1rem 3.5rem" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.85rem",
            borderRadius: "var(--radius-full)",
            background: "rgba(99, 102, 241, 0.12)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            color: "var(--primary-light)",
            fontSize: "0.85rem",
            fontWeight: 600,
            marginBottom: "1.25rem",
          }}
        >
          <Sparkles size={16} />
          Mạng Arc Testnet • USDC Smart Contract Escrow
        </div>

        <h1
          style={{
            fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
            lineHeight: 1.15,
            maxWidth: "850px",
            margin: "0 auto 1.25rem",
          }}
        >
          Mua Chung Sản Phẩm Số
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, var(--cyan) 0%, var(--primary-light) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Giá Càng Giảm Khi Nhóm Càng Lớn
          </span>
        </h1>

        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "1.1rem",
            maxWidth: "680px",
            margin: "0 auto 2.5rem",
          }}
        >
          {t("heroSub")}
        </p>

        {/* Live Metrics Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1.25rem",
            maxWidth: "800px",
            margin: "0 auto",
          }}
        >
          <div className="glass-card" style={{ padding: "1.25rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
              {t("totalVolume")}
            </div>
            <div className="font-mono" style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--cyan)" }}>
              ${totalVolumeUSDC.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDC
            </div>
          </div>

          <div className="glass-card" style={{ padding: "1.25rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
              {t("activeCampaigns")}
            </div>
            <div className="font-mono" style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary-light)" }}>
              {activeCampaignsCount} Chiến dịch
            </div>
          </div>

          <div className="glass-card" style={{ padding: "1.25rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
              {t("avgDiscount")}
            </div>
            <div className="font-mono" style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--success)" }}>
              -{avgDiscount}% Off
            </div>
          </div>
        </div>
      </section>

      {/* Category Filter Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          paddingBottom: "1rem",
          marginBottom: "2rem",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`btn btn-sm ${selectedCategory === cat.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Campaigns Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
          Đang tải chiến dịch từ Arc Testnet...
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
          Không có chiến dịch nào trong danh mục này.
        </div>
      ) : (
        <div className="grid-cards">
          {filteredCampaigns.map((c) => {
            const currentTier = c.tiers[c.currentUnlockedTier] || c.tiers[0];
            const nextTier = c.tiers[c.currentUnlockedTier + 1] || null;
            const currentPrice = Number(currentTier.price) / 1e6;
            const nextPrice = nextTier ? Number(nextTier.price) / 1e6 : null;
            const initialPrice = Number(c.tiers[0].price) / 1e6;
            const maxDiscount = Math.round(
              ((initialPrice - Number(c.tiers[c.tiers.length - 1].price) / 1e6) / initialPrice) * 100
            );

            const currentMetric = c.metric === "BUYER_COUNT" ? c.totalBuyerCount : c.totalUnitsCommitted;
            const targetMetric = nextTier ? nextTier.threshold : currentTier.threshold;
            const progressPercent = Math.min(100, Math.round((currentMetric / targetMetric) * 100));

            return (
              <div
                key={c.id}
                className="glass-card"
                style={{ cursor: "pointer", display: "flex", flexDirection: "column" }}
                onClick={() => onSelectCampaign(c.id)}
              >
                {/* Thumbnail image with overlay badge */}
                <div
                  style={{
                    position: "relative",
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                    height: "190px",
                    marginBottom: "1rem",
                  }}
                >
                  <img
                    src={c.thumbnailUrl}
                    alt={c.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "0.75rem",
                      left: "0.75rem",
                      display: "flex",
                      gap: "0.4rem",
                    }}
                  >
                    <span className="badge badge-sla">SLA {c.deliverySlaSeconds / 3600}h</span>
                    {c.earlyRebateEnabled && (
                      <span className="badge badge-early">Early Supporter</span>
                    )}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      bottom: "0.75rem",
                      right: "0.75rem",
                      background: "rgba(0, 0, 0, 0.75)",
                      backdropFilter: "blur(6px)",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--success)",
                    }}
                  >
                    Tiết kiệm tới -{maxDiscount}%
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--cyan)",
                      fontWeight: 600,
                      marginBottom: "0.35rem",
                    }}
                  >
                    {c.category}
                  </div>

                  <h3
                    style={{
                      fontSize: "1.15rem",
                      lineHeight: 1.35,
                      marginBottom: "0.6rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {c.title}
                  </h3>

                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                      marginBottom: "1.25rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {c.description}
                  </p>

                  {/* Progress bar */}
                  <div style={{ marginBottom: "1rem" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.78rem",
                        color: "var(--text-secondary)",
                        marginBottom: "0.35rem",
                      }}
                    >
                      <span>
                        Tier {c.currentUnlockedTier + 1}/{c.tiers.length}: {currentMetric}{" "}
                        {c.metric === "BUYER_COUNT" ? "người" : "đơn vị"}
                      </span>
                      {nextTier ? (
                        <span>Mục tiêu tiếp theo: {nextTier.threshold}</span>
                      ) : (
                        <span style={{ color: "var(--success)" }}>Đã mở khóa tier tối đa!</span>
                      )}
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>

                  {/* Price & Action footer */}
                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "1rem",
                      borderTop: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {t("currentPrice")}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                        <span
                          className="font-mono"
                          style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)" }}
                        >
                          ${currentPrice}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>USDC</span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      {nextPrice ? (
                        <div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            Tier kế tiếp
                          </div>
                          <div
                            className="font-mono"
                            style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cyan)" }}
                          >
                            ${nextPrice} USDC
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          <Clock size={13} />
                          {formatTimeLeft(c.endTime)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
