import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import path from "node:path";
import fs from "node:fs";
import {ethers} from "ethers";
import {store,TransactionalStore} from "../src/db/store";
import {config} from "../src/config";
import {HUB_ABI} from "../src/contracts/hubAbi";
import {operationRouter} from "../src/routes/operationRoutes";
import {OperationService} from "../src/services/operationService";
import {OperationReplacementService as Replacement} from "../src/services/operationReplacementService";
import {OperationVerificationError} from "../src/services/operationVerificationService";
import {TransactionVerifier,TransactionVerificationError} from "../src/services/transactionVerifier";

async function run(){
 assert.ok(store.filePath.includes("groupdeal-test-"));
 const wallet=ethers.Wallet.createRandom(),other=ethers.Wallet.createRandom(),iface=new ethers.Interface(HUB_ABI);
 Object.assign(config,{arcChainId:5042002,hubAddress:ethers.Wallet.createRandom().address,deploymentBlock:1});
 for(const [id,owner] of [["buyer",wallet],["other",other]] as const)store.db.users[id]={id,email:id+"@fixture.invalid",roles:["buyer"],activeWallet:owner.address,createdAt:0};
 store.save();let sequence=0;
 const blockHash=ethers.id("replacement-canonical-block"),transactions=new Map<string,any>(),receipts=new Map<string,any>();
 let block:any,chainId=BigInt(config.arcChainId),onNetwork:(()=>void)|undefined,blockReads=0;
 const provider={getNetwork:async()=>{onNetwork?.();return {chainId};},getTransaction:async(hash:string)=>transactions.get(hash)||null,getTransactionReceipt:async(hash:string)=>receipts.get(hash)||null,getBlock:async()=>{blockReads++;return structuredClone(block);}};
 TransactionVerifier.setProvider(provider);
 const financial=()=>JSON.stringify({orders:store.db.orders,campaigns:store.db.campaigns,grants:store.db.resourceGrants});
 const initialFinancial=financial();
 async function fixture(){
  const id="replacement:"+(++sequence),calldata=iface.encodeFunctionData("claimBuyerFunds",[1,[sequence]]);
  const operation=OperationService.prepare({userId:"buyer",action:"BUYER_CLAIM",resourceId:"campaign",principal:wallet.address,idempotencyKey:id,intentId:id,calldata,expectedFunction:"claimBuyerFunds",expectedEvent:"FundsClaimed",expectedEventArgs:{claimType:0},stagedEntitlementEncrypted:"fixture-private-stage"});
  const raw=await wallet.signTransaction({chainId:config.arcChainId,to:config.hubAddress,nonce:7,data:calldata,value:0n,gasLimit:200000n,type:2,maxFeePerGas:2n,maxPriorityFeePerGas:1n});
  const signed=ethers.Transaction.from(raw),old=signed.hash!,hash=ethers.id(id+":replacement");
  OperationService.submit("buyer",operation.id,old);
  transactions.set(old,{hash:old,chainId:chainId,from:wallet.address,to:config.hubAddress,nonce:7,data:calldata,value:0n});
  const tx={hash,chainId,from:wallet.address,to:config.hubAddress,nonce:7,data:calldata,value:0n,index:0,blockNumber:20,blockHash};
  const receipt={hash,from:wallet.address,to:config.hubAddress,status:1,index:0,blockNumber:20,blockHash,logs:[] as any[]};transactions.set(hash,tx);receipts.set(hash,receipt);
  block={number:20,hash:blockHash,timestamp:Math.floor(Date.now()/1000),transactions:[hash]};blockReads=0;onNetwork=undefined;
  return {operation,old,hash,raw,tx,receipt};
 }
 const a=await fixture();await Replacement.observe("buyer",a.operation.id,a.old);
 assert.equal(a.operation.broadcastWitnesses?.[0].nonce,7);assert.equal(a.operation.phase,"SUBMITTED");
 transactions.delete(a.old);await Promise.all([Replacement.replace("buyer",a.operation.id,a.old,a.hash),Replacement.replace("buyer",a.operation.id,a.old,a.hash)]);
 assert.equal(a.operation.txHash,a.hash);assert.equal(a.operation.phase,"SUBMITTED");assert.equal(a.operation.replacements?.length,1);assert.equal(a.operation.replacements?.[0].previousTxHash,a.old);assert.equal(a.operation.replacements?.[0].kind,"SAME_CALL");
 await assert.rejects(OperationService.verify("buyer",a.operation.id),(e:unknown)=>e instanceof TransactionVerificationError&&e.code==="VERIFIER_BINDING_INVALID"&&e.status===400);assert.equal(a.operation.phase,"UNKNOWN","Canonical replacement alone cannot claim financial success");assert.equal(financial(),initialFinancial);
 const b=await fixture();transactions.delete(b.old);await Replacement.replace("buyer",b.operation.id,b.old,b.hash,b.raw);assert.equal(b.operation.broadcastWitnesses?.[0].source,"SIGNED_TRANSACTION");
 assert.ok(!JSON.stringify(store.db).includes(b.raw));assert.ok(!JSON.stringify(OperationService.dto(b.operation)).includes("fixture-private-stage"));
 const c=await fixture();c.tx.to=wallet.address;c.tx.data="0x";c.receipt.to=wallet.address;
 await Replacement.replace("buyer",c.operation.id,c.old,c.hash);assert.equal(c.operation.phase,"SUPERSEDED");assert.equal(c.operation.txHash,c.old);assert.equal(c.operation.replacements?.[0].kind,"NONCE_CONSUMED");assert.equal(c.operation.blockNumber,undefined);assert.equal(financial(),initialFinancial);
 await assert.rejects(OperationService.verify("buyer",c.operation.id),/consumed/);assert.throws(()=>OperationService.submit("buyer",c.operation.id,c.old),/consumed/);await Replacement.replace("buyer",c.operation.id,c.old,c.hash);
 // Absence from an RPC or even a pending pool never releases the original intent.
 const absent=await fixture();transactions.delete(absent.old);await assert.rejects(Replacement.replace("buyer",absent.operation.id,absent.old,absent.hash),/immutable intent/);assert.equal(absent.operation.txHash,absent.old);assert.equal(absent.operation.phase,"SUBMITTED");
 const wrongRaw=await other.signTransaction({chainId:config.arcChainId,to:config.hubAddress,nonce:7,data:absent.operation.calldata,value:0n,gasLimit:200000n,gasPrice:1n});
 await assert.rejects(Replacement.observe("buyer",absent.operation.id,absent.old,wrongRaw),/immutable intent/);await assert.rejects(Replacement.observe("buyer",absent.operation.id,absent.old,"0xdead"),/invalid signed/);
 for(const [name,mutate] of [
  ["different nonce",(f:any)=>f.tx.nonce=8],
  ["different principal",(f:any)=>{f.tx.from=other.address;f.receipt.from=other.address;}],
  ["different chain",(f:any)=>f.tx.chainId=1n],
  ["missing receipt",(f:any)=>receipts.delete(f.hash)],
  ["receipt sender",(f:any)=>f.receipt.from=other.address],
  ["receipt index",(f:any)=>f.receipt.index=1],
  ["noncanonical block",()=>block.hash=ethers.id("wrong-block")],
  ["absent block transaction",()=>block.transactions=[ethers.id("different-position")]],
  ["original already mined",(f:any)=>receipts.set(f.old,{status:1})],
  ["reverted logs",(f:any)=>{f.receipt.status=0;f.receipt.logs=[{address:config.hubAddress,transactionHash:f.hash,blockHash,blockNumber:20,transactionIndex:0,index:0,topics:[ethers.id("fixture")],data:"0x"}];}],
  ["duplicate legacy log indices",(f:any)=>{const log={address:config.hubAddress,transactionHash:f.hash,blockHash,blockNumber:20,transactionIndex:0,logIndex:0,topics:[ethers.id("fixture")],data:"0x"};f.receipt.logs=[log,{...log}];}],
  ["foreign consumption",(f:any)=>store.transaction(()=>{store.db.consumedTxHashes[f.hash]={intentId:"other-intent",blockNumber:20,verifiedAt:0};})],
 ] as const){
  const f=await fixture();mutate(f);await assert.rejects(Replacement.replace("buyer",f.operation.id,f.old,f.hash),undefined,name);
  const current=OperationService.owned("buyer",f.operation.id);assert.equal(current.txHash,f.old,name);assert.equal(current.phase,"SUBMITTED",name);assert.equal(current.replacements,undefined,name);assert.equal(financial(),initialFinancial,name);
 }
 const changed=await fixture();const getBlock=provider.getBlock;provider.getBlock=async()=>{const value=await getBlock();return blockReads===2?{...value,hash:ethers.id("changed-block")}:value;};
 await assert.rejects(Replacement.replace("buyer",changed.operation.id,changed.old,changed.hash),/block changed/);provider.getBlock=getBlock;
 const stale=await fixture();onNetwork=()=>{store.transaction(()=>{store.db.operations[stale.operation.id].txHash=stale.hash;});};await assert.rejects(Replacement.observe("buyer",stale.operation.id,stale.old),/changed during observation/);onNetwork=undefined;
 assert.equal(OperationService.owned("buyer",stale.operation.id).broadcastWitnesses,undefined);
 // A slow failed verifier cannot overwrite the canonical nonce-consumed result.
 const race=await fixture();const originalVerify=TransactionVerifier.verifyExpectedTransaction,originalRevert=TransactionVerifier.readRevertedProof;
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);TransactionVerifier.verifyExpectedTransaction=async()=>{await gate;throw new Error("Delayed unavailable receipt");};TransactionVerifier.readRevertedProof=async()=>null;
 const verifying=OperationService.verify("buyer",race.operation.id);race.tx.to=wallet.address;race.receipt.to=wallet.address;race.tx.data="0x";await Replacement.replace("buyer",race.operation.id,race.old,race.hash);release();await assert.rejects(verifying,(e:unknown)=>e instanceof OperationVerificationError&&e.code==="OPERATION_VERIFICATION_UNAVAILABLE"&&e.status===503);assert.equal(OperationService.owned("buyer",race.operation.id).phase,"SUPERSEDED");
 TransactionVerifier.verifyExpectedTransaction=originalVerify;TransactionVerifier.readRevertedProof=originalRevert;
 const app=express();app.use(express.json({limit:"160kb"}));app.use("/api/transactions",operationRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+(server.address() as any).port;
 const headers=(user="buyer")=>({Authorization:"Bearer "+jwt.sign({userId:user},config.jwtSecret,{expiresIn:"2m"}),"Content-Type":"application/json"});
 const post=(id:string,action:string,body:unknown,user="buyer")=>fetch(`${base}/api/transactions/${id}/${action}`,{method:"POST",headers:headers(user),body:JSON.stringify(body)});
 try{
  const f=await fixture();assert.equal((await post(f.operation.id,"observe",{txHash:f.old},"other")).status,409);assert.equal((await post(f.operation.id,"replace",{previousTxHash:f.old,txHash:f.hash,phase:"PROJECTED"})).status,409);
  assert.equal((await post(f.operation.id,"replace",{previousTxHash:f.old,txHash:f.hash})).status,200);const retry=await post(f.operation.id,"replace",{previousTxHash:f.old,txHash:f.hash});assert.equal(retry.status,200);assert.equal((await retry.json() as any).operation.replacements.length,1);
  const history=await fetch(base+"/api/transactions?phase=SUPERSEDED",{headers:headers()}).then(r=>r.json()) as any;assert.ok(history.operations.some((o:any)=>o.id===c.operation.id));assert.ok(!JSON.stringify(history).includes("fixture-private-stage"));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 const filePath=store.filePath;store.save();store.close();const reopened=new TransactionalStore(path.dirname(filePath));try{assert.equal(reopened.db.operations[c.operation.id].phase,"SUPERSEDED");assert.equal(reopened.db.operations[b.operation.id].replacements?.[0].txHash,b.hash);assert.ok(!fs.readFileSync(filePath).includes(Buffer.from(b.raw)));}finally{reopened.close();}
 console.log("PASS LOCAL_FIXTURE: signed/RPC nonce lineage, mined replacement membership, same-call recovery, canonical nonce consumption, null RPC retention, 12 contradictory proofs, repeated block/CAS/verifier race, duplicate HTTP/ACL/schema/history/privacy and SQLite restart. No live financial or wallet journey proof.");
}
run().catch(error=>{console.error(error instanceof Error?{name:error.name,message:error.message}:"Replacement verification failed");process.exitCode=1;});
