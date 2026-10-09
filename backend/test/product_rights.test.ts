import {enrollFixtureOperator} from './helpers/operatorFixture';
import {AuthService} from '../src/services/authService';
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { store } from "../src/db/store";
import { ProductService } from "../src/services/productService";
import { campaignDto,isListedCampaign } from "../src/services/campaignDto";
import { productRouter } from "../src/routes/productRoutes";
import { campaignRouter } from "../src/routes/campaignRoutes";
import { config } from "../src/config";

const input={title:"GroupDeal resource",description:"Licensed digital resource",category:"Software",vendor:"Fixture vendor",thumbnailUrl:"https://public.fixture.invalid/thumbnail.png",media:[],requirements:["Compatible PDF reader"],supportPolicy:"Support for 30 days",license:{edition:"Individual",seatsPerUnit:1,usageScope:"PERSONAL",durationDays:null,activationWindowDays:30,regions:["Worldwide"],transferable:false,supportDays:30,usageTerms:"Individual access; redistribution prohibited"}};
async function main() {
  assert.ok(store.isIsolated);
  for (const [id,roles] of [["seller",["buyer","seller"]],["other",["buyer","seller"]],["operator",["operator"]],["buyer",["buyer"]]] as const) store.db.users[id]={id,email:`${id}@fixture.invalid`,createdAt:0,activeWallet:null,roles:[...roles]};
  store.save();
  const first=ProductService.createVersion("seller",input);
  const originalVersion=JSON.stringify(first.version),originalLicense=JSON.stringify(first.license);
  assert.throws(()=>ProductService.createVersion("other",input,first.product.id,first.version.id),/FORBIDDEN/);
  assert.throws(()=>ProductService.createVersion("seller",input,first.product.id,"stale"),/CONFLICT/);
  assert.throws(()=>ProductService.snapshot("seller",first.version.id,0),/RIGHTS_REQUIRED/);
  const rights=ProductService.submitRights("seller",first.version.id,{declaration:"OWNER",declarationText:"Owned distribution rights for the fixture resource",evidenceRefs:["https://private.fixture.invalid/rights-proof"]});
  assert.throws(()=>ProductService.reviewRights("seller",rights.id,{decision:"APPROVED",reason:"Invalid role",validUntil:9999999999}),(error:any)=>error.code==="OPERATOR_ACCESS_REQUIRED"&&error.status===403);
  assert.throws(()=>ProductService.reviewRights("operator",rights.id,{decision:"APPROVED",reason:"Unverified old role",validUntil:9999999999}),(error:any)=>error.code==="OPERATOR_ACCESS_REQUIRED"&&error.status===403);
  const enrollment=await enrollFixtureOperator("operator",undefined,{chainId:config.arcChainId});
  const authorization=async()=>{await enrollment.service.authorize(enrollment.proof);const challenge=AuthService.issueWalletChallenge("operator","OPERATOR_ACTION",enrollment.wallet.address,undefined,undefined,enrollment.proof);return{proof:enrollment.proof,stepUp:{walletAddress:enrollment.wallet.address,signature:await enrollment.wallet.signMessage(challenge.challengeMessage),challengeMessage:challenge.challengeMessage}};};
  const invalidAuthorization=await authorization();
  assert.throws(()=>ProductService.reviewRights("operator",rights.id,{decision:"APPROVED",reason:"Reviewed",validUntil:1},invalidAuthorization),/future expiry/);
  const expiry=Math.floor(Date.now()/1000)+864000;
  ProductService.reviewRights("operator",rights.id,{decision:"APPROVED",reason:"Ownership evidence reviewed",validUntil:expiry},await authorization());
  const snapshot=ProductService.snapshot("seller",first.version.id,expiry-1);
  ProductService.assertPublishable("seller",snapshot,expiry-1);
  assert.throws(()=>ProductService.snapshot("seller",first.version.id,expiry+1),/RIGHTS_REQUIRED/);
  const campaign={id:"stable",status:"ACTIVE",visibility:"PUBLIC",sellerId:"seller",productSnapshot:snapshot,deliveryContentTemplate:"private delivery configuration",amendments:[],onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,projectionOrigin:"VERIFIED_PUBLISH"} as any;
  store.db.campaigns.stable=campaign;
  store.db.orders["1"]={id:"1",productSnapshot:snapshot} as any;
  const next=ProductService.createVersion("seller",{...input,title:"Next edition",license:{...input.license,seatsPerUnit:3}},first.product.id,first.version.id);
  assert.notEqual(next.version.id,first.version.id);assert.equal(JSON.stringify(store.db.productVersions[first.version.id]),originalVersion);assert.equal(JSON.stringify(store.db.licenseVersions[first.license.id]),originalLicense);
  assert.equal(store.db.orders["1"].productSnapshot?.licenseVersionId,first.license.id);
  const dto=campaignDto(campaign),encoded=JSON.stringify(dto);
  assert.equal(dto.product?.license.seatsPerUnit,1);assert.equal(dto.rights.status,"APPROVED");
  for(const forbidden of ["private.fixture.invalid","private delivery configuration","declarationText","evidenceRefs","actorId"]) assert.ok(!encoded.includes(forbidden));
  assert.throws(()=>ProductService.snapshot("seller",next.version.id,0),/RIGHTS_REQUIRED/);
  ProductService.reviewRights("operator",rights.id,{decision:"REVOKED",reason:"Distribution revoked"},await authorization());
  assert.throws(()=>ProductService.assertPublishable("seller",snapshot,0),/RIGHTS_REQUIRED/);
  assert.equal(campaignDto(campaign).rights.status,"REVOKED");assert.equal(store.db.orders["1"].productSnapshot?.licenseVersionId,first.license.id);
  const app=express();app.use(express.json());app.use("/api/products",productRouter);app.use("/api/campaigns",campaignRouter);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  try {
    const port=(server.address() as any).port,base=`http://127.0.0.1:${port}`;
    const token=(id:string)=>jwt.sign({userId:id},config.jwtSecret,{expiresIn:"1m"});
    assert.equal((await fetch(base+"/api/products/mine")).status,401);
    assert.equal((await fetch(base+"/api/products/mine",{headers:{Authorization:`Bearer ${token("buyer")}`}})).status,403);
    const other=await fetch(base+"/api/products/mine",{headers:{Authorization:`Bearer ${token("other")}`}});assert.deepEqual((await other.json() as any).products,[]);
    // Explicitly commit this pending campaign fixture before testing the public SQL reader.
    store.save();const publicResponse=await fetch(base+"/api/campaigns/stable");assert.equal(publicResponse.status,200);const publicText=await publicResponse.text();assert.ok(!publicText.includes("private.fixture.invalid"));
    ProductService.archive("seller",first.product.id);assert.equal(isListedCampaign(campaign),false);assert.equal(ProductService.publicVersion(first.version.id)?.license.seatsPerUnit,1);
    assert.equal((await fetch(base+"/api/campaigns/stable")).status,404);
    assert.equal(store.db.orders['1'].productSnapshot?.licenseVersionId,first.license.id);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
  console.log("PASS product/license immutability, ownership/version races, independent rights scope/expiry/revocation, private allowlist, archive preservation and HTTP RBAC");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>store.close());
