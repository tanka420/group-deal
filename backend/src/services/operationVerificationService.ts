import {store} from '../db/store';
import {StorageConflict} from '../db/rowPersistence';
import {TransactionVerifier,TransactionVerificationError,VerificationResult} from './transactionVerifier';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {OperationVerificationError,verifiedOperation,assertRevertedConsumption,type OperationVerificationSelection,type OperationVerificationPlan} from '../domain/operationVerification';
export {OperationVerificationError} from '../domain/operationVerification';
type State=ReturnType<typeof store.readOperationVerificationState>;
export class OperationVerificationService{
 private static safe(e:unknown):Error{if(e instanceof OperationVerificationError||e instanceof TransactionVerificationError||e instanceof SessionError)return e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))return new OperationVerificationError('OPERATION_VERIFICATION_CONFLICT');return new OperationVerificationError('OPERATION_VERIFICATION_UNAVAILABLE',503);}
 private static authority(s:State,actor:string,proof?:SessionProof){if(proof){if(proof.account.id!==actor||SessionService.assertCommitted(proof,s.auth).id!==actor)throw new OperationVerificationError('OPERATION_VERIFICATION_FORBIDDEN',403)}else{if(readAuthRecoveryBarrier(s.auth.authRecovery))throw new SessionError('AUTH_SESSION_INACTIVE');const u=s.auth.user;if(!u||u.id!==actor||!Array.isArray(u.roles)||u.roles.some(r=>!['buyer','seller','operator'].includes(r))||typeof u.email!=='string')throw new OperationVerificationError('OPERATION_VERIFICATION_FORBIDDEN',403)}if(s.operation?.action==='RESOLVE')SessionService.assertOperatorCommitted(proof,s.auth);return verifiedOperation(s.operation,actor);}
 public static async verify(actor:string,id:string,proof?:SessionProof):Promise<VerificationResult>{
  const selection:OperationVerificationSelection={actorId:actor,operationId:id,...(proof?{sessionKey:proof.key}:{})};let first:ReturnType<typeof verifiedOperation>;
  try{const s=store.readOperationVerificationState(selection);first=this.authority(s,actor,proof);if(s.targetDirty)throw new OperationVerificationError('OPERATION_VERIFICATION_CONFLICT');}catch(e){throw this.safe(e)}
  if(first.operation.phase==='SUPERSEDED')throw new OperationVerificationError('OPERATION_NONCE_CONSUMED');
  const hash=first.operation.txHash;if(!hash)throw new OperationVerificationError('OPERATION_BROADCAST_PENDING');
  const mutate=(command:(s:State,current:ReturnType<typeof verifiedOperation>)=>OperationVerificationPlan)=>{try{return store.mutateOperationVerification(selection,s=>{const current=this.authority(s,actor,proof);if(current.fingerprint!==first.fingerprint)throw new OperationVerificationError('OPERATION_CONTEXT_CHANGED');return command(s,current)})}catch(e){throw this.safe(e)}};
  let verification:VerificationResult;
  try{verification=await TransactionVerifier.verifyExpectedTransaction(first.intent,hash)}catch(e){
   const failure=this.safe(e),revert=await TransactionVerifier.readRevertedEvidence(first.intent,hash);
   if(revert){const binding={intentId:first.operation.intentId,blockNumber:revert.blockNumber,verifiedAt:Date.now(),bindingVersion:2 as const,receiptStatus:0 as const,intentDigest:first.digest,chainId:first.operation.chainId,hubAddress:first.operation.hubAddress.toLowerCase(),blockHash:revert.blockHash.toLowerCase(),blockTimestamp:revert.blockTimestamp,transactionIndex:revert.transactionIndex,nonce:revert.nonce};
    mutate((s,current)=>{const op=current.operation;if(['PROJECTED','SUPERSEDED'].includes(op.phase))throw new OperationVerificationError('OPERATION_TERMINAL_CONFLICT');assertRevertedConsumption(s.consumption,binding);const same=op.phase==='REVERTED'&&op.blockNumber===binding.blockNumber&&op.blockHash?.toLowerCase()===binding.blockHash&&op.errorCode==='TRANSACTION_REVERTED';return{...(!same?{patch:{phase:'REVERTED',blockNumber:binding.blockNumber,blockHash:binding.blockHash,updatedAt:Date.now(),errorCode:'TRANSACTION_REVERTED'}}:{}),reverted:binding,audit:{key:'reverted:'+id+':'+hash,details:{operationId:id,txHash:hash,blockNumber:binding.blockNumber,blockHash:binding.blockHash}}}});
    throw new OperationVerificationError('TRANSACTION_REVERTED');
   }
   mutate((_s,current)=>['PROJECTED','REVERTED','SUPERSEDED','EXPIRED'].includes(current.operation.phase)||current.operation.phase==='UNKNOWN'&&current.operation.errorCode==='RECEIPT_NOT_VERIFIED'?{}:{patch:{phase:'UNKNOWN',updatedAt:Date.now(),errorCode:'RECEIPT_NOT_VERIFIED'}});throw failure;
  }
  mutate((s,current)=>{const op=current.operation;if(['REVERTED','SUPERSEDED','EXPIRED'].includes(op.phase))throw new OperationVerificationError('OPERATION_TERMINAL_CONFLICT');if(!s.consumption||s.consumption.bindingVersion!==1||s.consumption.intentDigest!==first.digest||s.consumption.blockNumber!==verification.blockNumber||s.consumption.blockHash?.toLowerCase()!==verification.blockHash.toLowerCase())throw new OperationVerificationError('OPERATION_RECEIPT_BINDING_CHANGED');if(['RECEIPT_VERIFIED','PROJECTED'].includes(op.phase)&&op.blockNumber===verification.blockNumber&&op.blockHash?.toLowerCase()===verification.blockHash.toLowerCase()&&!op.errorCode)return{};return{patch:{...(op.phase!=='PROJECTED'?{phase:'RECEIPT_VERIFIED' as const}:{}),blockNumber:verification.blockNumber,blockHash:verification.blockHash,updatedAt:Date.now(),clearError:true}}});
  return verification;
 }
}
