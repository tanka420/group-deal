import {OperationCompletionService} from './operationCompletionService';
import {OperationPreparationService} from './operationPreparationService';
import type {OperationReadinessGraph} from '../domain/operationReadiness';
import crypto from "node:crypto";
import { ethers } from "ethers";
import { store } from "../db/store";
import {StorageConflict,LegacyWriterConflict} from "../db/rowPersistence";
import { encryptEntitlement,decryptEntitlement,encryptionKey } from "../utils/crypto";
import type { DigitalResource, ResourceGrant } from "../domain/delivery";
import { OperationService } from "./operationService";
import { HUB_ABI } from "../contracts/hubAbi";
import { config } from "../config";
import {SessionService,SessionProof} from './sessionService';
import {buyerResourceView,ResourceAccessError} from './buyerResourceView';
import {ResourceMutationService} from './resourceMutationService';

const equal=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const iface=new ethers.Interface(HUB_ABI);
export class ResourceDeliveryService {
 public static assertStage(sellerId:string,id:string,graph:OperationReadinessGraph=store.db,allowActivated=false){
  const operation=graph.operations[id];if(!operation||operation.userId!==sellerId)throw Error('FORBIDDEN: operation is not owned by this account');const order=graph.orders[operation.resourceId],campaign=order&&graph.campaigns[order.campaignId];
  if(operation.action!=="DELIVER"||!order||!campaign||campaign.sellerId!==sellerId||!graph.users[sellerId]?.roles.includes("seller")||operation.chainId!==config.arcChainId||operation.hubAddress.toLowerCase()!==config.hubAddress.toLowerCase()||order.chainId!==operation.chainId||campaign.chainId!==operation.chainId||order.hubAddress?.toLowerCase()!==operation.hubAddress.toLowerCase()||campaign.hubAddress?.toLowerCase()!==operation.hubAddress.toLowerCase()||operation.principal!==campaign.sellerPayoutWallet.toLowerCase())throw new Error("CONFLICT: staged delivery account/deployment binding changed");
  const snapshot=campaign.productSnapshot;
  try{
   if(!operation.stagedEntitlementEncrypted||!snapshot)throw new Error();
   const payload=decryptEntitlement(operation.stagedEntitlementEncrypted),stage=JSON.parse(payload),proofHash=ethers.keccak256(ethers.toUtf8Bytes(payload));
   const parsed=iface.parseTransaction({data:operation.calldata});
   if(operation.expectedFunction!=="recordDelivery"||operation.expectedEvent!=="DeliveryRecorded"||parsed?.name!=="recordDelivery"||parsed.args.campaignId!==BigInt(campaign.onchainCampaignId!)||parsed.args.orderId!==BigInt(order.onchainOrderId)||!equal(parsed.args.proofHash,proofHash)||!equal(operation.expectedEventArgs.proofHash,proofHash)||String(operation.expectedEventArgs.campaignId)!==String(campaign.onchainCampaignId)||String(operation.expectedEventArgs.orderId)!==String(order.onchainOrderId)||stage.version!==1||stage.method!==campaign.deliveryMethod||!["FILE_LINK","LICENSE_KEY"].includes(stage.method)||!Array.isArray(stage.grants)||stage.grants.length!==order.quantity)throw new Error();
   const license=graph.licenseVersions[snapshot.licenseVersionId],version=graph.productVersions[snapshot.productVersionId];
   if(!license||!version||license.contentHash!==snapshot.licenseContentHash||version.contentHash!==snapshot.productContentHash||version.sellerId!==sellerId)throw new Error();
   const probe=this.assertProbe(sellerId,snapshot.productVersionId,stage.method,campaign.deliveryProbeId,graph),grants=Object.values(graph.resourceGrants).filter(g=>g.orderId===order.id).sort((a,b)=>a.unitIndex-b.unitIndex);
   if(grants.length!==order.quantity||new Set(stage.grants.map((g:any)=>g.id)).size!==order.quantity)throw new Error();
   for(const [unit,grant] of grants.entries()){
    const content=stage.grants.find((g:any)=>g.id===grant.id);
    if(grant.unitIndex!==unit||(allowActivated?grant.state!=="ACTIVE"||grant.activatedAt!==order.deliveryTimestamp:grant.state!=="STAGED"||grant.activatedAt!==undefined||grant.redeemedAt!==undefined)||grant.buyerAccountId!==order.buyerAccountId||!equal(grant.buyerPrincipal,order.buyerPrincipal)||grant.productVersionId!==snapshot.productVersionId||grant.licenseVersionId!==license.id||grant.resourceId!==probe.resourceId||grant.seatsPerUnit!==license.seatsPerUnit||content?.unitIndex!==unit||content.seatsPerUnit!==grant.seatsPerUnit)throw new Error();
    if(stage.method==="LICENSE_KEY"){
     const key=grant.licenseKeyId&&graph.licenseInventory[grant.licenseKeyId];
     if(!key||key.status!==(allowActivated?"ASSIGNED":"RESERVED")||key.orderId!==order.id||key.operationId!==operation.id||key.resourceId!==probe.resourceId||key.sellerId!==sellerId||key.productVersionId!==snapshot.productVersionId||content.licenseKey!==decryptEntitlement(key.keyEncrypted))throw new Error();
    }else if(grant.licenseKeyId||content.licenseKey!==undefined)throw new Error();
   }
   return {operation,order,campaign,grants};
  }catch{throw new Error("CONFLICT: staged resource/license binding is incomplete; retain the existing reservation");}
 }

  public static upload(sellerId:string,versionId:string,fileName:string,mimeType:string,bytes:Buffer,options:Parameters<typeof ResourceMutationService.upload>[5]={}) {return ResourceMutationService.upload(sellerId,versionId,fileName,mimeType,bytes,options).resource;}
  public static importKeys(sellerId:string,resourceId:string,keys:unknown,options:Parameters<typeof ResourceMutationService.importKeys>[3]={}) {const result=ResourceMutationService.importKeys(sellerId,resourceId,keys,options);return {imported:result.imported};}
  private static resourceBytes(resource:DigitalResource):Buffer {
    const bytes=Buffer.from(decryptEntitlement(resource.encryptedPayload),"base64");
    if(bytes.length!==resource.byteLength||crypto.createHash("sha256").update(bytes).digest("hex")!==resource.sha256)throw new Error("RESOURCE_INTEGRITY_FAILED");
    return bytes;
  }
  public static probe(sellerId:string,resourceId:string,method:"FILE_LINK"|"LICENSE_KEY",options:Parameters<typeof ResourceMutationService.probe>[3]={}) {return ResourceMutationService.probe(sellerId,resourceId,method,options).probe;}
  public static assertProbe(sellerId:string,versionId:string,method:string,probeId:string|undefined,graph:OperationReadinessGraph=store.db) {
    const probe=probeId&&graph.deliveryProbes[probeId];
    if(!probe||probe.sellerId!==sellerId||probe.productVersionId!==versionId||probe.method!==method)throw new Error("DELIVERY_PROBE_REQUIRED: test a real resource/provider for this product and delivery method");
    const resource=graph.resources[probe.resourceId];
    if(!resource||resource.sha256!==probe.resourceSha256)throw new Error("RESOURCE_INTEGRITY_FAILED");
    this.resourceBytes(resource);
    return probe;
  }
  public static prepare(sellerId:string,orderId:string,idempotencyKey:string,proof?:SessionProof){return OperationPreparationService.deliver(sellerId,orderId,idempotencyKey,proof);}
  public static activate(sellerId:string,operationId:string,proof?:SessionProof):void {OperationCompletionService.projected(sellerId,operationId,proof);}
  private static buyerState(userId:string,proof?:SessionProof,orderId?:string,grantId?:string,includeResourceBytes=false){
    if(proof){const snapshot=store.readBuyerResourceState(userId,proof.key,orderId,grantId,includeResourceBytes);if(SessionService.assertCommitted(proof,snapshot.auth).id!==userId)throw new ResourceAccessError('RESOURCE_ACCESS_DENIED');return snapshot;}
    const grant=grantId&&store.db.resourceGrants[grantId],order=store.db.orders[orderId??(grant?grant.orderId:'')];return {order,grants:store.db.resourceGrants,resources:store.db.resources,licenseVersions:store.db.licenseVersions,licenseInventory:store.db.licenseInventory};
  }
  public static list(userId:string,orderId:string,proof?:SessionProof) {
    const state=this.buyerState(userId,proof,orderId);if(state.order?.buyerAccountId!==userId)throw new ResourceAccessError('RESOURCE_ACCESS_DENIED');
    return Object.values(state.grants).filter(g=>g.orderId===orderId&&g.state==='ACTIVE').sort((a,b)=>a.unitIndex-b.unitIndex||a.id.localeCompare(b.id)).map(g=>{if(g.buyerAccountId!==userId||g.buyerPrincipal.toLowerCase()!==state.order!.buyerPrincipal.toLowerCase())throw new ResourceAccessError('RESOURCE_METADATA_UNAVAILABLE',503);return buyerResourceView(g,state.resources[g.resourceId],state.licenseVersions[g.licenseVersionId]);});
  }
  public static redeem(userId:string,grantId:string,key:string,proof?:SessionProof):void {
    try{store.mutateBuyerResourceRedemption(userId,proof?.key,grantId,state=>{
      if(proof&&SessionService.assertCommitted(proof,state.auth).id!==userId)throw new ResourceAccessError('RESOURCE_ACCESS_DENIED');
      const grant=state.grants[grantId];if(!grant||grant.buyerAccountId!==userId||state.order?.buyerAccountId!==userId||grant.orderId!==state.order.id||grant.buyerPrincipal.toLowerCase()!==state.order.buyerPrincipal.toLowerCase()||grant.state!=="ACTIVE"||!grant.licenseKeyId)throw new ResourceAccessError('RESOURCE_ACCESS_DENIED');
      if(typeof key!=='string'||!/^[-A-Za-z0-9_]{12,128}$/.test(key))throw new ResourceAccessError('RESOURCE_KEY_INVALID',400);
      const view=buyerResourceView(grant,state.resources[grant.resourceId],state.licenseVersions[grant.licenseVersionId]);if(['LICENSE_EXPIRED','ACTIVATION_WINDOW_EXPIRED'].includes(view.accessStatus))throw new ResourceAccessError(view.accessStatus);
      const inventory=state.licenseInventory[grant.licenseKeyId];if(!inventory||inventory.id!==grant.licenseKeyId||inventory.orderId!==grant.orderId||inventory.resourceId!==grant.resourceId||inventory.status!=='ASSIGNED'||!/^[a-f0-9]{64}$/.test(inventory.keyFingerprint))throw new ResourceAccessError('RESOURCE_METADATA_UNAVAILABLE',503);
      const fingerprint=crypto.createHash('sha256').update(key).digest('hex');if(!crypto.timingSafeEqual(Buffer.from(fingerprint,'hex'),Buffer.from(inventory.keyFingerprint,'hex')))throw new ResourceAccessError('RESOURCE_KEY_INVALID',400);
      return grant.redeemedAt===undefined?Date.now():undefined;
    });}catch(error){if(error instanceof StorageConflict||error instanceof LegacyWriterConflict||error instanceof Error&&error.message.startsWith('CONFLICT:'))throw new ResourceAccessError('RESOURCE_REDEMPTION_CONFLICT',409);throw error;}
  }
  public static download(userId:string,grantId:string,proof?:SessionProof) {
    const state=this.buyerState(userId,proof,undefined,grantId,true),grant=state.grants[grantId];if(!grant||grant.buyerAccountId!==userId||state.order?.buyerAccountId!==userId||grant.state!=='ACTIVE'||grant.orderId!==state.order.id||grant.buyerPrincipal.toLowerCase()!==state.order.buyerPrincipal.toLowerCase())throw new ResourceAccessError('RESOURCE_ACCESS_DENIED');
    const resource=state.resources[grant.resourceId],view=buyerResourceView(grant,resource,state.licenseVersions[grant.licenseVersionId]);if(!view.downloadReady)throw new ResourceAccessError(view.accessStatus==='AWAITING_REDEMPTION'?'RESOURCE_REDEMPTION_REQUIRED':view.accessStatus);
    return {bytes:this.resourceBytes(resource),fileName:resource.fileName,mimeType:resource.mimeType,sha256:resource.sha256};
  }
  public static signedDownload(userId:string,grantId:string,proof?:SessionProof) {
    const file=this.download(userId,grantId,proof);
    const expiresAt=Math.floor(Date.now()/1000)+600,keyId=config.masterEncryptionKeyId;
    const signature=crypto.createHmac("sha256",encryptionKey(keyId)).update(`resource-download:v1:${userId}:${grantId}:${expiresAt}`).digest("hex");
    return {grantId,fileName:file.fileName,mimeType:file.mimeType,byteLength:file.bytes.length,sha256:file.sha256,expiresAt,url:`/api/delivery/grants/${encodeURIComponent(grantId)}/download?expiresAt=${expiresAt}&keyId=${encodeURIComponent(keyId)}&signature=${signature}`};
  }
  public static verifyDownloadToken(userId:string,grantId:string,expiresAt:string,keyId:string,signature:string):void {
    if(!/^\d+$/.test(expiresAt)||!Number.isSafeInteger(Number(expiresAt))||Number(expiresAt)<Math.floor(Date.now()/1000)||Number(expiresAt)>Math.floor(Date.now()/1000)+600||!/^[-a-zA-Z0-9_]{1,64}$/.test(keyId)||!/^[a-f0-9]{64}$/.test(signature))throw new ResourceAccessError('RESOURCE_DOWNLOAD_TOKEN_INVALID');
    const expected=crypto.createHmac("sha256",encryptionKey(keyId)).update(`resource-download:v1:${userId}:${grantId}:${expiresAt}`).digest("hex");
    if(!crypto.timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(signature,"hex")))throw new ResourceAccessError('RESOURCE_DOWNLOAD_TOKEN_INVALID');
  }
}
