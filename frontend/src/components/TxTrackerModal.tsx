import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useDealLanguage } from "./DealPresentation";
import { focusPageElement } from "../utils/focus";

export type TxStep = "AUTH" | "READY" | "APPROVE" | "BROADCAST" | "SYNCING" | "PENDING_CHECK" | "CONFIRMED" | "REVERTED" | "FAILED" | "EXPIRED";
interface TxTrackerModalProps { isOpen:boolean;step:TxStep;txHash:string|null;errorMessage:string|null;onClose:()=>void;onCheck?:()=>void;returnFocus?:()=>HTMLElement|null; }

export function providerWindowOpen() {
  const wallet=document.querySelector('w3m-modal') as (HTMLElement & {open?:boolean})|null;
  if(wallet?.open||wallet?.classList.contains('open'))return true;
  const frame=document.getElementById('sdkIframe');
  return Boolean(frame&&frame.getBoundingClientRect().width>0&&frame.getBoundingClientRect().height>0&&getComputedStyle(frame).display!=='none'&&getComputedStyle(frame).visibility!=='hidden');
}

export function TxTrackerModal({isOpen,step,txHash,errorMessage,onClose,onCheck,returnFocus}:TxTrackerModalProps) {
  const {t}=useLanguage(),{text}=useDealLanguage(),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const [providerHandoff,setProviderHandoff]=useState(false),handoff=useRef(false),closeState=useRef({closable:false,onClose,returnFocus});
  const confirmed=step==="CONFIRMED",failed=["REVERTED","FAILED","EXPIRED"].includes(step),closable=confirmed||failed||step==="PENDING_CHECK";
  const stage=confirmed||["SYNCING","PENDING_CHECK"].includes(step)?3:["AUTH","READY"].includes(step)?1:2;
  closeState.current={closable,onClose,returnFocus};
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,app=document.getElementById('root'),wasInert=app?.inert,overflow=document.body.style.overflow;
    if(app)app.inert=true;document.body.style.overflow='hidden';heading.current?.focus();
    setProviderHandoff(providerWindowOpen());
    const sync=()=>{const open=providerWindowOpen();if(open===handoff.current)return;handoff.current=open;setProviderHandoff(open);};
    // SDK portals live outside #root. A native showModal() would make them
    // inert regardless of their z-index, so this portal manages the app only.
    const observer=new MutationObserver(sync);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','open','hidden']});sync();
    const keydown=(event:KeyboardEvent)=>{
      if(providerWindowOpen()||!dialog.current?.contains(event.target as Node))return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(closeState.current.closable)closeState.current.onClose();return;}
      if(event.key!=='Tab')return;
      const controls=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0&&!el.closest('[hidden],[inert]'));
      const first=controls[0],last=controls[controls.length-1];if(!first||!last){event.preventDefault();heading.current?.focus();return;}
      const active=document.activeElement as HTMLElement;
      if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown,true);
    return()=>{observer.disconnect();document.removeEventListener('keydown',keydown,true);handoff.current=false;if(app)app.inert=Boolean(wasInert);document.body.style.overflow=overflow;const target=closeState.current.returnFocus?.()??previous;if(target?.isConnected)focusPageElement(target);};
  },[isOpen]);
  useEffect(()=>{if(isOpen&&!providerHandoff)heading.current?.focus();},[isOpen,providerHandoff]);
  if(!isOpen)return null;
  const title=confirmed?t("txConfirmed"):step==="EXPIRED"?t("authorizationExpired"):failed?text("Giao dịch thất bại","Transaction failed"):step==="PENDING_CHECK"?text("Cần kiểm tra giao dịch cũ","Previous transaction needs review"):text("Đang xử lý trên Arc Testnet…","Processing on Arc Testnet…");
  const descriptions:Record<TxStep,string>={
    AUTH:text("Đang kiểm tra điều kiện mua trước khi yêu cầu ví ký.","Checking purchase eligibility before requesting a wallet signature."),
    READY:text("Đang kiểm tra giá và lịch sử giao dịch của ví. Có thể mất vài chục giây; chưa cần thao tác trong ví.","Checking the price and wallet transaction history. This may take several seconds; no wallet action is needed yet."),
    APPROVE:text("Ví cần cấp quyền chi tiêu USDC cho hợp đồng của deal.","Your wallet needs to approve USDC spending for the deal contract."),
    BROADCAST:text("Đang gửi giao dịch cam kết USDC vào escrow.","Submitting the transaction that commits USDC into escrow."),
    SYNCING:text("Đang xác minh giao dịch và cập nhật đơn. Chưa mua thêm khi kết quả chưa rõ.","Verifying the transaction and updating your order. Wait for its outcome before buying again."),
    PENDING_CHECK:text("Chưa xác nhận được đơn hàng. Kiểm tra cùng giao dịch trước khi mua tiếp.","The order is unconfirmed. Check this transaction before buying again."),
    CONFIRMED:text("Bằng chứng onchain đã được xác minh và đơn tương ứng đã được ghi nhận.","The onchain evidence is verified and the matching order is recorded."),
    REVERTED:text("Giao dịch bị hoàn tác trên chain. Xem lại điều kiện mua trước khi thử lại.","The transaction reverted on chain. Review the purchase conditions before retrying."),
    FAILED:text("Thao tác chưa hoàn tất. Kiểm tra lịch sử giao dịch nếu ví đã gửi giao dịch.","The action did not complete. Check transaction history if your wallet submitted a transaction."),
    EXPIRED:text("Chứng thực mua đã hết hạn. Kiểm tra trạng thái cũ trước khi yêu cầu quote mới.","The purchase authorization expired. Check its state before requesting a fresh quote.")
  };
  return createPortal(<div className="modal-overlay transaction-overlay" hidden={providerHandoff}><dialog open ref={dialog} className="modal-content transaction-dialog" aria-modal={!providerHandoff} aria-labelledby="transaction-title">
    <p className="eyebrow">{text("Tham gia deal","Join deal")} · Arc Testnet</p>
    <ol className="join-steps" aria-label={text("Tiến trình mua","Purchase progress")}>{[text("Kiểm tra cam kết","Review commitment"),text("Ký giao dịch","Sign transaction"),text("Xác minh đơn","Verify order")].map((label,index)=><li key={label} aria-current={index+1===stage?"step":undefined}><span>{index+1<stage?<CheckCircle2 size={18} aria-hidden="true"/>:index+1}</span>{label}</li>)}</ol>
    <div className={"transaction-symbol "+(confirmed?"confirmed":failed?"failed":"pending")} aria-hidden="true">{confirmed?<CheckCircle2 size={36}/>:failed?<AlertTriangle size={36}/>:<Loader2 size={36} className="animate-spin"/>}</div>
    <h2 id="transaction-title" ref={heading} tabIndex={-1}>{title}</h2><p role="status">{descriptions[step]}</p>
    {errorMessage&&!confirmed&&<p className="notice notice-warning">{errorMessage}</p>}
    {txHash&&/^0x[0-9a-fA-F]{64}$/.test(txHash)&&<details className="transaction-technical"><summary>{text("Chi tiết giao dịch","Transaction details")}</summary><p className="address-value">{txHash}</p><a href={"https://testnet.arcscan.app/tx/"+txHash} target="_blank" rel="noreferrer">{text("Xem trên explorer","View on explorer")} <ExternalLink size={15}/></a></details>}
    {step==="PENDING_CHECK"&&onCheck&&<button type="button" className="btn btn-secondary" onClick={onCheck}>{text("Kiểm tra lại giao dịch / đơn cũ","Check previous transaction / order")}</button>}
    {closable?<button className="btn btn-primary" onClick={onClose}>{confirmed?text("Xem đơn hàng của tôi","View my orders"):text("Đóng","Close")}</button>:<p className="muted">{text("Chờ kết quả trước khi ký thêm giao dịch. Bạn có thể từ chối yêu cầu trong ví.","Wait for this operation before signing another transaction. You can reject a request in your wallet.")}</p>}
  </dialog></div>,document.body);
}
