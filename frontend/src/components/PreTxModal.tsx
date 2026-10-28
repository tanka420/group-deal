import {ARC_CHAIN_NAME,ARC_CHAIN_ID,ARC_EXPLORER} from '../../../shared/network.mjs';
import React, { useState, useEffect, useRef } from "react";
import { X, ShieldCheck, Fuel } from "lucide-react";
import { DealKeyFacts, ProductGallery, PriceDisplay, PriceTierRail, purchaseIssue, issueText, useDealLanguage } from "./DealPresentation";
import { focusPageElement } from "../utils/focus";
import { defaultJoinSelection, fitJoinSelection, type JoinSelection } from "../services/joinDraft";
import {PurchaseBudgetReview,usePurchaseBudgetReview} from './PurchaseBudgetReview';
import {purchaseBudgetIsFresh} from '../services/checkout';

interface PreTxModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: any;
  onConfirm: (params: { quantity: number; requireEarlySlot: boolean; paymentSource: "ARC_USDC" | "OTHER_USDC" }) => void;
  isLoading: boolean;
  initialSelection?: JoinSelection;
  onSelectionChange?: (selection: JoinSelection) => void;
  requiresSignIn?: boolean;
  reviewNotice?: string;
  reviewIdentity?: string;
  budgetAccount?: string;
}
export const PreTxModal: React.FC<PreTxModalProps> = ({ isOpen, onClose, campaign, onConfirm, isLoading, initialSelection, onSelectionChange, requiresSignIn = false, reviewNotice, reviewIdentity,budgetAccount }) => {
  const { text } = useDealLanguage();
  const [quantity, setQuantity] = useState(1), [requireEarlySlot, setRequireEarlySlot] = useState(false), [agreed, setAgreed] = useState(false);
  const [paymentSource, setPaymentSource] = useState<"ARC_USDC" | "OTHER_USDC">("ARC_USDC");
  const [acceptedReview, setAcceptedReview] = useState("");
  const [now, setNow] = useState(()=>Math.floor(Date.now()/1000));
  const dialog = useRef<HTMLDialogElement>(null);
  const selectionRef = useRef(initialSelection);
  selectionRef.current = initialSelection;
  const previewPrice=campaign?.tiers?.[campaign.currentUnlockedTier]?.price??campaign?.tiers?.[0]?.price??'0';
  const budgetKey=JSON.stringify([campaign?.id,campaign?.termsHash,previewPrice,quantity,paymentSource,requireEarlySlot,reviewIdentity,budgetAccount]);
  const {view:budgetView,refresh:refreshBudget}=usePurchaseBudgetReview(isOpen,budgetAccount,BigInt(previewPrice)*BigInt(quantity),budgetKey,!!campaign&&!requiresSignIn&&!purchaseIssue(campaign,Math.floor(Date.now()/1000)));
  const select = (changed: Partial<JoinSelection>) => {
    const next = { quantity, requireEarlySlot, paymentSource, ...changed };
    setQuantity(next.quantity); setRequireEarlySlot(next.requireEarlySlot); setPaymentSource(next.paymentSource); setAgreed(false);
    onSelectionChange?.(next);
  };
  useEffect(()=>{if(!isOpen)return;setNow(Math.floor(Date.now()/1000));const timer=window.setInterval(()=>setNow(Math.floor(Date.now()/1000)),1000);return()=>window.clearInterval(timer);},[isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const restored = fitJoinSelection(selectionRef.current ?? defaultJoinSelection, campaign);
    setQuantity(restored.quantity); setRequireEarlySlot(restored.requireEarlySlot); setAgreed(false); setAcceptedReview(""); setPaymentSource(restored.paymentSource);
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (previous?.isConnected) focusPageElement(previous); };
  }, [isOpen, campaign?.id, campaign?.termsHash, reviewIdentity]);
  if (!isOpen || !campaign) return null;
  const currentTier = campaign.tiers[campaign.currentUnlockedTier] || campaign.tiers[0];
  const unit = BigInt(currentTier.price), lowest = BigInt(campaign.tiers[campaign.tiers.length-1].price);
  const gross = unit * BigInt(quantity), potential = (unit > lowest ? unit - lowest : 0n) * BigInt(quantity);
  const remaining = campaign.inventoryLimit > 0 ? Math.max(0, campaign.inventoryLimit - campaign.totalUnitsCommitted) : campaign.maxPerAccount;
  const maxQuantity = Math.max(1, Math.min(campaign.maxPerAccount, remaining));
  const blocked = issueText(purchaseIssue(campaign, now), text);
  const budget=budgetView.phase==='ready'?budgetView.budget:undefined;
  const budgetReady=()=>requiresSignIn||!!(budget&&budgetView.key===budgetKey&&purchaseBudgetIsFresh(budget)&&budget.account.toLowerCase()===budgetAccount?.toLowerCase()&&budget.grossUsdc===gross);
  const reviewKey=JSON.stringify([campaign.id,campaign.termsHash,currentTier.price,quantity,paymentSource,requireEarlySlot,campaign.product,campaign.deliverySlaSeconds,campaign.platformFeeBps,reviewIdentity,budget?.requestedAt,budget?.balance.toString(),budget?.required.toString()]);
  const consent=agreed&&acceptedReview===reviewKey&&budgetReady();
  return <dialog ref={dialog} className="modal-content join-dialog" aria-labelledby="join-title" onCancel={event => { event.preventDefault(); if (!isLoading) onClose(); }}>
    <div className="modal-header"><div><p className="eyebrow">{text("Tham gia deal", "Join deal")} · {ARC_CHAIN_NAME}</p><h2 id="join-title">{text("Xác nhận cam kết mua", "Confirm your commitment")}</h2></div><button className="modal-close" aria-label={text("Đóng xác nhận mua", "Close purchase confirmation")} disabled={isLoading} onClick={onClose}><X size={20}/></button></div>
    <ol className="join-steps" aria-label={text("Tiến trình mua", "Purchase progress")}><li aria-current="step"><span>1</span>{text("Kiểm tra cam kết", "Review commitment")}</li><li><span>2</span>{text("Ký giao dịch", "Sign transaction")}</li><li><span>3</span>{text("Xác minh đơn", "Verify order")}</li></ol>
    {blocked && <p role="alert" className="notice notice-error">{blocked}</p>}
    {reviewNotice && <p role="status" className="notice">{reviewNotice}</p>}
    <div className="join-grid"><section>
      <div className="join-product-card"><ProductGallery title={campaign.title} thumbnailUrl={campaign.thumbnailUrl}/><div><p className="eyebrow">{text("Sản phẩm bạn tham gia mua", "Your selected product")}</p><h3>{campaign.title}</h3><p className="muted">{campaign.product?.license?.edition} · {text("Giao trong", "Delivery within")} {campaign.deliverySlaSeconds / 3600}h {text("sau finalize", "after finalization")}</p></div></div>
      <DealKeyFacts product={campaign.product} slaSeconds={campaign.deliverySlaSeconds}/>
      <div className="form-group"><label className="form-label" htmlFor="join-quantity">{text("Số lượng", "Quantity")}</label><div className="quantity-control"><button className="btn btn-secondary" aria-label={text("Giảm số lượng", "Decrease quantity")} disabled={quantity <= 1 || isLoading} onClick={() => { select({quantity:quantity - 1}); }}><span aria-hidden="true">−</span></button><input id="join-quantity" className="form-input" type="number" value={quantity} readOnly/><button className="btn btn-secondary" aria-label={text("Tăng số lượng", "Increase quantity")} disabled={quantity >= maxQuantity || isLoading} onClick={() => { select({quantity:quantity + 1}); }}><span aria-hidden="true">+</span></button></div><p className="muted">{text("Giới hạn mỗi account", "Limit per account")}: {campaign.maxPerAccount}. {text("Số lượng còn được mua của account sẽ được kiểm tra trước ký.", "Your remaining account allowance is checked before signing.")}</p></div>
      <label className="form-label" htmlFor="checkout-payment-source">{text("Nguồn thanh toán", "Payment source")}</label><select id="checkout-payment-source" className="form-select" value={paymentSource} disabled={isLoading} onChange={event => { select({paymentSource:event.target.value as typeof paymentSource}); }}><option value="ARC_USDC">{text(`USDC sẵn có trên ${ARC_CHAIN_NAME}`, `USDC already on ${ARC_CHAIN_NAME}`)}</option><option value="OTHER_USDC">{text("USDC testnet mạng khác → CCTP → Arc", "Other testnet USDC → CCTP → Arc")}</option><option disabled>{text("Token khác → Swap: chưa hỗ trợ", "Other tokens → Swap: unavailable")}</option></select><p className="muted form-help">{text("Nạp tiền và tạo đơn là các giao dịch riêng. Không dùng token mainnet trong bản testnet này.", "Funding and purchase are separate transactions. Use testnet tokens only.")}</p>
      {campaign.earlyRebateEnabled && <section className="deal-info"><h4>{text("Rebate cho người tham gia sớm", "Early supporter rebate")}</h4><p>{text("Chỉ cho đơn vị đầu của lần mua đầu tiên. Suất và mức hưởng được kiểm tra trên chain; không trừ vào tiền cam kết lúc mua.", "Only the first unit of the first purchase qualifies. Slot availability and entitlement are checked on chain; the commitment is not reduced.")}</p><label className="checkbox-row"><input type="checkbox" disabled={isLoading} checked={requireEarlySlot} onChange={event => { select({requireEarlySlot:event.target.checked}); }}/>{text("Chỉ tiếp tục nếu còn suất early supporter", "Continue only if an early supporter slot is available")}</label></section>}
      <section className="deal-info"><h4><ShieldCheck size={18}/> {text("Cách giá nhóm hoạt động", "How group pricing works")}</h4><p>{text("Cam kết chuyển toàn bộ tiền ở giá khóa vào escrow ngay. Khi finalize, phần chênh lệch đủ điều kiện được phân bổ và bạn chủ động claim về ví.", "Committing transfers the full locked-price amount into escrow now. At finalization, eligible rebates are allocated and you claim them to your wallet.")}</p><p>{text("Quá hạn không giao cần ghi nhận breach rồi claim khoản hoàn có quyền nhận; không tự động chuyển tiền về ví.", "Non-delivery after the deadline requires a breach transaction, followed by claiming the entitled refund; funds are not automatically returned.")}</p></section>
    </section><aside className="join-summary"><h3>{text("Tóm tắt cam kết", "Commitment summary")}</h3><dl className="summary-list"><dt>{text("Giá khóa tham khảo / đơn vị", "Indicative locked price / unit")}</dt><dd><PriceDisplay amount={unit.toString()}/></dd><dt>{text("Số lượng", "Quantity")}</dt><dd>{quantity}</dd><dt>{text("Fee nền tảng", "Platform fee")}</dt><dd>{campaign.platformFeeBps === 0 ? "0 USDC" : text("Kiểm tra điều khoản", "Verify terms")}</dd><dt><Fuel size={15}/> {text("Phí mạng", "Network fee")}</dt><dd>{text("Kiểm tra RPC trước ký; ví hiển thị phí thực tế", "RPC check before signing; wallet shows the actual fee")}</dd></dl><PurchaseBudgetReview view={budgetView} refresh={()=>{setAgreed(false);setAcceptedReview("");refreshBudget();}} busy={isLoading} now={Date.now()}/><div className="commitment-total"><span>{text("Tiền cam kết vào escrow", "Commitment into escrow")}</span><PriceDisplay amount={gross.toString()} large/></div><p className="muted">{text("Phí mạng trả riêng bằng USDC native; không cộng một phí ước đoán vào số tiền trên.", "Network fees are paid separately in native USDC; no assumed fee is added above.")}</p><PriceTierRail tiers={campaign.tiers} current={campaign.currentUnlockedTier} metric={campaign.metric}/><div className="deal-info"><p>{text("Nếu đạt bậc cuối: rebate theo tier có thể là", "If the final tier is reached, the possible tier rebate is")} <PriceDisplay amount={potential.toString()}/>.</p><p className="muted">{text("Đây là kịch bản, không phải số tiền đã phân bổ. Chưa bao gồm early rebate.", "This is a scenario, not an allocated amount. Early rebate is excluded.")}</p></div></aside></div>
    <details className="join-terms"><summary>{text("Xem license và điều khoản trước khi đồng ý", "Read the license and terms before agreeing")}</summary><p>{campaign.product?.license?.usageTerms || text("License chưa được ghim", "Pinned license unavailable")}</p><p>{campaign.product?.supportPolicy}</p><dl className="detail-list"><dt>{text("Hash điều khoản", "Terms hash")}</dt><dd className="address-value">{campaign.termsHash}</dd></dl></details>
    <label className="checkbox-row join-agreement"><input type="checkbox" disabled={isLoading || !!blocked || !budgetReady()} checked={consent} onChange={event => {setAgreed(event.target.checked);setAcceptedReview(event.target.checked?reviewKey:"");}}/><span>{text("Tôi đã đọc license và điều khoản; đồng ý cam kết số tiền vào escrow và phí mạng riêng. Giá và điều kiện được kiểm lại trước ký.", "I have read the license and terms and agree to the escrow commitment and separate network fee. Price and eligibility are checked again before signing.")}</span></label>
    <button className="btn btn-primary join-submit" disabled={!consent || isLoading || !!blocked || !budgetReady()} onClick={() => {if(consent&&!blocked&&!isLoading&&budgetReady())onConfirm({ quantity, requireEarlySlot, paymentSource });}}>{isLoading ? text("Đang xử lý trên Arc…", "Processing on Arc…") : requiresSignIn ? text("Đăng nhập để tiếp tục", "Sign in to continue") : paymentSource === "OTHER_USDC" || !!budget?.shortfall ? text("Tiếp tục: báo giá và nạp USDC", "Continue: quote and fund USDC") : text("Approve USDC & Cam kết mua", "Approve USDC & commit")}</button>
  </dialog>;
};
