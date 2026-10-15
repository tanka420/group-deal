import { readAppRoute } from "../utils/appRoute";
import React, { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { ethers } from "ethers";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { PreTxModal } from "../components/PreTxModal";
import { TxTrackerModal, TxStep } from "../components/TxTrackerModal";
import { ShareModal } from "../components/ShareModal";
import {CampaignAmendmentHistory} from "../components/CampaignAmendments";
import { FundingModal } from "../components/FundingModal";
import { CheckoutIntent, checkoutKey, paymentLockKey, withCheckoutLock, purchaseBudget, assertPurchaseBudget, verifyArcCommitment, waitForIndexedOrder } from "../services/checkout";
import { paymentError } from "../services/paymentSafety";
import {observeBroadcast,TransactionOperation,operationRequest,broadcastCheckpoint,checkpointKey,localBroadcast,requireProjected,requireExpiredBuy} from "../services/transactionOperations";
import { DealDeadline, DealKeyFacts, ProductGallery, SellerIdentity, LicenseSummary, PriceDisplay, PriceTierRail, purchaseIssue, issueText, useDealLanguage } from "../components/DealPresentation";
import { focusPageElement } from "../utils/focus";
import { clearJoinDraft, defaultJoinSelection, fitJoinSelection, readJoinDraft, saveJoinDraft, type JoinSelection } from "../services/joinDraft";
import {HUB_ABI} from "../contracts/hubAbi";
import { UiError, uiMessage, messageText, type UiMessage } from "../utils/uiMessage";
import { Share2, ShieldCheck, ArrowLeft } from "lucide-react";

interface CampaignDetailPageProps {
  isAuthOpen: boolean;
  onRequestAuth: () => void;
  campaignId: string;
  onBack: () => void;
  onGoToOrders: () => void;
}

export const CampaignDetailPage: React.FC<CampaignDetailPageProps> = ({
  campaignId,
  isAuthOpen,
  onRequestAuth,
  onBack,
  onGoToOrders,
}) => {
  const { t, language } = useLanguage();
  const { text } = useDealLanguage();
  const [now, setNow] = useState(() => Math.floor(Date.now()/1000));
  useEffect(() => { const timer = window.setInterval(() => setNow(Math.floor(Date.now()/1000)), 15000); return () => window.clearInterval(timer); }, []);
  const { user, token, circleCredentials, getSessionEpoch } = useAuth();
  const { account, hubAddress, walletMode, commitToBuyOnchain, preflightPreparedOperation } = useWeb3();

  const [campaign, setCampaign] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [notFound,setNotFound]=useState(false);

  // Modals state
  const [isPreTxOpen, setIsPreTxOpen] = useState(false);
  const [joinSelection, setJoinSelection] = useState<JoinSelection>(() => readJoinDraft(campaignId) ?? defaultJoinSelection);
  const [resumeAfterAuth, setResumeAfterAuth] = useState(false);
  const [joinNotice, setJoinNotice] = useState(false);
  const rememberJoin = (selection: JoinSelection) => {
    setJoinSelection(selection);
    if (campaign) saveJoinDraft(campaignId, campaign.termsHash, selection);
  };
  const openJoin = () => {
    setJoinSelection(fitJoinSelection(joinSelection, campaign));
    setResumeAfterAuth(false); setJoinNotice(false); setIsPreTxOpen(true);
  };
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Tx tracking state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>("AUTH");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<UiMessage | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [fundingIntent, setFundingIntent] = useState<CheckoutIntent | null>(null);
  const [requiredFunding, setRequiredFunding] = useState<string | undefined>();
  const committingRef = useRef(false);
  const purchaseTrigger = useRef<HTMLButtonElement>(null);
  const accountRef = useRef(account);
  accountRef.current = account;
  const purchaseRetryKey=user?`groupdeal_buy_retry:${user.id}:${campaignId}`:"";

  const fetchCampaign = (signal?:AbortSignal) => {
    setLoading(true);setLoadError(null);setNotFound(false);
    return fetch(`/api/campaigns/${campaignId}`,{signal})
      .then(async r=>{if(r.status===404){setNotFound(true);return null;}if(!r.ok)throw new Error("Không tải được deal. Thử lại khi kết nối ổn định.");return r.json();})
      .then((data) => {
        if(signal?.aborted)return;
        if(!data){setCampaign(null);return;}
        if(!data.campaign||!Array.isArray(data.campaign.tiers)||data.campaign.tiers.length===0)throw new Error("Dữ liệu deal chưa đầy đủ");
        setCampaign(data.campaign);
        setSeller(data.seller);
        return data.campaign;
      })
      .catch((e) => {if(!signal?.aborted)setLoadError(e.message);})
      .finally(() => {if(!signal?.aborted)setLoading(false);});
  };

  useEffect(() => {
    const controller=new AbortController();setCampaign(null);fetchCampaign(controller.signal);return()=>controller.abort();
  }, [campaignId]);

  useEffect(() => {
    const currentRoute = () => { const route=readAppRoute(); return route.kind==='campaign'&&route.id===campaignId; };
    if (!currentRoute() || !resumeAfterAuth || isAuthOpen || !user || !token || !account || user.activeWallet?.toLowerCase() !== account.toLowerCase()) return;
    const controller = new AbortController();
    void fetchCampaign(controller.signal).then(fresh => {
      if (!fresh || controller.signal.aborted || !currentRoute()) return;
      setJoinSelection(fitJoinSelection(joinSelection, fresh)); setJoinNotice(true);
      setResumeAfterAuth(false); setIsPreTxOpen(true);
    });
    return () => controller.abort();
  }, [resumeAfterAuth, isAuthOpen, user?.id, user?.activeWallet, token, account, campaignId]);

  useEffect(() => { if (txStep === "CONFIRMED") clearJoinDraft(campaignId); }, [txStep, campaignId]);

  useEffect(() => {
    if (!account) return;
    const raw = localStorage.getItem(checkoutKey(account, campaignId));
    if (!raw) return;
    try {
      const intent = JSON.parse(raw) as CheckoutIntent;
      if (intent.phase === "BUY_PENDING" || intent.phase === "BUY_BROADCAST") {
        setTxHash(intent.txHash || null); setTxStep("PENDING_CHECK"); setIsTxModalOpen(true);
        setTxError(uiMessage("Có lượt mua cũ chưa xác minh. Kiểm tra lại lượt này trước khi mua tiếp.", "A previous purchase is unverified. Check it before buying again."));
      }
    } catch { setTxStep("PENDING_CHECK"); setIsTxModalOpen(true); setTxError(uiMessage("Hồ sơ checkout cũ không đọc được. Kiểm tra lịch sử ví trước khi mua tiếp.", "The previous checkout record could not be read. Check wallet history before buying again.")); }
  }, [account, campaignId]);

  useEffect(()=>{
    if(!user||!token||!account)return;let cancelled=false;
    const query=new URLSearchParams({action:"BUY",resourceId:campaignId,principal:account});
    void operationRequest<{operations:TransactionOperation[]}>(token,"/api/transactions?"+query).then(({operations})=>{
      if(cancelled)return;
      const pending=operations.find(o=>o.action==="BUY"&&o.resourceId===campaignId&&o.principal.toLowerCase()===account.toLowerCase()&&!["PROJECTED","REVERTED","SUPERSEDED","EXPIRED"].includes(o.phase));
      if(!pending)return;
      const call=new ethers.Interface(HUB_ABI).parseTransaction({data:pending.calldata});if(!call||!pending.purchaseQuote)throw new UiError(uiMessage("Intent mua trên server cần kiểm tra ở lịch sử giao dịch", "Review the server purchase intent in transaction history."));
      const key=checkoutKey(account,campaignId),saved=JSON.parse(localStorage.getItem(key)||"null") as CheckoutIntent|null;
      const hash=pending.txHash||localBroadcast(user.id,pending.id)||saved?.txHash;
      const intent:CheckoutIntent={operationId:pending.id,quantity:Number(call.args.quantity),requireEarlySlot:call.args.requireEarlySlot,maxGrossUsdc:pending.purchaseQuote.maxGrossAmount,campaignIdentity:String(call.args.campaignIdentity),onchainCampaignId:Number(call.args.campaignId),phase:hash?"BUY_BROADCAST":"BUY_PENDING",txHash:hash,createdAt:pending.createdAt};
      localStorage.setItem(key,JSON.stringify(intent));setTxHash(hash||null);setTxStep("PENDING_CHECK");setIsTxModalOpen(true);setTxError(hash?uiMessage("Lượt mua từ server đang chờ phục hồi. Kiểm tra receipt của cùng giao dịch.", "The server purchase awaits recovery. Check the receipt for this transaction."):uiMessage("Lượt mua đã được giữ trên server. Mở lịch sử giao dịch để tiếp tục đúng intent; chưa ký lại.", "The server has kept this purchase. Open transaction history to continue the same intent; do not sign again."));
    }).catch(()=>{/* Server preparation still refuses a second unresolved purchase. */});
    return()=>{cancelled=true;};
  },[user?.id,token,account,campaignId]);

  const checkPreviousPurchase = async (locked = false): Promise<void> => {
    if (!account || !token || committingRef.current) return;
    const key = checkoutKey(account, campaignId);
    if (!locked) {
      try { await withCheckoutLock(paymentLockKey(account), () => checkPreviousPurchase(true)); }
      catch (error) { setTxStep("PENDING_CHECK"); setTxError(paymentError(error)); }
      return;
    }
    committingRef.current = true;
    try {
      const intent = JSON.parse(localStorage.getItem(key) || "null") as CheckoutIntent | null;
      if(intent?.operationId){
        const current=(await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${intent.operationId}`)).operation;
        const releaseExpired=(expired:TransactionOperation)=>{
          requireExpiredBuy({operation:expired},current);localStorage.removeItem(key);localStorage.removeItem(purchaseRetryKey);if(user)localStorage.removeItem(checkpointKey(user.id,intent.operationId!));
          setTxStep("EXPIRED");setTxError(uiMessage("Chứng thực cũ đã hết hạn trên chain và nonce chưa sử dụng. Đóng cửa sổ để yêu cầu quote mới; lượt mua cũ vẫn nằm trong lịch sử.","The old authorization expired on chain and its nonce is unused. Close this window to request a fresh quote; the old purchase remains in history."));
        };
        if(current.phase==="EXPIRED"){releaseExpired(current);return;}
        if(current.phase==="SUPERSEDED")throw new UiError(uiMessage("Nonce của intent cũ đã được giao dịch khác sử dụng trên chain. Kiểm tra lịch sử trước khi mua lại.", "Another onchain transaction used the old intent's nonce. Check history before buying again."));
        const hash=current?.txHash||intent.txHash||(user?localBroadcast(user.id,intent.operationId):undefined);
        if(!hash&&current?.phase!=="PROJECTED"){
          const expired=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${intent.operationId}/expire`,{});releaseExpired(expired.operation);return;
        }
        setTxStep("SYNCING");const recovered=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${intent.operationId}/recover`,hash?{txHash:hash}:{});requireProjected(recovered,current,hash||"");
        localStorage.removeItem(key);localStorage.removeItem(purchaseRetryKey);if(user)localStorage.removeItem(checkpointKey(user.id,intent.operationId));setTxStep("CONFIRMED");setTxError(null);fetchCampaign();return;
      }
      if (!intent?.txHash || !intent.campaignIdentity || !intent.onchainCampaignId) {
        setTxStep("PENDING_CHECK");
        setTxError(uiMessage("Lượt mua cũ chưa có đủ hash hoặc mã thao tác để đối chiếu. Trạng thái được giữ nguyên; kiểm tra lịch sử giao dịch hoặc liên hệ hỗ trợ với principal của order.", "The previous purchase lacks a hash or operation ID for verification. Its state is preserved; check transaction history or contact support as the order principal."));
        return;
      }
      setTxStep("SYNCING");
      const proof = await verifyArcCommitment(intent.txHash, { hubAddress, buyer: account, campaignId: intent.onchainCampaignId,
        campaignIdentity: intent.campaignIdentity, quantity: intent.quantity, maxGross: BigInt(intent.maxGrossUsdc) });
      await waitForIndexedOrder(token, intent.txHash, account, proof.orderId);
      localStorage.removeItem(key); setTxStep("CONFIRMED"); setTxError(null); fetchCampaign();
    } catch (error) {
      let verifiedRevert=false,verifiedSuperseded=false;
      try{const saved=JSON.parse(localStorage.getItem(key)||"null") as CheckoutIntent|null;if(saved?.operationId){const current=(await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${saved.operationId}`)).operation;verifiedRevert=current.phase==="REVERTED";verifiedSuperseded=current.phase==="SUPERSEDED";}}catch{/* A failed status read cannot release the durable intent. */}
      if (verifiedRevert||verifiedSuperseded) { localStorage.removeItem(key);localStorage.removeItem(purchaseRetryKey);setTxStep(verifiedRevert?"REVERTED":"FAILED"); }
      else setTxStep("PENDING_CHECK");
      setTxError(paymentError(error));
    }
    finally { committingRef.current = false; }
  };

  if (notFound||loadError) return <section className="glass-card"><h1>{notFound?text("Không tìm thấy deal","Deal not found"):text("Không tải được deal","Unable to load deal")}</h1><p role={loadError?"alert":undefined}>{loadError?text("Không tải được dữ liệu. Thử lại khi kết nối ổn định.","Unable to load deal data. Retry when your connection is stable."):text("Deal chưa xuất bản hoặc link không còn phù hợp.","This deal is unpublished or the link is no longer available.")}</p><div className="action-row"><button className="btn btn-secondary" onClick={onBack}>{text("Quay về danh mục","Back to catalogue")}</button>{!notFound&&<button className="btn btn-primary" onClick={()=>fetchCampaign()}>{text("Thử lại","Retry")}</button>}</div></section>;
  if (loading || !campaign) {
    return (
      <div style={{ textAlign: "center", padding: "5rem 1rem", color: "var(--text-muted)" }}>
        <p role="status">{text("Đang tải thông tin deal…", "Loading deal details…")}</p>
      </div>
    );
  }

  const currentTier = campaign.tiers[campaign.currentUnlockedTier] || campaign.tiers[0];
  const blocked = issueText(purchaseIssue(campaign, now), text);
  const currentMetric = campaign.metric === "BUYER_COUNT" ? campaign.totalBuyerCount : campaign.totalUnitsCommitted;

  const handleConfirmPurchase = async (params: { quantity: number; requireEarlySlot: boolean; paymentSource?: "ARC_USDC" | "OTHER_USDC" }, resumed?: CheckoutIntent, locked = false): Promise<void> => {
    if (!user || !token || !account) {
      rememberJoin({ quantity: params.quantity, requireEarlySlot: params.requireEarlySlot, paymentSource: params.paymentSource ?? "ARC_USDC" });
      setIsPreTxOpen(false); setResumeAfterAuth(true); onRequestAuth(); return;
    }
    if (!token || committingRef.current) return;
    const buyer = account;
    const key = checkoutKey(buyer, campaignId);
    if (!locked) {
      try { await withCheckoutLock(paymentLockKey(buyer), () => handleConfirmPurchase(params, resumed, true)); }
      catch (error) { setIsPreTxOpen(false); setIsTxModalOpen(true); setTxStep("FAILED"); setTxError(paymentError(error)); }
      return;
    }
    const existing = localStorage.getItem(key);
    if (existing) {
      try {
        const old = JSON.parse(existing) as CheckoutIntent;
        if (old.phase !== "FUNDING") { setIsPreTxOpen(false); setIsTxModalOpen(true); setTxStep("PENDING_CHECK"); return; }
      } catch { setIsTxModalOpen(true); setTxStep("PENDING_CHECK"); setTxError(uiMessage("Hồ sơ checkout cũ không đọc được. Kiểm tra lịch sử ví trước khi mua tiếp.", "The previous checkout record could not be read. Check wallet history before buying again.")); return; }
    }
    committingRef.current = true;

    setIsPreTxOpen(false);
    setIsTxModalOpen(true);
    setTxStep("AUTH");
    setTxError(null);
    setTxHash(null);
    setIsCommitting(true);
    let purchaseOperation:TransactionOperation|undefined;
    const purchaseEpoch=getSessionEpoch?.();
    const assertPurchaseIdentity=()=>{if(accountRef.current?.toLowerCase()!==buyer.toLowerCase()||purchaseEpoch!==undefined&&getSessionEpoch()!==purchaseEpoch)throw new UiError(uiMessage("Phiên đăng nhập hoặc ví đã thay đổi trong lúc kiểm tra ngân sách. Đọc lại deal trước khi tiếp tục.", "The session or wallet changed during the budget check. Refresh the deal before continuing."));};

    try {
      const maxGross = resumed ? BigInt(resumed.maxGrossUsdc) : BigInt(currentTier.price) * BigInt(params.quantity);
      const budget = await purchaseBudget(buyer, maxGross);
      assertPurchaseIdentity();
      if (!resumed && (params.paymentSource === "OTHER_USDC" || budget.balance < budget.required)) {
        const intent: CheckoutIntent = { quantity: params.quantity, requireEarlySlot: params.requireEarlySlot,
          maxGrossUsdc: maxGross.toString(), phase: "FUNDING", createdAt: Date.now() };
        localStorage.setItem(key, JSON.stringify(intent));
        const deficit = budget.required > budget.balance ? (budget.required - budget.balance + 999_999_999_999n) / 1_000_000_000_000n : maxGross;
        setRequiredFunding(ethers.formatUnits(deficit, 6)); setFundingIntent(intent); setIsTxModalOpen(false); return;
      }
      assertPurchaseBudget(budget);
      // Campaign price, inventory, deadline and authorization are checked AFTER funding.
      const campaignResponse = await fetch(`/api/campaigns/${campaignId}`, { signal: AbortSignal.timeout(10_000) });
      const fresh = (await campaignResponse.json()).campaign;
      assertPurchaseIdentity();
      if (!campaignResponse.ok || !fresh || !["ACTIVE", "PUBLISHED"].includes(fresh.status) || fresh.endTime * 1000 <= Date.now()) throw new UiError(uiMessage("Chiến dịch đã đóng; tiền nạp vẫn ở ví, chưa tạo đơn.", "The campaign closed; funded USDC remains in your wallet and no order was created."));
      const freshPrice = BigInt((fresh.tiers[fresh.currentUnlockedTier] || fresh.tiers[0]).price);
      if (fresh.termsHash !== campaign.termsHash || fresh.onchainCampaignId !== campaign.onchainCampaignId || freshPrice * BigInt(params.quantity) > maxGross) throw new UiError(uiMessage("Điều khoản hoặc giá đã thay đổi. Hãy xem lại chiến dịch trước khi xác nhận mua.", "The terms or price changed. Review the campaign before confirming the purchase."));
      // A restored account can lack the per-tab Circle signing credentials.
      if(walletMode==='CIRCLE_EMBEDDED'&&!circleCredentials)throw new UiError(uiMessage(
        'Phiên ký Circle chưa có trong tab này. Mở Tài khoản để xác thực Circle, rồi quay lại mua.',
        'Circle signing is unavailable in this tab. Open Account to authenticate Circle, then return to buy.'
      ));
      // 1. Request EIP-712 buy authorization from backend
      const idempotencyKey=localStorage.getItem(purchaseRetryKey)||`buy:${crypto.randomUUID()}`;localStorage.setItem(purchaseRetryKey,idempotencyKey);
      const authRes = await fetch("/api/orders/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          quantity: params.quantity,
          walletAddress: buyer,
          requireEarlySlot:params.requireEarlySlot,
          maxGrossAmount:maxGross.toString(),
          idempotencyKey,
        }),
        signal:AbortSignal.timeout(10000),
      });

      const authData = await authRes.json();
      assertPurchaseIdentity();
      if (!authRes.ok) {
        throw new Error(authData.error || "Failed to obtain buy authorization");
      }
      if (accountRef.current?.toLowerCase() !== buyer.toLowerCase() || authData.buyerWallet?.toLowerCase() !== buyer.toLowerCase() ||
        String(authData.campaignId) !== String(fresh.onchainCampaignId) || authData.termsHash !== fresh.termsHash) throw new UiError(uiMessage("Ví hoặc chiến dịch của chứng thực không khớp checkout", "The authorization wallet or campaign does not match this checkout."));
      if(!authData.quote||!/^0x[0-9a-fA-F]{64}$/.test(authData.quote.blockHash)||!/^\d+$/.test(authData.quote.lockedUnitPrice)||!/^\d+$/.test(authData.quote.commitmentAmount))throw new UiError(uiMessage("Thiếu quote tài chính đã xác minh theo block; chưa gửi giao dịch mua", "A verified quote bound to a block is missing; no purchase was submitted."));
      const quotedPrice=BigInt(authData.quote.lockedUnitPrice);
      if(quotedPrice<=0n||BigInt(authData.quote.commitmentAmount)!==quotedPrice*BigInt(params.quantity)||quotedPrice*BigInt(params.quantity)>maxGross)throw new UiError(uiMessage("Giá trên chain đã vượt khoản cam kết được duyệt; xem lại deal trước khi ký", "The onchain price exceeds the reviewed commitment. Review the deal before signing."));
      const operation=authData.operation as TransactionOperation;
      if(!operation||operation.action!=="BUY"||operation.resourceId!==campaignId||operation.principal.toLowerCase()!==buyer.toLowerCase())throw new UiError(uiMessage("Thiếu intent mua bền vững từ server; chưa ký giao dịch", "The durable server purchase intent is missing; no transaction was signed."));
      purchaseOperation=operation;
      if(operation.phase==="EXPIRED"){
        requireExpiredBuy({operation},operation);localStorage.removeItem(key);localStorage.removeItem(purchaseRetryKey);if(user)localStorage.removeItem(checkpointKey(user.id,operation.id));
        setTxStep("EXPIRED");setTxError(uiMessage("Chứng thực cũ đã hết hạn. Đóng cửa sổ và xác nhận lại để lấy quote mới.","The old authorization expired. Close this window and confirm again to request a fresh quote."));return;
      }
      const intent: CheckoutIntent = { quantity: params.quantity, requireEarlySlot: params.requireEarlySlot, maxGrossUsdc: maxGross.toString(),
        operationId:operation.id,phase: "BUY_PENDING", campaignIdentity: authData.campaignIdentity, onchainCampaignId: fresh.onchainCampaignId, createdAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(intent));
      setFundingIntent(null);
      await preflightPreparedOperation(operation);assertPurchaseIdentity();
      const ready=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/ready`,{});
      if(ready.operation.calldata!==operation.calldata||!ready.operation.purchaseQuote||BigInt(ready.operation.purchaseQuote.commitmentAmount)>maxGross||accountRef.current?.toLowerCase()!==buyer.toLowerCase())throw new UiError(uiMessage("Intent hoặc quote trước chữ ký đã thay đổi; giữ lượt mua để phục hồi", "The intent or quote changed before signing. Keep the purchase for recovery."));

      // 2. Approve USDC & commit to buy on Arc Testnet Smart Contract
      setTxStep("APPROVE");

      const result = await commitToBuyOnchain({
        campaignId: fresh.onchainCampaignId,
        campaignIdentity: authData.campaignIdentity,
        quantity: params.quantity,
        requireEarlySlot: params.requireEarlySlot,
        maxAuthQuantity: authData.maxQuantity,
        authDeadline: authData.deadline,
        authSignature: authData.signature,
        lockedUnitPriceUSDC: ready.operation.purchaseQuote.lockedUnitPrice,
        operationId:operation.id,
        onStep: setTxStep,
        onBroadcast: async(hash) => { setTxHash(hash); localStorage.setItem(key, JSON.stringify({ ...intent, phase: "BUY_BROADCAST", txHash: hash }));if(user)broadcastCheckpoint(user.id,operation,hash);await operationRequest(token,`/api/transactions/${operation.id}/submit`,{txHash:hash});await observeBroadcast(token,operation.id,hash); },
      });

      setTxHash(result.txHash);
      setTxStep("SYNCING");
      const recovered=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/recover`,{txHash:result.txHash});requireProjected(recovered,operation,result.txHash);
      await waitForIndexedOrder(token, result.txHash, buyer, result.orderId);
      localStorage.removeItem(key);
      localStorage.removeItem(purchaseRetryKey);if(user)localStorage.removeItem(checkpointKey(user.id,operation.id));
      setTxStep("CONFIRMED");

      // Trigger victory celebration
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      // Refresh campaign state
      fetchCampaign();
    } catch (err: any) {
      let verifiedRevert=false;
      if(purchaseOperation){
        try{
          const saved=JSON.parse(localStorage.getItem(key)||"null") as CheckoutIntent|null;
          if(err.code==="PURCHASE_REVERTED"&&saved?.txHash)await operationRequest(token,`/api/transactions/${purchaseOperation.id}/recover`,{txHash:saved.txHash}).catch(()=>{});
          const current=(await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${purchaseOperation.id}`)).operation;verifiedRevert=current.phase==="REVERTED";
        }catch{/* A wallet rejection or uncertain receipt cannot release the durable server intent. */}
      }
      if(verifiedRevert){localStorage.removeItem(key);localStorage.removeItem(purchaseRetryKey);if(user&&purchaseOperation)localStorage.removeItem(checkpointKey(user.id,purchaseOperation.id));}
      const saved = localStorage.getItem(key);
      let pending = false;
      try { pending = Boolean(saved && ["BUY_PENDING", "BUY_BROADCAST"].includes(JSON.parse(saved).phase)); } catch { pending = true; }
      setTxStep(verifiedRevert ? "REVERTED" : pending ? "PENDING_CHECK" : "FAILED");
      setTxError(paymentError(err));
    } finally {
      setIsCommitting(false);
      committingRef.current = false;
    }
  };

  return (
    <div className="buyer-deal-detail">
      <nav className="deal-breadcrumb" aria-label={text("Điều hướng deal", "Deal navigation")}><button className="btn btn-secondary" onClick={onBack}><ArrowLeft size={16}/>{text("Quay lại danh sách", "Back to deals")}</button><span>{campaign.category}</span></nav>
      <div className="campaign-detail-grid">
        <div className="deal-main">
          <ProductGallery key={campaign.id} title={campaign.title} thumbnailUrl={campaign.thumbnailUrl} media={campaign.product?.media}/>
          <SellerIdentity seller={seller}/>
          <header className="deal-title"><div className="deal-badges"><span className="badge">{campaign.category}</span><span className="badge badge-sla">Arc Testnet</span></div><h1>{campaign.title}</h1><p>{campaign.description}</p></header>
          {Array.isArray(campaign.amendments)&&campaign.amendments.length>0&&<CampaignAmendmentHistory items={campaign.amendments}/>}
          <DealKeyFacts product={campaign.product} slaSeconds={campaign.deliverySlaSeconds}/>
          <nav className="deal-section-nav" aria-label={text("Nội dung sản phẩm", "Product information")}><button className="btn btn-secondary" onClick={()=>focusPageElement(document.getElementById("deal-license"))}>{text("License và quyền sử dụng", "License and usage rights")}</button><button className="btn btn-secondary" onClick={()=>focusPageElement(document.getElementById("deal-delivery"))}>{text("Giao hàng và điều khoản", "Delivery and terms")}</button></nav>
          <div id="deal-license" className="deal-license-section" tabIndex={-1}><LicenseSummary product={campaign.product} rights={campaign.rights}/></div>
          <section id="deal-delivery" tabIndex={-1} className="glass-card delivery-terms"><h2>{text("Giao hàng và bảo vệ khoản mua", "Delivery and purchase protection")}</h2><dl className="detail-list"><dt>{text("Cách nhận", "Delivery method")}</dt><dd>{campaign.deliveryMethod === "FILE_LINK" ? text("Tải tài nguyên được bảo vệ", "Protected resource download") : campaign.deliveryMethod === "LICENSE_KEY" ? text("Mã truy cập tài nguyên GroupDeal", "GroupDeal resource access code") : campaign.deliveryMethod}</dd><dt>{text("Hạn giao hàng", "Delivery deadline")}</dt><dd>{campaign.deliverySlaSeconds / 3600} {text("giờ sau finalize", "hours after finalization")}</dd><dt>{text("Tranh chấp", "Dispute window")}</dt><dd>{text("48 giờ sau khi ghi nhận giao hàng trên chain", "48 hours after delivery is recorded on chain")}</dd></dl><p>{text("Tài nguyên được bảo vệ bằng quyền truy cập gắn với order và principal. Sau khi nhận hàng, kiểm tra tài nguyên trước khi xác nhận.", "Resource access is bound to the order and its principal. Check the delivered resource before confirming receipt.")}</p><div className="deal-info"><ShieldCheck size={20}/><p>{text("Quá hạn không giao: ghi nhận breach để phân bổ khoản hoàn đủ điều kiện, sau đó claim về ví. Dispute hợp lệ giữ phần tiền chưa phân bổ để operator xem xét.", "Non-delivery after the deadline: record a breach to allocate the entitled refund, then claim it. A valid dispute holds the unallocated funds for operator review.")}</p></div><details><summary>{text("Khi API GroupDeal không hoạt động", "When the GroupDeal API is unavailable")}</summary><p>{text("Công cụ trực tiếp vẫn cần RPC và ví principal.", "The direct tool still requires RPC and the principal wallet.")} <a href="/fallback.html" target="_blank" rel="noreferrer">{text("Mở công cụ trực tiếp", "Open direct tool")}</a></p></details></section>
        </div>
        <aside className="deal-purchase-panel glass-card" aria-label={text("Giá và tham gia deal", "Pricing and joining the deal")}>
          <div className="deal-panel-status"><span className="badge">{({ACTIVE:text("Đang mở", "Open"),PUBLISHED:text("Đã xuất bản", "Published"),FINALIZED:text("Đã finalize", "Finalized"),CANCELLED:text("Đã hủy", "Cancelled")} as Record<string,string>)[campaign.status] || campaign.status}</span><span className="muted">{campaign.metric === "BUYER_COUNT" ? text("Tài khoản đủ điều kiện", "Eligible accounts") : text("Đơn vị cam kết", "Committed units")}: <strong>{currentMetric}</strong></span></div>
          <DealDeadline startTime={campaign.startTime} endTime={campaign.endTime} now={now} status={campaign.status}/>
          <p className="muted">{campaign.status === "FINALIZED" ? text("Giá clearing sau finalize", "Final clearing price") : text("Giá khóa tham khảo hiện tại", "Current indicative locked price")}</p>
          <PriceDisplay amount={campaign.status === "FINALIZED" ? campaign.finalClearingPrice || "" : currentTier.price} large/><p className="muted">{text("Mỗi đơn vị · cam kết vào escrow ngay khi mua", "Per unit · transferred into escrow on purchase")}</p>
          <PriceTierRail tiers={campaign.tiers} current={campaign.currentUnlockedTier} metric={campaign.metric} count={currentMetric} canUnlock={purchaseIssue(campaign,now)===null} finalized={campaign.status==="FINALIZED"}/>
          {blocked && <p className="notice notice-warning" role="status">{blocked}</p>}
          <button ref={purchaseTrigger} className="btn btn-primary btn-lg deal-join-cta" onClick={openJoin} disabled={isCommitting || !!blocked}><span className="mobile-purchase-price"><PriceDisplay amount={campaign.status==="FINALIZED"?campaign.finalClearingPrice||"":currentTier.price}/></span><span>{t("commitToBuy")}</span></button>
          {blocked && <button className="btn btn-secondary" onClick={onGoToOrders}>{text("Xem đơn đã mua", "View existing orders")}</button>}
          <div className="deal-info"><p>{text("Giá nhóm thấp hơn có thể tạo rebate khi finalize. Buyer chủ động claim phần đã phân bổ; không tự động chuyển về ví.", "A lower group price can create a rebate at finalization. Buyers claim allocated funds; they are not automatically transferred.")}</p></div>
          <dl className="summary-list"><dt>{text("Giới hạn mỗi account", "Limit per account")}</dt><dd>{campaign.maxPerAccount} {text("đơn vị", "units")}</dd><dt>{text("Fee nền tảng", "Platform fee")}</dt><dd>{campaign.platformFeeBps === 0 ? "0 USDC" : text("Kiểm tra điều khoản", "Verify terms")}</dd></dl>
          <button className="btn btn-secondary" onClick={() => setIsShareOpen(true)}><Share2 size={16}/>{t("shareCampaign")}</button>
          <p className="muted form-help">{text("Giá, số lượng, quyền phân phối và ví được kiểm lại trước ký. Phí mạng thanh toán riêng bằng USDC native.", "Price, quantity, rights and wallet are checked before signing. Network fees are paid separately in native USDC.")}</p>
        </aside>
      </div>

      {/* Pre-Tx Modal */}
      <PreTxModal
        isOpen={isPreTxOpen}
        onClose={() => setIsPreTxOpen(false)}
        campaign={campaign}
        isLoading={isCommitting}
        onConfirm={handleConfirmPurchase}
        initialSelection={joinSelection}
        onSelectionChange={rememberJoin}
        requiresSignIn={!user || !token}
        budgetAccount={account??undefined}
        reviewIdentity={JSON.stringify([user?.id, account, getSessionEpoch?.()])}
        reviewNotice={joinNotice ? text("Đã tải lại deal sau đăng nhập. Kiểm tra giá, số lượng, license và đồng ý lại trước khi tiếp tục.", "The deal was refreshed after sign-in. Review the price, quantity and license and agree again before continuing.") : undefined}
      />

      <FundingModal isOpen={Boolean(fundingIntent)} requiredUsdc={requiredFunding}
        onClose={() => setFundingIntent(null)}
        onContinueCheckout={() => {
          if (!fundingIntent) return;
          const intent = fundingIntent;
          setFundingIntent(null);
          void handleConfirmPurchase({ quantity: intent.quantity, requireEarlySlot: intent.requireEarlySlot }, intent);
        }} />

      {/* Tx Tracker Modal */}
      <TxTrackerModal
        isOpen={isTxModalOpen}
        step={txStep}
        txHash={txHash}
        errorMessage={txError === null ? null : messageText(txError, language)}
        onCheck={() => void checkPreviousPurchase()}
        returnFocus={() => purchaseTrigger.current}
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
      />
    </div>
  );
};
