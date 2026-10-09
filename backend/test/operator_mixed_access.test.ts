import {notificationRouter} from '../src/routes/notificationRoutes';
import {notificationInbox} from '../src/services/notificationInboxService';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {SessionService,type SessionProof} from '../src/services/sessionService';
import {SupportService} from '../src/services/supportService';
import {OrderThreadService} from '../src/services/orderThreadService';
import {supportRouter} from '../src/routes/supportRoutes';
import {orderRouter} from '../src/routes/orderRoutes';
import {enrollFixtureOperator} from './helpers/operatorFixture';
const initial=store.snapshot();let cases=0,current='setup';
async function setup(){
 assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);store.replace(structuredClone(initial));
 store.transaction(()=>{for(const [id,roles] of [['actor',['buyer','seller','operator']],['buyer',['buyer']],['seller',['seller']]] as const)store.db.users[id]={id,email:id+'@mixed-fixture.example.test',roles:[...roles],activeWallet:null,createdAt:Date.now()};
  store.db.campaigns.foreign={id:'foreign',sellerId:'seller',projectionOrigin:'VERIFIED_PUBLISH'} as any;store.db.campaigns.own={id:'own',sellerId:'seller',projectionOrigin:'VERIFIED_PUBLISH'} as any;
  store.db.orders.foreign={id:'foreign',campaignId:'foreign',buyerAccountId:'buyer',privateExtension:'retain-financial-and-entitlement'} as any;store.db.orders.own={id:'own',campaignId:'own',buyerAccountId:'actor'} as any;
  store.db.supportMessages.foreign=[{id:'msg_fixture',orderId:'foreign',senderRole:'buyer',senderWallet:'buyer',text:'foreign-private-message',timestamp:Date.now()}];store.db.supportMessages.own=[];
 });
 const tokens=Object.fromEntries(['actor','buyer','seller'].map(id=>[id,SessionService.issue(store.db.users[id])])),proofs=Object.fromEntries(Object.entries(tokens).map(([id,token])=>[id,SessionService.authenticate(token)]));
 const body={idempotencyKey:crypto.randomUUID(),kind:'ORDER',orderId:'foreign',subject:'foreign-private-subject',message:'foreign-private-body',attachments:[{filename:'private.txt',mimeType:'text/plain',dataBase64:Buffer.from('foreign-private-file').toString('base64')}]};
 const foreign=SupportService.create('buyer',body,proofs.buyer).ticket;return {tokens,proofs,foreign};
}
async function check(name:string,work:(f:Awaited<ReturnType<typeof setup>>)=>unknown){current=name;const f=await setup();await work(f);cases++;console.log('PASS mixed operator: '+name);}
function denied(fn:()=>unknown){assert.throws(fn,e=>e instanceof Error&&/SUPPORT_NOT_FOUND|SUPPORT_FORBIDDEN|ORDER_THREAD_FORBIDDEN|AUTH_SESSION_/.test(e.message));}
async function server(){const app=express();app.use('/support',supportRouter);app.use('/notifications',notificationRouter);app.use(express.json());app.use('/orders',orderRouter);const listener=await new Promise<import('http').Server>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});return{base:'http://127.0.0.1:'+(listener.address() as any).port,close:()=>new Promise<void>(r=>listener.close(()=>r()))};}
async function request(base:string,path:string,token:string,body?:unknown){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Operator-Capability':'client-forged'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});}
async function main(){
 await check('role-only SQL never hydrates foreign ticket content or thread messages',f=>{
  const proof=f.proofs.actor,state=store.readSupportState('actor',{ticketId:f.foreign.id,view:'ALL',sessionKey:proof.key,operatorProof:proof});assert.equal(state.ticket,undefined);assert.equal(state.messages.length,0);assert.equal(state.attachments.length,0);assert.equal(state.tickets.length,0);
  assert.equal(store.readOrderThreadState({actorId:'actor',sessionKey:proof.key,operatorProof:proof,orderId:'foreign'}).messages.length,0);
  denied(()=>SupportService.detail('actor',f.foreign.id,proof));denied(()=>SupportService.list('actor',{view:'ALL'},proof));denied(()=>SupportService.download('actor',f.foreign.id,f.foreign.attachments[0].id,proof));denied(()=>OrderThreadService.list(proof,'foreign'));denied(()=>OrderThreadService.send(proof,'foreign',{text:'Denied'}));assert.ok(!notificationInbox.page('actor',{},proof).notifications.some(n=>n.source?.kind==='SUPPORT_TICKET'));
 });
 await check('ordinary buyer and seller access remain available despite an obsolete operator role',f=>{
  const proof=f.proofs.actor;const ticket=SupportService.create('actor',{idempotencyKey:crypto.randomUUID(),kind:'ACCOUNT',orderId:null,subject:'Mine',message:'Own request',attachments:[]},proof).ticket;
  assert.equal(ticket.viewerRole,'buyer');assert.equal(ticket.canAssign,false);assert.equal(SupportService.list('actor',{},proof).tickets.length,1);assert.equal(OrderThreadService.send(proof,'own',{text:'Own reply'}).senderRole,'buyer');
  store.transaction(()=>{store.db.campaigns.own.sellerId='actor';});assert.equal(OrderThreadService.send(proof,'own',{text:'Seller reply'}).senderRole,'seller');assert.equal(SupportService.detail('seller',f.foreign.id,f.proofs.seller).ticket.viewerRole,'seller');
 });
 await check('verified capability grants foreign reads, encrypted file bytes and audited assignment/status',async f=>{
  await enrollFixtureOperator('actor',f.proofs.actor);const proof=f.proofs.actor;assert.equal(SupportService.detail('actor',f.foreign.id,proof).ticket.viewerRole,'operator');assert.equal(OrderThreadService.list(proof,'foreign')[0].text,'foreign-private-message');assert.equal(SupportService.download('actor',f.foreign.id,f.foreign.attachments[0].id,proof).bytes.toString(),'foreign-private-file');
  assert.ok(notificationInbox.page('actor',{},proof).notifications.some(n=>n.source?.kind==='SUPPORT_TICKET'));assert.deepEqual(SupportService.operators('actor',proof).operators.map(u=>u.id),['actor']);assert.throws(()=>SupportService.assign('actor',f.foreign.id,{idempotencyKey:crypto.randomUUID(),expectedRevision:1,assignedOperatorId:'seller'},proof),/SUPPORT_ASSIGNEE_UNAVAILABLE/);
  const assigned=SupportService.assign('actor',f.foreign.id,{idempotencyKey:crypto.randomUUID(),expectedRevision:1,assignedOperatorId:'actor'},proof);assert.equal(assigned.ticket.revision,2);SupportService.status('actor',f.foreign.id,{idempotencyKey:crypto.randomUUID(),expectedRevision:2,state:'CLOSED'},proof);
  assert.equal(OrderThreadService.send(proof,'foreign',{text:'Operator response'}).senderRole,'operator');assert.ok(store.db.auditLogs.some(a=>a.action==='SUPPORT_ASSIGN'&&a.actor==='actor'&&a.role==='operator'));assert.equal(store.verifyAuditLogIntegrity().valid,true);assert.equal(store.db.orders.foreign.privateExtension,'retain-financial-and-entitlement');
 });
 await check('cloned/new-session proofs cannot inherit a grant, and direct role-only writes do not commit',async f=>{
  await enrollFixtureOperator('actor',f.proofs.actor);for(const proof of [{...f.proofs.actor},SessionService.authenticate(SessionService.issue(store.db.users.actor))]){const before=store.snapshot();denied(()=>SupportService.detail('actor',f.foreign.id,proof));denied(()=>OrderThreadService.send(proof,'foreign',{text:'Denied'}));assert.deepEqual(store.snapshot(),before);}
 });
 await check('committed certificate, alias, wallet, role and observation expiry fence SQL before private reads',async f=>{
  const enrolled=await enrollFixtureOperator('actor',f.proofs.actor),baseline=store.snapshot();for(const kind of ['certificate','alias','wallet','role','expiry']){store.replace(structuredClone(baseline));await enrolled.service.authorize(f.proofs.actor);const originalNow=Date.now;try{store.transaction(()=>{if(kind==='certificate')store.db.users.actor.operatorEnrollment!.signatureEncrypted+='changed';if(kind==='alias')store.db.userByWallet[enrolled.wallet.address.toLowerCase()]='buyer';if(kind==='wallet')store.db.users.actor.activeWallet=ethers.Wallet.createRandom().address;if(kind==='role')store.db.users.actor.roles=['buyer','seller'];});if(kind==='expiry'){const later=Date.now()+31001;Date.now=()=>later;}
   denied(()=>SupportService.detail('actor',f.foreign.id,f.proofs.actor));denied(()=>OrderThreadService.list(f.proofs.actor,'foreign'));assert.equal(store.readSupportState('actor',{ticketId:f.foreign.id,sessionKey:f.proofs.actor.key,operatorProof:f.proofs.actor}).messages.length,0);
  }finally{Date.now=originalNow;}}
 });
 await check('shared HTTP rejects a forged capability and keeps ordinary own access',async f=>{
  const http=await server();try{for(const path of ['/support/tickets?view=ALL','/support/operators','/orders/foreign/messages']){const r=await request(http.base,path,f.tokens.actor);assert.equal(r.status,403);assert.ok((r.headers.get('cache-control')??'').includes('no-store'));assert.ok(!(await r.text()).includes('foreign-private'));}assert.equal((await request(http.base,'/support/tickets/'+f.foreign.id,f.tokens.actor)).status,404);const own=await request(http.base,'/orders/own/messages',f.tokens.actor,{text:'HTTP own response'});assert.equal(own.status,200);assert.equal((await own.json()).message.senderRole,'buyer');}finally{await http.close();}
 });
 await check('HTTP mints authority for each enrolled request and never exposes certificate fields',async f=>{
  const enrolled=await enrollFixtureOperator('actor',f.proofs.actor),before=enrolled.truth.calls,http=await server();try{for(const path of ['/support/tickets?view=ALL','/support/operators','/support/tickets/'+f.foreign.id,'/orders/foreign/messages','/notifications']){const r=await request(http.base,path,f.tokens.actor);assert.equal(r.status,200,path);const v=await r.text();assert.ok(!/signatureEncrypted|certificateDigest|operatorEnrollment/.test(v));}assert.ok(enrolled.truth.calls>=before+4);}finally{await http.close();}
 });
 await check('changed/unavailable chain authority denies operator access while owned buyer work still works',async f=>{
  const enrolled=await enrollFixtureOperator('actor',f.proofs.actor),http=await server();try{for(const unavailable of [false,true]){enrolled.truth.unavailable=unavailable;enrolled.truth.authority.ownerAddress=ethers.Wallet.createRandom().address;assert.equal((await request(http.base,'/support/tickets/'+f.foreign.id,f.tokens.actor)).status,404);assert.equal((await request(http.base,'/orders/foreign/messages',f.tokens.actor)).status,403);assert.equal((await request(http.base,'/orders/own/messages',f.tokens.actor,{text:'Own buyer work'})).status,200);}assert.ok(store.db.users.actor.roles.includes('operator'));}finally{await http.close();}
 });
 await check('revocation during authority await prevents shared HTTP output and writes',async f=>{
  const enrolled=await enrollFixtureOperator('actor',f.proofs.actor),http=await server();try{const before=store.db.supportMessages.foreign.length;enrolled.truth.callback=()=>store.transaction(()=>{store.db.authSessions[f.proofs.actor.key].state='REVOKED';});const r=await request(http.base,'/orders/foreign/messages',f.tokens.actor,{text:'Denied stale write'});assert.equal(r.status,401);assert.equal(store.db.supportMessages.foreign.length,before);assert.ok(!(await r.text()).includes('foreign-private'));}finally{await http.close();}
 });
 console.log('PASS '+cases+' mixed operator cases; isolated SQL and local HTTP, no native actor/provider/broadcast.');
}
main().catch(e=>{console.error('FAIL mixed operator: '+current);console.error(e);process.exitCode=1;}).finally(()=>store.close());
