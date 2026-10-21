import {ManagedOrderAction,ManagedOrderActionHandle} from "../components/ManagedOrderAction";
import {PriceDisplay} from "../components/DealPresentation";
import {DialogSurface} from "../components/DialogSurface";
import {ManagedClaim} from "../components/ManagedClaim";
import {cleanHttpsEvidenceUrl} from "../../../shared/evidence.mjs";
import {TransactionHistory} from "../components/TransactionHistory";
import {OrderReference} from '../components/OrderReference';
import {OrderList} from '../components/OrderList';
import {formatOrderDate} from '../services/orderList';
import {OrderConversation} from '../components/OrderConversation';
import {OrderDisputeSummary} from '../components/OrderDisputeSummary';
import '../styles/orders.css';
import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { displayUSDC } from "../services/orderAccounting";
import {buyerOrderAmounts,orderMoney,deliveryStatusText,recordedDeadline,canCheckDeliverySla} from '../services/buyerOrderPresentation';
import { BuyerResources } from "../components/BuyerResources";
import {ProviderEntitlementContent} from '../components/ProviderEntitlementContent';
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

export const BuyerDashboard: React.FC<{selectedOrderId?:string}> = ({selectedOrderId}) => {
  const { t, language } = useLanguage();
  const text=(vi:string,en:string)=>language==="en"?en:vi;
  const { user,token,getSessionEpoch } = useAuth();
  const {
    account,
    hubAddress,
  } = useWeb3();

  const orderAction=useRef<ManagedOrderActionHandle>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const dataController=useRef<AbortController|null>(null);
  const [ordersOwner,setOrdersOwner]=useState({userId:user?.id,token});
  const ordersVisible=ordersOwner.userId===user?.id&&ordersOwner.token===token;
  const visibleOrders=ordersVisible?orders:[];
  const detailOrders=selectedOrderId?visibleOrders.filter(o=>o.id===selectedOrderId):[];
  const returnTo=new URLSearchParams(window.location.search).get('returnTo');
  const backHref=returnTo&&/^\/orders(?:\?|$)/.test(returnTo)?returnTo:'/orders';

  // Entitlement Reveal State
  const [revealedEntitlements, setRevealedEntitlements] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealScope,setRevealScope]=useState<{userId:string;token:string}|null>(null);
  const [revealErrors,setRevealErrors]=useState<Record<string,boolean>>({});
  const [revealing,setRevealing]=useState<Record<string,boolean>>({});
  const revealRequests=useRef(new Map<string,AbortController>()),scopeRef=useRef({userId:user?.id,token});scopeRef.current={userId:user?.id,token};
  useEffect(()=>{for(const request of revealRequests.current.values())request.abort();revealRequests.current.clear();setRevealedEntitlements({});setRevealScope(null);setRevealErrors({});setRevealing({});setCopiedId(null);return()=>{for(const request of revealRequests.current.values())request.abort();revealRequests.current.clear();};},[user?.id,token]);

  // Dispute Modal State
  const [disputeModalOrder, setDisputeModalOrder] = useState<any | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

  // Review Modal State
  const [reviewModalOrder, setReviewModalOrder] = useState<any | null>(null);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError,setReviewError]=useState(false),[disputeFieldErrors,setDisputeFieldErrors]=useState<{reason?:boolean;evidence?:boolean}>({});
  const disputeReasonInput=useRef<HTMLTextAreaElement>(null),disputeEvidenceInput=useRef<HTMLInputElement>(null);
  const reviewRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>reviewRequest.current?.abort(),[user?.id,token]);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const reviewDrafts=useRef(new Map<string,{score:number;comment:string;uncertain:boolean}>());
  const disputeDrafts=useRef(new Map<string,{reason:string;evidence:string}>());
  const closeReview=()=>{if(reviewModalOrder)reviewDrafts.current.set(reviewModalOrder.id,{score:reviewScore,comment:reviewComment,uncertain:isSubmittingReview||reviewError});reviewRequest.current?.abort();reviewRequest.current=null;setIsSubmittingReview(false);setReviewModalOrder(null);};
  const closeDispute=()=>{if(disputeModalOrder)disputeDrafts.current.set(disputeModalOrder.id,{reason:disputeReason,evidence:disputeEvidence});setDisputeModalOrder(null);};

  const fetchOrders = () => {
    dataController.current?.abort();const controller=new AbortController();dataController.current=controller;
    const owner={userId:user?.id,token};setOrdersOwner(owner);setLoading(true);setLoadError(null);setOrders([]);
    if(!user?.id||!token){setLoading(false);return;}
    const epoch=getSessionEpoch(),timer=setTimeout(()=>controller.abort(),15000),current=()=>dataController.current===controller&&scopeRef.current.userId===owner.userId&&scopeRef.current.token===owner.token&&getSessionEpoch()===epoch;
    fetch('/api/orders/buyer',{signal:controller.signal,headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store'})
      .then(async r=>{if(!r.ok)throw Error('ORDER_VIEW_UNAVAILABLE');return r.json();})
      .then(data=>{if(controller.signal.aborted||!current())return;if(!Array.isArray(data.orders)||data.buyerAccountId!==undefined&&data.buyerAccountId!==owner.userId||data.orders.some((o:any)=>!o||typeof o.id!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(o.id)||['constructor','__proto__','prototype'].includes(o.id)||o.buyerAccountId!==undefined&&o.buyerAccountId!==owner.userId)||new Set(data.orders.map((o:any)=>o.id)).size!==data.orders.length)throw Error('ORDER_VIEW_INVALID');setOrders(data.orders);for(const o of data.orders){const saved=reviewDrafts.current.get(o.id);if(o.review)reviewDrafts.current.delete(o.id);else if(saved)saved.uncertain=false;}})
      .catch(()=>{if(current())setLoadError('ORDER_VIEW_UNAVAILABLE');})
      .finally(()=>{clearTimeout(timer);if(current())setLoading(false);});
  };
  useEffect(()=>{fetchOrders();return()=>{dataController.current?.abort();dataController.current=null;};},[user?.id,token,account]);
  useEffect(()=>{setDisputeModalOrder(null);setDisputeFieldErrors({});setReviewError(false);setDisputeReason('');setDisputeEvidence('');setReviewModalOrder(null);setIsSubmittingReview(false);setIsSubmittingDispute(false);setReviewComment('');reviewDrafts.current.clear();disputeDrafts.current.clear();},[user?.id,token]);

  // Decrypt entitlement secret
  const handleReveal = async (orderId: string) => {
    if(!user?.id||!token||revealRequests.current.has(orderId))return;
    const owner={userId:user.id,token},epoch=getSessionEpoch(),controller=new AbortController();revealRequests.current.set(orderId,controller);const timer=setTimeout(()=>controller.abort(),15000);
    const current=()=>scopeRef.current.userId===owner.userId&&scopeRef.current.token===owner.token&&getSessionEpoch()===epoch;
    setRevealErrors(v=>({...v,[orderId]:false}));setRevealing(v=>({...v,[orderId]:true}));
    try {
      const res = await fetch(`/api/orders/${orderId}/entitlement`, {
        signal:controller.signal,redirect:'error',cache:'no-store',headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok||typeof data.entitlement!=='string'||!data.entitlement)throw Error();
      if(controller.signal.aborted||!current())return;
      setRevealScope(owner);
      setRevealedEntitlements((prev) => ({ ...prev, [orderId]: data.entitlement }));
    } catch {if(current())setRevealErrors(v=>({...v,[orderId]:true}));}
    finally{clearTimeout(timer);if(revealRequests.current.get(orderId)===controller){revealRequests.current.delete(orderId);if(current())setRevealing(v=>({...v,[orderId]:false}));}}
  };

  // Copy to clipboard helper
  const handleCopy = async (orderId: string, content: string) => {
    const epoch=getSessionEpoch();try{await navigator.clipboard.writeText(content);if(getSessionEpoch()===epoch){setCopiedId(orderId);setTimeout(()=>{if(getSessionEpoch()===epoch)setCopiedId(null);},2500);}}catch{if(getSessionEpoch()===epoch)setRevealErrors(v=>({...v,[orderId]:true}));}
  };

  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!disputeModalOrder)return;
    const errors={reason:!disputeReason.trim()||disputeReason.length>4000,evidence:!!disputeEvidence&&(disputeEvidence.length>2000||!cleanHttpsEvidenceUrl(disputeEvidence))};
    setDisputeFieldErrors(errors);if(errors.reason||errors.evidence){(errors.reason?disputeReasonInput.current:disputeEvidenceInput.current)?.focus();return;}
    const owner={userId:user?.id,token},epoch=getSessionEpoch(),current=()=>scopeRef.current.userId===owner.userId&&scopeRef.current.token===owner.token&&getSessionEpoch()===epoch;
    setIsSubmittingDispute(true);
    try{
      const prepared=await orderAction.current?.begin(disputeModalOrder.id,disputeModalOrder.buyerPrincipal,{action:"DISPUTE",reason:disputeReason,evidenceUrls:disputeEvidence?[disputeEvidence]:[]});
      if(prepared&&current()){disputeDrafts.current.delete(disputeModalOrder.id);setDisputeModalOrder(null);setDisputeReason("");setDisputeEvidence("");}
    }finally{if(current())setIsSubmittingDispute(false);}
  };

  // Submit Review
  const handleSubmitReview=async(e:React.FormEvent)=>{
    e.preventDefault();if(!reviewModalOrder||!user?.id||!token||isSubmittingReview||reviewRequest.current)return;
    const owner={userId:user.id,token},epoch=getSessionEpoch(),controller=new AbortController();reviewRequest.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
    const current=()=>reviewRequest.current===controller&&scopeRef.current.userId===owner.userId&&scopeRef.current.token===owner.token&&getSessionEpoch()===epoch;
    setIsSubmittingReview(true);setReviewError(false);
    try{
      const res=await fetch('/api/orders/'+encodeURIComponent(reviewModalOrder.id)+'/review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({score:reviewScore,comment:reviewComment}),signal:controller.signal,redirect:'error',cache:'no-store'});
      const data=await res.json();if(!res.ok||data?.success!==true)throw Error('REVIEW_UNAVAILABLE');if(controller.signal.aborted||!current())return;
      reviewDrafts.current.delete(reviewModalOrder.id);setReviewModalOrder(null);setReviewComment('');fetchOrders();
    }catch{if(current())setReviewError(true);}finally{clearTimeout(timer);if(reviewRequest.current===controller){const stillCurrent=current();reviewRequest.current=null;if(stillCurrent)setIsSubmittingReview(false);}}
  };

  // Calculate total claimables
  let totalClaimableRebates = 0n;
  let totalClaimableRefunds = 0n;
  let amountsKnown=!!user?.id&&!!token&&ordersVisible&&!loading&&!loadError;
  (selectedOrderId?detailOrders:visibleOrders).forEach(o=>{const amounts=buyerOrderAmounts(o);if(amounts.remaining===null){amountsKnown=false;return;}totalClaimableRebates+=amounts.unpaidRebate;totalClaimableRefunds+=amounts.unpaidRefund;});
  if(selectedOrderId&&!detailOrders.length)amountsKnown=false;
  return (
    <div className="app-page buyer-dashboard">
      {selectedOrderId&&<a className="btn btn-secondary" href={backHref}>{text('Quay lại danh sách đơn','Back to orders')}</a>}
      {loadError&&<div role="alert" className="notice notice-error">{text("Không tải được dữ liệu. Thử lại khi kết nối ổn định.","Unable to load orders. Retry when your connection is stable.")}<button className="btn btn-secondary" onClick={fetchOrders}>{text("Thử lại","Retry")}</button></div>}
      <div className="workspace-heading">
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "0.25rem" }}>{selectedOrderId?text('Chi tiết đơn hàng','Order details'):text('Đơn hàng','Orders')}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            {text("Theo dõi đơn, nhận tài nguyên số và kiểm tra rebate, hoàn tiền đã phân bổ.","Track orders, access digital resources and check allocated rebates and refunds.")}
          </p>
        </div>
        <div className="action-row"><a className="btn btn-primary" href="#explore">{text("Khám phá deal","Explore deals")}</a><a className="btn btn-secondary" href="#support">{text("Ticket hỗ trợ","Support tickets")}</a></div>
      </div>

      {/* Overview Balance Cards */}
      <p className="muted">{selectedOrderId?text('Khoản được phân bổ cho đơn đang xem.','Allocations for the selected order.'):text('Tổng khoản được phân bổ của tất cả đơn trong tài khoản; không đổi theo bộ lọc danh sách.','Total allocations across your account orders; list filters do not change these totals.')}</p>
      <div className="ui-stat-grid">
        <div className="glass-card" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
            {t("claimableRebate")}
          </div>
          <div className="ui-stat-value" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--cyan)" }}>
            {amountsKnown?<PriceDisplay amount={totalClaimableRebates.toString()}/>:text("Chưa xác minh","Unverified")}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
            {text("Khoản còn lại cần claim về ví sau khi được phân bổ.","Claim the remaining allocation to your wallet.")}
          </div>
        </div>

        <div className="glass-card" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
            {t("claimableRefund")}
          </div>
          <div className="ui-stat-value" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)" }}>
            {amountsKnown?<PriceDisplay amount={totalClaimableRefunds.toString()}/>:text("Chưa xác minh","Unverified")}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
            {text("Hoàn tiền đã phân bổ do vi phạm SLA hoặc phán quyết; chưa tự chuyển về ví.","Refund allocations from SLA breaches or arbitration; funds are not automatically sent to your wallet.")}
          </div>
        </div>
      </div>

      {/* Orders List */}
      {(!user?.id||!token)?<p role="status">{text('Đăng nhập để xem đơn và quyền truy cập của bạn.','Sign in to view your orders and resource access.')}</p>:(!ordersVisible||loading) ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
          {text("Đang tải danh sách đơn hàng…","Loading orders…")}
        </div>
      ) : loadError ? null : visibleOrders.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            {text("Bạn chưa có đơn cam kết mua nào. Khám phá các deal đang mở để bắt đầu.","You have no purchase commitments yet. Explore open deals to get started.")}
          </p>
        </div>
      ) : !selectedOrderId ? <OrderList orders={visibleOrders}/> : !detailOrders.length ? <p role="status">{text('Không tìm thấy đơn trong tài khoản này. Kiểm tra mã đơn và tài khoản đăng nhập.','This order was not found in your account. Check the order ID and signed-in account.')}</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {detailOrders.map((o) => {
            const lockedPrice=orderMoney(o.lockedUnitPrice)??text("Chưa xác minh","Unverified");
            const gross=orderMoney(o.committedGross)??text("Chưa xác minh","Unverified");
            const {rebate,refund,remaining:buyerClaimable}=buyerOrderAmounts(o);
            const isRevealed = revealScope?.userId===user?.id&&revealScope?.token===token&&!!revealedEntitlements[o.id];

            return (
              <div key={o.id} className="glass-card ui-record-card" style={{ padding: "1.5rem" }}>
                <div className="ui-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                      <OrderReference id={o.id}/> • <a href={'/deals/'+encodeURIComponent(o.campaignId)}>{text('Chiến dịch #','Campaign #')}{o.campaignId}</a>
                    </div>
                    <h3 style={{ fontSize: "1.2rem", marginBottom: "0.3rem" }}>
                      {o.campaignTitle}
                    </h3>
                    <p className="muted">{text('Ngày ghi nhận đơn: ','Order recorded: ')}{formatOrderDate(o.createdAt,language)}</p>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {text('Số lượng: ','Quantity: ')}<strong>{Number.isSafeInteger(o.quantity)&&o.quantity>0?o.quantity:text('Chưa xác minh','Unverified')} {text('đơn vị','units')}</strong> | {text('Đơn giá khóa: ','Locked unit price: ')}<strong>{lockedPrice} USDC</strong> | {text('Tổng cam kết: ','Gross committed: ')}<strong>{gross} USDC</strong>
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
                      {deliveryStatusText(o.deliveryStatus,language)}
                    </span>
                  </div>
                </div>

                {o.deliveryStatus==='DELIVERED'&&<p className="notice">{recordedDeadline(o.disputeDeadline)!==null?text('Hạn tranh chấp ghi nhận: ','Recorded dispute deadline: ')+formatOrderDate(o.disputeDeadline*1000,language):text('Chưa có thời hạn tranh chấp đã ghi nhận.','No recorded dispute deadline is available.')} {text('Khi chuẩn bị thao tác, hệ thống kiểm tra lại trạng thái và cửa sổ trên chain.','Preparing an action rechecks its current chain state and window.')}</p>}
                {/* Delivered Entitlement Box */}
                {o.managedResourceDelivery && <BuyerResources orderId={o.id}/>}
                {o.hasEntitlement && !o.managedResourceDelivery && (
                  <div
                    style={{
                      background: "rgba(6, 182, 212, 0.08)",
                      border: "1px solid rgba(6, 182, 212, 0.25)",
                      borderRadius: "var(--radius-md)",
                      padding: "1rem 1.25rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div className="ui-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span className="ui-row" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--cyan)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <KeyRound size={16} /> {text('Quyền truy cập số bảo mật','Protected digital access')}
                      </span>
                      {!isRevealed ? (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={!!revealing[o.id]}
                          onClick={() => handleReveal(o.id)}
                        >
                          {revealing[o.id]?text('Đang tải…','Loading…'):text('Giải mã & Xem nội dung','Reveal access details')}
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleCopy(o.id, revealedEntitlements[o.id])}
                        >
                          {copiedId === o.id ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                          {copiedId === o.id ? text('Đã sao chép','Copied') : text('Sao chép','Copy')}
                        </button>
                      )}
                    </div>
                    {revealErrors[o.id]&&<p role="alert">{text('Chưa đọc hoặc sao chép được quyền truy cập. Kiểm tra phiên đăng nhập, rồi thử lại.','Access details could not be read or copied. Check your session, then retry.')}</p>}

                    {isRevealed && (
                      <div
                        className="font-mono"
                        style={{
                          background: "var(--bg-tertiary)",
                          padding: "0.75rem 1rem",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.9rem",
                          wordBreak: "break-all",
                          color: "var(--text-primary)",
                        }}
                      >
                        <ProviderEntitlementContent content={revealedEntitlements[o.id]} orderId={o.id} buyerPrincipal={o.buyerPrincipal} quantity={o.quantity}/>
                      </div>
                    )}
                  </div>
                )}

                {/* Claimable Balance Bar & Action Buttons */}
                <div className="ui-row"
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
                  <div className="ui-row" style={{ display: "flex", gap: "1.25rem", fontSize: "0.85rem" }}>
                    {rebate !== null&&rebate > 0n && (
                      <div>
                        Rebate: <strong style={{ color: "var(--cyan)" }}>{displayUSDC(rebate)} USDC</strong>
                      </div>
                    )}
                    {refund !== null&&refund > 0n && (
                      <div>
                        {text('Hoàn tiền: ','Refund allocated: ')}<strong style={{ color: "var(--success)" }}>{displayUSDC(refund)} USDC</strong>
                      </div>
                    )}
                  </div>

                  <div className="ui-row" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {/* Pull Claim Button */}
                    {buyerClaimable !== null && buyerClaimable > 0n && (
                      <ManagedClaim action="BUYER_CLAIM" campaignId={o.campaignId} orderId={o.id} principal={o.buyerPrincipal} amount={buyerClaimable} onClaimed={fetchOrders}/>
                    )}
                    {buyerClaimable === null && <span role="status">{text('Đang chờ xác minh số tiền đã rút; chưa thể tính khoản còn lại.','Claimed amounts are unverified; the remaining balance cannot be calculated.')}</span>}

                    {canCheckDeliverySla(o,Math.floor(Date.now()/1000)) && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => void orderAction.current?.begin(o.id,o.buyerPrincipal,{action:"BREACH"})}
                        >
                          <ShieldAlert size={14} /> {text('Kiểm tra giao quá SLA trên Arc','Check overdue delivery on Arc')}
                        </button>
                      )}

                    {/* Confirm receipt early */}
                    {o.deliveryStatus === "DELIVERED" && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => void orderAction.current?.begin(o.id,o.buyerPrincipal,{action:"CONFIRM"})}
                      >
                        <CheckCircle2 size={14} color="var(--success)" /> {t("confirmReceipt")}
                      </button>
                    )}

                    {/* Open dispute */}
                    {o.deliveryStatus === "DELIVERED" && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => {const saved=disputeDrafts.current.get(o.id);setDisputeModalOrder(o);setDisputeReason(saved?.reason||'');setDisputeEvidence(saved?.evidence||'');setDisputeFieldErrors({});}}
                        style={{ borderColor: "rgba(244, 63, 94, 0.4)", color: "var(--danger)" }}
                      >
                        <AlertTriangle size={14} /> {t("openDispute")}
                      </button>
                    )}

                    {/* Support Messages thread */}
                    <a className="btn btn-sm btn-secondary" href={'/support/orders/'+encodeURIComponent(o.id)}><MessageSquare size={14}/>{text('Ticket hỗ trợ đơn','Order support ticket')}</a>

                    {/* Leave Review */}
                    {(o.deliveryStatus === "DELIVERED" || o.deliveryStatus === "CONFIRMED") && !o.review && (
                      <button className="btn btn-sm btn-secondary" onClick={() => {const saved=reviewDrafts.current.get(o.id);setReviewModalOrder(o);setReviewScore(saved?.score||5);setReviewComment(saved?.comment||'');setReviewError(saved?.uncertain||false);}}>
                        <Star size={14} color="var(--warning)" /> {t("rateSeller")}
                      </button>
                    )}
                  </div>
                </div>

                {o.review&&<section className="order-review" aria-label={text('Đánh giá đã gửi','Submitted review')}><h4>{text('Đánh giá của bạn','Your review')} · {Number.isInteger(o.review.score)&&o.review.score>=1&&o.review.score<=5?o.review.score:'—'}/5</h4><p>{typeof o.review.comment==='string'?o.review.comment:text('Chưa tải được nội dung đánh giá.','Review content is unavailable.')}</p>{typeof o.review.sellerResponse==='string'&&o.review.sellerResponse&&<><strong>{text('Người bán phản hồi','Seller response')}</strong><p>{o.review.sellerResponse}</p></>}</section>}
                <OrderDisputeSummary order={o}/><OrderConversation key={o.id+':'+getSessionEpoch()} orderId={o.id}/>

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
                    {Number.isSafeInteger(o.onchainCampaignId)&&o.onchainCampaignId>0&&Number.isSafeInteger(o.onchainOrderId)&&o.onchainOrderId>0?<>
                      🛡️ <strong>{text('Thông tin dispute trực tiếp:','Direct dispute information:')}</strong> {text('Principal','Principal')} <code>{o.buyerPrincipal}</code> · <code>openDispute(campaignId: {o.onchainCampaignId}, orderId: {o.onchainOrderId}, reasonHash)</code> · Arc Testnet · Hub <code>{hubAddress}</code>. {text('Công cụ độc lập phải xác minh order, principal và cửa sổ trên chain trước khi ký. Giữ lý do và bằng chứng riêng.','The independent tool must verify the order, principal and chain window before signing. Keep the reason and evidence private.')}
                      <a href="/fallback.html" target="_blank" rel="noreferrer">{text('Mở công cụ external độc lập','Open independent external tool')}</a>
                    </>:text('Chưa xác minh được ID campaign/order trên chain để chuẩn bị dispute trực tiếp.','Onchain campaign/order IDs are unverified for direct dispute preparation.')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ManagedOrderAction key={user?.id+'-'+(user&&token?getSessionEpoch():0)} ref={orderAction} onRecovered={fetchOrders}/>
      <TransactionHistory key={user?.id} onRecovered={fetchOrders}/>

      {/* Dispute Modal */}
      {ordersVisible&&disputeModalOrder && (
        <DialogSurface label={language==="en"?"Open order dispute":"Mở tranh chấp đơn"} onClose={closeDispute}>
          <div  >
            <div className="modal-header">
              <h3 className="ui-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={20} color="var(--danger)" />
                {text('Mở tranh chấp đơn hàng #','Open dispute for order #')}{disputeModalOrder.id}
              </h3>
            </div>
            <form noValidate onSubmit={handleOpenDispute}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
                {text('Sau receipt tranh chấp hợp lệ, phần chưa phân bổ chờ trọng tài theo quy tắc hợp đồng. Rebate đã phân bổ và lịch sử claim được giữ nguyên.','After a verified dispute receipt, the unallocated amount awaits arbitration under the contract rules. Existing rebate allocations and claim history remain intact.')}
              </p>
              <div className="form-group">
                <label className="form-label" htmlFor="dispute-reason">{text("Lý do tranh chấp","Dispute reason")}</label>
                <textarea
                  className="form-textarea"
                  id="dispute-reason"
                  ref={disputeReasonInput}
                  aria-invalid={!!disputeFieldErrors.reason}
                  aria-describedby={disputeFieldErrors.reason?'dispute-reason-error':undefined}
                  placeholder={text('Mô tả sự cố: Mã bản quyền không kích hoạt được, link tải bị hỏng…','Describe the issue: license activation failed, download link broken…')}
                  value={disputeReason}
                  onChange={(e) => {setDisputeReason(e.target.value);setDisputeFieldErrors(v=>({...v,reason:false}));}}
                  required
                  maxLength={4000}
                />
                {disputeFieldErrors.reason&&<p role="alert" id="dispute-reason-error">{text('Nhập lý do có nội dung, tối đa 4000 ký tự.','Enter a reason with content, up to 4000 characters.')}</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dispute-evidence">{text("Link ảnh chụp màn hình bằng chứng (tùy chọn)","HTTPS evidence link (optional)")}</label>
                <input
                  type="url"
                  id="dispute-evidence"
                  ref={disputeEvidenceInput}
                  aria-invalid={!!disputeFieldErrors.evidence}
                  aria-describedby={disputeFieldErrors.evidence?'dispute-evidence-error':undefined}
                  maxLength={2000}
                  pattern="https://.*"
                  className="form-input"
                  placeholder={text('Link HTTPS không chứa thông tin đăng nhập','HTTPS link without credentials')}
                  value={disputeEvidence}
                  onChange={(e) => {setDisputeEvidence(e.target.value);setDisputeFieldErrors(v=>({...v,evidence:false}));}}
                />
                {disputeFieldErrors.evidence&&<p role="alert" id="dispute-evidence-error">{text('Dùng link HTTPS không có thông tin đăng nhập, tối đa 2000 ký tự.','Use an HTTPS link without credentials, up to 2000 characters.')}</p>}
              </div>
              <div className="ui-row order-dialog-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeDispute}
                >
                  {text('Hủy','Cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isSubmittingDispute}
                >
                  {isSubmittingDispute?text('Đang kiểm tra…','Checking…'):text('Kiểm tra và lưu bằng chứng','Check and save evidence')}
                </button>
              </div>
            </form>
          </div>
        </DialogSurface>
      )}

      {/* Review Modal */}
      {ordersVisible&&reviewModalOrder && (
        <DialogSurface label={language==="en"?"Review seller":"Đánh giá seller"} onClose={closeReview}>
          <div  >
            <div className="modal-header">
              <h3>{text('Đánh giá người bán cho đơn #','Review seller for order #')}{reviewModalOrder.id}</h3>
            </div>
            <form onSubmit={handleSubmitReview}>{reviewError&&<p role="alert">{text('Chưa xác nhận đánh giá. Tải lại đơn để kiểm tra trước khi gửi lại.','Review acknowledgement is unavailable. Reload the order to check before resubmitting.')} <button type="button" className="btn btn-secondary" onClick={()=>{closeReview();fetchOrders();}}>{text('Tải lại đơn','Reload order')}</button></p>}
              <div className="form-group">
                <label className="form-label">{text("Số sao đánh giá (1-5)","Rating (1–5 stars)")}</label>
                <div className="ui-row" style={{ display: "flex", gap: "0.5rem" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      aria-label={text(`${star} sao`, `${star} stars`)}
                      aria-pressed={reviewScore === star}
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
                <label className="form-label" htmlFor="review-comment">{text("Nhận xét chi tiết","Review comment")}</label>
                <textarea
                  id="review-comment"
                  className="form-textarea"
                  maxLength={4000} placeholder={text('Chia sẻ trải nghiệm sản phẩm và giao hàng','Share your product and delivery experience')}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  required
                />
              </div>
              <div className="ui-row order-dialog-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeReview}
                >
                  {text('Hủy','Cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingReview||reviewError}
                >
                  {isSubmittingReview?text('Đang gửi…','Sending…'):text('Gửi đánh giá','Submit review')}
                </button>
              </div>
            </form>
          </div>
        </DialogSurface>
      )}

    </div>
  );
};
