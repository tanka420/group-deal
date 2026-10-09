import {UiError,uiMessage,type UiMessage} from "../utils/uiMessage";
import {signerHoldMessage} from "./signerHoldMessage";
/** Managed review dialogs show bounded bilingual errors rather than provider/API diagnostics. */
export function managedOperationError(error:unknown,fallback:UiMessage):UiMessage {return error instanceof UiError?error.displayMessage:fallback;}
export interface TransactionOperation {
  id:string;action:"PUBLISH"|"DELIVER"|"BUY"|"BUYER_CLAIM"|"SELLER_CLAIM"|"DISPUTE"|"RESOLVE"|"CONFIRM"|"BREACH"|"SETTLE";
  resourceId:string;chainId:number;hubAddress:string;principal:string;calldata:string;
  phase:"PREPARED"|"AWAITING_SIGNATURE"|"SUBMITTED"|"RECEIPT_VERIFIED"|"PROJECTED"|"UNKNOWN"|"REVERTED"|"SUPERSEDED"|"EXPIRED";
  txHash?:string;createdAt:number;updatedAt:number;expectedEventArgs:Record<string,string|number>;
  financialQuote?:{kind:"READ_ONLY_SIMULATION";blockNumber:number;blockHash:string;amountBaseUnits:string};
  purchaseQuote?:{blockNumber:number;blockHash:string;lockedUnitPrice:string;commitmentAmount:string;maxGrossAmount:string;authorizationNonce:number;termsHash:string};
  projectedOrderId?:string;
  authorizationExpiry?:{blockNumber:number;blockHash:string;blockTimestamp:number;deadline:number;authorizationNonce:number;quoteBlockNumber:number;quoteBlockHash:string;authorizationSigner:string;verifiedAt:number};
  deliveryRetry?:{previousOperationId:string;terminal:{phase:"REVERTED"|"SUPERSEDED";txHash:string;blockNumber:number;blockHash:string};capability:{blockNumber:number;blockHash:string;checkedAt:number}};
  deliveryQuote?:{blockNumber:number;blockHash:string;checkedAt:number};
  broadcastWitnesses?:{txHash:string;nonce:number;observedAt:number;source:"SIGNED_TRANSACTION"|"RPC_TRANSACTION"}[];
  replacements?:{previousTxHash:string;txHash:string;nonce:number;blockNumber:number;blockHash:string;kind:"SAME_CALL"|"NONCE_CONSUMED";verifiedAt:number}[];
  orderQuote?:{kind:"READ_ONLY_SIMULATION";blockNumber:number;blockHash:string;remainingGross:string;buyerShare?:string;sellerShare?:string;disputeDeadline:number};
}
/** Release a BUY retry only for the same server intent with its explicit non-financial chain expiry proof. */
export function requireExpiredBuy(result:{operation?:TransactionOperation},expected:TransactionOperation):TransactionOperation {
  const current=result.operation,proof=current?.authorizationExpiry,quote=expected.purchaseQuote,equal=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
  if(!current||current.id!==expected.id||current.action!=="BUY"||current.phase!=="EXPIRED"||current.resourceId!==expected.resourceId||current.chainId!==expected.chainId
    ||!equal(current.hubAddress,expected.hubAddress)||!equal(current.principal,expected.principal)||current.calldata!==expected.calldata||!proof||!quote
    ||!Number.isSafeInteger(proof.blockNumber)||proof.blockNumber<quote.blockNumber||!/^0x[0-9a-fA-F]{64}$/.test(proof.blockHash)
    ||!Number.isSafeInteger(proof.deadline)||proof.deadline<0||!Number.isSafeInteger(proof.blockTimestamp)||proof.blockTimestamp<=proof.deadline
    ||proof.authorizationNonce!==quote.authorizationNonce||proof.quoteBlockNumber!==quote.blockNumber||!equal(proof.quoteBlockHash,quote.blockHash)
    ||!/^0x[0-9a-fA-F]{40}$/.test(proof.authorizationSigner)||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt<=0)throw new UiError(uiMessage("Chưa có bằng chứng hết hạn cho đúng intent mua. Giữ yêu cầu để kiểm tra lại.","This purchase intent has no matching expiry proof. Keep it for recovery."));
  return current;
}
export function requireProjected(result:{operation?:TransactionOperation},expected:TransactionOperation,txHash:string):TransactionOperation {
  const operation=result.operation;
  if(!operation||operation.id!==expected.id||operation.phase!=="PROJECTED"||operation.txHash?.toLowerCase()!==txHash.toLowerCase())throw new UiError(uiMessage("Chưa có projection đã xác minh cho giao dịch này; giữ checkpoint và intent để phục hồi.","This transaction has no verified projection yet. Keep its checkpoint and intent for recovery."));
  return operation;
}
/** Status updates cannot replace the immutable call that was reviewed. */
export function requireMatchingOperation(result:{operation?:TransactionOperation},expected:TransactionOperation):TransactionOperation {
 const current=result.operation,equal=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
 if(!current||current.id!==expected.id||current.action!==expected.action||current.resourceId!==expected.resourceId||current.chainId!==expected.chainId||!equal(current.hubAddress,expected.hubAddress)||!equal(current.principal,expected.principal)||current.calldata!==expected.calldata)throw new UiError(uiMessage('Phản hồi không khớp intent đã xem. Giữ yêu cầu để phục hồi.','The response does not match the reviewed intent. Keep the request for recovery.'));
 return current;
}
/** Signing is allowed only for the same immutable operation with a reserved signature phase. */
export function requireReadyOperation(result:{operation?:TransactionOperation},expected:TransactionOperation):TransactionOperation {
  const ready=result.operation,equal=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
  if(!ready||ready.id!==expected.id||ready.action!==expected.action||ready.resourceId!==expected.resourceId||ready.chainId!==expected.chainId||!equal(ready.hubAddress,expected.hubAddress)||!equal(ready.principal,expected.principal)||ready.calldata!==expected.calldata||ready.phase!=="AWAITING_SIGNATURE"||ready.txHash)throw new UiError(uiMessage("Response chưa dành chữ ký cho đúng intent đã xem. Giữ yêu cầu để phục hồi.","The response has no signature reservation for the reviewed intent. Keep the request for recovery."));
  return ready;
}
export function requireDeliveryRetry(result:{operation?:TransactionOperation},previous:TransactionOperation):TransactionOperation {
  const next=result.operation,proof=next?.deliveryRetry,equal=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase(),hash=(value?:string)=>!!value&&/^0x[0-9a-fA-F]{64}$/.test(value);
  if(!next||next.id===previous.id||next.action!=="DELIVER"||next.resourceId!==previous.resourceId||next.chainId!==previous.chainId||!equal(next.hubAddress,previous.hubAddress)||!equal(next.principal,previous.principal)||next.calldata!==previous.calldata||next.expectedEventArgs.proofHash!==previous.expectedEventArgs.proofHash||!proof||proof.previousOperationId!==previous.id||proof.terminal.phase!==previous.phase||!hash(proof.terminal.txHash)||!hash(proof.terminal.blockHash)||!Number.isSafeInteger(proof.terminal.blockNumber)||proof.terminal.blockNumber<1||!hash(proof.capability.blockHash)||!Number.isSafeInteger(proof.capability.blockNumber)||proof.capability.blockNumber<proof.terminal.blockNumber||!Number.isSafeInteger(proof.capability.checkedAt)||proof.capability.checkedAt<=0||previous.phase==="REVERTED"&&!equal(proof.terminal.txHash,previous.txHash))throw new UiError(uiMessage("Chưa có bằng chứng thử lại với đúng tài nguyên và intent cũ. Giữ yêu cầu để phục hồi.","There is no matching retry proof for the original delivery and resources. Keep the request for recovery."));
  return next;
}
export async function operationRequest<T>(token:string|null,path:string,body?:unknown,headers?:Record<string,string>):Promise<T> {
  if(!token)throw new UiError(uiMessage("Đăng nhập để tiếp tục","Sign in to continue"));
  const response=await fetch(path,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>{throw new UiError(uiMessage("API chưa trả về phản hồi hợp lệ","The API has not returned a valid response"));});
  if(!response.ok){const hold=signerHoldMessage(data?.code)??signerHoldMessage(data?.error);if(hold)throw new UiError(hold);if(typeof data.error==="string"&&data.error)throw new Error(data.error);throw new UiError(uiMessage("Thao tác chưa hoàn tất","The operation has not completed"));}
  return data as T;
}
export const checkpointKey=(userId:string,operationId:string)=>`groupdeal_operation:${userId}:${operationId}`;
/** Best-effort public nonce witness after the durable hash is acknowledged. Failure keeps the intent pending. */
export async function observeBroadcast(token:string|null,operationId:string,txHash:string):Promise<void> {
  if(!token)return;
  try{await fetch(`/api/transactions/${operationId}/observe`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({txHash}),signal:AbortSignal.timeout(2000)});}catch{/* Missing RPC visibility never releases an intent or triggers another signature. */}
}
export function broadcastCheckpoint(userId:string,operation:TransactionOperation,hash:string) {
  // No entitlement or wallet credential enters browser storage.
  localStorage.setItem(checkpointKey(userId,operation.id),JSON.stringify({id:operation.id,txHash:hash,phase:"SUBMITTED"}));
}
export function localBroadcast(userId:string,operationId:string):string|undefined {
  try{return JSON.parse(localStorage.getItem(checkpointKey(userId,operationId))||"null")?.txHash;}catch{return undefined;}
}
