import {enrollFixtureOperator} from './helpers/operatorFixture';
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {store} from "../src/db/store";
import {config} from "../src/config";
import {SessionService} from "../src/services/sessionService";
import {operatorRouter} from "../src/routes/operatorRoutes";
import {operatorDealView} from "../src/services/operatorDealView";

async function run(){
  store.db.users.operator={id:"operator",roles:["operator"],email:"operator@fixture.invalid",createdAt:0} as any;
  store.db.users.buyer={id:"buyer",roles:["buyer"],email:"buyer@fixture.invalid",createdAt:0} as any;
  const campaign={id:"deal",title:"Operator fixture",sellerId:"seller",status:"FINALIZED",visibility:"PUBLIC",metric:"BUYER_COUNT",tiers:[{threshold:1,price:"100000000"},{threshold:10,price:"80000000"}],currentUnlockedTier:1,chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,deliveryContentTemplate:"private-fixture-resource",termsPolicyReviewRequired:true} as any;
  store.db.campaigns.deal=campaign;
  const gross="900719925474099312345678";
  for(let i=0;i<53;i++){
    const id=`order_${String(i).padStart(3,"0")}`;
    store.db.orders[id]={id,campaignId:"deal",chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,committedGross:gross,rebateAllocated:"1000000",sellerAllocated:"2000000",buyerRefundAllocated:"3000000",buyerClaimedAmount:"1500000",sellerClaimedAmount:"1000000",deliveryStatus:"DELIVERED",entitlementEncrypted:"private-fixture-ciphertext",deliveredEntitlementEncrypted:"private-fixture-ciphertext",transactionHistory:[{action:"CommitmentMade",txHash:"0x"+"12".repeat(32),privateExtension:"private-fixture-nested"}]} as any;
  }
  store.save();
  const tokens:Record<string,string>={};for(const id of ["operator","buyer"]){tokens[id]=jwt.sign({userId:id,roles:["operator"]},config.jwtSecret,{expiresIn:"2m"});SessionService.authenticate(tokens[id]);}
  tokens.operator=SessionService.issue(store.db.users.operator,'EVM_WALLET','ADMIN');
  await enrollFixtureOperator('operator',SessionService.authenticate(tokens.operator),{chainId:config.arcChainId});
  const before=JSON.stringify(store.db);
  const app=express();app.use("/api/operator",operatorRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+(server.address() as any).port;
  const get=(path:string,user="operator")=>fetch(base+"/api/operator"+path,{headers:{Authorization:"Bearer "+tokens[user]}});
  try{
    assert.equal((await fetch(base+"/api/operator/deals")).status,401);assert.equal((await get("/deals","buyer")).status,403);assert.equal((await get("/deals/deal","buyer")).status,403);
    const list=await (await get("/deals")).json() as any;assert.equal(list.campaigns[0].termsPolicyReviewRequired,true);assert.ok(!JSON.stringify(list).includes("private-fixture"));
    const detail=await (await get("/deals/deal")).json() as any;assert.equal(detail.accounting.source,"LOCAL_PROJECTION");assert.equal(detail.accounting.chainVerified,false);assert.equal(detail.accounting.accountingKnown,true);assert.equal(detail.accounting.orderCount,53);assert.equal(detail.accounting.grossCommitted,(BigInt(gross)*53n).toString());assert.equal(detail.accounting.buyerClaimed,"79500000");assert.equal(detail.accounting.buyerClaimable,"132500000");assert.equal(detail.accounting.sellerClaimable,"53000000");assert.equal(detail.orders.length,50);assert.ok(!JSON.stringify(detail).includes("private-fixture"));assert.equal(detail.projection.provenanceVerified,false);
    const next=await (await get("/deals/deal?after="+detail.pagination.nextCursor)).json() as any;assert.equal(next.orders.length,3);assert.equal(next.pagination.nextCursor,null);assert.equal(new Set([...detail.orders,...next.orders].map(o=>o.id)).size,53);
    assert.equal((await get("/deals/deal?limit=1000")).status,400);assert.equal((await get("/deals?after=__bad%20cursor")).status,400);for(const id of ["missing","constructor","__proto__"])assert.equal((await get("/deals/"+id)).status,404);
    assert.equal(JSON.stringify(store.db),before,"Read views must never mutate financial/private state");
    store.db.orders.order_000.buyerClaimed=true;delete store.db.orders.order_000.buyerClaimedAmount;assert.equal(operatorDealView("deal",{})!.accounting.accountingKnown,false);assert.equal(operatorDealView("deal",{})!.accounting.buyerClaimable,null);store.db.orders.order_000.buyerClaimedAmount="1500000";
    campaign.chainId=config.arcChainId+1;const wrong=operatorDealView("deal",{})!;assert.equal(wrong.projection.currentDeploymentScope,false);assert.equal(wrong.accounting.grossCommitted,null);
    console.log("PASS LOCAL_FIXTURE: operator deal RBAC, privacy, lossless per-order/cumulative totals, pagination, unknown/scope fail-closed and strictly read-only projection labels.");
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error("FAIL OPERATOR_DEAL_VIEW: "+(error instanceof Error?error.name:"UnknownError"));if(error instanceof Error)for(const line of (error.stack||"").split("\n").filter(l=>/^\s+at /.test(l)&&/operator_deal_view\.test\.ts/.test(l)).slice(0,3))console.error(line);process.exitCode=1;});
