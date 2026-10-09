import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {ethers} from "ethers";
import {store} from "../src/db/store";
import {config} from "../src/config";
import {HUB_ABI} from "../src/contracts/hubAbi";
import {ClaimOperationService} from "../src/services/claimOperationService";
import {IndexerService} from "../src/services/indexerService";
import {TransactionVerifier} from "../src/services/transactionVerifier";
import {operationRouter} from "../src/routes/operationRoutes";
import {reconciliationProvider} from "./fixtures/reconciliation";
import {eventProvider} from "./fixtures/events";

async function run(){
  const buyer=ethers.Wallet.createRandom().address,seller=ethers.Wallet.createRandom().address,other=ethers.Wallet.createRandom().address,iface=new ethers.Interface(HUB_ABI);
  config.deploymentBlock=1;
  for(const [id,wallet,roles] of [["buyer",buyer,["buyer"]],["seller",seller,["seller"]],["other",other,["buyer"]]] as const)store.db.users[id]={id,email:id+"@fixture.invalid",activeWallet:wallet,roles:[...roles],createdAt:0};
  store.db.campaigns.stable={id:"stable",sellerId:"seller",sellerPayoutWallet:seller,chainId:config.arcChainId,hubAddress:config.hubAddress,onchainCampaignId:1,status:"FINALIZED",termsHash:ethers.id("fixture-terms"),finalClearingPrice:"80",protocolVersion:1,deliveryContentTemplate:"fixture-private-template"} as any;
  store.db.orders.internal={id:"internal",campaignId:"stable",chainId:config.arcChainId,hubAddress:config.hubAddress,onchainOrderId:1,buyerAccountId:"buyer",buyerPrincipal:buyer,quantity:1,lockedUnitPrice:"100",committedGross:"100",rebateAllocated:"20",buyerRefundAllocated:"30",sellerAllocated:"50",buyerClaimedAmount:"10",sellerClaimedAmount:"0",deliveryStatus:"RESOLVED",isEarlySupporter:false,earlyRebateValue:"0",txHash:ethers.id("fixture-commit"),entitlementEncrypted:"fixture-private-preserved"} as any;
  store.db.syncState={lastIndexedBlock:4,lastSyncTimestamp:0};store.save();
  const canonical=reconciliationProvider(store.db,90n,5);
  const now=Math.floor(Date.now()/1000);let invalidBlock=false,blockReads=0,stale=false,zero=false;
  const provider={...canonical,getBlockNumber:async()=>5,getBlock:async(n:number)=>({number:n,hash:invalidBlock&&++blockReads%2===0?ethers.id("changed-block"):ethers.id("block-"+n),timestamp:stale?now-121:now}),call:async(tx:any)=>{
    assert.equal(tx.blockTag,5);const parsed=iface.parseTransaction({data:tx.data})!;
    if(["claimBuyerFunds","claimSellerProceeds"].includes(parsed.name)){assert.equal(String(parsed.args[0]),"1");assert.deepEqual(parsed.args[1].map(String),["1"]);assert.equal(tx.from,parsed.name==="claimBuyerFunds"?buyer:seller);return iface.encodeFunctionResult(parsed.name,[zero?0:parsed.name==="claimBuyerFunds"?40:50]);}
    return canonical.call(tx);
  }};
  ClaimOperationService.setProvider(provider);
  const app=express();app.use(express.json());app.use("/api/transactions",operationRouter);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const base="http://127.0.0.1:"+(server.address() as any).port;
  const post=(route:string,body:any,user="buyer")=>fetch(base+"/api/transactions"+route,{method:"POST",headers:{Authorization:"Bearer "+jwt.sign({userId:user},config.jwtSecret,{expiresIn:"1m"}),"Content-Type":"application/json"},body:JSON.stringify(body)});
  const input={campaignId:"stable",action:"BUYER_CLAIM",orderIds:["internal"],idempotencyKey:"claim:fixture-retry"};
  try {
    for(const failure of ["changed","stale","zero","wrong-chain"]){
      invalidBlock=failure==="changed";blockReads=0;stale=failure==="stale";zero=failure==="zero";
      ClaimOperationService.setProvider(failure==="wrong-chain"?{...provider,getNetwork:async()=>({chainId:1n})}:provider);
      await assert.rejects(ClaimOperationService.quote("buyer","stable","BUYER_CLAIM",["internal"]),/RPC_UNAVAILABLE/);
      assert.equal(Object.keys(store.db.operations).length,0);assert.equal(store.db.orders.internal.buyerClaimedAmount,"10");
    }
    invalidBlock=false;stale=false;zero=false;ClaimOperationService.setProvider(provider);
    store.db.orders.internal.rebateAllocated="1";store.save(); // Local amounts must never choose the financial quote.
    const concurrent=await Promise.all([post("/claims/prepare",input),post("/claims/prepare",input)]);
    assert.ok(concurrent.every(r=>r.status===200));const results=await Promise.all(concurrent.map(r=>r.json())) as any[];
    const operation=results[0].operation;assert.equal(results[1].operation.id,operation.id);assert.equal(operation.financialQuote.amountBaseUnits,"40");assert.equal(store.db.orders.internal.rebateAllocated,"1");
    assert.equal(operation.expectedEventArgs.claimType,0);assert.deepEqual(iface.parseTransaction({data:operation.calldata})!.args[1].map(String),["1"]);
    assert.equal((await post("/claims/prepare",{...input,idempotencyKey:"claim:different-key"})).status,409);
    assert.notEqual((await post("/claims/prepare",input,"other")).status,200);
    assert.notEqual((await post("/claims/prepare",{...input,orderIds:["internal","internal"]})).status,200);
    store.db.users.buyer.activeWallet=ethers.Wallet.createRandom().address;store.save();assert.equal((await post("/"+operation.id+"/ready",{})).status,409);assert.equal(store.db.operations[operation.id].phase,"PREPARED");
    store.db.users.buyer.activeWallet=buyer;store.db.orders.internal.rebateAllocated="20";store.save();
    const readiness=await Promise.all([post("/"+operation.id+"/ready",{}),post("/"+operation.id+"/ready",{})]);assert.deepEqual(readiness.map(r=>r.status).sort(),[200,409]);
    const buyerReady=await readiness.find(r=>r.status===200)!.json() as any;assert.equal(buyerReady.campaign,undefined);assert.ok(!JSON.stringify(buyerReady).includes("fixture-private-template"));
    assert.equal(store.db.orders.internal.buyerClaimedAmount,"10");
    const txHash=ethers.id("claim-operation-receipt");assert.equal((await post("/"+operation.id+"/submit",{txHash})).status,202);
    TransactionVerifier.setProvider({getTransaction:async()=>null,getTransactionReceipt:async()=>null});
    assert.equal((await post("/"+operation.id+"/recover",{txHash})).status,409);assert.equal(store.db.operations[operation.id].phase,"UNKNOWN");assert.equal((await post("/"+operation.id+"/ready",{})).status,409);
    const log={...iface.encodeEventLog(iface.getEvent("FundsClaimed")!,[1,buyer,40,0]),address:config.hubAddress,transactionHash:txHash,blockNumber:6,blockHash:ethers.id("block-6"),transactionIndex:0,index:0};
    const proof=eventProvider([log],{[txHash]:{from:buyer,data:operation.calldata}},()=>now);
    TransactionVerifier.setProvider(proof);IndexerService.setProvider(proof);
    assert.equal((await post("/"+operation.id+"/recover",{txHash})).status,200);
    assert.equal(store.db.operations[operation.id].phase,"PROJECTED");assert.equal(store.db.orders.internal.buyerClaimedAmount,"50");assert.equal(store.db.orders.internal.entitlementEncrypted,"fixture-private-preserved");
    assert.equal((await post("/"+operation.id+"/recover",{txHash})).status,200);assert.equal(store.db.orders.internal.buyerClaimedAmount,"50");
    const sell=await post("/claims/prepare",{...input,action:"SELLER_CLAIM",idempotencyKey:"seller:claim-fixture"},"seller");assert.equal(sell.status,200);const sellerOperation=(await sell.json() as any).operation;assert.equal(sellerOperation.expectedEventArgs.claimType,2);assert.equal(sellerOperation.financialQuote.amountBaseUnits,"50");
    assert.equal((await post("/"+sellerOperation.id+"/ready",{},"seller")).status,200);
    assert.equal(store.db.orders.internal.sellerClaimedAmount,"0");
    const sellerHash=ethers.id("seller-claim-receipt"),sellerLog={...iface.encodeEventLog(iface.getEvent("FundsClaimed")!,[1,seller,50,2]),address:config.hubAddress,transactionHash:sellerHash,blockNumber:7,blockHash:ethers.id("block-7"),transactionIndex:0,index:0};
    const sellerProof=eventProvider([log,sellerLog],{[txHash]:{from:buyer,data:operation.calldata},[sellerHash]:{from:seller,data:sellerOperation.calldata}},()=>now);
    TransactionVerifier.setProvider(sellerProof);IndexerService.setProvider(sellerProof);
    assert.equal((await post("/"+sellerOperation.id+"/recover",{txHash:sellerHash},"seller")).status,200);assert.equal(store.db.orders.internal.sellerClaimedAmount,"50");assert.equal(store.db.operations[sellerOperation.id].phase,"PROJECTED");
    console.log("PASS LOCAL_FIXTURE: fixed-block claim simulation independent of DB amounts, stale/changed/zero/wrong-chain fail closed, pinned principal/scope, duplicate prepare/one signature, receipt-unknown recovery, buyer cumulative claim/idempotency/private metadata and seller type2 receipt projection. No live transfer proof.");
  }finally{ClaimOperationService.setProvider(undefined);await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error(error instanceof Error?{name:error.name,message:error.message}:"Claim operation verification failed");process.exitCode=1;});
