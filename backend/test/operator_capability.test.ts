import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {ethers} from 'ethers';
import {config} from '../src/config';
import {store} from '../src/db/store';
import {SessionRegistry,SessionService,SessionError} from '../src/services/sessionService';
import {OperatorEnrollmentService,operatorEnrollmentService} from '../src/services/operatorEnrollment';
import {OperatorEnrollmentError,type OperatorAuthority} from '../src/domain/operatorEnrollment';
import {hasOperatorCapability} from '../src/domain/operatorCapability';
import {authMiddleware,requireRole} from '../src/middleware/auth';
import {operatorRouter} from '../src/routes/operatorRoutes';
import {productRouter} from '../src/routes/productRoutes';
import {ProductService} from '../src/services/productService';
import {ReconciliationService} from '../src/services/reconciliationService';
import {listOperatorSellers} from '../src/services/operatorBadgeService';
import {NotificationService} from '../src/services/notificationService';
const initial=store.snapshot(),sessions=new SessionRegistry(store),origin='http://localhost:5173';
let cases=0,current='setup';
async function check(name:string,fn:()=>unknown){current=name;await fn();cases++;console.log('PASS operator capability: '+name);}
function setup(emitted=false){
 assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);store.replace(structuredClone(initial));
 const wallet=ethers.Wallet.createRandom(),other=ethers.Wallet.createRandom();config.arcChainId=31337;config.deploymentBlock=1;config.protocolVersion=1;config.operatorAddress=wallet.address;
 const chain:OperatorAuthority={chainId:31337,hubAddress:config.hubAddress,protocolVersion:1,operatorAddress:wallet.address,authorizedSigner:new ethers.Wallet(config.authorizedSignerPrivateKey).address,ownerAddress:other.address,securityAuthority:ethers.Wallet.createRandom().address,bytecodeHash:ethers.keccak256('0x6000'),blockNumber:3,blockHash:ethers.id('operator-capability-block'),observedAt:Date.now()};
 store.transaction(()=>{store.db.users.actor={id:'actor',email:'actor@capability-fixture.example.test',roles:['buyer','seller'],createdAt:Date.now(),loginMethod:'EVM_WALLET',activeWallet:wallet.address};store.db.users.other={id:'other',email:'other@capability-fixture.example.test',roles:['buyer','seller','operator'],createdAt:Date.now(),loginMethod:'EVM_WALLET',activeWallet:other.address};store.db.userByWallet[wallet.address.toLowerCase()]='actor';store.db.userByWallet[other.address.toLowerCase()]='other';store.db.authRecovery={current:{version:1,context:crypto.randomBytes(32).toString('base64url'),createdAt:Date.now()}};});
 const token=sessions.issue(store.db.users.actor),proof=sessions.authenticate(token),truth={authority:chain,calls:0,callback:undefined as (()=>void)|undefined};
 const authority=async()=>{truth.calls++;truth.callback?.();truth.callback=undefined;return{...truth.authority,observedAt:Date.now()};};
 Object.assign(require('../dist/config').config,{arcChainId:31337,deploymentBlock:1,protocolVersion:1,operatorAddress:wallet.address});
 const Service=emitted?require('../dist/services/operatorEnrollment').OperatorEnrollmentService:OperatorEnrollmentService;
 const service:OperatorEnrollmentService=new Service({database:store,readAuthority:authority}),registry:SessionRegistry=emitted?new (require('../dist/services/sessionService').SessionRegistry)(store):sessions;
 (operatorEnrollmentService as any).authority=authority;
 return{wallet,other,token,proof,truth,authority,service,registry};
}
async function enrolled(f:ReturnType<typeof setup>){const ch=await f.service.issue(f.proof,f.wallet.address,origin);await f.service.verify(f.proof,{walletAddress:f.wallet.address,message:ch.challengeMessage,nonce:ch.nonce,signature:await f.wallet.signMessage(ch.challengeMessage)},origin);return ch;}
const state=(f:ReturnType<typeof setup>)=>store.readAuthState('actor',f.proof.key);
function denied(fn:()=>unknown){assert.throws(fn,e=>e instanceof Error&&(/OPERATOR_|AUTH_SESSION_/.test(e.message)));}
async function server(){const app=express();app.use(express.json());app.use('/operator',operatorRouter);app.use('/products',productRouter);app.get('/seller',authMiddleware,requireRole('seller'),(_req,res)=>res.json({seller:true}));const listener=await new Promise<import('node:http').Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const port=(listener.address() as any).port;return{base:'http://127.0.0.1:'+port,close:()=>new Promise<void>((resolve,reject)=>listener.close(e=>e?reject(e):resolve()))};}
async function request(base:string,path:string,token:string,init:RequestInit={}){return fetch(base+path,{...init,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(10000)});}
async function main(){
 for(const emitted of [false,true])await check((emitted?'emitted':'source')+' grant requires validated controller enrollment, and status alone is not a capability',async()=>{
  const f=setup(emitted);await enrolled(f);assert.equal((await f.service.status(f.proof)).enrolled,true);denied(()=>f.registry.assertOperatorCommitted(f.proof,state(f)));await f.service.authorize(f.proof);assert.equal(f.registry.assertOperatorCommitted(f.proof,state(f)).id,'actor');assert.equal((await f.service.status(f.proof)).enrolled,true);assert.equal(f.registry.assertOperatorCommitted(f.proof,state(f)).id,'actor');
 });
 await check('legacy role-only actor is denied without RPC, while ordinary session and seller access remain valid',async()=>{
  const f=setup();store.transaction(()=>{store.db.users.actor.roles.push('operator');});await assert.rejects(f.service.authorize(f.proof),e=>e instanceof OperatorEnrollmentError&&e.code==='OPERATOR_ACCESS_REQUIRED');assert.equal(f.truth.calls,0);assert.equal(sessions.assertCommitted(f.proof,state(f)).id,'actor');assert.deepEqual(state(f).user!.roles,['buyer','seller','operator']);
 });
 await check('capability stays on the exact server proof, never cloned, a new session or another actor',async()=>{
  const f=setup();await enrolled(f);await f.service.authorize(f.proof);denied(()=>sessions.assertOperatorCommitted({...f.proof},state(f)));const next=sessions.authenticate(sessions.issue(store.db.users.actor));denied(()=>sessions.assertOperatorCommitted(next,store.readAuthState('actor',next.key)));const other=sessions.authenticate(sessions.issue(store.db.users.other));denied(()=>sessions.assertOperatorCommitted(other,store.readAuthState('other',other.key)));assert.equal(sessions.assertOperatorCommitted(f.proof,state(f)).id,'actor');
 });
 await check('current committed alias/certificate/wallet/role/session/recovery changes reject a previously granted proof',async()=>{
  for(const kind of ['alias','certificate','wallet','role','session','context']){const f=setup();await enrolled(f);await f.service.authorize(f.proof);store.transaction(()=>{if(kind==='alias')store.db.userByWallet[f.wallet.address.toLowerCase()]='other';if(kind==='certificate')store.db.users.actor.operatorEnrollment!.signatureEncrypted+='changed';if(kind==='wallet')store.db.users.actor.activeWallet=ethers.Wallet.createRandom().address;if(kind==='role')store.db.users.actor.roles=['buyer','seller'];if(kind==='session')store.db.authSessions[f.proof.key].state='REVOKED';if(kind==='context')store.db.authRecovery!.current.context=crypto.randomBytes(32).toString('base64url');});denied(()=>sessions.assertOperatorCommitted(f.proof,state(f)));}
 });
 await check('failed authority revalidation clears old grant and does not alter roles/certificate',async()=>{
  const f=setup();await enrolled(f);await f.service.authorize(f.proof);const record=structuredClone(state(f).user!.operatorEnrollment);f.truth.authority.ownerAddress=ethers.Wallet.createRandom().address;await assert.rejects(f.service.authorize(f.proof),e=>e instanceof OperatorEnrollmentError);denied(()=>sessions.assertOperatorCommitted(f.proof,state(f)));assert.deepEqual(state(f).user!.operatorEnrollment,record);assert.deepEqual(state(f).user!.roles,['buyer','seller','operator']);
 });
 await check('alias/certificate/session changes during authority await cannot mint a stale grant',async()=>{
  for(const kind of ['alias','certificate','session']){const f=setup();await enrolled(f);f.truth.callback=()=>store.transaction(()=>{if(kind==='alias')store.db.userByWallet[f.wallet.address.toLowerCase()]='other';if(kind==='certificate')store.db.users.actor.operatorEnrollment!.signatureEncrypted+='changed';if(kind==='session')store.db.authSessions[f.proof.key].state='REVOKED';});await assert.rejects(f.service.authorize(f.proof));denied(()=>sessions.assertOperatorCommitted(f.proof,state(f)));}
 });
 await check('30-second observation expires before a later privileged read/write',async()=>{
  const f=setup();await enrolled(f);await f.service.authorize(f.proof);const time=Date.now,then=time();try{Date.now=()=>then+31001;denied(()=>sessions.assertOperatorCommitted(f.proof,state(f)));assert.equal(sessions.assertCommitted(f.proof,state(f)).id,'actor');}finally{Date.now=time;}
 });
 await check('committed frame is non-enumerable, does not flush dirty data and readback excludes all private proof',async()=>{
  const f=setup();await enrolled(f);await f.service.authorize(f.proof);const auth=state(f);assert.equal(Object.getOwnPropertySymbols(auth).length,1);assert.ok(!JSON.stringify(await f.service.status(f.proof)).includes('Encrypted'));store.db.notificationPreferences.pending={inApp:true,email:false};store.db.users.actor.operatorEnrollment!.signatureEncrypted+='uncommitted';assert.equal(sessions.assertOperatorCommitted(f.proof,state(f)).id,'actor');const sql=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'),{readOnly:true});try{assert.equal(sql.prepare("SELECT record_json FROM domain_records WHERE collection='notificationPreferences' AND record_key='pending'").get(),undefined);}finally{sql.close();}
 });
 await check('direct badge, mail and product review helpers reject role-only callers before mutation',async()=>{
  const f=setup();store.transaction(()=>{store.db.users.actor.roles.push('operator');});denied(()=>listOperatorSellers(f.proof,{}));denied(()=>NotificationService.listEmailOutbox('actor',{},f.proof));denied(()=>ProductService.reviewRights('actor','missing',{decision:'REJECTED',reason:'fixture'}, {proof:f.proof,stepUp:{walletAddress:f.wallet.address,signature:'0x'+'00'.repeat(65),challengeMessage:'fixture'}}));denied(()=>ProductService.reviewRights('actor','missing',{decision:'REJECTED',reason:'fixture'}));assert.deepEqual(state(f).user!.roles,['buyer','seller','operator']);
 });
 await check('operator/rights HTTP deny legacy role and forged client capability, with private no-store',async()=>{
  const f=setup();store.transaction(()=>{store.db.users.actor.roles.push('operator');});const http=await server();try{for(const p of ['/operator/users','/operator/settings','/operator/email-outbox','/operator/sellers','/products/rights/review']){const response=await request(http.base,p,f.token,{headers:{'X-Operator-Capability':'forged'}});assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).error,'OPERATOR_ACCESS_REQUIRED');}assert.equal(f.truth.calls,0);assert.equal((await request(http.base,'/seller',f.token)).status,200);assert.equal((await request(http.base,'/products/mine',f.token)).status,200);assert.deepEqual(state(f).user!.roles,['buyer','seller','operator']);}finally{await http.close();}
 });
 await check('verified enrolled actor reaches protected HTTP inventories; certificate metadata stays private',async()=>{
  const f=setup();await enrolled(f);const http=await server();try{for(const p of ['/operator/users','/operator/settings','/operator/sellers','/operator/email-outbox','/products/rights/review']){const response=await request(http.base,p,f.token);assert.equal(response.status,200,p);const body=await response.text();assert.ok(!body.includes('operatorEnrollment')&&!body.includes('signatureEncrypted')&&!body.includes('certificateDigest'));assert.equal(response.headers.get('cache-control'),'private, no-store');}assert.ok(f.truth.calls>=7);}finally{await http.close();}
 });
 await check('HTTP RPC await revocation blocks cached role before private inventory',async()=>{
  const f=setup();await enrolled(f);const http=await server();try{f.truth.callback=()=>store.transaction(()=>{store.db.authSessions[f.proof.key].state='REVOKED';});const response=await request(http.base,'/operator/users',f.token);assert.equal(response.status,401);assert.ok(!(await response.text()).includes('users'));}finally{await http.close();}
 });
 await check('concurrent foreign-role requests cannot inherit a verified actor capability',async()=>{
  const f=setup();await enrolled(f);const foreign=sessions.issue(store.db.users.other),http=await server();try{const [a,b]=await Promise.all([request(http.base,'/operator/users',f.token),request(http.base,'/operator/users',foreign)]);assert.equal(a.status,200);assert.equal(b.status,403);assert.equal((await b.json()).error,'OPERATOR_ACCESS_REQUIRED');}finally{await http.close();}
 });
 await check('reconciliation output is re-fenced after its async work and emits finite errors',async()=>{
  const f=setup();await enrolled(f);const http=await server(),old=ReconciliationService.runReconciliation;try{ReconciliationService.runReconciliation=async()=>{store.transaction(()=>{store.db.users.actor.operatorEnrollment!.signatureEncrypted+='changed';});return{status:'HEALTHY',fixtureOnly:true} as any;};const response=await request(http.base,'/operator/reconciliation',f.token);assert.equal(response.status,409);assert.equal((await response.json()).error,'OPERATOR_ACCESS_CHANGED');}finally{ReconciliationService.runReconciliation=old;await http.close();}
 });
 console.log('PASS '+cases+' operator capability cases; isolated generated controller and source/emitted/HTTP only, no native operator/account/financial acceptance.');
}
main().catch(e=>{console.error('FAIL operator capability: '+current);console.error(e);process.exitCode=1;}).finally(()=>store.close());
