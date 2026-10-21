import {enrollFixtureOperator} from './helpers/operatorFixture';
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import jwt from "jsonwebtoken";
import {ethers} from "ethers";
import {store,TransactionalStore} from "../src/db/store";
import {config} from "../src/config";
import {operatorEnrollmentService} from '../src/services/operatorEnrollment';
import {SessionService,SessionError,type SessionProof} from '../src/services/sessionService';
import {NotificationService,OutboxError} from "../src/services/notificationService";
import {operatorRouter} from "../src/routes/operatorRoutes";
import {notificationRouter} from "../src/routes/notificationRoutes";

const fixtureTokens=new Map<string,string>();const tokenFor=(id:string)=>{let token=fixtureTokens.get(id);if(!token){token=SessionService.issue(store.db.users[id],undefined,store.db.users[id].roles.includes('operator')?'ADMIN':undefined);fixtureTokens.set(id,token);}return token;};
const fixtureProofs=new Map<string,SessionProof>();const proofFor=(id:string)=>{let proof=fixtureProofs.get(id);if(!proof){proof=SessionService.authenticate(tokenFor(id));fixtureProofs.set(id,proof);}return proof;};
const user=(role:"buyer"|"operator"="buyer")=>{const id="outbox_fixture_"+crypto.randomUUID();store.db.users[id]={id,email:id+"@example.test",emailVerified:true,roles:[role],activeWallet:null,createdAt:Date.now()};store.save();return id;};
const operator=user("operator"),otherOperator=user("operator"),owner=user(),stranger=user();
const hash=ethers.id("outbox-fixture-source"),eventId=`${config.arcChainId}_${config.hubAddress.toLowerCase()}_${hash}_0`;
store.db.eventJournal[eventId]={id:eventId,chainId:config.arcChainId,contractAddress:config.hubAddress,blockNumber:1,blockHash:ethers.id("outbox-block"),transactionIndex:0,txHash:hash,logIndex:0,eventName:"CommitmentMade",payload:{},processedAt:Date.now(),evidenceVersion:2,eventDigest:ethers.id("outbox-digest"),blockTimestamp:1700000001};store.save();
const source={kind:"CHAIN_EVENT" as const,eventId,eventName:"CommitmentMade",chainId:config.arcChainId,hubAddress:config.hubAddress,txHash:hash,blockNumber:1,blockHash:ethers.id("outbox-block"),logIndex:0,occurredAt:1700000001000};
const create=(id=owner)=>{const n=NotificationService.create(id,{type:"TEST",title:"Public outbox fixture",message:"Public status only",source,dedupeKey:crypto.randomUUID()})!;return Object.values(store.db.emailOutbox).find(j=>j.notificationId===n.id)!;};
const fail=async(id:string)=>{for(let i=0;i<5;i++){store.db.emailOutbox[id].nextAttemptAt=0;store.save();await NotificationService.processEmailOutbox(async()=>{throw new Error("synthetic-private-provider-diagnostic");});}};
const body=(id:string,key=crypto.randomUUID())=>({idempotencyKey:key,expectedAttempts:store.db.emailOutbox[id].attempts,expectedRedriveCount:store.db.emailOutbox[id].redrives?.length??0});
const error=(action:()=>unknown,code:string,status?:number)=>assert.throws(action,(e:unknown)=>(e instanceof OutboxError||e instanceof SessionError)&&e.code===code&&(status===undefined||e.status===status));
const quiet=()=>{for(const j of Object.values(store.db.emailOutbox))if(["QUEUED","RETRY","PROCESSING"].includes(j.status))j.status="CANCELLED";store.save();};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return {promise,resolve};};
async function run(){
  const primary=await enrollFixtureOperator(operator,proofFor(operator),{chainId:config.arcChainId});let secondary:Awaited<ReturnType<typeof enrollFixtureOperator>>|undefined;const asSecondary=async(action:()=>unknown)=>{if(!secondary)secondary=await enrollFixtureOperator(otherOperator,proofFor(otherOperator),{chainId:config.arcChainId});else{config.operatorAddress=secondary.wallet.address;(operatorEnrollmentService as any).authority=async()=>({...secondary!.truth.authority,observedAt:Date.now()});await secondary.service.authorize(proofFor(otherOperator));}try{await action();}finally{config.operatorAddress=primary.wallet.address;(operatorEnrollmentService as any).authority=async()=>({...primary.truth.authority,observedAt:Date.now()});await primary.service.authorize(proofFor(operator));}};
  assert.ok(store.storageDirectory.includes("groupdeal-test-"));const originalFinance=JSON.stringify({orders:store.db.orders,campaigns:store.db.campaigns,identities:store.db.campaignIdentities});
  const created=create(),id=created.id,cipher=created.payloadEncrypted;await fail(id);assert.equal(store.db.emailOutbox[id].attempts,5);assert.equal(store.db.emailOutbox[id].status,"DLQ");
  assert.equal(NotificationService.outboxJob(operator,id,proofFor(operator)).job.canRedrive,true);
  error(()=>NotificationService.redriveEmail(owner,id,body(id),proofFor(owner)),"OPERATOR_ACCESS_REQUIRED",403);
  const first=body(id),result=NotificationService.redriveEmail(operator,id,first,proofFor(operator));assert.equal(result.requestId,first.idempotencyKey);assert.equal(result.job.status,"RETRY");assert.equal(result.job.attemptLimit,10);assert.equal(result.job.attempts,5);
  assert.equal(NotificationService.redriveEmail(operator,id,first,proofFor(operator)).job.redriveCount,1);
  await asSecondary(()=>error(()=>NotificationService.redriveEmail(otherOperator,id,first,proofFor(otherOperator)),"OUTBOX_IDEMPOTENCY_CONFLICT"));
  error(()=>NotificationService.redriveEmail(operator,id,{...first,idempotencyKey:crypto.randomUUID()},proofFor(operator)),"OUTBOX_STALE_STATE");
  await fail(id);assert.equal(store.db.emailOutbox[id].attempts,10);const second=body(id);NotificationService.redriveEmail(operator,id,second,proofFor(operator));
  const before=JSON.stringify(store.db.emailOutbox[id]);NotificationService.redriveEmail(operator,id,first,proofFor(operator));assert.equal(JSON.stringify(store.db.emailOutbox[id]),before);
  await fail(id);assert.equal(store.db.emailOutbox[id].attempts,15);assert.equal(store.db.emailOutbox[id].status,"DLQ");error(()=>NotificationService.redriveEmail(operator,id,body(id),proofFor(operator)),"REDRIVE_BUDGET_EXHAUSTED");assert.equal(store.db.emailOutbox[id].payloadEncrypted,cipher);
  assert.equal(JSON.stringify({orders:store.db.orders,campaigns:store.db.campaigns,identities:store.db.campaignIdentities}),originalFinance);
  assert.ok(!JSON.stringify(store.db).includes("synthetic-private-provider-diagnostic"));
  console.log("PASS operator role/CAS/idempotency, bounded15 total attempts, historical-key retry, stable encrypted snapshot and unchanged finance");

  for(const reason of ["CONTACT_NOT_CURRENT","EMAIL_DISABLED","PAYLOAD_INVALID","SOURCE_UNVERIFIED","CONTACT_REQUEST_REQUIRES_USER","LEGACY_RECIPIENT_UNBOUND"]){
    const target=user(),j=create(target);j.status="DLQ";j.attempts=5;j.lastError="PROVIDER_NOT_ACKNOWLEDGED";
    if(reason==="CONTACT_NOT_CURRENT")store.db.users[target].emailVerified=false;
    if(reason==="EMAIL_DISABLED")NotificationService.updatePreferences(target,{email:false});
    if(reason==="PAYLOAD_INVALID")j.payloadEncrypted=j.payloadEncrypted!.slice(0,-2)+"zz";
    if(reason==="SOURCE_UNVERIFIED")delete store.db.notifications[j.notificationId].source;
    if(reason==="CONTACT_REQUEST_REQUIRES_USER")j.purpose="CONTACT_VERIFICATION";
    if(reason==="LEGACY_RECIPIENT_UNBOUND")delete j.payloadEncrypted;
    store.save();assert.equal(NotificationService.outboxJob(operator,j.id,proofFor(operator)).job.canRedrive,false);error(()=>NotificationService.redriveEmail(operator,j.id,body(j.id),proofFor(operator)),reason);
  }
  const cancel=create(),started=deferred(),release=deferred();
  const sending=NotificationService.processEmailOutbox(async({idempotencyKey})=>{assert.equal(idempotencyKey,cancel.id);started.resolve();await release.promise;});await started.promise;
  assert.equal(NotificationService.cancelEmail(operator,cancel.id,proofFor(operator)).job.status,"CANCELLED");release.resolve();await sending;assert.equal(store.db.emailOutbox[cancel.id].status,"CANCELLED");assert.equal(NotificationService.cancelEmail(operator,cancel.id,proofFor(operator)).job.status,"CANCELLED");
  const accepted=create();await NotificationService.processEmailOutbox(async()=>{});error(()=>NotificationService.cancelEmail(operator,accepted.id,proofFor(operator)),"OUTBOX_CANNOT_CANCEL");
  const reader=new TransactionalStore(store.storageDirectory),restored=structuredClone(reader.db);reader.close();store.replace(restored);
  assert.equal(store.db.emailOutbox[id].redrives?.length,2);assert.equal(store.db.emailOutbox[id].attempts,15);assert.equal(store.db.emailOutbox[cancel.id].status,"CANCELLED");quiet();
  console.log("PASS contact/preferences/source/cipher/OTP/legacy gates, cancellation against in-flight completion and committed SQLite reload");

  NotificationService.updatePreferences(owner,{email:false});const ownIds:string[]=[];
  for(let i=0;i<130;i++){const n=NotificationService.create(owner,{type:"PAGE_FIXTURE",title:"Public page fixture",message:"Public status",dedupeKey:"page-"+i});assert.ok(n);store.db.notifications[n.id].createdAt=1700000002000;ownIds.push(n.id);}
  store.save();const page=NotificationService.notificationPage(owner,{limit:"20"});assert.equal(page.notifications.length,20);assert.ok(page.unread>100);assert.ok(page.pagination.nextCursor);
  error(()=>NotificationService.notificationPage(stranger,{cursor:page.pagination.nextCursor!}),"NOTIFICATION_INVALID_CURSOR",400);
  const seen=new Set<string>();let cursor:string|undefined;
  do{const p=NotificationService.notificationPage(owner,{limit:"20",...(cursor?{cursor}:{})});for(const n of p.notifications){assert.ok(n);assert.equal(n.userId,owner);assert.ok(!seen.has(n.id));seen.add(n.id);}cursor=p.pagination.nextCursor??undefined;}while(cursor);
  for(const n of ownIds)assert.ok(seen.has(n));
  const inboxPage=NotificationService.listEmailOutbox(operator,{limit:"2"},proofFor(operator));assert.ok(inboxPage.pagination.nextCursor);
  await asSecondary(()=>error(()=>NotificationService.listEmailOutbox(otherOperator,{cursor:inboxPage.pagination.nextCursor!},proofFor(otherOperator)),"OUTBOX_INVALID_CURSOR",400));
  error(()=>NotificationService.listEmailOutbox(operator,{cursor:inboxPage.pagination.nextCursor!,status:"DLQ"},proofFor(operator)),"OUTBOX_INVALID_CURSOR",400);
  error(()=>NotificationService.listEmailOutbox(operator,{cursor:inboxPage.pagination.nextCursor!.slice(0,-1)+"x"},proofFor(operator)),"OUTBOX_INVALID_CURSOR",400);
  const safe=JSON.stringify(NotificationService.emailOutbox(operator,proofFor(operator)));for(const field of ["@example.test","payloadEncrypted","leaseToken","synthetic-private-provider-diagnostic",'"actorId"'])assert.ok(!safe.includes(field));
  console.log("PASS all unread count, notification history beyond100/tied timestamps, owned/filter-bound signed cursors and operator DTO privacy");

  const app=express();app.use(express.json());let loseAck=false;
  app.use((req,res,next)=>{if(loseAck&&req.path.endsWith("/redrive")){loseAck=false;(res as any).json=()=>{res.destroy();return res;};}next();});app.use("/api/operator",operatorRouter);app.use("/api/notifications",notificationRouter);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+(server.address() as any).port;
  const headers=(actor:string,roles?:string[])=>({Authorization:"Bearer "+(roles?jwt.sign({userId:actor,roles},config.jwtSecret,{expiresIn:"1h"}):tokenFor(actor)),"Content-Type":"application/json"});
  try{
    assert.equal((await fetch(base+"/api/operator/email-outbox")).status,401);assert.equal((await fetch(base+"/api/operator/email-outbox",{headers:headers(owner,["operator"])})).status,403);
    const appOperator=SessionService.issue(store.db.users[operator]);assert.equal((await fetch(base+"/api/operator/email-outbox",{headers:{Authorization:'Bearer '+appOperator}})).status,403);
    const target=user(),httpJob=create(target);httpJob.status="DLQ";httpJob.attempts=5;httpJob.lastError="PROVIDER_NOT_ACKNOWLEDGED";store.save();const request=body(httpJob.id);
    const denied=await fetch(base+"/api/operator/email-outbox/"+httpJob.id+"/redrive",{method:"POST",headers:headers(owner,["operator"]),body:JSON.stringify(request)});assert.equal(denied.status,403);
    const invalid=await fetch(base+"/api/operator/email-outbox/"+httpJob.id+"/redrive",{method:"POST",headers:headers(operator),body:JSON.stringify({...request,recipient:"not-allowed@example.test"})});assert.equal(invalid.status,400);
    loseAck=true;await assert.rejects(fetch(base+"/api/operator/email-outbox/"+httpJob.id+"/redrive",{method:"POST",headers:headers(operator),body:JSON.stringify(request)}));
    const recovered=await fetch(base+"/api/operator/email-outbox/"+httpJob.id,{headers:headers(operator)}).then(r=>r.json()) as any;assert.equal(recovered.job.id,httpJob.id);assert.ok(recovered.job.redriveRequestIds.includes(request.idempotencyKey));assert.equal(recovered.job.status,"RETRY");assert.ok(!JSON.stringify(recovered).includes("@example.test"));
    const repeat=await fetch(base+"/api/operator/email-outbox/"+httpJob.id+"/redrive",{method:"POST",headers:headers(operator),body:JSON.stringify(request)});assert.equal(repeat.status,202);assert.equal(store.db.emailOutbox[httpJob.id].redrives?.length,1);
    const canceled=await fetch(base+"/api/operator/email-outbox/"+httpJob.id+"/cancel",{method:"POST",headers:headers(operator),body:"{}"});assert.equal(canceled.status,200);assert.equal(store.db.emailOutbox[httpJob.id].status,"CANCELLED");
    const notificationPage=await fetch(base+"/api/notifications?limit=20",{headers:headers(owner)}).then(r=>r.json()) as any;assert.equal(notificationPage.notifications.length,20);assert.ok(notificationPage.unread>100);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  console.log("PASS real loopback HTTP auth/role-spoof/schema, lost ACK/targeted GET/idempotent replay, cancellation and owned inbox pagination");
  console.log("PASS OPERATOR_OUTBOX: 4 scoped checks; isolated SQLite/synthetic sender/loopback HTTP, no live inbox or financial acceptance");
}
run().catch((error:unknown)=>{console.error("FAIL OPERATOR_OUTBOX: "+(error instanceof Error?error.name:"UnknownError"));if(error instanceof Error)for(const frame of (error.stack||"").split("\n").filter(line=>/^\s+at /.test(line)&&/operator_outbox\.test\.ts/.test(line)).slice(0,4))console.error(frame);process.exitCode=1;});
