import {useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useWeb3} from '../context/Web3Context';
import {useOperationScope} from '../hooks/useOperationScope';
import {displayUSDC} from '../services/orderAccounting';
import {observeBroadcast,TransactionOperation,operationRequest,broadcastCheckpoint,checkpointKey,localBroadcast,requireProjected,requireReadyOperation,requireMatchingOperation,managedOperationError} from '../services/transactionOperations';
import {UiMessage,UiError,uiMessage,messageText} from '../utils/uiMessage';
import {useDealLanguage} from './DealPresentation';
import {DialogSurface} from './DialogSurface';

export function ManagedClaim({action,campaignId,orderId,principal,amount,onClaimed}:{action:'BUYER_CLAIM'|'SELLER_CLAIM';campaignId:string;orderId:string;principal:string;amount:bigint;onClaimed:()=>void}){
 const {user,token}=useAuth(),{account,broadcastPreparedOperation}=useWeb3(),{language,text}=useDealLanguage();
 const identity=JSON.stringify([user?.id,token,account?.toLowerCase(),action,campaignId,orderId,principal.toLowerCase()]),scope=useOperationScope(identity);
 const [open,setOpen]=useState(false),[operation,setOperation]=useState<TransactionOperation|null>(null),[error,setError]=useState<UiMessage|null>(null),[busy,setBusy]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null);
 useLayoutEffect(()=>{setOpen(false);setOperation(null);setError(null);setBusy(false);},[identity]);
 const walletMatches=account?.toLowerCase()===principal.toLowerCase(),retryKey=user?`groupdeal_claim:${user.id}:${action}:${campaignId}:${orderId}`:'';
 const prepare=async()=>{
  if(!user||!walletMatches)return;const ticket=scope.start();if(!ticket)return;setBusy(true);setError(null);
  try{
   const key=localStorage.getItem(retryKey)||`claim:${crypto.randomUUID()}`;localStorage.setItem(retryKey,key);
   const result=await operationRequest<{operation:TransactionOperation}>(token,'/api/transactions/claims/prepare',{action,campaignId,orderIds:[orderId],idempotencyKey:key});if(!ticket.current())return;
   const current=result.operation;
   if(!current||current.action!==action||current.resourceId!==campaignId||current.principal?.toLowerCase()!==principal.toLowerCase())throw new UiError(uiMessage('Intent khoản rút không khớp chiến dịch hoặc ví.','The withdrawal intent does not match the campaign or wallet.'));
   if(['REVERTED','SUPERSEDED'].includes(current.phase)){localStorage.removeItem(retryKey);throw new UiError(uiMessage('Intent trước đã kết thúc trên chain. Kiểm tra lại khoản rút trước khi chuẩn bị intent mới.','The previous intent ended on chain. Review the withdrawal before preparing a new intent.'));}
   // Preparing an existing PROJECTED intent still requires exact receipt recovery.
   setOperation(current);setOpen(true);
  }catch(e){if(ticket.current())setError(managedOperationError(e,uiMessage('Chưa chuẩn bị được khoản rút.','The withdrawal could not be prepared.')));}finally{if(ticket.current()){setBusy(false);ticket.finish();}}
 };
 const act=async(sign:boolean)=>{
  if(!user||!operation)return;const ticket=scope.start();if(!ticket)return;setBusy(true);setError(null);
  try{
   let hash=operation.txHash||localBroadcast(user.id,operation.id);
   if(sign&&!hash){
    const response=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/ready`,{});if(!ticket.current())return;
    const ready=requireReadyOperation(response,operation);setOperation(ready);
    if(!walletMatches)throw new UiError(uiMessage('Kết nối đúng ví principal trước khi ký.','Connect the principal wallet before signing.'));
    hash=(await broadcastPreparedOperation(ready,async txHash=>{
     broadcastCheckpoint(user.id,ready,txHash);if(ticket.current())setOperation({...ready,phase:'SUBMITTED',txHash});
     await operationRequest(token,`/api/transactions/${ready.id}/submit`,{txHash});await observeBroadcast(token,ready.id,txHash);
    })).txHash;
   }
   if(!ticket.current())return;
   if(!hash)throw new UiError(uiMessage('Kiểm tra lịch sử ví/Circle để lấy hash của intent đang chờ; chưa ký lại.','Check wallet or Circle history for the pending intent hash before signing again.'));
   const result=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/recover`,{txHash:hash});if(!ticket.current())return;
   requireProjected(result,operation,hash);requireMatchingOperation(result,operation);setOperation(result.operation);
   localStorage.removeItem(checkpointKey(user.id,operation.id));localStorage.removeItem(retryKey);setOpen(false);onClaimed();
  }catch(e){if(!ticket.current())return;setError(managedOperationError(e,uiMessage('Chưa xác minh được receipt; giữ intent để phục hồi.','The receipt is unverified. Keep the intent for recovery.')));
   try{const result=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}`);if(ticket.current()){const current=requireMatchingOperation(result,operation);if(current.phase!=='PROJECTED')setOperation(current);}}catch{/* Retain the reviewed intent and durable hash. */}
  }finally{if(ticket.current()){setBusy(false);ticket.finish();}}
 };
 const hash=operation&&(operation.txHash||(user?localBroadcast(user.id,operation.id):undefined));
 let quoted=text('Chưa xác minh','Unverified');try{if(operation?.financialQuote)quoted=displayUSDC(BigInt(operation.financialQuote.amountBaseUnits));}catch{/* Invalid quote cannot become a balance. */}
 return <>
  <button ref={trigger} type="button" className="btn btn-sm btn-success" disabled={busy||!walletMatches} onClick={()=>void prepare()}>{busy?text('Đang kiểm tra…','Verifying…'):text(`Rút $${displayUSDC(amount)} USDC`,`Withdraw $${displayUSDC(amount)} USDC`)}</button>
  {!walletMatches&&<span className="muted">{text('Kết nối ví principal của khoản tiền để rút.','Connect the principal wallet for this withdrawal.')}</span>}
  {error&&!open&&<p role="alert">{messageText(error,language)}</p>}
  {open&&<DialogSurface transaction busy={busy} returnFocus={()=>trigger.current} label={text('Kiểm tra khoản rút trên Arc','Review withdrawal on Arc')} onClose={()=>setOpen(false)}>
   <h2>{text('Kiểm tra khoản rút trên Arc','Review withdrawal on Arc')}</h2>
   <p>{text('Số tiền mô phỏng tại block','Simulated amount at block')} {operation?.financialQuote?.blockNumber}: <strong>{quoted} USDC</strong>.</p>
   <p className="muted">{text('Quote được kiểm tra lại trước chữ ký. Khoản thực nhận được xác nhận bằng receipt và đối soát trên chain.','The quote is checked again before signing. The received amount is verified by the receipt and onchain reconciliation.')}</p>
   <p className="address-value">Principal: {operation?.principal}</p>
   {error&&<p role="alert" className="notice notice-error">{messageText(error,language)}</p>}
   <div className="action-row">
    {operation?.phase==='PREPARED'&&!hash&&<button className="btn btn-primary" disabled={busy||!walletMatches} onClick={()=>void act(true)}>{text('Ký rút tiền đã kiểm tra','Sign reviewed withdrawal')}</button>}
    {hash&&<button className="btn btn-primary" disabled={busy} onClick={()=>void act(false)}>{text('Kiểm tra receipt và phục hồi khoản rút','Verify receipt and recover withdrawal')}</button>}
    {operation?.phase==='AWAITING_SIGNATURE'&&!hash&&<p role="status">{text('Intent đang chờ ví trả hash. Giữ intent và kiểm tra lịch sử ví trước khi tiếp tục.','This intent is awaiting a wallet hash. Retain it and check wallet history before continuing.')}</p>}
    <button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>setOpen(false)}>{text('Đóng','Close')}</button>
   </div>
  </DialogSurface>}
 </>;
}
