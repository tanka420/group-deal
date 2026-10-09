import assert from "node:assert/strict";
import express from "express";
import {ethers} from "ethers";
import {store} from "../src/db/store";
import {config} from "../src/config";
import {reviewedProductVerified} from "./fixtures/product";
import {CampaignEditorService} from "../src/services/campaignEditorService";
import {ProductService} from "../src/services/productService";
import {publicRouter} from "../src/routes/publicRoutes";
import {canonicalCampaignUrl} from "../src/services/publicCampaign";
import {publicRateLimit} from "../src/middleware/publicRateLimit";

async function run(){
  const previousUrl=config.publicAppUrl;
  const product=await reviewedProductVerified("seller",ethers.Wallet.createRandom().address);
  const campaign=CampaignEditorService.saveDraft("seller",{title:"Public fixture",description:"Protected resource",thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"105"},{threshold:10,priceUSDC:"89"}],maxPerAccount:3,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:"FILE_LINK"});
  campaign.status="ACTIVE";campaign.visibility="PUBLIC";campaign.projectionOrigin="VERIFIED_PUBLISH";campaign.chainId=config.arcChainId;campaign.hubAddress=config.hubAddress;campaign.onchainCampaignId=1;
  campaign.productSnapshot=ProductService.snapshot("seller",product.version.id,Math.floor(Date.now()/1000)+8*86400);
  campaign.tiers[0].price="900719925474099312345678";campaign.totalGrossCommitted="900719925474099312345678";
  campaign.deliveryContentTemplate="fixture-private-template";store.save();
  config.publicAppUrl="https://deals.example.test";
  const app=express();app.get("/budget",publicRateLimit(2),(_req,res)=>res.json({ok:true}));app.use("/api/v1",publicRouter);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const base="http://127.0.0.1:"+(server.address() as any).port;
  // These fixtures publish each intended mutation before exercising the committed public boundary.
  const get=(suffix:string)=>{store.save();return fetch(base+"/api/v1/campaigns"+suffix);};
  try {
    const list=await get("").then(r=>r.json()) as any,detail=await get("/"+campaign.id).then(r=>r.json()) as any;
    assert.equal(list.campaigns.length,1);assert.deepEqual(list.campaigns[0],detail.campaign);
    assert.equal(detail.chainId,config.arcChainId);assert.equal(detail.campaign.totalGrossCommitted,"900719925474099312345678");assert.equal(detail.campaign.product.license.usageScope,product.license.usageScope);
    assert.equal(detail.campaign.campaignUrl,"https://deals.example.test/#campaign-"+campaign.id);
    assert.ok(!JSON.stringify(detail).includes("fixture-private-template"));assert.equal(detail.campaign.deliveryContentTemplate,undefined);assert.equal(detail.campaign.rights.evidenceRefs,undefined);
    assert.equal(detail.campaign.termsPolicyReviewRequired,false);campaign.termsPolicyReviewRequired=true;
    const heldList=await get("").then(r=>r.json()) as any,heldDetail=await get("/"+campaign.id).then(r=>r.json()) as any;
    assert.equal(heldDetail.campaign.termsPolicyReviewRequired,true);assert.deepEqual(heldList.campaigns[0],heldDetail.campaign);campaign.termsPolicyReviewRequired=false;
    const widget=await get("/"+campaign.id+"/widget-data").then(r=>r.json()) as any;
    assert.equal(widget.currentPriceUSDC,"900719925474099312.345678");assert.equal(widget.currentPriceBaseUnits,campaign.tiers[0].price);assert.equal(widget.campaignUrl,detail.campaign.campaignUrl);
    config.publicAppUrl="";assert.equal((await get("/"+campaign.id+"/widget-data").then(r=>r.json()) as any).campaignUrl,null);
    for(const bad of ["http://deals.example.test","https://user:credential@deals.example.test","https://deals.example.test/path","https://deals.example.test/?token=fixture"]){config.publicAppUrl=bad;assert.throws(()=>canonicalCampaignUrl(campaign.id),/PUBLIC_APP_URL/);}
    config.publicAppUrl="https://deals.example.test";
    campaign.visibility="UNLISTED";assert.equal((await get("").then(r=>r.json()) as any).campaigns.length,0);assert.equal((await get("/"+campaign.id)).status,200);
    campaign.projectionOrigin="CHAIN_UNBOUND";assert.equal((await get("/"+campaign.id)).status,404);campaign.projectionOrigin="VERIFIED_PUBLISH";
    campaign.chainId=config.arcChainId+1;assert.equal((await get("/"+campaign.id)).status,404);campaign.chainId=config.arcChainId;
    for(const id of ["constructor","__proto__","prototype"])assert.equal((await get("/"+id)).status,404);
    store.transaction(()=>{for(let index=0;index<5;index++){const id="page_"+index;store.db.campaigns[id]={...structuredClone(campaign),id,visibility:"PUBLIC",onchainCampaignId:index+2,startTime:1000,metric:index===4?"UNITS_COUNT":"BUYER_COUNT"};}});
    const first=await get("?limit=2&sort=oldest&metric=BUYER_COUNT").then(r=>r.json()) as any;
    assert.deepEqual(first.campaigns.map((c:any)=>c.id),["page_0","page_1"]);assert.equal(first.pagination.hasMore,true);
    store.transaction(()=>{store.db.campaigns.before_cursor={...structuredClone(store.db.campaigns.page_0),id:"before_cursor",onchainCampaignId:10};});
    const second=await get("?limit=2&sort=oldest&metric=BUYER_COUNT&cursor="+first.pagination.nextCursor).then(r=>r.json()) as any;
    assert.deepEqual(second.campaigns.map((c:any)=>c.id),["page_2","page_3"]);assert.equal(second.pagination.hasMore,false);assert.equal(second.pagination.nextCursor,null);
    for(const query of ["?limit=0","?limit=101","?limit=2&limit=3","?sort=cheapest","?status=DRAFT","?filter=private","?cursor=invalid","?metric=UNITS_COUNT&sort=oldest&cursor="+first.pagination.nextCursor]){
      const invalid=await get(query);assert.equal(invalid.status,400);assert.equal((await invalid.json() as any).code,"VALIDATION");
    }
    const scope=config.hubAddress;config.hubAddress=ethers.Wallet.createRandom().address;
    assert.equal((await get("?sort=oldest&metric=BUYER_COUNT&cursor="+first.pagination.nextCursor)).status,400);config.hubAddress=scope;
    for(let index=0;index<2;index++)assert.equal((await fetch(base+"/budget",{headers:{"X-Forwarded-For":"8.8.8."+index}})).status,200);
    const limited=await fetch(base+"/budget",{headers:{"X-Forwarded-For":"9.9.9.9"}});assert.equal(limited.status,429);assert.equal((await limited.json() as any).code,"RATE_LIMITED");assert.ok(Number(limited.headers.get("Retry-After"))>0);
    store.db.products[product.product.id].status="ARCHIVED";assert.equal((await get("/"+campaign.id)).status,404);
    console.log("PASS LOCAL_FIXTURE: public DTO/license/privacy/list-detail parity, deployment scope, canonical URLs, lossless six-decimal JSON widget amounts, stable scoped cursor and allowlisted query/error/per-process abuse budget.");
  }finally{config.publicAppUrl=previousUrl;await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
