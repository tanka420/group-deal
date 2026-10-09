import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ethers } from "ethers";
import { store, TransactionalStore } from "../src/db/store";
import { IndexerProjection, IndexerService } from "../src/services/indexerService";
import { config } from "../src/config";
import { HUB_ABI } from "../src/contracts/hubAbi";

import { eventProvider } from "./fixtures/events";

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-shadow-"));
  const target = new TransactionalStore(dir);
  const deployment = config.deploymentBlock;
  const iface = new ethers.Interface(HUB_ABI), seller = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", buyer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const identity = ethers.id("stable-campaign-identity"), proof = ethers.id("private-delivery-proof"), terms = ethers.id("terms");
  const logs:any[] = [], transactions:Record<string,any> = {};
  function event(name:string,args:any[],block:number) {
    const txHash = ethers.id(`shadow-tx-${block}`);
    logs.push({...iface.encodeEventLog(iface.getEvent(name)!,args),address:config.hubAddress,blockNumber:block,blockHash:ethers.id(`block-${block}`),transactionHash:txHash,transactionIndex:0,index:0});
    return txHash;
  }
  try {
    config.deploymentBlock = 1;
    store.db.campaigns = {stable:{id:"stable",onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,termsHash:terms,status:"FINALIZED",sellerId:"seller",sellerPayoutWallet:seller,tiers:[{threshold:1,price:"105000000"},{threshold:2,price:"89000000"}],deliverySlaSeconds:86400} as any};
    store.db.orders = {"1":{id:"1",onchainOrderId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,campaignId:"stable",buyerAccountId:"original-buyer",campaignIdentity:identity,buyerPrincipal:buyer,quantity:1,lockedUnitPrice:"105000000",committedGross:"105000000",isEarlySupporter:false,earlyRebateValue:"0",rebateAllocated:"16000000",sellerAllocated:"45000000",buyerRefundAllocated:"44000000",deliveryStatus:"RESOLVED",buyerClaimed:true,sellerClaimed:true,txHash:ethers.id("overwritten-legacy-hash"),createdAt:1,deliveryProofHash:proof,deliveredEntitlementEncrypted:"encrypted-fixture-payload",disputeReason:"Problem with activation",disputeEvidence:["https://fixture.invalid/evidence"],disputeResolution:{txHash:ethers.id("shadow-tx-6"),notes:"Reviewed",operatorId:"operator"},review:{score:3,comment:"Fixture",createdAt:1}} as any};
    store.db.userByWallet[buyer.toLowerCase()] = "new-wallet-owner";
    store.db.campaignIdentities = {};
    store.save();
    const original = JSON.stringify(store.db);
    await assert.rejects(IndexerService.rebuildFromClean(),/In-place rebuild is disabled/);
    assert.equal(JSON.stringify(store.db),original);
    target.replace(JSON.parse(original));
    const created = event("CampaignCreated",[1,seller,terms,0,1000,87400,0],1);
    transactions[created] = {to:config.hubAddress,value:0n,data:iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:seller,metric:0,maxPerAccount:10,inventoryLimit:0,durationSeconds:86400,deliverySlaSeconds:86400,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash:terms},[{threshold:1,price:105_000_000},{threshold:2,price:89_000_000}]])};
    const commitment = event("CommitmentMade",[1,1,identity,buyer,1,105_000_000,105_000_000,false,0],2);
    event("CampaignFinalized",[1,89_000_000,1,105_000_000,1],3);
    event("DeliveryRecorded",[1,1,proof,1700000004,1700172804],4);
    event("OrderDisputed",[1,1,buyer,ethers.id("reason")],5);
    event("DisputeResolved",[1,1,44_000_000,45_000_000],6);
    const buyerClaim = event("FundsClaimed",[1,buyer,60_000_000,0],7);
    const sellerClaim = event("FundsClaimed",[1,seller,45_000_000,2],8);
    for (const [hash,action,from] of [[buyerClaim,"claimBuyerFunds",buyer],[sellerClaim,"claimSellerProceeds",seller]]) transactions[hash] = {to:config.hubAddress,from,value:0n,data:iface.encodeFunctionData(action,[1,[1]])};
    const provider = eventProvider(logs,transactions);
    const shadow = new IndexerProjection(target,false,true);
    shadow.setProvider(provider);
    await shadow.rebuildFromClean(1,8);
    assert.equal(JSON.stringify(store.db),original);
    const rebuilt = target.db.orders["1"];
    assert.equal(rebuilt.buyerAccountId,"original-buyer");
    assert.equal(rebuilt.commitmentTxHash,commitment); assert.equal(rebuilt.txHash,commitment);
    assert.equal(rebuilt.buyerClaimedAmount,"60000000"); assert.equal(rebuilt.sellerClaimedAmount,"45000000");
    assert.equal(rebuilt.deliveryStatus,"RESOLVED"); assert.equal(rebuilt.deliveredEntitlementEncrypted,"encrypted-fixture-payload");
    assert.deepEqual(rebuilt.review,store.db.orders["1"].review);
    assert.deepEqual(rebuilt.disputeEvidence,store.db.orders["1"].disputeEvidence);
    assert.equal(rebuilt.transactionHistory?.length,6);
    assert.equal(target.db.syncState.lastIndexedBlock,8);
    for (const field of ["notifications","emailOutbox","webhookQueue","supportMessages","webhooks","users"] as const) assert.deepEqual(target.db[field],store.db[field]);
    const once = JSON.stringify(target.db.orders);
    await shadow.rebuildFromClean(1,8);
    assert.equal(JSON.stringify(target.db.orders),once);
    // API-first processing must backfill all earlier events, including allocations before a claim.
    const clean = JSON.parse(original);
    clean.orders = {}; clean.eventJournal = {}; clean.syncState = {lastIndexedBlock:0,lastSyncTimestamp:0};
    clean.campaigns.stable.status = "PUBLISHED"; clean.campaigns.stable.totalBuyerCount=0; clean.campaigns.stable.totalUnitsCommitted=0; clean.campaigns.stable.totalGrossCommitted="0";
    delete clean.campaigns.stable.finalizedAt; delete clean.campaigns.stable.finalClearingPrice;
    clean.campaignIdentities = target.db.campaignIdentities;
    target.replace(clean);
    const ordered = new IndexerProjection(target,false);
    ordered.setProvider(provider);
    const receipt = {blockNumber:8,txHash:sellerClaim,logs:[logs[7]]};
    await Promise.all([ordered.projectVerifiedReceipt(receipt),ordered.projectVerifiedReceipt(receipt)]);
    assert.equal(target.db.orders["1"].buyerClaimedAmount,"60000000"); assert.equal(target.db.orders["1"].sellerClaimedAmount,"45000000");
    assert.equal(target.db.orders["1"].commitmentTxHash,commitment); assert.equal(target.db.syncState.lastIndexedBlock,8);
    const key = `${config.arcChainId}_${config.hubAddress.toLowerCase()}_${sellerClaim.toLowerCase()}_0`;
    delete target.db.eventJournal[key];target.save(); // Deliberately corrupt committed fixture evidence.
    await assert.rejects(ordered.projectVerifiedReceipt(receipt),/PROJECTION_GAP/);
    assert.equal(JSON.stringify(store.db),original);
    console.log("PASS isolated deterministic replay preserves private metadata, original account identity, cumulative claims and commitment history without sending historical side effects");
    console.log("PASS concurrent API-first receipts wait for ordered backfill; missing events behind the cursor require recovery");
  } finally {
    config.deploymentBlock = deployment; target.close(); store.close();
    const resolved = path.resolve(dir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("groupdeal-shadow-")) throw new Error("Invalid shadow test cleanup path");
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
