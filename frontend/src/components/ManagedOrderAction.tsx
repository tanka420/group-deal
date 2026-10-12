import {forwardRef,useImperativeHandle,useLayoutEffect,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useWeb3} from '../context/Web3Context';
import {useOperationScope} from '../hooks/useOperationScope';
import {observeBroadcast,TransactionOperation,operationRequest,broadcastCheckpoint,checkpointKey,localBroadcast,requireReadyOperation,requireMatchingOperation,requireProjected,managedOperationError} from '../services/transactionOperations';
import {displayUSDC} from '../services/orderAccounting';
import {operationActionLabel} from './TransactionHistory';
import {useDealLanguage} from './DealPresentation';
import {UiMessage,UiError,uiMessage,messageText} from '../utils/uiMessage';
import {DialogSurface} from './DialogSurface';
import {recoverProjectedOperation} from '../services/operationRecovery';

type Intent={action:'CONFIRM'|'BREACH'|'SETTLE'}|{action:'DISPUTE';reason:string;evidenceUrls:string[]}|{action:'RESOLVE';buyerPercent:number;notes:string};
export interface ManagedOrderActionHandle {begin:(orderId:string,principal:string,intent:Intent)=>Promise<boolean>}
export const ManagedOrderAction=forwardRef<ManagedOrderActionHandle,{onRecovered:()=>void}>(function ManagedOrderAction({onRecovered},ref){
 const {user,token}=useAuth(),{account,broadcastPreparedOperation}=useWeb3(),{language,text}=useDealLanguage();
 const identity=JSON.stringify([user?.id,token,account?.toLowerCase()]),scope=useOperationScope(identity);
 const [open,setOpen]=useState(false),[operation,setOperation]=useState<TransactionOperation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<UiMessage|null>(null);
 useLayoutEffect(()=>{setOpen(false);setOperation(null);setBusy(false);setError(null);},[identity]);
 const key=(orderId:string)=>`groupdeal_order_action:${user?.id}:${orderId}`;
 useImperativeHandle(ref,()=>({begin:async(orderId,principal,intent)=>{
  if(!user)return false;const ticket=scope.start();if(!ticket)return false;setBusy(true);setError(null);setOperation(null);
  try{
   if(account?.toLowerCase()!==principal?.toLowerCase())throw new UiError(uiMessage('Kết nối đúng ví principal của thao tác trước khi tiếp tục.','Connect the principal wallet for this action before continuing.'));
   const history=await operationRequest<{operations:TransactionOperation[]}>(token,`/api/transactions?resourceId=${encodeURIComponent(orderId)}&principal=${encodeURIComponent(principal)}&limit=100`);if(!ticket.current())return false;
   if(!Array.isArray(history.operations)||history.operations.some(o=>o.resourceId!==orderId||o.principal?.toLowerCase()!==principal.toLowerCase()))throw new UiError(uiMessage('Lịch sử intent chưa khớp order và ví.','The intent history does not match this order and wallet.'));
   let current=history.operations.find(o=>['CONFIRM','BREACH','SETTLE','DISPUTE','RESOLVE'].includes(o.action)&&!['PROJECTED','REVERTED','SUPERSEDED'].includes(o.phase));
   if(!current){
    const idempotencyKey=localStorage.getItem(key(orderId))||`order:${crypto.randomUUID()}`;localStorage.setItem(key(orderId),idempotencyKey);
    current=(await operationRequest<{operation:TransactionOperation}>(token,'/api/transactions/orders/prepare',{orderId,idempotencyKey,intent})).operation;if(!ticket.current())return false;
    if(!current||current.action!==intent.action||current.resourceId!==orderId||current.principal?.toLowerCase()!==principal.toLowerCase())throw new UiError(uiMessage('Intent thao tác chưa khớp order và ví.','The action intent does not match this order and wallet.'));
    if(['PROJECTED','REVERTED','SUPERSEDED'].includes(current.phase)){localStorage.removeItem(key(orderId));throw new UiError(uiMessage('Intent trước đã kết thúc. Tải lại order và kiểm tra trước khi chuẩn bị thao tác mới.','The previous intent ended. Reload and review the order before preparing another action.'));}
   }
   setOperation(current);setOpen(true);return true;
  }catch(e){if(ticket.current()){setError(managedOperationError(e,uiMessage('Chưa chuẩn bị được thao tác.','The action could not be prepared.')));setOpen(true);}return false;}finally{if(ticket.current()){setBusy(false);ticket.finish();}}
 }}));
 const act=async(sign:boolean)=>{
  if(!user||!operation)return;const ticket=scope.start();if(!ticket)return;setBusy(true);setError(null);
  try{
   let hash=operation.txHash||localBroadcast(user.id,operation.id);
   if(sign&&!hash){
    const response=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/ready`,{});if(!ticket.current())return;
    const ready=requireReadyOperation(response,operation);setOperation(ready);
    if(account?.toLowerCase()!==ready.principal.toLowerCase())throw new UiError(uiMessage('Kết nối đúng ví principal trước khi ký.','Connect the principal wallet before signing.'));
    hash=(await broadcastPreparedOperation(ready,async txHash=>{
     broadcastCheckpoint(user.id,ready,txHash);if(ticket.current())setOperation({...ready,phase:'SUBMITTED',txHash});
     await operationRequest(token,`/api/transactions/${ready.id}/submit`,{txHash});await observeBroadcast(token,ready.id,txHash);
    })).txHash;
   }
   if(!ticket.current())return;
   if(!hash)throw new UiError(uiMessage('Intent đang chờ ví trả hash. Kiểm tra lịch sử ví; chưa ký lại.','This intent is awaiting a wallet hash. Check wallet history before signing again.'));
   const result=await recoverProjectedOperation(token,operation,hash,ticket.current);if(!ticket.current())return;
   requireProjected(result,operation,hash);requireMatchingOperation(result,operation);
   localStorage.removeItem(checkpointKey(user.id,operation.id));localStorage.removeItem(key(operation.resourceId));setOpen(false);onRecovered();
  }catch(e){if(!ticket.current())return;setError(managedOperationError(e,uiMessage('Chưa xác minh được receipt; intent được giữ để phục hồi.','The receipt is unverified. Keep the intent for recovery.')));
   try{const response=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}`);if(ticket.current()){const current=requireMatchingOperation(response,operation);if(current.phase!=='PROJECTED')setOperation(current);}}catch{/* Keep the exact intent and broadcast checkpoint. */}
  }finally{if(ticket.current()){setBusy(false);ticket.finish();}}
 };
 const hash=operation&&(operation.txHash||(user?localBroadcast(user.id,operation.id):undefined)),matches=operation?.principal.toLowerCase()===account?.toLowerCase();
 const money=(value?:string)=>{try{return value!==undefined&&/^\d+$/.test(value)?displayUSDC(value):text('Chưa xác minh','Unverified');}catch{return text('Chưa xác minh','Unverified');}};
 return open?<DialogSurface transaction busy={busy} label={text('Kiểm tra thao tác trên Arc','Review action on Arc')} onClose={()=>setOpen(false)}>
  <h2>{text('Kiểm tra thao tác trên Arc','Review action on Arc')}</h2>
  {operation&&<><h3>{operationActionLabel(operation.action,language)}</h3><p className="address-value">Order: {operation.resourceId} · Principal: {operation.principal}</p>
   <p>{text('Quote tại block','Quote at block')} {operation.orderQuote?.blockNumber}: <strong>{money(operation.orderQuote?.remainingGross)} USDC</strong> {text('chưa phân bổ.','unallocated.')}</p>
   {operation.orderQuote?.buyerShare!==undefined&&<p>Buyer: <strong>{money(operation.orderQuote.buyerShare)} USDC</strong>; seller: <strong>{money(operation.orderQuote.sellerShare)} USDC</strong>.</p>}
   <p>{text('Bằng chứng riêng được lưu trước chữ ký. Chỉ receipt và projection đã xác minh mới hoàn tất thao tác.','Private evidence is stored before signing. Only a verified receipt and projection complete this action.')}</p>
   {operation.action==='CONFIRM'&&<p>{text('Xác nhận nhận hàng sẽ phân bổ tiền cho người bán và kết thúc quyền mở tranh chấp của order này.','Confirming delivery allocates funds to the seller and ends the right to open a dispute for this order.')}</p>}
   <div className="action-row">
    {operation.phase==='PREPARED'&&!hash&&<button className="btn btn-primary" disabled={busy||!matches} onClick={()=>void act(true)}>{text('Ký thao tác đã kiểm tra','Sign reviewed action')}</button>}
    {hash&&!['PROJECTED','REVERTED','SUPERSEDED'].includes(operation.phase)&&<button className="btn btn-primary" disabled={busy} onClick={()=>void act(false)}>{text('Kiểm tra receipt và phục hồi thao tác','Verify receipt and recover action')}</button>}
    {operation.phase==='AWAITING_SIGNATURE'&&!hash&&<p role="status">{text('Đang chờ ví trả hash. Lấy hash từ lịch sử ví để phục hồi intent hiện tại.','Awaiting a wallet hash. Obtain the hash from wallet history to recover this intent.')}</p>}
   </div>
  </>}
  {error&&<p role="alert" className="notice notice-error">{messageText(error,language)}</p>}
  <button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>setOpen(false)}>{text('Đóng','Close')}</button>
 </DialogSurface>:null;
});
