import React, { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import {
  Store,
  PlusCircle,
  PackageCheck,
  Coins,
  Send,
  Sparkles,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Globe,
  Radio,
  FileCode,
} from "lucide-react";

export const SellerDashboard: React.FC = () => {
  const { t } = useLanguage();
  const { user, setupSellerProfile } = useAuth();
  const { account, claimSellerProceedsOnchain } = useWeb3();

  const [activeTab, setActiveTab] = useState<"CAMPAIGNS" | "FULFILLMENT" | "WEBHOOKS" | "CREATE">(
    "CAMPAIGNS"
  );
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [webhookData, setWebhookData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup Profile modal
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [payoutWallet, setPayoutWallet] = useState(account || "");

  // Fulfill Modal State
  const [fulfillOrderObj, setFulfillOrderObj] = useState<any | null>(null);
  const [secretContent, setSecretContent] = useState("");
  const [isFulfilling, setIsFulfilling] = useState(false);

  // Create Campaign Wizard State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Công cụ lập trình");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [metric, setMetric] = useState<"BUYER_COUNT" | "UNITS_COUNT">("BUYER_COUNT");
  const [tiers, setTiers] = useState([
    { threshold: 1, priceUSDC: 100 },
    { threshold: 10, priceUSDC: 75 },
    { threshold: 25, priceUSDC: 50 },
  ]);
  const [maxPerAccount, setMaxPerAccount] = useState(3);
  const [inventoryLimit, setInventoryLimit] = useState(50);
  const [durationDays, setDurationDays] = useState(7);
  const [deliverySlaHours, setDeliverySlaHours] = useState(24);
  const [earlyRebateEnabled, setEarlyRebateEnabled] = useState(false);
  const [earlySlotsCount, setEarlySlotsCount] = useState(5);
  const [earlyRebateAmountUSDC, setEarlyRebateAmountUSDC] = useState(10);
  const [deliveryMethod, setDeliveryMethod] = useState("LICENSE_KEY");
  const [samplePayload, setSamplePayload] = useState("PRO-KEY-2026-ABC-XYZ-999");
  const [isDryRunVerified, setIsDryRunVerified] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  // Webhook form state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);

  const fetchSellerData = () => {
    const token = localStorage.getItem("groupdeal_token");
    if (!token) return;

    Promise.all([
      fetch("/api/seller/campaigns", { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.json()
      ),
      fetch("/api/seller/orders", { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.json()
      ),
      fetch("/api/seller/webhooks", { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.json()
      ),
    ])
      .then(([cData, oData, wData]) => {
        setCampaigns(cData.campaigns || []);
        setOrders(oData.orders || []);
        setWebhookData(wData.webhook || null);
        if (wData.webhook?.targetUrl) setWebhookUrl(wData.webhook.targetUrl);
      })
      .catch((e) => console.warn("Failed to fetch seller data", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSellerData();
  }, [user]);

  // Handle dry-run delivery test (F21 fail-closed fix)
  const handleTestDeliveryFlow = async () => {
    try {
      const token = localStorage.getItem("groupdeal_token");
      const res = await fetch("/api/campaigns/test-delivery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deliveryMethod, samplePayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIsDryRunVerified(false);
        alert("❌ Kiểm tra giao thử nghiệm thất bại: " + (data.error || "Lỗi không xác định"));
        return;
      }
      setIsDryRunVerified(true);
      alert("✅ Kiểm tra thử luồng mã hóa & giải mã thành công! Bạn có thể xuất bản chiến dịch.");
    } catch (e: any) {
      setIsDryRunVerified(false);
      alert("❌ Lỗi kiểm tra thử: " + e.message);
    }
  };

  // Create Campaign Draft & Publish
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDryRunVerified) {
      alert("Vui lòng thực hiện 'Kiểm tra thử luồng giao (Dry-run test)' trước khi tạo!");
      return;
    }
    setIsCreatingDraft(true);
    try {
      const token = localStorage.getItem("groupdeal_token");
      // 1. Create draft
      const res = await fetch("/api/campaigns/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          category,
          thumbnailUrl: thumbnailUrl || "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800",
          metric,
          tiers,
          maxPerAccount,
          inventoryLimit,
          durationDays,
          deliverySlaHours,
          earlyRebateEnabled,
          earlySlotsCount,
          earlyRebateAmountUSDC,
          visibility: "PUBLIC",
          deliveryMethod,
          deliveryContentTemplate: samplePayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 2. Mark dry run verified & publish
      const testRes = await fetch(`/api/campaigns/${data.campaign.id}/test-delivery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ samplePayload }),
      });
      const testData = await testRes.json();
      if (!testRes.ok) {
        throw new Error(testData.error || "Giao thử nghiệm thất bại trước khi publish");
      }

      const publishRes = await fetch(`/api/campaigns/${data.campaign.id}/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const publishData = await publishRes.json();
      if (!publishRes.ok) {
        throw new Error(publishData.error || "Xuất bản chiến dịch thất bại");
      }

      alert("🎉 Chiến dịch đã được tạo và xuất bản thành công trên Arc Testnet!");
      setActiveTab("CAMPAIGNS");
      fetchSellerData();
    } catch (err: any) {
      alert("Lỗi tạo chiến dịch: " + err.message);
    } finally {
      setIsCreatingDraft(false);
    }
  };

  // Fulfill order
  const handleFulfillOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fulfillOrderObj || !secretContent) return;
    setIsFulfilling(true);
    try {
      const token = localStorage.getItem("groupdeal_token");
      const res = await fetch(`/api/seller/orders/${fulfillOrderObj.id}/deliver`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ secretContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("✅ Đã giao mã bản quyền mã hóa AES-256 thành công!");
      setFulfillOrderObj(null);
      setSecretContent("");
      fetchSellerData();
    } catch (err: any) {
      alert("Lỗi giao sản phẩm: " + err.message);
    } finally {
      setIsFulfilling(false);
    }
  };

  // Claim Seller proceeds
  const handleClaimSellerProceeds = async (campaignId: string, orderId: string) => {
    try {
      await claimSellerProceedsOnchain(Number(campaignId), [Number(orderId)]);
      alert("Đã rút doanh thu về ví thành công!");
      fetchSellerData();
    } catch (e: any) {
      alert("Lỗi rút tiền: " + e.message);
    }
  };

  // Save webhook
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWebhook(true);
    try {
      const token = localStorage.getItem("groupdeal_token");
      const res = await fetch("/api/seller/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUrl: webhookUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWebhookData(data.webhook);
      alert("Đã lưu webhook thành công!");
    } catch (err: any) {
      alert("Lỗi lưu webhook: " + err.message);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  // Calculate seller claimable
  let totalSellerClaimable = 0;
  orders.forEach((o) => {
    if ((o.deliveryStatus === "CONFIRMED" || o.deliveryStatus === "RESOLVED") && !o.sellerClaimed) {
      totalSellerClaimable += Number(o.sellerAllocated || 0) / 1e6;
    }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "0.25rem" }}>{t("sellerDashboardTitle")}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            Khởi tạo chiến dịch mua chung theo bậc giá, quản lý fulfillment và đối soát doanh thu.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setActiveTab("CREATE")}>
          <PlusCircle size={17} />
          {t("createCampaignBtn")}
        </button>
      </div>

      {/* Overview Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        <div className="glass-card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            Chiến dịch đang mở
          </div>
          <div className="font-mono" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
            {campaigns.length}
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            Đơn chờ giao hàng (Fulfillment)
          </div>
          <div className="font-mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--warning)" }}>
            {orders.filter((o) => o.deliveryStatus === "PENDING").length}
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            Doanh thu có thể rút (Proceeds)
          </div>
          <div className="font-mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)" }}>
            ${totalSellerClaimable.toFixed(2)} USDC
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: "1rem",
          marginBottom: "2rem",
        }}
      >
        <button
          className={`btn btn-sm ${activeTab === "CAMPAIGNS" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("CAMPAIGNS")}
        >
          Chiến dịch của tôi ({campaigns.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "FULFILLMENT" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("FULFILLMENT")}
        >
          Đơn hàng & Giao quyền truy cập ({orders.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "WEBHOOKS" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("WEBHOOKS")}
        >
          Tích hợp Webhook HMAC
        </button>
      </div>

      {/* Tab Content: CAMPAIGNS */}
      {activeTab === "CAMPAIGNS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {campaigns.length === 0 ? (
            <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
                Bạn chưa có chiến dịch nào. Hãy bắt đầu bằng cách tạo chiến dịch mua chung đầu tiên!
              </p>
              <button className="btn btn-primary" onClick={() => setActiveTab("CREATE")}>
                Tạo chiến dịch mới
              </button>
            </div>
          ) : (
            campaigns.map((c) => (
              <div
                key={c.id}
                className="glass-card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem" }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span className="badge badge-verified-seller">#{c.id}</span>
                    <strong style={{ fontSize: "1.1rem" }}>{c.title}</strong>
                    <span className="badge" style={{ background: "rgba(255,255,255,0.06)" }}>
                      {c.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Đã bán: <strong>{c.totalUnitsCommitted}</strong> đơn vị | Tier hiện tại:{" "}
                    <strong>Tier {c.currentUnlockedTier + 1}/{c.tiers.length}</strong> | SLA:{" "}
                    <strong>{c.deliverySlaSeconds / 3600}h</strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <a href={`#campaign-${c.id}`} className="btn btn-sm btn-secondary">
                    Xem trang bán
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content: FULFILLMENT */}
      {activeTab === "FULFILLMENT" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {orders.length === 0 ? (
            <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
              Chưa có đơn hàng nào phát sinh.
            </div>
          ) : (
            orders.map((o) => {
              const gross = Number(o.committedGross) / 1e6;
              const sellerAllocated = Number(o.sellerAllocated || 0) / 1e6;

              return (
                <div key={o.id} className="glass-card" style={{ padding: "1.25rem 1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <div>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Đơn #{o.id} • {o.campaignTitle}
                      </span>
                      <div style={{ fontWeight: 600, fontSize: "1rem" }}>
                        Ví buyer: <span className="font-mono" style={{ color: "var(--cyan)" }}>{o.buyerPrincipal}</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        Số lượng: {o.quantity} | Giá trị: ${gross} USDC
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span className="badge" style={{ background: "rgba(255,255,255,0.08)" }}>
                        {o.deliveryStatus}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                    <div style={{ fontSize: "0.85rem" }}>
                      Proceeds: <strong style={{ color: "var(--success)" }}>${sellerAllocated} USDC</strong>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {o.deliveryStatus === "PENDING" && (
                        <button className="btn btn-sm btn-primary" onClick={() => setFulfillOrderObj(o)}>
                          <KeyRound size={14} /> Giao mã bản quyền
                        </button>
                      )}

                      {(o.deliveryStatus === "CONFIRMED" || o.deliveryStatus === "RESOLVED") &&
                        !o.sellerClaimed &&
                        sellerAllocated > 0 && (
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleClaimSellerProceeds(o.campaignId, o.id)}
                          >
                            <Coins size={14} /> Rút ${sellerAllocated} USDC
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab Content: WEBHOOKS */}
      {activeTab === "WEBHOOKS" && (
        <div className="glass-card" style={{ maxWidth: "700px" }}>
          <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Cấu hình Webhook & Chữ ký HMAC-SHA256</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
            Hệ thống sẽ gửi thông báo POST kèm chữ ký HMAC (header <code>X-GroupDeal-Signature</code>) và timestamp (chống replay) tới máy chủ của bạn mỗi khi có người mua, mở tier mới, hoặc đơn hàng được giao.
          </p>

          <form onSubmit={handleSaveWebhook}>
            <div className="form-group">
              <label className="form-label">Endpoint URL của bạn</label>
              <input
                type="url"
                className="form-input font-mono"
                placeholder="https://api.yourdomain.com/webhooks/groupdeal"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
              />
            </div>

            {webhookData && (
              <div className="form-group">
                <label className="form-label">Webhook Secret (Dùng để xác thực chữ ký)</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  value={webhookData.secret}
                  readOnly
                  style={{ background: "rgba(0,0,0,0.3)" }}
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={isSavingWebhook}>
              {isSavingWebhook ? "Đang lưu..." : "Lưu cấu hình Webhook"}
            </button>
          </form>

          {webhookData?.logs && webhookData.logs.length > 0 && (
            <div style={{ marginTop: "2rem" }}>
              <h4 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Nhật ký gửi Webhook gần nhất</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {webhookData.logs.slice(0, 5).map((l: any) => (
                  <div
                    key={l.id}
                    style={{
                      background: "rgba(0,0,0,0.2)",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8rem",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{l.event}</span>
                    <span style={{ color: l.status === "SUCCESS" ? "var(--success)" : "var(--danger)" }}>
                      {l.status} ({l.statusCode || "ERR"})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: CREATE CAMPAIGN WIZARD */}
      {activeTab === "CREATE" && (
        <div className="glass-card" style={{ maxWidth: "800px" }}>
          <h3 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>Tạo Chiến Dịch Mua Chung Mới</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
            Lưu ý: Sau khi có cam kết đầu tiên, tất cả các điều khoản về tier, giá, hạn chót và SLA sẽ bị KHÓA BẤT BIẾN trên Smart Contract Arc Testnet.
          </p>

          <form onSubmit={handleCreateCampaign}>
            <div className="form-group">
              <label className="form-label">Tên chiến dịch sản phẩm số</label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: JetBrains All Products Pack 1 năm chính hãng"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Danh mục</label>
                <select
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Công cụ lập trình">Công cụ lập trình / SaaS</option>
                  <option value="Giáo dục & Khóa học">Giáo dục & Khóa học</option>
                  <option value="Thiết kế & Giao diện">Thiết kế & UI/UX Assets</option>
                  <option value="API & Cloud">API & Cloud Tokens</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Chỉ số tính tier</label>
                <select
                  className="form-select"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as any)}
                >
                  <option value="BUYER_COUNT">Số tài khoản buyer đủ điều kiện</option>
                  <option value="UNITS_COUNT">Số đơn vị đã thanh toán</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Mô tả sản phẩm và quyền lợi</label>
              <textarea
                className="form-textarea"
                placeholder="Nêu rõ quyền truy cập (license key cá nhân, seat team, link tải, gói hỗ trợ)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {/* Tier Configuration */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label className="form-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                Cấu hình 2–5 Tiers (Ngưỡng tăng dần, Giá giảm dần)
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {tiers.map((t, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", width: "60px" }}>Tier {idx + 1}:</span>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Ngưỡng đạt"
                      value={t.threshold}
                      onChange={(e) => {
                        const newTiers = [...tiers];
                        newTiers[idx].threshold = Number(e.target.value);
                        setTiers(newTiers);
                      }}
                      style={{ flex: 1 }}
                      required
                    />
                    <span style={{ fontSize: "0.85rem" }}>{metric === "BUYER_COUNT" ? "người" : "đơn vị"} =</span>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Giá USDC"
                      value={t.priceUSDC}
                      onChange={(e) => {
                        const newTiers = [...tiers];
                        newTiers[idx].priceUSDC = Number(e.target.value);
                        setTiers(newTiers);
                      }}
                      style={{ flex: 1 }}
                      required
                    />
                    <span style={{ fontSize: "0.85rem" }}>USDC</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Terms and SLA */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">SLA giao hàng sau khi đóng</label>
                <select
                  className="form-select"
                  value={deliverySlaHours}
                  onChange={(e) => setDeliverySlaHours(Number(e.target.value))}
                >
                  <option value={24}>24 giờ sau khi chốt</option>
                  <option value={48}>48 giờ sau khi chốt</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Thời hạn chiến dịch</label>
                <select
                  className="form-select"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                >
                  <option value={3}>3 ngày</option>
                  <option value={7}>7 ngày (Mặc định)</option>
                  <option value={14}>14 ngày</option>
                  <option value={30}>30 ngày</option>
                </select>
              </div>
            </div>

            {/* Dry run delivery test simulator */}
            <div
              style={{
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <h4 style={{ fontSize: "0.95rem", color: "var(--primary-light)", marginBottom: "0.4rem" }}>
                Bắt buộc: Bài kiểm tra giao hàng (Dry-run Test)
              </h4>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                Nhập thử mẫu license key hoặc link phân bổ để hệ thống kiểm tra khả năng mã hóa AES-256 trước khi cho phép xuất bản lên Arc Testnet.
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="form-input font-mono"
                  value={samplePayload}
                  onChange={(e) => setSamplePayload(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className={`btn ${isDryRunVerified ? "btn-success" : "btn-secondary"}`}
                  onClick={handleTestDeliveryFlow}
                >
                  {isDryRunVerified ? "✓ Đã kiểm tra" : "Chạy thử test"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={isCreatingDraft || !isDryRunVerified}
            >
              {isCreatingDraft ? "Đang xuất bản lên Arc Testnet..." : "Xuất bản chiến dịch"}
            </button>
          </form>
        </div>
      )}

      {/* Fulfill Order Modal */}
      {fulfillOrderObj && (
        <div className="modal-overlay" onClick={() => setFulfillOrderObj(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Giao mã quyền truy cập cho đơn #{fulfillOrderObj.id}</h3>
            </div>
            <form onSubmit={handleFulfillOrder}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
                Nội dung sẽ được mã hóa chuẩn quân sự AES-256-GCM. Không ai, kể cả validator blockchain hay hacker, có thể đọc được ngoài người mua sở hữu đơn hàng này.
              </p>

              <div className="form-group">
                <label className="form-label">Mã license key / Link kích hoạt riêng biệt</label>
                <textarea
                  className="form-textarea font-mono"
                  placeholder="VD: PRO-KEY-2026-XXXX-YYYY-ZZZZ"
                  value={secretContent}
                  onChange={(e) => setSecretContent(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setFulfillOrderObj(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={isFulfilling}
                >
                  {isFulfilling ? "Đang mã hóa & ghi nhận..." : "Mã hóa & Xác nhận giao"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
