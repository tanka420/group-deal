const fields=["id","campaignId","onchainCampaignId","onchainOrderId","chainId","hubAddress","protocolVersion","buyerPrincipal","quantity","lockedUnitPrice","committedGross","isEarlySupporter","earlyRebateValue","rebateAllocated","sellerAllocated","buyerRefundAllocated","buyerClaimedAmount","sellerClaimedAmount","deliveryStatus","deliveryProofHash","deliveryTimestamp","disputeDeadline","commitmentTxHash","deliveryTxHash","txHash","finalClearingPrice","tierIndex","threshold","price"] as const;

/** Webhook facts are immutable public order/campaign fields. Private keys, entitlement and contact/support metadata never enter the outbox. */
export function webhookPayload(payload:any):Record<string,string|number|boolean> {
  const safe:Record<string,string|number|boolean>={};
  if(!payload||typeof payload!=="object")return safe;
  for(const field of fields){const value=payload[field];if(typeof value==="string"||typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value))safe[field]=value;}
  return safe;
}
