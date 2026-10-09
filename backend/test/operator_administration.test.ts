import {enrollFixtureOperator} from './helpers/operatorFixture';
import {authRouter} from '../src/routes/authRoutes';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {SessionService,SessionError} from '../src/services/sessionService';
import {operatorRouter} from '../src/routes/operatorRoutes';
import {listOperatorUsers,operatorSettings,OperatorAdministrationError} from '../src/services/operatorAdministrationService';

assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);
const initial=store.snapshot(),dbPath=path.join(store.storageDirectory,'groupdeal.sqlite');
const sql=new DatabaseSync(dbPath),hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const all=()=>hash(JSON.stringify({rows:sql.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all(),revision:sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get()}));
const get=(collection:string,key:string)=>JSON.parse((sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,key) as {record_json:string}).record_json);
const put=(collection:string,key:string,value:unknown)=>sql.prepare('UPDATE domain_records SET record_json=? WHERE collection=? AND record_key=?').run(JSON.stringify(value),collection,key);
const privateMarker='LOCAL_ACCOUNT_PRIVATE_EXTENSION';
async function setup(count=4){
 store.replace(structuredClone(initial));store.transaction(()=>{
  for(let i=0;i<count;i++){const id='account-'+String(i).padStart(3,'0'),seller=i%2===1;store.db.users[id]={id,email:id+'@fixture.invalid',roles:seller?['buyer','seller']:['buyer'],createdAt:1700000000000+i,activeWallet:null,loginMethod:'EVM_WALLET',...(seller?{sellerProfile:{displayName:'Studio '+i,bio:'',payoutWallet:config.operatorAddress,verifiedSellerBadge:false,verifiedRightsBadge:false}}:{}),privateExtension:privateMarker,contact:{version:1,revision:0}} as any;}
  for(const id of ['fixture','other-operator'])store.db.users[id]={id,email:id+'@fixture.invalid',roles:['buyer','operator'],createdAt:1700000000099,activeWallet:id==='fixture'?config.operatorAddress:null,loginMethod:'EVM_WALLET'};
 });
 const token=SessionService.issue(store.db.users.fixture),other=SessionService.issue(store.db.users['other-operator']),buyer=SessionService.issue(store.db.users['account-000']),second=SessionService.issue(store.db.users.fixture);
 const proof=SessionService.authenticate(token),enrollment=await enrollFixtureOperator('fixture',proof,{chainId:config.arcChainId}),secondProof=SessionService.authenticate(second);await enrollment.service.authorize(secondProof);return{token,other,buyer,second,proof,secondProof,enrollment,auditCount:get('auditLogs','state').length};
}
const app=express();app.use(express.json());app.use('/api/operator',operatorRouter);app.use('/api/auth',authRouter);
const browser=process.argv.includes('--browser-server');let current:Awaited<ReturnType<typeof setup>>;
async function boot(){current=await setup(browser?42:4);
if(browser){
 app.use((req,res,next)=>{if(req.header('X-Local-Fixture')!=='operator-administration'){res.sendStatus(403);return;}next();});
 app.get('/__session',(_req,res)=>res.json({token:current.token,buyer:current.buyer,authority:current.enrollment.truth.authority,deploymentBlock:config.deploymentBlock,auditCount:current.auditCount}));
 app.post('/__reset',async(_req,res)=>{current=await setup(42);res.json({ready:true});});
 app.get('/__state',(_req,res)=>res.json({hash:all(),isolated:store.isIsolated}));
 app.post('/__stop',(_req,res)=>{res.json({stopping:true});setImmediate(()=>stop());});
 app.post('/__revoke',(_req,res)=>{const actor=get('users','fixture');put('users','fixture',{...actor,roles:['buyer']});res.json({revoked:true});});
 const server=app.listen(0,'127.0.0.1',()=>{const a=server.address() as {port:number};console.log(JSON.stringify({localFixture:'operator-administration',pid:process.pid,port:a.port,isolated:true}));});
 const stop=()=>server.close(()=>{sql.close();store.close();process.exit(0)});process.once('SIGTERM',stop);process.once('SIGINT',stop);
}else await main();
}
void boot().catch(()=>{console.error('Operator fixture bootstrap failed; private values withheld');try{sql.close();store.close();}catch{}process.exitCode=1;});
async function main(){
 let stage='START',cases=0;const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',()=>r()));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const request=async(url:string,token?:string)=>{const response=await fetch(base+'/api/operator/'+url,{headers:token?{Authorization:'Bearer '+token}:{}});return{response,body:await response.json()};};
 const check=async(name:string,run:()=>unknown)=>{stage=name;current=await setup();await run();cases++;console.log(JSON.stringify({case:name,result:'PASS'}));};
 const rejected=(fn:()=>unknown,status:number)=>assert.throws(fn,e=>(e instanceof SessionError||e instanceof OperatorAdministrationError)&&e.status===status);
 try{
  await check('HTTP_AUTHORITY_HEADERS_AND_PRIVATE_PROJECTION',async()=>{
   assert.equal((await request('users')).response.status,401);assert.equal((await request('settings',current.buyer)).response.status,403);
   const before=all();for(const endpoint of ['users','settings']){const r=await request(endpoint,current.token);assert.equal(r.response.status,200);assert.equal(r.response.headers.get('cache-control'),'private, no-store');assert.equal(r.response.headers.get('x-content-type-options'),'nosniff');const text=JSON.stringify(r.body);for(const secret of [privateMarker,'@fixture.invalid','privateExtension','contact',config.jwtSecret,config.masterEncryptionKey,config.authorizedSignerPrivateKey])assert.ok(!text.includes(secret));}
   assert.equal(all(),before);
  });
  await check('READS_COMMITTED_ROWS_PRESERVE_PENDING_AND_REVISION',async()=>{
   const before=all();store.db.users['account-000'].roles=['operator'];(store.db.users['account-000'] as any).privateExtension='LOCAL_DIRTY_UNCOMMITTED';store.db.notificationPreferences.pending={inApp:true,email:false};const cache=hash(JSON.stringify(store.db));
   const list=listOperatorUsers(current.proof,{role:'operator'});assert.deepEqual(list.users.map(v=>v.id),['fixture','other-operator']);operatorSettings(current.proof,{});
   assert.equal(all(),before);assert.equal(hash(JSON.stringify(store.db)),cache);
  });
  await check('BOUND_PAGINATION_FILTER_AND_STALE_CURSOR',async()=>{
   const page=listOperatorUsers(current.proof,{limit:'2'});assert.equal(page.users.length,2);assert.ok(page.pagination.nextCursor);
   const next=listOperatorUsers(current.proof,{limit:'2',cursor:page.pagination.nextCursor!});assert.equal(next.users.length,2);assert.ok(next.users.every(v=>!page.users.some(p=>p.id===v.id)));
   assert.equal(listOperatorUsers(current.proof,{role:'seller'}).users.length,2);
   rejected(()=>listOperatorUsers(SessionService.authenticate(current.other),{limit:'2',cursor:page.pagination.nextCursor!}),400);
   rejected(()=>listOperatorUsers(current.secondProof,{limit:'2',cursor:page.pagination.nextCursor!}),400);
   for(const query of [{limit:'3',cursor:page.pagination.nextCursor!},{role:'seller',limit:'2',cursor:page.pagination.nextCursor!},{limit:'2',cursor:page.pagination.nextCursor!+'x'},{limit:'51'},{role:['operator']},{secret:'unexpected'}])rejected(()=>listOperatorUsers(current.proof,query),400);
   store.transaction(()=>{store.db.users['account-000'].roles=['buyer','seller']});rejected(()=>listOperatorUsers(current.proof,{limit:'2',cursor:page.pagination.nextCursor!}),409);
  });
  await check('REVOKED_ROLE_CANNOT_USE_STALE_OR_FORGED_PROOF',async()=>{
   const actor=get('users','fixture');put('users','fixture',{...actor,roles:['buyer']});assert.ok(store.db.users.fixture.roles.includes('operator'));
   rejected(()=>listOperatorUsers(current.proof,{}),409);rejected(()=>operatorSettings(current.proof,{}),409);
   assert.equal((await request('users',current.token)).response.status,403);assert.equal((await request('settings',current.token)).response.status,403);
   put('users','fixture',actor);
  });
  await check('SESSION_REVOCATION_IDLE_EXPIRY_AND_RECOVERY_BARRIER',async()=>{
   const record=get('authSessions',current.proof.key);
   put('authSessions',current.proof.key,{...record,state:'REVOKED',revokedAt:Date.now(),revokeReason:'USER_REVOKED'});rejected(()=>operatorSettings(current.proof,{}),401);
   put('authSessions',current.proof.key,record);const now=Date.now;try{Date.now=()=>now()+1800001;rejected(()=>listOperatorUsers(current.proof,{}),401);Date.now=()=>now()+8*86400000;rejected(()=>operatorSettings(current.proof,{}),401);}finally{Date.now=now;}
   sql.prepare("INSERT INTO domain_records(collection,record_key,record_json) VALUES('authRecovery','current',?)").run(JSON.stringify({version:1,context:crypto.randomBytes(32).toString('base64url'),createdAt:Date.now()}));rejected(()=>listOperatorUsers(current.proof,{}),401);rejected(()=>operatorSettings(current.proof,{}),401);sql.prepare("DELETE FROM domain_records WHERE collection='authRecovery'").run();
  });
  await check('MALFORMED_DIRECTORY_ROWS_FAIL_WITHOUT_PRIVATE_DIAGNOSTICS',async()=>{
   const original=get('users','account-000');for(const change of [{id:'wrong-key'},{roles:['buyer','superadmin']},{roles:['buyer','buyer']},{roles:'buyer'},{activeWallet:'not-an-address'},{createdAt:-1}]){put('users','account-000',{...original,...change});const r=await request('users',current.token);assert.equal(r.response.status,503);assert.deepEqual(r.body,{error:'OPERATOR_ADMINISTRATION_UNAVAILABLE'});}put('users','account-000',original);
  });
  await check('SETTINGS_CONFIGURED_FLAGS_AND_SECRET_ALLOWLIST',async()=>{
   const saved={circleApiKey:config.circleApiKey,smtpConfigured:config.smtpConfigured,emailProviderUrl:config.emailProviderUrl,emailProviderToken:config.emailProviderToken,operatorAddress:config.operatorAddress};
   try{config.circleApiKey='LOCAL_FIXTURE';config.smtpConfigured=true;config.emailProviderUrl='http://127.0.0.1:9';config.emailProviderToken='LOCAL_FIXTURE';const before=all(),view=operatorSettings(current.proof,{});assert.deepEqual(view.integrations,{circleConfigured:true,smtpConfigured:true,emailApiConfigured:true});assert.equal(view.chainId,config.arcChainId);assert.equal(view.hubAddress,config.hubAddress);assert.equal(all(),before);assert.ok(!JSON.stringify(view).includes('LOCAL_FIXTURE'));rejected(()=>operatorSettings(current.proof,{edit:'true'}),400);config.operatorAddress='invalid';rejected(()=>operatorSettings(current.proof,{}),503);}finally{Object.assign(config,saved);}
  });
  console.log(JSON.stringify({layer:'LOCAL_NATIVE_HTTP_SQL',result:'PASS',cases,isolated:true,mutations:'FIXTURE_ONLY',acceptanceEligible:false}));
 }catch{console.error(JSON.stringify({result:'FAIL',case:stage,cases,redacted:true}));process.exitCode=1;}
 finally{await new Promise<void>(r=>server.close(()=>r()));sql.close();store.close();}
}
