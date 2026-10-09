import {config} from "../config";
import {store,CampaignRecord} from "../db/store";
import {campaignDto} from "./campaignDto";
import {readPublicWidget} from "../../../shared/publicWidget.mjs";
import {publicSellerLink} from './publicSellerIdentity';
import {publicLeaf} from './publicMetadata';
import type {PublicProjectionState} from '../db/rowPersistence';

export function accessiblePublicCampaignRecord(campaign:CampaignRecord,products:Record<string,{status:string}>):boolean {
  if(campaign.status==="DRAFT"||campaign.projectionOrigin==="CHAIN_UNBOUND"||!["PUBLIC","UNLISTED"].includes(campaign.visibility)||!campaign.onchainCampaignId
    ||campaign.chainId!==config.arcChainId||campaign.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()
    ||campaign.productSnapshot&&products[campaign.productSnapshot.productId]?.status==="ARCHIVED")return false;
  return true;
}
export const validPublicCampaignId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=180&&!['__proto__','prototype','constructor'].includes(id);
export function accessiblePublicCampaign(id:string,state?:PublicProjectionState):CampaignRecord|undefined {
  if(!validPublicCampaignId(id))return undefined;
  state??=store.readPublicProjectionState({campaignId:id},config.arcChainId,config.hubAddress);if(!Object.hasOwn(state.campaigns,id))return undefined;
  const campaign=state.campaigns[id];if(!accessiblePublicCampaignRecord(campaign,state.products))return undefined;
  return campaign;
}
export function canonicalCampaignUrl(id:string):string|null {
  if(!config.publicAppUrl)return null;
  try {
    const url=new URL(config.publicAppUrl);
    if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||url.protocol!=="https:"&&!(config.arcChainId===31337&&url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))throw new Error();
    return url.origin+"/#campaign-"+encodeURIComponent(id);
  }catch{throw new Error("PUBLIC_APP_URL must be a configured HTTPS origin, or an explicit local development origin");}
}
/** Both public endpoints use the same allowlist and USDC base-unit string representation. */
export function publicCampaignDto(c:CampaignRecord,state:PublicProjectionState=store.readPublicProjectionState({campaignId:c.id},config.arcChainId,config.hubAddress)){
  c=accessiblePublicCampaign(c.id,state)!;if(!c)throw Error('NOT_FOUND');const dto=campaignDto(c,state),seller=state.users[c.sellerId]?.sellerProfile;
  return {...dto,chainId:publicLeaf(c.chainId,'integer'),hubAddress:publicLeaf(c.hubAddress,'text'),campaignUrl:canonicalCampaignUrl(c.id),seller:{...publicSellerLink(c,state),displayName:publicLeaf(seller?.displayName,'text')||"Seller",payoutWallet:publicLeaf(c.sellerPayoutWallet,'text'),verifiedSellerBadge:publicLeaf(seller?.verifiedSellerBadge??false,'boolean'),verifiedRightsBadge:dto.rights.status==="APPROVED"}};
}
export function formatUSDC(value:string):string {
  if(!/^(0|[1-9]\d*)$/.test(value))throw new Error("Invalid USDC base-unit amount");
  const amount=BigInt(value);return (amount/1000000n).toString()+"."+(amount%1000000n).toString().padStart(6,"0");
}

export function publicWidgetDto(c:CampaignRecord,state:PublicProjectionState=store.readPublicProjectionState({campaignId:c.id},config.arcChainId,config.hubAddress)) {
  c=accessiblePublicCampaign(c.id,state)!;if(!c)throw Error('NOT_FOUND');const dto=publicCampaignDto(c,state),current=c.tiers[c.currentUnlockedTier];
  if(!current)throw new Error("PROJECTION_UNAVAILABLE");
  const price=c.status==="FINALIZED"||c.status==="CANCELLED"&&!!c.finalizedAt?c.finalClearingPrice:current.price;
  if(!price)throw new Error("PROJECTION_UNAVAILABLE");
  const now=Math.floor(Date.now()/1000),terminal=c.status==="FINALIZED"||c.status==="CANCELLED";
  const rightsHeld=!dto.product?.license||dto.rights.status!=="APPROVED"||!Number.isSafeInteger(dto.rights.validUntil)||(dto.rights.validUntil||0)<c.endTime+c.deliverySlaSeconds;
  const held=terminal||c.startTime>now||c.endTime<now||c.inventoryLimit>0&&c.totalUnitsCommitted>=c.inventoryLimit||c.termsPolicyReviewRequired===true||rightsHeld;
  const next=held?null:c.tiers[c.currentUnlockedTier+1]||null;
  const campaignUrl=dto.campaignUrl,widgetUrl=campaignUrl?new URL("/api/v1/campaigns/"+encodeURIComponent(c.id)+"/widget",new URL(campaignUrl).origin).href:null;
  return readPublicWidget({version:"1.0",id:c.id,chainId:c.chainId,hubAddress:c.hubAddress,visibility:c.visibility,title:c.title,status:c.status,metric:c.metric,currentMetric:c.metric==="BUYER_COUNT"?c.totalBuyerCount:c.totalUnitsCommitted,endTime:c.endTime,currentPriceBaseUnits:price,currentPriceUSDC:formatUSDC(price),nextPriceBaseUnits:next?.price??null,nextPriceUSDC:next?formatUSDC(next.price):null,nextThreshold:next?.threshold??null,priceKind:c.status==="FINALIZED"?"FINAL_CLEARING_PRICE":c.status==="CANCELLED"?"CANCELLED_LAST_PRICE":"CURRENT_GROUP_PRICE",priceScope:"PER_UNIT_BEFORE_BUYER_REBATE",platformFeeBps:c.platformFeeBps,purchaseHeld:held,campaignUrl,widgetUrl,projection:{source:"INDEXER",financialStateChainVerified:false,fetchedAt:Date.now()}},c.id,{chainId:config.arcChainId,hubAddress:config.hubAddress});
}
