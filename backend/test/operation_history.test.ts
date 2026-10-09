import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {ethers} from "ethers";
import {store} from "../src/db/store";
import {config} from "../src/config";
import {OperationService} from "../src/services/operationService";
import {operationRouter} from "../src/routes/operationRoutes";
import {HUB_ABI} from "../src/contracts/hubAbi";

async function run(){
  const buyer=ethers.Wallet.createRandom().address,other=ethers.Wallet.createRandom().address,iface=new ethers.Interface(HUB_ABI);
  for(const [id,address] of [["buyer",buyer],["other",other]])store.db.users[id]={id,roles:["buyer"],email:id+"@fixture.invalid",createdAt:0,activeWallet:address};
  store.save();const create=(userId:string,key:string,createdAt:number,resourceId="recent",action:"BUY"|"BUYER_CLAIM"="BUYER_CLAIM")=>{
    const operation=OperationService.prepare({userId,action,resourceId,principal:userId==="buyer"?buyer:other,idempotencyKey:key,intentId:key,calldata:iface.encodeFunctionData("claimBuyerFunds",[1,[1]]),expectedFunction:"claimBuyerFunds",expectedEvent:"FundsClaimed",expectedEventArgs:{claimType:0},stagedEntitlementEncrypted:"fixture-private-stage"});operation.createdAt=createdAt;return operation;
  };
  const old=(()=>{const old=create("buyer","history:old-pending",1,"waiting","BUY");for(let i=0;i<105;i++)create("buyer","history:recent-"+i,100+Math.floor(i/3));create("other","history:other-user",999);return old;})();store.save();
  const app=express();app.use(express.json());app.use("/api/transactions",operationRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+(server.address() as any).port;
  const get=(path:string,user="buyer")=>fetch(base+"/api/transactions"+path,{headers:{Authorization:"Bearer "+jwt.sign({userId:user},config.jwtSecret,{expiresIn:"2m"})}});
  try{
    const initial=await (await get("")).json() as any;assert.equal(initial.operations.length,20);assert.ok(initial.pagination.nextCursor);assert.ok(initial.operations.every((o:any)=>o.userId==="buyer"));assert.ok(!JSON.stringify(initial).includes("fixture-private-stage"));assert.ok(!initial.operations.some((o:any)=>o.id===old.id));
    const pending=await (await get("?action=BUY&resourceId=waiting&principal="+buyer)).json() as any;assert.deepEqual(pending.operations.map((o:any)=>o.id),[old.id],"Campaign-scoped recovery must find a pending operation older than 100 unrelated intents");
    const owned=await (await get("/"+old.id)).json() as any;assert.equal(owned.operation.id,old.id);assert.equal(owned.operation.stagedEntitlementEncrypted,undefined);assert.equal((await get("/"+old.id,"other")).status,404);assert.equal((await get("/__proto__")).status,404);
    const first=await (await get("?limit=2")).json() as any;const ids=new Set(first.operations.map((o:any)=>o.id));
    create("buyer","history:insert-after-cursor",1000);store.save();let cursor=first.pagination.nextCursor;
    while(cursor){const page=await (await get("?limit=17&cursor="+encodeURIComponent(cursor))).json() as any;for(const operation of page.operations){assert.ok(!ids.has(operation.id),"Tied timestamps must not repeat a row across pages");ids.add(operation.id);}cursor=page.pagination.nextCursor;}
    assert.equal(ids.size,106,"A concurrent newer insert must wait until refresh, without losing the original rows");assert.ok(ids.has(old.id));
    assert.equal((await get("?cursor="+encodeURIComponent(first.pagination.nextCursor),"other")).status,400);assert.equal((await get("?action=BUY&cursor="+encodeURIComponent(first.pagination.nextCursor))).status,400);
    for(const query of ["?limit=0","?limit=101","?action=EXECUTE","?phase=SUCCESS","?principal=wrong","?cursor=bad","?userId=other","?limit=2&limit=3"])assert.equal((await get(query)).status,400);
    console.log("PASS LOCAL_FIXTURE: owned history stable scoped cursor/tied timestamps/concurrent insertion, old pending lookup beyond 100 rows, exact operation ACL/IDOR and private stage exclusion. No live history proof.");
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error(error instanceof Error?{name:error.name,message:error.message}:"History verification failed");process.exitCode=1;});
