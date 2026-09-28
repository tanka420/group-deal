import React, { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import {
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Coins,
  Copy,
  Check,
  Star,
  MessageSquare,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

export const BuyerDashboard: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { account, claimBuyerFundsOnchain, confirmReceiptOnchain, openDisputeOnchain, hubAddress } = useWeb3();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Entitlement Reveal State
  const [revealedEntitlements, setRevealedEntitlements] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dispute Modal State
  const [disputeModalOrder, setDisputeModalOrder] = useState<any | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

  // Review Modal State
  const [reviewModalOrder, setReviewModalOrder] = useState<any | null>(null);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Support thread state
  const [activeThreadOrder, setActiveThreadOrder] = useState<any | null>(null);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [newMsgText, setNewMsgText] = useState("");

  const fetchOrders = () => {
    fetch("/api/orders/buyer", {
      headers: { Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setOrders(data.orders || []);
      })
      .catch((e) => console.warn("Failed to fetch buyer orders", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, [user, account]);

  // Decrypt entitlement secret
  const handleReveal = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/entitlement`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRevealedEntitlements((prev) => ({ ...prev, [orderId]: data.entitlement }));
    } catch (e: any) {
      alert("Lỗi giải mã: " + e.message);
    }
  };

  // Copy to clipboard helper
  const handleCopy = (orderId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(orderId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Confirm receipt early
  const handleConfirmReceipt = async (order: any) => {
    if (!confirm("Bạn có chắc chắn muốn xác nhận đã nhận sản phẩm hoạt động tốt? Thao tác này sẽ phân bổ tiền cho người bán.")) return;
    try {
      await confirmReceiptOnchain(Number(order.campaignId), Number(order.id));
      await fetch(`/api/orders/${order.id}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}` },
      });
      fetchOrders();
    } catch (e: any) {
      alert("Lỗi xác nhận: " + e.message);
    }
  };

  // Open Dispute
  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeModalOrder || !disputeReason) return;
    setIsSubmittingDispute(true);
    try {
      // 1. Submit onchain dispute
      await openDisputeOnchain(
        Number(disputeModalOrder.campaignId),
        Number(disputeModalOrder.id),
        disputeReason
      );

      // 2. Submit offchain record & evidence
      await fetch(`/api/orders/${disputeModalOrder.id}/dispute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}` },
        body: JSON.stringify({
          reason: disputeReason,
          evidenceUrls: disputeEvidence ? [disputeEvidence] : [],
        }),
      });

      setDisputeModalOrder(null);
      setDisputeReason("");
      setDisputeEvidence("");
      fetchOrders();
    } catch (e: any) {
      alert("Lỗi mở tranh chấp: " + e.message);
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  // Submit Review
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalOrder) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/orders/${reviewModalOrder.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}` },
        body: JSON.stringify({ score: reviewScore, comment: reviewComment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReviewModalOrder(null);
      setReviewComment("");
      fetchOrders();
    } catch (e: any) {
      alert("Lỗi đánh giá: " + e.message);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Pull Claim all claimable rebates/refunds
  const handleClaimFunds = async (order: any) => {
    try {
      await claimBuyerFundsOnchain(Number(order.campaignId), [Number(order.id)]);
      alert("Đã rút tiền thành công về ví!");
      fetchOrders();
    } catch (e: any) {
      alert("Lỗi rút tiền: " + e.message);
    }
  };

  // Support thread opener
  const handleOpenThread = async (order: any) => {
    setActiveThreadOrder(order);
    try {
      const res = await fetch(`/api/orders/${order.id}/messages`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}` },
      });
      const data = await res.json();
      setThreadMessages(data.messages || []);
    } catch (e) {
      console.warn("Could not fetch messages", e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadOrder || !newMsgText) return;
    try {
      const res = await fetch(`/api/orders/${activeThreadOrder.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("groupdeal_token") || ""}`,
        },
        body: JSON.stringify({ text: newMsgText }),
      });
      const data = await res.json();
      setThreadMessages((prev) => [...prev, data.message]);
      setNewMsgText("");
    } catch (e: any) {
      alert("Lỗi gửi tin nhắn: " + e.message);
    }
  };

  // Calculate total claimables
  let totalClaimableRebates = 0;
  let totalClaimableRefunds = 0;
  orders.forEach((o) => {
    if (!o.buyerClaimed) {
      totalClaimableRebates += Number(o.rebateAllocated || 0) / 1e6;
      totalClaimableRefunds += Number(o.buyerRefundAllocated || 0) / 1e6;
    }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "0.25rem" }}>{t("buyerDashboardTitle")}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            Theo dõi tiến độ đơn hàng, mở khóa mã bản quyền số và quản lý các khoản Rebate / Hoàn tiền.
          </p>
        </div>
      </div>

      {/* Overview Balance Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        <div className="glass-card" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
            {t("claimableRebate")}
          </div>
          <div className="font-mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--cyan)" }}>
            ${totalClaimableRebates.toFixed(2)} USDC
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
            Tiền chênh lệch nhận lại khi chiến dịch chốt tier giá thấp hơn.
          </div>
        </div>

        <div className="glass-card" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
            {t("claimableRefund")}
          </div>
          <div className="font-mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)" }}>
            ${totalClaimableRefunds.toFixed(2)} USDC
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
            Khoản hoàn tiền do quá hạn giao (SLA) hoặc trọng tài phán quyết.
          </div>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
          Đang tải danh sách đơn hàng...
        </div>
      ) : orders.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Bạn chưa có đơn cam kết mua nào. Hãy khám phá các chiến dịch mua chung đang mở!
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {orders.map((o) => {
            const lockedPrice = Number(o.lockedUnitPrice) / 1e6;
            const gross = Number(o.committedGross) / 1e6;
            const rebate = Number(o.rebateAllocated || 0) / 1e6;
            const refund = Number(o.buyerRefundAllocated || 0) / 1e6;
            const isRevealed = !!revealedEntitlements[o.id];

            return (
              <div key={o.id} className="glass-card" style={{ padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                      Đơn hàng #{o.id} • Chiến dịch #{o.campaignId}
                    </div>
                    <h3 style={{ fontSize: "1.2rem", marginBottom: "0.3rem" }}>
                      {o.campaignTitle}
                    </h3>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Số lượng: <strong>{o.quantity} đơn vị</strong> | Đơn giá khóa: <strong>${lockedPrice} USDC</strong> | Tổng cam kết: <strong>${gross} USDC</strong>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span
                      className="badge"
                      style={{
                        background:
                          o.deliveryStatus === "CONFIRMED" || o.deliveryStatus === "RESOLVED"
                            ? "rgba(16, 185, 129, 0.15)"
                            : o.deliveryStatus === "DELIVERED"
                            ? "rgba(6, 182, 212, 0.15)"
                            : o.deliveryStatus === "DISPUTED"
                            ? "rgba(244, 63, 94, 0.15)"
                            : "rgba(245, 158, 11, 0.15)",
                        color:
                          o.deliveryStatus === "CONFIRMED" || o.deliveryStatus === "RESOLVED"
                            ? "var(--success)"
                            : o.deliveryStatus === "DELIVERED"
                            ? "var(--cyan)"
                            : o.deliveryStatus === "DISPUTED"
                            ? "var(--danger)"
                            : "var(--warning)",
                      }}
                    >
                      {o.deliveryStatus === "PENDING" && "Chờ người bán giao sản phẩm"}
                      {o.deliveryStatus === "DELIVERED" && "Đã giao • Cửa sổ 48h kiểm tra"}
                      {o.deliveryStatus === "CONFIRMED" && "Đã xác nhận hoàn tất"}
                      {o.deliveryStatus === "DISPUTED" && "Đang trong diện tranh chấp"}
                      {o.deliveryStatus === "BREACHED_REFUNDED" && "Vi phạm SLA • Đã hoàn tiền 100%"}
                      {o.deliveryStatus === "RESOLVED" && "Đã trọng tài phán quyết"}
                    </span>
                  </div>
                </div>

                {/* Delivered Entitlement Box */}
                {o.deliveredEntitlementEncrypted && (
                  <div
                    style={{
                      background: "rgba(6, 182, 212, 0.08)",
                      border: "1px solid rgba(6, 182, 212, 0.25)",
                      borderRadius: "var(--radius-md)",
                      padding: "1rem 1.25rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--cyan)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <KeyRound size={16} /> Quyền truy cập số bảo mật (AES-256)
                      </span>
                      {!isRevealed ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleReveal(o.id)}
                        >
                          Giải mã & Xem nội dung
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleCopy(o.id, revealedEntitlements[o.id])}
                        >
                          {copiedId === o.id ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                          {copiedId === o.id ? "Đã copy" : "Copy"}
                        </button>
                      )}
                    </div>

                    {isRevealed && (
                      <div
                        className="font-mono"
                        style={{
                          background: "rgba(0, 0, 0, 0.4)",
                          padding: "0.75rem 1rem",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.9rem",
                          wordBreak: "break-all",
                          color: "#fff",
                        }}
                      >
                        {revealedEntitlements[o.id]}
                      </div>
                    )}
                  </div>
                )}

                {/* Claimable Balance Bar & Action Buttons */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "0.85rem",
                    borderTop: "1px solid var(--border-subtle)",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.85rem" }}>
                    {rebate > 0 && (
                      <div>
                        Rebate: <strong style={{ color: "var(--cyan)" }}>${rebate} USDC</strong>
                      </div>
                    )}
                    {refund > 0 && (
                      <div>
                        Hoàn tiền: <strong style={{ color: "var(--success)" }}>${refund} USDC</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {/* Pull Claim Button */}
                    {!o.buyerClaimed && (rebate > 0 || refund > 0) && (
                      <button className="btn btn-sm btn-success" onClick={() => handleClaimFunds(o)}>
                        <Coins size={14} /> Rút ${ (rebate + refund).toFixed(2) } USDC
                      </button>
                    )}

                    {/* Confirm receipt early */}
                    {o.deliveryStatus === "DELIVERED" && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleConfirmReceipt(o)}
                      >
                        <CheckCircle2 size={14} color="var(--success)" /> {t("confirmReceipt")}
                      </button>
                    )}

                    {/* Open dispute */}
                    {o.deliveryStatus === "DELIVERED" && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setDisputeModalOrder(o)}
                        style={{ borderColor: "rgba(244, 63, 94, 0.4)", color: "#fda4af" }}
                      >
                        <AlertTriangle size={14} /> {t("openDispute")}
                      </button>
                    )}

                    {/* Support Messages thread */}
                    <button className="btn btn-sm btn-secondary" onClick={() => handleOpenThread(o)}>
                      <MessageSquare size={14} /> Hỗ trợ / Tin nhắn
                    </button>

                    {/* Leave Review */}
                    {(o.deliveryStatus === "DELIVERED" || o.deliveryStatus === "CONFIRMED") && !o.review && (
                      <button className="btn btn-sm btn-secondary" onClick={() => setReviewModalOrder(o)}>
                        <Star size={14} color="var(--warning)" /> {t("rateSeller")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Direct Onchain Dispute Fallback Notice */}
                {o.deliveryStatus === "DELIVERED" && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginTop: "0.75rem",
                      paddingTop: "0.5rem",
                      borderTop: "1px dashed var(--border-subtle)",
                    }}
                  >
                    🛡️ <strong>Direct Onchain Fallback:</strong> Nếu hệ thống gặp sự cố mạng, bạn có thể gọi trực tiếp hàm <code>openDispute(campaignId: {o.campaignId}, orderId: {o.id}, reasonHash)</code> trên Smart Contract Arc: <code>{hubAddress}</code>.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModalOrder && (
        <div className="modal-overlay" onClick={() => setDisputeModalOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={20} color="var(--danger)" />
                Mở tranh chấp đơn hàng #{disputeModalOrder.id}
              </h3>
            </div>
            <form onSubmit={handleOpenDispute}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
                Số tiền của đơn hàng sẽ bị đóng băng an toàn trong hợp đồng. Trọng tài Operator sẽ xem xét bằng chứng và chỉ phân bổ giữa ví của bạn và người bán theo đúng định luật bảo toàn tài chính.
              </p>
              <div className="form-group">
                <label className="form-label">Lý do tranh chấp</label>
                <textarea
                  className="form-textarea"
                  placeholder="Mô tả sự cố: Mã bản quyền không kích hoạt được, link tải bị hỏng..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Link ảnh chụp màn hình bằng chứng (tùy chọn)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://imgur.com/... hoặc link Google Drive"
                  value={disputeEvidence}
                  onChange={(e) => setDisputeEvidence(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setDisputeModalOrder(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  style={{ flex: 2 }}
                  disabled={isSubmittingDispute}
                >
                  {isSubmittingDispute ? "Đang gửi lên Arc..." : "Xác nhận mở tranh chấp"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModalOrder && (
        <div className="modal-overlay" onClick={() => setReviewModalOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Đánh giá Người bán cho đơn #{reviewModalOrder.id}</h3>
            </div>
            <form onSubmit={handleSubmitReview}>
              <div className="form-group">
                <label className="form-label">Số sao đánh giá (1-5)</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewScore(star)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "0.25rem",
                      }}
                    >
                      <Star
                        size={28}
                        color={star <= reviewScore ? "var(--warning)" : "var(--text-muted)"}
                        fill={star <= reviewScore ? "var(--warning)" : "none"}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nhận xét chi tiết</label>
                <textarea
                  className="form-textarea"
                  placeholder="Chia sẻ trải nghiệm sử dụng sản phẩm số, tốc độ giao hàng của người bán..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setReviewModalOrder(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={isSubmittingReview}
                >
                  {isSubmittingReview ? "Đang gửi..." : "Gửi đánh giá"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Support Thread Modal */}
      {activeThreadOrder && (
        <div className="modal-overlay" onClick={() => setActiveThreadOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h3>Hộp thoại hỗ trợ đơn #{activeThreadOrder.id}</h3>
            </div>

            <div
              style={{
                height: "320px",
                overflowY: "auto",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                marginBottom: "1rem",
                background: "rgba(0, 0, 0, 0.2)",
              }}
            >
              {threadMessages.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", margin: "auto" }}>
                  Chưa có tin nhắn nào trong thread này.
                </div>
              ) : (
                threadMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.senderRole === "buyer" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "var(--radius-md)",
                      background:
                        m.senderRole === "buyer"
                          ? "rgba(99, 102, 241, 0.2)"
                          : m.senderRole === "operator"
                          ? "rgba(245, 158, 11, 0.2)"
                          : "rgba(255, 255, 255, 0.08)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                      {m.senderRole.toUpperCase()} • {new Date(m.timestamp).toLocaleTimeString()}
                    </div>
                    <div>{m.text}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Nhập tin nhắn hỗ trợ..."
                value={newMsgText}
                onChange={(e) => setNewMsgText(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary">
                Gửi
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
