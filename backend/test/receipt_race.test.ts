import {OperationCompletionError} from '../src/domain/operationCompletion';
import {DisputeMetadataError} from '../src/domain/disputeMetadata';
import {SessionService,SessionProof} from '../src/services/sessionService';
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { store } from "../src/db/store";
import { config } from "../src/config";
import { HUB_ABI } from "../src/contracts/hubAbi";
import { IndexerService } from "../src/services/indexerService";
import { TransactionVerifier,TransactionVerificationError } from "../src/services/transactionVerifier";
import { DeliveryService } from "../src/services/deliveryService";
import { DisputeService } from "../src/services/disputeService";
import { bindVerifiedCampaign, campaignCalldata } from "../src/services/campaignBindingService";
import { deriveCampaignIdentity } from "../src/utils/crypto";

const iface = new ethers.Interface(HUB_ABI);
const buyer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", seller = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const transactions: Record<string, any> = {}, receipts: Record<string, any> = {};
let sequence = 0;let metadataProofs:Record<string,SessionProof>;
const provider = {
  getNetwork:async()=>({chainId:BigInt(config.arcChainId)}),
  getTransaction: async (hash: string) => transactions[hash] || null,
  getTransactionReceipt: async (hash: string) => receipts[hash] || null,
  getBlock: async (block: number) => ({ number:block,timestamp:1700000000+block, hash:ethers.id(`block-${block}`) }),
};
function transaction(action: string, params: any[], event: string, args: any[], from: string, block = 5) {
  const hash = ethers.id(`receipt-${++sequence}`), blockHash = ethers.id(`block-${block}`);
  const log = { ...iface.encodeEventLog(iface.getEvent(event)!,args), address:config.hubAddress, blockNumber:block, blockHash, transactionHash:hash, transactionIndex:0, index:0 };
  transactions[hash] = { hash, to:config.hubAddress, from, chainId:BigInt(config.arcChainId), data:iface.encodeFunctionData(action,params), value:0n, index:0,blockNumber:block, blockHash };
  receipts[hash] = { hash, status:1, from, to:config.hubAddress, index:0,blockNumber:block, blockHash, logs:[log] };
  return {hash,log};
}
function reset() {
  store.db.campaigns = {stable:{ id:"stable", onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress, sellerId:"seller", sellerPayoutWallet:seller, finalizedAt:1700000003, deliverySlaSeconds:86400 } as any};
  store.db.orders = {"1": { id:"1",onchainOrderId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,campaignId:"stable",buyerAccountId:"buyer",buyerPrincipal:buyer,
    campaignIdentity:ethers.id("identity"),quantity:1,committedGross:"105000000",lockedUnitPrice:"105000000",rebateAllocated:"16000000",buyerRefundAllocated:"0",sellerAllocated:"0",
    buyerClaimedAmount:"0",sellerClaimedAmount:"0",buyerClaimed:false,sellerClaimed:false,deliveryStatus:"DELIVERED",disputeDeadline:1700172800,
    txHash:ethers.id("commitment"),commitmentTxHash:ethers.id("commitment") } as any};
  store.db.users.operator = {id:"operator",roles:["operator"],email:"operator@fixture.invalid",createdAt:0,activeWallet:null};
  store.db.eventJournal = {}; store.db.consumedTxHashes = {}; store.db.supportMessages = {};
  store.db.webhooks = {}; store.db.notifications = {}; store.db.emailOutbox = {};
  store.db.users.seller={id:'seller',email:'seller@fixture.invalid',roles:['seller'],activeWallet:seller,createdAt:0};
  store.db.users.buyer={id:'buyer',email:'buyer@fixture.invalid',roles:['buyer'],activeWallet:buyer,createdAt:0};store.save();metadataProofs=Object.fromEntries(['buyer','operator'].map(id=>[id,SessionService.authenticate(SessionService.issue(store.db.users[id]))]));
  IndexerService.setProvider(provider); TransactionVerifier.setProvider(provider);
}
async function main() {
  config.deploymentBlock=1;
  reset();
  const confirm = transaction("confirmReceipt",[1,1],"OrderConfirmed",[1,1,89_000_000],buyer);
  await IndexerService.processLogs([confirm.log]);
  await Promise.all([DeliveryService.confirmReceipt("buyer","1",confirm.hash),DeliveryService.confirmReceipt("buyer","1",confirm.hash)]);
  assert.equal(store.db.orders["1"].txHash,ethers.id("commitment"));
  assert.equal(store.db.orders["1"].sellerAllocated,"89000000");
  assert.equal(store.db.orders["1"].transactionHistory?.length,1);
  console.log("PASS indexer-first confirm, concurrent identical receipt, immutable commitment hash/history");
  reset();
  const reason = "License does not activate", reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
  const dispute = transaction("openDispute",[1,1,reasonHash],"OrderDisputed",[1,1,buyer,reasonHash],buyer);
  await IndexerService.processLogs([dispute.log]);
  await DisputeService.openDispute("buyer","1",reason,["https://fixture.invalid/evidence"],dispute.hash,metadataProofs.buyer);
  await DisputeService.openDispute("buyer","1",reason,["https://fixture.invalid/evidence"],dispute.hash,metadataProofs.buyer);
  assert.equal(store.db.orders["1"].disputeReason,reason); assert.equal(store.db.supportMessages["1"].length,1);
  await assert.rejects(DisputeService.openDispute("buyer","1","Changed reason",[],dispute.hash,metadataProofs.buyer),(e:unknown)=>e instanceof TransactionVerificationError&&e.code==="VERIFIER_INTENT_CHANGED"&&e.status===409);
  const resolve = transaction("resolveDispute",[1,1,44_000_000,45_000_000],"DisputeResolved",[1,1,44_000_000,45_000_000],config.operatorAddress,6);
  await IndexerService.processLogs([resolve.log]);
  await DisputeService.resolveDispute("operator","1","44000000","45000000","Checked proof",resolve.hash,metadataProofs.operator);
  await DisputeService.resolveDispute("operator","1","44000000","45000000","Checked proof",resolve.hash,metadataProofs.operator);
  assert.equal(store.db.supportMessages["1"].length,2);
  assert.equal(store.db.orders["1"].disputeResolution?.txHash,resolve.hash);
  await assert.rejects(DisputeService.resolveDispute("operator","1","44000000","45000000","Changed note",resolve.hash,metadataProofs.operator),(e:unknown)=>e instanceof DisputeMetadataError&&e.status===409);
  assert.equal(store.db.orders["1"].deliveryStatus,"RESOLVED");
  assert.equal(store.db.orders["1"].txHash,ethers.id("commitment"));
  console.log("PASS expired wall-clock/indexer-first dispute and resolve preserve receipt-bound private metadata");
  reset();
  const intent = {intentId:"first",expectedTo:config.hubAddress,expectedSender:buyer,expectedFunction:"confirmReceipt",expectedEvent:"OrderConfirmed",expectedEventArgs:{campaignId:1,orderId:1}};
  const conflict = transaction("confirmReceipt",[1,1],"OrderConfirmed",[1,1,89_000_000],buyer);
  const races = await Promise.allSettled([TransactionVerifier.verifyExpectedTransaction(intent,conflict.hash),TransactionVerifier.verifyExpectedTransaction({...intent,intentId:"other"},conflict.hash)]);
  assert.equal(races.filter(r=>r.status === "fulfilled").length,1);
  receipts[conflict.hash].blockHash = ethers.ZeroHash;
  await assert.rejects(TransactionVerifier.verifyExpectedTransaction(intent,conflict.hash),/binding mismatch/);
  console.log("PASS cross-intent receipt consumption race and block binding fail closed");
  reset(); store.db.campaigns = {};
  const draft = {id:"draft-stable",status:"DRAFT",sellerId:"seller",sellerPayoutWallet:seller,title:"Original",description:"Original",category:"",thumbnailUrl:"",visibility:"PUBLIC",metric:"BUYER_COUNT",
    tiers:[{threshold:1,price:"105000000"},{threshold:2,price:"89000000"}],maxPerAccount:2,inventoryLimit:10,durationSeconds:86400,deliverySlaSeconds:86400,
    earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:"0",earlyRebateBps:0,platformFeeBps:0,termsHash:ethers.id("draft-terms"),startTime:0,endTime:0,
    currentUnlockedTier:0,totalBuyerCount:0,totalUnitsCommitted:0,totalGrossCommitted:"0",deliveryMethod:"LICENSE_KEY",deliveryContentTemplate:"private fixture",dryRunDeliveryVerified:true,amendments:[]} as any;
  store.db.campaigns[draft.id] = draft;store.save(); // Commit this deliberate publish fixture before native indexer reads.
  const calldata = campaignCalldata(draft), parsed = iface.parseTransaction({data:calldata})!;
  const created = transaction("createCampaign",[parsed.args[0],parsed.args[1]],"CampaignCreated",[1,seller,draft.termsHash,0,1000,87400,10],seller,1);
  await IndexerService.processLogs([created.log]);
  assert.equal(store.db.campaigns["1"].visibility,"UNLISTED"); assert.equal(store.db.campaigns["1"].dryRunDeliveryVerified,false);
  const verification = await TransactionVerifier.verifyExpectedTransaction({intentId:"publish-draft-stable",expectedTo:config.hubAddress,expectedSender:seller,expectedFunction:"createCampaign",expectedCalldata:calldata,expectedEvent:"CampaignCreated",expectedEventArgs:{termsHash:draft.termsHash}},created.hash);
  const originalTermsHash=draft.termsHash,updatedTermsHash=ethers.id("updated-after-creation-before-binding");
  const updated=transaction("updateTermsBeforeFirstCommitment",[1,updatedTermsHash],"CampaignTermsUpdated",[1,updatedTermsHash],seller,2);
  await IndexerService.processLogs([updated.log]);
  const bound = bindVerifiedCampaign(draft.id,verification,calldata);
  assert.equal(bound.id,"draft-stable"); assert.equal(bound.startTime,1000); assert.equal(bound.endTime,87400);
  assert.equal(bound.deliveryContentTemplate,"private fixture"); assert.equal(Object.keys(store.db.campaigns).length,1);
  assert.equal(bound.creationTermsHash,originalTermsHash);assert.equal(bound.termsHash,updatedTermsHash);assert.equal(bound.termsPolicyReviewRequired,true);
  assert.equal(bindVerifiedCampaign(draft.id,verification,calldata).id,draft.id);
  await assert.rejects(async()=>bindVerifiedCampaign(draft.id,{...verification,txHash:ethers.id("other"),parsedEvent:{...verification.parsedEvent,campaignId:2}},calldata),(e:unknown)=>e instanceof OperationCompletionError&&e.code==="OPERATION_CANONICAL_PROJECTION_REQUIRED"&&e.status===409);assert.equal(store.db.campaigns[draft.id].txHash,verification.txHash);
  console.log("PASS stable publish ID, chain timestamps, unbound quarantine and duplicate/different publish receipts");
  const oldSecret = config.campaignIdentitySecret;
  const identity = deriveCampaignIdentity("buyer","draft-stable");
  config.campaignIdentitySecret = "rotated fixture secret";
  assert.equal(deriveCampaignIdentity("buyer","draft-stable"),identity);
  config.campaignIdentitySecret = oldSecret;
  store.close();
  console.log("PASS persisted campaign identity survives derivation-secret rotation");
}
main().catch(error=>{console.error(error);store.close();process.exitCode=1;});
