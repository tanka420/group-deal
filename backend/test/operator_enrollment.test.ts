import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {ethers} from 'ethers';
import {config} from '../src/config';
import {store,TransactionalStore} from '../src/db/store';
import {SessionRegistry,SessionError} from '../src/services/sessionService';
import {OperatorEnrollmentService,operatorEnrollmentService} from '../src/services/operatorEnrollment';
import {readCurrentOperatorAuthority} from '../src/services/operatorAuthority';
import {OperatorEnrollmentError,operatorEnrollmentDigest,assertOperatorEnrollmentSignature,parseOperatorAuthority,type OperatorAuthority} from '../src/domain/operatorEnrollment';
import {installRestoredWorkBarrier} from '../src/services/restoredWorkBarrier';
import {decryptEntitlement,encryptEntitlement} from '../src/utils/crypto';
import {authRouter} from '../src/routes/authRoutes';
import {walletAuthContext} from '../src/domain/walletAuthentication';

let cases=0,current='setup';const opened:TransactionalStore[]=[],initial=store.snapshot(),origin='http://localhost:5173';
const sessions=new SessionRegistry(store);const digest=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
async function check(name:string,fn:()=>unknown){current=name;await fn();cases++;console.log('PASS operator enrollment: '+name);}
const rejected=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,e=>e instanceof OperatorEnrollmentError&&e.code===code);
function setup(realm?:'ADMIN'){
 assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);store.replace(structuredClone(initial));
 const wallet=ethers.Wallet.createRandom(),foreign=ethers.Wallet.createRandom(),safe=ethers.Wallet.createRandom().address;config.arcChainId=31337;config.deploymentBlock=1;config.protocolVersion=1;config.operatorAddress=wallet.address;
 const chain={chainId:31337,hubAddress:config.hubAddress,protocolVersion:1,operatorAddress:wallet.address,authorizedSigner:new ethers.Wallet(config.authorizedSignerPrivateKey).address,ownerAddress:foreign.address,securityAuthority:safe,bytecodeHash:ethers.keccak256('0x6000'),blockNumber:3,blockHash:ethers.id('operator-block-3'),observedAt:Date.now()};
 const secret=crypto.randomBytes(40);store.transaction(()=>{
  store.db.users.owner={id:'owner',email:'owner@operator-fixture.example.test',roles:['buyer','seller'],loginMethod:'EVM_WALLET',activeWallet:wallet.address,createdAt:Date.now()};(store.db.users.owner as any).extension={privateValue:'preserved fixture'};
  store.db.users.foreign={id:'foreign',email:'foreign@operator-fixture.example.test',roles:['operator'],loginMethod:'EVM_WALLET',activeWallet:foreign.address,createdAt:Date.now()};
  store.db.userByWallet[wallet.address.toLowerCase()]='owner';store.db.userByWallet[foreign.address.toLowerCase()]='foreign';
  store.db.resources.private={id:'private',encryptedPayload:encryptEntitlement(secret.toString('base64')),byteLength:secret.length,sha256:digest(secret)} as any;
  store.db.emailOutbox.old={id:'old',status:'SENT',payload:{fixture:'private'}} as any;
  store.db.authRecovery={current:{version:1,context:crypto.randomBytes(32).toString('base64url'),createdAt:Date.now()}};
 });
 const old=store.snapshot();store.transaction(()=>{installRestoredWorkBarrier(store,old);});
 const token=sessions.issue(store.db.users.owner,undefined,realm),proof=sessions.authenticate(token),truth={authority:chain,callback:undefined as (()=>void)|undefined,calls:0};
 const authority=async(previous?:OperatorAuthority)=>{truth.calls++;truth.callback?.();truth.callback=undefined;return{...truth.authority,observedAt:Date.now()};};
 const service=new OperatorEnrollmentService({database:store,readAuthority:authority});
 const binding={arcChainId:31337,deploymentBlock:1,protocolVersion:1,operatorAddress:wallet.address};Object.assign(require('../dist/config').config,binding);
 const emitted=new (require('../dist/services/operatorEnrollment').OperatorEnrollmentService)({database:store,readAuthority:authority});
 (operatorEnrollmentService as any).authority=authority;
 return{wallet,foreign,token,proof,service,emitted,truth,secret,holds:structuredClone(store.db.restoredWork)};
}
async function signed(f:ReturnType<typeof setup>,service:OperatorEnrollmentService=f.service){
 const ch=await service.issue(f.proof,f.wallet.address,origin),signature=await f.wallet.signMessage(ch.challengeMessage);
 return{ch,input:{walletAddress:f.wallet.address,message:ch.challengeMessage,signature,nonce:ch.nonce},key:'owner:OPERATOR_ENROLLMENT:'+ch.nonce};
}
function reader(){const sql=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'),{readOnly:true});return{sql,one:(collection:string,key:string)=>{const row=sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,key) as {record_json:string}|undefined;return row?JSON.parse(row.record_json):undefined;}};}
function providerFixture(f:ReturnType<typeof setup>){
 const iface=new ethers.Interface(['function operatorAddress() view returns(address)','function authorizedSigner() view returns(address)','function owner() view returns(address)','function securityAuthority() view returns(address)','function usdcToken() view returns(address)']),calls:{method:string;block:number}[]=[];
 const provider={getNetwork:async()=>({chainId:31337n}),getBlockNumber:async()=>3,getBlock:async(n:number)=>({number:n,hash:n===3?f.truth.authority.blockHash:ethers.id('operator-block-'+n)}),getCode:async(_a:string,n:number)=>{calls.push({method:'code',block:n});return'0x6000';},call:async(tx:any)=>{calls.push({method:'call',block:tx.blockTag});const p=iface.parseTransaction({data:tx.data})!;const value=p.name==='operatorAddress'?f.truth.authority.operatorAddress:p.name==='authorizedSigner'?f.truth.authority.authorizedSigner:p.name==='owner'?f.truth.authority.ownerAddress:p.name==='usdcToken'?config.usdcAddress:f.truth.authority.securityAuthority;return iface.encodeFunctionResult(p.name,[value]);}};
 const manifest={chainId:31337,protocolVersion:1,contracts:{GroupDealHub:{address:config.hubAddress,deploymentBlock:1,bytecodeHash:ethers.keccak256('0x6000')},USDC:{address:config.usdcAddress}},roles:{operator:{address:f.wallet.address},authorizedSigner:{address:f.truth.authority.authorizedSigner},securityAuthority:{type:'safe-multisig',address:f.truth.authority.securityAuthority},owner:{address:f.foreign.address}}};
 return{provider,manifest,calls};
}
async function main(){
 await check('actual authority reader uses canonical same-block Hub/operator/signer/Safe and token code',async()=>{
  const f=setup(),p=providerFixture(f),a=await readCurrentOperatorAuthority(undefined,p);assert.equal(a.operatorAddress,f.wallet.address);assert.equal(a.securityAuthority,f.truth.authority.securityAuthority);assert.equal(a.ownerAddress,p.manifest.roles.owner.address);assert.ok(p.calls.length>=7&&p.calls.every(c=>c.block===3));assert.notEqual(a.securityAuthority,p.manifest.roles.owner.address);
 });
 await check('wrong network/code/operator/signer/Safe and reorg cannot be authority observations',async()=>{
  for(const kind of ['network','code','operator','signer','owner','safe','token','reorg']){
   const f=setup(),p=providerFixture(f);if(kind==='network')p.provider.getNetwork=async()=>({chainId:1n} as any);if(kind==='code')p.provider.getCode=async()=> '0x6001';if(kind==='operator')f.truth.authority.operatorAddress=f.foreign.address;if(kind==='signer')f.truth.authority.authorizedSigner=f.foreign.address;if(kind==='owner')f.truth.authority.ownerAddress=f.wallet.address;if(kind==='token'){const call=p.provider.call;p.provider.call=async(tx:any)=>{if(tx.data===new ethers.Interface(['function usdcToken() view returns(address)']).encodeFunctionData('usdcToken'))return ethers.AbiCoder.defaultAbiCoder().encode(['address'],[f.foreign.address]);return call(tx);};}if(kind==='safe')f.truth.authority.securityAuthority=f.foreign.address;if(kind==='reorg'){let n=0;p.provider.getBlock=async(block:number)=>({number:block,hash:++n===1?f.truth.authority.blockHash:ethers.id('changed-block')});}
   await assert.rejects(readCurrentOperatorAuthority(undefined,p),e=>e instanceof OperatorEnrollmentError);
  }
 });
 for(const emitted of [false,true]){
  await check((emitted?'emitted':'source')+' signature enrollment appends only operator, seals proof and preserves unrelated dirty graph/old holds',async()=>{
   const f=setup(),service=emitted?f.emitted:f.service,db=reader();try{
    store.db.notificationPreferences.pending={inApp:true,email:false};
    const s=await signed(f,service);assert.deepEqual(db.one('users','owner').roles,['buyer','seller']);assert.equal(db.one('notificationPreferences','pending'),undefined);assert.equal((await service.status(f.proof)).status,'READY');
    const result=await service.verify(f.proof,s.input,origin);assert.deepEqual(result.user.roles,['buyer','seller','operator']);assert.equal((result.user as any).operatorEnrollment,undefined);assert.equal(result.transactionSubmitted,false);assert.equal(db.one('notificationPreferences','pending'),undefined);assert.equal(db.one('walletChallenges',s.key),undefined);
    const owner=db.one('users','owner'),record=owner.operatorEnrollment;assert.deepEqual(owner.extension,{privateValue:'preserved fixture'});assert.deepEqual(db.one('users','foreign').roles,['operator']);assert.deepEqual(store.db.restoredWork,f.holds);
    assert.equal(decryptEntitlement(record.signatureEncrypted),s.input.signature);assert.equal(decryptEntitlement(record.messageEncrypted),s.input.message);assert.equal(JSON.parse(decryptEntitlement(record.challengeEncrypted)).nonce,s.ch.nonce);
    assert.equal(store.verifyAuditLogIntegrity().valid,true);assert.ok(store.db.auditLogs.some(a=>a.action==='OPERATOR_SELF_ENROLLED'&&(a.details as any).certificateDigest===operatorEnrollmentDigest(record)));
    assert.ok(!JSON.stringify(result).includes(s.input.signature)&&!JSON.stringify(result).includes(s.input.message)&&!JSON.stringify(result).includes(f.secret.toString('base64')));
    assert.equal((await service.status(f.proof)).status,'ENROLLED');
   }finally{db.sql.close();}
  });
 }
 await check('bad signature/message/account/origin/nonce cannot consume challenge or grant operator',async()=>{
  for(const kind of ['signature','message','origin','nonce']){
   const f=setup(),s=await signed(f),input={...s.input};let requestOrigin=origin;if(kind==='signature')input.signature=await f.foreign.signMessage(input.message);if(kind==='message')input.message+=' altered';if(kind==='origin')requestOrigin='https://foreign.invalid';if(kind==='nonce')input.nonce='0'.repeat(32);
   await assert.rejects(f.service.verify(f.proof,input,requestOrigin));assert.deepEqual(store.readAuthState('owner',f.proof.key).user!.roles,['buyer','seller']);assert.ok(store.db.walletChallenges[s.key]);assert.equal(store.db.users.owner.operatorEnrollment,undefined);assert.deepEqual(store.db.restoredWork,f.holds);
  }
  const f=setup(),s=await signed(f),foreignProof=sessions.authenticate(sessions.issue(store.db.users.foreign));await assert.rejects(f.service.verify(foreignProof,s.input,origin));assert.equal(store.db.users.owner.operatorEnrollment,undefined);
 });
 await check('revoked/recovered session or moved wallet alias during chain await rejects before grant',async()=>{
  for(const kind of ['revoke','context','alias']){
   const f=setup(),s=await signed(f);f.truth.callback=()=>store.transaction(()=>{if(kind==='revoke')store.db.authSessions[f.proof.key].state='REVOKED';if(kind==='context')store.db.authRecovery!.current.context=crypto.randomBytes(32).toString('base64url');if(kind==='alias')store.db.userByWallet[f.wallet.address.toLowerCase()]='foreign';});
   await assert.rejects(f.service.verify(f.proof,s.input,origin));assert.equal(store.db.users.owner.operatorEnrollment,undefined);assert.deepEqual(store.db.users.owner.roles,['buyer','seller']);assert.ok(store.db.walletChallenges[s.key]);
  }
 });
 await check('onchain role revocation or source role change after challenge blocks enrollment',async()=>{
  for(const field of ['operatorAddress','authorizedSigner','ownerAddress','securityAuthority'] as const){const f=setup(),s=await signed(f);f.truth.authority[field]=field==='ownerAddress'?ethers.Wallet.createRandom().address:f.foreign.address;await assert.rejects(f.service.verify(f.proof,s.input,origin));assert.equal(store.db.users.owner.operatorEnrollment,undefined);assert.ok(store.db.walletChallenges[s.key]);}
 });
 await check('dirty actor or reverse binding is never flushed by enrollment',async()=>{
  const f=setup(),s=await signed(f),db=reader();try{(store.db.users.owner as any).pending='uncommitted';await rejected(()=>f.service.verify(f.proof,s.input,origin),'OPERATOR_ENROLLMENT_CONFLICT');assert.equal(db.one('users','owner').pending,undefined);assert.equal(db.one('users','owner').operatorEnrollment,undefined);assert.ok(db.one('walletChallenges',s.key));}finally{db.sql.close();}
  const next=setup();store.db.userByWallet[next.wallet.address.toLowerCase()]='foreign';await rejected(()=>next.service.issue(next.proof,next.wallet.address,origin),'OPERATOR_ENROLLMENT_CONFLICT');assert.equal(Object.keys(store.db.walletChallenges).length,0);
 });
 await check('nonce replay and expiry cannot repeat or substitute an enrollment',async()=>{
  const f=setup(),s=await signed(f);await f.service.verify(f.proof,s.input,origin);await rejected(()=>f.service.verify(f.proof,s.input,origin),'OPERATOR_ENROLLMENT_CHALLENGE_INVALID');assert.equal(store.db.users.owner.roles.filter(r=>r==='operator').length,1);
  const old=setup(),pending=await signed(old);store.transaction(()=>{store.db.walletChallenges[pending.key].expiresAt=Math.floor(Date.now()/1000)-1;});await rejected(()=>old.service.verify(old.proof,pending.input,origin),'OPERATOR_ENROLLMENT_CHALLENGE_INVALID');assert.equal(old.truth.calls,1);
 });
 await check('SQL audit failure rolls back the role, certificate and consumed nonce atomically',async()=>{
  const f=setup(),s=await signed(f),sqlite=(store as any).rows.sqlite as DatabaseSync,prepare=sqlite.prepare.bind(sqlite);let injected=0;
  (sqlite as any).prepare=(query:string)=>query==="UPDATE domain_records SET record_json=? WHERE collection='auditLogs' AND record_key='state'"?{run:()=>{injected++;throw Error('LOCAL_SQL_AUDIT_FAILURE');}}:prepare(query);
  try{await assert.rejects(f.service.verify(f.proof,s.input,origin));assert.equal(injected,1);}finally{(sqlite as any).prepare=prepare;}
  const db=reader();try{assert.deepEqual(db.one('users','owner').roles,['buyer','seller']);assert.equal(db.one('users','owner').operatorEnrollment,undefined);assert.ok(db.one('walletChallenges',s.key));}finally{db.sql.close();}
  await f.service.verify(f.proof,s.input,origin);assert.equal((await f.service.status(f.proof)).status,'ENROLLED');
 });
 await check('sealed controller proof survives auth refresh and restart without granting a different wallet/account',async()=>{
  const f=setup(),s=await signed(f);await f.service.verify(f.proof,s.input,origin);
  store.transaction(()=>{store.db.authRecovery!.current.context=crypto.randomBytes(32).toString('base64url');store.db.walletChallenges={};});
  const next=sessions.authenticate(sessions.issue(store.db.users.owner));assert.equal((await f.service.status(next)).status,'ENROLLED');
  const db=reader();try{assert.deepEqual(db.one('users','foreign').roles,['operator']);assert.deepEqual(store.db.restoredWork,f.holds);}finally{db.sql.close();}
 });
 await check('status rechecks committed actor after chain await and never returns a stale enrolled session or alias',async()=>{
  for(const kind of ['revoke','context','alias']){
   const f=setup(),s=await signed(f);await f.service.verify(f.proof,s.input,origin);
   f.truth.callback=()=>store.transaction(()=>{if(kind==='revoke')store.db.authSessions[f.proof.key].state='REVOKED';if(kind==='context')store.db.authRecovery!.current.context=crypto.randomBytes(32).toString('base64url');if(kind==='alias')store.db.userByWallet[f.wallet.address.toLowerCase()]='foreign';});
   if(kind==='alias'){const value=await f.service.status(f.proof);assert.equal(value.enrolled,false);assert.equal(value.enrollmentNonceDigest,null);}else await assert.rejects(f.service.status(f.proof));
   assert.deepEqual(store.db.users.owner.roles,['buyer','seller','operator']);
  }
 });
 await check('status exact readback exposes account and nonce digest while changed deployment roles require fresh enrollment',async()=>{
  const f=setup(),s=await signed(f);await f.service.verify(f.proof,s.input,origin);const status=await f.service.status(f.proof);assert.equal(status.accountId,'owner');assert.equal(status.enrollmentNonceDigest,operatorEnrollmentDigest(s.ch.nonce));assert.ok(!JSON.stringify(status).includes(s.input.signature)&&!JSON.stringify(status).includes(s.input.message));
  for(const field of ['authorizedSigner','ownerAddress','securityAuthority','bytecodeHash'] as const){const prior=f.truth.authority[field];f.truth.authority[field]=field==='bytecodeHash'?ethers.keccak256('0x6001'):ethers.Wallet.createRandom().address;const value=await f.service.status(f.proof);assert.equal(value.status,'READY');assert.equal(value.enrollmentNonceDigest,null);f.truth.authority[field]=prior;}
 });
 await check('production/Arc fixture overrides are refused without network or role writes',async()=>{
  const f=setup(),p=providerFixture(f),before=process.env.NODE_ENV;try{process.env.NODE_ENV='production';assert.throws(()=>new OperatorEnrollmentService({database:store,readAuthority:async()=>f.truth.authority}),e=>e instanceof OperatorEnrollmentError&&e.code==='OPERATOR_ENROLLMENT_FIXTURE_DISABLED');await rejected(()=>readCurrentOperatorAuthority(undefined,p),'OPERATOR_AUTHORITY_FIXTURE_DISABLED');}finally{process.env.NODE_ENV=before;}
  config.arcChainId=5042002;await rejected(()=>readCurrentOperatorAuthority(undefined,p),'OPERATOR_AUTHORITY_FIXTURE_DISABLED');config.arcChainId=31337;
 });
 const app=express();app.use(express.json());app.use('/api/auth',authRouter);app.use('/api/admin-auth',authRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+(server.address() as any).port;
 const request=(f:ReturnType<typeof setup>,url:string,body?:unknown,overrideOrigin=origin,prefix='/api/admin-auth')=>fetch(base+prefix+'/'+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json',Origin:overrideOrigin},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  await check('HTTP enrollment requires ADMIN session and ADMIN prefix before reading or writing enrollment',async()=>{
   const f=setup('ADMIN'),appSession={...f,token:sessions.issue(store.db.users.owner)};
   for(const [actor,prefix]of [[appSession,'/api/admin-auth'],[appSession,'/api/auth'],[f,'/api/auth']] as const){
    for(const [url,body]of [['operator/enrollment',undefined],['operator/enrollment/challenge',{walletAddress:f.wallet.address}],['operator/enrollment/verify',{walletAddress:f.wallet.address,nonce:'0'.repeat(32),message:'fixture',signature:'0x'}]] as const){
     const r=await request(actor,url,body,origin,prefix);assert.equal(r.status,403);assert.equal((await r.json()).error,'AUTH_SESSION_REALM_REQUIRED');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    }
   }
   assert.equal(f.truth.calls,0);assert.equal(Object.keys(store.db.walletChallenges).length,0);assert.equal(store.db.users.owner.operatorEnrollment,undefined);assert.deepEqual(store.db.users.owner.roles,['buyer','seller']);
  });
  await check('strict HTTP rejects missing auth/query/extra fields/foreign origin with no-store finite codes',async()=>{
   const f=setup('ADMIN');let r=await fetch(base+'/api/admin-auth/operator/enrollment');assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'private, no-store');
   for(const [url,body]of [['operator/enrollment?cursor=x',undefined],['operator/enrollment/challenge',{walletAddress:f.wallet.address,roles:['operator']}],['operator/enrollment/verify',{walletAddress:f.wallet.address,nonce:'x',message:'x',signature:'x'}]] as const){r=await request(f,url,body);assert.equal(r.status,400);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.ok(typeof(await r.json()).error==='string');}
   r=await request(f,'operator/enrollment/challenge',{walletAddress:f.wallet.address},'https://foreign.invalid');assert.equal(r.status,403);assert.equal(Object.keys(store.db.walletChallenges).length,0);assert.deepEqual(store.db.users.owner.roles,['buyer','seller']);
  });
  await check('HTTP challenge/verified enrollment/readback handles lost ACK without a second grant',async()=>{
   const f=setup('ADMIN'),response=await request(f,'operator/enrollment/challenge',{walletAddress:f.wallet.address});assert.equal(response.status,200);const ch=await response.json(),signature=await f.wallet.signMessage(ch.challengeMessage);
   const result=await request(f,'operator/enrollment/verify',{walletAddress:f.wallet.address,nonce:ch.nonce,message:ch.challengeMessage,signature});assert.equal(result.status,200);const body=await result.json();assert.deepEqual(body.user.roles,['buyer','seller','operator']);assert.ok(!JSON.stringify(body).includes(signature));
   const status=await request(f,'operator/enrollment');assert.equal(status.status,200);assert.equal((await status.json()).status,'ENROLLED');assert.equal(store.db.auditLogs.filter(a=>a.action==='OPERATOR_SELF_ENROLLED').length,1);
  });
  await check('HTTP issuance budget persists finite429 without a second nonce',async()=>{
   const f=setup('ADMIN');assert.equal((await request(f,'operator/enrollment/challenge',{walletAddress:f.wallet.address})).status,200);const r=await request(f,'operator/enrollment/challenge',{walletAddress:f.wallet.address});assert.equal(r.status,429);assert.equal((await r.json()).error,'WALLET_AUTH_RATE_LIMITED');assert.equal(Object.keys(store.db.walletChallenges).length,1);
  });
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 console.log('PASS '+cases+' operator enrollment cases; isolated random controller signatures and source/emitted/HTTP only, no actual actor or role acceptance.');
}
void main().catch(error=>{console.error(JSON.stringify({status:'FAIL',case:current,code:error instanceof OperatorEnrollmentError||error instanceof SessionError?error.code:'LOCAL_ASSERTION_OR_STORAGE',frames:error instanceof Error?error.stack?.split(/\r?\n/).filter(l=>/^\s+at /.test(l)).slice(0,6):[]}));process.exitCode=1;}).finally(()=>{for(const db of opened)try{db.close();}catch{}try{store.close();}catch{}});
