import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import jwt from "jsonwebtoken";
import {store,TransactionalStore,sanitizeUser} from "../src/db/store";
import {config} from "../src/config";
import {SessionService,type SessionProof} from '../src/services/sessionService';
import {ContactService,ContactError} from "../src/services/contactService";
import {NotificationService} from "../src/services/notificationService";
import {verifiedContactEmail} from "../src/services/contactIdentity";
import {AuthService} from "../src/services/authService";
import {notificationRouter} from "../src/routes/notificationRoutes";
import {encryptEntitlement,decryptEntitlement} from "../src/utils/crypto";

const fixtureProofs=new Map<string,SessionProof>();const proofFor=(id:string)=>{let current=fixtureProofs.get(id);if(!current){current=SessionService.authenticate(SessionService.issue(store.db.users[id]));fixtureProofs.set(id,current);}return current;};
const user=(verified=false)=>{
  const id="contact_fixture_"+crypto.randomUUID();
  store.db.users[id]={id,email:id+"@example.test",emailVerified:verified,loginMethod:"EVM_WALLET",createdAt:Date.now(),roles:["buyer"],activeWallet:null};
  store.db.userByEmail[store.db.users[id].email]=id;
  store.db.notificationPreferences[id]={inApp:true,email:false};store.save();return id;
};
const email=()=>"contact_"+crypto.randomUUID()+"@example.test";
const request=(id:string,to=email(),key=crypto.randomUUID())=>ContactService.request(id,{email:to,idempotencyKey:key,language:"vi"},id,proofFor(id));
const pending=(id:string)=>store.db.users[id].contact!.pending!;
const job=(id:string)=>store.db.emailOutbox[pending(id).outboxId];
const error=(fn:()=>unknown,code:string,status?:number)=>assert.throws(fn,(e:unknown)=>e instanceof ContactError&&e.code===code&&(status===undefined||e.status===status));
const codes=new Map<string,string>();
const drain=()=>NotificationService.processEmailOutbox(async mail=>{
  const code=mail.text.match(/\b\d{6}\b/)?.[0];if(code)codes.set(mail.idempotencyKey,code);
});
const code=(id:string)=>{const value=codes.get(job(id).id);assert.ok(value);return value;};
const verify=(id:string)=>ContactService.verify(id,{challengeId:pending(id).id,code:code(id)},proofFor(id));
const noSecrets=(dto:unknown,id:string)=>{
  const text=JSON.stringify(dto);for(const field of ["targetEncrypted","payloadEncrypted","codeDigest","salt","keyId","requestKey"])assert.ok(!text.includes(field));
  const target=JSON.parse(decryptEntitlement(pending(id).targetEncrypted)).email;assert.ok(!text.includes(target));
};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return {promise,resolve};};

async function run(){
  assert.ok(store.filePath.includes("groupdeal-test-"));
  const old={smtp:config.smtpConfigured,url:config.emailProviderUrl,token:config.emailProviderToken,key:config.masterEncryptionKey,keyId:config.masterEncryptionKeyId,previous:{...config.previousEncryptionKeys}};
  const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
  const advance=()=>{clock+=61000;};
  config.smtpConfigured=false;config.emailProviderUrl="http://127.0.0.1:9";config.emailProviderToken=crypto.randomBytes(24).toString("hex");
  try{
    const id=user(),target=email(),key=crypto.randomUUID(),identity=structuredClone(store.db.users[id]);
    const view=request(id,target,key);assert.equal(view.status,"UNVERIFIED");assert.equal(job(id).status,"QUEUED");noSecrets(view,id);
    assert.equal(Object.keys(store.db.notifications).length,0);
    assert.deepEqual(ContactService.request(id,{email:target,idempotencyKey:key,language:"vi"},id,proofFor(id)),view);
    assert.equal(Object.values(store.db.emailOutbox).filter(j=>j.userId===id).length,1);
    error(()=>request(id,email(),key),"CONTACT_IDEMPOTENCY_CONFLICT",409);
    error(()=>request(id),"CONTACT_RATE_LIMIT",429);
    assert.ok(Object.values(store.db.rateLimits).some(row=>row.count===2));
    error(()=>ContactService.request(id,{email:target,idempotencyKey:crypto.randomUUID(),userId:"other"},id,proofFor(id)),"CONTACT_INVALID_INPUT");
    error(()=>request(id,"one@example.test\r\nBcc:two@example.test"),"CONTACT_INVALID_INPUT");
    assert.equal(store.db.users[id].email,identity.email);assert.equal(store.db.users[id].emailVerified,false);
    await drain();assert.equal(job(id).status,"SENT");const verified=verify(id);assert.equal(verified.status,"VERIFIED");noSecrets(verified,id);
    assert.equal(verifiedContactEmail(id),target);assert.equal(store.db.users[id].email,identity.email);assert.equal(store.db.userByEmail[target],undefined);
    assert.equal(store.db.users[id].emailVerified,false);assert.deepEqual(store.db.notificationPreferences[id],{inApp:true,email:false});
    assert.equal((sanitizeUser(store.db.users[id]) as any).contact,undefined);
    error(()=>verify(id),"CONTACT_CHALLENGE_INACTIVE",409);
    NotificationService.create(id,{type:"TEST",title:"Contact fixture event",message:"Public status"});
    assert.equal(Object.values(store.db.emailOutbox).filter(j=>j.userId===id).length,1);
    NotificationService.updatePreferences(id,{email:true});const event=NotificationService.create(id,{type:"TEST",title:"Contact fixture event",message:"Public status"})!;
    const eventJob=Object.values(store.db.emailOutbox).find(j=>j.notificationId===event.id)!;
    assert.equal(JSON.parse(decryptEntitlement(eventJob.payloadEncrypted!)).to,target);await drain();
    console.log("PASS separate contact identity, encrypted/masked DTO, idempotency, persistent rate budget and explicit notification opt-in");

    const circleId="contact-circle-"+crypto.randomUUID(),login=email(),circle=AuthService.createCircleSession(login,circleId),circleUser=circle.user.id;
    const before={emails:structuredClone(store.db.userByEmail),wallets:structuredClone(store.db.userByWallet),circles:structuredClone(store.db.userByCircleId),orders:structuredClone(store.db.orders),identities:structuredClone(store.db.campaignIdentities)};
    const replacement=email();request(circleUser,replacement);await drain();verify(circleUser);
    AuthService.createCircleSession(login,circleId);assert.equal(verifiedContactEmail(circleUser),replacement);assert.equal(store.db.users[circleUser].email,login);
    assert.deepEqual(store.db.userByEmail,before.emails);assert.deepEqual(store.db.userByWallet,before.wallets);assert.deepEqual(store.db.userByCircleId,before.circles);
    assert.deepEqual(store.db.orders,before.orders);assert.deepEqual(store.db.campaignIdentities,before.identities);
    ContactService.remove(circleUser,proofFor(circleUser));assert.equal(verifiedContactEmail(circleUser),null);AuthService.createCircleSession(login,circleId);assert.equal(verifiedContactEmail(circleUser),null);
    assert.equal(store.db.users[circleUser].emailVerified,true);assert.equal(ContactService.view(circleUser,proofFor(circleUser)).status,"MISSING");
    console.log("PASS Circle refresh preserves separate contact and removal tombstone; identity maps and financial projections unchanged");

    const locked=user();request(locked);await drain();const incorrect=code(locked)==="000000"?"000001":"000000";
    for(let i=0;i<5;i++){error(()=>ContactService.verify(locked,{challengeId:pending(locked).id,code:incorrect},proofFor(locked)),"CONTACT_CODE_INVALID");assert.equal(pending(locked).attempts,i+1);}
    assert.equal(pending(locked).state,"LOCKED");error(()=>verify(locked),"CONTACT_CHALLENGE_INACTIVE",409);assert.equal(verifiedContactEmail(locked),null);
    const fifth=user();request(fifth);await drain();const bad=code(fifth)==="000000"?"000001":"000000";
    for(let i=0;i<4;i++)error(()=>ContactService.verify(fifth,{challengeId:pending(fifth).id,code:bad},proofFor(fifth)),"CONTACT_CODE_INVALID");
    assert.equal(verify(fifth).status,"VERIFIED");assert.equal(pending(fifth).attempts,5);
    const expired=user();request(expired);await drain();pending(expired).expiresAt=clock;store.save();error(()=>verify(expired),"CONTACT_CHALLENGE_EXPIRED",410);assert.equal(pending(expired).state,"EXPIRED");
    const late=user();request(late);pending(late).expiresAt=clock;store.save();let sends=0;await NotificationService.processEmailOutbox(async()=>{sends++;});assert.equal(sends,0);assert.equal(job(late).status,"CANCELLED");
    console.log("PASS five-attempt lock, valid final attempt, one-use replay denial and expired verification/mail suppression");

    const a=user(),b=user();request(a);request(b);await drain();
    error(()=>ContactService.verify(b,{challengeId:pending(a).id,code:code(a)},proofFor(b)),"CONTACT_CHALLENGE_INVALID",404);
    const original=job(a).payloadEncrypted;job(a).payloadEncrypted=job(b).payloadEncrypted;job(a).status="QUEUED";store.save();await drain();assert.equal(job(a).status,"DLQ");job(a).payloadEncrypted=original;
    const originalTarget=pending(a).targetEncrypted;pending(a).targetEncrypted=pending(b).targetEncrypted;store.save();error(()=>verify(a),"CONTACT_BINDING_INVALID",409);pending(a).targetEncrypted=originalTarget;
    pending(a).attempts=5;pending(a).state="PENDING";store.save();error(()=>verify(a),"CONTACT_CHALLENGE_INACTIVE",409);
    verify(b);const verifiedCipher=store.db.users[b].contact!.verified!.payloadEncrypted;
    store.db.users[a].contact!.verified={source:"CONTACT_CHALLENGE",payloadEncrypted:verifiedCipher};store.db.users[a].contact!.revision=store.db.users[b].contact!.revision;store.save();assert.equal(verifiedContactEmail(a),null);
    console.log("PASS cross-account challenge, target/mail/verified ciphertext swap denial and corrupted attempt budget fail-closed");

    const superseded=user();request(superseded);await drain();const oldChallenge=pending(superseded).id,oldCode=code(superseded);advance();request(superseded);await drain();
    error(()=>ContactService.verify(superseded,{challengeId:oldChallenge,code:oldCode},proofFor(superseded)),"CONTACT_CHALLENGE_INVALID",404);verify(superseded);
    NotificationService.updatePreferences(superseded,{email:true});const n=NotificationService.create(superseded,{type:"TEST",title:"Old contact fixture",message:"Public status"})!;
    const queued=Object.values(store.db.emailOutbox).find(j=>j.notificationId===n.id)!;
    advance();request(superseded);const entered=deferred(),release=deferred();
    const processing=NotificationService.processEmailOutbox(async mail=>{if(mail.idempotencyKey===job(superseded).id){const value=mail.text.match(/\b\d{6}\b/)?.[0];assert.ok(value);codes.set(mail.idempotencyKey,value);entered.resolve();await release.promise;}});
    await entered.promise;const activeJobId=job(superseded).id;
    const during=NotificationService.create(superseded,{type:"TEST",title:"Contact fixture pending switch",message:"Public status"})!;
    const duringJob=Object.values(store.db.emailOutbox).find(j=>j.notificationId===during.id)!;
    verify(superseded);release.resolve();await processing;
    assert.equal(store.db.emailOutbox[activeJobId].status,"CANCELLED");assert.equal(store.db.emailOutbox[queued.id].status,"SENT");
    assert.equal(store.db.emailOutbox[duringJob.id].status,"CANCELLED");
    const unsent=NotificationService.create(superseded,{type:"TEST",title:"Contact fixture cancel",message:"Public status"})!;
    const unsentJob=Object.values(store.db.emailOutbox).find(j=>j.notificationId===unsent.id)!;ContactService.remove(superseded,proofFor(superseded));assert.equal(store.db.emailOutbox[unsentJob.id].status,"CANCELLED");assert.equal(verifiedContactEmail(superseded),null);
    console.log("PASS superseded code denial, contact changes cancel pending mail and stale provider completion cannot undo cancellation");

    const restored=user();request(restored);await drain();const invalid=code(restored)==="000000"?"000001":"000000";
    error(()=>ContactService.verify(restored,{challengeId:pending(restored).id,code:invalid},proofFor(restored)),"CONTACT_CODE_INVALID");
    const reader=new TransactionalStore(path.dirname(store.filePath)),reloaded=structuredClone(reader.db);reader.close();store.replace(reloaded);
    assert.equal(pending(restored).attempts,1);assert.equal(pending(restored).state,"PENDING");assert.equal(job(restored).status,"SENT");
    const challengeKey=pending(restored).keyId;config.previousEncryptionKeys[challengeKey]=config.masterEncryptionKey;config.masterEncryptionKeyId="contact-fixture-rotated";config.masterEncryptionKey=crypto.randomBytes(32).toString("hex");
    assert.equal(verify(restored).status,"VERIFIED");assert.ok(store.db.users[restored].contact!.verified!.payloadEncrypted.startsWith("v2:contact-fixture-rotated:"));
    const unavailable=user();request(unavailable);await drain();const retained=config.masterEncryptionKey;config.masterEncryptionKeyId="contact-fixture-other";config.masterEncryptionKey=crypto.randomBytes(32).toString("hex");
    error(()=>verify(unavailable),"CONTACT_BINDING_INVALID",409);assert.equal(pending(unavailable).attempts,0);config.previousEncryptionKeys["contact-fixture-rotated"]=retained;assert.equal(verify(unavailable).status,"VERIFIED");
    console.log("PASS isolated committed SQLite reload preserves attempts/challenge; retained encryption versions permit rotation and missing keys fail closed");

    const app=express();app.use(express.json());let loseAck=false;
    app.use((req,res,next)=>{if(req.path==="/api/notifications/contact/verify"&&loseAck){(res as any).json=()=>{res.destroy();return res;};loseAck=false;}next();});app.use("/api/notifications",notificationRouter);
    const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
    const base="http://127.0.0.1:"+(server.address() as any).port+"/api/notifications/contact";
    const headers=(owner:string)=>({Authorization:"Bearer "+jwt.sign({userId:owner},config.jwtSecret,{expiresIn:"1h"}),"Content-Type":"application/json"});
    const httpUser=user(),httpOther=user();
    try{
      assert.equal((await fetch(base)).status,401);
      const posted=await fetch(base+"/request",{method:"POST",headers:headers(httpUser),body:JSON.stringify({email:email(),idempotencyKey:crypto.randomUUID()})});assert.equal(posted.status,202);noSecrets(await posted.json(),httpUser);await drain();
      const denied=await fetch(base+"/verify",{method:"POST",headers:headers(httpOther),body:JSON.stringify({challengeId:pending(httpUser).id,code:code(httpUser)})});assert.equal(denied.status,404);
      const limited=await fetch(base+"/request",{method:"POST",headers:headers(httpUser),body:JSON.stringify({email:email(),idempotencyKey:crypto.randomUUID()})});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get("Retry-After"))>0);
      loseAck=true;await assert.rejects(fetch(base+"/verify",{method:"POST",headers:headers(httpUser),body:JSON.stringify({challengeId:pending(httpUser).id,code:code(httpUser)})}));
      const recovered=await fetch(base,{headers:headers(httpUser)}).then(r=>r.json()) as any;assert.equal(recovered.contact.status,"VERIFIED");assert.equal(recovered.contact.lastVerificationId,pending(httpUser).id);noSecrets(recovered,httpUser);
      const wrongOwner=await fetch(base,{headers:headers(httpOther)}).then(r=>r.json()) as any;assert.equal(wrongOwner.contact.userId,httpOther);assert.equal(wrongOwner.contact.lastVerificationId,null);
      assert.equal((await fetch(base,{method:"DELETE",headers:headers(httpUser)})).status,200);assert.equal(verifiedContactEmail(httpUser),null);
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
    console.log("PASS real loopback HTTP session ownership, Retry-After, lost verification ACK recovered by GET and scoped removal");

    const noProvider=user();config.emailProviderUrl="";config.emailProviderToken="";
    error(()=>request(noProvider),"CONTACT_EMAIL_UNAVAILABLE",503);assert.equal(store.db.users[noProvider].contact,undefined);
    const audit=JSON.stringify(store.db.auditLogs);assert.ok(!audit.includes("codeDigest"));assert.ok(!audit.includes("targetEncrypted"));
    assert.ok(!JSON.stringify(store.db.rateLimits).includes("@example.test"));
    console.log("PASS unavailable provider leaves identity unchanged; audit/rate records omit plaintext codes and recipient");
    console.log("PASS CONTACT_VERIFICATION: 8 scoped checks; isolated SQLite, synthetic sender and loopback HTTP; no live inbox/auth recovery acceptance");
  }finally{
    Date.now=realNow;config.smtpConfigured=old.smtp;config.emailProviderUrl=old.url;config.emailProviderToken=old.token;config.masterEncryptionKey=old.key;config.masterEncryptionKeyId=old.keyId;config.previousEncryptionKeys=old.previous;
  }
}
run().catch((error:unknown)=>{
  console.error("FAIL CONTACT_VERIFICATION: "+(error instanceof Error?error.name:"UnknownError"));
  if(error instanceof Error)for(const frame of (error.stack||"").split("\n").filter(line=>/^\s+at /.test(line)&&/contact_verification\.test\.ts/.test(line)).slice(0,4))console.error(frame);
  process.exitCode=1;
});
