import {ClaimType} from '../../../shared/domain.cjs';
import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {store,type CampaignRecord,type OrderRecord} from '../db/store';
import {StorageConflict,type OperationCompletionState} from '../db/rowPersistence';
import {config} from '../config';
import {HUB_ABI} from '../contracts/hubAbi';
import {OperationCompletionError,completionCore,canonicalCompletion,completionSame,type CompletionSelection,type CompletionPlan} from '../domain/operationCompletion';
import {receiptIntent,TransactionVerificationError} from '../domain/receiptConsumption';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import {OperationVerificationService} from './operationVerificationService';
import {OperationTrackingService} from './operationTrackingService';
import {TransactionVerifier,type VerificationResult,type TransactionIntent} from './transactionVerifier';
import {IndexerService} from './indexerService';
import {campaignCalldata} from './campaignBindingService';
import {ResourceDeliveryService} from './resourceDeliveryService';
import {BuyOperationService} from './buyOperationService';
import {OrderActionService} from './orderActionService';
import {DisputeService} from './disputeService';
import {ProductService} from './productService';
import {encryptEntitlement,decryptEntitlement} from '../utils/crypto';
import {sellerFollowSchema} from '../domain/sellerFollow';
import {accessiblePublicCampaignRecord} from './publicCampaign';
import {operationPublicDto} from '../domain/operationTracking';
export {OperationCompletionError} from '../domain/operationCompletion';
const iface=new ethers.Interface(HUB_ABI);
export function operationCompletionFailure(res:import('express').Response,error:unknown){
  if(error instanceof SessionError||error instanceof OperationCompletionError||error instanceof TransactionVerificationError){const status=error instanceof TransactionVerificationError&&error.status===400&&error.code!=='VERIFIER_HASH_INVALID'?409:error.status;res.status(status).json({error:error instanceof SessionError?'Session unavailable':'Receipt completion pending',code:error.code});return;}
  res.status(503).json({error:'Receipt completion pending',code:'OPERATION_COMPLETION_UNAVAILABLE'});
}
export class OperationCompletionService {
  private static safe(error:unknown):Error{
    if(error instanceof SessionError||error instanceof OperationCompletionError||error instanceof TransactionVerificationError)return error;
    if(error instanceof StorageConflict||error instanceof Error&&error.message.startsWith('CONFLICT:'))return new OperationCompletionError('OPERATION_COMPLETION_CONFLICT');
    if(error instanceof Error&&/^(FORBIDDEN:|Unauthorized)/.test(error.message))return new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
    const status=Number((error as any)?.status);if([400,401,403,404,409].includes(status))return new OperationCompletionError(status===403?'OPERATION_COMPLETION_FORBIDDEN':'OPERATION_COMPLETION_CONFLICT',status);
    return new OperationCompletionError('OPERATION_COMPLETION_UNAVAILABLE',503);
  }
  private static authority(s:OperationCompletionState,selection:CompletionSelection,proof?:SessionProof){
    if(proof){if(proof.account.id!==selection.actorId||SessionService.assertCommitted(proof,s.auth).id!==selection.actorId)throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);}
    else{if(readAuthRecoveryBarrier(s.auth.authRecovery))throw new SessionError('AUTH_SESSION_INACTIVE');if(!s.auth.user||s.auth.user.id!==selection.actorId||!Array.isArray(s.auth.user.roles)||s.auth.user.roles.some(r=>!['buyer','seller','operator'].includes(r)))throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);}
    if(selection.operationId&&!s.operation)throw new OperationCompletionError('OPERATION_NOT_FOUND',404);
    if((s.operation?.action??selection.legacy?.action)==='RESOLVE')SessionService.assertOperatorCommitted(proof,s.auth);
    if(s.targetDirty)throw new OperationCompletionError('OPERATION_COMPLETION_CONFLICT');
    if(s.operation)completionCore(s.operation,selection.actorId);
  }
  private static context(s:OperationCompletionState,selection:CompletionSelection){
    const op=s.operation,action=op?.action??selection.legacy!.action,id=op?.resourceId??selection.legacy!.resourceId;
    if(op&&selection.legacy){const legacy=selection.legacy;
      if(legacy.txHash&&op.txHash&&!completionSame(legacy.txHash,op.txHash)||legacy.expectedCalldata!==undefined&&legacy.expectedCalldata!==op.calldata
        ||legacy.proofHash!==undefined&&!completionSame(legacy.proofHash,op.expectedEventArgs.proofHash))throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
    }
    const order=s.graph.orders[id],campaign=s.graph.campaigns[['PUBLISH','BUY','BUYER_CLAIM','SELLER_CLAIM'].includes(action)?id:order?.campaignId];
    if(!campaign)throw new OperationCompletionError('OPERATION_CANONICAL_PROJECTION_REQUIRED');
    const principal=op?.principal??(action==='CONFIRM'?order?.buyerPrincipal:campaign.sellerPayoutWallet);
    if(!principal||!ethers.isAddress(principal))throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
    if(action!=='PUBLISH'&&(campaign.chainId!==config.arcChainId||!completionSame(campaign.hubAddress,config.hubAddress)||!Number.isSafeInteger(campaign.onchainCampaignId)||campaign.onchainCampaignId!<1))throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
    if(['PUBLISH','DELIVER','SELLER_CLAIM','SETTLE'].includes(action)&&(campaign.sellerId!==selection.actorId||!s.auth.user!.roles.includes('seller')||!completionSame(principal,campaign.sellerPayoutWallet)))throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
    if(action==='RESOLVE'&&(!s.auth.user!.roles.includes('operator')||!completionSame(principal,config.operatorAddress)))throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
    if(order){if(order.chainId!==config.arcChainId||!completionSame(order.hubAddress,config.hubAddress)||!Number.isSafeInteger(order.onchainOrderId)||order.onchainOrderId<1)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
      if(['CONFIRM','DISPUTE','BREACH'].includes(action)&&(order.buyerAccountId!==selection.actorId||!completionSame(principal,order.buyerPrincipal)))throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
    }
    let intent:TransactionIntent;
    if(op)intent=completionCore(op,selection.actorId).intent;
    else if(action==='PUBLISH'){
      const calldata=campaignCalldata({...campaign,termsHash:campaign.creationTermsHash??campaign.termsHash});
      if(selection.legacy?.expectedCalldata!==undefined&&selection.legacy.expectedCalldata!==calldata)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
      intent={intentId:'campaign_publish_'+campaign.id,expectedTo:config.hubAddress,expectedSender:principal,expectedFunction:'createCampaign',expectedCalldata:calldata,expectedEvent:'CampaignCreated',expectedEventArgs:{sellerPayoutWallet:principal,termsHash:campaign.creationTermsHash??campaign.termsHash}};
    }else if(action==='DELIVER'){
      const hash=selection.legacy?.proofHash;if(!hash||!ethers.isHexString(hash,32))throw new OperationCompletionError('OPERATION_COMPLETION_INPUT_INVALID',400);
      intent={intentId:`delivery_${order.id}_${hash}`,expectedTo:config.hubAddress,expectedSender:principal,expectedFunction:'recordDelivery',expectedCalldata:iface.encodeFunctionData('recordDelivery',[campaign.onchainCampaignId,order.onchainOrderId,hash]),expectedEvent:'DeliveryRecorded',expectedEventArgs:{campaignId:campaign.onchainCampaignId,orderId:order.onchainOrderId,proofHash:hash}};
    }else intent={intentId:'confirm_'+order.id,expectedTo:config.hubAddress,expectedSender:principal,expectedFunction:'confirmReceipt',expectedEvent:'OrderConfirmed',expectedEventArgs:{campaignId:campaign.onchainCampaignId,orderId:order.onchainOrderId}};
    return {op,action,order,campaign,intent,fingerprint:op?completionCore(op,selection.actorId).fingerprint:receiptIntent(intent).digest};
  }
  public static owned(actor:string,id:string,proof?:SessionProof){try{const selection={actorId:actor,operationId:id,...(proof?{sessionKey:proof.key}:{})},s=store.readOperationCompletionState(selection);this.authority(s,selection,proof);this.context(s,selection);return s.operation!;}catch(error){throw this.safe(error);}}
  private static indexedOrder(order:OrderRecord|undefined,verification:VerificationResult,campaign:CampaignRecord,logIndex:number){
    if(!order||order.campaignId!==campaign.id||String(order.onchainOrderId)!==String(verification.parsedEvent.orderId)||String(campaign.onchainCampaignId)!==String(verification.parsedEvent.campaignId)
      ||!Number.isSafeInteger(order.financialProjectionBlock)||order.financialProjectionBlock!<verification.blockNumber
      ||!order.transactionHistory?.some(h=>h.action===verification.eventName&&h.logIndex===logIndex&&completionSame(h.txHash,verification.txHash)&&h.blockNumber===verification.blockNumber&&completionSame(h.blockHash,verification.blockHash)&&h.chainId===config.arcChainId&&completionSame(h.hubAddress,config.hubAddress)))throw new OperationCompletionError('OPERATION_CANONICAL_PROJECTION_REQUIRED');
  }  private static plan(s:OperationCompletionState,selection:CompletionSelection,secretContent?:string):CompletionPlan{
    const {op,action,order,campaign,intent}=this.context(s,selection);
    if(!s.hash)throw new OperationCompletionError('OPERATION_BROADCAST_PENDING');
    const v=canonicalCompletion(op,intent,s.consumption,s.event,s.hash,selection.legacy?.verifiedReceipt),plan:CompletionPlan={patches:[],audit:[]};
    const add=(collection:CompletionPlan['patches'][number]['collection'],key:string,leaves:Record<string,unknown>)=>plan.patches.push({collection,key,leaves});
    const audit=(key:string,role:'buyer'|'seller'|'operator'|'user',name:string,details:Record<string,unknown>)=>plan.audit!.push({key,role,action:name,details});
    if(action==='PUBLISH'){
      const calldata=campaignCalldata({...campaign,termsHash:campaign.creationTermsHash??campaign.termsHash}),expected=intent.expectedCalldata;
      if(calldata!==expected||!completionSame(v.parsedEvent.sellerPayoutWallet,campaign.sellerPayoutWallet)||!completionSame(v.parsedEvent.termsHash,campaign.creationTermsHash??campaign.termsHash))throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
      const chainId=Number(v.parsedEvent.campaignId);if(!Number.isSafeInteger(chainId)||chainId<1)throw new OperationCompletionError('OPERATION_CANONICAL_PROJECTION_REQUIRED');
      if(campaign.onchainCampaignId!==undefined&&(campaign.chainId!==config.arcChainId||!completionSame(campaign.hubAddress,config.hubAddress)||campaign.onchainCampaignId!==chainId||!completionSame(campaign.txHash,v.txHash)))throw new OperationCompletionError('OPERATION_PUBLICATION_RECEIPT_CHANGED');
      if(op?.phase==='PROJECTED')return plan;
      const leaves:Record<string,unknown>={onchainCampaignId:chainId,chainId:config.arcChainId,hubAddress:config.hubAddress.toLowerCase(),protocolVersion:config.protocolVersion,projectionOrigin:'VERIFIED_PUBLISH',creationTermsHash:String(v.parsedEvent.termsHash),txHash:v.txHash,startTime:Number(v.parsedEvent.startTime),endTime:Number(v.parsedEvent.endTime),status:campaign.status==='DRAFT'?'PUBLISHED':campaign.status};
      if(s.collision){for(const field of ['status','currentUnlockedTier','totalBuyerCount','totalUnitsCommitted','totalGrossCommitted','finalizedAt','finalClearingPrice','termsHash'] as const)if(s.collision.campaign[field]!==undefined)leaves[field]=s.collision.campaign[field];
        leaves.mergedProjectionEncrypted=encryptEntitlement(s.collision.archive);plan.removeCampaignId=s.collision.campaign.id;for(const row of Object.values(s.graph.orders))if(row.campaignId===s.collision.campaign.id)add('orders',row.id,{campaignId:campaign.id});
      }
      leaves.termsPolicyReviewRequired=String(leaves.termsHash??campaign.termsHash).toLowerCase()!==String(v.parsedEvent.termsHash).toLowerCase();
      if(op){try{ProductService.assertPublishable(selection.actorId,campaign.productSnapshot,Number(leaves.endTime)+campaign.deliverySlaSeconds,campaign.productSnapshot?s.graph.productPolicies?.[campaign.productSnapshot.productVersionId]:undefined);}catch{leaves.visibility='UNLISTED';audit('policy:'+op.id,'seller','PUBLISH_POLICY_REVIEW_REQUIRED',{campaignId:campaign.id,operationId:op.id});}}
      else if(!selection.legacy?.verifiedReceipt){leaves.visibility='UNLISTED';audit('publication-review:'+v.txHash,'seller','PUBLICATION_RECOVERY_REQUIRES_POLICY_REVIEW',{campaignId:campaign.id,txHash:v.txHash});}
      add('campaigns',campaign.id,leaves);audit('publication:'+v.txHash,'seller','CAMPAIGN_PUBLISHED',{campaignId:campaign.id,onchainCampaignId:chainId,txHash:v.txHash});
      const published={...campaign,...leaves} as CampaignRecord;
      if(published.visibility==='PUBLIC'&&s.auth.user?.sellerProfile&&accessiblePublicCampaignRecord(published,s.graph.products)){
        const event=s.event!;plan.notices=[];
        for(const follower of s.followers){const parsed=sellerFollowSchema.safeParse(follower.follow);if(!parsed.success)continue;const f=parsed.data;
          if(!follower.exists||!f.following||!f.notifyNewDeals||f.sellerId!==selection.actorId||f.id!=='follow_'+crypto.createHash('sha256').update(JSON.stringify([f.userId,f.sellerId])).digest('hex')||event.blockTimestamp!*1000<Math.floor(f.newDealsSince/1000)*1000)continue;
          plan.notices.push({id:'ntf_'+crypto.createHash('sha256').update(f.userId+':seller-follow:'+event.id).digest('hex'),userId:f.userId,type:'SELLER_FOLLOW_CampaignCreated',title:'Deal công khai mới từ seller',message:'Seller có deal công khai mới đã gắn sự kiện tạo trên chain. Xem license và điều khoản trước khi tham gia.',link:'#campaign-'+campaign.id,createdAt:Date.now(),inAppEnabled:follower.inApp,translations:{en:{title:'A new public deal from a seller',message:'A new public deal has a bound chain creation event. Check its license and terms before joining.'}},source:{kind:'SELLER_FOLLOW_EVENT',eventId:event.id,eventName:event.eventName,chainId:event.chainId,hubAddress:event.contractAddress,txHash:event.txHash,blockNumber:event.blockNumber,blockHash:event.blockHash,logIndex:event.logIndex,occurredAt:event.blockTimestamp!*1000,campaignId:campaign.id,sellerId:selection.actorId}});
        }
      }
    }else if(action==='BUY'){
      BuyOperationService.validateReceipt(op!,v);
      const purchased=Object.values(s.graph.orders).find(o=>String(o.onchainOrderId)===String(v.parsedEvent.orderId));this.indexedOrder(purchased,v,campaign,s.event!.logIndex);
      if(!purchased||purchased.buyerAccountId!==selection.actorId||!completionSame(purchased.buyerPrincipal,op!.principal)||!completionSame(purchased.commitmentTxHash,op!.txHash))throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
      if(op!.phase==='PROJECTED'){if(op!.projectedOrderId!==purchased.id)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');return plan;}
      add('operations',op!.id,{phase:'PROJECTED',updatedAt:Date.now(),projectedOrderId:purchased.id});
    }else if(action==='DELIVER'){
      this.indexedOrder(order,v,campaign,s.event!.logIndex);
      const proofHash=String(v.parsedEvent.proofHash);
      if(!completionSame(order.deliveryProofHash,proofHash)||!completionSame(order.deliveryTxHash,v.txHash)||order.deliveryTimestamp!==Number(v.parsedEvent.deliveryTimestamp)||order.disputeDeadline!==Number(v.parsedEvent.disputeDeadline))throw new OperationCompletionError('OPERATION_CANONICAL_PROJECTION_REQUIRED');
      let content=secretContent;
      if(op){const staged=ResourceDeliveryService.assertStage(selection.actorId,op.id,s.graph,op.phase==='PROJECTED');const native=decryptEntitlement(op.stagedEntitlementEncrypted!);if(content!==undefined&&content!==native)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');content=native;
        if(op.phase!=='PROJECTED')for(const grant of staged.grants){add('resourceGrants',grant.id,{state:'ACTIVE',activatedAt:order.deliveryTimestamp});if(grant.licenseKeyId)add('licenseInventory',grant.licenseKeyId,{status:'ASSIGNED'});}
      }
      if(content===undefined||!completionSame(ethers.keccak256(ethers.toUtf8Bytes(content)),proofHash)||order.deliveredEntitlementEncrypted&&decryptEntitlement(order.deliveredEntitlementEncrypted)!==content)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
      if(op?.phase==='PROJECTED'){if(!order.deliveredEntitlementEncrypted)throw new OperationCompletionError('OPERATION_CANONICAL_PROJECTION_REQUIRED');return plan;}
      add('orders',order.id,{deliveredEntitlementEncrypted:order.deliveredEntitlementEncrypted??op?.stagedEntitlementEncrypted??encryptEntitlement(content),deliveryTxHash:v.txHash});
      audit('delivery:'+v.txHash,'seller','ORDER_FULFILLED',{orderId:order.id,campaignId:campaign.id,proofHash,disputeDeadline:order.disputeDeadline,txHash:v.txHash});
    }else if(action==='BUYER_CLAIM'||action==='SELLER_CLAIM'){
      const seller=action==='SELLER_CLAIM',call=iface.parseTransaction({data:op!.calldata}),name=seller?'claimSellerProceeds':'claimBuyerFunds';
      if(call?.name!==name||String(call.args[0])!==String(campaign.onchainCampaignId)||Number(v.parsedEvent.claimType)!==(seller?ClaimType.SELLER:ClaimType.BUYER)||!completionSame(v.parsedEvent.recipient,op!.principal))throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
      for(const id of new Set(Array.from(call.args[1],String))){const row=Object.values(s.graph.orders).find(o=>String(o.onchainOrderId)===id);
        if(!row||row.campaignId!==campaign.id||!seller&&(row.buyerAccountId!==selection.actorId||!completionSame(row.buyerPrincipal,op!.principal)))throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
        if(seller&&row.sellerAllocated==='0'&&row.sellerClaimedAmount==='0')continue;
        if(!Number.isSafeInteger(row.financialProjectionBlock)||row.financialProjectionBlock!<v.blockNumber||!row.transactionHistory?.some(h=>h.action===(seller?'SellerProceedsClaimed':'BuyerFundsClaimed')&&completionSame(h.txHash,v.txHash)&&h.blockNumber===v.blockNumber&&completionSame(h.blockHash,v.blockHash)&&h.logIndex===s.event!.logIndex&&h.chainId===config.arcChainId&&completionSame(h.hubAddress,config.hubAddress)))throw new OperationCompletionError('OPERATION_CANONICAL_PROJECTION_REQUIRED');
      }
      if(op!.phase==='PROJECTED')return plan;
    }else{
      this.indexedOrder(order,v,campaign,s.event!.logIndex);if(!['CONFIRM','BREACH','SETTLE'].includes(action))throw new OperationCompletionError('OPERATION_COMPLETION_ACTION_UNAVAILABLE');
      if(op){const input=OrderActionService.completionMetadata(op),call=iface.parseTransaction({data:op.calldata});if(input.action!==action||String(call?.args[0])!==String(campaign.onchainCampaignId)||String(call?.args[1])!==String(order.onchainOrderId)||op.orderTermsHash!==campaign.termsHash)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');if(op.phase==='PROJECTED')return plan;
        audit('order-action:'+op.id,action==='SETTLE'?'seller':'buyer','ORDER_ACTION_PROJECTED',{operationId:op.id,orderId:order.id,action,txHash:v.txHash,blockNumber:v.blockNumber});
      }else audit('confirm:'+v.txHash,'buyer','ORDER_CONFIRMED',{orderId:order.id,txHash:v.txHash,blockNumber:v.blockNumber,sellerAllocated:String(v.parsedEvent.sellerProceeds)});
    }
    if(op&&!plan.patches.some(p=>p.collection==='operations'))add('operations',op.id,{phase:'PROJECTED',updatedAt:Date.now()});
    return plan;
  }  public static projected(actor:string,id:string,proof?:SessionProof,secretContent?:string):void{
    const selection:CompletionSelection={actorId:actor,operationId:id,...(proof?{sessionKey:proof.key}:{})};
    try{
      const s=store.readOperationCompletionState(selection);this.authority(s,selection,proof);const context=this.context(s,selection);
      if(['DISPUTE','RESOLVE'].includes(context.action)){
        const op=context.op!,v=canonicalCompletion(op,context.intent,s.consumption,s.event,s.hash!),input=OrderActionService.completionMetadata(op);
        this.indexedOrder(context.order,v,context.campaign,s.event!.logIndex);
        if(input.action==='DISPUTE')DisputeService.recordOpenedMetadata(actor,op.resourceId,input.reason,input.evidenceUrls,v,proof,op.id);
        else if(input.action==='RESOLVE')DisputeService.recordResolvedMetadata(actor,op.resourceId,String(op.expectedEventArgs.buyerShare),String(op.expectedEventArgs.sellerShare),input.notes,v,proof,op.id);
        else throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
        return;
      }
      store.mutateOperationCompletion(selection,current=>{this.authority(current,selection,proof);if(this.context(current,selection).fingerprint!==context.fingerprint)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');return this.plan(current,selection,secretContent);});
    }catch(error){throw this.safe(error);}
  }
  public static async recover(actor:string,id:string,proof?:SessionProof){
    try{
      const first=this.owned(actor,id,proof),fingerprint=completionCore(first,actor).fingerprint;
      if(first.phase!=='PROJECTED'){
        const receipt=await OperationVerificationService.verify(actor,id,proof);
        const current=this.owned(actor,id,proof);if(completionCore(current,actor).fingerprint!==fingerprint)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
        await IndexerService.projectVerifiedReceipt(receipt);
        if(completionCore(this.owned(actor,id,proof),actor).fingerprint!==fingerprint)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
      }
      this.projected(actor,id,proof);
      return {operation:OperationTrackingService.owned(actor,id,proof)};
    }catch(error){throw this.safe(error);}
  }
  private static async legacy(selection:CompletionSelection,proof?:SessionProof,secretContent?:string){
    try{
      const first=store.readOperationCompletionState(selection);this.authority(first,selection,proof);let context=this.context(first,selection);
      if(!selection.legacy?.txHash)throw new OperationCompletionError('OPERATION_COMPLETION_INPUT_INVALID',400);
      if(context.op?.phase==='PROJECTED')this.projected(selection.actorId,context.op.id,proof,secretContent);
      else{
        if(context.op){OperationTrackingService.submit(selection.actorId,context.op.id,selection.legacy.txHash,proof);context=this.context(store.readOperationCompletionState(selection),selection);}
        const fingerprint=context.fingerprint;
        const receipt=context.op?await OperationVerificationService.verify(selection.actorId,context.op.id,proof):await TransactionVerifier.verifyExpectedTransaction(context.intent,selection.legacy.txHash);
        let current=store.readOperationCompletionState(selection);this.authority(current,selection,proof);if(this.context(current,selection).fingerprint!==fingerprint)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
        await IndexerService.projectVerifiedReceipt(receipt);
        current=store.readOperationCompletionState(selection);this.authority(current,selection,proof);if(this.context(current,selection).fingerprint!==fingerprint)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');
        if(context.op)this.projected(selection.actorId,context.op.id,proof,secretContent);
        else store.mutateOperationCompletion(selection,s=>{this.authority(s,selection,proof);if(this.context(s,selection).fingerprint!==fingerprint)throw new OperationCompletionError('OPERATION_COMPLETION_CONTEXT_CHANGED');return this.plan(s,selection,secretContent);});
      }
      const final=store.readOperationCompletionState(selection);this.authority(final,selection,proof);const c=this.context(final,selection),receipt=canonicalCompletion(c.op,c.intent,final.consumption,final.event,final.hash!);
      return {order:c.order,campaign:c.campaign,receipt};
    }catch(error){throw this.safe(error);}
  }
  public static result(actor:string,id:string,proof?:SessionProof){
    const selection:CompletionSelection={actorId:actor,operationId:id,...(proof?{sessionKey:proof.key}:{})},s=store.readOperationCompletionState(selection);this.authority(s,selection,proof);const c=this.context(s,selection);
    canonicalCompletion(c.op,c.intent,s.consumption,s.event,s.hash!);return {order:c.order,campaign:c.campaign,operation:operationPublicDto(c.op!)};
  }
  public static fulfill(actor:string,orderId:string,content:string,txHash:string|undefined,proof?:SessionProof){
    const proofHash=ethers.keccak256(ethers.toUtf8Bytes(content));return this.legacy({actorId:actor,...(proof?{sessionKey:proof.key}:{}),legacy:{action:'DELIVER',resourceId:orderId,txHash,proofHash}},proof,content);
  }
  public static confirm(actor:string,orderId:string,txHash:string,proof?:SessionProof){return this.legacy({actorId:actor,...(proof?{sessionKey:proof.key}:{}),legacy:{action:'CONFIRM',resourceId:orderId,txHash}},proof);}
  public static publish(actor:string,campaignId:string,txHash:string,proof?:SessionProof){return this.legacy({actorId:actor,...(proof?{sessionKey:proof.key}:{}),legacy:{action:'PUBLISH',resourceId:campaignId,txHash}},proof);}
  /** Existing trusted helper accepts only a verifier result already bound to native consumption/journal. */
  public static bind(campaignId:string,receipt:VerificationResult,calldata:string,actor?:string,proof?:SessionProof):CampaignRecord{
    try{
      if(!actor)actor=store.readCampaignPublicationOwner(campaignId,receipt.from);
      if(!actor)throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
      const selection:CompletionSelection={actorId:actor,...(proof?{sessionKey:proof.key}:{}),legacy:{action:'PUBLISH',resourceId:campaignId,txHash:receipt.txHash,verifiedReceipt:receipt,expectedCalldata:calldata}};
      store.mutateOperationCompletion(selection,s=>{this.authority(s,selection,proof);return this.plan(s,selection);});
      return store.db.campaigns[campaignId];
    }catch(error){throw this.safe(error);}
  }
}