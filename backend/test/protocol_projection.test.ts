import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { TransactionalStore } from "../src/db/store";
import { IndexerProjection } from "../src/services/indexerService";
import { HUB_ABI } from "../src/contracts/hubAbi";
import { config } from "../src/config";
import { protocolRebate } from "../../shared/domain.cjs";

import { eventProvider } from "./fixtures/events";

async function main() {
  config.deploymentBlock=1;
  const original=config.protocolVersion,projectionStore=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-protocol-v2-")));
  const indexer=new IndexerProjection(projectionStore,false),iface=new ethers.Interface(HUB_ABI),seller=ethers.Wallet.createRandom().address,buyer=ethers.Wallet.createRandom().address,identity=ethers.id("identity"),termsHash=ethers.id("v2-terms");
  const createdHash=ethers.id("v2-created"),commitHash=ethers.id("v2-commit");
  const event=(name:string,args:unknown[],blockNumber:number,txHash:string)=>({...iface.encodeEventLog(iface.getEvent(name)!,args),address:config.hubAddress,blockNumber,blockHash:ethers.id(`block-${blockNumber}`),transactionHash:txHash,transactionIndex:0,index:0});
  try {
    config.protocolVersion=2;
    assert.equal(protocolRebate(1,"100","20",2,"90","200"),"200");assert.equal(protocolRebate(2,"100","20",2,"90","200"),"180");
    assert.throws(()=>protocolRebate(3,"100","20",2,"90","200"),/Unsupported/);
    assert.throws(()=>protocolRebate(2,"100","20",2,"90","199"),/Gross/);
    const calldata:Record<string,any>={[createdHash]:{to:config.hubAddress,value:0n,data:iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:seller,metric:1,maxPerAccount:5,inventoryLimit:10,durationSeconds:86400,deliverySlaSeconds:86400,earlyRebateEnabled:true,earlySlotsCount:1,earlyRebateAmount:90_000_000,earlyRebateBps:0,platformFeeBps:0,termsHash},[{threshold:1,price:100_000_000},{threshold:2,price:20_000_000}]])}};
    const updatedHash=ethers.id("v2-updated-terms");
    const logs=[event("CampaignCreated",[1,seller,termsHash,1,1001,87401,10],1,createdHash),
      event("CampaignTermsUpdated",[1,updatedHash],2,ethers.id("v2-terms-update")),
      event("CampaignTermsUpdated",[1,termsHash],3,ethers.id("v2-terms-restore")),
      event("CampaignTermsUpdated",[1,updatedHash],4,ethers.id("v2-terms-update-again")),
      event("CommitmentMade",[1,1,identity,buyer,2,100_000_000,200_000_000,true,90_000_000],5,commitHash),event("CampaignFinalized",[1,20_000_000,1,200_000_000,2],6,ethers.id("v2-final"))];
    const provider=eventProvider(logs,calldata,block=>block===6?87401:1000+block);
    indexer.setProvider(provider);
    await indexer.processLogs([logs[0]]);
    assert.equal(projectionStore.db.campaigns["1"].finalClearingPrice,"100000000");
    assert.equal(projectionStore.db.campaigns["1"].status,"PUBLISHED");
    projectionStore.db.campaigns["1"].projectionOrigin="VERIFIED_PUBLISH";projectionStore.save();
    await indexer.processLogs([logs[1]]);
    assert.equal(projectionStore.db.campaigns["1"].termsHash,updatedHash);
    assert.equal(projectionStore.db.campaigns["1"].creationTermsHash,termsHash);
    assert.equal(projectionStore.db.campaigns["1"].termsPolicyReviewRequired,true);
    await indexer.processLogs([logs[2]]);
    assert.equal(projectionStore.db.campaigns["1"].termsPolicyReviewRequired,false);
    await indexer.processLogs(logs.slice(3));
    assert.equal(projectionStore.db.campaigns["1"].protocolVersion,2);assert.equal(projectionStore.db.orders["1"].protocolVersion,2);assert.equal(projectionStore.db.orders["1"].rebateAllocated,"180000000");
    const shadow=new IndexerProjection(projectionStore,false,true);shadow.setProvider(provider);
    await shadow.rebuildFromClean(1,6);
    assert.equal(projectionStore.db.campaigns["1"].termsHash,updatedHash);
    assert.equal(projectionStore.db.campaigns["1"].creationTermsHash,termsHash);
    assert.equal(projectionStore.db.campaigns["1"].termsPolicyReviewRequired,true);
    assert.equal(projectionStore.db.orders["1"].rebateAllocated,"180000000");
    console.log("PASS canonical terms updates retain creation binding, require publish policy review, restore only the original hash and replay changed terms in an isolated shadow");
    console.log("PASS manifest-selected v1/v2 economics, unknown version/gross rejection and v2 event projection with first-unit cap");
  } finally {config.protocolVersion=original;projectionStore.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
