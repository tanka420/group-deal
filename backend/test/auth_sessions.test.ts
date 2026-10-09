import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import jwt from "jsonwebtoken";
import express from "express";
import {config} from "../src/config";
import {TransactionalStore,store} from "../src/db/store";
import {SessionRegistry,SessionService,SessionError} from "../src/services/sessionService";
import {StorageConflict} from "../src/db/rowPersistence";
import {BackupService} from "../src/services/backupService";
import {authRouter} from "../src/routes/authRoutes";

const opened:TransactionalStore[]=[];
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-test-session-")),db=new TransactionalStore(dir);opened.push(db);db.db.users.a={id:"a",email:"a@example.test",roles:["buyer"],loginMethod:"EVM_WALLET",activeWallet:null,createdAt:Date.now()};db.db.users.b={...db.db.users.a,id:"b",email:"b@example.test"};db.save();return {dir,db,s:new SessionRegistry(db)};}
const intent=()=>({idempotencyKey:crypto.randomUUID()});
const rejected=(fn:()=>unknown,code:string)=>assert.throws(fn,e=>e instanceof SessionError&&e.code===code);
const legacy=(id:string,extra={})=>jwt.sign({userId:id,...extra},config.jwtSecret,{expiresIn:"1h"});
function safeUser(value:any){const {legacySessionEpoch,...rest}=value;return rest;}
async function main(){
 let checks=0;
 {
  const {s,db}=fixture(),token=s.issue(db.db.users.a),proof=s.authenticate(token),claims=jwt.decode(token) as any;
  assert.equal(claims.sessionVersion,1);assert.equal(claims.iss,"groupdeal");assert.equal(claims.aud,"groupdeal:app");assert.equal(claims.email,undefined);assert.equal(claims.roles,undefined);
  const raw=JSON.stringify(db.db),dto=JSON.stringify(s.list(proof,{}));assert.ok(!raw.includes(token)&&!raw.includes(claims.sid));assert.ok(!dto.includes(proof.key)&&!dto.includes(claims.sid));
  for(const overrides of [{aud:"other"},{iss:"other"},{sessionVersion:2},{sid:"short"},{sid:undefined}])rejected(()=>s.authenticate(jwt.sign({...claims,...overrides},config.jwtSecret)),"AUTH_SESSION_INVALID");
  rejected(()=>s.authenticate(jwt.sign({...claims},config.jwtSecret,{algorithm:"HS384"})),"AUTH_SESSION_INVALID");
  rejected(()=>s.authenticate(jwt.sign({userId:"a",sessionVersion:1,sid:crypto.randomBytes(32).toString("base64url"),iss:"groupdeal",aud:"groupdeal:app"},config.jwtSecret,{expiresIn:"1h"})),"AUTH_SESSION_INVALID");
  db.db.users.a.roles=["buyer","seller"];db.save();assert.deepEqual(s.authenticate(token).account.roles,["buyer","seller"]);
  const before=safeUser(db.db.users.a),cmd=intent();s.logout(token,cmd);rejected(()=>s.authenticate(token),"AUTH_SESSION_INACTIVE");assert.equal(s.logout(token,cmd).revoked,true);assert.deepEqual(safeUser(db.db.users.a),before);assert.equal(db.db.auditLogs.filter(r=>r.action==="APP_SESSION_LOGOUT").length,1);checks++;
 }
 {
  const {s,db}=fixture(),now=Date.now,base=now();Date.now=()=>base;
  try{const token=s.issue(db.db.users.a),start=s.authenticate(token).record.lastActivityAt;Date.now=()=>base+29*60_000;assert.equal(s.authenticate(token).record.lastActivityAt,start);s.current(s.authenticate(token));assert.equal(s.authenticate(token).record.lastActivityAt,start,"Reads must not extend idle expiry");s.activity(token);Date.now=()=>base+31*60_000;assert.equal(s.authenticate(token).record.state,"ACTIVE");Date.now=()=>base+59*60_000;rejected(()=>s.activity(token),"AUTH_SESSION_INACTIVE");
   Date.now=()=>base;const abs=s.issue(db.db.users.a);Date.now=()=>base+7*24*60*60_000;rejected(()=>s.authenticate(abs),"AUTH_SESSION_INVALID");
  }finally{Date.now=now;}checks++;
 }
 {
  const {s,db}=fixture(),current=s.issue(db.db.users.a),other=s.issue(db.db.users.a),foreign=s.issue(db.db.users.b),old=legacy("a"),unseen=legacy("a",{fixtureNonce:1});s.authenticate(old);
  const specific=s.issue(db.db.users.a),specificId=s.authenticate(specific).record.id,one=intent();assert.equal(s.command(current,"ONE",specificId,one).currentSessionRevoked,false);rejected(()=>s.authenticate(specific),"AUTH_SESSION_INACTIVE");assert.equal(s.command(current,"ONE",specificId,one).affectedCount,1);rejected(()=>s.command(other,"ONE",specificId,one),"AUTH_SESSION_IDEMPOTENCY_CONFLICT");
  const before=structuredClone(db.db.users),foreignId=s.authenticate(foreign).record.id;rejected(()=>s.command(current,"ONE",foreignId,intent()),"AUTH_SESSION_NOT_FOUND");
  const command=intent(),ack=s.command(current,"OTHERS",undefined,command);assert.equal(ack.currentSessionRevoked,false);assert.equal(s.authenticate(current).account.id,"a");for(const t of [other,old,unseen])rejected(()=>s.authenticate(t),"AUTH_SESSION_INACTIVE");assert.deepEqual(s.command(current,"OTHERS",undefined,command),ack);assert.equal(db.db.users.a.legacySessionEpoch,1);
  rejected(()=>s.command(current,"ALL",undefined,command),"AUTH_SESSION_IDEMPOTENCY_CONFLICT");rejected(()=>s.commandStatus(foreign,command.idempotencyKey),"AUTH_SESSION_NOT_FOUND");
  const all=intent(),allAck=s.command(current,"ALL",undefined,all);assert.equal(allAck.currentSessionRevoked,true);rejected(()=>s.authenticate(current),"AUTH_SESSION_INACTIVE");assert.deepEqual(s.commandStatus(current,all.idempotencyKey),allAck);assert.deepEqual(s.command(current,"ALL",undefined,all),allAck);rejected(()=>s.command(current,"ALL",undefined,intent()),"AUTH_SESSION_INACTIVE");
  for(const id of ["a","b"])assert.deepEqual(safeUser(db.db.users[id]),before[id]);assert.equal(s.authenticate(foreign).account.id,"b");checks++;
 }
 {
  const {s,db}=fixture(),a=legacy("a"),other=legacy("a",{fixtureNonce:2});s.authenticate(a);s.authenticate(other);s.command(a,"OTHERS",undefined,intent());assert.equal(s.authenticate(a).account.id,"a");rejected(()=>s.authenticate(other),"AUTH_SESSION_INACTIVE");s.command(a,"ALL",undefined,intent());rejected(()=>s.authenticate(a),"AUTH_SESSION_INACTIVE");checks++;
 }
 {
  const {s,db,dir}=fixture(),token=s.issue(db.db.users.a),reader=new TransactionalStore(dir);opened.push(reader);const second=new SessionRegistry(reader);reader.db.rateLimits.pending={count:1,lastAttemptAt:1,windowStartedAt:1};s.logout(token,intent());rejected(()=>second.authenticate(token),"AUTH_SESSION_INACTIVE");assert.ok(reader.db.rateLimits.pending,"Fresh auth read cannot discard pending domain mutations");assert.throws(()=>reader.save(),StorageConflict);assert.equal(reader.db.authSessions[s.authenticate(token,{allowInactive:true}).key].state,"REVOKED","Fresh auth read cannot advance stale CAS revision and overwrite revocation");
  const input={directory:dir,token},worker=spawnSync(process.execPath,[path.resolve("node_modules/tsx/dist/cli.mjs"),path.resolve("test/session_restart_worker.test.ts")],{cwd:process.cwd(),env:process.env,input:JSON.stringify(input),encoding:"utf8"});assert.equal(worker.status,0);assert.equal(worker.stdout.trim(),"PASS restart rejects revoked session");assert.ok(!worker.stdout.includes(token));checks++;
 }
 {
  const {s,db}=fixture(),token=s.issue(db.db.users.a),ack=s.command(token,"ALL",undefined,intent()),backup=BackupService.createEncryptedBackup(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-test-session-backup-")),db),target=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-test-session-restore-")));opened.push(target);BackupService.restoreEncryptedBackup(backup.backupPath,target);const restored=new SessionRegistry(target);rejected(()=>restored.authenticate(token),"AUTH_SESSION_INACTIVE");assert.deepEqual(restored.commandStatus(token,ack.requestId),ack);assert.deepEqual(target.db.authSessions,db.db.authSessions);assert.deepEqual(target.db.users,db.db.users);checks++;
 }
 {
  const {s,db}=fixture(),current=s.issue(db.db.users.a),foreign=s.issue(db.db.users.b);for(let i=0;i<104;i++)s.issue(db.db.users.a);let cursor:string|null|undefined,ids:string[]=[];
  do{const page=s.list(s.authenticate(current),{limit:"17",...(cursor?{cursor}:{})});assert.ok(page.sessions.every(r=>r.userId==="a"));ids.push(...page.sessions.map(r=>r.id));cursor=page.pagination.nextCursor;if(cursor){const checkedCursor=cursor;rejected(()=>s.list(s.authenticate(foreign),{cursor:checkedCursor}),"AUTH_SESSION_INVALID_CURSOR");rejected(()=>s.list(s.authenticate(current),{cursor:checkedCursor.slice(0,-1)+"x"}),"AUTH_SESSION_INVALID_CURSOR");}}while(cursor);assert.equal(ids.length,105);assert.equal(new Set(ids).size,105);
  const proof=s.authenticate(current);s.logout(current,intent());rejected(()=>s.list(proof,{}),"AUTH_SESSION_INACTIVE");checks++;
 }
 {
  const {s,db}=fixture(),token=s.issue(db.db.users.a);let last=intent();for(let i=0;i<30;i++){last=intent();s.command(token,"OTHERS",undefined,last);}const before=structuredClone(db.db);rejected(()=>s.command(token,"OTHERS",undefined,intent()),"AUTH_SESSION_RATE_LIMIT");assert.deepEqual(db.db,before);assert.equal(s.command(token,"OTHERS",undefined,last).committed,true);checks++;
 }
 {
  assert.ok(store.storageDirectory.includes("groupdeal-test-"));store.db.users.http={id:"http",email:"http@example.test",roles:["buyer"],createdAt:Date.now(),activeWallet:null};store.save();const token=SessionService.issue(store.db.users.http),headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"},app=express();app.use(express.json());app.use("/api/auth",authRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(done=>server.once("listening",done));const base="http://127.0.0.1:"+(server.address() as any).port+"/api/auth";
  try{const me=await fetch(base+"/me",{headers});assert.equal(me.status,200);assert.equal(me.headers.get("cache-control"),"no-store");assert.equal((await fetch(base+"/session/activity",{method:"POST",headers,body:'{"userId":"other"}'})).status,400);assert.equal((await fetch(base+"/sessions?limit=101",{headers})).status,400);
   const command=intent(),response=await fetch(base+"/sessions/revoke-all",{method:"POST",headers,body:JSON.stringify(command)}),ack=await response.json() as any;assert.equal(response.status,200);assert.equal(ack.currentSessionRevoked,true);assert.equal((await fetch(base+"/me",{headers})).status,401);assert.equal((await fetch(base+"/sessions",{headers})).status,401);const recovery=await fetch(base+"/session-actions/"+command.idempotencyKey,{headers});assert.equal(recovery.status,200);assert.deepEqual(await recovery.json(),ack);assert.equal((await fetch(base+"/sessions/revoke-all",{method:"POST",headers,body:JSON.stringify(intent())})).status,401);
  }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}checks++;
 }
 console.log(`PASS AUTH_SESSIONS: ${checks} scoped checks; managed/legacy revocation, finite expiry, ownership, CAS, restart, encrypted shadow restore and loopback API`);
}
main().catch((e:unknown)=>{console.error("FAIL AUTH_SESSIONS: "+(e instanceof Error?e.name:"UnknownError"));if(e instanceof Error)for(const line of (e.stack||"").split("\n").filter(l=>/^\s+at /.test(l)&&/auth_sessions\.test\.ts/.test(l)).slice(0,3))console.error(line);process.exitCode=1;}).finally(()=>{for(const db of opened)db.close();store.close();});
