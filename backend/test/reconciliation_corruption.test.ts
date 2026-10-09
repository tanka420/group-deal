import assert from "node:assert/strict";
import { ethers } from "ethers";
import { store, CampaignRecord, OrderRecord } from "../src/db/store";
import { ReconciliationService } from "../src/services/reconciliationService";
import { reconciliationProvider } from "./fixtures/reconciliation";
import { config } from "../src/config";

const campaign: CampaignRecord = {
  id: "internal-campaign", onchainCampaignId: 1, title: "Fixture", description: "", category: "", thumbnailUrl: "",
  sellerId: "seller", sellerPayoutWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", status: "FINALIZED", visibility: "UNLISTED",
  metric: "BUYER_COUNT", tiers: [{threshold:1,price:"105000000"},{threshold:2,price:"89000000"}], currentUnlockedTier:1,
  maxPerAccount:2, inventoryLimit:2, durationSeconds:86400, deliverySlaSeconds:86400,
  earlyRebateEnabled:false, earlySlotsCount:0, earlyRebateAmount:"0", earlyRebateBps:0, platformFeeBps:0,
  termsHash:ethers.id("fixed-terms"), startTime:1700000000, endTime:1700086400, finalizedAt:1700000123,
  finalClearingPrice:"89000000", totalBuyerCount:1, totalUnitsCommitted:1, totalGrossCommitted:"105000000",
  deliveryMethod:"LICENSE_KEY", deliveryContentTemplate:"", dryRunDeliveryVerified:false, amendments:[],
};
const order: OrderRecord = {
  id:"1", onchainOrderId:1, campaignId:campaign.id, buyerAccountId:"buyer", campaignIdentity:ethers.id("identity"),
  buyerPrincipal:"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", quantity:1, lockedUnitPrice:"105000000", committedGross:"105000000",
  isEarlySupporter:false, earlyRebateValue:"0", rebateAllocated:"16000000", sellerAllocated:"0", buyerRefundAllocated:"89000000",
  buyerClaimedAmount:"16000000", sellerClaimedAmount:"0", buyerClaimed:true, sellerClaimed:false,
  deliveryStatus:"BREACHED_REFUNDED", txHash:ethers.id("commitment"), createdAt:1700000002000, financialProjectionBlock:125,
};
function reset() {
  store.db.campaigns = {[campaign.id]: {...campaign}}; store.db.orders = {"1": {...order}}; store.db.eventJournal = {};
  store.db.syncState = { lastIndexedBlock:125, lastSyncTimestamp:0 };
}
async function main() {
  reset();
  const provider = reconciliationProvider(store.db, 89_000_000n);
  const run = (customProvider: any = provider, fixedBlockNumber = 125) => {store.save();return ReconciliationService.runReconciliation({customProvider,fixedBlockNumber});};
  let report = await run();
  assert.equal(report.status,"HEALTHY", JSON.stringify(report.discrepancies));
  assert.equal(report.expectedEscrowLiabilitiesUSDC,"89.0");
  assert.equal(report.perOrderVerified,true); assert.equal(report.coverageVerified,true);
  assert.ok(provider.calls.includes("buyerClaimedAmount"));
  console.log("PASS cumulative liabilities and complete per-order/campaign proof at one fixed block");
  const originalOrder=store.db.orders["1"];store.db.orders={"internal-order-id":{...originalOrder,id:"internal-order-id"}};
  assert.equal((await run()).status,"HEALTHY","Internal order IDs must not be interpreted as numeric Hub IDs");reset();
  store.db.orders["1"].rebateAllocated = "17000000"; store.db.orders["1"].buyerRefundAllocated = "88000000";
  assert.equal((await run()).status,"DISCREPANCY_DETECTED"); // sums and liabilities still identical
  reset(); store.db.orders["1"].buyerPrincipal = campaign.sellerPayoutWallet;
  assert.equal((await run()).status,"DISCREPANCY_DETECTED");
  reset(); delete store.db.orders["1"];
  assert.equal((await run()).coverageVerified,false); assert.equal((await run()).status,"DISCREPANCY_DETECTED");
  reset(); delete store.db.campaigns[campaign.id];
  assert.equal((await run()).status,"DISCREPANCY_DETECTED");
  reset(); store.db.orders["1"].buyerRefundAllocated = "105000000";
  assert.equal((await run()).conservationLawPassed,false);
  reset(); delete store.db.orders["1"].buyerClaimedAmount;
  assert.notEqual((await run()).status,"HEALTHY");
  console.log("PASS conserved-total corruption, principal, missing coverage, overallocation and legacy claim rejection");
  reset();store.db.orders["1"].deliveryProofHash=ethers.id("wrong-private-resource-proof");assert.equal((await run()).status,"DISCREPANCY_DETECTED");
  reset();store.db.orders["1"].disputeDeadline=999999;assert.equal((await run()).status,"DISCREPANCY_DETECTED");
  reset();store.db.syncState.lastIndexedBlockHash=ethers.id("wrong-cursor-block");assert.equal((await run()).status,"UNVERIFIED");
  reset(); store.db.syncState.lastIndexedBlock = 124;
  assert.equal((await run()).status,"STALE");
  reset(); store.db.orders["1"].financialProjectionBlock = 126;
  assert.equal((await run()).status,"STALE");
  reset(); assert.equal((await run({...provider,call:async()=>{throw new Error("offline");}})).status,"UNVERIFIED");
  assert.equal((await run({...provider,getNetwork:async()=>({chainId:1n})})).status,"UNVERIFIED");
  report = await run(reconciliationProvider(store.db,90_000_000n));
  assert.equal(report.status,"DISCREPANCY_DETECTED"); assert.equal(report.unexplainedSurplusUSDC,"1.0");
  assert.equal((await run(reconciliationProvider(store.db,88_000_000n))).status,"DISCREPANCY_DETECTED");
  assert.equal((await run({...provider,getBlock:async()=>null})).status,"UNVERIFIED");
  reset();
  const deploymentBlock = config.deploymentBlock;
  config.deploymentBlock = 1;
  store.db.orders["1"].chainId=config.arcChainId;store.db.orders["1"].hubAddress=config.hubAddress;
  store.save();
  const lagged = await ReconciliationService.runReconciliation({customProvider:{...provider,getBlockNumber:async()=>126}});
  assert.equal(lagged.status,"STALE"); assert.equal(lagged.perOrderVerified,true); assert.equal(lagged.indexerLagBlocks,1);
  assert.equal((await ReconciliationService.runReconciliation({fixedBlockNumber:125,customProvider:{...provider,getBlockNumber:async()=>126}})).status,"HEALTHY");
  config.deploymentBlock = deploymentBlock;
  console.log("PASS one-block lag, future projection, offline/wrong-chain RPC, missing block, surplus and shortfall");
  store.close();
}
main().catch(error=>{console.error(error);store.close();process.exitCode=1;});
