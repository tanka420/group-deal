import {operationRequest,OperationRequestFailure,requireMatchingOperation,requireProjected,type TransactionOperation} from './transactionOperations';
import {UiError,uiMessage} from '../utils/uiMessage';
const pendingPhases=new Set(['SUBMITTED','RECEIPT_VERIFIED','UNKNOWN']);
const retryCodes=new Set(['OPERATION_COMPLETION_CONFLICT','OPERATION_CANONICAL_PROJECTION_REQUIRED','OPERATION_COMPLETION_UNAVAILABLE','VERIFIER_RECEIPT_PENDING','VERIFIER_TRANSACTION_NOT_FOUND','VERIFIER_RPC_UNAVAILABLE','VERIFIER_STORAGE_CONFLICT','VERIFIER_STORAGE_UNAVAILABLE']);
const incomplete=()=>new UiError(uiMessage('Chưa có projection đã xác minh cho giao dịch này; giữ checkpoint và intent để phục hồi.','This transaction has no verified projection yet. Keep its checkpoint and intent for recovery.'));
function retryable(error:unknown){return error instanceof OperationRequestFailure&&[409,503].includes(error.status)&&!!error.code&&retryCodes.has(error.code)||error instanceof DOMException&&['TimeoutError','AbortError'].includes(error.name);}
/** Retry only receipt completion for the already broadcast immutable call. Never prepare, sign or replace it. */
export async function recoverProjectedOperation(token:string|null,expected:TransactionOperation,txHash:string,isCurrent:()=>boolean):Promise<{operation:TransactionOperation}>{
 const current=()=>{if(!isCurrent())throw new UiError(uiMessage('Tài khoản hoặc ví đã thay đổi. Giữ giao dịch để phục hồi trong đúng phiên.','The account or wallet changed. Keep the transaction for recovery in the correct session.'));};
 current();if(!/^0x[0-9a-fA-F]{64}$/.test(txHash)||expected.txHash&&expected.txHash.toLowerCase()!==txHash.toLowerCase())throw incomplete();
 const validate=(result:{operation?:TransactionOperation})=>{const op=requireMatchingOperation(result,expected);if(op.txHash?.toLowerCase()!==txHash.toLowerCase())throw incomplete();return op;};
 const path='/api/transactions/'+expected.id;let last:unknown=incomplete();
 for(let attempt=0;attempt<3;attempt++){
  current();
  try{
   const result=await operationRequest<{operation:TransactionOperation}>(token,path+'/recover',{txHash});current();const op=validate(result);
   if(op.phase==='PROJECTED'){requireProjected(result,expected,txHash);return result;}
   last=incomplete();if(!pendingPhases.has(op.phase))throw last;
  }catch(error){
   current();if(!retryable(error)||attempt===2)throw error;
   // An API conflict or timeout cannot authorize retries after owner, call, hash or terminal state changes.
   const status=await operationRequest<{operation:TransactionOperation}>(token,path);current();const op=validate(status);
   if(!pendingPhases.has(op.phase)&&op.phase!=='PROJECTED')throw error;last=error;
  }
  if(attempt<2){await new Promise(resolve=>setTimeout(resolve,1000));current();}
 }
 throw last;
}
