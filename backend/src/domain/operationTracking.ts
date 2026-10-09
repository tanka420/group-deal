import type {TransactionOperation} from './operation';
import {operationVerificationFields,operationEventFields,verifiedOperation,OperationVerificationError} from './operationVerification';
export class OperationTrackingError extends Error{constructor(public code:string,public status=409){super(code==='OPERATION_NONCE_CONSUMED'?'CONFLICT: canonical transaction consumed this operation nonce':code==='OPERATION_HASH_PINNED'?'CONFLICT: replacement requires verified nonce lineage':code)}}
export const operationPublicScalars=[...operationVerificationFields,'projectedOrderId','orderMetadataHash','orderTermsHash'] as const;
export type PublicTree={scalars:readonly string[];objects?:Record<string,PublicTree>;arrays?:Record<string,PublicTree>};
export const operationPublicTree:PublicTree={scalars:operationPublicScalars,objects:{
 expectedEventArgs:{scalars:operationEventFields},
 financialQuote:{scalars:['kind','blockNumber','blockHash','amountBaseUnits']},
 purchaseQuote:{scalars:['blockNumber','blockHash','lockedUnitPrice','commitmentAmount','unitsAlreadyBought','remainingInventory','maxGrossAmount','authorizationNonce','termsHash']},
 authorizationExpiry:{scalars:['blockNumber','blockHash','blockTimestamp','deadline','authorizationNonce','quoteBlockNumber','quoteBlockHash','authorizationSigner','verifiedAt']},
 deliveryRetry:{scalars:['previousOperationId'],objects:{terminal:{scalars:['phase','txHash','blockNumber','blockHash']},capability:{scalars:['blockNumber','blockHash','checkedAt']}}},
 deliveryQuote:{scalars:['blockNumber','blockHash','checkedAt']},
 orderQuote:{scalars:['kind','blockNumber','blockHash','remainingGross','buyerShare','sellerShare','disputeDeadline']}
},arrays:{broadcastWitnesses:{scalars:['txHash','nonce','observedAt','source']},replacements:{scalars:['previousTxHash','txHash','nonce','blockNumber','blockHash','kind','verifiedAt']}}};
const own=(v:object,k:string)=>Object.prototype.hasOwnProperty.call(v,k);
function pick(value:unknown,tree:PublicTree):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new OperationTrackingError('OPERATION_TRACKING_UNAVAILABLE',503);
 const input=value as Record<string,unknown>,result:Record<string,unknown>={};
 for(const field of tree.scalars)if(own(input,field)&&input[field]!==undefined){const v=input[field];if(v!==null&&!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))throw new OperationTrackingError('OPERATION_TRACKING_UNAVAILABLE',503);result[field]=v}
 for(const [field,child] of Object.entries(tree.objects??{}))if(own(input,field)&&input[field]!==undefined)result[field]=pick(input[field],child);
 for(const [field,child] of Object.entries(tree.arrays??{}))if(own(input,field)&&input[field]!==undefined){const v=input[field];if(!Array.isArray(v)||v.length>1000)throw new OperationTrackingError('OPERATION_TRACKING_UNAVAILABLE',503);result[field]=v.map(item=>pick(item,child))}
 return result;
}
export type PublicOperation=Omit<TransactionOperation,'stagedEntitlementEncrypted'|'stagedOrderMetadataEncrypted'>;
export function operationPublicDto(value:unknown):PublicOperation{return pick(value,operationPublicTree) as unknown as PublicOperation}
export function trackingId(v:unknown):v is string{return typeof v==='string'&&v.length>0&&v.length<=180&&!['__proto__','constructor','prototype'].includes(v)}
export function trackingOperation(value:unknown,actor:string):PublicOperation{
 const op=operationPublicDto(value);
 if(!trackingId(op.id)||op.userId!==actor||!trackingId(op.resourceId)||!['PUBLISH','DELIVER','BUY','BUYER_CLAIM','SELLER_CLAIM','DISPUTE','RESOLVE','CONFIRM','BREACH','SETTLE'].includes(op.action)||!['PREPARED','AWAITING_SIGNATURE','SUBMITTED','RECEIPT_VERIFIED','PROJECTED','UNKNOWN','REVERTED','SUPERSEDED','EXPIRED'].includes(op.phase)||!Number.isSafeInteger(op.createdAt)||op.createdAt<0||!Number.isSafeInteger(op.updatedAt)||op.updatedAt<0)throw new OperationTrackingError('OPERATION_TRACKING_UNAVAILABLE',503);
 return op;
}
export function submittedOperation(value:unknown,actor:string){try{const core=pick(value,{scalars:operationVerificationFields,objects:{expectedEventArgs:{scalars:operationEventFields}}});return verifiedOperation(core,actor).operation}catch(e){if(e instanceof OperationVerificationError)throw new OperationTrackingError(e.code==='OPERATION_VERIFICATION_FORBIDDEN'?'OPERATION_TRACKING_FORBIDDEN':e.code==='OPERATION_VERIFICATION_UNAVAILABLE'?'OPERATION_TRACKING_UNAVAILABLE':e.code,e.status);throw e}}
export type OperationTrackingSelection={actorId:string;sessionKey?:string;operationId?:string;limit?:number;filters?:Partial<Pick<TransactionOperation,'action'|'phase'|'resourceId'|'principal'>>;boundary?:{createdAt:number;id:string}};
export type OperationSubmitPatch={txHash:string;phase:TransactionOperation['phase'];updatedAt:number};