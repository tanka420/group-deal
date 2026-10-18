import {OperatorAccountProfile} from '../components/OperatorAccountProfile';
import {OperatorPermissions} from '../components/OperatorPermissions';
import {SupportPage} from './SupportPage';
import {operatorSection,operatorPath} from '../services/operatorNavigation';
import {navigateApp,readAppRoute} from '../utils/appRoute';
import {ReconciliationPanel} from "../components/ReconciliationPanel";
import {DialogSurface} from "../components/DialogSurface";
import {ManagedOrderAction,ManagedOrderActionHandle} from "../components/ManagedOrderAction";
import {TransactionHistory} from "../components/TransactionHistory";
import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import {OperatorVerifications} from '../components/OperatorVerifications';
import { OperatorDealDetail } from "../components/OperatorDealDetail";
import type { OperatorDealSelection } from "../utils/appRoute";
import {OperatorEmailOutbox} from "../components/OperatorEmailOutbox";
import {OperatorOperations} from '../components/OperatorOperations';
import {OperatorAdministration} from '../components/OperatorAdministration';
import {OperatorWorkspaceNavigation,type OperatorSection} from '../components/OperatorWorkspaceNavigation';
import {focusPageElement} from '../utils/focus';
import {OperatorAuditLog} from '../components/OperatorAuditLog';
import {OperatorLegacyReview} from '../components/OperatorLegacyReview';
import {cleanHttpsEvidenceUrl} from "../../../shared/evidence.mjs";
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

export const OperatorPortal: React.FC<{dealSelection?:OperatorDealSelection|null;onDealSelectionChange?:(selection:OperatorDealSelection|null)=>void}> = ({dealSelection,onDealSelectionChange}) => {
  const { t,language } = useLanguage();
  const { user,token } = useAuth();
  const { account } = useWeb3();

  const orderAction=useRef<ManagedOrderActionHandle>(null);
  const workspaceContent=useRef<HTMLDivElement>(null);
  const [navigationExpanded,setNavigationExpanded]=useState(false);
  const [activeTab, setActiveTab] = useState<OperatorSection>(
    dealSelection ? "DEALS" : operatorSection()
  );
  useEffect(()=>{if(dealSelection)setActiveTab("DEALS");},[dealSelection?.id,dealSelection?.view]);
  const [route,setRoute]=useState(readAppRoute);
  useEffect(()=>{const sync=()=>{setRoute(readAppRoute());setActiveTab(operatorSection());};window.addEventListener('popstate',sync);window.addEventListener('groupdeal:navigate',sync);return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('groupdeal:navigate',sync);};},[]);
  const selectSection=(section:OperatorSection)=>navigateApp(operatorPath(section));

  const [disputes, setDisputes] = useState<any[]>([]);
  const [reconciliationReport, setReconciliationReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const dataController=useRef<AbortController|null>(null);

  // Dispute Arbitration Modal
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [buyerSplitPercent, setBuyerSplitPercent] = useState<number>(50);
  const [arbitrationNotes, setArbitrationNotes] = useState("");
  const [isArbitrating, setIsArbitrating] = useState(false);

  const fetchOperatorData = () => {
    dataController.current?.abort();
    const controller=new AbortController();dataController.current=controller;setLoading(true);setLoadError(null);
    // Use the active context; admin authentication has a separate token.
    if (!token) {setLoading(false);setLoadError("Đăng nhập để tải dữ liệu operator.");return;}

    Promise.all([
      fetch("/api/operator/disputes", { signal:controller.signal, headers: { Authorization: `Bearer ${token}` } }).then(async (r) => {if(!r.ok)throw new Error("Không tải được dữ liệu. Thử lại khi kết nối ổn định.");return r.json();}
      ),
      fetch("/api/operator/reconciliation", { signal:controller.signal, headers: { Authorization: `Bearer ${token}` } }).then(
        async (r) => {if(!r.ok)throw new Error("Không tải được dữ liệu. Thử lại khi kết nối ổn định.");return r.json();}
      ),
    ])
      .then(([dData, rData]) => {
        if(controller.signal.aborted)return;
        setDisputes(dData.disputes || []);
        setReconciliationReport(rData.report || null);
      })
      .catch((e) => {if(!controller.signal.aborted)setLoadError(e.message);})
      .finally(() => {if(!controller.signal.aborted)setLoading(false);});
  };

  useEffect(() => {
    fetchOperatorData();
    return()=>dataController.current?.abort();
  }, [user]);

  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();if(!selectedDispute||!account)return;
    setIsArbitrating(true);
    try{
      const prepared=await orderAction.current?.begin(selectedDispute.id,account,{action:"RESOLVE",buyerPercent:buyerSplitPercent,notes:arbitrationNotes});
      if(prepared){setSelectedDispute(null);setArbitrationNotes("");}
    }finally{setIsArbitrating(false);}
  };

  return (
    <div className="app-page operator-portal">
      {loadError&&<div role="alert" className="notice notice-error">{language==="en"?"Operator data could not be loaded. Retry when the connection is stable.":loadError}<button className="btn btn-secondary" onClick={fetchOperatorData}>{language==="en"?"Retry":"Thử lại"}</button></div>}
      <div className="workspace-heading">
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "0.25rem" }}>{activeTab==='VERIFICATIONS'?(language==='en'?'Verifications and rights':'Xác minh và bản quyền'):t("operatorTitle")}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            {language==="en"?"Review deals, distribution rights, disputes and financial reconciliation.":"Kiểm tra deal, quyền phân phối, tranh chấp và đối soát tài chính."}
          </p>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={fetchOperatorData}>
          <RefreshCw size={15} /> {language==="en"?"Refresh data":"Làm mới dữ liệu"}
        </button>
      </div>

      {loading&&<p role="status">{language==="en"?"Loading operator data…":"Đang tải dữ liệu operator…"}</p>}
      <div className={'operator-workspace'+(navigationExpanded?' is-navigation-expanded':'')}>
      <OperatorWorkspaceNavigation active={activeTab} disputeCount={!loading&&!loadError?disputes.length:'—'} expanded={navigationExpanded} onToggle={()=>setNavigationExpanded(value=>!value)} onChange={section=>{selectSection(section);requestAnimationFrame(()=>focusPageElement(workspaceContent.current));}}/>
      <div ref={workspaceContent} id="operator-workspace-content" className="operator-workspace-content" role="region" aria-label={language==='en'?'Operator workspace content':'Nội dung workspace operator'} tabIndex={-1} data-section={activeTab}>

      {/* DISPUTES TAB */}
      {activeTab === "DEALS" && <OperatorDealDetail selection={dealSelection} onSelectionChange={onDealSelectionChange} onReconcile={() => selectSection("RECONCILIATION")} onDisputes={() => selectSection("DISPUTES")} onAudit={() => selectSection("LOGS")} onReviewDispute={order=>{setBuyerSplitPercent(50);setArbitrationNotes("");setSelectedDispute(order);}}/>}
      {activeTab === "OUTBOX"&&token&&user&&<OperatorEmailOutbox key={'outbox:'+user.id} token={token} userId={user.id}/>}
      {activeTab==='OPERATIONS'&&token&&user&&<OperatorOperations key={'operations:'+user.id} token={token} userId={user.id}/>}
      {activeTab==='LEGACY'&&token&&user&&<OperatorLegacyReview key={'legacy:'+user.id} token={token} userId={user.id}/>}
      {activeTab==='PERMISSIONS'&&token&&user&&<OperatorPermissions key={user.id} token={token} userId={user.id}/>}
      {activeTab==='SUPPORT'&&<SupportPage key={JSON.stringify([user?.id,token,route])} route={route.kind==='operator-support'?'support-'+route.path.replace('tickets/','ticket-').replace('orders/','order-'):'support'}/>}
      {activeTab==='USERS'&&route.kind==='operator-user'&&token&&user&&<OperatorAccountProfile key={JSON.stringify([user.id,token,route.id])} token={token} userId={user.id} target={route.id}/>}
      {(activeTab==='USERS'&&route.kind!=='operator-user'||activeTab==='SETTINGS')&&token&&user&&<OperatorAdministration key={activeTab+':'+user.id} token={token} userId={user.id} mode={activeTab==='USERS'?'users':'settings'}/>}
      {!loading && !loadError && activeTab === "DISPUTES" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {disputes.length === 0 ? (
            <div className="glass-card ui-state">
              <CheckCircle2 size={32} color="var(--success)" style={{ margin: "0 auto 0.75rem" }} />
              <div style={{ fontWeight: 600 }}>{language==="en"?"No open disputes":"Không có tranh chấp nào đang mở"}</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                {language==="en"?"No open disputes were found in the loaded data.":"Chưa ghi nhận tranh chấp đang mở trong dữ liệu vừa tải."}
              </p>
            </div>
          ) : (
            disputes.map((d) => {

              return (
                <div key={d.id} className="glass-card ui-record-card" style={{ padding: "1.5rem" }}>
                  <div className="ui-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <div>
                      <span className="badge" style={{ background: "rgba(244,63,94,0.15)", color: "var(--danger)", marginBottom: "0.4rem" }}>
                        {language==="en"?"Order dispute":"Tranh chấp đơn"} #{d.id}
                      </span>
                      <h3 style={{ fontSize: "1.2rem" }}>{d.campaignTitle}</h3>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                        {language==="en"?"Buyer principal:":"Ví principal buyer:"} <code>{d.buyerPrincipal}</code> | {language==="en"?"Seller payout wallet:":"Ví nhận tiền seller:"} <code>{d.sellerPayoutWallet}</code>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{language==="en"?"Onchain allocation":"Khoản chia trên chain"}</div>
                      <div className="font-mono" style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--cyan)" }}>
                        {language==="en"?"Review the quote before signing":"Kiểm tra quote trước khi ký"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--bg-tertiary)",
                      padding: "1rem",
                      borderRadius: "var(--radius-md)",
                      marginBottom: "1rem",
                      fontSize: "0.88rem",
                    }}
                  >
                    <strong>{language==="en"?"Buyer reason:":"Lý do từ buyer:"}</strong> {d.disputeReason || (language==="en"?"Not provided":"Không nêu rõ")}
                    {d.disputeEvidence && d.disputeEvidence.length > 0 && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <strong>{language==="en"?"Attached evidence:":"Bằng chứng đính kèm:"}</strong>{" "}
                        {cleanHttpsEvidenceUrl(d.disputeEvidence[0])?<a href={cleanHttpsEvidenceUrl(d.disputeEvidence[0])!} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>
                          {language==="en"?"Open evidence link":"Xem link bằng chứng"}
                        </a>:<span>{language==="en"?"This legacy evidence link needs review and has not been opened.":"Link bằng chứng cũ cần kiểm tra; chưa mở liên kết."}</span>}
                      </div>
                    )}
                  </div>

                  <button className="btn btn-primary" onClick={() => setSelectedDispute(d)}>
                    <Scale size={16} /> {language==="en"?"Arbitrate and review allocation":"Phán quyết & Phân bổ tiền (Arbitrate)"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VERIFICATIONS TAB */}
      {activeTab === "VERIFICATIONS" && (
        <OperatorVerifications/>
      )}

      {/* RECONCILIATION TAB */}
      {!loading && !loadError && activeTab === "RECONCILIATION" && <ReconciliationPanel report={reconciliationReport}/>}

      {activeTab==='LOGS'&&token&&user&&<OperatorAuditLog key={'audit:'+user.id} token={token} userId={user.id}/> }

      <ManagedOrderAction ref={orderAction} onRecovered={fetchOperatorData}/>
      {['DISPUTES','OPERATIONS'].includes(activeTab)&&<TransactionHistory key={'transaction-history:'+user?.id} onRecovered={fetchOperatorData}/>}
      {/* Dispute Arbitration Modal */}
      {selectedDispute && (
        <DialogSurface label={language==="en"?"Review dispute allocation":"Xem phân bổ tranh chấp"} onClose={() => setSelectedDispute(null)}>
          <div  >
            <div className="modal-header">
              <h3>{language==="en"?"Arbitration for order":"Phán quyết Trọng tài cho Đơn"} #{selectedDispute.id}</h3>
            </div>
            <form onSubmit={handleResolveDispute}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
                {language==="en"?"The operator may allocate only the disputed amount between the buyer principal and the seller payout wallet. Other recipients, prices, tiers, fees and orders cannot be changed.":"Theo điều khoản quản trị, Operator chỉ được phân bổ chính xác khoản đang tranh chấp giữa Buyer Principal và Seller Payout Wallet. Không được chỉ định người nhận khác, thay giá/tier/phí hoặc ảnh hưởng order khác."}
              </p>

              {/* Slider for conservation split */}
              <div className="form-group">
                <div className="ui-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <label className="form-label" htmlFor="resolve-buyer-percent">{language==="en"?"Disputed amount allocation":"Tỷ lệ phân bổ tiền tranh chấp"}</label>
                  <span className="font-mono">
                    Buyer: {buyerSplitPercent}% | Seller: {100 - buyerSplitPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  id="resolve-buyer-percent"
                  min="0"
                  max="100"
                  step="1"
                  value={buyerSplitPercent}
                  onChange={(e) => setBuyerSplitPercent(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--cyan)" }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="resolve-notes">{language==="en"?"Operator decision notes":"Ghi chú phán quyết của Operator"}</label>
                <textarea
                  className="form-textarea"
                  id="resolve-notes"
                  placeholder={language==="en"?"Explain the decision, for example a replacement license key or evidence of a technical issue…":"Ghi nhận lý do: Seller đã bổ sung license key mới / Buyer chứng minh lỗi kỹ thuật..."}
                  maxLength={4000}
                  value={arbitrationNotes}
                  onChange={(e) => setArbitrationNotes(e.target.value)}
                  required
                />
              </div>

              <div className="ui-row" style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setSelectedDispute(null)}
                >
                  {language==="en"?"Cancel":"Hủy"}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={isArbitrating||!account}
                >
                  {isArbitrating ? (language==="en"?"Preparing review…":"Đang xử lý...") : (language==="en"?"Review onchain allocation":"Kiểm tra khoản chia trên chain")}
                </button>
              </div>
            </form>
          </div>
        </DialogSurface>
      )}
      </div>
      </div>
    </div>
  );
};
