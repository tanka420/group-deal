import assert from "node:assert/strict";
import { ethers } from "ethers";
import { store } from "../src/db/store";
import { config } from "../src/config";
import { IndexerService } from "../src/services/indexerService";
import { HUB_ABI } from "../src/contracts/hubAbi";
import { orderFunds } from "../../shared/domain.cjs";

import { eventProvider } from "./fixtures/events";

const fixtureLogs:any[]=[];
const iface = new ethers.Interface(HUB_ABI);
const seller = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const buyer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const terms = ethers.id("projection-v1-terms");
const identity = ethers.id("projection-identity");
let sequence = 0;
const transactions: Record<string, any> = {};
const log = (event: string, args: any[], block: number, index = 0, txHash?: string) => {
  const encoded = iface.encodeEventLog(iface.getEvent(event)!, args);
  const result = { ...encoded, address: config.hubAddress, blockNumber: block, blockHash: ethers.id(`block-${block}`),
    transactionHash: txHash ?? ethers.id(`transaction-${++sequence}`), transactionIndex: 0, index };
  fixtureLogs.push(result); return result;
};
const provider = eventProvider(fixtureLogs,transactions);

async function reset() {
  fixtureLogs.length=0;
  store.db.campaigns = {}; store.db.orders = {}; store.db.eventJournal = {};
  store.db.webhookQueue = {}; store.db.notifications = {}; store.db.emailOutbox = {};
  store.save(); // Commit this intentional fixture reset before native projection.
  IndexerService.setProvider(provider);
  const created = log("CampaignCreated", [1, seller, terms, 0, 1000, 90000, 0], 1);
  transactions[created.transactionHash] = {to:config.hubAddress,value:0n,data:iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:seller,metric:0,maxPerAccount:10,inventoryLimit:0,durationSeconds:89000,deliverySlaSeconds:86400,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash:terms},[{threshold:1,price:105_000_000},{threshold:2,price:89_000_000}]])};
  await IndexerService.processLogs([created]);
}
const commitment = (gross = 105_000_000, early = 0, quantity = 1, block = 2, index = 0) =>
  log("CommitmentMade", [1, 1, identity, buyer, quantity, gross / quantity, gross, early > 0, early], block, index);
const finalization = (price = 89_000_000, gross = 105_000_000, quantity = 1, block = 3) =>
  log("CampaignFinalized", [1, price, 1, gross, quantity], block);
function claim(type: 0 | 2, amount: number, block: number) {
  const hash = ethers.id(`claim-${++sequence}`);
  const action = type === 0 ? "claimBuyerFunds" : "claimSellerProceeds";
  const recipient = type === 0 ? buyer : seller;
  transactions[hash] = { to: config.hubAddress, from: recipient, value: 0n, data: iface.encodeFunctionData(action, [1, [1]]) };
  return log("FundsClaimed", [1, recipient, amount, type], block, 0, hash);
}

async function main() {
  config.deploymentBlock=1;
  await reset();
  const commit = commitment();
  await IndexerService.processLogs([commit, finalization()]);
  assert.equal(store.db.orders["1"].rebateAllocated, "16000000");
  const firstClaim = claim(0, 16_000_000, 4);
  await Promise.all([IndexerService.processLogs([firstClaim]), IndexerService.processLogs([firstClaim])]);
  assert.equal(store.db.orders["1"].buyerClaimedAmount, "16000000");
  await IndexerService.processLogs([log("DeliveryBreached", [1, 1, 89_000_000], 5)]);
  assert.equal(orderFunds(store.db.orders["1"]).buyerClaimable, "89000000");
  await IndexerService.processLogs([claim(0, 89_000_000, 6)]);
  assert.equal(store.db.orders["1"].buyerClaimedAmount, "105000000");
  assert.equal(orderFunds(store.db.orders["1"]).buyerClaimable, "0");
  assert.equal(store.db.orders["1"].txHash, commit.transactionHash);
  console.log("PASS cumulative buyer claim: rebate, additional SLA refund, concurrent duplicate");

  await reset();
  await IndexerService.processLogs([commitment(), finalization(), log("OrderConfirmed", [1, 1, 89_000_000], 4)]);
  await IndexerService.processLogs([claim(2, 89_000_000, 5)]);
  assert.equal(store.db.orders["1"].sellerClaimedAmount, "89000000");
  assert.equal(orderFunds(store.db.orders["1"]).sellerClaimable, "0");
  assert.equal(store.db.orders["1"].buyerClaimedAmount, "0");
  console.log("PASS seller claimType 2 updates only seller cumulative amount");

  await reset();
  await IndexerService.processLogs([commitment(100_000_000, 90_000_000), finalization(20_000_000, 100_000_000)]);
  assert.equal(store.db.orders["1"].rebateAllocated, "100000000");
  assert.equal(orderFunds(store.db.orders["1"]).unallocated, "0");
  console.log("PASS deployed v1 rebate is capped at committed gross");

  await reset();
  const soldOut = commitment(200_000_000, 10_000_000, 2, 2, 2);
  await IndexerService.processLogs([soldOut, finalization(80_000_000, 200_000_000, 2, 2)]);
  assert.equal(store.db.campaigns["1"].status, "FINALIZED");
  assert.equal(store.db.campaigns["1"].totalUnitsCommitted, 2);
  assert.equal(store.db.orders["1"].rebateAllocated, "50000000");
  assert.equal(store.db.orders["1"].createdAt, 1_700_000_002_000);
  console.log("PASS sold-out Finalized-before-Commitment preserves final state and last order rebate");

  await reset();
  await IndexerService.processLogs([commitment(), finalization()]);
  const invalid = claim(0, 17_000_000, 4);
  await assert.rejects(IndexerService.processLogs([invalid]), /amount differs/);
  assert.equal(store.db.orders["1"].buyerClaimedAmount, "0");
  assert.ok(!Object.values(store.db.eventJournal).some(e => e.txHash === invalid.transactionHash));
  const unknown = log("FundsClaimed", [1, buyer, 16_000_000, 0], 4);
  await assert.rejects(IndexerService.processLogs([unknown]), /action\/campaign mismatch/);
  assert.equal(store.db.orders["1"].buyerClaimedAmount, "0");
  assert.equal(orderFunds({ ...store.db.orders["1"], buyerClaimedAmount: undefined, buyerClaimed: true }).accountingVerified, false);
  console.log("PASS malformed/missing claim evidence rolls back and stays unverified; legacy flags do not infer amounts");
  store.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
