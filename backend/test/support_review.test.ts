import {enrollFixtureOperator} from './helpers/operatorFixture';
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {ethers} from "ethers";
import {store} from "../src/db/store";
import {config} from "../src/config";
import {SessionService} from '../src/services/sessionService';
import {orderRouter} from "../src/routes/orderRoutes";
import {sellerRouter} from "../src/routes/sellerRoutes";
import {operatorRouter} from "../src/routes/operatorRoutes";
import {DisputeService} from "../src/services/disputeService";
import {orderDto} from "../src/services/orderDto";
import {cleanHttpsEvidenceUrl} from "../../shared/evidence.mjs";

import {installReviewLineage} from './fixtures/review';
import {OrderReviewError} from '../src/services/orderReviewService';

async function run(){
  for(const [id,roles] of [["buyer",["buyer"]],["seller",["seller"]],["other",["buyer","seller"]],["operator",["operator"]]] as const)store.db.users[id]={id,email:id+"@fixture.invalid",roles:[...roles],activeWallet:ethers.Wallet.createRandom().address,createdAt:0};
  store.db.campaigns.campaign={id:"campaign",sellerId:"seller",status:"FINALIZED",sellerPayoutWallet:store.db.users.seller.activeWallet,onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress} as any;
  const order={id:"order",campaignId:"campaign",buyerAccountId:"buyer",buyerPrincipal:store.db.users.buyer.activeWallet,campaignIdentity:ethers.id("fixture-identity"),chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,onchainOrderId:1,quantity:1,lockedUnitPrice:"100000000",committedGross:"100000000",rebateAllocated:"10000000",sellerAllocated:"90000000",buyerRefundAllocated:"0",buyerClaimedAmount:"0",sellerClaimedAmount:"0",deliveryStatus:"CONFIRMED",deliveryProofHash:ethers.id("fixture-proof"),deliveryTxHash:ethers.id("fixture-delivery"),txHash:ethers.id("fixture-commit"),commitmentTxHash:ethers.id("fixture-commit"),isEarlySupporter:false,earlyRebateValue:"0",createdAt:0,deliveredEntitlementEncrypted:"fixture-private-ciphertext",entitlementEncrypted:"fixture-private-legacy",privateExtension:"fixture-private-extension",transactionHistory:[{action:"DeliveryRecorded",txHash:ethers.id("fixture-delivery"),blockNumber:2,blockHash:ethers.id("fixture-block"),logIndex:0,chainId:config.arcChainId,hubAddress:config.hubAddress,licenseKey:"fixture-private-nested"}]} as any;
  store.db.orders.order=order;installReviewLineage(store,"order");store.db.orders.pending={...order,id:"pending",onchainOrderId:2,deliveryStatus:"PENDING"};store.db.orders.unverified={...order,id:"unverified",onchainOrderId:3,deliveryTxHash:undefined};store.save();
  const operatorToken=SessionService.issue(store.db.users.operator,undefined,'ADMIN');await enrollFixtureOperator('operator',SessionService.authenticate(operatorToken),{chainId:config.arcChainId});
  const financialBefore=JSON.stringify([order.committedGross,order.rebateAllocated,order.sellerAllocated,order.buyerRefundAllocated,order.buyerClaimedAmount,order.sellerClaimedAmount]);
  const app=express();app.use(express.json());app.use("/api/orders",orderRouter);app.use("/api/seller",sellerRouter);app.use("/api/operator",operatorRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+(server.address() as any).port;
  const request=(path:string,user="buyer",body?:unknown)=>fetch(base+path,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+(user==='operator'?operatorToken:jwt.sign({userId:user,roles:["operator"]},config.jwtSecret,{expiresIn:"2m"})),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const safe=(body:any)=>assert.ok(!JSON.stringify(body).includes("fixture-private"),"Order responses must omit entitlement, unknown legacy and nested private fields");
  try{
    for(const unsafe of ["javascript:alert(1)","data:text/html,test","http://fixture.invalid/evidence","https://user:pass@fixture.invalid/evidence",null,"wrong-url"])assert.equal(cleanHttpsEvidenceUrl(unsafe),null);
    assert.equal(cleanHttpsEvidenceUrl("https://fixture.invalid/evidence"),"https://fixture.invalid/evidence");await assert.rejects(DisputeService.openDispute("buyer","order","Valid reason",["javascript:alert(1)"],ethers.id("not-a-proof")),/Invalid dispute metadata/);
    for(const score of [0,6,-1,1.5,"5",null])assert.equal((await request("/api/orders/order/review","buyer",{score,comment:"Test review"})).status,400);
    assert.throws(()=>DisputeService.addReview("buyer","order",NaN,"Test"),(e:unknown)=>e instanceof OrderReviewError&&e.code==="ORDER_REVIEW_INPUT_INVALID"&&e.status===400);assert.throws(()=>DisputeService.addReview("buyer","order",Infinity,"Test"),(e:unknown)=>e instanceof OrderReviewError&&e.code==="ORDER_REVIEW_INPUT_INVALID"&&e.status===400);
    assert.equal((await request("/api/orders/order/review","buyer",{score:5,comment:" ".repeat(8)})).status,400);assert.equal((await request("/api/orders/order/review","buyer",{score:5,comment:"x".repeat(4001)})).status,400);
    assert.equal((await request("/api/orders/pending/review","buyer",{score:5,comment:"Not delivered"})).status,400);assert.equal((await request("/api/orders/unverified/review","buyer",{score:5,comment:"No delivery proof"})).status,400);assert.equal((await request("/api/orders/order/review","other",{score:5,comment:"Unauthorized"})).status,403);
    const attempts=await Promise.all([request("/api/orders/order/review","buyer",{score:5,comment:"Works as licensed"}),request("/api/orders/order/review","buyer",{score:4,comment:"Conflicting review"})]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);safe(await attempts.find(r=>r.status===200)!.json());
    const saved=store.db.orders.order.review!;assert.equal((await request("/api/orders/order/review","buyer",{score:saved.score,comment:saved.comment})).status,200);assert.equal(store.db.auditLogs.filter(l=>l.action==="REVIEW_SUBMITTED").length,1);assert.equal(store.db.auditLogs.find(l=>l.action==="REVIEW_SUBMITTED")!.details.comment,undefined);
    assert.equal((await request("/api/seller/orders/order/reply-review","other",{sellerResponse:"Other seller"})).status,403);assert.equal((await request("/api/seller/orders/order/reply-review","seller",{sellerResponse:5})).status,400);
    const reply=await request("/api/seller/orders/order/reply-review","seller",{sellerResponse:"Thank you"});assert.equal(reply.status,200);safe(await reply.json());await request("/api/seller/orders/order/reply-review","seller",{sellerResponse:"Thank you"});assert.equal(store.db.auditLogs.filter(l=>l.action==="REVIEW_REPLIED").length,1);assert.equal(store.db.auditLogs.find(l=>l.action==="REVIEW_REPLIED")!.details.sellerResponse,undefined);
    assert.equal((await request("/api/orders/order/messages","other")).status,403);assert.equal((await request("/api/orders/order/messages","other",{text:"Unauthorized"})).status,403);assert.equal((await request("/api/orders/order/messages","buyer",{text:"x".repeat(4001)})).status,400);
    const message=await request("/api/orders/order/messages","buyer",{text:"Need help",senderRole:"operator",senderWallet:store.db.users.operator.activeWallet});assert.equal(message.status,200);const sent=(await message.json() as any).message;assert.equal(sent.senderRole,"buyer");assert.equal(sent.senderWallet,store.db.users.buyer.activeWallet);
    (store.db.supportMessages.order[0] as any).privateExtension="fixture-private-message";store.save();const messages=await (await request("/api/orders/order/messages","seller")).json();safe(messages);
    store.db.orders.order.deliveryStatus="DISPUTED";store.save();const disputes=await request("/api/operator/disputes","operator");assert.equal(disputes.status,200);safe(await disputes.json());assert.equal((await request("/api/operator/disputes","buyer")).status,403);
    safe(orderDto(store.db.orders.order));safe(await (await request("/api/orders/buyer")).json());safe(await (await request("/api/seller/orders","seller")).json());
    assert.equal(store.db.orders.order.deliveredEntitlementEncrypted,"fixture-private-ciphertext");assert.equal((store.db.orders.order as any).privateExtension,"fixture-private-extension");assert.equal((store.db.orders.order.transactionHistory![0] as any).licenseKey,"fixture-private-nested");
    assert.equal(JSON.stringify([order.committedGross,order.rebateAllocated,order.sellerAllocated,order.buyerRefundAllocated,order.buyerClaimedAmount,order.sellerClaimedAmount]),financialBefore);assert.equal(store.verifyAuditLogIntegrity().valid,true);
    console.log("PASS LOCAL_FIXTURE: support/order ACL and role spoof rejection, bounded typed review/reply/message, concurrent one-review/idempotent retry, private-safe order/operator/nested DTOs, preserved legacy entitlement and unchanged financial fields/audit integrity. No live support or delivery proof.");
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error(error instanceof Error?{name:error.name,message:error.message}:"Support/review verification failed");process.exitCode=1;});
