import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {store} from '../src/db/store';
import {AuthService} from '../src/services/authService';
import {SessionError} from '../src/services/sessionService';
import {authRouter} from '../src/routes/authRoutes';

const initial=structuredClone(store.db),email='owner@retired-otp.example.test',code='000000';
let cases=0,stage='SETUP';
assert.ok(store.isIsolated);
assert.ok(store.storageDirectory.includes('local-check-temp'));
const sql=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'),{readOnly:true});
const rows=()=>sql.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all();
const revision=()=>Number((sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as {revision:number}).revision);
const record=(collection:string,key:string)=>{const r=sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,key) as {record_json:string}|undefined;return r?JSON.parse(r.record_json):undefined;};
function setup(hashed=false){
  store.replace(structuredClone(initial));
  store.transaction(()=>{
    store.db.users.owner={id:'owner',email,emailVerified:true,loginMethod:'CIRCLE_EMAIL',roles:['buyer'],activeWallet:null,createdAt:Date.now()};
    store.db.userByEmail[email]='owner';
    const salt='fixture-salt-for-retired-otp';
    store.db.emailOtps[email]={...(hashed?{salt,hashedCode:crypto.createHash('sha256').update(salt+code).digest('hex')}:{code}),expiresAt:Date.now()+300000,attempts:2,requestedAt:Date.now()-60000};
    store.db.notificationPreferences.owner={inApp:true,email:false};
  });
}
const pending=()=>{store.db.notificationPreferences.pending={inApp:true,email:false};store.db.users.owner.roles=['operator'];};
const retired=(e:unknown)=>e instanceof SessionError&&e.code==='LEGACY_EMAIL_OTP_RETIRED'&&e.status===410;
function unchanged(action:()=>unknown){
  const committed=rows(),cache=structuredClone(store.db),v=revision();
  assert.throws(action,retired);
  assert.equal(revision(),v,'Retired OTP must not write a storage revision');
  assert.deepEqual(rows(),committed,'Retired OTP must preserve all committed rows');
  assert.deepEqual(structuredClone(store.db),cache,'Retired OTP must preserve pending cache');
}
async function check(name:string,fn:()=>unknown,hashed=false){stage=name;setup(hashed);await fn();cases++;}
async function main(){
 try{
  const negative=process.argv.find(a=>a.startsWith('--negative='))?.slice(11);
  if(negative){
   setup();pending();
   if(negative==='request'){
    stage='N337_REQUEST_FLUSH';const v=revision();AuthService.requestOtp('new@retired-otp.example.test');
    console.log(JSON.stringify({observation:stage,storageRevisionChanged:revision()!==v,pendingDomainCommitted:!!record('notificationPreferences','pending'),pendingRoleCommitted:record('users','owner').roles.includes('operator')}));
    assert.equal(revision(),v,'Retired requestOtp still writes the snapshot');
   }else if(negative==='verify'){
    stage='N337_VERIFY_ISSUES_SESSION';const result=AuthService.verifyOtp(email,code);
    console.log(JSON.stringify({observation:stage,sessionIssued:typeof result?.token==='string',pendingRoleCommitted:record('users','owner').roles.includes('operator'),legacyOtpConsumed:record('emailOtps',email)===undefined}));
    assert.equal(typeof result?.token==='string',false,'Retired verifyOtp must not issue a session');
   }else throw Error('Invalid retired OTP negative selector');
   return;
  }
  await check('REQUEST_CANNOT_CREATE_OTP',()=>unchanged(()=>AuthService.requestOtp('new@retired-otp.example.test')));
  await check('PLAINTEXT_LEGACY_OTP_CANNOT_CREATE_SESSION',()=>unchanged(()=>AuthService.verifyOtp(email,code)));
  await check('HASHED_LEGACY_OTP_CANNOT_CREATE_SESSION',()=>unchanged(()=>AuthService.verifyOtp(email,code)),true);
  await check('WRONG_CODE_CANNOT_CHANGE_ATTEMPTS',()=>unchanged(()=>AuthService.verifyOtp(email,'999999')));
  await check('EXPIRED_OTP_CANNOT_BE_PRUNED',()=>{store.transaction(()=>{store.db.emailOtps[email].expiresAt=1});unchanged(()=>AuthService.verifyOtp(email,code));});
  await check('PENDING_ROLE_AND_DOMAIN_CANNOT_FLUSH_REQUEST',()=>{pending();unchanged(()=>AuthService.requestOtp('new@retired-otp.example.test'));});
  await check('PENDING_ROLE_CANNOT_ISSUE_PRIVILEGED_SESSION',()=>{pending();unchanged(()=>AuthService.verifyOtp(email,code));});
  await check('PENDING_OTP_HIDING_CANNOT_PRUNE_COMMITTED_ROW',()=>{delete store.db.emailOtps[email];unchanged(()=>AuthService.verifyOtp(email,code));});
  await check('MISSING_USER_OTP_CANNOT_REGISTER_ACCOUNT',()=>{store.transaction(()=>{delete store.db.users.owner;delete store.db.userByEmail[email]});unchanged(()=>AuthService.verifyOtp(email,code));});
  await check('RETIRED_BOUNDARY_PRECEDES_INPUT_ACCESS',()=>{
    const toxic={get trim(){throw Error('Retired argument must not be read')}};
    for(const value of [undefined,null,1,[],toxic]){unchanged(()=>AuthService.requestOtp(value as unknown as string));unchanged(()=>AuthService.verifyOtp(value as unknown as string,value as unknown as string));}
  });
  await check('RECOVERY_CONTEXT_CANNOT_REACTIVATE_OTP',()=>{store.transaction(()=>{store.db.authRecovery={current:{version:1,context:crypto.randomBytes(32).toString('base64url'),createdAt:Date.now()}}});unchanged(()=>AuthService.requestOtp(email));unchanged(()=>AuthService.verifyOtp(email,code));});
  await check('RETIRED_CALLS_CANNOT_JOIN_PARENT_DOMAIN_TRANSACTION',()=>{
    const v=revision(),committed=rows(),cache=structuredClone(store.db),abort=new Error('isolated parent rollback');
    assert.throws(()=>store.transaction(()=>{pending();unchanged(()=>AuthService.requestOtp(email));unchanged(()=>AuthService.verifyOtp(email,code));throw abort;}),e=>e===abort);
    assert.equal(revision(),v);assert.deepEqual(rows(),committed);assert.deepEqual(structuredClone(store.db),cache);
  });
  await check('REPEATED_CALLS_KEEP_LEGACY_ROWS_AND_COUNTERS',()=>{for(let i=0;i<6;i++){unchanged(()=>AuthService.requestOtp(email));unchanged(()=>AuthService.verifyOtp(email,code));}});
  await check('HTTP_RETIRED_ROUTES_STAY_410_AND_WRITE_NOTHING',async()=>{
    pending();const committed=rows(),cache=structuredClone(store.db),v=revision();
    const app=express();app.use(express.json());app.use('/api/auth',authRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
    try{const base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/auth';for(const route of ['/otp/request','/otp/verify']){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code,actorId:'owner'})});assert.equal(r.status,410);const body=await r.json() as any;assert.equal(typeof body.error,'string');assert.match(body.error,/Circle/);assert.equal(body.token,undefined);assert.equal(body.user,undefined);}}
    finally{await new Promise<void>(r=>server.close(()=>r()));}
    assert.equal(revision(),v);assert.deepEqual(rows(),committed);assert.deepEqual(structuredClone(store.db),cache);
  });
  console.log('PASS '+cases+' retired OTP boundary cases; isolated native SQLite and local HTTP; legacy rows retained; no provider, OTP or session token output');
 }finally{sql.close();}
}
main().catch(e=>{console.error(JSON.stringify({result:'FAIL',stage,assertion:e?.name==='AssertionError',...(e instanceof SessionError?{code:e.code,status:e.status}:{})}));process.exitCode=1;});
