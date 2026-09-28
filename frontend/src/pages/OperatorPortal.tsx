import React, { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import {
  ShieldAlert,
  Scale,
  BadgeCheck,
  RefreshCw,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ChevronRight,
} from "lucide-react";

export const OperatorPortal: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { hubAddress } = useWeb3();

  const [activeTab, setActiveTab] = useState<"DISPUTES" | "VERIFICATIONS" | "RECONCILIATION" | "LOGS">(
    "DISPUTES"
  );

  const [disputes, setDisputes] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [reconciliationReport, setReconciliationReport] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dispute Arbitration Modal
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [buyerSplitPercent, setBuyerSplitPercent] = useState<number>(50);
  const [arbitrationNotes, setArbitrationNotes] = useState("");
  const [isArbitrating, setIsArbitrating] = useState(false);

  const fetchOperatorData = () => {
    const token = localStorage.getItem("groupdeal_token");
    if (!token) return;

    Promise.all([
      fetch("/api/operator/disputes", { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.json()
      ),
      fetch("/api/operator/sellers", { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.json()
      ),
      fetch("/api/operator/reconciliation", { headers: { Authorization: `Bearer ${token}` } }).then(
        (r) => r.json()
      ),
      fetch("/api/operator/audit-logs", { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.json()
      ),
    ])
      .then(([dData, sData, rData, lData]) => {
        setDisputes(dData.disputes || []);
        setSellers(sData.sellers || []);
        setReconciliationReport(rData.report || null);
        setAuditLogs(lData.logs || []);
      })
      .catch((e) => console.warn("Failed to fetch operator data", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOperatorData();
  }, [user]);

  // Toggle seller badges
  const handleToggleBadge = async (
    sellerId: string,
    badgeType: "seller" | "rights",
    currentVal: boolean
  ) => {
    try {
      const token = localStorage.getItem("groupdeal_token");
      const body =
        badgeType === "seller"
          ? { verifiedSellerBadge: !currentVal }
          : { verifiedRightsBadge: !currentVal };

      await fetch(`/api/operator/sellers/${sellerId}/badge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      fetchOperatorData();
    } catch (e: any) {
      alert("Lỗi cập nhật badge: " + e.message);
    }
  };

  // Submit dispute arbitration
  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;
    setIsArbitrating(true);

    try {
      const token = localStorage.getItem("groupdeal_token");
      const remainingGross =
        BigInt(selectedDispute.committedGross) - BigInt(selectedDispute.rebateAllocated);
      const buyerShare = (remainingGross * BigInt(buyerSplitPercent)) / 100n;
      const sellerShare = remainingGross - buyerShare;

      const res = await fetch(`/api/operator/disputes/${selectedDispute.id}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          buyerShareBaseUSDC: buyerShare.toString(),
          sellerShareBaseUSDC: sellerShare.toString(),
          notes: arbitrationNotes || "Phán quyết bởi Operator tuân thủ Định luật Bảo toàn Tiền tệ",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("✅ Đã hoàn tất phán quyết tranh chấp và phân bổ tiền chính xác!");
      setSelectedDispute(null);
      setArbitrationNotes("");
      fetchOperatorData();
    } catch (e: any) {
      alert("Lỗi giải quyết tranh chấp: " + e.message);
    } finally {
      setIsArbitrating(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "0.25rem" }}>{t("operatorTitle")}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            Trọng tài giải quyết tranh chấp, duyệt huy hiệu người bán, kiểm toán hệ thống và giám sát bảo toàn tài chính.
          </p>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={fetchOperatorData}>
          <RefreshCw size={15} /> Làm mới dữ liệu
        </button>
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
          className={`btn btn-sm ${activeTab === "DISPUTES" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("DISPUTES")}
        >
          Trọng tài tranh chấp ({disputes.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "VERIFICATIONS" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("VERIFICATIONS")}
        >
          Xác minh người bán & Bản quyền
        </button>
        <button
          className={`btn btn-sm ${activeTab === "RECONCILIATION" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("RECONCILIATION")}
        >
          Đối soát CSDL & Smart Contract
        </button>
        <button
          className={`btn btn-sm ${activeTab === "LOGS" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("LOGS")}
        >
          Nhật ký Kiểm toán ({auditLogs.length})
        </button>
      </div>

      {/* DISPUTES TAB */}
      {activeTab === "DISPUTES" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {disputes.length === 0 ? (
            <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
              <CheckCircle2 size={32} color="var(--success)" style={{ margin: "0 auto 0.75rem" }} />
              <div style={{ fontWeight: 600 }}>Không có tranh chấp nào đang mở</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                Tất cả các đơn hàng đều đang diễn ra bình thường hoặc đã được giải quyết.
              </p>
            </div>
          ) : (
            disputes.map((d) => {
              const gross = Number(d.committedGross) / 1e6;
              const rebate = Number(d.rebateAllocated || 0) / 1e6;
              const disputedAmount = gross - rebate;

              return (
                <div key={d.id} className="glass-card" style={{ padding: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <div>
                      <span className="badge" style={{ background: "rgba(244,63,94,0.15)", color: "var(--danger)", marginBottom: "0.4rem" }}>
                        Tranh chấp đơn #{d.id}
                      </span>
                      <h3 style={{ fontSize: "1.2rem" }}>{d.campaignTitle}</h3>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                        Buyer: <code>{d.buyerPrincipal}</code> | Seller Payout: <code>{d.sellerPayoutWallet}</code>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Khoản tiền tranh chấp</div>
                      <div className="font-mono" style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--cyan)" }}>
                        ${disputedAmount.toFixed(2)} USDC
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.3)",
                      padding: "1rem",
                      borderRadius: "var(--radius-md)",
                      marginBottom: "1rem",
                      fontSize: "0.88rem",
                    }}
                  >
                    <strong>Lý do từ buyer:</strong> {d.disputeReason || "Không nêu rõ"}
                    {d.disputeEvidence && d.disputeEvidence.length > 0 && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <strong>Bằng chứng đính kèm:</strong>{" "}
                        <a href={d.disputeEvidence[0]} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>
                          Xem link bằng chứng
                        </a>
                      </div>
                    )}
                  </div>

                  <button className="btn btn-primary" onClick={() => setSelectedDispute(d)}>
                    <Scale size={16} /> Phán quyết & Phân bổ tiền (Arbitrate)
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VERIFICATIONS TAB */}
      {activeTab === "VERIFICATIONS" && (
        <div className="glass-card">
          <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Xác minh người bán & Quyền phân phối</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
            Hệ thống có 2 loại huy hiệu độc lập: <strong>Seller Verified</strong> (danh tính và quyền kiểm soát ví payout) và <strong>Rights Verified</strong> (chứng nhận quyền phân phối phần mềm/sản phẩm số).
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {sellers.map((s) => (
              <div
                key={s.id}
                style={{
                  background: "rgba(0, 0, 0, 0.25)",
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>{s.sellerProfile?.displayName || s.email}</strong>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    Email: {s.email} | Payout Wallet: <code>{s.sellerProfile?.payoutWallet}</code>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    className={`btn btn-sm ${
                      s.sellerProfile?.verifiedSellerBadge ? "btn-success" : "btn-secondary"
                    }`}
                    onClick={() =>
                      handleToggleBadge(s.id, "seller", s.sellerProfile?.verifiedSellerBadge)
                    }
                  >
                    {s.sellerProfile?.verifiedSellerBadge ? "✓ Đã cấp: Seller Badge" : "+ Cấp Seller Badge"}
                  </button>

                  <button
                    className={`btn btn-sm ${
                      s.sellerProfile?.verifiedRightsBadge ? "btn-success" : "btn-secondary"
                    }`}
                    onClick={() =>
                      handleToggleBadge(s.id, "rights", s.sellerProfile?.verifiedRightsBadge)
                    }
                  >
                    {s.sellerProfile?.verifiedRightsBadge ? "✓ Đã cấp: Rights Badge" : "+ Cấp Rights Badge"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECONCILIATION TAB */}
      {activeTab === "RECONCILIATION" && (
        <div>
          {reconciliationReport ? (
            <div className="glass-card" style={{ maxWidth: "800px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                <CheckCircle2 size={24} color="var(--success)" />
                <h3 style={{ fontSize: "1.3rem" }}>Báo cáo Đối soát Tự động Smart Contract Arc</h3>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ background: "rgba(0,0,0,0.25)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Tổng tiền Gross đã cam kết</div>
                  <div className="font-mono" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                    ${reconciliationReport.totalGrossCommittedUSDC} USDC
                  </div>
                </div>

                <div style={{ background: "rgba(0,0,0,0.25)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Tổng Rebates phân bổ</div>
                  <div className="font-mono" style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--cyan)" }}>
                    ${reconciliationReport.totalRebatesAllocatedUSDC} USDC
                  </div>
                </div>

                <div style={{ background: "rgba(0,0,0,0.25)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Tổng Doanh thu Seller phân bổ</div>
                  <div className="font-mono" style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--success)" }}>
                    ${reconciliationReport.totalSellerProceedsUSDC} USDC
                  </div>
                </div>

                <div style={{ background: "rgba(0,0,0,0.25)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Tổng Hoàn tiền phân bổ</div>
                  <div className="font-mono" style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--warning)" }}>
                    ${reconciliationReport.totalRefundsAllocatedUSDC} USDC
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderRadius: "var(--radius-md)",
                  background: reconciliationReport.conservationLawPassed
                    ? "rgba(16, 185, 129, 0.1)"
                    : "rgba(244, 63, 94, 0.1)",
                  border: `1px solid ${
                    reconciliationReport.conservationLawPassed ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"
                  }`,
                  color: reconciliationReport.conservationLawPassed ? "#6ee7b7" : "#fda4af",
                  fontSize: "0.9rem",
                }}
              >
                ⚖️ <strong>Định luật Bảo toàn Tiền tệ:</strong>{" "}
                {reconciliationReport.conservationLawPassed
                  ? "100% ĐẠT TIÊU CHUẨN. Không có bất kỳ khoản tiền nào bị phân bổ dư thừa hay rò rỉ (buyer allocation + seller gross allocation + still unallocated == committed gross)."
                  : "CẢNH BÁO: Phát hiện sai lệch số dư!"}
              </div>
            </div>
          ) : (
            <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
              Đang tính toán đối soát dữ liệu...
            </div>
          )}
        </div>
      )}

      {/* LOGS TAB */}
      {activeTab === "LOGS" && (
        <div className="glass-card">
          <h3 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Nhật ký Kiểm toán Hệ thống (Audit Trail)</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {auditLogs.map((l) => (
              <div
                key={l.id}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span className="badge" style={{ marginRight: "0.5rem", background: "rgba(255,255,255,0.06)" }}>
                    {l.action}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Actor: <code>{l.actor}</code>
                  </span>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {new Date(l.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispute Arbitration Modal */}
      {selectedDispute && (
        <div className="modal-overlay" onClick={() => setSelectedDispute(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Phán quyết Trọng tài cho Đơn #{selectedDispute.id}</h3>
            </div>
            <form onSubmit={handleResolveDispute}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
                Theo điều khoản quản trị, Operator chỉ được phân bổ chính xác khoản đang tranh chấp giữa Buyer Principal và Seller Payout Wallet. Không được chỉ định người nhận khác, thay giá/tier/phí hoặc ảnh hưởng order khác.
              </p>

              {/* Slider for conservation split */}
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <label className="form-label">Tỷ lệ phân bổ tiền tranh chấp</label>
                  <span className="font-mono">
                    Buyer: {buyerSplitPercent}% | Seller: {100 - buyerSplitPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={buyerSplitPercent}
                  onChange={(e) => setBuyerSplitPercent(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--cyan)" }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Ghi chú phán quyết của Operator</label>
                <textarea
                  className="form-textarea"
                  placeholder="Ghi nhận lý do: Seller đã bổ sung license key mới / Buyer chứng minh lỗi kỹ thuật..."
                  value={arbitrationNotes}
                  onChange={(e) => setArbitrationNotes(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setSelectedDispute(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={isArbitrating}
                >
                  {isArbitrating ? "Đang xử lý..." : "Xác nhận & Phân bổ tiền"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
