import {ethers} from 'ethers';
import {store} from '../db/store';
import {StorageConflict} from '../db/rowPersistence';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {OperationTrackingError,trackingId,trackingOperation,submittedOperation,type OperationTrackingSelection,type PublicOperation} from '../domain/operationTracking';
export {OperationTrackingError} from '../domain/operationTracking';
type State=ReturnType<typeof store.readOperationTrackingState>;
export class OperationTrackingService{
 private static safe(e:unknown):Error{if(e instanceof OperationTrackingError||e instanceof SessionError)return e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))return new OperationTrackingError('OPERATION_TRACKING_CONFLICT');return new OperationTrackingError('OPERATION_TRACKING_UNAVAILABLE',503)}
 private static authority(s:State,actor:string,proof?:SessionProof){if(proof){if(proof.account.id!==actor||SessionService.assertCommitted(proof,s.auth).id!==actor)throw new OperationTrackingError('OPERATION_TRACKING_FORBIDDEN',403)}else{if(readAuthRecoveryBarrier(s.auth.authRecovery))throw new SessionError('AUTH_SESSION_INACTIVE');const u=s.auth.user;if(!u||u.id!==actor||!Array.isArray(u.roles)||u.roles.some(r=>!['buyer','seller','operator'].includes(r))||typeof u.email!=='string')throw new OperationTrackingError('OPERATION_TRACKING_FORBIDDEN',403)}}
 public static owned(actor:string,id:string,proof?:SessionProof):PublicOperation{
  if(!trackingId(id))throw new OperationTrackingError('OPERATION_NOT_FOUND',404);
  try{const s=store.readOperationTrackingState({actorId:actor,operationId:id,...(proof?{sessionKey:proof.key}:{})});this.authority(s,actor,proof);if(!s.operation)throw new OperationTrackingError('OPERATION_NOT_FOUND',404);return trackingOperation(s.operation,actor)}catch(e){throw this.safe(e)}
 }
 public static history(selection:OperationTrackingSelection,proof?:SessionProof):PublicOperation[]{try{const s=store.readOperationTrackingState({...selection,...(proof?{sessionKey:proof.key}:{})});this.authority(s,selection.actorId,proof);return s.operations.map(op=>trackingOperation(op,selection.actorId))}catch(e){throw this.safe(e)}}
 public static submit(actor:string,id:string,txHash:unknown,proof?:SessionProof){
  if(!trackingId(id)||typeof txHash!=='string'||!ethers.isHexString(txHash,32))throw new OperationTrackingError('OPERATION_TRACKING_INPUT_INVALID',400);
  const hash=txHash.toLowerCase(),selection={actorId:actor,operationId:id,...(proof?{sessionKey:proof.key}:{})};
  try{return store.mutateOperationSubmission(selection,s=>{this.authority(s,actor,proof);if(!s.operation)throw new OperationTrackingError('OPERATION_NOT_FOUND',404);if(s.operation.action==='RESOLVE')SessionService.assertOperatorCommitted(proof,s.auth);const op=submittedOperation(s.operation,actor);
   if(op.phase==='SUPERSEDED')throw new OperationTrackingError('OPERATION_NONCE_CONSUMED');
   if(op.txHash&&op.txHash.toLowerCase()!==hash)throw new OperationTrackingError('OPERATION_HASH_PINNED');
   if(!op.txHash&&['PROJECTED','RECEIPT_VERIFIED','REVERTED'].includes(op.phase))throw new OperationTrackingError('OPERATION_TERMINAL_CONFLICT');
   const phase=['PREPARED','AWAITING_SIGNATURE'].includes(op.phase)?'SUBMITTED':op.phase;
   return op.txHash===hash&&op.phase===phase?undefined:{txHash:hash,phase,updatedAt:Date.now()};
  })}catch(e){throw this.safe(e)}
 }
}