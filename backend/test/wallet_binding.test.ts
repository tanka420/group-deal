import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {ethers} from "ethers";
import express from "express";
import {TransactionalStore,store} from "../src/db/store";
import {WalletBindingRegistry,WalletBindingService,WalletBindingError} from "../src/services/walletBindingService";
import {SessionRegistry,SessionService} from "../src/services/sessionService";
import {AuthService} from "../src/services/authService";
import {authRouter} from "../src/routes/authRoutes";
import {CircleWalletService} from "../src/services/circleWalletService";
import {BackupService} from "../src/services/backupService";

const opened:TransactionalStore[]=[];
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-test-wallet-binding-")),db=new TransactionalStore(dir),a=ethers.Wallet.createRandom(),b=ethers.Wallet.createRandom(),c=ethers.Wallet.createRandom();opened.push(db);db.db.users.a={id:"a",email:"a@example.test",roles:["buyer","seller"],loginMethod:"EVM_WALLET",activeWallet:a.address,createdAt:Date.now(),sellerProfile:{displayName:"Seller",bio:"",payoutWallet:a.address,verifiedSellerBadge:false,verifiedRightsBadge:false}};db.db.users.foreign={id:"foreign",email:"foreign@example.test",roles:["buyer"],loginMethod:"EVM_WALLET",activeWallet:c.address,createdAt:Date.now()};db.db.userByWallet[a.address.toLowerCase()]="a";db.db.userByWallet[c.address.toLowerCase()]="foreign";
 // Existing financial/private values are sentinels: the credential mutation must preserve them exactly.
 db.db.campaignIdentities.pinned={accountId:"a",campaignId:"existing",identity:"0x"+"ab".repeat(32),derivationVersion:1,createdAt:Date.now()};db.db.orders.pinned={id:"pinned",onchainOrderId:77,campaignId:"existing",buyerAccountId:"a",buyerPrincipal:a.address,campaignIdentity:db.db.campaignIdentities.pinned.identity,quantity:1,lockedUnitPrice:"105000000",committedGross:"105000000",buyerClaimedAmount:"16000000",sellerClaimedAmount:"0"} as any;db.db.supportMessages.existing=[];db.save();const s=new SessionRegistry(db),token=s.issue(db.db.users.a),foreign=s.issue(db.db.users.foreign);return {dir,db,a,b,c,s,token,foreign,w:new WalletBindingRegistry(db)};}
const request=(a:ethers.HDNodeWallet,b:ethers.HDNodeWallet)=>({idempotencyKey:crypto.randomUUID(),sourceWallet:a.address,targetWallet:b.address});
const rejected=(fn:()=>unknown,code:string)=>assert.throws(fn,e=>e instanceof WalletBindingError&&e.code===code);
const proofs=async(a:ethers.HDNodeWallet,b:ethers.HDNodeWallet,r:{sourceMessage:string;targetMessage:string})=>({sourceSignature:await a.signMessage(r.sourceMessage),targetSignature:await b.signMessage(r.targetMessage)});
const protectedState=(db:TransactionalStore)=>JSON.stringify({orders:db.db.orders,campaigns:db.db.campaigns,identities:db.db.campaignIdentities,grants:db.db.resourceGrants,contacts:Object.values(db.db.users).map(u=>u.contact),payouts:Object.values(db.db.users).map(u=>u.sellerProfile),support:db.db.supportMessages,preferences:db.db.notificationPreferences});
async function main(){let groups=0;
 {
  const {db,a,b,c,w,token,foreign}=fixture(),input=request(a,b),before=protectedState(db),r=w.prepare(token,input,"groupdeal.app"),signed=await proofs(a,b,r);
  assert.deepEqual(w.prepare(token,input,"groupdeal.app"),r,"Lost prepare ACK must preserve nonce and deadline");
  rejected(()=>w.prepare(token,{...input,targetWallet:c.address},"groupdeal.app"),"WALLET_BINDING_IDEMPOTENCY_CONFLICT");
  rejected(()=>w.status(foreign,r.id),"WALLET_BINDING_NOT_FOUND");
  rejected(()=>w.commit(token,r.id,{sourceSignature:signed.targetSignature,targetSignature:signed.targetSignature}),"WALLET_BINDING_PROOF_INVALID");
  assert.equal(db.db.userByWallet[b.address.toLowerCase()],undefined);assert.equal(protectedState(db),before);
  const result=w.commit(token,r.id,signed);assert.equal(result.state,"COMMITTED");assert.equal(result.selectionCurrent,true);assert.equal(result.user!.id,"a");assert.equal(db.db.userByWallet[a.address.toLowerCase()],"a");assert.equal(db.db.userByWallet[b.address.toLowerCase()],"a");assert.equal(protectedState(db),before);
  assert.deepEqual(w.commit(token,r.id,signed),result);assert.deepEqual(w.status(token,r.id),result);assert.equal(db.db.auditLogs.filter(r=>r.action==="WALLET_BINDING_COMMITTED").length,1);
  const raw=JSON.stringify(db.db);assert.ok(!raw.includes(signed.sourceSignature)&&!raw.includes(signed.targetSignature)&&!raw.includes(token));groups++;
 }
 {
  const {db,a,b,c,w,token}=fixture();rejected(()=>w.prepare(token,request(c,b),"groupdeal.app"),"WALLET_BINDING_EXISTING_PROOF_REQUIRED");rejected(()=>w.prepare(token,request(a,c),"groupdeal.app"),"WALLET_BINDING_TARGET_UNAVAILABLE");
  for(const extra of [{userId:"foreign"},{chainId:1},{message:"approve arbitrary"}])rejected(()=>w.prepare(token,{...request(a,b),...extra},"groupdeal.app"),"WALLET_BINDING_INVALID_INPUT");
  const r=w.prepare(token,request(a,b),"groupdeal.app"),valid=await proofs(a,b,r),wrong=await c.signMessage(r.sourceMessage);for(let i=0;i<5;i++)rejected(()=>w.commit(token,r.id,{...valid,sourceSignature:wrong}),"WALLET_BINDING_PROOF_INVALID");assert.equal(w.status(token,r.id).state,"LOCKED");rejected(()=>w.commit(token,r.id,valid),"WALLET_BINDING_LOCKED");assert.equal(db.db.users.a.activeWallet,a.address);groups++;
 }
 {
  const {db,a,b,w,token}=fixture(),now=Date.now,base=now();Date.now=()=>base;
  try{const r=w.prepare(token,request(a,b),"groupdeal.app"),valid=await proofs(a,b,r);Date.now=()=>r.expiresAt;rejected(()=>w.commit(token,r.id,valid),"WALLET_BINDING_EXPIRED");assert.equal(w.status(token,r.id).state,"EXPIRED");assert.equal(db.db.users.a.activeWallet,a.address);}finally{Date.now=now;}groups++;
 }
 {
  const {db,a,b,w,token}=fixture(),third=ethers.Wallet.createRandom(),r=w.prepare(token,request(a,b),"groupdeal.app"),other=w.prepare(token,request(a,third),"groupdeal.app"),signed=await proofs(a,b,r),otherSigned=await proofs(a,third,other);
  w.commit(token,r.id,signed);rejected(()=>w.commit(token,other.id,otherSigned),"WALLET_BINDING_SELECTION_CHANGED");const back=w.prepare(token,request(b,a),"groupdeal.app");w.commit(token,back.id,await proofs(b,a,back));const recovered=w.status(token,r.id);assert.equal(recovered.state,"COMMITTED");assert.equal(recovered.selectionCurrent,false);assert.equal(recovered.currentActiveWallet,a.address);assert.equal(db.db.userByWallet[b.address.toLowerCase()],"a");groups++;
 }
 {
  const {db,a,b,w,token}=fixture(),r=w.prepare(token,request(a,b),"groupdeal.app"),signed=await proofs(a,b,r),before=protectedState(db),cancel=w.cancel(token,r.id);assert.equal(cancel.state,"CANCELLED");assert.deepEqual(w.cancel(token,r.id),cancel);assert.deepEqual(w.prepare(token,{idempotencyKey:r.id,sourceWallet:a.address,targetWallet:b.address},"groupdeal.app"),cancel);assert.throws(()=>w.commit(token,r.id,signed));assert.equal(db.db.userByWallet[b.address.toLowerCase()],undefined);assert.equal(protectedState(db),before);assert.equal(db.db.auditLogs.filter(r=>r.action==="WALLET_BINDING_CANCELLED").length,1);groups++;
 }
 {
  const {db,dir,a,b,w,token,s}=fixture(),r=w.prepare(token,request(a,b),"groupdeal.app"),reader=new TransactionalStore(dir);opened.push(reader);const other=new WalletBindingRegistry(reader);reader.db.rateLimits.pending={windowStartedAt:1,lastAttemptAt:1,count:1};w.commit(token,r.id,await proofs(a,b,r));assert.equal(other.status(token,r.id).state,"COMMITTED");assert.equal(other.inventory(token,{}).wallets.length,2);assert.ok(reader.db.rateLimits.pending);rejected(()=>other.prepare(token,request(a,ethers.Wallet.createRandom()),"groupdeal.app"),"WALLET_BINDING_CONFLICT");assert.equal(reader.db.users.a.activeWallet,a.address,"Scoped reads/writes must preserve the stale writer cache and its pending records instead of hydrating another process revision");assert.ok(reader.db.rateLimits.pending);
  const worker=spawnSync(process.execPath,[path.resolve("node_modules/tsx/dist/cli.mjs"),path.resolve("test/wallet_binding_restart_worker.test.ts")],{cwd:process.cwd(),env:process.env,input:JSON.stringify({directory:dir,token,id:r.id,expected:b.address}),encoding:"utf8"});assert.equal(worker.status,0);assert.equal(worker.stdout.trim(),"PASS wallet intent and retained credentials after process restart");assert.ok(!worker.stdout.includes(token));
  const backup=BackupService.createEncryptedBackup(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-test-wallet-backup-")),db),restored=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-test-wallet-restore-")));opened.push(restored);BackupService.restoreEncryptedBackup(backup.backupPath,restored);const restoredWallets=new WalletBindingRegistry(restored);assert.deepEqual(restoredWallets.status(token,r.id),w.status(token,r.id));assert.deepEqual(restored.db.userByWallet,db.db.userByWallet);s.logout(token,{idempotencyKey:crypto.randomUUID()});assert.throws(()=>other.status(token,r.id));groups++;
 }
 {
  const {db,a,b,w,token,foreign}=fixture();for(let i=0;i<104;i++)db.db.userByWallet[ethers.Wallet.createRandom().address.toLowerCase()]="a";db.save();let cursor:string|null=null;const seen:string[]=[];do{const p=w.inventory(token,{limit:"17",...(cursor?{cursor}:{})});seen.push(...p.wallets.map(r=>r.address.toLowerCase()));cursor=p.pagination.nextCursor;if(cursor){rejected(()=>w.inventory(foreign,{cursor}),"WALLET_BINDING_INVALID_CURSOR");rejected(()=>w.inventory(token,{cursor:cursor!.slice(0,-1)+"x"}),"WALLET_BINDING_INVALID_CURSOR");}}while(cursor);assert.equal(seen.length,105);assert.equal(new Set(seen).size,105);
  let last=request(a,b);for(let i=0;i<20;i++){last=request(a,b);w.prepare(token,last,"groupdeal.app");}rejected(()=>w.prepare(token,request(a,b),"groupdeal.app"),"WALLET_BINDING_RATE_LIMIT");assert.equal(w.prepare(token,last,"groupdeal.app").state,"PENDING");groups++;
 }
 {
  assert.ok(store.isIsolated);const a=ethers.Wallet.createRandom(),b=ethers.Wallet.createRandom();const circle=AuthService.createCircleSession(null,"circle-owned",{walletId:crypto.randomUUID(),address:a.address,blockchain:"ARC-TESTNET"}),token=circle.token;const first=WalletBindingService.prepare(token,request(a,b),"groupdeal.app"),signed=await proofs(a,b,first);WalletBindingService.commit(token,first.id,signed);const login=AuthService.issueWalletLoginChallenge(a.address),resume=AuthService.verifyWalletLogin(a.address,await a.signMessage(login.challengeMessage),login.challengeMessage,login.nonce);assert.equal(resume.user.id,circle.user.id);assert.equal(resume.user.loginMethod,"CIRCLE_EMAIL");assert.equal(SessionService.authenticate(resume.token).record.loginMethod,"EVM_WALLET");assert.equal(store.db.userByWallet[b.address.toLowerCase()],circle.user.id);
  const orphan=ethers.Wallet.createRandom();store.db.userByWallet[orphan.address.toLowerCase()]="missing-user";store.save();const validOrphan=AuthService.issueWalletLoginChallenge(orphan.address),orphanSignature=await orphan.signMessage(validOrphan.challengeMessage),count=Object.keys(store.db.users).length;assert.throws(()=>AuthService.verifyWalletLogin(orphan.address,orphanSignature,validOrphan.challengeMessage,validOrphan.nonce),/WALLET_ACCOUNT_BINDING_UNAVAILABLE/);assert.equal(store.db.userByWallet[orphan.address.toLowerCase()],"missing-user");assert.equal(Object.keys(store.db.users).length,count);groups++;
 }
 {
  const a=ethers.Wallet.createRandom(),b=ethers.Wallet.createRandom(),walletId=crypto.randomUUID(),circleUserId=crypto.randomUUID(),session=AuthService.createCircleSession(null,circleUserId,{walletId,address:a.address,blockchain:"ARC-TESTNET"}),token=session.token,headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json",Origin:"http://127.0.0.1:5173"},client=CircleWalletService as unknown as {client:unknown},previous=client.client;let calls=0,fail=false,expectedMessage="",providerUserId:string=circleUserId;
  client.client={getUserStatus:async()=>({data:{id:providerUserId,status:"ENABLED"}}),getWallet:async({id}:{id:string})=>({data:{wallet:{id,address:a.address,blockchain:"ARC-TESTNET",accountType:"EOA",state:"LIVE"}}}),signMessage:async(input:{message:string;walletId:string;encodedByHex:boolean})=>{calls++;assert.equal(input.walletId,walletId);assert.equal(input.message,expectedMessage);assert.equal(input.encodedByHex,false);if(fail)throw new Error("Provider response unavailable");return {data:{challengeId:crypto.randomUUID()}};}};
  const app=express();app.use(express.json());app.use("/api/auth",authRouter);const server=app.listen(0,"127.0.0.1");await new Promise<void>(done=>server.once("listening",done));const base="http://127.0.0.1:"+(server.address() as any).port+"/api/auth";
  const post=(suffix:string,input:unknown)=>fetch(base+suffix,{method:"POST",headers,body:JSON.stringify(input)});
  try{
   const p=await post("/wallet-intents",request(a,b)),intent=await p.json() as any;assert.equal(p.status,200);assert.equal(p.headers.get("cache-control"),"no-store");expectedMessage=intent.sourceMessage;
   assert.equal((await fetch(base+"/wallet-intents/"+crypto.randomUUID(),{headers})).status,404);assert.equal((await post("/wallet-intents",{...request(a,b),userId:"other"})).status,400);
   assert.equal((await fetch(base+"/wallet-intents",{method:"POST",headers:{...headers,Origin:"https://untrusted.invalid"},body:JSON.stringify(request(a,b))})).status,403);
   providerUserId="unbound-provider-user";assert.equal((await post(`/wallet-intents/${intent.id}/circle/SOURCE`,{userToken:"fixture-circle-user-token-verified-identity"})).status,503);assert.equal(calls,0);
   providerUserId=circleUserId;const signing=await post(`/wallet-intents/${intent.id}/circle/SOURCE`,{userToken:"fixture-circle-user-token-verified-identity"}),ack=await signing.json() as any;assert.equal(signing.status,200);assert.equal(ack.userId,session.user.id);assert.equal(ack.id,intent.id);assert.equal(ack.messageHash,ethers.hashMessage(intent.sourceMessage));assert.equal(ack.role,"SOURCE");assert.equal((await post(`/wallet-intents/${intent.id}/circle/SOURCE`,{userToken:"fixture-circle-user-token-verified-identity"})).status,200);assert.equal(calls,1);
   assert.equal((await post(`/wallet-intents/${intent.id}/commit`,{complete:true})).status,400);assert.equal(store.db.userByWallet[b.address.toLowerCase()],undefined);
   const signed=await proofs(a,b,intent),commit=await post(`/wallet-intents/${intent.id}/commit`,signed),done=await commit.json() as any;assert.equal(commit.status,200);assert.equal(done.state,"COMMITTED");assert.deepEqual(await (await fetch(base+"/wallet-intents/"+intent.id,{headers})).json(),done);
   const next=await (await post("/wallet-intents",request(a,ethers.Wallet.createRandom()))).json() as any;expectedMessage=next.sourceMessage;fail=true;assert.equal((await post(`/wallet-intents/${next.id}/circle/SOURCE`,{userToken:"fixture-circle-user-token-verified-identity"})).status,503);assert.equal(calls,2);assert.equal((await post(`/wallet-intents/${next.id}/circle/SOURCE`,{userToken:"fixture-circle-user-token-verified-identity"})).status,503);assert.equal(calls,2,"Lost provider creation ACK must never trigger another provider sign request");
   assert.equal((await post(`/wallet-intents/${next.id}/circle/TARGET`,{userToken:"fixture-circle-user-token-verified-identity"})).status,403);assert.equal(calls,2);
  }finally{client.client=previous;server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}groups++;
 }
 {
  const wallet=ethers.Wallet.createRandom(),owner=AuthService.createCircleSession(null,crypto.randomUUID(),{walletId:crypto.randomUUID(),address:wallet.address,blockchain:"ARC-TESTNET"}),before=JSON.stringify(store.db);
  assert.throws(()=>AuthService.createCircleSession(null,crypto.randomUUID(),{walletId:crypto.randomUUID(),address:wallet.address,blockchain:"ARC-TESTNET"}));assert.equal(JSON.stringify(store.db),before,"Rejected Circle wallet ownership must not leave a partial user, binding, audit or session");
  const challenge=AuthService.issueWalletLoginChallenge(wallet.address),signature=await wallet.signMessage(challenge.challengeMessage),account=store.db.users[owner.user.id];account.roles=["invalid-role"] as any;store.save();const invalidBefore=JSON.stringify(store.db);assert.throws(()=>AuthService.verifyWalletLogin(wallet.address,signature,challenge.challengeMessage,challenge.nonce));assert.equal(JSON.stringify(store.db),invalidBefore,"A rejected session must roll back wallet selection and nonce consumption together");account.roles=["buyer"];store.db.users[owner.user.id].roles=["buyer"];store.save();groups++;
 }
 {
  const {a,w,token}=fixture(),r=w.prepare(token,request(a,a),"groupdeal.app"),signature=await a.signMessage(r.sourceMessage);assert.equal(r.sourceMessage,r.targetMessage);const done=w.commit(token,r.id,{sourceSignature:signature,targetSignature:signature});assert.equal(done.bindingWasNew,false);assert.equal(done.selectionCurrent,true);groups++;
 }
 console.log(`PASS WALLET_BINDING: ${groups} groups; two-proof authority, retained identity, scoped recovery, expiry, CAS, actual process restart, encrypted shadow restore, paging and rate`);
}
main().catch((e:unknown)=>{console.error("FAIL WALLET_BINDING: "+(e instanceof Error?e.name:"UnknownError"));if(e instanceof Error)for(const line of (e.stack||"").split("\n").filter(l=>/^\s+at /.test(l)&&/wallet_binding\.test\.ts/.test(l)).slice(0,3))console.error(line);process.exitCode=1;}).finally(()=>{for(const db of opened)db.close();store.close();});
