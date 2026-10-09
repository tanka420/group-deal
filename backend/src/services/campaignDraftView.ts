import { ethers } from "ethers";
import { z } from "zod";
import { store } from "../db/store";
import { config } from "../config";
import { campaignDraftSchema } from "./campaignEditorService";
import { campaignDto } from "./campaignDto";
import { ProductService } from "./productService";
import { campaignCalldata } from "./campaignBindingService";

const idSchema=z.string().regex(/^[a-zA-Z0-9:_-]{1,180}$/);
const querySchema=z.object({after:idSchema.optional()}).strict();
const pendingPhases=["PREPARED","AWAITING_SIGNATURE","SUBMITTED","UNKNOWN","RECEIPT_VERIFIED"];
export function listCampaignDrafts(sellerId:string,query:unknown){
  const {after}=querySchema.parse(query);
  const all=Object.values(store.db.campaigns).filter(c=>c.sellerId===sellerId&&c.status==="DRAFT"&&(!after||c.id>after)).sort((a,b)=>a.id===b.id?0:a.id<b.id?-1:1),page=all.slice(0,50);
  return {drafts:page.map(c=>({id:c.id,title:c.title,draftVersion:c.draftVersion||1,protocolVersion:c.protocolVersion||1,productVersionId:c.draftProductVersionId,publicationLocked:Object.values(store.db.operations).some(o=>o.userId===sellerId&&o.resourceId===c.id&&o.action==="PUBLISH"&&pendingPhases.includes(o.phase))})),pagination:{nextCursor:all.length>50?page[page.length-1].id:null}};
}
export function campaignDraftView(sellerId:string,id:string,query:unknown){
  z.object({}).strict().parse(query);idSchema.parse(id);
  const c=Object.hasOwn(store.db.campaigns,id)?store.db.campaigns[id]:undefined;
  if(!c)throw new Error("NOT_FOUND: draft unavailable");
  if(c.sellerId!==sellerId)throw new Error("FORBIDDEN: draft ownership");
  if(c.status!=="DRAFT"||c.onchainCampaignId!==undefined)throw new Error("CONFLICT: publication already bound; use campaign and transaction history");
  if((c.protocolVersion||1)!==config.protocolVersion)throw new Error("CONFLICT: draft belongs to a different protocol version");
  const version=c.draftProductVersionId&&store.db.productVersions[c.draftProductVersionId],product=version&&store.db.products[version.productId];
  if(!version||!product||version.sellerId!==sellerId||product.status==="ARCHIVED")throw new Error("CONFLICT: draft product version needs recovery; never substitute the latest version automatically");
  const publicVersion=ProductService.publicVersion(version.id)!;
  const input=campaignDraftSchema.parse({title:c.title,description:c.description,category:c.category,thumbnailUrl:c.thumbnailUrl,productVersionId:version.id,metric:c.metric,tiers:c.tiers.map(t=>({threshold:t.threshold,priceUSDC:ethers.formatUnits(t.price,6)})),maxPerAccount:c.maxPerAccount,inventoryLimit:c.inventoryLimit,durationDays:c.durationSeconds/86400,deliverySlaHours:c.deliverySlaSeconds/3600,earlyRebateEnabled:c.earlyRebateEnabled,earlySlotsCount:c.earlySlotsCount,earlyRebateAmountUSDC:ethers.formatUnits(c.earlyRebateAmount,6),earlyRebateBps:c.earlyRebateBps,visibility:c.visibility,deliveryMethod:c.deliveryMethod,deliveryContentTemplate:""});
  const operations=Object.values(store.db.operations).filter(o=>o.userId===sellerId&&o.resourceId===id&&o.action==="PUBLISH"&&pendingPhases.includes(o.phase));
  if(operations.length>1)throw new Error("CONFLICT: multiple pending publication intents require recovery");
  const operation=operations[0];
  if(operation&&(operation.chainId!==config.arcChainId||operation.hubAddress.toLowerCase()!==config.hubAddress.toLowerCase()))throw new Error("CONFLICT: publication belongs to another deployment");
  if(operation&&(operation.principal.toLowerCase()!==c.sellerPayoutWallet.toLowerCase()||operation.calldata!==campaignCalldata(c)||operation.expectedEventArgs.termsHash!==c.termsHash))throw new Error("CONFLICT: pinned publication and draft terms differ; recover the immutable intent");
  if(Object.values(store.db.operations).some(o=>o.userId===sellerId&&o.resourceId===id&&o.action==="PUBLISH"&&o.phase==="PROJECTED"))throw new Error("CONFLICT: a projected publication requires campaign/indexer recovery");
  const probe=c.deliveryProbeId&&store.db.deliveryProbes[c.deliveryProbeId];
  // Read-only editor DTO. No resource bytes, imported keys, proof signatures or rights evidence.
  return {draft:{id:c.id,version:c.draftVersion||1,protocolVersion:c.protocolVersion||1,...(c.replacementFor?{replacementFor:c.replacementFor}:{}),input,resourceId:probe&&probe.sellerId===sellerId&&probe.productVersionId===version.id?probe.resourceId:null},product:{id:product.id,latestVersionId:product.latestVersionId,status:product.status,version:publicVersion,license:publicVersion.license,rights:Object.values(store.db.rights).filter(r=>r.sellerId===sellerId&&r.productVersionId===version.id).map(r=>({id:r.id,status:r.status,validUntil:r.validUntil}))},publication:operation?{campaign:campaignDto(c),operation:{id:operation.id,action:operation.action,resourceId:operation.resourceId,chainId:operation.chainId,hubAddress:operation.hubAddress,principal:operation.principal,calldata:operation.calldata,phase:operation.phase,idempotencyKey:operation.idempotencyKey,txHash:operation.txHash,createdAt:operation.createdAt,updatedAt:operation.updatedAt,expectedEventArgs:{sellerPayoutWallet:c.sellerPayoutWallet,termsHash:c.termsHash}}}:null};
}
