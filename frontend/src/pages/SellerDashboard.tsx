import {ManagedOrderAction,ManagedOrderActionHandle} from "../components/ManagedOrderAction";
import {ManagedClaim} from "../components/ManagedClaim";
import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { displayUSDC } from "../services/orderAccounting";
import {orderMoney,deliveryStatusText,recordedDeadline} from '../services/buyerOrderPresentation';
import {sellerOrderAmounts,canCheckSettlement,sellerCampaignStatus,validateSellerData} from '../services/sellerOrderPresentation';
import {ProductStudio} from "../components/ProductStudio";
import { SellerCreateDeal } from "../components/SellerCreateDeal";
import {CampaignReplacementControl} from "../components/CampaignReplacementControl";
import {CampaignAmendmentControl} from "../components/CampaignAmendments";
import { SellerProfileEditor } from "../components/SellerProfileEditor";
import { ManagedFulfillment } from "../components/ManagedFulfillment";
import { TransactionHistory } from "../components/TransactionHistory";
import {WebhookRecoveryReview} from '../components/WebhookRecoveryReview';
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
  const { t, language } = useLanguage();
  const text=(vi:string,en:string)=>language==="en"?en:vi;
  const { user,token,getSessionEpoch } = useAuth();
  const {
    account,
  } = useWeb3();

  const orderAction=useRef<ManagedOrderActionHandle>(null);
  const [activeTab, setActiveTab] = useState<"CAMPAIGNS" | "FULFILLMENT" | "WEBHOOKS" | "CREATE" | "PROFILE" | "PRODUCTS">(
    "CAMPAIGNS"
  );
  const [initialDraftId,setInitialDraftId]=useState<string|undefined>();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [webhookData, setWebhookData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const dataController=useRef<AbortController|null>(null);
  const scopeRef=useRef({userId:user?.id,token});scopeRef.current={userId:user?.id,token};
  const [dataOwner,setDataOwner]=useState({userId:user?.id,token}),dataVisible=dataOwner.userId===user?.id&&dataOwner.token===token;

  // Fulfill Modal State
  const [fulfillOrderObj, setFulfillOrderObj] = useState<any | null>(null);

  // Webhook form state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [webhookNotice,setWebhookNotice]=useState<'SAVED'|'REVIEW'|'FAILED'|'VERIFIED'|null>(null);
  const webhookSaveController=useRef<AbortController|null>(null);
  const webhookHeld=webhookData?.restoredReviewRequired===true||webhookData?.canConfigure===false||webhookNotice==='REVIEW';
  useEffect(()=>{webhookSaveController.current?.abort();webhookSaveController.current=null;setIsSavingWebhook(false);setWebhookNotice(null);return()=>{webhookSaveController.current?.abort();};},[user?.id,token]);

  const fetchSellerData = () => {
    dataController.current?.abort();
    const controller=new AbortController();dataController.current=controller;setLoading(true);setLoadError(null);setCampaigns([]);setOrders([]);setWebhookData(null);setWebhookUrl('');
    const owner={userId:user?.id,token};setDataOwner(owner);
    if (!token||!user?.id) {setLoading(false);setLoadError('SELLER_SIGN_IN_REQUIRED');return;}
    const epoch=getSessionEpoch(),timer=setTimeout(()=>controller.abort(),15000),current=()=>dataController.current===controller&&scopeRef.current.userId===owner.userId&&scopeRef.current.token===owner.token&&getSessionEpoch()===epoch;
    const read=async(url:string)=>{const r=await fetch(url,{signal:controller.signal,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('SELLER_DATA_UNAVAILABLE');return r.json();};

    Promise.all([
      read('/api/seller/campaigns'),read('/api/seller/orders'),read('/api/seller/webhooks'),
    ])
      .then(([cData, oData, wData]) => {
        if(controller.signal.aborted||!current())return;
        const data=validateSellerData(cData,oData,wData,owner.userId!);setCampaigns(data.campaigns);setOrders(data.orders);setWebhookData(data.webhook);setWebhookUrl(data.webhook?.targetUrl??'');setWebhookNotice(null);
      })
      .catch(() => {if(current())setLoadError('SELLER_DATA_UNAVAILABLE');})
      .finally(() => {clearTimeout(timer);if(current())setLoading(false);});
  };

  useEffect(() => {
    fetchSellerData();
    return()=>{dataController.current?.abort();dataController.current=null;};
  }, [user?.id,token]);
  useEffect(()=>{setFulfillOrderObj(null);setWebhookData(null);setWebhookUrl('');setActiveTab('CAMPAIGNS');setInitialDraftId(undefined);},[user?.id,token]);

  // Save webhook
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if(webhookHeld){setWebhookNotice('REVIEW');return;}
    if(!token||webhookSaveController.current||webhookNotice==='FAILED')return;
    const controller=new AbortController();webhookSaveController.current=controller;const timer=setTimeout(()=>controller.abort(),15000),owner={userId:user?.id,token},epoch=getSessionEpoch(),current=()=>webhookSaveController.current===controller&&scopeRef.current.userId===owner.userId&&scopeRef.current.token===owner.token&&getSessionEpoch()===epoch;
    setWebhookNotice(null);
    setIsSavingWebhook(true);
    try {
      const res = await fetch("/api/seller/webhooks", {
        method: "POST",
        redirect:'error',cache:'no-store',
        signal:controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUrl: webhookUrl }),
      });
      const data = await res.json();
      if(controller.signal.aborted||!current())return;
      if (!res.ok){if(res.status===409&&data.error==='RESTORED_SUBSCRIPTION_REVIEW_REQUIRED'){setWebhookNotice('REVIEW');setWebhookData((prior:any)=>prior?{...prior,secret:null,restoredReviewRequired:true,canConfigure:false,canEnqueue:false}:prior);return;}throw new Error('WEBHOOK_SETUP_REJECTED');}
      if(data.success!==true||!data.webhook)throw new Error('WEBHOOK_RESPONSE_INVALID');validateSellerData({campaigns:[]},{orders:[]},data,owner.userId!);
      setWebhookData(data.webhook);
      setWebhookNotice('SAVED');
    } catch {
      if(current())setWebhookNotice('FAILED');
    } finally {
      clearTimeout(timer);if(webhookSaveController.current===controller){const stillCurrent=current();webhookSaveController.current=null;if(stillCurrent)setIsSavingWebhook(false);}
    }
  };

  // Calculate seller claimable
  let totalSellerClaimable = 0n;
  if(dataVisible)orders.forEach((o) => {totalSellerClaimable += sellerOrderAmounts(o).remaining??0n;});

  if(activeTab==="CREATE")return <div><div className="action-row" style={{marginBottom:"1.25rem"}}><button className="btn btn-secondary" onClick={()=>setActiveTab("CAMPAIGNS")}>{text("← Quay lại quản lý deal","← Back to deal management")}</button></div><SellerCreateDeal key={(user?.id??'')+':'+(initialDraftId??'new')} initialDraftId={initialDraftId} onCreated={()=>{setActiveTab("CAMPAIGNS");fetchSellerData();}}/></div>;
  const dataReady=dataVisible&&!loading&&!loadError&&!!user?.id&&!!token,allSellerAmountsVerified=orders.every(order=>sellerOrderAmounts(order).remaining!==null);
  return (
    <div className="app-page seller-dashboard">
      {loadError&&<div role="alert" className="notice notice-error">{loadError==='SELLER_SIGN_IN_REQUIRED'?text('Đăng nhập để tải dữ liệu seller.','Sign in to load seller data.'):text('Không tải được dữ liệu. Thử lại khi kết nối ổn định.','Unable to load seller data. Retry when your connection is stable.')}<button className="btn btn-secondary" onClick={fetchSellerData}>{text('Thử lại','Retry')}</button></div>}
      <div className="workspace-heading">
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "0.25rem" }}>{t("sellerDashboardTitle")}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            {text("Quản lý sản phẩm, deal, giao quyền truy cập và khoản được claim.","Manage products, deals, access delivery and claimable allocations.")}
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => {setInitialDraftId(undefined);setActiveTab("CREATE");}}>
          <PlusCircle size={17} />
          {t("createCampaignBtn")}
        </button>
      </div>

      {(loading||!dataVisible)&&<p role="status">{text("Đang tải dữ liệu seller…","Loading seller data…")}</p>}
      {/* Overview Cards */}
      {dataReady&&<div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        <div className="glass-card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            {text("Đã xuất bản / đang hoạt động", "Published / active campaigns")}
          </div>
          <div className="ui-stat-value" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
            {campaigns.filter(c=>["PUBLISHED","ACTIVE"].includes(c.status)).length}
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            {text("Đơn chờ giao quyền truy cập", "Orders awaiting access delivery")}
          </div>
          <div className="ui-stat-value" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--warning)" }}>
            {orders.filter((o) => o.deliveryStatus === "PENDING").length}
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            {text("Phân bổ còn được claim","Remaining claimable allocations")}
          </div>
          <div className="ui-stat-value" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)" }}>
            {allSellerAmountsVerified?`${displayUSDC(totalSellerClaimable)} USDC`:text('Chưa xác minh','Unverified')}
          </div>
        </div>
      </div>}

      {/* Tabs */}
      <nav className="workspace-tabs" aria-label={language==="en"?"Workspace sections":"Các mục workspace"}>
        <button
          className={`btn btn-sm ${activeTab === "CAMPAIGNS" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("CAMPAIGNS")}
        >
          {text("Chiến dịch của tôi","My campaigns")} ({dataReady?campaigns.length:"—"})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "FULFILLMENT" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("FULFILLMENT")}
        >
          {text("Đơn hàng & Giao quyền truy cập","Orders & access delivery")} ({dataReady?orders.length:"—"})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "WEBHOOKS" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("WEBHOOKS")}
        >
          {text("Tích hợp Webhook HMAC","HMAC webhook integration")}
        </button>
        <button className={`btn btn-sm ${activeTab === "PROFILE" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("PROFILE")}>
          {text("Hồ sơ & Ví nhận tiền", "Profile & Payout")}
        </button>
        <button className={`btn btn-sm ${activeTab==="PRODUCTS"?"btn-primary":"btn-secondary"}`} onClick={()=>setActiveTab("PRODUCTS")}>{text("Sản phẩm & license","Products & licenses")}</button>
      </nav>

      {activeTab === "PRODUCTS" && <ProductStudio/>}
      {activeTab === "PROFILE" && <div className="glass-card"><SellerProfileEditor key={user?.id}/></div>}

      {/* Tab Content: CAMPAIGNS */}
      {dataReady && activeTab === "CAMPAIGNS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {campaigns.length === 0 ? (
            <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
                {text("Bạn chưa có chiến dịch nào. Hãy bắt đầu bằng cách tạo chiến dịch mua chung đầu tiên!","No campaigns yet. Start by creating your first group-buy campaign.")}
              </p>
              <button className="btn btn-primary" onClick={() => {setInitialDraftId(undefined);setActiveTab("CREATE");}}>
                {text("Tạo chiến dịch mới","Create new campaign")}
              </button>
            </div>
          ) : (
            campaigns.map((c) => (
              <div
                key={c.id}
                className="glass-card ui-record-card ui-row"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem" }}
              >
                <div>
                  <div className="ui-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span className="badge badge-verified-seller">#{c.id}</span>
                    <strong style={{ fontSize: "1.1rem" }}>{c.title??text('Chưa có tiêu đề ghi nhận','No recorded title')}</strong>
                    <span className="badge" style={{ background: "var(--bg-tertiary)" }}>
                      {sellerCampaignStatus(c.status,language)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {c.replacementFor?.campaignId&&<p>{text('Thay thế campaign: ','Replaces campaign: ')}<a href={'#campaign-'+encodeURIComponent(c.replacementFor.campaignId)}>{c.replacementFor.campaignId}</a></p>}
                    {text('Đơn vị đã cam kết: ','Units committed: ')}<strong>{Number.isSafeInteger(c.totalUnitsCommitted)&&c.totalUnitsCommitted>=0?c.totalUnitsCommitted:text('Chưa xác minh','Unverified')}</strong> | {text('Tier ghi nhận: ','Recorded tier: ')}
                    <strong>{Number.isSafeInteger(c.currentUnlockedTier)&&c.currentUnlockedTier>=0&&Array.isArray(c.tiers)&&c.currentUnlockedTier<c.tiers.length?`Tier ${c.currentUnlockedTier+1}/${c.tiers.length}`:text('Chưa xác minh','Unverified')}</strong> | SLA: 
                    <strong>{Number.isSafeInteger(c.deliverySlaSeconds)&&c.deliverySlaSeconds>0?c.deliverySlaSeconds%3600===0?`${c.deliverySlaSeconds/3600}h`:`${c.deliverySlaSeconds} ${text('giây','seconds')}`:text('Chưa xác minh','Unverified')}</strong>
                  </div>
                  {c.status!=="DRAFT"&&c.projectionOrigin==="VERIFIED_PUBLISH"&&<CampaignAmendmentControl campaignId={c.id}/> }
                </div>

                <div className="ui-row" style={{ display: "flex", gap: "0.5rem" }}>
                  <a href={`#campaign-${c.id}`} className="btn btn-sm btn-secondary">
                    {text('Xem trang deal','View deal')}
                  </a>
                  {c.status!=="DRAFT"&&c.projectionOrigin==="VERIFIED_PUBLISH"&&<CampaignReplacementControl sourceId={c.id} onReady={id=>{setInitialDraftId(id);setActiveTab("CREATE");}}/>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content: FULFILLMENT */}
      {dataReady && activeTab === "FULFILLMENT" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {orders.length === 0 ? (
            <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
              {text('Chưa có đơn hàng nào phát sinh.','No orders recorded yet.')}
            </div>
          ) : (
            orders.map((o) => {
              const gross=orderMoney(o.committedGross)??text('Chưa xác minh','Unverified'),amounts=sellerOrderAmounts(o),sellerAllocated=orderMoney(o.sellerAllocated)??text('Chưa xác minh','Unverified'),sellerClaimable=amounts.remaining;
              const payout=o.sellerPayoutWallet??campaigns.find(c=>c.id===o.campaignId)?.sellerPayoutWallet??'';

              return (
                <div key={o.id} className="glass-card ui-record-card" style={{ padding: "1.25rem 1.5rem" }}>
                  <div className="ui-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <div>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {text('Đơn #','Order #')}{o.id} • {typeof o.campaignTitle==='string'?o.campaignTitle:text('Chưa có tiêu đề ghi nhận','No recorded title')}
                      </span>
                      <div style={{ fontWeight: 600, fontSize: "1rem" }}>
                        {text("Ví buyer", "Buyer wallet")}: <span className="font-mono" style={{ color: "var(--cyan)" }}>{o.buyerPrincipal??text('Chưa xác minh','Unverified')}</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {text("Số lượng", "Quantity")}: {Number.isSafeInteger(o.quantity)&&o.quantity>0?o.quantity:text('Chưa xác minh','Unverified')} | {text("Cam kết", "Commitment")}: {gross} USDC
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span className="badge" style={{ background: "var(--bg-tertiary)" }}>
                        {deliveryStatusText(o.deliveryStatus,language)}
                      </span>
                    </div>
                  </div>

                  <div className="ui-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                    <div style={{ fontSize: "0.85rem" }}>
                      {text('Phân bổ cho seller: ','Seller allocation: ')}<strong style={{ color: "var(--success)" }}>{sellerAllocated} USDC</strong>
                      <div>{text('Đã claim: ','Claimed: ')}{amounts.claimed===null?text('Chưa xác minh','Unverified'):displayUSDC(amounts.claimed)+' USDC'} · {text('Còn lại: ','Remaining: ')}{sellerClaimable===null?text('Chưa xác minh','Unverified'):displayUSDC(sellerClaimable)+' USDC'}</div>
                    </div>

                    <div className="ui-row" style={{ display: "flex", gap: "0.5rem" }}>
                      <a className="btn btn-sm btn-secondary" href={'#support-order-'+encodeURIComponent(o.id)}>{text('Hỗ trợ theo đơn','Order support')}</a>
                      {o.deliveryStatus === "PENDING" && (
                        <button className="btn btn-sm btn-primary" onClick={() => setFulfillOrderObj(o)}>
                          <KeyRound size={14} /> {text('Giao tài nguyên','Deliver resource')}
                        </button>
                      )}

                      {canCheckSettlement(o,Math.floor(Date.now()/1000)) && (
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={!payout}
                            onClick={() => void orderAction.current?.begin(o.id,payout,{action:"SETTLE"})}
                          >
                            <CheckCircle2 size={14} /> {text('Kiểm tra quyết toán trên Arc','Check settlement on Arc')}
                          </button>
                        )}

                      {(o.deliveryStatus === "CONFIRMED" || o.deliveryStatus === "RESOLVED") &&
                        sellerClaimable !== null && sellerClaimable > 0n && (
                          <ManagedClaim key={(user?.id??'')+':'+getSessionEpoch()+':'+o.id} action="SELLER_CLAIM" campaignId={o.campaignId} orderId={o.id} principal={payout} amount={sellerClaimable} onClaimed={fetchSellerData}/>
                        )}
                    </div>
                  </div>
                {o.deliveryStatus==='DELIVERED'&&<p className="notice">{recordedDeadline(o.disputeDeadline)!==null?text('Hạn tranh chấp ghi nhận: ','Recorded dispute deadline: ')+new Date(o.disputeDeadline*1000).toLocaleString(language==='en'?'en-GB':'vi-VN'):text('Chưa có thời hạn tranh chấp đã ghi nhận.','No recorded dispute deadline is available.')} {text('Chuẩn bị quyết toán sẽ kiểm tra lại trạng thái và cửa sổ trên chain.','Settlement preparation rechecks the current chain state and window.')}</p>}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab Content: WEBHOOKS */}
      {dataReady && activeTab === "WEBHOOKS" && (
        <div className="glass-card" style={{ maxWidth: "700px" }}>
          <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>{text("Cấu hình Webhook & Chữ ký HMAC-SHA256", "Webhook setup & HMAC-SHA256 signatures")}</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
            {text("Thông báo POST có chữ ký HMAC và timestamp. Máy chủ nhận cần kiểm chữ ký trên raw body, timestamp trong 300 giây và lưu event ID vào inbox để xử lý trùng khi retry. Xem hướng dẫn trong Tài liệu & API.", "POST notices carry an HMAC signature and timestamp. Verify the raw body signature and a timestamp within 300 seconds, then persist the event ID in an inbox to handle duplicate retries. See Docs & API for the integration guide.")}
          </p>

          {webhookHeld&&<p role="status">{text("Subscription được phục hồi đang chờ rà soát. Cấu hình, secret và lịch sử được giữ nguyên; sự kiện mới chưa được gửi qua endpoint này. Cần xác minh chủ thể và endpoint trước khi tiếp tục.","The restored subscription is awaiting review. Its setup, secret and history are preserved; new events are not sent to this endpoint. Verify its owner and endpoint before resuming.")}</p>}
          {webhookHeld&&user?.id&&token&&webhookData?.id&&<WebhookRecoveryReview userId={user.id} token={token} subscriptionId={webhookData.id} onVerified={async signal=>{
            const owner={userId:user!.id,token},epoch=getSessionEpoch(),response=await fetch('/api/seller/webhooks',{signal,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error();const data=await response.json();if(signal.aborted||scopeRef.current.userId!==owner.userId||scopeRef.current.token!==owner.token||getSessionEpoch()!==epoch)return;
            validateSellerData({campaigns:[]},{orders:[]},data,owner.userId);
            if(!data.webhook||data.webhook.id!==webhookData.id||data.webhook.restoredReviewRequired!==false||data.webhook.canConfigure!==true||data.webhook.canEnqueue!==true)throw Error();
            setWebhookData(data.webhook);setWebhookUrl(data.webhook.targetUrl);setWebhookNotice('VERIFIED');
          }}/>}
          {webhookNotice==='VERIFIED'&&<p role="status">{text('Endpoint đã được xác minh cho sự kiện mới. Job lịch sử vẫn chờ rà soát riêng.','Endpoint verified for new events. Historical jobs still await separate review.')}</p>}
          {webhookNotice==='SAVED'&&<p role="status">{text("Đã lưu cấu hình webhook.","Webhook setup saved.")}</p>}
          {webhookNotice==='FAILED'&&<p role="alert">{text("Chưa xác nhận được cấu hình webhook. Tải lại trạng thái hiện hành trước khi gửi lại.","Webhook setup acknowledgement is unavailable. Reload its current state before resubmitting.")}<button type="button" className="btn btn-secondary" onClick={fetchSellerData}>{text('Tải lại cấu hình','Reload setup')}</button></p>}
          <form onSubmit={handleSaveWebhook}>
            <div className="form-group">
              <label className="form-label" htmlFor="seller-webhook-url">{text("Endpoint URL của bạn","Your endpoint URL")}</label>
              <input
                type="url" id="seller-webhook-url"
                className="form-input font-mono"
                placeholder="https://api.yourdomain.com/webhooks/groupdeal"
                value={webhookUrl}
                disabled={webhookHeld||isSavingWebhook}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
              />
            </div>

            {webhookData && !webhookHeld && (
              <div className="form-group">
                <label className="form-label" htmlFor="seller-webhook-secret">{text("Webhook secret (xác thực chữ ký)","Webhook secret (signature verification)")}</label>
                <input
                  type="password" id="seller-webhook-secret" autoComplete="off"
                  className="form-input font-mono"
                  value={webhookData.secret||''}
                  readOnly
                  style={{ background: "var(--bg-tertiary)" }}
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={isSavingWebhook||webhookHeld||webhookNotice==='FAILED'}>
              {isSavingWebhook ? text("Đang lưu...", "Saving…") : text("Lưu cấu hình Webhook", "Save webhook setup")}
            </button>
          </form>

          {webhookData?.logs && webhookData.logs.length > 0 && (
            <div style={{ marginTop: "2rem" }}>
              <h4 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>{text('Nhật ký gửi Webhook gần nhất','Recent webhook delivery log')}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {webhookData.logs.slice(0, 5).map((l: any) => (
                  <div className="ui-row"
                    key={l.id}
                    style={{
                      background: "var(--bg-tertiary)",
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

      <ManagedOrderAction key={(user?.id??'')+':'+(token?getSessionEpoch():'signed-out')} ref={orderAction} onRecovered={fetchSellerData}/>
      <TransactionHistory key={user?.id} onRecovered={fetchSellerData}/>
      {dataVisible&&fulfillOrderObj && <ManagedFulfillment key={(user?.id??'')+':'+getSessionEpoch()} order={fulfillOrderObj} onClose={()=>setFulfillOrderObj(null)} onDelivered={()=>{setFulfillOrderObj(null);fetchSellerData();}}/>}
    </div>
  );
};
