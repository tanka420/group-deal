import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import path from "node:path";
import {ethers} from "ethers";
import {config} from "../src/config";
import {store,TransactionalStore} from "../src/db/store";
import {deriveCampaignIdentity} from "../src/utils/crypto";
import {HUB_ABI} from "../src/contracts/hubAbi";
import {OperationService} from "../src/services/operationService";
import {BuyExpiryService} from "../src/services/buyExpiryService";
import {TransactionVerifier} from "../src/services/transactionVerifier";
import {OperationReplacementService} from "../src/services/operationReplacementService";
import {CampaignEditorService} from "../src/services/campaignEditorService";
import {operationRouter} from "../src/routes/operationRoutes";
import {orderRouter} from "../src/routes/orderRoutes";
import {reviewedProductVerified} from "./fixtures/product";

const types={BuyAuthorization:[{name:"chainId",type:"uint256"},{name:"hubContract",type:"address"},{name:"campaignId",type:"uint256"},{name:"termsHash",type:"bytes32"},{name:"campaignIdentity",type:"bytes32"},{name:"buyerWallet",type:"address"},{name:"nonce",type:"uint256"},{name:"maxQuantity",type:"uint256"},{name:"deadline",type:"uint256"}]};
async function run(){
 assert.ok(store.filePath.includes("groupdeal-test-"));const realFetch=globalThis.fetch,signer=ethers.Wallet.createRandom(),buyer=ethers.Wallet.createRandom(),other=ethers.Wallet.createRandom(),iface=new ethers.Interface(HUB_ABI),now=Math.floor(Date.now()/1000);
 Object.assign(config,{arcChainId:5042002,hubAddress:ethers.Wallet.createRandom().address,arcRpcUrl:"https://expiry-fixture.invalid",deploymentBlock:1,authorizedSignerPrivateKey:signer.privateKey});
 const product=await reviewedProductVerified("seller",ethers.Wallet.createRandom().address);for(const [id,address] of [["buyer",buyer.address],["other",other.address]])store.db.users[id]={id,email:id+"@fixture.invalid",roles:["buyer"],activeWallet:address,createdAt:0};
 const campaign=CampaignEditorService.saveDraft("seller",{title:"Expiry purchase fixture",description:"Actual fixture document",thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"1"},{threshold:10,priceUSDC:"0.8"}],maxPerAccount:10,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:"FILE_LINK"});
 Object.assign(campaign,{status:"ACTIVE",onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,startTime:now-1000,endTime:now+3600,productSnapshot:product.snapshot});campaign.termsHash=CampaignEditorService.termsHash(campaign);
 const identity=deriveCampaignIdentity("buyer",campaign.id),quoteHash=ethers.id("expiry-quote-100"),headHash=ethers.id("expiry-head-101"),terms=structuredClone(campaign);
 let sequence=0,mode="valid",blocks=0,afterRead:(()=>void)|undefined,currentNonce=7n,originalNonce=7n,deadline=now-20,headTimestamp=now;
 const tuple=(fn:string,record:any)=>iface.getFunction(fn)!.outputs.map(c=>record[c.name]??(c.type==="address"?ethers.ZeroAddress:c.type==="bytes32"?ethers.ZeroHash:c.type==="bool"?false:0));
 const requests:{method:string;blockTag?:string;function?:string}[]=[];
 globalThis.fetch=(async(url,options)=>{
  if(String(url).startsWith("http://127.0.0.1"))return realFetch(url,options);
  if(mode==="offline")return new Response("",{status:503});
  const batch=JSON.parse(String(options?.body));const replies=batch.map((request:any)=>{
   requests.push({method:request.method});let result:any;
   if(request.method==="eth_chainId")result=mode==="wrong-chain"?"0x1":"0x4cef52";
   else if(request.method==="eth_blockNumber")result="0x65";
   else if(request.method==="eth_getBlockByNumber"){
    const historical=request.params[0]==="0x64";if(!historical)blocks++;
    result={number:request.params[0],hash:historical?quoteHash:mode==="changed-block"&&blocks===2?ethers.id("changed-head"):headHash,timestamp:ethers.toQuantity(historical?now-300:mode==="stale"?now-600:mode==="future"?now+600:mode==="changed-time"&&blocks===2?headTimestamp+1:headTimestamp)};
   }else if(request.method==="eth_getTransactionReceipt")result=mode==="receipt"?{status:"0x0",blockNumber:"0x65"}:null;
   else{
    assert.equal(request.method,"eth_call");assert.equal(request.params[0].to.toLowerCase(),config.hubAddress.toLowerCase());assert.ok(["0x64","0x65"].includes(request.params[1]),"All reads must be pinned to the quote or expiry block");
    const parsed=iface.parseTransaction({data:request.params[0].data})!;requests.at(-1)!.blockTag=request.params[1];requests.at(-1)!.function=parsed.name;
    switch(parsed.name){
     case "identityNonces":result=iface.encodeFunctionResult(parsed.name,[request.params[1]==="0x64"?originalNonce:currentNonce]);break;
     case "campaignIdentityPrincipals":result=iface.encodeFunctionResult(parsed.name,[mode==="principal"?other.address:buyer.address]);break;
     case "authorizedSigner":result=iface.encodeFunctionResult(parsed.name,[signer.address]);break;
     case "campaignTerms":result=iface.encodeFunctionResult(parsed.name,tuple(parsed.name,{...terms,termsHash:mode==="terms"?ethers.id("different-terms"):terms.termsHash,metric:0}));break;
     case "campaignStates":result=iface.encodeFunctionResult(parsed.name,tuple(parsed.name,{...terms,status:1,totalUnitsCommitted:2,currentUnlockedTier:0}));break;
     case "getCampaignTiers":result=iface.encodeFunctionResult(parsed.name,[terms.tiers]);break;
     case "buyerUnitsCommitted":result=iface.encodeFunctionResult(parsed.name,[2]);break;
     default:throw new Error("Unexpected expiry fixture call");
    }afterRead?.();
   }return {jsonrpc:"2.0",id:request.id,result};
  });return new Response(JSON.stringify(replies),{headers:{"Content-Type":"application/json"}});
 }) as typeof fetch;
 async function make(options:{signedNonce?:number;signedDeadline?:number;issuer?:ethers.HDNodeWallet;hash?:boolean;phase?:"PREPARED"|"AWAITING_SIGNATURE"|"SUBMITTED"|"RECEIPT_VERIFIED"}={}){
  mode="valid";blocks=0;afterRead=undefined;currentNonce=7n;originalNonce=7n;deadline=now-20;headTimestamp=now;
  const key="expiry:"+(++sequence),value={chainId:config.arcChainId,hubContract:config.hubAddress,campaignId:1,termsHash:terms.termsHash,campaignIdentity:identity,buyerWallet:buyer.address,nonce:options.signedNonce??7,maxQuantity:3,deadline:options.signedDeadline??deadline};
  const signature=await (options.issuer||signer).signTypedData({name:"GroupDealHub",version:"1",chainId:config.arcChainId,verifyingContract:config.hubAddress},types,value);
  const calldata=iface.encodeFunctionData("commitToBuy",[1,identity,1,false,3,deadline,signature]);
  const operation=OperationService.prepare({userId:"buyer",action:"BUY",resourceId:campaign.id,principal:buyer.address,idempotencyKey:key,intentId:key,calldata,expectedFunction:"commitToBuy",expectedEvent:"CommitmentMade",expectedEventArgs:{campaignId:1,campaignIdentity:identity,buyerPrincipal:buyer.address,quantity:1},purchaseQuote:{blockNumber:100,blockHash:quoteHash,lockedUnitPrice:"1000000",commitmentAmount:"1000000",maxGrossAmount:"1000000",unitsAlreadyBought:"2",remainingInventory:"98",authorizationNonce:7,termsHash:terms.termsHash}});
  if(options.hash)OperationService.submit("buyer",operation.id,ethers.id(key));if(options.phase)store.transaction(()=>{operation.phase=options.phase!;});return operation;
 }
 const financial=()=>JSON.stringify({campaigns:store.db.campaigns,orders:store.db.orders,grants:store.db.resourceGrants}),initialFinancial=financial();
 try{
  const pending=await make({phase:"AWAITING_SIGNATURE"});headTimestamp=deadline;
  await assert.rejects(BuyExpiryService.expire("buyer",pending.id),/has not expired/);assert.equal(pending.phase,"AWAITING_SIGNATURE","Local clock alone cannot expire an authorization at its inclusive chain deadline");
  headTimestamp=now;store.db.rights[product.rights.id].status="REVOKED";await BuyExpiryService.expire("buyer",pending.id);store.db.rights[product.rights.id].status="APPROVED";
  assert.equal(pending.phase,"EXPIRED");assert.equal(pending.authorizationExpiry?.authorizationNonce,7);assert.equal(pending.authorizationExpiry?.authorizationSigner,signer.address);assert.equal(pending.blockNumber,undefined);assert.equal(financial(),initialFinancial);
  const audits=store.db.auditLogs.length;await BuyExpiryService.expire("buyer",pending.id);assert.equal(store.db.auditLogs.length,audits);assert.ok(!JSON.stringify(store.db.auditLogs).includes(iface.decodeFunctionData("commitToBuy",pending.calldata).authSignature));
  // A late wallet acknowledgement is retained without reopening the expired intent.
  const lateHash=ethers.id("late-broadcast-after-expiry");OperationService.submit("buyer",pending.id,lateHash);assert.equal(pending.phase,"EXPIRED");assert.equal(pending.txHash,lateHash);
  TransactionVerifier.setProvider({getTransaction:async()=>null,getTransactionReceipt:async()=>null});await assert.rejects(OperationService.verify("buyer",pending.id));assert.equal(pending.phase,"EXPIRED");
  const failureTx={hash:lateHash,chainId:BigInt(config.arcChainId),from:buyer.address,to:config.hubAddress,nonce:12,index:0,blockNumber:102,blockHash:ethers.id("expiry-reverted-block"),data:pending.calldata,value:0n};
  TransactionVerifier.setProvider({getTransaction:async()=>failureTx,getTransactionReceipt:async()=>({hash:lateHash,from:buyer.address,to:config.hubAddress,status:0,index:0,blockNumber:102,blockHash:failureTx.blockHash,logs:[]}),getBlock:async()=>({number:102,hash:failureTx.blockHash,timestamp:now})});
  await assert.rejects(OperationService.verify("buyer",pending.id),/TRANSACTION_REVERTED/);assert.equal(pending.phase,"REVERTED");assert.ok(pending.authorizationExpiry);assert.equal(financial(),initialFinancial);
  // A late same-call replacement must not reopen a proven expired BUY while receipt recovery is pending.
  const late=await make();await BuyExpiryService.expire("buyer",late.id);const originalHash=ethers.id("expired-original"),replacementHash=ethers.id("expired-replacement");OperationService.submit("buyer",late.id,originalHash);
  const replacementBlock=ethers.id("expired-replacement-block"),originalTx={hash:originalHash,from:buyer.address,to:config.hubAddress,chainId:BigInt(config.arcChainId),nonce:7,value:0n,data:late.calldata};
  const replacementTx={...originalTx,hash:replacementHash,index:0,blockNumber:102,blockHash:replacementBlock},replacementReceipt={hash:replacementHash,from:buyer.address,to:config.hubAddress,status:0,index:0,blockNumber:102,blockHash:replacementBlock,logs:[]};
  TransactionVerifier.setProvider({getNetwork:async()=>({chainId:BigInt(config.arcChainId)}),getTransaction:async(hash:string)=>hash===originalHash?originalTx:replacementTx,getTransactionReceipt:async(hash:string)=>hash===originalHash?null:replacementReceipt,getBlock:async()=>({number:102,hash:replacementBlock,timestamp:now,transactions:[replacementHash]})});
  await OperationReplacementService.replace("buyer",late.id,originalHash,replacementHash);assert.equal(late.phase,"EXPIRED","A reverted replacement cannot reset expired authorization to SUBMITTED");assert.equal(late.txHash,replacementHash);assert.ok(late.authorizationExpiry);await assert.rejects(OperationService.verify("buyer",late.id),/TRANSACTION_REVERTED/);assert.equal(late.phase,"REVERTED");
  const during=await make({hash:true});let canonicalReads=0;const duringOld=during.txHash!,duringNew=ethers.id("expiry-cas-replacement"),duringTx={...originalTx,data:during.calldata,hash:duringNew,index:0,blockNumber:102,blockHash:replacementBlock};
  TransactionVerifier.setProvider({getNetwork:async()=>({chainId:BigInt(config.arcChainId)}),getTransaction:async(hash:string)=>hash===duringOld?{...originalTx,hash:duringOld,data:during.calldata}:duringTx,getTransactionReceipt:async(hash:string)=>hash===duringOld?null:{...replacementReceipt,hash:duringNew,status:1},getBlock:async()=>{if(++canonicalReads===2)await BuyExpiryService.expire("buyer",during.id);return {number:102,hash:replacementBlock,timestamp:now,transactions:[duringNew]};}});
  await assert.rejects(OperationReplacementService.replace("buyer",during.id,duringOld,duringNew),/contradicts verified BUY expiry/);assert.equal(OperationService.owned("buyer",during.id).phase,"EXPIRED");assert.equal(OperationService.owned("buyer",during.id).txHash,duringOld);assert.equal(financial(),initialFinancial);
  for(const name of ["offline","wrong-chain","stale","future","terms","principal","changed-block","changed-time","receipt","nonce-used","nonce-lower","quote-nonce","quote-hash","signature-nonce","signature-deadline","signature-issuer","verified-receipt","quote-future"]){
   const operation=await make({hash:name==="receipt",phase:name==="verified-receipt"?"RECEIPT_VERIFIED":"AWAITING_SIGNATURE",...(name==="signature-nonce"?{signedNonce:6}:name==="signature-deadline"?{signedDeadline:deadline-1}:name==="signature-issuer"?{issuer:other}:{})});
   mode=name;if(name==="nonce-used")currentNonce=8n;if(name==="nonce-lower")currentNonce=6n;if(name==="quote-nonce")originalNonce=6n;if(name==="quote-hash")operation.purchaseQuote!.blockHash=ethers.id("wrong-quote");if(name==="quote-future")operation.purchaseQuote!.blockNumber=102;
   const phase=operation.phase;await assert.rejects(BuyExpiryService.expire("buyer",operation.id),undefined,name);assert.equal(OperationService.owned("buyer",operation.id).phase,phase,name);assert.equal(OperationService.owned("buyer",operation.id).authorizationExpiry,undefined,name);assert.equal(financial(),initialFinancial,name);
   // Complete only this isolated negative fixture, so another fixture can prepare independently.
   store.transaction(()=>{store.db.operations[operation.id].phase="REVERTED";});
  }
  const race=await make({phase:"AWAITING_SIGNATURE"});afterRead=()=>{OperationService.submit("buyer",race.id,ethers.id("concurrent-late-broadcast"));};await assert.rejects(BuyExpiryService.expire("buyer",race.id),/changed during expiry/);afterRead=undefined;assert.equal(OperationService.owned("buyer",race.id).phase,"SUBMITTED");assert.equal(OperationService.owned("buyer",race.id).authorizationExpiry,undefined);
  store.transaction(()=>{store.db.operations[race.id].phase="REVERTED";});
  // Proof uses the historical public chain signer, even if the current signing key rotates.
  const rotation=await make({phase:"AWAITING_SIGNATURE"});config.authorizedSignerPrivateKey=other.privateKey;await BuyExpiryService.expire("buyer",rotation.id);config.authorizedSignerPrivateKey=signer.privateKey;assert.equal(rotation.phase,"EXPIRED");
  const app=express();app.use(express.json());app.use("/api/transactions",operationRouter);app.use("/api/orders",orderRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+(server.address() as any).port;
  const headers=(user="buyer")=>({Authorization:"Bearer "+jwt.sign({userId:user},config.jwtSecret,{expiresIn:"2m"}),"Content-Type":"application/json"});const post=(route:string,body:unknown,user="buyer")=>fetch(base+route,{method:"POST",headers:headers(user),body:JSON.stringify(body)});
  try{
   const owned=await make({phase:"AWAITING_SIGNATURE"});const input={campaignId:campaign.id,quantity:1,walletAddress:buyer.address,requireEarlySlot:false,maxGrossAmount:"1000000",idempotencyKey:"buy:after-expiry"};
   const beforePendingRequests=requests.length,pending=await post("/api/orders/authorize",input);assert.equal(pending.status,409);assert.equal((await pending.json() as any).code,"OPERATION_PREPARATION_PENDING");assert.equal(requests.length,beforePendingRequests,"Pending intent must deny before issuing another authorization");assert.equal((await post(`/api/transactions/${owned.id}/expire`,{},"other")).status,409);assert.equal((await post(`/api/transactions/${owned.id}/expire`,{phase:"EXPIRED"})).status,409);
   const pair=await Promise.all([post(`/api/transactions/${owned.id}/expire`,{}),post(`/api/transactions/${owned.id}/expire`,{})]);assert.deepEqual(pair.map(r=>r.status),[200,200]);assert.equal(OperationService.owned("buyer",owned.id).phase,"EXPIRED");
   assert.equal((await post(`/api/transactions/${owned.id}/ready`,{})).status,409);assert.equal((await post("/api/orders/authorize",input)).status,200,"Fresh quote/key is allowed only after verified authorization expiry");
   const history=await fetch(base+"/api/transactions?phase=EXPIRED",{headers:headers()}).then(r=>r.json()) as any;assert.ok(history.operations.some((o:any)=>o.id===owned.id));assert.ok(history.operations.every((o:any)=>o.authorizationExpiry));assert.equal(financial(),initialFinancial);
   const persisted=OperationService.owned("buyer",owned.id);store.save();const reopened=new TransactionalStore(path.dirname(store.filePath));try{assert.equal(reopened.db.operations[persisted.id].phase,"EXPIRED");assert.deepEqual(reopened.db.operations[persisted.id].authorizationExpiry,persisted.authorizationExpiry);}finally{reopened.close();}
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  assert.ok(requests.every(r=>!['eth_sendTransaction','eth_sendRawTransaction'].includes(r.method)));
  console.log("PASS LOCAL_FIXTURE: historical/current nonce and EIP-712 deadline/signer binding, inclusive deadline, 18 contradictory/outage proofs, receipt/CAS/rotation/late-hash/revert guards, concurrent owned HTTP expiry, fresh quote recovery, filtered history, audit privacy and SQLite restart. No financial projection or live wallet acceptance.");
 }finally{globalThis.fetch=realFetch;store.close();}
}
run().catch(error=>{console.error(error instanceof Error?{name:error.name,message:error.message}:"Expiry verification failed");process.exitCode=1;});
