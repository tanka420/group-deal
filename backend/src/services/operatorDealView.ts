import { store } from "../db/store";
import { config } from "../config";
import { orderFunds } from "../../../shared/domain.cjs";
import { campaignDto } from "./campaignDto";
import { orderDto } from "./orderDto";
import { assertProjectionScope } from "./projectionScope";

const pageSize = 50;
function pagination(query: Record<string, unknown>) {
  if (Object.keys(query).some(key => key !== "after") || (query.after !== undefined && (typeof query.after !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(query.after)))) throw new Error("VALIDATION");
  return typeof query.after === "string" ? query.after : undefined;
}
function page<T extends { id: string }>(items: T[], after?: string) {
  const sorted = items.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const selected = (after ? sorted.filter(item => item.id > after) : sorted).slice(0, pageSize + 1);
  const hasMore = selected.length > pageSize, rows = selected.slice(0,pageSize);
  return { rows, pagination: { nextCursor: hasMore ? rows.at(-1)!.id : null, hasMore, limit: pageSize } };
}
export function listOperatorDeals(query: Record<string, unknown>) {
  const selected = page(Object.values(store.db.campaigns).filter(c => c.status !== "DRAFT"), pagination(query));
  return { campaigns: selected.rows.map(c=>campaignDto(c)), pagination: selected.pagination };
}
/** No RPC or writes. Projection amounts remain explicitly unverified against chain. */
export function operatorDealView(id: string, query: Record<string, unknown>) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id) || !Object.hasOwn(store.db.campaigns,id)) return null;
  const after = pagination(query);
  // Clone synchronously so every field and aggregate uses the same local snapshot.
  const snapshot = structuredClone(store.db), campaign = snapshot.campaigns[id];
  const orders = Object.values(snapshot.orders).filter(order => order.campaignId === id);
  let known = true, totalGross = 0n, rebate = 0n, refund = 0n, seller = 0n, buyerClaimed = 0n, sellerClaimed = 0n, buyerClaimable = 0n, sellerClaimable = 0n;
  const scope = (record: {chainId?:number;hubAddress?:string;protocolVersion?:number}) => record.chainId === config.arcChainId && record.hubAddress?.toLowerCase() === config.hubAddress.toLowerCase() && (record.protocolVersion || 1) === config.protocolVersion;
  known = scope(campaign);
  for (const order of orders) {
    try {
      const funds = orderFunds(order);
      if (!scope(order) || !funds.accountingVerified) throw new Error("Unknown cumulative accounting or deployment scope");
      totalGross += BigInt(order.committedGross); rebate += BigInt(order.rebateAllocated); refund += BigInt(order.buyerRefundAllocated); seller += BigInt(order.sellerAllocated);
      buyerClaimed += BigInt(funds.buyerClaimedAmount!); sellerClaimed += BigInt(funds.sellerClaimedAmount!); buyerClaimable += BigInt(funds.buyerClaimable!); sellerClaimable += BigInt(funds.sellerClaimable!);
    } catch { known = false; }
  }
  let provenanceVerified = false;
  try { assertProjectionScope(snapshot); provenanceVerified = true; } catch { /* Operational hold is visible; this view never repairs data. */ }
  const selected = page(orders,after), amount = (value: bigint) => known ? value.toString() : null;
  return {
    campaign: campaignDto(campaign),
    projection: { blockNumber: snapshot.syncState.lastIndexedBlock, blockHash: snapshot.syncState.lastIndexedBlockHash || null, provenanceVerified, currentDeploymentScope: scope(campaign) },
    accounting: { source: "LOCAL_PROJECTION" as const, chainVerified: false, accountingKnown: known, orderCount: orders.length, grossCommitted: amount(totalGross), rebatesAllocated: amount(rebate), refundsAllocated: amount(refund), sellerAllocated: amount(seller), buyerClaimed: amount(buyerClaimed), sellerClaimed: amount(sellerClaimed), buyerClaimable: amount(buyerClaimable), sellerClaimable: amount(sellerClaimable) },
    orders: selected.rows.map(orderDto), pagination: selected.pagination,
  };
}
