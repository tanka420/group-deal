import {enrollFixtureOperator} from './helpers/operatorFixture';
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import http from "node:http";
import express from "express";
import nodemailer from "nodemailer";
import { store, TransactionalStore, EmailOutboxRecord } from "../src/db/store";
import { config } from "../src/config";
import { NotificationService, OutboxError } from "../src/services/notificationService";
import {SessionService} from '../src/services/sessionService';
import { notificationRouter } from "../src/routes/notificationRoutes";
import { operatorRouter } from "../src/routes/operatorRoutes";

const user = (verified: boolean | undefined = true, email?: string) => {
  const id="mail_fixture_"+crypto.randomUUID();
  store.db.users[id]={id,email:email??`${id}@example.test`,emailVerified:verified,createdAt:Date.now(),roles:["buyer"],activeWallet:null};
  return id;
};
const create = (id: string, key=crypto.randomUUID()) => {
  store.save(); // Commit fixture recipient/preferences before the standalone producer reads SQL.
  const notification=NotificationService.create(id,{type:"TEST",title:"Public fixture notification",message:"Fixture resource status",dedupeKey:key});
  const job=Object.values(store.db.emailOutbox).find(j => j.notificationId === notification?.id);
  return {notification,job};
};
const job = (id:string) => store.db.emailOutbox[id];
const clearDue = () => { for(const j of Object.values(store.db.emailOutbox)) if(["QUEUED","RETRY","PROCESSING"].includes(j.status))j.status="SENT"; store.save(); };
const deferred = () => { let resolve!:()=>void; const promise=new Promise<void>(done => resolve=done);return {promise,resolve}; };
async function run() {
  for(const verified of [undefined,false]) {
    const id=user();store.db.users[id].emailVerified=verified;const n=create(id);
    assert.ok(n.notification); assert.equal(n.job,undefined);
  }
  const bad=user(true,"not-an-email");create(bad);assert.equal(NotificationService.contactStatus(bad),"MISSING");
  assert.equal(Object.values(store.db.emailOutbox).filter(j=>j.userId===bad).length,0);
  console.log("PASS contact guard: undefined/false/invalid recipient never queued");

  const owner=user(),other=user();
  assert.throws(()=>NotificationService.updatePreferences(owner,{email:"true"}));
  assert.throws(()=>NotificationService.updatePreferences(owner,{email:true,recipient:"different@example.test"}));
  NotificationService.updatePreferences(owner,{inApp:false,email:true});
  const hidden=NotificationService.create(owner,{type:"TEST",title:"Public hidden event",message:"Fixture",dedupeKey:"hidden"});
  assert.equal(hidden,null);assert.equal(NotificationService.list(owner).length,0);
  const hiddenRow=Object.values(store.db.notifications).find(n=>n.userId===owner)!;
  assert.throws(()=>NotificationService.markRead(owner,hiddenRow.id),/not found/);
  NotificationService.updatePreferences(owner,{inApp:true});
  const visible=create(owner,"visible");assert.ok(visible.notification);
  (store.db.notifications[visible.notification.id] as any).privateField="fixture-private-extra";
  assert.equal((NotificationService.list(owner)[0] as any).privateField,undefined);
  assert.throws(()=>NotificationService.markRead(other,visible.notification!.id),/not found/);
  assert.ok(NotificationService.markRead(owner,visible.notification.id).readAt);
  assert.equal((NotificationService.markRead(owner,visible.notification.id) as any).privateField,undefined);
  assert.equal(create(owner,"visible").notification?.id,visible.notification.id);
  assert.equal(Object.values(store.db.emailOutbox).filter(j=>j.notificationId===visible.notification!.id).length,1);
  console.log("PASS strict preferences, in-app snapshot, dedupe, allowlist and read ownership");
  clearDue();

  for(const change of ["contact","unverified","preference","body","cipher","swapped","legacy"] as const) {
    const id=user(),created=create(id);const j=created.job!;
    assert.ok(j.payloadEncrypted?.startsWith("v2:"));assert.ok(!j.payloadEncrypted.includes(store.db.users[id].email));
    if(change==="contact")store.db.users[id].email="replacement@example.test";
    if(change==="unverified")store.db.users[id].emailVerified=false;
    if(change==="preference")NotificationService.updatePreferences(id,{email:false});
    if(change==="body")store.db.notifications[j.notificationId].message="Changed source content";
    if(change==="cipher")j.payloadEncrypted=j.payloadEncrypted!.slice(0,-2)+"zz";
    if(change==="swapped") { const otherJob=create(user()).job!;j.payloadEncrypted=otherJob.payloadEncrypted;otherJob.status="SENT"; }
    if(change==="legacy")delete j.payloadEncrypted;
    store.save();let calls=0;await NotificationService.processEmailOutbox(async()=>{calls++;});assert.equal(calls,0);
    assert.equal(job(j.id).status,["contact","unverified","preference"].includes(change)?"CANCELLED":"DLQ");
  }
  console.log("PASS immutable recipient/body binding, cancellation, corrupted/swapped payload and legacy quarantine");

  const a=create(user()).job!,b=create(user()).job!,entered=deferred(),release=deferred(),calls:string[]=[];
  const first=NotificationService.processEmailOutbox(async({idempotencyKey})=>{calls.push(idempotencyKey);entered.resolve();await release.promise;});
  await entered.promise;await NotificationService.processEmailOutbox(async({idempotencyKey})=>{calls.push(idempotencyKey);});
  release.resolve();await first;
  assert.equal(calls.length,2);assert.equal(new Set(calls).size,2);assert.equal(job(a.id).status,"SENT");assert.equal(job(b.id).status,"SENT");
  console.log("PASS overlapping drains recheck cached candidates and never double claim a live lease");

  const stale=create(user()).job!,started=deferred(),unblock=deferred();let stableKeys:string[]=[];
  const old=NotificationService.processEmailOutbox(async({idempotencyKey})=>{stableKeys.push(idempotencyKey);started.resolve();await unblock.promise;throw new Error("private-old-provider-diagnostic");});
  await started.promise;job(stale.id).leaseExpiresAt=Date.now()-1;store.save();
  await NotificationService.processEmailOutbox(async({idempotencyKey})=>{stableKeys.push(idempotencyKey);});
  unblock.resolve();await old;
  assert.equal(job(stale.id).status,"SENT");assert.equal(job(stale.id).attempts,2);assert.equal(job(stale.id).lastError,undefined);
  assert.deepEqual(stableKeys,[stale.id,stale.id]);
  console.log("PASS expired lease recovery uses stable key; stale failure cannot overwrite current SENT");

  const interrupted=create(user()).job!;interrupted.status="PROCESSING";interrupted.attempts=1;interrupted.leaseToken="fixture-abandoned-lease";interrupted.leaseExpiresAt=Date.now()-1;store.save();
  const persisted=new TransactionalStore(path.dirname((store as any).filePath));
  const reloaded=structuredClone(persisted.db);persisted.close();assert.equal(reloaded.emailOutbox[interrupted.id].status,"PROCESSING");
  store.replace(reloaded);let resumedKey="";await NotificationService.processEmailOutbox(async({idempotencyKey})=>{resumedKey=idempotencyKey;});
  assert.equal(resumedKey,interrupted.id);assert.equal(job(interrupted.id).status,"SENT");assert.equal(job(interrupted.id).attempts,2);
  console.log("PASS isolated SQLite reload retains abandoned lease and resumes persisted job");

  const fail=create(user()).job!;
  for(let i=0;i<5;i++){job(fail.id).nextAttemptAt=0;store.save();await NotificationService.processEmailOutbox(async()=>{throw new Error("private-provider-token-or-address");});}
  assert.equal(job(fail.id).status,"DLQ");assert.equal(job(fail.id).attempts,5);
  assert.equal(job(fail.id).lastError,"PROVIDER_NOT_ACKNOWLEDGED");
  assert.ok(!JSON.stringify(store.db).includes("private-provider-token-or-address"));
  console.log("PASS bounded retry/DLQ and provider error redaction");

  const previous={url:config.emailProviderUrl,token:config.emailProviderToken,smtp:config.smtpConfigured};
  const accepted=new Set<string>();let requestCount=0,forwarded=0;
  const receiver=http.createServer((req,res)=>{
    if(req.url==="/forwarded"){forwarded++;res.writeHead(202).end();return;}
    if(req.url==="/redirect"){res.writeHead(302,{Location:"/forwarded"}).end();return;}
    let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
      requestCount++;const key=String(req.headers["idempotency-key"]);accepted.add(key);
      if(requestCount===1){req.socket.destroy();return;}
      res.writeHead(202).end();
    });
  });
  await new Promise<void>(resolve=>receiver.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+(receiver.address() as any).port;
  try{
    config.smtpConfigured=false;config.emailProviderToken=crypto.randomBytes(24).toString("hex");config.emailProviderUrl=base+"/mail";
    const lost=create(user()).job!;await NotificationService.processEmailOutbox();assert.equal(job(lost.id).status,"RETRY");
    job(lost.id).nextAttemptAt=0;store.save();await NotificationService.processEmailOutbox();assert.equal(job(lost.id).status,"SENT");
    assert.equal(requestCount,2);assert.equal(accepted.size,1);assert.ok(accepted.has(lost.id));
    config.emailProviderUrl=base+"/redirect";const redirected=create(user()).job!;await NotificationService.processEmailOutbox();
    assert.equal(job(redirected.id).status,"RETRY");assert.equal(forwarded,0);job(redirected.id).status="DLQ";store.save();
    console.log("PASS real loopback HTTP lost ACK/retry preserves key; redirect never forwards credential");
  }finally{config.emailProviderUrl=previous.url;config.emailProviderToken=previous.token;config.smtpConfigured=previous.smtp;await new Promise<void>(resolve=>receiver.close(()=>resolve()));}

  const originalTransport=nodemailer.createTransport;let closed=0;const messageIds:string[]=[];let accept=false;
  try{
    config.smtpConfigured=true;
    (nodemailer as any).createTransport=(options:any)=>{
      assert.equal(options.logger,false);assert.equal(options.debug,false);assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true);
      return {sendMail:async(input:any)=>{messageIds.push(input.messageId);return {accepted:accept?[input.to]:[]};},close:()=>{closed++;}};
    };
    const smtp=create(user()).job!;await NotificationService.processEmailOutbox();assert.equal(job(smtp.id).status,"RETRY");
    accept=true;job(smtp.id).nextAttemptAt=0;store.save();await NotificationService.processEmailOutbox();assert.equal(job(smtp.id).status,"SENT");
    assert.deepEqual(messageIds,[`<${smtp.id}@groupdeal.local>`,`<${smtp.id}@groupdeal.local>`]);assert.equal(closed,2);
    console.log("PASS SMTP acceptance guard, stable Message-ID, safe transport settings and close");
  }finally{(nodemailer as any).createTransport=originalTransport;config.smtpConfigured=previous.smtp;}

  await runAcl(owner,other,fail.id,visible.notification!.id);
  console.log("PASS NOTIFICATION_DURABILITY: 10 scoped checks; local fixtures, no live mail or original DB mutation");
}
const fixtureTokens=new Map<string,string>();const tokenFor=(id:string)=>{let token=fixtureTokens.get(id);if(!token){token=SessionService.issue(store.db.users[id]);fixtureTokens.set(id,token);}return token;};
const proofFor=(id:string)=>SessionService.authenticate(tokenFor(id));
async function runAcl(owner:string,other:string,failId:string,visibleId:string){
  const operator=user();store.db.users[operator].roles=["operator"];
  (job(failId) as any).lastError="legacy-private-email-or-token";store.save();
  const enrollment=await enrollFixtureOperator(operator,proofFor(operator),{chainId:config.arcChainId});
  assert.throws(()=>NotificationService.emailOutbox(owner,proofFor(owner)),error=>error instanceof OutboxError&&error.code==='OPERATOR_ACCESS_REQUIRED'&&error.status===403);
  const safe=JSON.stringify(NotificationService.emailOutbox(operator,enrollment.proof));
  for(const privateField of ["payloadEncrypted","buyer@example.test","leaseToken","legacy-private-email-or-token"])assert.ok(!safe.includes(privateField));
  assert.ok(safe.includes("LEGACY_ERROR_REDACTED"));
  const app=express();app.use(express.json());app.use("/api/notifications",notificationRouter);app.use("/api/operator",operatorRouter);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const root="http://127.0.0.1:"+(server.address() as any).port;
  const headers=(id:string)=>({Authorization:"Bearer "+tokenFor(id),"Content-Type":"application/json"});
  try{
    assert.equal((await fetch(root+"/api/notifications/preferences")).status,401);
    assert.equal((await fetch(root+"/api/operator/email-outbox",{headers:headers(owner)})).status,403);
    const response=await fetch(root+"/api/operator/email-outbox",{headers:headers(operator)});assert.equal(response.status,200);
    const dto=JSON.stringify(await response.json());assert.ok(!dto.includes("legacy-private-email-or-token"));assert.ok(!dto.includes("payloadEncrypted"));
    const prefs=await fetch(root+"/api/notifications/preferences",{headers:headers(owner)}).then(r=>r.json()) as any;
    assert.equal(prefs.contactStatus,"VERIFIED");assert.equal(prefs.email,undefined);
    const invalid=await fetch(root+"/api/notifications/preferences",{method:"PUT",headers:headers(owner),body:JSON.stringify({email:"false"})});assert.equal(invalid.status,400);
    const denied=await fetch(root+"/api/notifications/"+visibleId+"/read",{method:"POST",headers:headers(other)});assert.equal(denied.status,404);
    console.log("PASS real HTTP auth/operator ACL, contact status, strict schema and cross-account read denial");
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
async function aclOnly(){const owner=user(),other=user(),visible=create(owner),failed=create(other).job!;failed.status='DLQ';failed.attempts=5;store.save();await runAcl(owner,other,failed.id,visible.notification!.id);console.log('PASS NOTIFICATION_DURABILITY_ACL: 1 scoped check; retained first9 worker groups not repeated');}
(process.argv.includes('--acl-only')?aclOnly():run()).catch((error:unknown)=>{
  console.error("FAIL NOTIFICATION_DURABILITY: "+(error instanceof Error?error.name:"UnknownError"));
  if(error instanceof Error)for(const frame of (error.stack||"").split("\n").filter(line=>/^\s+at /.test(line)&&/notification_(?:durability|outbox)\.test\.ts|notificationService\.ts/.test(line)).slice(0,4))console.error(frame);
  process.exitCode=1;
});
