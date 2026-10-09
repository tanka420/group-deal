import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { store } from "../src/db/store";
import { config } from "../src/config";
import { reviewedProductVerified } from "./fixtures/product";
import { campaignRouter } from "../src/routes/campaignRoutes";
import { operationRouter } from "../src/routes/operationRoutes";
import { CampaignEditorService } from "../src/services/campaignEditorService";
import { ResourceDeliveryService } from "../src/services/resourceDeliveryService";

async function main() {
  const product=await reviewedProductVerified("seller",ethers.Wallet.createRandom().address);
  store.db.users.other={id:"other",email:"other@fixture.invalid",roles:["seller"],createdAt:0,activeWallet:null};
  const input={title:"HTTP draft",description:"Real protected file",thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"105"},{threshold:10,priceUSDC:"89"}],maxPerAccount:3,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:"FILE_LINK"};
  const resource=ResourceDeliveryService.upload("seller",product.version.id,"fixture.txt","text/plain",Buffer.from("Complete local fixture bytes"));
  const app=express();app.use(express.json());app.use("/api/campaigns",campaignRouter);app.use("/api/transactions",operationRouter);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const headers=(id:string,key?:string)=>({Authorization:`Bearer ${jwt.sign({userId:id},config.jwtSecret,{expiresIn:"1m"})}`,"Content-Type":"application/json",...(key?{"Idempotency-Key":key}:{})});
  const post=async(path:string,body:unknown,id="seller",key?:string)=>fetch(base+path,{method:"POST",headers:headers(id,key),body:JSON.stringify(body)});
  try {
    const first=await post("/api/campaigns/draft",input,"seller","draft:http-fixture");assert.equal(first.status,201);const draft=(await first.json() as any).campaign;
    const retry=await post("/api/campaigns/draft",input,"seller","draft:http-fixture");assert.equal((await retry.json() as any).campaign.id,draft.id);
    const probe=await post(`/api/campaigns/${draft.id}/test-delivery`,{resourceId:resource.id});assert.equal(probe.status,200);
    const prepare=await post(`/api/campaigns/${draft.id}/prepare-publish`,{idempotencyKey:"publish:http-fixture"});assert.equal(prepare.status,200);const operation=(await prepare.json() as any).operation;
    assert.equal((await post(`/api/transactions/${operation.id}/ready`,{},"other")).status,409);
    const current=store.db.campaigns[draft.id];
    assert.throws(()=>CampaignEditorService.saveDraft("seller",input,draft.id,1),/pins this draft/);
    store.transaction(()=>{store.db.rights[product.rights.id].status="REVOKED";});assert.equal((await post(`/api/transactions/${operation.id}/ready`,{})).status,409,"Committed rights revocation must deny publication readiness");store.transaction(()=>{store.db.rights[product.rights.id].status="APPROVED";});
    const competing=await Promise.all([post(`/api/transactions/${operation.id}/ready`,{}),post(`/api/transactions/${operation.id}/ready`,{})]);
    assert.deepEqual(competing.map(r=>r.status).sort(),[200,409],"Only one tab can reserve the wallet signature");
    const hash=ethers.id("submitted fixture");assert.equal((await post(`/api/transactions/${operation.id}/submit`,{txHash:hash})).status,202);
    assert.equal((await post(`/api/transactions/${operation.id}/ready`,{})).status,409,"An existing broadcast cannot be signed again");
    assert.equal((await post(`/api/transactions/${operation.id}/submit`,{txHash:ethers.id("other hash")})).status,409);
    const otherList=await fetch(base+"/api/transactions",{headers:headers("other")}).then(r=>r.json()) as any;assert.deepEqual(otherList.operations,[]);
    assert.equal(current.onchainCampaignId,undefined,"Preparation and submission tracking cannot bind financial state");
    console.log("PASS HTTP draft retries, resource/policy gates, owned transaction history, signature readiness, submitted hash pinning and immutable pending draft");
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
