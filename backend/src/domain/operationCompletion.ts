import {ethers} from 'ethers';
import {HUB_ABI} from '../contracts/hubAbi';
import {config} from '../config';
import {verifiedOperation,operationVerificationFields} from './operationVerification';
import {receiptBindingSchema,receiptIntent,type ReceiptConsumptionRecord} from './receiptConsumption';
import type {TransactionOperation} from './operation';
import type {DatabaseSchema,EventJournalRecord} from '../db/store';
import type {TransactionIntent,VerificationResult} from '../services/transactionVerifier';

export class OperationCompletionError extends Error {
  constructor(public code:string,public status=409){super(code);}
}
export type CompletionSelection={actorId:string;sessionKey?:string;operationId?:string;legacy?:{
  action:'PUBLISH'|'DELIVER'|'CONFIRM';resourceId:string;txHash?:string;proofHash?:string;
  /** Trusted synchronous receipt helper only; HTTP constructs and verifies its own intent. */
  verifiedReceipt?:VerificationResult;expectedCalldata?:string;
}};
export const completionOrderFields=['id','campaignId','onchainOrderId','chainId','hubAddress','protocolVersion','buyerAccountId','buyerPrincipal','campaignIdentity','committedGross','lockedUnitPrice','quantity','deliveryStatus','deliveryTimestamp','deliveryProofHash','disputeDeadline','commitmentTxHash','txHash','deliveryTxHash','deliveredEntitlementEncrypted','financialProjectionBlock','buyerClaimedAmount','sellerClaimedAmount','sellerAllocated','rebateAllocated','buyerRefundAllocated','isEarlySupporter','earlyRebateValue','buyerClaimed','sellerClaimed','createdAt','productSnapshot'] as const;
export const completionJournalFields=['id','chainId','contractAddress','blockNumber','blockHash','transactionIndex','txHash','logIndex','eventName','evidenceVersion','eventDigest','blockTimestamp'] as const;
export const completionPatchFields={
  operations:['phase','updatedAt','projectedOrderId'],
  campaigns:['onchainCampaignId','chainId','hubAddress','protocolVersion','projectionOrigin','creationTermsHash','termsPolicyReviewRequired','txHash','startTime','endTime','status','currentUnlockedTier','totalBuyerCount','totalUnitsCommitted','totalGrossCommitted','finalizedAt','finalClearingPrice','termsHash','visibility','mergedProjectionEncrypted'],
  orders:['campaignId','deliveryTxHash','deliveredEntitlementEncrypted'],
  resourceGrants:['state','activatedAt'],licenseInventory:['status'],
} as const;
export type CompletionPatch={collection:keyof typeof completionPatchFields;key:string;leaves:Record<string,unknown>};
export type CompletionPlan={patches:CompletionPatch[];removeCampaignId?:string;notices?:DatabaseSchema['notifications'][string][];
  audit?:{key:string;role:'buyer'|'seller'|'operator'|'user';action:string;details:Record<string,unknown>}[];
};
const iface=new ethers.Interface(HUB_ABI);
export const completionSame=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function completionCore(op:TransactionOperation,actor:string){
  return verifiedOperation(Object.fromEntries([...operationVerificationFields,'expectedEventArgs'].filter(k=>(op as any)[k]!==undefined).map(k=>[k,(op as any)[k]])),actor);
}
/** Bind committed consumption to its committed canonical journal, including ABI event bytes. */
export function canonicalCompletion(op:TransactionOperation|undefined,intent:TransactionIntent|undefined,consumed:ReceiptConsumptionRecord|undefined,event:EventJournalRecord|undefined,hash:string,trustedReceipt?:VerificationResult):VerificationResult {
  try{
    const r=receiptBindingSchema.parse(consumed);
    if(!event||event.evidenceVersion!==2||event.id!==`${r.chainId}_${r.hubAddress.toLowerCase()}_${hash.toLowerCase()}_${r.logIndex}`
      ||r.chainId!==config.arcChainId||!completionSame(r.hubAddress,config.hubAddress)||event.chainId!==r.chainId
      ||!completionSame(event.contractAddress,r.hubAddress)||!completionSame(event.txHash,hash)||event.blockNumber!==r.blockNumber
      ||!completionSame(event.blockHash,r.blockHash)||event.blockTimestamp!==r.blockTimestamp||event.transactionIndex!==r.transactionIndex
      ||event.logIndex!==r.logIndex||event.eventName!==r.eventName||!completionSame(event.eventDigest,r.eventDigest))throw Error();
    const fragment=iface.getEvent(event.eventName)!,encoded=iface.encodeEventLog(fragment,fragment.inputs.map(f=>event.payload[f.name]));
    if(!completionSame(ethers.keccak256(ethers.concat([...encoded.topics,encoded.data])),r.eventDigest))throw Error();
    const parsedEvent=iface.decodeEventLog(fragment,encoded.data,encoded.topics);
    if(op){const core=completionCore(op,op.userId);if(!['RECEIPT_VERIFIED','PROJECTED'].includes(op.phase)||!completionSame(op.txHash,hash)
      ||op.blockNumber!==r.blockNumber||!completionSame(op.blockHash,r.blockHash)||r.intentId!==op.intentId||!completionSame(r.intentDigest,core.digest))throw Error();intent=core.intent;}
    else if(!trustedReceipt){if(!intent||r.intentId!==intent.intentId||!completionSame(r.intentDigest,receiptIntent(intent).digest))throw Error();}
    if(intent&&(intent.expectedEvent!==event.eventName||Object.entries(intent.expectedEventArgs??{}).some(([k,v])=>String(parsedEvent[k]).toLowerCase()!==String(v).toLowerCase())))throw Error();
    const principal=op?.principal??intent?.expectedSender??trustedReceipt?.from;if(!principal||!ethers.isAddress(principal))throw Error();
    if(trustedReceipt&&(!trustedReceipt.verified||trustedReceipt.status!==1||trustedReceipt.eventName!==event.eventName||!completionSame(trustedReceipt.txHash,hash)
      ||trustedReceipt.blockNumber!==r.blockNumber||!completionSame(trustedReceipt.blockHash,r.blockHash)||trustedReceipt.blockTimestamp!==r.blockTimestamp
      ||!completionSame(trustedReceipt.to,r.hubAddress)||!completionSame(trustedReceipt.from,principal)
      ||fragment.inputs.some(f=>String(trustedReceipt.parsedEvent[f.name]).toLowerCase()!==String(parsedEvent[f.name]).toLowerCase())))throw Error();
    const log={...encoded,address:r.hubAddress,transactionHash:hash.toLowerCase(),blockNumber:r.blockNumber,blockHash:r.blockHash,transactionIndex:r.transactionIndex,index:r.logIndex,removed:false} as unknown as ethers.Log;
    return {verified:true,txHash:hash.toLowerCase(),blockNumber:r.blockNumber,blockHash:r.blockHash,blockTimestamp:r.blockTimestamp,from:principal,to:r.hubAddress,status:1,eventName:event.eventName,parsedEvent,logs:[log]};
  }catch{throw new OperationCompletionError('OPERATION_CANONICAL_PROJECTION_REQUIRED');}
}