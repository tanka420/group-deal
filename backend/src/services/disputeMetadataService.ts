import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {z} from 'zod';
import {store,OrderRecord,SupportMessageRecord,NotificationRecord,EmailOutboxRecord} from '../db/store';
import {StorageConflict,DisputeMetadataState,DisputeMetadataPlan} from '../db/rowPersistence';
import {SessionService,SessionError,SessionProof} from './sessionService';
import {config} from '../config';
import {HUB_ABI} from '../contracts/hubAbi';
import {eventDigest} from './eventEvidence';
import {verifiedContactEmailFor} from './contactIdentity';
import {computeTermsHash,decryptEntitlement,encryptEntitlement} from '../utils/crypto';
import {cleanHttpsEvidenceUrl} from '../../../shared/evidence.mjs';
import {DisputeMetadataError,metadataId,openMetadata,resolveMetadata,metadataReceipt,MetadataReceipt,MetadataKind} from '../domain/disputeMetadata';
import type {VerificationResult} from './transactionVerifier';
const iface=new ethers.Interface(HUB_ABI),same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export type DisputeMetadataResult={order:OrderRecord;hasEntitlement:boolean;txHash:string;blockNumber:number};
export class DisputeMetadataService{
 private static selection(proof:SessionProof|undefined,actorId:string,orderId:string,kind:MetadataKind,receipt?:MetadataReceipt,operationId?:string){if(!proof)throw new SessionError('AUTH_SESSION_INACTIVE',401);if(proof.account.id!==actorId)throw new DisputeMetadataError('DISPUTE_METADATA_FORBIDDEN',403);if(!metadataId.safeParse(orderId).success||operationId!==undefined&&!metadataId.safeParse(operationId).success)throw new DisputeMetadataError('DISPUTE_METADATA_INPUT_INVALID',400);return{actorId,sessionKey:proof.key,operatorProof:proof,orderId,kind,eventKey:receipt?.key,txHash:receipt?.verification.txHash,operationId};}
 private static authority(proof:SessionProof,state:DisputeMetadataState,kind:MetadataKind,orderId:string){
  const user=kind==='RESOLVE'?SessionService.assertOperatorCommitted(proof,state.auth):SessionService.assertCommitted(proof,state.auth),o=state.order,c=state.campaign;if(!o)throw new DisputeMetadataError('DISPUTE_METADATA_NOT_FOUND',404);
  if(o.id!==orderId||!c||c.id!==o.campaignId||o.chainId!==config.arcChainId||c.chainId!==config.arcChainId||!same(o.hubAddress,config.hubAddress)||!same(c.hubAddress,config.hubAddress)||o.protocolVersion!==undefined&&o.protocolVersion!==config.protocolVersion||!Number.isSafeInteger(o.onchainOrderId)||o.onchainOrderId<1||!Number.isSafeInteger(c.onchainCampaignId)||c.onchainCampaignId!<1||!ethers.isAddress(o.buyerPrincipal))throw new DisputeMetadataError('DISPUTE_METADATA_BINDING_INVALID',409);
  if(kind==='OPEN'?o.buyerAccountId!==user.id:!user.roles.includes('operator'))throw new DisputeMetadataError('DISPUTE_METADATA_FORBIDDEN',403);return o;
 }
 private static failure(e:unknown):never{if(e instanceof SessionError||e instanceof DisputeMetadataError)throw e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))throw new DisputeMetadataError('DISPUTE_METADATA_CONFLICT',409);throw new DisputeMetadataError('DISPUTE_METADATA_UNAVAILABLE',503);}
 public static context(proof:SessionProof|undefined,actorId:string,orderId:string,kind:MetadataKind){const selection=this.selection(proof,actorId,orderId,kind);try{const s=store.readDisputeMetadataState(selection);this.authority(proof!,s,kind,orderId);return{order:s.order!,campaign:s.campaign!};}catch(e){return this.failure(e)}}
 private static indexed(state:DisputeMetadataState,receipt:MetadataReceipt,kind:MetadataKind,input:{reason?:string;buyerShare?:string;sellerShare?:string}){
  const o=state.order!,c=state.campaign!,e=state.event,p=receipt.payload,v=receipt.verification;
  try{
   if(!e||e.id!==receipt.key||e.evidenceVersion!==2||e.eventName!==v.eventName||e.chainId!==config.arcChainId||!same(e.contractAddress,config.hubAddress)||!same(e.txHash,v.txHash)||!same(e.blockHash,v.blockHash)||e.blockNumber!==v.blockNumber||e.logIndex!==receipt.log.index||e.transactionIndex!==receipt.log.transactionIndex||e.blockTimestamp!==v.blockTimestamp||!same(e.eventDigest,receipt.digest))throw Error();
   const fields=kind==='OPEN'?['campaignId','orderId','disputedBy','reasonHash']:['campaignId','orderId','buyerShare','sellerShare'];if(fields.some(f=>String(e.payload[f]).toLowerCase()!==p[f].toLowerCase()))throw Error();
   const encoded=iface.encodeEventLog(iface.getEvent(v.eventName)!,fields.map(f=>e.payload[f]));if(!same(eventDigest(encoded),e.eventDigest)||BigInt(p.campaignId)!==BigInt(c.onchainCampaignId!)||BigInt(p.orderId)!==BigInt(o.onchainOrderId))throw Error();
   if(kind==='OPEN'?(!same(v.from,o.buyerPrincipal)||!same(p.disputedBy,o.buyerPrincipal)||!same(p.reasonHash,ethers.keccak256(ethers.toUtf8Bytes(input.reason!)))):(!same(v.from,config.operatorAddress)||p.buyerShare!==input.buyerShare||p.sellerShare!==input.sellerShare))throw Error();
   const history=o.transactionHistory?.filter(h=>h.action===v.eventName&&same(h.txHash,v.txHash)&&h.logIndex===e.logIndex);if(history?.length!==1||history[0].chainId!==config.arcChainId||!same(history[0].hubAddress,config.hubAddress)||!same(history[0].blockHash,v.blockHash)||history[0].blockNumber!==v.blockNumber||!Number.isSafeInteger(o.financialProjectionBlock)||o.financialProjectionBlock!<v.blockNumber)throw Error();
  }catch{throw new DisputeMetadataError('DISPUTE_METADATA_PROOF_INVALID',400)}
 }
 private static operation(state:DisputeMetadataState,actorId:string,orderId:string,kind:MetadataKind,receipt:MetadataReceipt,input:any){
  const op=state.operation,v=receipt.verification;if(!op)throw new DisputeMetadataError('DISPUTE_METADATA_OPERATION_CONFLICT',409);
  try{
   const action=kind==='OPEN'?'DISPUTE':'RESOLVE',name=kind==='OPEN'?'openDispute':'resolveDispute',call=iface.parseTransaction({data:op.calldata});
   if(op.userId!==actorId||op.resourceId!==orderId||op.action!==action||op.chainId!==config.arcChainId||!same(op.hubAddress,config.hubAddress)||!same(op.principal,v.from)||!same(op.txHash,v.txHash)||op.blockNumber!==v.blockNumber||!same(op.blockHash,v.blockHash)||!['RECEIPT_VERIFIED','PROJECTED'].includes(op.phase)||op.expectedFunction!==name||op.expectedEvent!==v.eventName||call?.name!==name||String(call.args[0])!==receipt.payload.campaignId||String(call.args[1])!==receipt.payload.orderId)throw Error();
   if(kind==='OPEN'?!same(String(call.args[2]),receipt.payload.reasonHash):String(call.args[2])!==input.buyerShare||String(call.args[3])!==input.sellerShare)throw Error();
   for(const [key,value] of Object.entries(op.expectedEventArgs))if(String(receipt.payload[key]).toLowerCase()!==String(value).toLowerCase())throw Error();
   const staged=JSON.parse(decryptEntitlement(op.stagedOrderMetadataEncrypted!)),i=staged.input;
   if(staged.userId!==actorId||staged.orderId!==orderId||i?.action!==action||computeTermsHash(i)!==op.orderMetadataHash)throw Error();
   if(kind==='OPEN'?(i.reason!==input.reason||JSON.stringify(i.evidenceUrls)!==JSON.stringify(input.evidenceUrls)):(i.notes!==input.notes||!Number.isInteger(i.buyerPercent)||i.buyerPercent<0||i.buyerPercent>100))throw Error();
  }catch{throw new DisputeMetadataError('DISPUTE_METADATA_OPERATION_CONFLICT',409)}
  return op.phase==='PROJECTED'?undefined:{updatedAt:Date.now()};
 }
 private static notices(state:DisputeMetadataState,m:SupportMessageRecord){
  const notices:DisputeMetadataPlan<unknown>['notices']=[],targets=[...(m.senderRole!=='buyer'?[state.order!.buyerAccountId]:[]),...(m.senderRole!=='seller'?[state.campaign!.sellerId]:[])];
  for(const r of state.recipients){if(!targets.includes(r.user.id))continue;const prefs=z.object({inApp:z.boolean(),email:z.boolean()}).safeParse(r.preferences??{inApp:true,email:true});if(!prefs.success)throw new DisputeMetadataError('DISPUTE_METADATA_UNAVAILABLE',503);const userId=r.user.id,id='ntf_'+crypto.createHash('sha256').update(userId+':'+m.id).digest('hex'),n:NotificationRecord={id,userId,type:'SUPPORT_MESSAGE',title:'Có tin nhắn mới về order',message:'Order #'+m.orderId+' có phản hồi mới từ '+m.senderRole+'.',link:userId===state.order!.buyerAccountId?'#orders':'#seller',createdAt:m.timestamp,inAppEnabled:prefs.data.inApp,translations:{en:{title:'New order support message',message:'Order #'+m.orderId+' has a new '+m.senderRole+' response.'}},source:{kind:'SUPPORT_MESSAGE',eventId:m.id,orderId:m.orderId,occurredAt:m.timestamp}};const to=prefs.data.email?verifiedContactEmailFor(userId,r.user):null,mail:EmailOutboxRecord|undefined=to?{id:'mail_'+id,notificationId:id,userId,status:'QUEUED',attempts:0,nextAttemptAt:m.timestamp,createdAt:m.timestamp,payloadEncrypted:encryptEntitlement(JSON.stringify({version:1,outboxId:'mail_'+id,userId,notificationId:id,to,subject:n.title,text:n.message}))}:undefined;notices.push({notification:n,...(mail?{mail}:{})});}
  return notices;
 }
 public static record(proof:SessionProof|undefined,actorId:string,orderId:string,kind:MetadataKind,input:unknown,verification:VerificationResult,operationId?:string):DisputeMetadataResult{
  const parsed=kind==='OPEN'?openMetadata.safeParse(input):resolveMetadata.safeParse(input);if(!parsed.success||kind==='OPEN'&&(parsed.data as any).evidenceUrls.some((u:string)=>!cleanHttpsEvidenceUrl(u)))throw new DisputeMetadataError('DISPUTE_METADATA_INPUT_INVALID',400);
  const receipt=metadataReceipt(verification,kind),selection=this.selection(proof,actorId,orderId,kind,receipt,operationId),i=parsed.data as any;
  if(kind==='RESOLVE'){i.buyerShare=BigInt(i.buyerShare).toString();i.sellerShare=BigInt(i.sellerShare).toString();}
  try{return store.mutateDisputeMetadata(selection,state=>{
   const order=this.authority(proof!,state,kind,orderId);this.indexed(state,receipt,kind,i);
   const role=kind==='OPEN'?'buyer':'operator',audit:DisputeMetadataPlan<unknown>['audit']=[],patch:DisputeMetadataPlan<unknown>['patch']={},timestamp=Date.now();let m:SupportMessageRecord|undefined;
   if(kind==='OPEN'){
    if(order.disputeReason!==undefined&&(typeof order.disputeReason!=='string'||!order.disputeReason.trim()))throw new DisputeMetadataError('DISPUTE_METADATA_UNAVAILABLE',503);
    if(order.disputeReason&&order.disputeReason!==i.reason)throw new DisputeMetadataError('DISPUTE_METADATA_CONFLICT',409);
    if(order.disputeEvidence!==undefined&&(!Array.isArray(order.disputeEvidence)||order.disputeEvidence.length>100||order.disputeEvidence.some(u=>!cleanHttpsEvidenceUrl(u))))throw new DisputeMetadataError('DISPUTE_METADATA_UNAVAILABLE',503);
    if(!order.disputeReason){if(state.metadataAudit)throw new DisputeMetadataError('DISPUTE_METADATA_CONFLICT',409);patch.disputeReason=i.reason;m={id:'msg_'+crypto.randomUUID(),orderId,senderRole:'buyer',senderWallet:order.buyerPrincipal,text:'Dispute opened: '+i.reason,timestamp};}
    const urls=[...new Set([...(order.disputeEvidence??[]),...i.evidenceUrls])] as string[];if(urls.length>100)throw new DisputeMetadataError('DISPUTE_METADATA_INPUT_INVALID',400);if(JSON.stringify(urls)!==JSON.stringify(order.disputeEvidence??[]))patch.disputeEvidence=urls;
   }else{
    if(order.disputeResolution){const old=order.disputeResolution;if(typeof old.txHash!=='string'||typeof old.notes!=='string'||typeof old.operatorId!=='string')throw new DisputeMetadataError('DISPUTE_METADATA_UNAVAILABLE',503);if(!same(old.txHash,verification.txHash)||old.notes!==i.notes||old.operatorId!==actorId)throw new DisputeMetadataError('DISPUTE_METADATA_CONFLICT',409);}
    else{if(state.metadataAudit)throw new DisputeMetadataError('DISPUTE_METADATA_CONFLICT',409);patch.disputeResolution={txHash:verification.txHash,notes:i.notes,operatorId:actorId};m={id:'msg_'+crypto.randomUUID(),orderId,senderRole:'operator',senderWallet:actorId,text:'Dispute resolved by operator. Buyer allocation: '+i.buyerShare+' base units, Seller allocation: '+i.sellerShare+' base units. Note: '+i.notes,timestamp};}
   }
   if(m&&state.messages.some(x=>x.orderId!==orderId||typeof x.text!=='string'||typeof x.id!=='string'))throw new DisputeMetadataError('DISPUTE_METADATA_UNAVAILABLE',503);
   if(!state.metadataAudit)audit.push({key:(kind==='OPEN'?'dispute-open:':'dispute-resolve:')+verification.txHash,actor:actorId,role,action:kind==='OPEN'?'DISPUTE_OPENED':'DISPUTE_RESOLVED',details:{orderId,...(kind==='OPEN'?{reasonHash:ethers.keccak256(ethers.toUtf8Bytes(i.reason))}:{buyerShare:i.buyerShare,sellerShare:i.sellerShare,notesHash:ethers.keccak256(ethers.toUtf8Bytes(i.notes))}),txHash:verification.txHash,blockNumber:verification.blockNumber}});
   const operationPatch=operationId?this.operation(state,actorId,orderId,kind,receipt,i):undefined;
   if(operationId&&!state.operationAudit)audit.push({key:'order-action:'+operationId,actor:actorId,role,action:'ORDER_ACTION_PROJECTED',details:{operationId,orderId,action:kind==='OPEN'?'DISPUTE':'RESOLVE',txHash:verification.txHash,blockNumber:verification.blockNumber}});
   return{result:{order:{...order,...patch},hasEntitlement:state.hasEntitlement,txHash:verification.txHash,blockNumber:verification.blockNumber},patch,message:m,notices:m?this.notices(state,m):[],audit,operationPatch};
  })}catch(e){return this.failure(e)}
 }
}
