import {store} from '../db/store';
import {SignerReservationError,prepareSignerAcquisition} from '../domain/signerReservation';
import {OperationVerificationError} from '../domain/operationVerification';
import {readServerBridgeRpc} from './bridgeReadRpc';
import {StorageConflict} from '../db/rowPersistence';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {OperationReadinessError,readyCore,readinessFingerprint,type OperationReadinessGraph,type OperationReadinessPatch} from '../domain/operationReadiness';
import {ClaimOperationService} from './claimOperationService';
import {BuyOperationService} from './buyOperationService';
import {OrderActionService,isOrderAction} from './orderActionService';
import {DeliveryRetryService} from './deliveryRetryService';
import {ProductService} from './productService';
import {ResourceDeliveryService} from './resourceDeliveryService';
import {campaignCalldata} from './campaignBindingService';
export {OperationReadinessError} from '../domain/operationReadiness';
type State=ReturnType<typeof store.readOperationReadinessState>;
export class OperationReadinessService{
 private static safe(e:unknown):Error{if(e instanceof OperationVerificationError)return new OperationReadinessError(e.code==='OPERATION_VERIFICATION_FORBIDDEN'?'OPERATION_READINESS_FORBIDDEN':e.code==='OPERATION_VERIFICATION_UNAVAILABLE'?'OPERATION_READINESS_UNAVAILABLE':e.code,e.status);if(e instanceof SignerReservationError)return new OperationReadinessError(e.code,e.status);if(e instanceof OperationReadinessError||e instanceof SessionError)return e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))return new OperationReadinessError('OPERATION_READINESS_CONFLICT');if(e instanceof Error&&e.message.startsWith('FORBIDDEN:'))return new OperationReadinessError('OPERATION_READINESS_FORBIDDEN',403);if(e instanceof Error&&e.message.startsWith('RPC_UNAVAILABLE:'))return new OperationReadinessError('OPERATION_QUOTE_UNAVAILABLE');if(e instanceof Error&&/^(PRODUCT_REQUIRED|RIGHTS_REQUIRED|DELIVERY_PROBE_REQUIRED|RESOURCE_INTEGRITY_FAILED|VALIDATION)/.test(e.message))return new OperationReadinessError('OPERATION_POLICY_UNAVAILABLE');return new OperationReadinessError('OPERATION_READINESS_UNAVAILABLE',503)}
 private static authority(s:State,actor:string,proof?:SessionProof){if(proof){if(proof.account.id!==actor||SessionService.assertCommitted(proof,s.auth).id!==actor)throw new OperationReadinessError('OPERATION_READINESS_FORBIDDEN',403)}else{if(readAuthRecoveryBarrier(s.auth.authRecovery))throw new SessionError('AUTH_SESSION_INACTIVE');const user=s.auth.user;if(!user||user.id!==actor||!Array.isArray(user.roles)||user.roles.some(r=>!['buyer','seller','operator'].includes(r)))throw new OperationReadinessError('OPERATION_READINESS_FORBIDDEN',403)}if(!s.operation)throw new OperationReadinessError('OPERATION_NOT_FOUND',404);if(s.operation.action==='RESOLVE')SessionService.assertOperatorCommitted(proof,s.auth);readyCore(s.operation,actor);if(s.operation.principal.toLowerCase()!==s.auth.user?.activeWallet?.toLowerCase())throw new OperationReadinessError('OPERATION_CONTEXT_CHANGED');if(s.targetDirty)throw new OperationReadinessError('OPERATION_READINESS_CONFLICT');return s.operation}
 public static async ready(actor:string,id:string,proof?:SessionProof){try{
  const selection={actorId:actor,operationId:id,...(proof?{sessionKey:proof.key}:{})},first=store.readOperationReadinessState(selection),operation=this.authority(first,actor,proof),initial=readinessFingerprint(first.graph),graph=first.graph;
  const fresh=():OperationReadinessGraph=>{const state=store.readOperationReadinessState(selection);this.authority(state,actor,proof);if(readinessFingerprint(state.graph)!==initial)throw new OperationReadinessError('OPERATION_CONTEXT_CHANGED');return state.graph};
  let patch:OperationReadinessPatch={updatedAt:Date.now()};
  if(operation.action==='PUBLISH'){
    const campaign=graph.campaigns[operation.resourceId];if(!campaign||campaign.sellerId!==actor||!graph.users[actor].roles.includes('seller')||campaign.status!=='DRAFT'||campaign.onchainCampaignId!==undefined||campaignCalldata(campaign)!==operation.calldata)throw new OperationReadinessError('OPERATION_CONTEXT_CHANGED');
    ProductService.assertPublishable(actor,campaign.productSnapshot,Math.floor(Date.now()/1000)+campaign.durationSeconds+campaign.deliverySlaSeconds,campaign.productSnapshot?graph.productPolicies?.[campaign.productSnapshot.productVersionId]:undefined);
    ResourceDeliveryService.assertProbe(actor,campaign.draftProductVersionId!,campaign.deliveryMethod,campaign.deliveryProbeId,graph);
  }else if(operation.action==='DELIVER'){
    const order=graph.orders[operation.resourceId],campaign=order&&graph.campaigns[order.campaignId];if(!order||!campaign||order.deliveryStatus!=='PENDING'||campaign.status!=='FINALIZED')throw new OperationReadinessError('OPERATION_CONTEXT_CHANGED');patch.deliveryQuote=await DeliveryRetryService.validateReady(actor,id,graph);
  }else if(['BUYER_CLAIM','SELLER_CLAIM'].includes(operation.action))patch.financialQuote=await ClaimOperationService.validateReady(actor,operation,graph);
  else if(operation.action==='BUY')patch.purchaseQuote=await BuyOperationService.validateReady(actor,operation,graph,fresh);
  else if(isOrderAction(operation.action))patch.orderQuote=await OrderActionService.validateReady(actor,operation,graph);
  else throw new OperationReadinessError('OPERATION_ACTION_UNAVAILABLE');
  fresh();const signerState=store.readOperationReadinessState(selection);this.authority(signerState,actor,proof);if(!signerState.signer)throw new OperationReadinessError('OPERATION_READINESS_UNAVAILABLE',503);const signerPlan=await prepareSignerAcquisition(signerState.signer,proof?.claims.authRecoveryContext,readServerBridgeRpc,true);fresh();patch.updatedAt=Date.now();const committed=store.mutateOperationReadiness(selection,state=>{this.authority(state,actor,proof);if(readinessFingerprint(state.graph)!==initial)throw new OperationReadinessError('OPERATION_CONTEXT_CHANGED');return patch},signerPlan);
  return{operation:committed,...(['PUBLISH','DELIVER'].includes(operation.action)?{campaign:graph.campaigns[operation.action==='PUBLISH'?operation.resourceId:graph.orders[operation.resourceId].campaignId]}:{})};
 }catch(e){throw this.safe(e)}}
}