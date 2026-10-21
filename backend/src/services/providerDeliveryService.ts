import {createHash} from 'node:crypto';
import {z} from 'zod';
import {store} from '../db/store';
import type {ProviderMutationState} from '../db/rowPersistence';
import type {DeliveryProbe} from '../domain/delivery';
import type {OperationReadinessGraph} from '../domain/operationReadiness';
import {providerRequest,providerSignature,verifyProviderReply,providerDigest,type ProviderScope} from '../domain/providerContract';
import {SessionService,type SessionProof,SessionError} from './sessionService';
import {config} from '../config';
import {decryptWebhookSecret} from './webhookSecret';
import {postWebhookProvider} from './webhookTransport';
import {computeTermsHash} from '../utils/crypto';
import {productVersionInventory,licenseVersionInventory,productInventory} from '../domain/product';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),command=z.string().regex(/^[-A-Za-z0-9:_]{8,180}$/);
export const providerEvidenceHash=(p:DeliveryProbe)=>computeTermsHash({schema:'GroupDealProviderEvidenceV1',id:p.id,sellerId:p.sellerId,productVersionId:p.productVersionId,method:p.method,resourceId:p.resourceId,resourceSha256:p.resourceSha256,checkedAt:p.checkedAt,provider:p.provider});
export class ProviderDeliveryError extends Error{constructor(public code:string,public status=409){super(code);}}
export const providerProbeId=(actor:string,key:string)=>'provider_'+createHash('sha256').update(actor+'\0'+key).digest('hex');
function authority(state:ProviderMutationState,proof:SessionProof){const user=SessionService.assertCommitted(proof,state.auth);if(!user.roles.includes('seller')||state.campaign?.sellerId!==user.id)throw new ProviderDeliveryError('PROVIDER_FORBIDDEN',403);return user;}
function context(state:ProviderMutationState){
 const {campaign:c,subscription:s}=state;
 if(!c||!s||s.held||!s.events.includes('order.committed')&&!s.events.includes('*')||c.deliveryMethod!=='WEBHOOK'||c.status!=='DRAFT'||c.onchainCampaignId!==undefined||state.publicationLocked)throw new ProviderDeliveryError('PROVIDER_DRAFT_UNAVAILABLE');
 const v=productVersionInventory(state.version),l=licenseVersionInventory(state.license),p=productInventory(state.product),url=new URL(s.targetUrl);
 if(p.status==='ARCHIVED'||c.draftProductVersionId!==v.id||v.productId!==p.id||v.licenseVersionId!==l.id||v.sellerId!==c.sellerId||l.productId!==p.id
  ||l.seatsPerUnit!==1||l.durationDays!==null||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/webhooks/groupdeal'||config.arcChainId!==5042002)throw new ProviderDeliveryError('PROVIDER_CONTEXT_UNSUPPORTED');
 const scope:ProviderScope={subscriptionId:s.id,campaignId:c.id,productVersionId:v.id,licenseVersionId:l.id,chainId:5042002,hubAddress:config.hubAddress.toLowerCase()};
 const fingerprint=providerDigest(JSON.stringify({scope,draftVersion:c.draftVersion,termsHash:c.termsHash,versionHash:v.contentHash,licenseHash:l.contentHash,productStatus:p.status,subscriptionFingerprint:s.fingerprint}));
 return{c,s,v,l,scope,fingerprint};
}
const safeProbe=(p:DeliveryProbe)=>{if(p.method!=='WEBHOOK'||!p.provider||p.evidenceHash!==providerEvidenceHash(p))throw new ProviderDeliveryError('PROVIDER_PROOF_INVALID');return{id:p.id,campaignId:p.provider.campaignId,productVersionId:p.productVersionId,licenseVersionId:p.provider.licenseVersionId,method:p.method,packageSha256:p.resourceSha256,byteLength:p.provider.byteLength,checkedAt:p.checkedAt,expiresAt:p.provider.expiresAt,evidenceHash:p.evidenceHash};};
export class ProviderDeliveryService{
 private static send=postWebhookProvider;
 static async probe(proof:SessionProof,campaignId:string,input:unknown,key:string){
  id.parse(campaignId);command.parse(key);const {expectedVersion}=z.object({expectedVersion:z.number().int().positive().safe()}).strict().parse(input);
  const selection={actorId:proof.account.id,sessionKey:proof.key,campaignId,probeId:providerProbeId(proof.account.id,key)},state=store.readProviderMutationState(selection);authority(state,proof);const c=context(state);
  if(c.c.draftVersion!==expectedVersion)throw new ProviderDeliveryError('PROVIDER_DRAFT_CHANGED');
  const retained=(s:ProviderMutationState)=>{authority(s,proof);const current=context(s),p=s.probe;if(!p||p.method!=='WEBHOOK'||p.provider?.commandId!==key||p.provider.campaignId!==campaignId||p.provider.subscriptionFingerprint!==current.s.fingerprint||p.productVersionId!==current.v.id||p.provider.licenseVersionId!==current.l.id||s.campaign?.deliveryProbeId!==p.id)throw new ProviderDeliveryError('PROVIDER_COMMAND_CONTEXT_CHANGED');return{probe:safeProbe(p)};};
  if(state.probe)return retained(state);
  const request=providerRequest(c.scope),raw=JSON.stringify(request),secret=c.s.secretEncrypted?decryptWebhookSecret(c.s.secretEncrypted,c.s.id):c.s.secret!;
  let reply;try{const result=await this.send(c.s.targetUrl,raw,{'Content-Type':'application/json','X-GroupDeal-Provider-Signature':providerSignature(secret,'request',raw)});reply=verifyProviderReply(request,secret,c.s.targetUrl,result.body,result.signature);if(reply.action!=='PROBE')throw Error();}catch{throw new ProviderDeliveryError('PROVIDER_PROOF_UNAVAILABLE',503);}
  const checkedAt=Date.now(),responseSha256=providerDigest(JSON.stringify(reply)),probe:DeliveryProbe={id:selection.probeId,sellerId:selection.actorId,productVersionId:c.v.id,method:'WEBHOOK',resourceId:'provider_'+c.s.id,resourceSha256:reply.packageSha256,checkedAt,
   evidenceHash:'',provider:{schema:'GroupDealProviderProbeV1',campaignId,licenseVersionId:c.l.id,subscriptionId:c.s.id,endpoint:c.s.targetUrl,subscriptionFingerprint:c.s.fingerprint,chainId:5042002,hubAddress:config.hubAddress.toLowerCase(),byteLength:reply.byteLength,expiresAt:checkedAt+15*60000,commandId:key,requestSha256:providerDigest(raw),responseSha256}};
  probe.evidenceHash=providerEvidenceHash(probe);
  return store.mutateProviderProbe(selection,current=>{authority(current,proof);if(current.probe)return{result:retained(current)};if(context(current).fingerprint!==c.fingerprint)throw new ProviderDeliveryError('PROVIDER_CONTEXT_CHANGED');return{result:{probe:safeProbe(probe)},probe};});
 }
 static receipt(proof:SessionProof,campaignId:string,key:string){id.parse(campaignId);command.parse(key);const state=store.readProviderMutationState({actorId:proof.account.id,sessionKey:proof.key,campaignId,probeId:providerProbeId(proof.account.id,key)});authority(state,proof);if(!state.probe||state.probe.method!=='WEBHOOK'||state.probe.provider?.campaignId!==campaignId||state.probe.provider.commandId!==key)throw new ProviderDeliveryError('PROVIDER_PROOF_NOT_FOUND',404);return{probe:safeProbe(state.probe)};}
 static assertProbe(actor:string,versionId:string,probe:DeliveryProbe|undefined,graph:OperationReadinessGraph,requireCurrent=true,requireFresh=true){
  if(!probe||providerEvidenceHash(probe)!==probe.evidenceHash)throw new ProviderDeliveryError('PROVIDER_PROOF_INVALID');
  const p=probe?.provider,c=p&&graph.campaigns[p.campaignId],s=graph.providerSubscriptions?.[actor];
  if(!probe||probe.method!=='WEBHOOK'||probe.sellerId!==actor||probe.productVersionId!==versionId||!p||p.schema!=='GroupDealProviderProbeV1'||!c||c.sellerId!==actor||c.deliveryMethod!=='WEBHOOK'||c.deliveryProbeId!==probe.id||p.licenseVersionId!==(c.productSnapshot?.licenseVersionId??graph.productVersions[versionId]?.licenseVersionId)||p.chainId!==config.arcChainId||p.hubAddress!==config.hubAddress.toLowerCase()||requireCurrent&&(!s||s.held||s.id!==p.subscriptionId||s.targetUrl!==p.endpoint||s.fingerprint!==p.subscriptionFingerprint||!s.events.includes('order.committed')&&!s.events.includes('*'))||!/^[a-f0-9]{64}$/.test(probe.resourceSha256)||!Number.isSafeInteger(p.byteLength)||p.byteLength<1||p.byteLength>16*1024*1024||requireFresh&&c.status==='DRAFT'&&p.expiresAt<=Date.now())throw new ProviderDeliveryError('PROVIDER_PROOF_CONTEXT_CHANGED');return probe;
 }
 static async verifyProbe(actor:string,campaignId:string,graph:OperationReadinessGraph){
  const campaign=graph.campaigns[campaignId];if(!campaign?.draftProductVersionId)throw new ProviderDeliveryError('PROVIDER_DRAFT_UNAVAILABLE');
  const probe=this.assertProbe(actor,campaign.draftProductVersionId,graph.deliveryProbes[campaign.deliveryProbeId!],graph,true,false),p=probe.provider!,native=store.readProviderMutationState({actorId:actor,sessionKey:'',campaignId}).subscription;
  if(!native||native.fingerprint!==p.subscriptionFingerprint||native.held)throw new ProviderDeliveryError('PROVIDER_SUBSCRIPTION_CHANGED');
  const request=providerRequest({subscriptionId:p.subscriptionId,campaignId,productVersionId:probe.productVersionId,licenseVersionId:p.licenseVersionId,chainId:5042002,hubAddress:p.hubAddress}),raw=JSON.stringify(request),secret=native.secretEncrypted?decryptWebhookSecret(native.secretEncrypted,native.id):native.secret!;
  try{const response=await this.send(p.endpoint,raw,{'Content-Type':'application/json','X-GroupDeal-Provider-Signature':providerSignature(secret,'request',raw)}),reply=verifyProviderReply(request,secret,p.endpoint,response.body,response.signature);if(reply.action!=='PROBE'||reply.packageSha256!==probe.resourceSha256||reply.byteLength!==p.byteLength)throw Error();}catch{throw new ProviderDeliveryError('PROVIDER_PROOF_UNAVAILABLE',503);}
 }
 static async resolve(actor:string,orderId:string,graph:OperationReadinessGraph){
  const order=graph.orders[orderId],campaign=order&&graph.campaigns[order.campaignId];if(!order||!campaign||!campaign.productSnapshot)throw new ProviderDeliveryError('PROVIDER_ORDER_UNAVAILABLE');
  const probe=this.assertProbe(actor,campaign.productSnapshot.productVersionId,graph.deliveryProbes[campaign.deliveryProbeId!],graph),binding=probe.provider!;
  // Re-read only this seller's native subscription. No application session is sent to the provider.
  const native=store.readProviderMutationState({actorId:actor,sessionKey:'',campaignId:campaign.id}).subscription;
  if(!native||native.fingerprint!==binding.subscriptionFingerprint||native.held)throw new ProviderDeliveryError('PROVIDER_SUBSCRIPTION_CHANGED');
  const scope:ProviderScope={subscriptionId:binding.subscriptionId,campaignId:campaign.id,productVersionId:probe.productVersionId,licenseVersionId:binding.licenseVersionId,chainId:5042002,hubAddress:binding.hubAddress};
  const request=providerRequest(scope,{orderId:order.id,buyerPrincipal:order.buyerPrincipal,quantity:order.quantity,commitmentTxHash:order.commitmentTxHash!}),raw=JSON.stringify(request),secret=native.secretEncrypted?decryptWebhookSecret(native.secretEncrypted,native.id):native.secret!;
  try{const result=await this.send(binding.endpoint,raw,{'Content-Type':'application/json','X-GroupDeal-Provider-Signature':providerSignature(secret,'request',raw)}),reply=verifyProviderReply(request,secret,binding.endpoint,result.body,result.signature);
   if(reply.action!=='RESOLVE'||reply.packageSha256!==probe.resourceSha256||reply.byteLength!==binding.byteLength)throw Error();
   return{version:1,method:'WEBHOOK',providerProbeId:probe.id,subscriptionFingerprint:binding.subscriptionFingerprint,orderId:order.id,campaignId:campaign.id,productVersionId:scope.productVersionId,licenseVersionId:scope.licenseVersionId,chainId:scope.chainId,hubAddress:scope.hubAddress,buyerPrincipal:order.buyerPrincipal.toLowerCase(),quantity:order.quantity,packageSha256:reply.packageSha256,byteLength:reply.byteLength,expiresAt:reply.grant.expiresAt,downloadUrl:reply.grant.downloadUrl};
  }catch{throw new ProviderDeliveryError('PROVIDER_ENTITLEMENT_UNAVAILABLE',503);}
 }
}
export function providerFailure(res:any,error:unknown){if(error instanceof ProviderDeliveryError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}res.status(error instanceof z.ZodError?400:503).json({error:error instanceof z.ZodError?'PROVIDER_INPUT_INVALID':'PROVIDER_UNAVAILABLE'});}
