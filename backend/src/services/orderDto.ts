import { OrderRecord } from "../db/store";
import { orderFunds } from "../../../shared/domain.cjs";
import { config } from "../config";

import {orderViewFields} from '../domain/orderReview';

export function orderDto(order: OrderRecord) {
  // Unknown legacy fields stay in persistence but never become an API response by object spread.
  const fields=orderViewFields;
  const pick=(source:unknown,keys:readonly string[])=>source&&typeof source==="object"&&!Array.isArray(source)?Object.fromEntries(keys.filter(key=>Object.hasOwn(source,key)).map(key=>[key,(source as Record<string,unknown>)[key]])):{};
  const dto={...pick(order,fields),...(order.productSnapshot?{productSnapshot:pick(order.productSnapshot,["schema","productId","productVersionId","licenseVersionId","productContentHash","licenseContentHash","rightsId","rightsApprovedAt","rightsValidUntil"])}:{}),...(order.review?{review:pick(order.review,["score","comment","createdAt","sellerResponse"])}:{}),...(order.disputeResolution?{disputeResolution:pick(order.disputeResolution,["txHash","notes","operatorId"])}:{}),...(order.transactionHistory?{transactionHistory:order.transactionHistory.map(entry=>pick(entry,["action","txHash","blockNumber","blockHash","logIndex","chainId","hubAddress"]))}:{})};
  const entitlement={hasEntitlement:!!order.deliveredEntitlementEncrypted};
  if (order.chainId!==config.arcChainId || order.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase() || (order.protocolVersion||1)!==config.protocolVersion) return {...dto,...entitlement,accountingVerified:false,buyerClaimable:null,sellerClaimable:null};
  try { return { ...dto,...entitlement, ...orderFunds(order), commitmentTxHash: order.commitmentTxHash || order.transactionHistory?.find(t => t.action === "CommitmentMade")?.txHash || order.txHash }; }
  catch { return { ...dto,...entitlement, accountingVerified: false, buyerClaimable: null, sellerClaimable: null }; }
}

/** Projection consumers supply only the SQL presence flag; encrypted entitlement bytes stay in storage. */
export function projectedOrderDto(order:OrderRecord,hasEntitlement:boolean){return {...orderDto(order),hasEntitlement};}
