import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useWeb3} from '../context/Web3Context';
import {useOperationScope} from '../hooks/useOperationScope';
import {useDealLanguage} from './DealPresentation';
import {observeBroadcast,TransactionOperation,operationRequest,broadcastCheckpoint,checkpointKey,localBroadcast,requireProjected,requireDeliveryRetry,requireReadyOperation,requireMatchingOperation,managedOperationError} from '../services/transactionOperations';
import {UiMessage,UiError,uiMessage,messageText} from '../utils/uiMessage';
import {DialogSurface} from './DialogSurface';
import {operationPhaseLabel} from './TransactionHistory';

export function ManagedFulfillment({order,onClose,onDelivered}:{order:{id:string;quantity:number;campaignTitle?:string};onClose:()=>void;onDelivered:()=>void}){
 const {token,user}=useAuth(),{account,broadcastPreparedOperation,preflightPreparedOperation}=useWeb3(),{text,language}=useDealLanguage();
 const identity=JSON.stringify([user?.id,token,account?.toLowerCase(),order.id]),scope=useOperationScope(identity),previous=useRef(identity);
 const [operation,setOperation]=useState<TransactionOperation|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadFailed,setLoadFailed]=useState(false),[error,setError]=useState<UiMessage|null>(null);
 useLayoutEffect(()=>{if(previous.current!==identity){previous.current=identity;setOperation(null);setError(null);setBusy(false);onClose();}},[identity]);
 const retryKey=(id:string)=>'groupdeal_delivery_retry:'+user?.id+':'+id;
 const load=useCallback(async()=>{
  const query=new URLSearchParams({action:'DELIVER',resourceId:order.id});const data=await operationRequest<{operations:TransactionOperation[]}>(token,'/api/transactions?'+query);
  if(!Array.isArray(data.operations)||data.operations.some(o=>o.action!=='DELIVER'||o.resourceId!==order.id))throw new UiError(uiMessage('Lịch sử giao hàng chưa khớp order.','The delivery history does not match this order.'));
  return data.operations[0]||null;
 },[order.id,token]);
 const reload=async()=>{
  const ticket=scope.start();if(!ticket)return;setLoading(true);setLoadFailed(false);setError(null);
  try{const value=await load();if(ticket.current())setOperation(value);}catch(e){if(ticket.current()){setLoadFailed(true);setError(managedOperationError(e,uiMessage('Chưa tải được intent giao hàng; thử tải lại.','Delivery intents could not be loaded. Retry loading.')));}}finally{if(ticket.current()){setLoading(false);ticket.finish();}}
 };
 useEffect(()=>{void reload();},[load]);
 const run=async(action:(current:()=>boolean)=>Promise<void>)=>{
  if(loading)return;const ticket=scope.start();if(!ticket)return;setBusy(true);setError(null);
  try{await action(ticket.current);}catch(e){if(!ticket.current())return;setError(managedOperationError(e,uiMessage('Thao tác chưa hoàn tất; giữ yêu cầu để phục hồi.','The action is incomplete. Keep the current request for recovery.')));
   if(operation)try{const result=await operationRequest<{operation:TransactionOperation}>(token,'/api/transactions/'+operation.id);if(ticket.current()){const value=requireMatchingOperation(result,operation);if(value.phase!=='PROJECTED')setOperation(value);}}catch{/* Status reads cannot release the reviewed intent. */}
  }finally{if(ticket.current()){setBusy(false);ticket.finish();}}
 };
 const prepare=()=>run(async current=>{
  const data=await operationRequest<{operation:TransactionOperation}>(token,'/api/delivery/orders/'+order.id+'/prepare',{idempotencyKey:'delivery:'+order.id});if(!current())return;
  if(data.operation?.action!=='DELIVER'||data.operation.resourceId!==order.id)throw new UiError(uiMessage('Intent giao hàng chưa khớp order.','The delivery intent does not match this order.'));setOperation(data.operation);
 });
 const retry=()=>run(async current=>{
  if(!operation||!user)throw new UiError(uiMessage('Chưa có intent giao hàng.','The delivery intent is unavailable.'));
  const key=retryKey(operation.id),idempotencyKey=localStorage.getItem(key)||'delivery-retry:'+crypto.randomUUID();localStorage.setItem(key,idempotencyKey);
  const result=await operationRequest<{operation:TransactionOperation}>(token,'/api/delivery/operations/'+operation.id+'/retry',{idempotencyKey});if(!current())return;
  const next=requireDeliveryRetry(result,operation);localStorage.removeItem(checkpointKey(user.id,operation.id));setOperation(next);
 });
 const finish=()=>run(async current=>{
  if(!operation||!user)throw new UiError(uiMessage('Chưa có intent giao hàng.','The delivery intent is unavailable.'));let hash=operation.txHash||localBroadcast(user.id,operation.id);
  if(!hash){
   await preflightPreparedOperation(operation);if(!current())return;
   const response=await operationRequest<{operation:TransactionOperation}>(token,'/api/transactions/'+operation.id+'/ready',{});if(!current())return;
   const ready=requireReadyOperation(response,operation);setOperation(ready);
   if(account?.toLowerCase()!==ready.principal.toLowerCase())throw new UiError(uiMessage('Kết nối đúng ví seller trước khi ký.','Connect the seller wallet before signing.'));
   hash=(await broadcastPreparedOperation(ready,async txHash=>{
    broadcastCheckpoint(user.id,operation,txHash);if(current())setOperation({...ready,phase:'SUBMITTED',txHash});
    await operationRequest(token,'/api/transactions/'+operation.id+'/submit',{txHash});await observeBroadcast(token,operation.id,txHash);
   })).txHash;
  }
  if(!current())return;
  if(!hash)throw new UiError(uiMessage('Chưa có hash giao dịch. Kiểm tra lịch sử ví để phục hồi.','No transaction hash is available. Check wallet history for recovery.'));
  const result=await operationRequest<{operation:TransactionOperation}>(token,'/api/transactions/'+operation.id+'/recover',{txHash:hash});if(!current())return;
  requireProjected(result,operation,hash);requireMatchingOperation(result,operation);setOperation(result.operation);
  localStorage.removeItem(checkpointKey(user.id,operation.id));if(operation.deliveryRetry)localStorage.removeItem(retryKey(operation.deliveryRetry.previousOperationId));onDelivered();
 });
 const hash=operation&&(operation.txHash||(user&&localBroadcast(user.id,operation.id))),terminal=operation&&['REVERTED','SUPERSEDED'].includes(operation.phase);
 return <DialogSurface transaction busy={busy} label={text('Giao tài nguyên cho đơn #','Deliver resources for order #')+order.id} onClose={onClose}>
  <h2>{text('Giao tài nguyên cho đơn #','Deliver resources for order #')}{order.id}</h2><p>{order.campaignTitle} · {order.quantity} {text('đơn vị','units')}</p>
  <p>{text('Tài nguyên và quyền truy cập theo từng đơn vị được giữ theo license đã ghim. Buyer chỉ được tải sau receipt giao hàng đã xác minh.','Resources and access for each unit follow the pinned license. Buyer downloads open only after the delivery receipt is verified.')}</p>
  {error&&<p role="alert" className="notice notice-error">{messageText(error,language)}</p>}{loading&&<p role="status">{text('Đang tải intent giao hàng…','Loading delivery intents…')}</p>}
  {operation&&<dl className="detail-list"><dt>{text('Trạng thái intent','Intent status')}</dt><dd>{operationPhaseLabel(operation.phase,language)}</dd><dt>{text('Ví seller ký','Seller signing wallet')}</dt><dd className="address-value">{operation.principal}</dd><dt>{text('Proof tài nguyên','Resource proof')}</dt><dd className="address-value">{operation.expectedEventArgs.proofHash}</dd>{hash&&<><dt>{text('Hash đã gửi','Broadcast hash')}</dt><dd className="address-value">{hash}</dd></>}</dl>}
  {terminal&&<p>{text('Giao dịch cũ đã có kết quả thất bại hoặc nonce đã dùng. Chuẩn bị lại sẽ kiểm tra bằng chứng chain và SLA, giữ nguyên tài nguyên, license và lịch sử.','The previous transaction reverted or its nonce was consumed. Preparing a retry checks the chain outcome and delivery SLA while retaining the same resources, licenses and history.')}</p>}
  {operation?.deliveryRetry&&<p>{text('Tài nguyên từ intent cũ được giữ nguyên. Khả năng giao hàng được kiểm tra tại block ','Resources from the previous intent are retained. Delivery capability was checked at block ')}{operation.deliveryRetry.capability.blockNumber}. {text('Ký giao dịch mới bằng thao tác riêng bên dưới.','Sign the new transaction with the separate action below.')}</p>}
  {operation&&account?.toLowerCase()!==operation.principal.toLowerCase()&&!hash&&!terminal&&<p role="status">{text('Kết nối đúng ví seller hiển thị bên trên để ký.','Connect the seller wallet shown above before signing.')}</p>}
  <div className="action-row"><button className="btn btn-secondary" disabled={busy} onClick={onClose}>{text('Đóng','Close')}</button>
   {loadFailed&&<button className="btn btn-secondary" disabled={busy||loading} onClick={()=>void reload()}>{text('Tải lại intent giao hàng','Reload delivery intents')}</button>}
   {!operation&&!loadFailed&&!loading&&<button className="btn btn-primary" disabled={busy} onClick={()=>void prepare()}>{busy?text('Đang chuẩn bị…','Preparing…'):text('Chuẩn bị tài nguyên giao hàng','Prepare delivery resources')}</button>}
   {terminal&&<button className="btn btn-primary" disabled={busy||loading} onClick={()=>void retry()}>{busy?text('Đang kiểm tra…','Verifying…'):text('Chuẩn bị lại cùng tài nguyên','Prepare retry with same resources')}</button>}
   {operation&&!terminal&&operation.phase!=='PROJECTED'&&<button className="btn btn-primary" disabled={busy||loading||(!hash&&(operation.phase!=='PREPARED'||account?.toLowerCase()!==operation.principal.toLowerCase()))} onClick={()=>void finish()}>{busy?text('Đang xử lý…','Processing…'):hash?text('Xác minh receipt và mở quyền tải','Verify receipt and enable downloads'):text('Ký receipt giao hàng','Sign delivery transaction')}</button>}
   {operation&&!hash&&!terminal&&operation.phase!=='PREPARED'&&operation.phase!=='PROJECTED'&&<p role="status">{text('Intent đang chờ chữ ký/hash. Dùng lịch sử giao dịch để phục hồi hash đã gửi từ ví.','This intent is awaiting a signature or hash. Use transaction history to recover the broadcast hash.')}</p>}
   {operation?.phase==='PROJECTED'&&<p role="status">{text('Tài nguyên đã được mở cho buyer.','Resources are available to the buyer.')}</p>}
  </div>
 </DialogSurface>;
}
