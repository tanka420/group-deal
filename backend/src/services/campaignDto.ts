import { store, CampaignRecord } from "../db/store";
import { ProductService } from "./productService";
import {publicLeaf,publicRecord,publicRecords} from './publicMetadata';
import type {PublicProjectionState} from '../db/rowPersistence';

export function isListedCampaign(c:CampaignRecord):boolean {
  return c.status!=="DRAFT" && c.visibility==="PUBLIC" && c.projectionOrigin!=="CHAIN_UNBOUND" && (!c.productSnapshot || store.db.products[c.productSnapshot.productId]?.status!=="ARCHIVED");
}
export function campaignDto(c:CampaignRecord,graph:Pick<PublicProjectionState,'productVersions'|'licenseVersions'|'rights'>=store.db) {
  const snapshot=c.productSnapshot,product=snapshot?ProductService.publicVersion(snapshot.productVersionId,graph):null,candidate=snapshot&&graph.rights[snapshot.rightsId];
  const bound=!!snapshot&&!!product&&!!candidate&&graph.productVersions[snapshot.productVersionId]?.sellerId===c.sellerId&&candidate.id===snapshot.rightsId&&candidate.sellerId===c.sellerId&&candidate.productVersionId===snapshot.productVersionId&&candidate.licenseVersionId===snapshot.licenseVersionId&&product.productId===snapshot.productId&&product.license.id===snapshot.licenseVersionId&&product.contentHash===snapshot.productContentHash&&product.license.contentHash===snapshot.licenseContentHash;
  const rights=bound?candidate:undefined,validUntil=publicLeaf(rights?.validUntil,'integer');
  if(rights&&!['SUBMITTED','APPROVED','REQUESTED_INFO','REJECTED','REVOKED'].includes(rights.status))throw Error('PROJECTION_UNAVAILABLE');
  const rightsStatus = rights?.status === 'APPROVED' ? !Number.isSafeInteger(validUntil)||validUntil<1?'UNVERIFIED':validUntil<Math.floor(Date.now()/1000)?'EXPIRED':'APPROVED' : rights?.status || 'UNVERIFIED';
  const metadata=publicRecord(c,{id:'text',onchainCampaignId:'integer',title:'text',description:'text',category:'text',thumbnailUrl:'asset',sellerPayoutWallet:'text',status:'text',visibility:'text',metric:'text',currentUnlockedTier:'integer',maxPerAccount:'integer',inventoryLimit:'integer',durationSeconds:'integer',deliverySlaSeconds:'integer',earlyRebateEnabled:'boolean',earlySlotsCount:'integer',earlyRebateAmount:'amount',earlyRebateBps:'integer',platformFeeBps:'integer',termsHash:'text',startTime:'integer',endTime:'integer',finalizedAt:'integer',finalClearingPrice:'amount',totalBuyerCount:'integer',totalUnitsCommitted:'integer',totalGrossCommitted:'amount',deliveryMethod:'text',txHash:'text'});
  return {
    ...metadata,protocolVersion:publicLeaf(c.protocolVersion??1,'integer'),tiers:publicRecords(c.tiers,{threshold:'integer',price:'amount'}),termsPolicyReviewRequired:publicLeaf(c.termsPolicyReviewRequired??false,'boolean'),amendments:publicRecords(c.amendments,{id:'text',timestamp:'integer',note:'text',hash:'text'}),product,
    rights:{status:rightsStatus,productVersionId:publicLeaf(snapshot?.productVersionId,'text'),licenseVersionId:publicLeaf(snapshot?.licenseVersionId,'text'),validUntil,approvedAt:rights?publicLeaf(snapshot?.rightsApprovedAt,'integer'):undefined},
  };
}
