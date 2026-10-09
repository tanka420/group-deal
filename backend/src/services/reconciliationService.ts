import { ethers } from "ethers";
import { config } from "../config";
import { store, TransactionalStore } from "../db/store";
import { HUB_ABI } from "../contracts/hubAbi";
import { CampaignStatus, DeliveryStatus, orderFunds } from "../../../shared/domain.cjs";
import { ArcReadProvider } from "./arcReadProvider";
import { assertProjectionScope } from "./projectionScope";
import {reconciliationSignals} from './operationalSignals';

export interface ReconciliationReport {
  timestamp: number;
  blockNumber: number;
  blockHash: string;
  projectionBlock: number;
  headBlockNumber: number;
  totalOrdersCount: number;
  totalCampaignsCount: number;
  chainOrdersCount: number;
  chainCampaignsCount: number;
  totalGrossCommittedUSDC: string;
  totalRebatesAllocatedUSDC: string;
  totalSellerProceedsUSDC: string;
  totalRefundsAllocatedUSDC: string;
  totalBuyerClaimedUSDC: string;
  totalSellerClaimedUSDC: string;
  expectedEscrowLiabilitiesUSDC: string;
  onchainHubBalanceUSDC: string;
  unexplainedSurplusUSDC: string;
  conservationLawPassed: boolean;
  onchainBalanceVerified: boolean;
  perOrderVerified: boolean;
  coverageVerified: boolean;
  indexerLagBlocks: number;
  status: "HEALTHY" | "DISCREPANCY_DETECTED" | "UNVERIFIED" | "STALE" | "ERROR";
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  discrepancies: string[];
}

export class ReconciliationService {
  /** Current process observations; starts only after the API owns its port. */
  public static startObservingCurrent():()=>void {
    const controller=new AbortController();let running=false;
    const observe=async()=>{if(controller.signal.aborted||running)return;running=true;try{await this.runReconciliation({operationalSignal:controller.signal});}catch{if(!controller.signal.aborted)console.warn('CURRENT_RECONCILIATION_OBSERVATION_FAILED');}finally{running=false;}};
    const timer=setInterval(()=>{void observe();},30000);void observe();
    return()=>{controller.abort();clearInterval(timer);};
  }
  /** Read-only: compare one immutable local snapshot with all financial reads at block B. */
  public static async runReconciliation(options?: { fixedBlockNumber?: number; customProvider?: any; projectionStore?: TransactionalStore; operationalSignal?:AbortSignal }): Promise<ReconciliationReport> {
    if(options?.operationalSignal?.aborted)throw new Error('CURRENT_RECONCILIATION_STOPPED');
    const snapshot = (options?.projectionStore || store).readFinancialProjectionState({wholeScope:true}).graph;
    const orders: typeof store.db.orders = snapshot.orders;
    const campaigns = Object.values(snapshot.campaigns) as Array<typeof store.db.campaigns[string]>;
    const mappedCampaigns = campaigns.filter(c => c.onchainCampaignId !== undefined);
    const projectionBlock = snapshot.syncState.lastIndexedBlock;
    const discrepancies: string[] = [];
    let gross = 0n, rebate = 0n, seller = 0n, refund = 0n, buyerClaimed = 0n, sellerClaimed = 0n, liabilities = 0n;
    let conservationLawPassed = true, accountingKnown = true;
    for (const order of Object.values(orders)) {
      try {
        const f = orderFunds(order);
        gross += BigInt(order.committedGross); rebate += BigInt(order.rebateAllocated);
        seller += BigInt(order.sellerAllocated); refund += BigInt(order.buyerRefundAllocated);
        if (!f.accountingVerified) {
          accountingKnown = false;
          discrepancies.push(`Order ${order.id}: cumulative claimed amounts require verified rebuild`);
          continue;
        }
        buyerClaimed += BigInt(f.buyerClaimedAmount!); sellerClaimed += BigInt(f.sellerClaimedAmount!);
        liabilities += BigInt(f.unallocated) + BigInt(f.buyerClaimable!) + BigInt(f.sellerClaimable!);
        if (["CONFIRMED", "RESOLVED", "BREACHED_REFUNDED"].includes(order.deliveryStatus) && BigInt(f.unallocated) !== 0n) throw new Error("terminal unallocated");
      } catch {
        conservationLawPassed = false;
        discrepancies.push(`Order ${order.id} violates Conservation Law: invalid or overallocated amounts`);
      }
    }
    let targetBlock = options?.fixedBlockNumber ?? projectionBlock, headBlockNumber = 0;
    let blockHash = "", balance = 0n, chainOrdersCount = 0, chainCampaignsCount = 0;
    let onchainBalanceVerified = false, perOrderVerified = false, coverageVerified = false, rpcFailed = false, stale = false;
    const mismatch = (id: string, field: string, local: unknown, chain: unknown) => {
      if (String(local).toLowerCase() !== String(chain).toLowerCase()) discrepancies.push(`${id}: ${field} differs from Hub at block ${targetBlock}`);
    };
    // Historical fixed-block comparisons are available to isolated tests/recovery tools.
    // Current operational health additionally requires manifest-scoped provenance.
    if (options?.fixedBlockNumber === undefined) {
      try { assertProjectionScope(snapshot); } catch {
        accountingKnown = false;
        discrepancies.push("Projection provenance does not match the deployment; a verified shadow rebuild is required");
      }
    }
    let ownedProvider:ArcReadProvider|undefined;
    try {
      const provider = options?.customProvider || (ownedProvider=new ArcReadProvider());
      const network = await provider.getNetwork();
      if (BigInt(network.chainId) !== BigInt(config.arcChainId)) throw new Error("wrong network");
      headBlockNumber = await provider.getBlockNumber();
      if (!targetBlock) targetBlock = headBlockNumber;
      if (targetBlock > headBlockNumber) throw new Error("RPC head behind target block");
      const block = await provider.getBlock(targetBlock);
      if (!block?.hash) throw new Error("target block unavailable");
      blockHash = block.hash;
      if(projectionBlock===targetBlock&&snapshot.syncState.lastIndexedBlockHash&&snapshot.syncState.lastIndexedBlockHash.toLowerCase()!==blockHash.toLowerCase())throw new Error("Cursor hash differs from the canonical target block");
      stale = projectionBlock !== targetBlock || Object.values(orders).some(o => (o.financialProjectionBlock || 0) > targetBlock)
        || Object.values(snapshot.eventJournal as typeof store.db.eventJournal).some(e => e.blockNumber > targetBlock);
      const token = new ethers.Contract(config.usdcAddress, ["function balanceOf(address) view returns (uint256)"], provider);
      balance = await token.balanceOf(config.hubAddress, { blockTag: targetBlock });
      onchainBalanceVerified = true;
      if (stale) discrepancies.push(`Projection block ${projectionBlock} differs from target block ${targetBlock}; per-order comparison withheld`);
      else {
        const hub = new ethers.Contract(config.hubAddress, HUB_ABI, provider), at = { blockTag: targetBlock };
        const [nextOrder, nextCampaign] = await Promise.all([hub.nextOrderId(at), hub.nextCampaignId(at)]);
        if (nextOrder > BigInt(Number.MAX_SAFE_INTEGER) || nextCampaign > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("unsafe ID range");
        chainOrdersCount = Number(nextOrder) - 1; chainCampaignsCount = Number(nextCampaign) - 1;
        const before = discrepancies.length, mappedIds = mappedCampaigns.map(c => c.onchainCampaignId!);
        if (new Set(mappedIds).size !== mappedIds.length) discrepancies.push("Duplicate local campaign binding");
        for (let id = 1; id <= chainCampaignsCount; id++) if (!mappedIds.includes(id)) discrepancies.push(`Campaign ${id}: missing local projection`);
        for (const c of mappedCampaigns) if (c.onchainCampaignId! < 1 || c.onchainCampaignId! > chainCampaignsCount) discrepancies.push(`Campaign ${c.id}: binding outside Hub coverage`);
        const mappedOrderIds=Object.values(orders).map(o=>o.onchainOrderId);
        if(new Set(mappedOrderIds).size!==mappedOrderIds.length)discrepancies.push("Duplicate local order binding");
        for (let id = 1; id <= chainOrdersCount; id++) if (!mappedOrderIds.includes(id)) discrepancies.push(`Order ${id}: missing local projection`);
        for (const o of Object.values(orders)) if (o.onchainOrderId < 1 || o.onchainOrderId > chainOrdersCount) discrepancies.push(`Order ${o.id}: binding outside Hub coverage`);
        coverageVerified = before === discrepancies.length;
        const comparisonsBefore = discrepancies.length;
        for (const c of mappedCampaigns) {
          if (c.onchainCampaignId! > chainCampaignsCount) continue;
          const [terms, state, tiers, ids] = await Promise.all([
            hub.campaignTerms(c.onchainCampaignId, at), hub.campaignStates(c.onchainCampaignId, at), hub.getCampaignTiers(c.onchainCampaignId, at), hub.getCampaignOrderIds(c.onchainCampaignId, at),
          ]);
          const label = `Campaign ${c.id}`;
          for (const field of ["sellerPayoutWallet", "maxPerAccount", "inventoryLimit", "durationSeconds", "deliverySlaSeconds", "earlyRebateEnabled", "earlySlotsCount", "earlyRebateAmount", "earlyRebateBps", "platformFeeBps", "termsHash"] as const) mismatch(label, field, c[field], terms[field]);
          mismatch(label, "metric", c.metric, Number(terms.metric) === 0 ? "BUYER_COUNT" : "UNITS_COUNT");
          for (const field of ["startTime", "endTime", "totalUnitsCommitted", "totalBuyerCount", "currentUnlockedTier", "totalGrossCommitted"] as const) mismatch(label, field, c[field], state[field]);
          mismatch(label, "finalizedAt", c.finalizedAt || 0, state.finalizedAt);
          mismatch(label, "finalClearingPrice", c.finalClearingPrice || "0", state.finalClearingPrice);
          const status = CampaignStatus[Number(state.status)];
          mismatch(label, "status", c.status, status === "CREATED" ? "PUBLISHED" : status);
          mismatch(label, "tiers", JSON.stringify(c.tiers.map(t => [String(t.threshold), t.price])), JSON.stringify(tiers.map((t: any) => [String(t.threshold), String(t.price)])));
          const localIds = Object.values(orders).filter(o => o.campaignId === c.id).map(o => String(o.onchainOrderId)).sort((a,b) => Number(a)-Number(b));
          mismatch(label, "order coverage", JSON.stringify(localIds), JSON.stringify(ids.map(String).sort((a: string,b: string) => Number(a)-Number(b))));
        }
        for (const o of Object.values(orders)) {
          if (o.onchainOrderId > chainOrdersCount) continue;
          const [chain, claimed] = await Promise.all([hub.getOrderDetails(o.onchainOrderId, at), hub.buyerClaimedAmount(o.onchainOrderId, at)]);
          const label = `Order ${o.id}`, campaign = campaigns.find(c => c.id === o.campaignId);
          mismatch(label, "campaignId", campaign?.onchainCampaignId, chain.campaignId);
          for (const field of ["campaignIdentity", "buyerPrincipal", "quantity", "lockedUnitPrice", "committedGross", "isEarlySupporter", "earlyRebateValue", "rebateAllocated", "sellerAllocated", "buyerRefundAllocated"] as const) mismatch(label, field, o[field], chain[field]);
          mismatch(label, "deliveryStatus", o.deliveryStatus, DeliveryStatus[Number(chain.deliveryStatus)]);
          mismatch(label, "deliveryTimestamp", o.deliveryTimestamp || 0, chain.deliveryTimestamp);
          mismatch(label, "deliveryProofHash", o.deliveryProofHash || ethers.ZeroHash, chain.deliveryProofHash);
          // Both pinned protocols fix a 48-hour window; the getter exposes deliveryTimestamp rather than a deadline field.
          mismatch(label, "disputeDeadline", o.disputeDeadline || 0, chain.deliveryTimestamp>0n?chain.deliveryTimestamp+172800n:0n);
          const f = orderFunds(o);
          mismatch(label, "buyerClaimedAmount", f.buyerClaimedAmount, claimed);
          mismatch(label, "sellerClaimedAmount", f.sellerClaimedAmount, chain.sellerClaimed ? chain.sellerAllocated : "0");
        }
        perOrderVerified = accountingKnown && coverageVerified && comparisonsBefore === discrepancies.length;
        if (accountingKnown && conservationLawPassed) {
          if (balance < liabilities) discrepancies.push(`Onchain Escrow Shortfall at block ${targetBlock}`);
          if (balance > liabilities) discrepancies.push(`Unexplained escrow surplus at block ${targetBlock}; direct/untracked transfer requires classification`);
        }
      }
      const endBlock = await provider.getBlock(targetBlock);
      if (endBlock?.hash !== blockHash) throw new Error("block hash changed during reconciliation");
      if (options?.fixedBlockNumber === undefined && headBlockNumber !== projectionBlock) {
        stale = true;
        discrepancies.push(`Current projection is ${Math.max(0,headBlockNumber-projectionBlock)} blocks behind the observed head; fixed-block proof does not establish current health`);
      }
    } catch {
      rpcFailed = true; perOrderVerified = false;
      discrepancies.push(`Fixed-block Hub/USDC evidence unavailable at block ${targetBlock}; verification incomplete`);
    }
    finally{ownedProvider?.destroy();}
    const provenDiscrepancy = !conservationLawPassed || discrepancies.some(d => /differs from Hub|missing local|outside Hub|Duplicate|Shortfall|surplus/.test(d));
    let status: ReconciliationReport["status"] = "HEALTHY", severity: ReconciliationReport["severity"] = "NONE";
    if (provenDiscrepancy) { status = "DISCREPANCY_DETECTED"; severity = "CRITICAL"; }
    else if (rpcFailed || !accountingKnown) { status = "UNVERIFIED"; severity = "HIGH"; }
    else if (stale) { status = "STALE"; severity = "MEDIUM"; }
    else if (!perOrderVerified || !coverageVerified || !onchainBalanceVerified) { status = "UNVERIFIED"; severity = "HIGH"; }
    const units = (amount: bigint) => ethers.formatUnits(amount, 6);
    const report:ReconciliationReport = {
      timestamp: Date.now(), blockNumber: targetBlock, blockHash, projectionBlock, headBlockNumber, totalOrdersCount: Object.keys(orders).length, totalCampaignsCount: mappedCampaigns.length, chainOrdersCount, chainCampaignsCount,
      totalGrossCommittedUSDC: units(gross), totalRebatesAllocatedUSDC: units(rebate), totalSellerProceedsUSDC: units(seller), totalRefundsAllocatedUSDC: units(refund),
      totalBuyerClaimedUSDC: units(buyerClaimed), totalSellerClaimedUSDC: units(sellerClaimed), expectedEscrowLiabilitiesUSDC: units(liabilities), onchainHubBalanceUSDC: units(balance), unexplainedSurplusUSDC: units(balance > liabilities ? balance-liabilities : 0n),
      conservationLawPassed, onchainBalanceVerified, perOrderVerified, coverageVerified, indexerLagBlocks: Math.max(0, headBlockNumber - projectionBlock), status, severity, discrepancies,
    };
    // Historical/custom/shadow comparisons must never overwrite current process observations.
    if(options?.fixedBlockNumber===undefined&&!options?.customProvider&&!options?.projectionStore&&!options?.operationalSignal?.aborted)reconciliationSignals.record(report);
    return report;
  }
}
