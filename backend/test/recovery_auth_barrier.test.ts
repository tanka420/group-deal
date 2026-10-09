import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import {isDeepStrictEqual} from 'node:util';
import {config} from '../src/config';
import {TransactionalStore} from '../src/db/store';
import {StorageConflict} from '../src/db/rowPersistence';
import {SessionRegistry,SessionError} from '../src/services/sessionService';
import {stageRecoverySessionBarrier,RecoverySessionBarrierError} from '../src/services/recoverySessionBarrier';

const opened:TransactionalStore[]=[],owned=()=>fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-test-recovery-auth-'));
function open(directory=owned()){const db=new TransactionalStore(directory);opened.push(db);return db;}
function fixture(){const db=open();db.db.users.a={id:'a',email:'a@example.test',roles:['buyer','seller'],createdAt:Date.now(),activeWallet:'0x0000000000000000000000000000000000000011'};db.db.users.b={...db.db.users.a,id:'b',email:'b@example.test',roles:['buyer'],activeWallet:null};db.db.userByEmail['a@example.test']='a';db.db.userByWallet[db.db.users.a.activeWallet!.toLowerCase()]='a';db.save();return{db,s:new SessionRegistry(db)};}
const rejected=(fn:()=>unknown,code:string,status=401)=>assert.throws(fn,e=>e instanceof SessionError&&e.code===code&&e.status===status);
const intent=()=>({idempotencyKey:crypto.randomUUID()}),legacy=(id:string)=>jwt.sign({userId:id},config.jwtSecret,{expiresIn:'1h'});
let count=0,currentCase='startup';
async function test(label:string,fn:()=>void|Promise<void>){currentCase=label;await fn();count++;console.log('PASS recovery auth: '+label);}
async function main(){
 await test('an ACTIVE snapshot cannot resurrect a managed session revoked after that snapshot',()=>{
  const {db,s}=fixture(),token=s.issue(db.db.users.a),snapshot=db.snapshot();s.logout(token,intent());rejected(()=>s.authenticate(token),'AUTH_SESSION_INACTIVE');
  const old=open();old.replace(snapshot);const restored=new SessionRegistry(old);assert.equal(restored.authenticate(token).account.id,'a','Negative control: old snapshot alone restores old authorization');
  const before=old.snapshot(),prepared=stageRecoverySessionBarrier(old,owned()),candidate=open(prepared.candidateDirectory),guard=new SessionRegistry(candidate);
  rejected(()=>guard.authenticate(token),'AUTH_SESSION_INACTIVE');rejected(()=>guard.authenticate(token,{allowInactive:true}),'AUTH_SESSION_INACTIVE');rejected(()=>guard.logout(token,intent()),'AUTH_SESSION_INACTIVE');
  assert.deepEqual(old.snapshot(),before);assert.deepEqual(open(prepared.retainedDirectory).snapshot(),before);assert.deepEqual(candidate.db.authSessions,before.authSessions);assert.equal(prepared.metadata.authCutoverAllowed,false);
 });
 await test('previously unlisted legacy JWTs cannot materialize restored sessions or bypass logout',()=>{
  const {db}=fixture(),token=legacy('b'),prepared=stageRecoverySessionBarrier(db,owned()),candidate=open(prepared.candidateDirectory),s=new SessionRegistry(candidate),before=candidate.snapshot();
  rejected(()=>s.authenticate(token),'AUTH_SESSION_INACTIVE');rejected(()=>s.authenticate(token,{allowInactive:true,allowMissingLegacy:true}),'AUTH_SESSION_INACTIVE');rejected(()=>s.logout(token,intent()),'AUTH_SESSION_INACTIVE');assert.deepEqual(candidate.snapshot(),before);
 });
 await test('fresh sessions keep accounts/roles/principals and support session management after restart',()=>{
  const {db}=fixture(),prepared=stageRecoverySessionBarrier(db,owned()),candidate=open(prepared.candidateDirectory),s=new SessionRegistry(candidate),token=s.issue(candidate.db.users.a),proof=s.authenticate(token);
  assert.equal(s.list(proof,{}).sessions.length,1);assert.deepEqual(proof.account.roles,db.db.users.a.roles);assert.equal(proof.account.activeWallet,db.db.users.a.activeWallet);
  candidate.close();const restarted=open(prepared.candidateDirectory),r=new SessionRegistry(restarted),ack=r.command(token,'ALL',undefined,intent());assert.equal(ack.currentSessionRevoked,true);rejected(()=>r.authenticate(token),'AUTH_SESSION_INACTIVE');assert.deepEqual(r.commandStatus(token,ack.requestId),ack);
 });
 await test('recovery JWTs are rejected in the original environment even with the same JWT key',()=>{
  const {db,s}=fixture(),prepared=stageRecoverySessionBarrier(db,owned()),candidate=open(prepared.candidateDirectory),token=new SessionRegistry(candidate).issue(candidate.db.users.a);
  rejected(()=>s.authenticate(token),'AUTH_SESSION_INACTIVE');assert.equal(db.db.authRecovery,undefined);assert.deepEqual(candidate.db.userByWallet,db.db.userByWallet);
 });
 await test('a second staging job requires another fresh login without invalidating its source environment',()=>{
  const {db}=fixture(),first=stageRecoverySessionBarrier(db,owned()),a=open(first.candidateDirectory),s=new SessionRegistry(a),token=s.issue(a.db.users.a),before=a.snapshot(),second=stageRecoverySessionBarrier(a,owned()),b=open(second.candidateDirectory),r=new SessionRegistry(b);
  rejected(()=>r.authenticate(token),'AUTH_SESSION_INACTIVE');assert.equal(s.authenticate(token).account.id,'a');assert.deepEqual(a.snapshot(),before);assert.equal(r.authenticate(r.issue(b.db.users.a)).account.id,'a');
 });
 await test('pending credential proofs are disabled while completed history and original records remain retained',()=>{
  const {db}=fixture(),now=Date.now();db.db.emailOtps['a@example.test']={hashedCode:'fixture-code-hash',salt:'fixture-salt',expiresAt:now+300000,attempts:0} as any;db.db.walletChallenges.a={userId:'a',action:'WALLET_LOGIN',message:'fixture challenge',nonce:'fixture nonce',expiresAt:Math.floor(now/1000)+300,chainId:config.arcChainId,origin:'http://fixture.test',walletAddress:db.db.users.a.activeWallet!};db.db.circleLoginAttempts.old={id:'old',email:'a@example.test',deviceIdHash:'fixture-digest',expiresAt:now+300000};
  for(const collection of ['walletBindingIntents','sellerProfileIntents'] as const){db.db[collection].pending={id:'pending',state:'PENDING'} as any;db.db[collection].done={id:'done',state:'COMMITTED',committedAt:now} as any;}
  db.db.users.a.contact={version:1,revision:2,pending:{id:'fixture-contact',requestKey:'fixture-contact',baseRevision:2,targetEncrypted:'fixture-encrypted-reference',keyId:'fixture',salt:'fixture',codeDigest:'fixture',createdAt:now,expiresAt:now+300000,attempts:0,state:'PENDING',outboxId:'mail-1'}};
  db.save();const before=db.snapshot(),prepared=stageRecoverySessionBarrier(db,owned()),candidate=open(prepared.candidateDirectory),retained=open(prepared.retainedDirectory);
  assert.deepEqual(retained.snapshot(),before);assert.deepEqual(db.snapshot(),before);assert.equal(Object.keys(candidate.db.walletChallenges).length+Object.keys(candidate.db.emailOtps).length+Object.keys(candidate.db.circleLoginAttempts).length,0);
  for(const c of ['walletBindingIntents','sellerProfileIntents'] as const){assert.equal(candidate.db[c].pending.state,'CANCELLED');assert.deepEqual(candidate.db[c].done,before[c].done);}assert.equal(candidate.db.users.a.contact?.pending?.state,'CANCELLED');assert.equal(candidate.db.users.a.contact?.revision,2);
 });
 await test('financial orders, delivery rights, transaction recovery, queues and audit remain preserved',()=>{
  const {db,s}=fixture();s.issue(db.db.users.a);db.db.orders.local={id:'local',onchainOrderId:1,campaignId:'campaign',buyerAccountId:'a',buyerPrincipal:db.db.users.a.activeWallet,committedGross:'1000000',buyerClaimed:'7',sellerClaimed:'9',deliveredEntitlementEncrypted:'fixture-encrypted-private-reference',transactionHistory:[{txHash:'fixture-chain-hash'}]} as any;db.db.resourceGrants.grant={id:'grant',orderId:'local',unitIndex:0} as any;db.db.operations.pending={id:'pending',state:'SUBMITTED',txHash:'fixture-chain-hash'} as any;db.db.emailOutbox.mail={id:'mail',status:'QUEUED',payload:{fixture:'private'}} as any;db.db.webhookQueue.job={id:'job',status:'PENDING'} as any;db.save();
  const before=db.snapshot(),prepared=stageRecoverySessionBarrier(db,owned()),candidate=open(prepared.candidateDirectory);
  for(const key of ['orders','resourceGrants','operations','emailOutbox','webhookQueue','authSessions','userByWallet','userByCircleId','campaignIdentities'] as const)assert.deepEqual(candidate.db[key],before[key]);assert.deepEqual(candidate.db.users,before.users);assert.ok(candidate.verifyAuditLogIntegrity().valid);assert.deepEqual(candidate.db.auditLogs.slice(1),before.auditLogs);
 });
 await test('committed barrier reads block stale readers/proofs without advancing their writer CAS',()=>{
  const {db}=fixture(),prepared=stageRecoverySessionBarrier(db,owned()),writer=open(prepared.candidateDirectory),token=new SessionRegistry(writer).issue(writer.db.users.a),reader=open(prepared.candidateDirectory),r=new SessionRegistry(reader),proof=r.authenticate(token);reader.db.rateLimits.pending={count:1,windowStartedAt:1,lastAttemptAt:1};
  writer.transaction(()=>{writer.db.authRecovery!.current.context=crypto.randomBytes(32).toString('base64url');});
  rejected(()=>r.authenticate(token),'AUTH_SESSION_INACTIVE');rejected(()=>r.list(proof,{}),'AUTH_SESSION_INACTIVE');assert.ok(reader.db.rateLimits.pending);assert.throws(()=>reader.save(),StorageConflict);
 });
 await test('malformed committed recovery metadata fails closed rather than reverting to legacy mode',()=>{
  const {db,s}=fixture(),token=s.issue(db.db.users.a);for(const value of [{current:null},{current:{version:2,context:'short',createdAt:1}},{current:{version:1,context:crypto.randomBytes(32).toString('base64url'),createdAt:Date.now()+60000}},{unexpected:{version:1,context:crypto.randomBytes(32).toString('base64url'),createdAt:1}}]){db.db.authRecovery=value as any;db.save();rejected(()=>s.authenticate(token),'AUTH_SESSION_UNAVAILABLE',503);}
 });
 await test('active-source/active-parent and invalid audit reject before staging or changing source',()=>{
  assert.throws(()=>stageRecoverySessionBarrier({isIsolated:false,snapshot(){throw Error('must not read active');}} as any,owned()),e=>e instanceof RecoverySessionBarrierError&&e.code==='RECOVERY_AUTH_ISOLATED_SOURCE_REQUIRED');
  const {db}=fixture(),before=db.snapshot();assert.throws(()=>stageRecoverySessionBarrier(db,path.resolve(__dirname,'../data')),e=>e instanceof RecoverySessionBarrierError&&e.code==='RECOVERY_AUTH_ACTIVE_PARENT_DISABLED');assert.deepEqual(db.snapshot(),before);
  db.addAuditLog('fixture','buyer','FIXTURE',{});db.db.auditLogs[0].hash='fixture-invalid';db.save();const invalid=db.snapshot();assert.throws(()=>stageRecoverySessionBarrier(db,owned()),e=>e instanceof RecoverySessionBarrierError&&e.code==='RECOVERY_AUTH_SOURCE_AUDIT_INVALID');assert.ok(isDeepStrictEqual(db.snapshot(),invalid));
 });
 console.log(`PASS ${count} recovery auth barrier cases; local isolated fixtures only, no active session/order revocation or recovery rollout.`);
}
void main().catch(error=>{console.error('FAIL recovery auth barrier; private values withheld');console.error(JSON.stringify({case:currentCase,code:error instanceof SessionError||error instanceof RecoverySessionBarrierError?error.code:'LOCAL_ASSERTION_OR_STORAGE',frames:error instanceof Error?error.stack?.split(/\r?\n/).filter(l=>/^\s+at /.test(l)).slice(0,3):[]}));process.exitCode=1;}).finally(()=>{for(const db of opened)try{db.close();}catch{}});
