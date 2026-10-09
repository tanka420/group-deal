import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { TransactionalStore } from "../src/db/store";
import { IndexerProjection } from "../src/services/indexerService";
import { config } from "../src/config";
import { HUB_ABI } from "../src/contracts/hubAbi";
import { eventProvider } from "./fixtures/events";

async function main() {
  const source=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-event-proof-"))), originalDeployment=config.deploymentBlock,originalWs=config.arcWsUrl;
  const indexer=new IndexerProjection(source,false),iface=new ethers.Interface(HUB_ABI);
  const seller="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",buyer="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",termsHash=ethers.id("evidence-terms");
  const event=(name:string,args:unknown[],blockNumber:number,hash:string,index=0)=>({...iface.encodeEventLog(iface.getEvent(name)!,args),address:config.hubAddress,blockNumber,blockHash:ethers.id(`block-${blockNumber}`),transactionHash:hash,transactionIndex:0,index});
  const created=event("CampaignCreated",[1,seller,termsHash,0,1001,87401,0],1,ethers.id("evidence-create"));
  const commit=event("CommitmentMade",[1,1,ethers.id("identity"),buyer,1,1000000,1000000,false,0],2,ethers.id("evidence-commit"));
  const calldata={[created.transactionHash]:{from:seller,data:iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:seller,metric:0,maxPerAccount:2,inventoryLimit:0,durationSeconds:86400,deliverySlaSeconds:86400,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash},[{threshold:1,price:1000000},{threshold:2,price:900000}]])}};
  const provider=eventProvider([created,commit],calldata);
  async function reject(candidate:any,pattern= /EVENT_EVIDENCE_INVALID/) {
    const before=JSON.stringify(source.snapshot());indexer.setProvider(candidate);
    await assert.rejects(indexer.syncThroughBlock(2),pattern);
    assert.equal(JSON.stringify(source.snapshot()),before,"Invalid evidence must leave projection, journal, outboxes and cursor unchanged");
  }
  try {
    config.deploymentBlock=1;
    config.arcWsUrl=""; // No remote socket in this local startup failure fixture.
    indexer.setProvider({...provider,getBlockNumber:async()=>{throw new Error("offline fixture");}});
    await assert.rejects(indexer.start(),/INDEXER_STARTUP_FAILED/);
    assert.equal(source.db.syncState.lastIndexedBlock,0);
    await reject({...provider,getNetwork:async()=>({chainId:1n})});
    await reject({...provider,getTransactionReceipt:async(hash:string)=>hash===commit.transactionHash?null:provider.getTransactionReceipt(hash)});
    for(const field of ["status","hash","blockHash","blockNumber","from","index"]) {
      await reject({...provider,getTransactionReceipt:async(hash:string)=>{const receipt=await provider.getTransactionReceipt(hash);return hash===commit.transactionHash?{...receipt,[field]:({status:0,hash:ethers.id("other-tx"),blockHash:ethers.id("other-block"),blockNumber:3,from:seller,index:7} as any)[field]}:receipt;}});
    }
    await reject({...provider,getTransaction:async(hash:string)=>{const tx=await provider.getTransaction(hash);return hash===commit.transactionHash?{...tx,chainId:1n}:tx;}});
    await reject({...provider,getTransactionReceipt:async(hash:string)=>{const receipt=await provider.getTransactionReceipt(hash);return hash===commit.transactionHash?{...receipt,logs:[{...commit,data:"0x"}]}:receipt;}});
    await reject({...provider,getLogs:async()=>[created,{...commit,removed:true}]});
    await reject({...provider,getLogs:async()=>[created,{...commit,blockNumber:3}]});
    let reads=0;
    await reject({...provider,getBlock:async(number:number)=>{const block=await provider.getBlock(number);return number===1&&++reads>1?{...block,hash:ethers.id("changed-block")}:block;}});
    const extra=event("TierUnlocked",[1,1,2,900000],2,commit.transactionHash,1);
    await reject({...eventProvider([created,commit,extra],calldata),getLogs:async()=>[created,commit]});
    indexer.setProvider(provider);await indexer.syncThroughBlock(2);
    assert.equal(source.db.orders["1"].committedGross,"1000000");assert.equal(source.db.syncState.lastIndexedBlockHash,commit.blockHash);
    assert.ok(Object.values(source.db.eventJournal).every(entry=>entry.evidenceVersion===2&&ethers.isHexString(entry.eventDigest,32)));
    const once=JSON.stringify(source.snapshot());await indexer.processLogs([commit,commit]);assert.equal(JSON.stringify(source.snapshot()),once);
    await assert.rejects(indexer.processLogs([{...commit,...iface.encodeEventLog(iface.getEvent("CommitmentMade")!,[1,1,ethers.id("identity"),buyer,1,2000000,2000000,false,0])}]),/journal proof differs/);
    indexer.setProvider({...provider,getBlock:async(number:number)=>({...await provider.getBlock(number),hash:ethers.id("cursor-tamper")})});
    await assert.rejects(indexer.syncThroughBlock(2),/durable cursor block hash changed/);
    assert.equal(JSON.stringify(source.snapshot()),once);
    console.log("PASS indexer chain/transaction/receipt/log/block proof, missing-event and canonical cursor guards; bad batches have no partial financial writes");
  } finally {config.deploymentBlock=originalDeployment;config.arcWsUrl=originalWs;source.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
