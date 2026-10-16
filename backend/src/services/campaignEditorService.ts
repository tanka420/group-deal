import { z } from "zod";
import { ethers } from "ethers";
import crypto from "node:crypto";
import { store, CampaignRecord } from "../db/store";
import { computeTermsHash } from "../utils/crypto";
import { ProductService } from "./productService";
import { config } from "../config";

const decimal=z.union([z.string(),z.number().finite()]).transform(String).refine(v=>/^\d+(?:\.\d{1,6})?$/.test(v),"USDC must have at most six decimal places");
export const campaignDraftSchema=z.object({
  title:z.string().trim().min(1).max(180),description:z.string().trim().min(1).max(12000),category:z.string().trim().max(80).default("Software"),thumbnailUrl:z.string().url().max(2000),
  productVersionId:z.string().min(1),metric:z.enum(["BUYER_COUNT","UNITS_COUNT"]),tiers:z.array(z.object({threshold:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),priceUSDC:decimal}).strict()).min(2).max(5),
  maxPerAccount:z.number().int().min(1).max(10000).default(5),inventoryLimit:z.number().int().min(0).max(10000000).default(0),durationDays:z.number().int().min(1).max(30).default(7),
  deliverySlaHours:z.union([z.literal(24),z.literal(48)]),earlyRebateEnabled:z.boolean().default(false),earlySlotsCount:z.number().int().min(0).max(4294967295).default(0),earlyRebateAmountUSDC:decimal.default("0"),earlyRebateBps:z.number().int().min(0).max(10000).default(0),
  visibility:z.enum(["PUBLIC","UNLISTED"]).default("PUBLIC"),deliveryMethod:z.enum(["LICENSE_KEY","FILE_LINK","ACCOUNT_INVITE","WEBHOOK"]),deliveryContentTemplate:z.literal("").default(""),
}).strict();

export function validateCampaignDraftTerms(data:z.infer<typeof campaignDraftSchema>){
    const tiers=data.tiers.map(t=>({threshold:t.threshold,price:ethers.parseUnits(t.priceUSDC,6).toString()}));
    if (tiers[0].threshold!==1||tiers.some((t,i)=>BigInt(t.price)<=0n||BigInt(t.price)>ethers.MaxUint256||i>0&&(t.threshold<=tiers[i-1].threshold||BigInt(t.price)>=BigInt(tiers[i-1].price)))) throw new Error("VALIDATION: first threshold must be 1; thresholds increase and positive uint256 prices decrease");
    if (data.inventoryLimit>0&&(data.maxPerAccount>data.inventoryLimit||tiers.at(-1)!.threshold>data.inventoryLimit)) throw new Error("VALIDATION: limits and tiers must fit inventory");
    const early=ethers.parseUnits(data.earlyRebateAmountUSDC,6).toString();
    if(![1,2].includes(config.protocolVersion))throw new Error("Unsupported financial protocol version");
    if(!data.earlyRebateEnabled&&(data.earlySlotsCount!==0||BigInt(early)!==0n||data.earlyRebateBps!==0))throw new Error("VALIDATION: disabled early rebate settings must be zero");
    if(config.protocolVersion===1) {
      if(data.earlyRebateBps!==0)throw new Error("VALIDATION: percentage early rebate requires a v2 deployment");
      if (data.earlyRebateEnabled&&(data.earlySlotsCount<1||BigInt(early)<=0n||BigInt(early)>BigInt(tiers.at(-1)!.price))) throw new Error("VALIDATION: deployed v1 early bonus must fit the lowest tier first-unit price");
    } else if(data.earlyRebateEnabled&&(data.earlySlotsCount<1||(BigInt(early)>0n)===(data.earlyRebateBps>0)||BigInt(early)>BigInt(tiers[0].price)))throw new Error("VALIDATION: choose fixed or percentage first-unit rebate and valid slots");
    return {tiers,early};
}

import {assertNewBusinessAction,AccountAccessError} from '../domain/accountAccess';
export class CampaignEditorService {
  public static saveDraft(sellerId:string,input:unknown,id?:string,expectedVersion?:number,idempotencyKey?:string):CampaignRecord {
    const data=campaignDraftSchema.parse(input),user=store.db.users[sellerId];
    if (!user?.roles.includes("seller")||!user.sellerProfile?.payoutWallet) throw new Error("FORBIDDEN: verified seller payout profile is required");
    const product=store.db.productVersions[data.productVersionId];
    if (!product||product.sellerId!==sellerId||store.db.products[product.productId]?.status==="ARCHIVED") throw new Error("FORBIDDEN: product version is unavailable");
    const {tiers,early}=validateCampaignDraftTerms(data);
    if(idempotencyKey!==undefined&&!/^[a-zA-Z0-9:_-]{8,180}$/.test(idempotencyKey))throw new Error("VALIDATION: invalid draft idempotency key");
    if(id&&(!Number.isSafeInteger(expectedVersion)||(expectedVersion??0)<1))throw new Error("VALIDATION: expectedVersion must be a positive safe integer");
    const payloadHash=computeTermsHash(data),key=idempotencyKey?computeTermsHash({sellerId,idempotencyKey}):undefined;
    return store.transaction(()=>{
      assertNewBusinessAction(store.db.users[sellerId],'SELLER');
      const previous=key&&store.db.campaignDraftKeys[key];
      if(previous) {
        if(previous.payloadHash!==payloadHash||(previous.writeKind||"CREATE")!==(id?"UPDATE":"CREATE")||(id&&(previous.campaignId!==id||previous.expectedVersion!==expectedVersion)))throw new Error("CONFLICT: draft key is bound to another write");
        const existing=store.db.campaigns[previous.campaignId];
        if(!existing)throw new Error("CONFLICT: draft history requires recovery");
        if(previous.committedVersion!==undefined&&(existing.draftVersion||1)!==previous.committedVersion)throw new Error("CONFLICT: committed write exists but a newer draft version requires recovery");
        if(existing.sellerId!==sellerId||existing.status!=="DRAFT"||existing.onchainCampaignId!==undefined||(existing.protocolVersion||1)!==config.protocolVersion)throw new Error("CONFLICT: committed draft now requires publication/deployment recovery");
        return existing;
      }
      const current=id ? store.db.campaigns[id] : undefined;
      if(id&&(!current||current.sellerId!==sellerId))throw new Error("FORBIDDEN: draft ownership");
      if(current&&(current.status!=="DRAFT"||current.onchainCampaignId!==undefined))throw new Error("CONFLICT: published financial/material terms are immutable; create a replacement draft");
      if(current&&(current.protocolVersion||1)!==config.protocolVersion)throw new Error("CONFLICT: draft belongs to a different protocol version");
      if(current&&(current.draftVersion||1)!==expectedVersion)throw new Error("CONFLICT: draft changed; reload before saving");
      if(current&&Object.values(store.db.operations).some(o=>o.resourceId===id&&o.action==="PUBLISH"&&["PREPARED","AWAITING_SIGNATURE","SUBMITTED","UNKNOWN","RECEIPT_VERIFIED"].includes(o.phase)))throw new Error("CONFLICT: a publish intent pins this draft; recover it before editing");
      const campaign:CampaignRecord={id:current?.id||`draft_${crypto.randomUUID()}`,protocolVersion:config.protocolVersion,draftVersion:(current?.draftVersion||0)+1,draftProductVersionId:data.productVersionId,...(current?.replacementFor?{replacementFor:current.replacementFor}:{}),title:data.title,description:data.description,category:data.category,thumbnailUrl:data.thumbnailUrl,
        sellerId,sellerPayoutWallet:ethers.getAddress(user.sellerProfile!.payoutWallet),status:"DRAFT",visibility:data.visibility,metric:data.metric,tiers,currentUnlockedTier:0,maxPerAccount:data.maxPerAccount,inventoryLimit:data.inventoryLimit,
        durationSeconds:data.durationDays*86400,deliverySlaSeconds:data.deliverySlaHours*3600,earlyRebateEnabled:data.earlyRebateEnabled,earlySlotsCount:data.earlyRebateEnabled?data.earlySlotsCount:0,earlyRebateAmount:data.earlyRebateEnabled?early:"0",earlyRebateBps:data.earlyRebateBps,platformFeeBps:0,
        termsHash:ethers.ZeroHash,startTime:0,endTime:0,totalBuyerCount:0,totalUnitsCommitted:0,totalGrossCommitted:"0",deliveryMethod:data.deliveryMethod,deliveryContentTemplate:data.deliveryContentTemplate,dryRunDeliveryVerified:false,amendments:current?.amendments||[]};
      campaign.termsHash=this.termsHash(campaign);
      store.db.campaigns[campaign.id]=campaign;
      if(key)store.db.campaignDraftKeys[key]={sellerId,idempotencyKey:idempotencyKey!,payloadHash,campaignId:campaign.id,writeKind:id?"UPDATE":"CREATE",...(id?{expectedVersion}:{}),committedVersion:campaign.draftVersion};
      store.addAuditLog(sellerId,"seller","CAMPAIGN_DRAFT_SAVED",{campaignId:campaign.id,draftVersion:campaign.draftVersion,productVersionId:data.productVersionId,termsHash:campaign.termsHash});
      return campaign;
    });
  }
  public static termsHash(c:CampaignRecord):string {
    return computeTermsHash({schema:"GroupDealTermsV2",protocolVersion:c.protocolVersion||1,sellerPayoutWallet:c.sellerPayoutWallet,metric:c.metric,tiers:c.tiers,maxPerAccount:c.maxPerAccount,inventoryLimit:c.inventoryLimit,
      durationSeconds:c.durationSeconds,deliverySlaSeconds:c.deliverySlaSeconds,earlyRebateEnabled:c.earlyRebateEnabled,earlySlotsCount:c.earlySlotsCount,earlyRebateAmount:c.earlyRebateAmount,earlyRebateBps:c.earlyRebateBps,
      platformFeeBps:0,deliveryMethod:c.deliveryMethod,cancellationPolicy:"SECURITY_MULTISIG_REFUNDS_ONLY_UNALLOCATED_ESCROW",productVersionId:c.draftProductVersionId,productSnapshot:c.productSnapshot||null,...(c.replacementFor?{replacementFor:c.replacementFor}:{})});
  }
  public static pinProduct(sellerId:string,c:CampaignRecord):void {
    const expiry=Math.floor(Date.now()/1000)+c.durationSeconds+c.deliverySlaSeconds;
    const snapshot=ProductService.snapshot(sellerId,c.draftProductVersionId!,expiry);
    if(c.productSnapshot)ProductService.assertPublishable(sellerId,c.productSnapshot,expiry);
    c.productSnapshot=snapshot;c.termsHash=this.termsHash(c);
  }
}
