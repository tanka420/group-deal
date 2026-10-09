import {enrollFixtureOperator} from './helpers/operatorFixture';
import {SessionService} from '../src/services/sessionService';
import assert from "node:assert/strict";
import express from "express";
import {ethers} from "ethers";
import {store} from "../src/db/store";
import {config} from "../src/config";
import {HUB_ABI} from "../src/contracts/hubAbi";
import {OrderActionService} from "../src/services/orderActionService";
import {operationRouter} from "../src/routes/operationRoutes";
import {IndexerService} from "../src/services/indexerService";
import {TransactionVerifier} from "../src/services/transactionVerifier";
import {CircleWalletService} from "../src/services/circleWalletService";
import {DisputeService} from "../src/services/disputeService";
import {reconciliationProvider} from "./fixtures/reconciliation";
import {eventProvider} from "./fixtures/events";

let failureObservation:unknown;
async function run(){
  assert.ok(store.isIsolated,"Tests must not open the active application database");
  const iface=new ethers.Interface(HUB_ABI),buyer=ethers.Wallet.createRandom().address,seller=ethers.Wallet.createRandom().address,now=Math.floor(Date.now()/1000);
  const controller=ethers.Wallet.createRandom();config.operatorAddress=controller.address;
  config.deploymentBlock=1;
  for(const [id,principal,roles] of [["buyer",buyer,["buyer"]],["seller",seller,["seller"]],["operator",config.operatorAddress,["operator"]],["other",ethers.Wallet.createRandom().address,["buyer"]]] as const){store.db.users[id]={id,email:id+"@fixture.invalid",activeWallet:principal,roles:[...roles],createdAt:0,circleUserId:'fixture-circle-'+id,circleWallet:{address:principal,walletId:'fixture-wallet-'+id,blockchain:'ARC-TESTNET'}};store.db.userByCircleId['fixture-circle-'+id]=id;store.db.userByWallet[principal.toLowerCase()]=id;}
  store.db.campaigns.stable={id:"stable",onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,sellerId:"seller",sellerPayoutWallet:seller,status:"FINALIZED",termsHash:ethers.id("order-action-terms"),finalizedAt:now-200,deliverySlaSeconds:100,deliveryContentTemplate:"private-template-preserved"} as any;
  for(let n=1;n<=5;n++)store.db.orders["order-"+n]={id:"order-"+n,onchainOrderId:n,campaignId:"stable",chainId:config.arcChainId,hubAddress:config.hubAddress,buyerAccountId:"buyer",buyerPrincipal:buyer,quantity:1,lockedUnitPrice:"100000000",committedGross:"100000000",rebateAllocated:"10000000",buyerRefundAllocated:n===5?"5000000":"0",sellerAllocated:n===5?"10000000":"0",buyerClaimedAmount:"0",sellerClaimedAmount:"0",isEarlySupporter:false,earlyRebateValue:"0",deliveryStatus:n===3?"PENDING":n===5?"DISPUTED":"DELIVERED",deliveryTimestamp:n===4?now-172801:now-10,deliveredEntitlementEncrypted:"private-entitlement-preserved",txHash:ethers.id("commit-"+n)} as any;
  store.db.syncState={lastIndexedBlock:4,lastSyncTimestamp:0};store.save();
  const tokens=new Map(Object.keys(store.db.users).map(id=>[id,SessionService.issue(store.db.users[id])]));
  const enrollment=await enrollFixtureOperator("operator",SessionService.authenticate(tokens.get("operator")!),{wallet:controller,chainId:config.arcChainId});
  const truth=structuredClone(store.db),canonical=reconciliationProvider(truth,500000000n,5);
  let stale=false,changed=false,reads=0,deny=false,wrongOrder=false,wrongChain=false;
  const provider={...canonical,getNetwork:async()=>({chainId:wrongChain?1n:BigInt(config.arcChainId)}),getBlock:async(n:number)=>({number:n,hash:changed&&++reads%2===0?ethers.id("changed-block"):ethers.id("block-"+n),timestamp:stale?now-121:now}),call:async(tx:any)=>{
    assert.equal(tx.blockTag,5);const parsed=iface.parseTransaction({data:tx.data})!;
    if(["confirmReceipt","openDispute","claimDeliveryBreach","settleUndisputedOrder","resolveDispute"].includes(parsed.name)){
      if(deny)throw new Error("Contract capability/window guard");
      const order=truth.orders["order-"+parsed.args[1]],principal=parsed.name==="resolveDispute"?config.operatorAddress:parsed.name==="settleUndisputedOrder"?seller:buyer;assert.equal(tx.from,ethers.getAddress(principal));assert.equal(order.campaignId,"stable");
      if(parsed.name==="resolveDispute")assert.equal(parsed.args[2]+parsed.args[3],BigInt(order.committedGross)-BigInt(order.rebateAllocated)-BigInt(order.buyerRefundAllocated)-BigInt(order.sellerAllocated));
      return iface.encodeFunctionResult(parsed.name,[]);
    }
    const result=await canonical.call(tx);
    if(wrongOrder&&parsed.name==="getOrderDetails"){const [order]=iface.decodeFunctionResult(parsed.name,result),tuple=Array.from(order);tuple[0]=999n;return iface.encodeFunctionResult(parsed.name,[tuple]);}
    return result;
  }};
  OrderActionService.setProvider(provider);
  const app=express();app.use(express.json());app.use("/api/transactions",operationRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const base="http://127.0.0.1:"+(server.address() as any).port;
  const request=(path:string,body:any|undefined,user="buyer")=>fetch(base+"/api/transactions"+path,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+tokens.get(user)!,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})}).then(async response=>{const body=response.status>=400?await response.clone().json().catch(()=>({})):{};const code=typeof body.error==='string'?body.error.match(/^(?:[A-Z][A-Z_]{2,80})(?=:|$)/)?.[0]:undefined;failureObservation={route:path.split('/').at(-1),status:response.status,code:body.code??code??null};return response;});
  const input={orderId:"order-1",idempotencyKey:"order:dispute-fixture",intent:{action:"DISPUTE",reason:"Private issue description",evidenceUrls:["https://fixture.invalid/private-evidence"]}};
  const logs:any[]=[],calls:Record<string,any>={};let block=6;
  const nativeFetch=globalThis.fetch,nativeNonceReads:string[]=[];
  // Independent fixture chain replies to the production raw RPC adapter. PROJECTED is never a release proof.
  globalThis.fetch=(async(url:any,options:any)=>{if(String(url).startsWith('http://127.0.0.1:'))return nativeFetch(url,options);assert.equal(options.method,'POST');const batch=JSON.parse(options.body),chain=eventProvider(logs,calls,()=>now),head=Math.max(5,...logs.map(log=>log.blockNumber))+1;assert.ok(Array.isArray(batch));const replies=await Promise.all(batch.map(async(req:any)=>{let result:any;const args=req.params;if(req.method==='eth_chainId')result=ethers.toQuantity(config.arcChainId);else if(req.method==='eth_getTransactionByHash'){const tx=await chain.getTransaction(args[0]);result=tx?{hash:tx.hash,from:tx.from,to:tx.to,input:tx.data,value:ethers.toQuantity(tx.value),nonce:ethers.toQuantity(tx.nonce),chainId:ethers.toQuantity(tx.chainId),blockNumber:ethers.toQuantity(tx.blockNumber),blockHash:tx.blockHash}:null;}else if(req.method==='eth_getTransactionReceipt'){const receipt=await chain.getTransactionReceipt(args[0]);result=receipt?{transactionHash:receipt.hash,from:receipt.from,to:receipt.to,status:ethers.toQuantity(receipt.status),blockNumber:ethers.toQuantity(receipt.blockNumber),blockHash:receipt.blockHash,logs:receipt.logs}:null;}else if(req.method==='eth_getBlockByNumber'){const number=['latest','finalized'].includes(args[0])?head:Number(BigInt(args[0]));assert.ok(Number.isSafeInteger(number)&&number>=0&&number<=head);const block=await chain.getBlock(number);result={number:ethers.toQuantity(number),hash:block.hash,timestamp:ethers.toQuantity(block.timestamp)};}else{assert.equal(req.method,'eth_getTransactionCount');assert.match(args[1],/^0x[0-9a-f]+$/);nativeNonceReads.push(args[1]);const at=Number(BigInt(args[1])),consumed=logs.filter(log=>log.blockNumber<=at&&calls[log.transactionHash]?.from.toLowerCase()===String(args[0]).toLowerCase()).map(log=>calls[log.transactionHash].nonce);result=ethers.toQuantity(consumed.length?Math.max(...consumed)+1:0);}return{jsonrpc:'2.0',id:req.id,result}}));return new Response(JSON.stringify(replies),{headers:{'Content-Type':'application/json'}})}) as typeof fetch;
  async function proof(operation:any,args:unknown[]){
    const hash=ethers.id(operation.id),log={...iface.encodeEventLog(iface.getEvent(operation.expectedEvent)!,args),address:config.hubAddress,transactionHash:hash,blockNumber:block,blockHash:ethers.id("block-"+block++),transactionIndex:0,index:0};logs.push(log);calls[hash]={from:operation.principal,data:operation.calldata,nonce:Object.values(calls).filter(tx=>tx.from.toLowerCase()===operation.principal.toLowerCase()).length};
    const chain=eventProvider(logs,calls,()=>now);TransactionVerifier.setProvider(chain);IndexerService.setProvider(chain);return hash;
  }
  try{
    for(const failure of ["stale","changed","capability","wrong-order","wrong-chain"]){stale=failure==="stale";changed=failure==="changed";deny=failure==="capability";wrongOrder=failure==="wrong-order";wrongChain=failure==="wrong-chain";reads=0;const unavailable=await request("/orders/prepare",input);assert.equal(unavailable.status,503);assert.equal((await unavailable.json() as any).code,"OPERATION_QUOTE_UNAVAILABLE");assert.equal(Object.keys(store.db.operations).length,0);}
    stale=changed=deny=wrongOrder=wrongChain=false;
    for(const intent of [{action:"DISPUTE",reason:" ",evidenceUrls:[]},{action:"DISPUTE",reason:"Valid",evidenceUrls:["javascript:alert(1)"]},{action:"RESOLVE",buyerPercent:50.5,notes:"Valid"},{action:"CONFIRM",extra:"spoof"}])assert.equal((await request("/orders/prepare",{...input,intent})).status,400);
    assert.equal((await request("/orders/prepare",input,"other")).status,403);
    store.db.orders["order-1"].committedGross="9";store.save();
    const prepared=await Promise.all([request("/orders/prepare",input),request("/orders/prepare",input)]);assert.ok(prepared.every(r=>r.status===200));const responses=await Promise.all(prepared.map(r=>r.json())) as any[];const dispute=responses[0].operation;
    assert.equal(responses[1].operation.id,dispute.id);assert.equal(dispute.orderQuote.remainingGross,"90000000");assert.equal(store.db.orders["order-1"].committedGross,"9");
    for(const response of responses){assert.equal(response.operation.stagedOrderMetadataEncrypted,undefined);assert.ok(!JSON.stringify(response).includes(input.intent.reason));assert.ok(!JSON.stringify(response).includes(input.intent.evidenceUrls[0]));}
    assert.ok(!store.db.operations[dispute.id].stagedOrderMetadataEncrypted!.includes(input.intent.reason));
    assert.equal((await request("/orders/prepare",{...input,intent:{...input.intent,reason:"Changed reason"}})).status,409);
    assert.equal((await request("/orders/prepare",{...input,idempotencyKey:"order:different-key",intent:{action:"CONFIRM"}})).status,409);
    assert.throws(()=>CircleWalletService.validateTransactionPolicy(config.hubAddress,dispute.calldata,{type:"OPEN_DISPUTE",campaignId:"1",orderId:"1"},"buyer"),/reserved operation/);
    store.db.users.buyer.activeWallet=ethers.Wallet.createRandom().address;store.save();assert.equal((await request("/"+dispute.id+"/ready",{})).status,409);store.db.users.buyer.activeWallet=buyer;store.save();
    deny=true;assert.equal((await request("/"+dispute.id+"/ready",{})).status,409);deny=false;
    store.db.orders["order-1"].onchainOrderId=999;store.save();assert.equal((await request("/"+dispute.id+"/ready",{})).status,409);store.db.orders["order-1"].onchainOrderId=1;store.save();
    const ready=await Promise.all([request("/"+dispute.id+"/ready",{}),request("/"+dispute.id+"/ready",{})]);assert.deepEqual(ready.map(r=>r.status).sort(),[200,409]);assert.equal((await ready.find(r=>r.status===200)!.json() as any).campaign,undefined);
    assert.doesNotThrow(()=>CircleWalletService.validateTransactionPolicy(config.hubAddress,dispute.calldata,{type:"OPEN_DISPUTE",campaignId:"1",orderId:"1"},"buyer"));
    const circle=CircleWalletService as any,originalClient=circle.client,keys:string[]=[];
    try{
      circle.client={getUserStatus:async()=>({data:{id:'fixture-circle-buyer',status:'ENABLED'}}),createUserTransactionContractExecutionChallenge:async(body:any)=>{keys.push(body.idempotencyKey);return {data:{challengeId:"fixture-challenge"}};}};
      const challenge={userId:"buyer",userToken:"fixture-identity-token-for-actual-guard",walletId:"fixture-wallet-buyer",contractAddress:config.hubAddress,callData:dispute.calldata,intent:{type:"OPEN_DISPUTE" as const,campaignId:"1",orderId:"1"},operationId:`circle:${dispute.id}`};
      await assert.rejects(CircleWalletService.createContractChallenge({...challenge,operationId:"circle:another-device-key"}),/must match the reserved/);assert.equal(keys.length,0);
      const challenges=await Promise.all([CircleWalletService.createContractChallenge(challenge),CircleWalletService.createContractChallenge(challenge)]);assert.ok(challenges.every(c=>c.challengeId==="fixture-challenge"));assert.equal(new Set(keys).size,1);
    }finally{circle.client=originalClient;}
    const hash=ethers.id(dispute.id);await request("/"+dispute.id+"/submit",{txHash:hash});TransactionVerifier.setProvider({getTransaction:async()=>null,getTransactionReceipt:async()=>null});
    assert.equal((await request("/"+dispute.id+"/recover",{})).status,409);assert.equal(store.db.operations[dispute.id].phase,"UNKNOWN");assert.equal((await request("/"+dispute.id+"/ready",{})).status,409);
    store.db.orders["order-1"].committedGross="100000000";store.save();
    await proof(dispute,[1,1,buyer,ethers.keccak256(ethers.toUtf8Bytes(input.intent.reason))]);
    await IndexerService.processLogs(logs);assert.equal(store.db.orders["order-1"].deliveryStatus,"DISPUTED");assert.equal(store.db.orders["order-1"].disputeReason,undefined);
    const encrypted=store.db.operations[dispute.id].stagedOrderMetadataEncrypted!;store.db.operations[dispute.id].stagedOrderMetadataEncrypted=encrypted.slice(0,-2)+"ff";store.save();assert.equal((await request("/"+dispute.id+"/recover",{})).status,409);assert.equal(store.db.operations[dispute.id].phase,"RECEIPT_VERIFIED");
    store.db.operations[dispute.id].stagedOrderMetadataEncrypted=encrypted;store.save();
    assert.equal((await request("/"+dispute.id+"/recover",{})).status,200);assert.equal(store.db.orders["order-1"].disputeReason,input.intent.reason);assert.equal(store.db.orders["order-1"].deliveredEntitlementEncrypted,"private-entitlement-preserved");
    assert.equal((await request("/"+dispute.id+"/recover",{})).status,200);assert.equal(store.db.supportMessages["order-1"].length,1);
    const history=await request("?action=DISPUTE",undefined);assert.equal(history.status,200);assert.ok(!JSON.stringify(await history.json()).includes(encrypted));assert.equal((await request("/"+dispute.id,undefined,"other")).status,404);
    const cases=[{orderId:"order-2",intent:{action:"CONFIRM"},user:"buyer",event:[1,2,90000000],status:"CONFIRMED"},{orderId:"order-3",intent:{action:"BREACH"},user:"buyer",event:[1,3,90000000],status:"BREACHED_REFUNDED"},{orderId:"order-4",intent:{action:"SETTLE"},user:"seller",event:[1,4,90000000],status:"CONFIRMED"},{orderId:"order-5",intent:{action:"RESOLVE",buyerPercent:37,notes:"Private resolution note"},user:"operator",event:[1,5,27750000,47250000],status:"RESOLVED"}];
    for(const item of cases){
      if(item.intent.action==="RESOLVE"){store.db.orders[item.orderId].rebateAllocated="1";store.db.orders[item.orderId].committedGross="2";store.save();}
      const response=await request("/orders/prepare",{orderId:item.orderId,intent:item.intent,idempotencyKey:"order:action-"+item.intent.action},item.user);assert.equal(response.status,200);const operation=(await response.json() as any).operation;
      if(item.intent.action==="RESOLVE"){assert.equal(operation.orderQuote.remainingGross,"75000000");assert.equal(operation.orderQuote.buyerShare,"27750000");assert.equal(operation.orderQuote.sellerShare,"47250000");store.db.orders[item.orderId].committedGross="100000000";store.db.orders[item.orderId].rebateAllocated="10000000";store.save();}
      assert.equal((await request("/"+operation.id+"/ready",{},item.user)).status,200);const receipt=await proof(operation,item.event);
      assert.equal((await request("/"+operation.id+"/recover",{txHash:receipt},item.user)).status,200);assert.equal(store.db.operations[operation.id].phase,"PROJECTED");assert.equal(store.db.orders[item.orderId].deliveryStatus,item.status);
      if(item.intent.action==="RESOLVE"){
        const tracking=store.readOperationTrackingState({actorId:item.user,operationId:operation.id});assert.equal(tracking.targetDirty,false,'Committed dispute projection must leave the operation serialization clean for repeat acknowledgement');const projected=store.db.orders[item.orderId];assert.equal(projected.buyerRefundAllocated,"32750000");assert.equal(projected.sellerAllocated,"57250000");assert.equal(BigInt(projected.rebateAllocated)+BigInt(projected.buyerRefundAllocated)+BigInt(projected.sellerAllocated),100000000n);
        assert.equal((await request("/"+operation.id+"/recover",{txHash:receipt},item.user)).status,200);assert.equal(projected.buyerRefundAllocated,"32750000");assert.equal(projected.sellerAllocated,"57250000");
      }
    }
    assert.equal(store.db.orders["order-5"].disputeResolution?.notes,"Private resolution note");
    assert.ok(!JSON.stringify(store.db.auditLogs).includes(input.intent.reason));assert.ok(!JSON.stringify(store.db.auditLogs).includes("Private resolution note"));
    // Legacy metadata recovery is also governed by the successful receipt, never a corrupt DB sum.
    const legacy=store.db.orders["order-1"];legacy.committedGross="3";legacy.rebateAllocated="2";store.save();
    const legacyHash=ethers.id("legacy-resolution"),legacyData=iface.encodeFunctionData("resolveDispute",[1,1,40000000,50000000]);
    const log={...iface.encodeEventLog(iface.getEvent("DisputeResolved")!,[1,1,40000000,50000000]),address:config.hubAddress,transactionHash:legacyHash,blockNumber:block,blockHash:ethers.id("block-"+block),transactionIndex:0,index:0};logs.push(log);calls[legacyHash]={from:config.operatorAddress,data:legacyData,nonce:Object.values(calls).filter(tx=>tx.from.toLowerCase()===config.operatorAddress.toLowerCase()).length};const chain=eventProvider(logs,calls,()=>now);TransactionVerifier.setProvider(chain);IndexerService.setProvider(chain);
    await DisputeService.resolveDispute("operator",legacy.id,"040000000","050000000","Verified legacy receipt",legacyHash,enrollment.proof);assert.equal(legacy.deliveryStatus,"RESOLVED");
    assert.equal(store.verifyAuditLogIntegrity().valid,true);assert.ok(nativeNonceReads.length>=3,'Sequential same-wallet ready must use fresh pinned-block nonce RPC proof');const loans=Object.values(store.db.signerReservations??{});assert.ok(loans.some(r=>r.phase==='RELEASED'&&r.completion),'Finalized completed owner leaves nonce history');assert.equal(loans.filter(r=>r.phase==='ACTIVE'&&r.principal===buyer.toLowerCase()).length,1);
    console.log("PASS LOCAL_FIXTURE: durable order actions; fixed-block capability/chain-only unallocated split, corrupt DB independence, atomic duplicate prepare and one signature, pinned roles/principals, encrypted private stage/DTO exclusion, Circle exact reservation, UNKNOWN recovery, indexer-first metadata retry, confirm/breach/settle/resolve receipts and private audit digests. No live wallet/provider acceptance.");
  }finally{globalThis.fetch=nativeFetch;OrderActionService.setProvider(undefined);await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error(error instanceof Error?{name:error.name,message:error.message,failureObservation,location:error.stack?.split(/\r?\n/).find(line=>line.includes("order_action.test.ts"))}:"Order action verification failed");process.exitCode=1;});
