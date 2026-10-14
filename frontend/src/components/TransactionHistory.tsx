import { useCallback,useEffect,useLayoutEffect,useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import {observeBroadcast, TransactionOperation,operationRequest,broadcastCheckpoint,checkpointKey,localBroadcast,requireProjected,requireExpiredBuy,requireReadyOperation,requireMatchingOperation } from "../services/transactionOperations";
import {useOperationScope} from '../hooks/useOperationScope';
import {displayUSDC} from "../services/orderAccounting";
import {useDealLanguage} from "./DealPresentation";
import {UiMessage,UiError,uiMessage,errorMessage,messageText} from "../utils/uiMessage";
import {circleRecoveryMessage} from '../services/circleOperationRecovery';
import {discoverExternalReceipt,discoveryMatches,type DiscoveredReceipt} from '../services/externalReceiptDiscovery';

const phases={PREPARED:"Đã chuẩn bị",AWAITING_SIGNATURE:"Đang chờ chữ ký hoặc hash từ ví",SUBMITTED:"Đã gửi; chờ xác minh",RECEIPT_VERIFIED:"Receipt đã xác minh; chờ ghép dữ liệu",PROJECTED:"Đã ghép dữ liệu",UNKNOWN:"Chưa xác minh được receipt",REVERTED:"Giao dịch revert",SUPERSEDED:"Nonce đã được giao dịch khác sử dụng",EXPIRED:"Chứng thực mua đã hết hạn, nonce chưa sử dụng"};
export const operationActions={PUBLISH:"Xuất bản deal",DELIVER:"Giao tài nguyên",BUY:"Cam kết mua",BUYER_CLAIM:"Rút rebate và tiền hoàn",SELLER_CLAIM:"Rút doanh thu",DISPUTE:"Mở tranh chấp",RESOLVE:"Phân xử",CONFIRM:"Xác nhận nhận hàng",BREACH:"Yêu cầu hoàn tiền quá SLA",SETTLE:"Quyết toán sau 48h"};
const englishPhases={PREPARED:"Prepared",AWAITING_SIGNATURE:"Awaiting wallet signature or hash",SUBMITTED:"Submitted; awaiting verification",RECEIPT_VERIFIED:"Receipt verified; awaiting projection",PROJECTED:"Projected",UNKNOWN:"Receipt not yet verified",REVERTED:"Transaction reverted",SUPERSEDED:"Nonce consumed by another transaction",EXPIRED:"Purchase authorization expired; nonce unused"};
const englishActions={PUBLISH:"Publish deal",DELIVER:"Deliver resource",BUY:"Commit purchase",BUYER_CLAIM:"Withdraw rebate and refunds",SELLER_CLAIM:"Withdraw proceeds",DISPUTE:"Open dispute",RESOLVE:"Resolve dispute",CONFIRM:"Confirm delivery",BREACH:"Request refund after SLA breach",SETTLE:"Settle after 48 hours"};
export function operationActionLabel(action:TransactionOperation['action'],language:'vi'|'en'){return language==='en'?englishActions[action]:operationActions[action];}
export function operationPhaseLabel(phase:TransactionOperation['phase'],language:'vi'|'en'){return language==='en'?englishPhases[phase]:phases[phase];}
function readHistoryPage(value:{operations:TransactionOperation[];pagination?:{nextCursor:string|null}}){
 const address=(v:unknown)=>typeof v==='string'&&/^0x[\da-fA-F]{40}$/.test(v),hash=(v:unknown)=>typeof v==='string'&&/^0x[\da-fA-F]{64}$/.test(v),record=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
 if(!value||!Array.isArray(value.operations)||value.operations.length>100||new Set(value.operations.map(o=>o?.id)).size!==value.operations.length||value.operations.some(o=>!o||typeof o.id!=='string'||!o.id||typeof o.resourceId!=='string'||!o.resourceId||!Object.prototype.hasOwnProperty.call(phases,o.phase)||!Object.prototype.hasOwnProperty.call(operationActions,o.action)||!address(o.principal)||!address(o.hubAddress)||!Number.isSafeInteger(o.chainId)||o.chainId<=0||typeof o.calldata!=='string'||!o.calldata.startsWith('0x')||o.txHash!==undefined&&!hash(o.txHash)||o.orderQuote!==undefined&&!record(o.orderQuote)||o.purchaseQuote!==undefined&&!record(o.purchaseQuote)||o.deliveryQuote!==undefined&&!record(o.deliveryQuote)||o.authorizationExpiry!==undefined&&!record(o.authorizationExpiry)||o.deliveryRetry!==undefined&&(!record(o.deliveryRetry)||!record(o.deliveryRetry.terminal)||!record(o.deliveryRetry.capability))||o.replacements!==undefined&&(!Array.isArray(o.replacements)||o.replacements.some(p=>!p||!hash(p.txHash)))||o.broadcastWitnesses!==undefined&&(!Array.isArray(o.broadcastWitnesses)||o.broadcastWitnesses.some(w=>!w||!hash(w.txHash))))||value.pagination!==undefined&&(!record(value.pagination)||!(value.pagination.nextCursor===null||typeof value.pagination.nextCursor==='string'&&value.pagination.nextCursor.length>0&&value.pagination.nextCursor.length<=2048)))throw new UiError(uiMessage('Lịch sử giao dịch chưa có dữ liệu hợp lệ. Giữ intent hiện tại và thử tải lại.','Transaction history has invalid data. Keep the current intents and reload.'));
 if(value.operations.some(o=>o.orderQuote&&!integer(o.orderQuote.blockNumber)||o.purchaseQuote&&!integer(o.purchaseQuote.blockNumber)||o.deliveryQuote&&!integer(o.deliveryQuote.blockNumber)||o.deliveryRetry&&(!integer(o.deliveryRetry.terminal.blockNumber)||!integer(o.deliveryRetry.capability.blockNumber)||typeof o.deliveryRetry.previousOperationId!=='string')||o.authorizationExpiry&&(!integer(o.authorizationExpiry.blockNumber)||!integer(o.authorizationExpiry.authorizationNonce))||o.replacements?.some(p=>!integer(p.blockNumber)||!integer(p.nonce)||!['SAME_CALL','NONCE_CONSUMED'].includes(p.kind))||o.broadcastWitnesses?.some(w=>!integer(w.nonce))))throw new UiError(uiMessage('Thông tin block/nonce trong lịch sử chưa hợp lệ. Giữ intent và thử tải lại.','History contains invalid block or nonce metadata. Keep the intents and reload.'));
 return {operations:value.operations,nextCursor:value.pagination?.nextCursor??null};
}
export function TransactionHistory({onRecovered}:{onRecovered?:()=>void}) {
  const {user,token}=useAuth(),{account,hubAddress,broadcastPreparedOperation,recoverCircleOperation,continueCircleOperation,preflightPreparedOperation,walletMode}=useWeb3(),{language,text}=useDealLanguage();
  const identity=JSON.stringify([user?.id,token,account?.toLowerCase(),walletMode]),scope=useOperationScope(identity);
  const [operations,setOperations]=useState<TransactionOperation[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<UiMessage|null>(null),[busy,setBusy]=useState<string|null>(null);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [circleNotice,setCircleNotice]=useState<UiMessage|null>(null);
  const [discovered,setDiscovered]=useState<{operation:TransactionOperation;receipt:DiscoveredReceipt}|null>(null);
  useLayoutEffect(()=>{setOperations([]);setNextCursor(null);setError(null);setCircleNotice(null);setDiscovered(null);setBusy(null);setLoading(true);},[identity]);
  const load=useCallback(async()=>{if(!user||!token){setLoading(false);return;}const ticket=scope.start();if(!ticket)return;setLoading(true);setError(null);setCircleNotice(null);try{const response=await operationRequest<{operations:TransactionOperation[];pagination?:{nextCursor:string|null}}>(token,"/api/transactions");if(!ticket.current())return;const page=readHistoryPage(response);setOperations(page.operations);setNextCursor(page.nextCursor);}catch(e){if(ticket.current())setError(errorMessage(e,uiMessage("Không tải được lịch sử","History could not be loaded")));}finally{if(ticket.current()){setLoading(false);ticket.finish();}}},[identity]);
  const loadMore=async()=>{if(!nextCursor||loading)return;const ticket=scope.start();if(!ticket)return;setLoading(true);setError(null);setCircleNotice(null);try{const response=await operationRequest<{operations:TransactionOperation[];pagination:{nextCursor:string|null}}>(token,"/api/transactions?cursor="+encodeURIComponent(nextCursor));if(!ticket.current())return;const page=readHistoryPage(response);setOperations(current=>[...new Map([...current,...page.operations].map(o=>[o.id,o])).values()]);setNextCursor(page.nextCursor);}catch(e){if(ticket.current())setError(errorMessage(e,uiMessage("Chưa tải được lịch sử cũ","Older history could not be loaded")));}finally{if(ticket.current()){setLoading(false);ticket.finish();}}};
  useEffect(()=>{void load();},[load]);
  const update=(operation:TransactionOperation)=>setOperations(current=>current.map(o=>o.id===operation.id?operation:o));
  const loadWithoutError=async(current:()=>boolean)=>{try{const response=await operationRequest<{operations:TransactionOperation[];pagination?:{nextCursor:string|null}}>(token,"/api/transactions");if(!current())return;const page=readHistoryPage(response);setOperations(page.operations);setNextCursor(page.nextCursor);}catch{/* Keep the actionable operation and previous error visible. */}};
  const act=async(operation:TransactionOperation,sign:boolean,providedHash?:string,continueCircle=false)=>{
    if(!user||!token)return;const ticket=scope.start();if(!ticket)return;setBusy(operation.id);setError(null);setCircleNotice(null);
    try {
      if(providedHash){if(!/^0x[0-9a-fA-F]{64}$/.test(providedHash))throw new UiError(uiMessage('Hash chưa hợp lệ.','The hash is invalid.'));broadcastCheckpoint(user.id,operation,providedHash);}
      let hash=operation.txHash||localBroadcast(user.id,operation.id);
      if(sign&&!hash) {
        let ready={operation};
        if(!continueCircle){await preflightPreparedOperation(operation);if(!ticket.current())return;const response=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/ready`,{});if(!ticket.current())return;ready={operation:requireReadyOperation(response,operation)};}
        if(account?.toLowerCase()!==ready.operation.principal.toLowerCase())throw new UiError(uiMessage("Kết nối ví principal hiển thị bên dưới trước khi ký","Connect the displayed principal wallet before signing"));
        const broadcast=continueCircle?continueCircleOperation:broadcastPreparedOperation;
        const result=await broadcast(ready.operation,async txHash=>{
          broadcastCheckpoint(user.id,operation,txHash);
          if(ticket.current())update({...ready.operation,phase:'SUBMITTED',txHash});
          await operationRequest(token,`/api/transactions/${operation.id}/submit`,{txHash});await observeBroadcast(token,operation.id,txHash);
        });
        hash=result.txHash;
      }
      if(!ticket.current())return;
      if(!hash)throw new UiError(uiMessage("Chưa có hash giao dịch. Nếu ví đã gửi, lấy hash từ lịch sử ví và dùng ô phục hồi.","No transaction hash is available. If your wallet broadcast it, copy its hash from wallet history for recovery."));
      const result=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/recover`,{txHash:hash});if(!ticket.current())return;requireProjected(result,operation,hash);const verified=requireMatchingOperation(result,operation);update(verified);
      localStorage.removeItem(checkpointKey(user.id,operation.id));await loadWithoutError(ticket.current);if(ticket.current())onRecovered?.();
    } catch(e){if(ticket.current()){setError(errorMessage(e,uiMessage("Receipt chưa xác minh; intent được giữ để phục hồi","The receipt is not verified; keep the intent for recovery")));await loadWithoutError(ticket.current);}}finally{if(ticket.current()){setBusy(null);ticket.finish();}}
  };
  const searchExternal=async(operation:TransactionOperation)=>{
    if(!user||!token||walletMode!=='EXTERNAL_REOWN')return;const ticket=scope.start();if(!ticket)return;setBusy(operation.id);setError(null);setDiscovered(null);setCircleNotice(uiMessage('Đang tra cứu receipt gần đây trên Arc…','Searching recent Arc receipts…'));
    const assertCurrent=()=>{if(!ticket.current())throw new UiError(uiMessage('Phiên hoặc ví đã thay đổi. Tra cứu lại trong đúng phiên.','The session or wallet changed. Search again in the correct session.'));};
    try{
      const expected=requireMatchingOperation(await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}`),operation);assertCurrent();
      if(expected.txHash||localBroadcast(user.id,expected.id)){update(expected);setCircleNotice(uiMessage('Đã có hash cho yêu cầu này. Dùng nút kiểm tra receipt để phục hồi.','This request already has a hash. Use receipt recovery.'));return;}
      // A receipt already associated with another owned intent must not be proposed for this one.
      const excluded=new Set<string>(),seenCursors=new Set<string>();let cursor:string|null=null;
      for(let page=0;page<5;page++){
        const query=new URLSearchParams({limit:'100',principal:expected.principal});if(cursor)query.set('cursor',cursor);
        const history=readHistoryPage(await operationRequest<{operations:TransactionOperation[];pagination?:{nextCursor:string|null}}>(token,'/api/transactions?'+query));assertCurrent();
        for(const other of history.operations)if(other.id!==expected.id){for(const hash of [other.txHash,...(other.broadcastWitnesses??[]).map(w=>w.txHash),...(other.replacements??[]).flatMap(r=>[r.previousTxHash,r.txHash])])if(hash)excluded.add(hash.toLowerCase());}
        cursor=history.nextCursor;if(!cursor)break;if(seenCursors.has(cursor)||page===4)throw new UiError(uiMessage('Chưa rà đủ lịch sử để đề xuất receipt. Giữ yêu cầu và dùng đúng hash từ ví.','History review is incomplete. Keep the request and use the correct wallet hash.'));seenCursors.add(cursor);
      }
      const result=await discoverExternalReceipt(expected,hubAddress,assertCurrent,undefined,excluded);assertCurrent();
      const latest=requireMatchingOperation(await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}`),expected);assertCurrent();update(latest);
      if(latest.txHash||localBroadcast(user.id,latest.id)){setCircleNotice(uiMessage('Server hoặc checkpoint đã ghi hash. Dùng nút kiểm tra receipt để phục hồi.','The server or checkpoint now has a hash. Use receipt recovery.'));return;}
      if(!['AWAITING_SIGNATURE','UNKNOWN'].includes(latest.phase))throw new UiError(uiMessage('Trạng thái yêu cầu đã thay đổi. Tải lại lịch sử trước khi tiếp tục.','The request state changed. Reload history before continuing.'));
      if(result.kind==='FOUND'){if(!discoveryMatches(result.receipt,latest))throw new UiError(uiMessage('Receipt không khớp yêu cầu đang giữ.','The receipt does not match the held request.'));setDiscovered({operation:latest,receipt:result.receipt});setCircleNotice(null);}
      else setCircleNotice(result.kind==='AMBIGUOUS'?uiMessage('Có nhiều giao dịch khớp lời gọi. Giữ yêu cầu; lấy đúng hash từ lịch sử ví để phục hồi.','Multiple transactions match the call. Keep the request and use the correct hash from wallet history.'):uiMessage('Chưa tìm thấy receipt khớp trong 2.048 block finalized gần đây. Giữ yêu cầu; có thể tra lại hoặc dùng hash từ lịch sử ví. Kết quả này chưa chứng minh giao dịch đã hủy.','No matching receipt was found in the latest 2,048 finalized blocks. Keep the request, search again or use wallet history. This does not prove cancellation.'));
    }catch(e){if(ticket.current()){setCircleNotice(null);setError(errorMessage(e,uiMessage('Chưa tra cứu được receipt. Giữ yêu cầu hiện tại.','Receipt search is unavailable. Keep the current request.')));}}finally{if(ticket.current()){setBusy(null);ticket.finish();}}
  };
  const recoverDiscovered=async()=>{
    if(!user||!token||!discovered||walletMode!=='EXTERNAL_REOWN')return;const ticket=scope.start();if(!ticket)return;const {operation,receipt}=discovered;setBusy(operation.id);setError(null);setCircleNotice(null);
    try{
      const current=requireMatchingOperation(await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}`),operation);if(!ticket.current())return;
      if(!discoveryMatches(receipt,current)||current.txHash&&current.txHash.toLowerCase()!==receipt.txHash||!['AWAITING_SIGNATURE','UNKNOWN','SUBMITTED','RECEIPT_VERIFIED','PROJECTED'].includes(current.phase))throw new UiError(uiMessage('Yêu cầu đã thay đổi; giữ hash và tải lại lịch sử.','The request changed. Keep the hash and reload history.'));
      if(current.phase==='PROJECTED'){requireProjected({operation:current},operation,receipt.txHash);update(current);setDiscovered(null);if(localBroadcast(user.id,current.id)?.toLowerCase()===receipt.txHash)localStorage.removeItem(checkpointKey(user.id,current.id));onRecovered?.();return;}
      broadcastCheckpoint(user.id,current,receipt.txHash);update({...current,txHash:receipt.txHash,phase:'SUBMITTED'});
      const result=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${current.id}/recover`,{txHash:receipt.txHash});if(!ticket.current())return;
      requireProjected(result,current,receipt.txHash);update(requireMatchingOperation(result,current));localStorage.removeItem(checkpointKey(user.id,current.id));setDiscovered(null);await loadWithoutError(ticket.current);if(ticket.current())onRecovered?.();
    }catch(e){if(ticket.current()){setError(errorMessage(e,uiMessage('Server chưa xác minh và ghép receipt. Giữ hash và yêu cầu để phục hồi.','The server has not verified and projected the receipt. Keep the hash and request for recovery.')));await loadWithoutError(ticket.current);}}finally{if(ticket.current()){setBusy(null);ticket.finish();}}
  };
  const observe=async(operation:TransactionOperation)=>{
    if(!user||!token||!operation.txHash)return;const ticket=scope.start();if(!ticket)return;setBusy(operation.id);setError(null);setCircleNotice(null);
    try{await operationRequest(token,`/api/transactions/${operation.id}/observe`,{txHash:operation.txHash});if(ticket.current())await loadWithoutError(ticket.current);}
    catch(e){if(ticket.current())setError(errorMessage(e,uiMessage("Chưa ghi nhận được nonce từ RPC; giữ intent và hash.","RPC has not confirmed the nonce; keep the intent and hash.")));}finally{if(ticket.current()){setBusy(null);ticket.finish();}}
  };
  const checkCircle=async(operation:TransactionOperation)=>{
    if(!user||!token)return;const ticket=scope.start();if(!ticket)return;setBusy(operation.id);setError(null);setCircleNotice(null);
    try{const status=await recoverCircleOperation(operation);if(!ticket.current())return;const hash=status.transaction?.txHash;
      if(!hash){setCircleNotice(circleRecoveryMessage(status));return;}
      broadcastCheckpoint(user.id,operation,hash);update({...operation,phase:'SUBMITTED',txHash:hash});
      await operationRequest(token,`/api/transactions/${operation.id}/submit`,{txHash:hash});if(!ticket.current())return;
      await observeBroadcast(token,operation.id,hash);if(!ticket.current())return;
      const result=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/recover`,{txHash:hash});if(!ticket.current())return;requireProjected(result,operation,hash);update(requireMatchingOperation(result,operation));
      localStorage.removeItem(checkpointKey(user.id,operation.id));await loadWithoutError(ticket.current);if(ticket.current())onRecovered?.();
    }catch(e){if(ticket.current()){setError(errorMessage(e,uiMessage('Chưa xác minh được trạng thái Circle; intent được giữ để kiểm tra lại.','Circle status could not be verified. Keep the intent for review.')));await loadWithoutError(ticket.current);}}finally{if(ticket.current()){setBusy(null);ticket.finish();}}
  };
  const expire=async(operation:TransactionOperation)=>{
    if(!user||!token)return;const ticket=scope.start();if(!ticket)return;setBusy(operation.id);setError(null);setCircleNotice(null);
    try{
      const result=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/expire`,{});if(!ticket.current())return;update(requireExpiredBuy(result,operation));
      localStorage.removeItem(checkpointKey(user.id,operation.id));
    }catch(e){if(ticket.current())setError(errorMessage(e,uiMessage("Chưa xác minh được thời hạn và nonce; giữ intent mua.","The deadline and nonce are not verified; keep the purchase intent.")));}finally{if(ticket.current()){await loadWithoutError(ticket.current);if(ticket.current()){setBusy(null);ticket.finish();}}}
  };
  const replace=async(operation:TransactionOperation,form:HTMLFormElement)=>{
    if(!user||!token||!operation.txHash)return;const ticket=scope.start();if(!ticket)return;const fields=new FormData(form),txHash=String(fields.get("replacementHash")||""),raw=String(fields.get("signedOriginal")||"").trim();setBusy(operation.id);setError(null);setCircleNotice(null);
    try{
      const result=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/replace`,{previousTxHash:operation.txHash,txHash,...(raw?{rawOriginalTransaction:raw}:{})});
      if(!ticket.current())return;
      const current=requireMatchingOperation(result,operation),proof=current.replacements?.find(r=>r.previousTxHash.toLowerCase()===operation.txHash!.toLowerCase()&&r.txHash.toLowerCase()===txHash.toLowerCase());
      if(!proof||(current.phase==='SUPERSEDED'?proof.kind!=='NONCE_CONSUMED':proof.kind!=='SAME_CALL'))throw new UiError(uiMessage("Chưa có bằng chứng thay thế cho intent này; giữ checkpoint.","This intent has no matching replacement proof; keep the checkpoint."));
      form.reset();
      if(current.phase==="SUPERSEDED")localStorage.removeItem(checkpointKey(user.id,operation.id));
      else {
        if(current.txHash?.toLowerCase()!==txHash.toLowerCase())throw new UiError(uiMessage("Hash thay thế chưa được gắn vào intent; giữ checkpoint.","The replacement hash is not bound to this intent; keep the checkpoint."));
        broadcastCheckpoint(user.id,current,txHash);
        const recovered=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${operation.id}/recover`,{txHash});if(!ticket.current())return;requireProjected(recovered,current,txHash);update(requireMatchingOperation(recovered,current));
        localStorage.removeItem(checkpointKey(user.id,operation.id));if(ticket.current())onRecovered?.();
      }
    }catch(e){if(ticket.current())setError(errorMessage(e,uiMessage("Chưa xác minh được giao dịch thay thế; intent được giữ lại.","The replacement transaction is not verified; keep the intent.")));}finally{if(ticket.current()){await loadWithoutError(ticket.current);if(ticket.current()){setBusy(null);ticket.finish();}}}
  };
  const money=(value:unknown)=>{try{return typeof value==='string'&&/^\d{1,78}$/.test(value)?displayUSDC(value):text('Chưa xác minh','Unverified');}catch{return text('Chưa xác minh','Unverified');}};
  return <section className="glass-card transaction-history" aria-labelledby="transaction-history-title">
    <h2 id="transaction-history-title">{text("Lịch sử và phục hồi giao dịch","Transaction history and recovery")}</h2><p className="muted">{text("Receipt chưa xác minh sẽ được giữ lại để kiểm tra. Kiểm tra lịch sử ví trước khi ký một intent chưa có hash trên server.","Unverified receipts are retained for recovery. Check wallet history before signing an intent with no server hash.")}</p>
    {error&&<p role="alert" className="notice notice-error">{messageText(error,language)}</p>}
    {circleNotice&&<p role="status" className="notice">{messageText(circleNotice,language)}</p>}
    <button type="button" className="btn btn-secondary" disabled={loading||!!busy} onClick={()=>void load()}>{text("Tải lại lịch sử","Reload history")}</button>
    {!user&&<p role="status">{text("Đăng nhập để xem lịch sử giao dịch.","Sign in to view transaction history.")}</p>}
    {loading&&<p role="status">{text("Đang tải lịch sử…","Loading history…")}</p>}
    {user&&!loading&&!error&&operations.length===0&&<p>{text("Chưa có intent giao dịch.","No transaction intents yet.")}</p>}
    <ul className="operation-list">{operations.map(operation=>{
      const hash=operation.txHash||(user?localBroadcast(user.id,operation.id):undefined);
      const resumable=operation.phase==="PREPARED"&&!hash;
      return <li key={operation.id}><h3>{language==="en"?englishActions[operation.action]:operationActions[operation.action]} · {language==="en"?englishPhases[operation.phase]:phases[operation.phase]}</h3><p className="address-value">{operation.resourceId}</p><p className="address-value">Principal: {operation.principal}</p>{hash&&<a className="address-value" href={`https://testnet.arcscan.app/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a>}
        {operation.orderQuote&&<p>{text("Quote tại block","Quote at block")} {operation.orderQuote.blockNumber}: {money(operation.orderQuote.remainingGross)} USDC {text("chưa phân bổ.","unallocated.")}{operation.orderQuote.buyerShare!==undefined&&<> Buyer: {money(operation.orderQuote.buyerShare)} USDC; seller: {money(operation.orderQuote.sellerShare)} USDC.</>} {text("Bằng chứng riêng đã lưu trên server.","Private evidence has been saved on the server.")}</p>}
        {operation.purchaseQuote&&<p>{text("Tiền hàng theo quote:","Quoted commitment:")} {money(operation.purchaseQuote.commitmentAmount)} USDC; {text("giới hạn đã duyệt:","approved cap:")} {money(operation.purchaseQuote.maxGrossAmount)} USDC. {text("Giá và gas được kiểm lại trước khi ký.","Price and gas are checked again before signing.")}</p>}
        {operation.deliveryRetry&&<p>{text("Thử lại từ intent giao hàng","Retry of delivery intent")} <span className="address-value">{operation.deliveryRetry.previousOperationId}</span>. {text("Kết thúc cũ được xác minh tại block","Previous outcome verified at block")} {operation.deliveryRetry.terminal.blockNumber}; {text("khả năng giao hàng kiểm tại block","delivery capability checked at block")} {operation.deliveryRetry.capability.blockNumber}. {text("Giữ nguyên tài nguyên và grant; đây chưa phải receipt giao hàng.","Resources and grants are preserved; this is not a delivery receipt.")}</p>}
        {operation.deliveryQuote&&<p>{text("Điều kiện giao hàng trước chữ ký đã kiểm tại block","Pre-signature delivery conditions checked at block")} {operation.deliveryQuote.blockNumber}. {text("Cần receipt và projection trước khi cấp quyền tải.","A receipt and projection are required before download access is granted.")}</p>}
        {operation.replacements?.map(proof=><p key={proof.txHash}>Nonce {proof.nonce} {text("tại block","at block")} {proof.blockNumber}: {proof.kind==="SAME_CALL"?text("Cùng lời gọi; cần receipt và projection của hash mới","Same call; the new hash still needs a receipt and projection"):text("Nonce đã dùng bởi lời gọi khác; chưa suy ra kết quả tài chính","Nonce consumed by another call; no financial outcome is inferred")}. <a className="address-value" href={`https://testnet.arcscan.app/tx/${proof.txHash}`} target="_blank" rel="noreferrer">{proof.txHash}</a></p>)}
        {operation.authorizationExpiry&&<p>{text("Chứng thực hết hạn được xác minh tại block","Authorization expiry verified at block")} {operation.authorizationExpiry.blockNumber}, nonce {operation.authorizationExpiry.authorizationNonce} {text("chưa sử dụng tại block này. Lượt mua này không tạo đơn từ bằng chứng hết hạn; muốn mua tiếp, quay về deal và yêu cầu quote mới. Hash cũ vẫn được giữ trong lịch sử ví.","unused at this block. Expiry proof does not create an order. Return to the deal to request a fresh quote for another purchase. The old hash remains in wallet history.")}</p>}
        {!["PROJECTED","REVERTED","SUPERSEDED"].includes(operation.phase)&&<div className="action-row">
          {operation.action==="BUY"&&["PREPARED","AWAITING_SIGNATURE","SUBMITTED","UNKNOWN"].includes(operation.phase)&&<button type="button" className="btn btn-secondary" disabled={!!busy} onClick={()=>void expire(operation)}>{text("Kiểm tra chứng thực hết hạn trên chain","Check authorization expiry on chain")}</button>}
          {hash&&<button className="btn btn-primary" disabled={!!busy} onClick={()=>void act(operation,false)}>{busy===operation.id?text("Đang xác minh…","Verifying…"):text("Kiểm tra receipt và phục hồi","Check receipt and recover")}</button>}
          {resumable&&<button className="btn btn-secondary" disabled={!!busy||account?.toLowerCase()!==operation.principal.toLowerCase()} onClick={()=>void act(operation,true)}>{text("Ký intent đã chuẩn bị","Sign prepared intent")}</button>}
          {!hash&&walletMode==='CIRCLE_EMBEDDED'&&<button type="button" className="btn btn-secondary" disabled={!!busy||loading||account?.toLowerCase()!==operation.principal.toLowerCase()} onClick={()=>void checkCircle(operation)}>{text('Kiểm tra trạng thái Circle','Check Circle status')}</button>}
          {!hash&&walletMode==='CIRCLE_EMBEDDED'&&operation.phase==='AWAITING_SIGNATURE'&&operation.action!=='BUY'&&<button type="button" className="btn btn-secondary" disabled={!!busy||loading||account?.toLowerCase()!==operation.principal.toLowerCase()} onClick={()=>void act(operation,true,undefined,true)}>{text('Tiếp tục xác thực Circle','Continue Circle authentication')}</button>}
          {!hash&&walletMode==='EXTERNAL_REOWN'&&['AWAITING_SIGNATURE','UNKNOWN'].includes(operation.phase)&&<button type="button" className="btn btn-secondary" aria-busy={busy===operation.id||undefined} disabled={!!busy||loading} onClick={()=>void searchExternal(operation)}>{text('Tra cứu receipt gần đây','Search recent receipts')}</button>}
          {discovered?.operation.id===operation.id&&!hash&&<div className="transaction-recovery-candidate" role="status"><p>{text('RPC tìm thấy receipt của lời gọi này tại block','RPC found a receipt for this call at block')} {discovered.receipt.blockNumber}. {text('Server cần xác minh và ghép dữ liệu trước khi hoàn tất.','Server verification and projection are required before completion.')}</p><p><a className="address-value" href={`https://testnet.arcscan.app/tx/${discovered.receipt.txHash}`} target="_blank" rel="noreferrer">{discovered.receipt.txHash}</a></p><button type="button" className="btn btn-primary" disabled={!!busy||loading} onClick={()=>void recoverDiscovered()}>{text('Phục hồi receipt đã tìm','Recover found receipt')}</button></div>}
          {!hash&&<form onSubmit={e=>{e.preventDefault();const txHash=new FormData(e.currentTarget).get("txHash");if(user&&typeof txHash==="string"&&/^0x[0-9a-fA-F]{64}$/.test(txHash)){void act(operation,false,txHash);}}}><label htmlFor={`recover-${operation.id}`}>{text("Hash đã gửi từ ví","Hash broadcast by your wallet")}<input id={`recover-${operation.id}`} name="txHash" className="form-input address-value" pattern="0x[0-9a-fA-F]{64}" required autoComplete="off" disabled={!!busy||loading}/></label><button className="btn btn-secondary" disabled={!!busy}>{text("Phục hồi theo hash","Recover using hash")}</button></form>}
          {operation.txHash&&<details><summary>{text("Phục hồi giao dịch tăng phí hoặc hủy từ ví","Recover a wallet speed-up or cancellation")}</summary>
            <p>{text("Server kiểm tra cùng principal và nonce, receipt cùng block và vị trí giao dịch trên chain. RPC không tìm thấy hash chưa đủ kết luận giao dịch đã hủy.","The server checks principal, nonce, canonical receipt and transaction position. An unavailable RPC hash does not prove cancellation.")}</p>
            <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={()=>void observe(operation)}>{text("Ghi nhận nonce từ giao dịch đã gửi","Record nonce from submitted transaction")}</button>
            {operation.broadcastWitnesses?.map(witness=><p key={witness.txHash}>{text("Nonce đã ghi nhận:","Recorded nonce:")} {witness.nonce} · <span className="address-value">{witness.txHash}</span></p>)}
            <form onSubmit={e=>{e.preventDefault();void replace(operation,e.currentTarget);}}>
              <label htmlFor={`replace-${operation.id}`}>{text("Hash giao dịch thay thế đã có receipt","Replacement transaction hash with a mined receipt")}<input id={`replace-${operation.id}`} name="replacementHash" className="form-input address-value" required pattern="0x[0-9a-fA-F]{64}" autoComplete="off"/></label>
              <label htmlFor={`signed-${operation.id}`}>{text("Giao dịch gốc đã ký (tùy chọn, khi RPC không còn bản gốc)","Signed original transaction (optional if RPC no longer has it)")}<textarea id={`signed-${operation.id}`} name="signedOriginal" className="form-input address-value" maxLength={131074} autoComplete="off" disabled={!!busy||loading}/></label>
              <p className="muted">{text("Chỉ dùng serialized signed transaction từ ví. Không nhập private key, seed phrase hoặc OTP. Nội dung này không được lưu vào checkpoint.","Use only the serialized signed transaction from your wallet. Do not enter a private key, seed phrase or OTP. This input is not saved in the checkpoint.")}</p>
              <button className="btn btn-secondary" disabled={!!busy}>{text("Xác minh giao dịch thay thế","Verify replacement transaction")}</button>
            </form>
          </details>}
        </div>}
      </li>;
    })}</ul>{nextCursor&&<button className="btn btn-secondary" disabled={loading||!!busy} onClick={()=>void loadMore()}>{text("Tải thêm lịch sử","Load older history")}</button>}
  </section>;
}
