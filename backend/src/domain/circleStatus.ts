import {z} from 'zod';
import {ethers} from 'ethers';
import {CircleAuthError} from './circleAuthentication';
import {circleWalletInput,type CircleWalletAuthority} from './circleWalletAuthority';
import {circleKnownChallengeReceipt,type CircleChallengeReceipt} from './circleChallenge';
import {HUB_ABI} from '../contracts/hubAbi';
import {circleChallengeHash} from './circleChallenge';

export const circleStatusId=z.string().min(1).max(128).regex(/^[^\s\u0000-\u001f\u007f]+$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
export const circleStatusBody=circleWalletInput;
export const circleTransactionStatusBody=z.object({userToken:circleWalletInput.shape.userToken,challengeId:circleStatusId}).strict();
const unavailable=()=>new CircleAuthError('CIRCLE_TRANSACTION_STATUS_UNAVAILABLE',503);
function known(value:unknown,fields:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw unavailable();
 const result:Record<string,unknown>={};for(const field of fields)if(Object.prototype.hasOwnProperty.call(value,field))result[field]=(value as Record<string,unknown>)[field];return result;
}
export function circleStatusReceipt(value:unknown,authority:CircleWalletAuthority,audits:{requestDigest?:unknown;completionDigest?:unknown},challengeId:string):CircleChallengeReceipt{
 if(value===undefined)throw new CircleAuthError('CIRCLE_TRANSACTION_NOT_FOUND',404);
 const r=circleKnownChallengeReceipt(value,audits);
 if(r.state!=='READY'||r.challengeId!==challengeId)throw unavailable();
 if(r.userId!==authority.userId||r.circleUserId!==authority.circleUserId||r.walletId!==authority.wallet?.walletId||r.walletAddress.toLowerCase()!==authority.wallet.address.toLowerCase()||r.authorityBase!==authority.base||r.authRecoveryContext!==authority.context)throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409);
 return r;
}
const challenge=z.object({id:circleStatusId,type:z.enum(['CONTRACT_EXECUTION','CREATE_TRANSACTION']),status:z.enum(['PENDING','IN_PROGRESS','COMPLETE','FAILED','EXPIRED']),correlationIds:z.array(circleStatusId).max(1).optional()}).strict();
export function circleProviderStatusChallenge(value:unknown,challengeId:string){
 const p=challenge.safeParse(known(value,['id','type','status','correlationIds']));if(!p.success||p.data.id!==challengeId)throw unavailable();return p.data;
}
const address=z.string().refine(v=>ethers.isAddress(v)&&ethers.getAddress(v)!==ethers.ZeroAddress);
const transaction=z.object({id:circleStatusId,state:z.enum(['INITIATED','CLEARED','QUEUED','SENT','STUCK','CONFIRMED','COMPLETE','FAILED','DENIED','CANCELLED']),blockchain:z.literal('ARC-TESTNET'),walletId:circleStatusId,userId:circleStatusId.optional(),refId:circleStatusId,contractAddress:address,operation:z.literal('CONTRACT_EXECUTION').optional(),transactionType:z.literal('OUTBOUND'),txHash:z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional()}).strict();
export function circleProviderStatusTransaction(value:unknown,transactionId:string,receipt:CircleChallengeReceipt){
 const p=transaction.safeParse(known(value,['id','state','blockchain','walletId','userId','refId','contractAddress','operation','transactionType','txHash']));
 if(!p.success)throw unavailable();const t=p.data;
 if(t.id!==transactionId||t.walletId!==receipt.walletId||t.userId!==undefined&&t.userId!==receipt.circleUserId||t.refId!==receipt.operationId||t.contractAddress.toLowerCase()!==receipt.contractAddress.toLowerCase()||t.state==='COMPLETE'&&!t.txHash)throw unavailable();
 return{id:t.id,state:t.state,...(t.txHash?{txHash:t.txHash}:{})};
}
const nativeOperation=z.object({id:circleStatusId,userId:circleStatusId,action:z.enum(['PUBLISH','DELIVER','BUY','BUYER_CLAIM','SELLER_CLAIM','DISPUTE','RESOLVE','CONFIRM','BREACH','SETTLE']),resourceId:circleStatusId,chainId:z.literal(5042002),hubAddress:address,principal:address,calldata:z.string().min(10).max(131074).regex(/^0x(?:[a-fA-F0-9]{2})+$/),phase:z.enum(['PREPARED','AWAITING_SIGNATURE','SUBMITTED','RECEIPT_VERIFIED','PROJECTED','UNKNOWN','REVERTED','SUPERSEDED','EXPIRED'])}).strict();
const actionCalls={PUBLISH:['createCampaign','CREATE_CAMPAIGN'],DELIVER:['recordDelivery','RECORD_DELIVERY'],BUY:['commitToBuy','COMMIT_BUY'],BUYER_CLAIM:['claimBuyerFunds','CLAIM_BUYER'],SELLER_CLAIM:['claimSellerProceeds','CLAIM_SELLER'],DISPUTE:['openDispute','OPEN_DISPUTE'],RESOLVE:['resolveDispute','RESOLVE_DISPUTE'],CONFIRM:['confirmReceipt','CONFIRM_RECEIPT'],BREACH:['claimDeliveryBreach','CLAIM_DELIVERY_BREACH'],SETTLE:['settleUndisputedOrder','SETTLE_UNDISPUTED']} as const;
/** A status read uses the stored immutable call, never current purchase eligibility. */
export function circleOperationBinding(value:unknown,operationId:string,authority:CircleWalletAuthority,receipt:CircleChallengeReceipt,hubAddress:string){
 const p=nativeOperation.safeParse(value);if(!p.success)throw unavailable();const operation=p.data,hash=circleChallengeHash(operation.calldata.toLowerCase());
 if(operation.id!==operationId||operation.userId!==authority.userId||operation.principal.toLowerCase()!==authority.wallet?.address.toLowerCase()||operation.hubAddress.toLowerCase()!==hubAddress.toLowerCase()||receipt.contractAddress.toLowerCase()!==operation.hubAddress.toLowerCase()||receipt.calldataHash!==hash||receipt.intentType!==actionCalls[operation.action][1])throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409);
 const iface=new ethers.Interface(HUB_ABI);let call:ethers.TransactionDescription|null;try{call=iface.parseTransaction({data:operation.calldata});if(!call||call.name!==actionCalls[operation.action][0]||iface.encodeFunctionData(call.name,Array.from(call.args)).toLowerCase()!==operation.calldata.toLowerCase())throw unavailable();}catch{throw unavailable();}
 return{operationId:operation.id,chainId:operation.chainId,contractAddress:ethers.getAddress(operation.hubAddress),principal:ethers.getAddress(operation.principal),calldataHash:hash,action:operation.action,resourceId:operation.resourceId};
}
