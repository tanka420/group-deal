import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { store, TransactionalStore } from "../src/db/store";
import path from "node:path";
import { config } from "../src/config";
import {SessionService} from "../src/services/sessionService";
import { sellerRouter } from "../src/routes/sellerRoutes";
import { campaignRouter } from "../src/routes/campaignRoutes";
import { CampaignEditorService } from "../src/services/campaignEditorService";
import { ProductService } from "../src/services/productService";
import { OperationService } from "../src/services/operationService";
import { campaignCalldata } from "../src/services/campaignBindingService";
import { reviewedProductVerified, productInput } from "./fixtures/product";

async function run(){
 const product=await reviewedProductVerified("seller",ethers.Wallet.createRandom().address);
 store.db.users.other={id:"other",roles:["seller"],email:"other@fixture.invalid",createdAt:0} as any;
 store.db.users.buyer={id:"buyer",roles:["buyer"],email:"buyer@fixture.invalid",createdAt:0} as any;
 const input={title:"Original draft",description:product.version.description,category:product.version.category,thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"900719925474099312.345678"},{threshold:10,priceUSDC:"89"}],maxPerAccount:3,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:"FILE_LINK"};
 const draft=CampaignEditorService.saveDraft("seller",input);
 (draft as any).privateExtension="private-draft-marker";(draft as any).deliveryContentTemplate="private-legacy-resource";
 for(let i=0;i<52;i++)CampaignEditorService.saveDraft("seller",{...input,title:`Pagination ${i}`});
 ProductService.createVersion("seller",{...productInput,title:"Latest version must not replace draft"},product.product.id,product.version.id);
 const app=express();app.use(express.json());app.use("/api/seller",sellerRouter);app.use("/api/campaigns",campaignRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+(server.address() as any).port;
 const tokens:Record<string,string>={};for(const id of ["seller","other","buyer"]){tokens[id]=jwt.sign({userId:id,roles:["seller"]},config.jwtSecret,{expiresIn:"2m"});SessionService.authenticate(tokens[id]);}
 const headers=(user="seller")=>({Authorization:"Bearer "+tokens[user],"Content-Type":"application/json"});
 const read=(path:string,user="seller")=>fetch(base+"/api/seller/campaign-drafts"+path,{headers:headers(user)});
 try{
  const before=JSON.stringify(store.db);
  assert.equal((await fetch(base+"/api/seller/campaign-drafts")).status,401);assert.equal((await read("","buyer")).status,403);assert.equal((await read("/"+draft.id,"other")).status,403);
  for(const id of ["missing","constructor","__proto__"])assert.equal((await read("/"+id)).status,404);
  const first=await (await read("")).json() as any,second=await (await read("?after="+first.pagination.nextCursor)).json() as any;
  assert.equal(first.drafts.length,50);assert.equal(second.drafts.length,3);assert.equal(new Set([...first.drafts,...second.drafts].map(d=>d.id)).size,53);assert.equal(second.pagination.nextCursor,null);assert.equal((await read("?limit=1000")).status,400);
  const view=await (await read("/"+draft.id)).json() as any;
  assert.equal(view.draft.version,1);assert.equal(view.draft.input.tiers[0].priceUSDC,input.tiers[0].priceUSDC);assert.equal(view.product.version.id,product.version.id);assert.notEqual(view.product.latestVersionId,product.version.id);assert.equal(view.publication,null);assert.equal(view.draft.input.deliveryContentTemplate,"");
  assert.ok(!JSON.stringify(view).includes("private-"));assert.ok(!JSON.stringify(view).includes("evidenceRefs"));assert.equal(JSON.stringify(store.db),before,"Editor reads must not write draft/version/probe/audit/financial state");
  const writes=await Promise.all(["Winner one","Winner two"].map(title=>fetch(base+"/api/campaigns/"+draft.id,{method:"PUT",headers:headers(),body:JSON.stringify({...input,title,expectedVersion:1})})));
  assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);assert.equal(store.db.campaigns[draft.id].draftVersion,2);assert.equal((await (await read("/"+draft.id)).json() as any).draft.version,2);
  // Retrying after losing an acknowledgement replays the committed write, never another version.
  const writeHeaders=(key:string)=>({...headers(),"Idempotency-Key":key});
  const create=()=>fetch(base+"/api/campaigns/draft",{method:"POST",headers:writeHeaders("draft-write:create-fixture"),body:JSON.stringify(input)});
  const created=await (await create()).json() as any,receiptId=created.campaign.id,createAudits=store.db.auditLogs.length;
  assert.equal((await (await create()).json() as any).campaign.id,receiptId);assert.equal(store.db.auditLogs.length,createAudits);
  const updateBody={...input,title:"Acknowledged version two",expectedVersion:1},update=()=>fetch(base+"/api/campaigns/"+receiptId,{method:"PUT",headers:writeHeaders("draft-write:update-fixture"),body:JSON.stringify(updateBody)});
  const identical=await Promise.all([update(),update()]);assert.deepEqual(identical.map(r=>r.status),[200,200]);assert.equal(store.db.campaigns[receiptId].draftVersion,2);
  const updateAudits=store.db.auditLogs.length;assert.equal((await update()).status,200);assert.equal(store.db.auditLogs.length,updateAudits);
  assert.ok(store.isIsolated,"Restart witness must never open the active DB");
  const reopened=new TransactionalStore(path.dirname((store as unknown as {filePath:string}).filePath));
  try{assert.equal(reopened.db.campaigns[receiptId].draftVersion,2);assert.deepEqual(reopened.db.campaignDraftKeys,store.db.campaignDraftKeys);assert.equal(reopened.db.auditLogs.length,updateAudits);}finally{reopened.close();}
  const misuse=(path:string,body:unknown)=>fetch(base+path,{method:"PUT",headers:writeHeaders("draft-write:update-fixture"),body:JSON.stringify(body)});
  assert.equal((await misuse("/api/campaigns/"+receiptId,{...updateBody,title:"Changed pending payload"})).status,409);
  assert.equal((await misuse("/api/campaigns/"+draft.id,{...updateBody,expectedVersion:2})).status,409);
  assert.equal((await fetch(base+"/api/campaigns/draft",{method:"POST",headers:writeHeaders("draft-write:update-fixture"),body:JSON.stringify(input)})).status,409);
  const next=await fetch(base+"/api/campaigns/"+receiptId,{method:"PUT",headers:writeHeaders("draft-write:next-fixture"),body:JSON.stringify({...input,title:"A different writer",expectedVersion:2})});assert.equal(next.status,200);
  assert.equal((await update()).status,409,"An old receipt must not masquerade as the latest server version");assert.equal((await create()).status,409);assert.equal(store.db.campaigns[receiptId].draftVersion,3);
  for(const expectedVersion of [0,-1,1.5,"3",null])assert.equal((await fetch(base+"/api/campaigns/"+receiptId,{method:"PUT",headers:headers(),body:JSON.stringify({...input,expectedVersion})})).status,400);
  const wrongDeployment={...headers(),"X-GroupDeal-Deployment":`${config.arcChainId}:${ethers.ZeroAddress}:1`},scopeSnapshot=JSON.stringify(store.db);
  assert.equal((await fetch(base+"/api/campaigns/draft",{method:"POST",headers:wrongDeployment,body:JSON.stringify(input)})).status,409);
  assert.equal((await fetch(base+"/api/campaigns/"+receiptId,{method:"PUT",headers:wrongDeployment,body:JSON.stringify({...input,expectedVersion:3})})).status,409);assert.equal(JSON.stringify(store.db),scopeSnapshot);
  store.transaction(()=>CampaignEditorService.pinProduct("seller",store.db.campaigns[draft.id]));const current=store.db.campaigns[draft.id];
  const op=OperationService.prepare({userId:"seller",action:"PUBLISH",resourceId:current.id,principal:current.sellerPayoutWallet,idempotencyKey:"publish:resume-fixture",calldata:campaignCalldata(current),intentId:"publish_"+current.id,expectedFunction:"createCampaign",expectedEvent:"CampaignCreated",expectedEventArgs:{termsHash:current.termsHash}});
  (op as any).privateExtension="private-operation-marker";op.stagedEntitlementEncrypted="private-staged-resource";
  const pinned=await (await read("/"+draft.id)).json() as any;assert.equal(pinned.publication.operation.id,op.id);assert.equal(pinned.publication.operation.calldata,op.calldata);assert.equal(pinned.publication.operation.idempotencyKey,op.idempotencyKey);assert.ok(!JSON.stringify(pinned).includes("private-"));
  assert.throws(()=>OperationService.prepare({userId:"seller",action:"PUBLISH",resourceId:current.id,principal:current.sellerPayoutWallet,idempotencyKey:"publish:another-key",calldata:op.calldata,intentId:op.intentId,expectedFunction:"createCampaign",expectedEvent:"CampaignCreated",expectedEventArgs:op.expectedEventArgs}),/already has a publication intent/);
  assert.equal(Object.values(store.db.operations).filter(operation=>operation.action==="PUBLISH"&&operation.resourceId===draft.id).length,1);
  assert.equal((await fetch(base+"/api/campaigns/"+draft.id,{method:"PUT",headers:headers(),body:JSON.stringify({...input,expectedVersion:2})})).status,409);
  // A rejected transactional edit restores cloned records; reacquire the live fixture reference.
  const afterRollback=store.db.campaigns[draft.id],originalHash=afterRollback.termsHash;afterRollback.termsHash=ethers.id("corrupted fixture terms");assert.equal((await read("/"+draft.id)).status,409);afterRollback.termsHash=originalHash;
  afterRollback.status="ACTIVE";assert.equal((await read("/"+draft.id)).status,409);afterRollback.status="DRAFT";
  console.log("PASS LOCAL_FIXTURE: seller draft read RBAC/privacy, 50+3 paging, exact BigInt amount, original immutable product version, no read writes, optimistic 200/409 race, write receipt replay/concurrent dedup/payload-resource-version binding, stale receipt refusal and pinned publish recovery/drift guards.");
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error("FAIL CAMPAIGN_DRAFT_VIEW: "+(error instanceof Error?error.name:"UnknownError"));if(error instanceof Error)for(const line of (error.stack||"").split("\n").filter(l=>/^\s+at /.test(l)&&/campaign_draft_view\.test\.ts/.test(l)).slice(0,3))console.error(line);process.exitCode=1;});
