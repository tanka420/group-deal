import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { TransactionalStore } from "../src/db/store";
import { config } from "../src/config";
import { IndexerProjection } from "../src/services/indexerService";
import { campaignForChainId, orderForChainId } from "../src/services/deploymentBindings";
import { HUB_ABI } from "../src/contracts/hubAbi";
import { eventProvider } from "./fixtures/events";
import { orderDto } from "../src/services/orderDto";

async function main() {
  const projection=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-scoped-binding-"))), indexer=new IndexerProjection(projection,false), original=config.deploymentBlock;
  const iface=new ethers.Interface(HUB_ABI),seller="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",buyer="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",foreignHub="0x1111111111111111111111111111111111111111",termsHash=ethers.id("scoped-terms"),identity=ethers.id("scoped-identity");
  const logs:any[]=[],calldata:Record<string,any>={};
  function event(name:string,args:any[],number:number) {
    const hash=ethers.id(`scoped-${number}`);
    logs.push({...iface.encodeEventLog(iface.getEvent(name)!,args),address:config.hubAddress,blockNumber:number,blockHash:ethers.id(`block-${number}`),transactionHash:hash,transactionIndex:0,index:0});return hash;
  }
  try {
    config.deploymentBlock=1;
    projection.db.campaigns["1"]={id:"1",onchainCampaignId:1,chainId:config.arcChainId,hubAddress:foreignHub,title:"Existing product",sellerId:"original-seller",termsHash:ethers.id("legacy-terms"),status:"FINALIZED"} as any;
    projection.db.orders["1"]={id:"1",onchainOrderId:1,chainId:config.arcChainId,hubAddress:foreignHub,campaignId:"1",buyerAccountId:"original-buyer",buyerPrincipal:buyer,campaignIdentity:identity,deliveryStatus:"DELIVERED",deliveredEntitlementEncrypted:"opaque-preserved-fixture",txHash:ethers.id("legacy-commit"),review:{score:4,comment:"Preserved"}} as any;
    projection.db.orders.unscoped={...projection.db.orders["1"],id:"unscoped",onchainOrderId:2,chainId:undefined,hubAddress:undefined};
    projection.save();const previous=JSON.stringify({campaign:projection.db.campaigns["1"],order:projection.db.orders["1"],unscoped:projection.db.orders.unscoped});
    const created=event("CampaignCreated",[1,seller,termsHash,0,1001,87401,2],1);
    calldata[created]={from:seller,data:iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:seller,metric:0,maxPerAccount:2,inventoryLimit:2,durationSeconds:86400,deliverySlaSeconds:86400,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash},[{threshold:1,price:1000000},{threshold:2,price:900000}]])};
    event("CommitmentMade",[1,1,identity,buyer,2,1000000,2000000,false,0],2);
    event("CampaignFinalized",[1,900000,1,2000000,2],3);
    const claim=event("FundsClaimed",[1,buyer,200000,0],4);calldata[claim]={from:buyer,data:iface.encodeFunctionData("claimBuyerFunds",[1,[1]])};
    indexer.setProvider(eventProvider(logs,calldata,block=>block===3?87401:1000+block));
    await indexer.processLogs(logs);
    const currentCampaign=campaignForChainId(projection.db,"1")!,currentOrder=orderForChainId(projection.db,"1")!;
    assert.notEqual(currentCampaign.id,"1");assert.notEqual(currentOrder.id,"1");assert.equal(currentOrder.campaignId,currentCampaign.id);
    assert.equal(currentOrder.buyerClaimedAmount,"200000");assert.equal(currentOrder.transactionHistory?.length,2);
    assert.equal(JSON.stringify({campaign:projection.db.campaigns["1"],order:projection.db.orders["1"],unscoped:projection.db.orders.unscoped}),previous);
    assert.equal(orderDto(projection.db.orders["1"]).accountingVerified,false);assert.equal(orderDto(projection.db.orders["1"]).hasEntitlement,true);
    assert.equal(orderForChainId(projection.db,"2"),undefined,"Unscoped legacy orders must never become current orders by their numeric ID");
    const before=JSON.stringify(projection.snapshot());
    assert.throws(()=>projection.transaction(()=>{projection.db.orders.duplicate={...currentOrder,id:"duplicate"};}),/Atomic persistence failed/);
    assert.equal(JSON.stringify(projection.snapshot()),before);
    await assert.rejects(indexer.syncThroughBlock(4),/PROJECTION_SCOPE_INVALID/); // mixed/unverified history still requires an explicit quarantine/cutover procedure
    const rebuild=new IndexerProjection(projection,false,true);rebuild.setProvider(eventProvider(logs,calldata));
    await assert.rejects(rebuild.rebuildFromClean(1,4),/preserve unmatched legacy/);
    assert.equal(JSON.stringify(projection.snapshot()),before);
    console.log("PASS scoped campaign/order IDs, preserved foreign/unscoped entitlements and reviews, current cumulative claim isolation, SQL unique binding and fail-closed mixed-history cutover");
  } finally {config.deploymentBlock=original;projection.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
