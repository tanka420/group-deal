import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {ethers} from "ethers";
import {config} from "../src/config";
import {store} from "../src/db/store";
import {orderRouter} from "../src/routes/orderRoutes";
import {operationRouter} from "../src/routes/operationRoutes";
import {CampaignEditorService} from "../src/services/campaignEditorService";
import {IndexerService} from "../src/services/indexerService";
import {TransactionVerifier} from "../src/services/transactionVerifier";
import {CircleWalletService} from "../src/services/circleWalletService";
import {OperationService} from "../src/services/operationService";
import {reviewedProductVerified} from "./fixtures/product";
import {eventProvider} from "./fixtures/events";
import {HUB_ABI} from "../src/contracts/hubAbi";

async function run(){
  assert.ok(store.filePath.includes("groupdeal-test-"));const originalFetch=globalThis.fetch,fixtureTimestamp=Math.floor(Date.now()/1000);
  const signer=ethers.Wallet.createRandom(),buyer=ethers.Wallet.createRandom().address,payout=ethers.Wallet.createRandom().address,other=ethers.Wallet.createRandom().address,iface=new ethers.Interface(HUB_ABI);
  Object.assign(config,{arcChainId:5042002,hubAddress:ethers.Wallet.createRandom().address,arcRpcUrl:"https://fixture.invalid",authorizedSignerPrivateKey:signer.privateKey,deploymentBlock:1});
  const product=await reviewedProductVerified("seller",payout);
  for(const [id,wallet] of [["buyer",buyer],["other",other]])store.db.users[id]={id,email:id+"@fixture.invalid",activeWallet:wallet,roles:["buyer"],createdAt:0};
  const campaign=CampaignEditorService.saveDraft("seller",{title:"Durable purchase",description:"Purchased document",thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"105"},{threshold:10,priceUSDC:"89"}],maxPerAccount:10,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:"FILE_LINK"});
  Object.assign(campaign,{status:"ACTIVE",onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,startTime:fixtureTimestamp-60,endTime:fixtureTimestamp+3600,productSnapshot:product.snapshot,deliveryContentTemplate:"private-fixture-template"});campaign.termsHash=CampaignEditorService.termsHash(campaign);
  const truth=structuredClone(campaign),blockHash=ethers.id("block-125");store.db.syncState={lastIndexedBlock:125,lastSyncTimestamp:0};store.save();
  let reads=0,mode="valid",nonce=7,units=2,afterRead:(()=>void)|undefined;
  const tuple=(fn:string,record:any)=>iface.getFunction(fn)!.outputs.map(c=>record[c.name]??(c.type==="address"?ethers.ZeroAddress:c.type==="bytes32"?ethers.ZeroHash:c.type==="bool"?false:0));
  globalThis.fetch=(async(url,init)=>{
    if(String(url).startsWith("http://127.0.0.1"))return originalFetch(url,init);
    reads++;if(mode==="offline")return new Response("",{status:503});
    const batch=JSON.parse(String(init?.body));
    const result=batch.map((request:any)=>{
      let result:any;
      if(request.method==="eth_chainId")result="0x4cef52";
      else if(request.method==="eth_blockNumber")result="0x7d";
      else if(request.method==="eth_getBlockByNumber"){result={number:"0x7d",hash:blockHash,timestamp:ethers.toQuantity(fixtureTimestamp)};afterRead?.();}
      else {
        assert.equal(request.method,"eth_call");assert.equal(request.params[1],"0x7d");const parsed=iface.parseTransaction({data:request.params[0].data})!;
        switch(parsed.name){
          case "campaignTerms":return {jsonrpc:"2.0",id:request.id,result:iface.encodeFunctionResult(parsed.name,tuple(parsed.name,{...truth,metric:0}))};
          case "campaignStates":return {jsonrpc:"2.0",id:request.id,result:iface.encodeFunctionResult(parsed.name,tuple(parsed.name,{...truth,status:mode==="closed"?2:1,totalUnitsCommitted:2,currentUnlockedTier:0}))};
          case "getCampaignTiers":result=mode==="expensive"?truth.tiers.map((t,i)=>({...t,price:i===0?"106000000":t.price})):truth.tiers;break;
          case "campaignIdentityPrincipals":result=buyer;break;
          case "identityNonces":result=nonce;break;
          case "buyerUnitsCommitted":result=units;break;
          case "authorizedSigner":result=signer.address;break;
          default:throw new Error("Unexpected fixture call");
        }
        result=iface.encodeFunctionResult(parsed.name,[result]);
      }
      return {jsonrpc:"2.0",id:request.id,result};
    });return new Response(JSON.stringify(result),{headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  const app=express();app.use(express.json());app.use("/api/orders",orderRouter);app.use("/api/transactions",operationRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const base="http://127.0.0.1:"+(server.address() as any).port;
  const post=async(route:string,body:any,user="buyer")=>{const response=await fetch(base+route,{method:"POST",headers:{Authorization:"Bearer "+jwt.sign({userId:user},config.jwtSecret,{expiresIn:"2m"}),"Content-Type":"application/json"},body:JSON.stringify(body)});if(route.endsWith("/ready")){const result=await response.clone().json() as any;console.log(JSON.stringify({stage:"BUY_READY_RESPONSE",status:response.status,code:typeof result.code==="string"&&/^[A-Z][A-Z0-9_]{1,100}$/.test(result.code)?result.code:"FINITE_CODE_ABSENT"}));}return response;};
  const input={campaignId:campaign.id,quantity:1,walletAddress:buyer,requireEarlySlot:false,maxGrossAmount:"105000000",idempotencyKey:"buy:durable-fixture"};
  try {
    for(const body of [{...input,idempotencyKey:undefined},{...input,quantity:"1"},{...input,quantity:0},{...input,maxGrossAmount:"1.05"}])assert.equal((await post("/api/orders/authorize",body)).status,400);
    assert.equal(Object.keys(store.db.operations).length,0);
    assert.equal((await post("/api/orders/authorize",{...input,requireEarlySlot:true})).status,409,"An unavailable first-purchase early slot must fail before signing");
    assert.equal((await post("/api/orders/authorize",{...input,maxGrossAmount:"104999999"})).status,409,"A cap below the chain price must fail");
    const replies=await Promise.all([post("/api/orders/authorize",input),post("/api/orders/authorize",input)]);assert.ok(replies.every(r=>r.status===200));const records=await Promise.all(replies.map(r=>r.json())) as any[];const result=records[0],operation=result.operation;
    assert.equal(records[1].operation.id,operation.id);assert.equal(records[1].signature,result.signature);assert.equal(operation.action,"BUY");assert.equal(operation.purchaseQuote.authorizationNonce,7);assert.equal(operation.purchaseQuote.commitmentAmount,"105000000");assert.equal(Object.keys(store.db.orders).length,0);
    const before=reads;assert.equal((await post("/api/orders/authorize",input)).status,200);assert.equal(reads,before,"Response loss retry must return the durable authorization without issuing a new one");
    store.transaction(()=>{campaign.termsPolicyReviewRequired=true;});const beforePolicyReads=reads;
    assert.equal((await post(`/api/transactions/${operation.id}/ready`,{})).status,409);
    assert.equal(store.db.operations[operation.id].phase,"PREPARED");assert.equal(reads,beforePolicyReads,"Updated policy terms must fail before a new quote/signature");
    store.transaction(()=>{campaign.termsPolicyReviewRequired=false;});
    assert.equal((await post("/api/orders/authorize",{...input,idempotencyKey:"buy:other-device"})).status,409);assert.equal((await post("/api/orders/authorize",{...input,quantity:2})).status,409);assert.equal((await post("/api/orders/authorize",input,"other")).status,403);
    nonce=8;assert.equal((await post(`/api/transactions/${operation.id}/ready`,{})).status,409);assert.equal(store.db.operations[operation.id].phase,"PREPARED");nonce=7;
    store.transaction(()=>{product.rights.status="REVOKED";});assert.equal((await post(`/api/transactions/${operation.id}/ready`,{})).status,409);store.transaction(()=>{product.rights.status="APPROVED";});
    const replacementBuyerWallet=ethers.Wallet.createRandom().address;afterRead=()=>{store.transaction(()=>{store.db.users.buyer.activeWallet=replacementBuyerWallet;});};assert.equal((await post(`/api/transactions/${operation.id}/ready`,{})).status,409);assert.equal(store.db.operations[operation.id].phase,"PREPARED");afterRead=undefined;store.transaction(()=>{store.db.users.buyer.activeWallet=buyer;});
    const ready=await Promise.all([post(`/api/transactions/${operation.id}/ready`,{}),post(`/api/transactions/${operation.id}/ready`,{})]);assert.deepEqual(ready.map(r=>r.status).sort(),[200,409]);const readyBody=await ready.find(r=>r.status===200)!.json() as any;assert.equal(readyBody.campaign,undefined);assert.ok(!JSON.stringify(readyBody).includes("private-fixture-template"));
    store.transaction(()=>{store.db.users.buyer.circleWallet={walletId:"fixture-wallet",address:buyer,blockchain:"ARC-TESTNET"}});
    CircleWalletService.validateTransactionPolicy(config.hubAddress,operation.calldata,{type:"COMMIT_BUY",campaignId:"1",quantity:"1"},"buyer");
    assert.throws(()=>CircleWalletService.validateTransactionPolicy(config.hubAddress,operation.calldata,{type:"COMMIT_BUY",campaignId:"1",quantity:"1"},"other"),/owned, reserved/);
    const changed=iface.decodeFunctionData("commitToBuy",operation.calldata);assert.throws(()=>CircleWalletService.validateTransactionPolicy(config.hubAddress,iface.encodeFunctionData("commitToBuy",[changed[0],changed[1],changed[2],changed[3],changed[4],changed[5]+1n,changed[6]]),{type:"COMMIT_BUY",campaignId:"1",quantity:"1"},"buyer"),/owned, reserved/);
    const txHash=ethers.id("durable-buy-receipt");assert.equal((await post(`/api/transactions/${operation.id}/submit`,{txHash})).status,202);TransactionVerifier.setProvider({getTransaction:async()=>null,getTransactionReceipt:async()=>null});
    assert.equal((await post(`/api/transactions/${operation.id}/recover`,{txHash})).status,409);assert.equal(store.db.operations[operation.id].phase,"UNKNOWN");assert.equal((await post(`/api/transactions/${operation.id}/ready`,{})).status,409);
    const log={...iface.encodeEventLog(iface.getEvent("CommitmentMade")!,[1,1,result.campaignIdentity,buyer,1,105000000,105000000,false,0]),address:config.hubAddress,transactionHash:txHash,blockNumber:126,blockHash:ethers.id("block-126"),transactionIndex:0,index:0};
    const proof=eventProvider([log],{[txHash]:{from:buyer,data:operation.calldata}},()=>fixtureTimestamp);TransactionVerifier.setProvider(proof);IndexerService.setProvider(proof);
    await IndexerService.projectVerifiedReceipt(await TransactionVerifier.verifyExpectedTransaction({intentId:operation.intentId,expectedTo:config.hubAddress,expectedSender:buyer,expectedFunction:operation.expectedFunction,expectedCalldata:operation.calldata,expectedEvent:"CommitmentMade",expectedEventArgs:operation.expectedEventArgs},txHash)); // Indexer-first race before the HTTP retry.
    store.transaction(()=>{campaign.termsPolicyReviewRequired=true;}); // Commit the later hold explicitly; completion must not flush a pending cache mutation.
    const recovered=await post(`/api/transactions/${operation.id}/recover`,{txHash});if(recovered.status!==200){const e=await recovered.clone().json() as any;console.log(JSON.stringify({stage:'BUY_INDEXER_FIRST_RECOVERY',status:recovered.status,code:typeof e.error==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(e.error)?e.error:'NONFINITE_MESSAGE_OMITTED'}));}assert.equal(recovered.status,200);assert.equal(store.db.operations[operation.id].phase,"PROJECTED");assert.equal(Object.keys(store.db.orders).length,1);const order=Object.values(store.db.orders)[0];assert.equal(order.buyerAccountId,"buyer");assert.equal(order.committedGross,"105000000");assert.equal(store.db.operations[operation.id].projectedOrderId,order.id);
    const held=store.readOperationPreparationState({actorId:"buyer",action:"BUY",resourceId:campaign.id,idempotencyKey:"buy:policy-probe"});assert.equal(held.graph.campaigns[campaign.id].termsPolicyReviewRequired,true,"A persisted hold requires an explicit committed lift");store.transaction(()=>{campaign.termsPolicyReviewRequired=false;});
    assert.equal((await post(`/api/transactions/${operation.id}/recover`,{txHash})).status,200);assert.equal(Object.keys(store.db.orders).length,1);assert.equal((await post(`/api/transactions/${operation.id}/submit`,{txHash:ethers.id("replacement-without-lineage")})).status,409);
    const failed=OperationService.prepare({userId:"buyer",action:"BUY",resourceId:campaign.id,principal:buyer,idempotencyKey:"buy:verified-revert",calldata:operation.calldata,intentId:"buy:verified-revert",expectedFunction:"commitToBuy",expectedEvent:"CommitmentMade",expectedEventArgs:operation.expectedEventArgs,purchaseQuote:operation.purchaseQuote});
    const failedHash=ethers.id("canonically-reverted-buy"),failedBlock=ethers.id("block-127");await post(`/api/transactions/${failed.id}/submit`,{txHash:failedHash});
    const failedTx={hash:failedHash,from:buyer,to:config.hubAddress,chainId:BigInt(config.arcChainId),nonce:11,index:0,value:0n,data:failed.calldata,blockNumber:127,blockHash:failedBlock};
    const failedReceipt={hash:failedHash,from:buyer,to:config.hubAddress,status:0,index:0,blockNumber:127,blockHash:failedBlock,logs:[]};
    for(const failure of ["principal","calldata","nonce","canonical-block"]){
      TransactionVerifier.setProvider({getTransaction:async()=>({...failedTx,...(failure==="principal"?{from:other}:failure==="calldata"?{data:"0x1234"}:failure==="nonce"?{nonce:undefined}:{})}),getTransactionReceipt:async()=>failedReceipt,getBlock:async()=>({number:127,timestamp:fixtureTimestamp,hash:failure==="canonical-block"?ethers.id("wrong-block"):failedBlock})});
      assert.equal((await post(`/api/transactions/${failed.id}/recover`,{txHash:failedHash})).status,409);assert.equal(store.db.operations[failed.id].phase,"UNKNOWN","A status-0 response without complete matching proof cannot release the operation");
    }
    TransactionVerifier.setProvider({getTransaction:async()=>failedTx,getTransactionReceipt:async()=>failedReceipt,getBlock:async()=>({number:127,timestamp:fixtureTimestamp,hash:failedBlock})});
    assert.equal((await post(`/api/transactions/${failed.id}/recover`,{txHash:failedHash})).status,409);assert.equal(store.db.operations[failed.id].phase,"REVERTED");assert.equal(store.db.operations[failed.id].errorCode,"TRANSACTION_REVERTED");assert.equal(Object.keys(store.db.orders).length,1);assert.equal(store.db.orders[order.id].committedGross,"105000000");
    assert.equal((await post(`/api/transactions/${failed.id}/ready`,{})).status,409);assert.equal((await post(`/api/transactions/${failed.id}/submit`,{txHash:failedHash})).status,202);assert.equal(store.db.operations[failed.id].phase,"REVERTED");
    nonce=8;units=3;assert.equal((await post("/api/orders/authorize",{...input,idempotencyKey:"buy:after-verified-revert"})).status,200,"A proven reverted call must not permanently block a later fresh purchase");
    console.log("PASS LOCAL_FIXTURE: durable BUY authorization/consent cap/early preference, same-key response loss and concurrency, cross-device pending guard, nonce/principal/rights readiness, Circle exact intent binding, unknown receipt/indexer-first recovery and canonical reverted-proof guards without duplicate order. No live purchase proof.");
  }finally{globalThis.fetch=originalFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error(error instanceof Error?{name:error.name,message:error.message}:"Durable purchase verification failed");process.exitCode=1;});
