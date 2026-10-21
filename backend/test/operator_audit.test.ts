import {config} from '../src/config';
import {enrollFixtureOperator} from './helpers/operatorFixture';
import {authRouter} from '../src/routes/authRoutes';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {store} from '../src/db/store';
import {SessionService,SessionError} from '../src/services/sessionService';
import {operatorRouter} from '../src/routes/operatorRoutes';
import {listOperatorAudit,verifyOperatorAudit,OperatorAuditError} from '../src/services/operatorAuditService';
import {listOperatorUsers} from '../src/services/operatorAdministrationService';
assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);
const initial=store.snapshot(),sql=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite')),hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const all=()=>hash(JSON.stringify({rows:sql.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all(),revision:sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get()}));
const get=(collection:string,key:string)=>JSON.parse((sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,key) as {record_json:string}).record_json);
const injected=new Map<string,{collection:string;key:string;json:string}>();let injectedRevision:number|undefined;
const put=(collection:string,key:string,value:unknown)=>{const name=collection+':'+key;if(!injected.has(name))injected.set(name,{collection,key,json:(sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,key) as {record_json:string}).record_json});return sql.prepare('UPDATE domain_records SET record_json=? WHERE collection=? AND record_key=?').run(JSON.stringify(value),collection,key);};
async function setup(count=55){
 for(const r of injected.values())sql.prepare('UPDATE domain_records SET record_json=? WHERE collection=? AND record_key=?').run(r.json,r.collection,r.key);injected.clear();if(injectedRevision!==undefined){sql.prepare('UPDATE storage_revision SET revision=? WHERE id=1').run(injectedRevision);injectedRevision=undefined;}
 store.replace(structuredClone(initial));store.transaction(()=>{
  for(const [id,roles] of [['fixture',['buyer','operator']],['other-operator',['buyer','operator']],['buyer',['buyer']]] as const)store.db.users[id]={id,email:id+'@fixture.invalid',roles:[...roles],createdAt:1700000000000,activeWallet:null,loginMethod:'EVM_WALLET'};
  for(let i=0;i<count;i++)store.addAuditLog(i%10===0?'private-actor@fixture.invalid':'fixture','operator','RESOURCE_REVIEWED',{index:i,email:'private@fixture.invalid',privateExtension:'LOCAL_AUDIT_PRIVATE_MARKER',licenseKey:'LOCAL_AUDIT_PRIVATE_CONTENT',nested:{value:'LOCAL_AUDIT_PRIVATE_MARKER'}});
 });
 const token=SessionService.issue(store.db.users.fixture,'EVM_WALLET','ADMIN'),other=SessionService.issue(store.db.users['other-operator'],'EVM_WALLET','ADMIN'),buyer=SessionService.issue(store.db.users.buyer);
 const proof=SessionService.authenticate(token),enrollment=await enrollFixtureOperator('fixture',proof,{chainId:config.arcChainId});return{token,other,buyer,proof,otherProof:SessionService.authenticate(other),enrollment,auditCount:get('auditLogs','state').length};
}
let current:Awaited<ReturnType<typeof setup>>;const app=express();app.use(express.json());app.use('/api/operator',operatorRouter);app.use('/api/auth',authRouter);app.use('/api/admin-auth',authRouter);
const browser=process.argv.includes('--browser-server');
async function boot(){current=await setup();
if(browser){
 app.use((req,res,next)=>{if(req.header('X-Local-Fixture')!=='operator-audit'){res.sendStatus(403);return;}next();});
 app.get('/__session',(_req,res)=>res.json({token:current.token,buyer:current.buyer,authority:current.enrollment.truth.authority,deploymentBlock:config.deploymentBlock,auditCount:current.auditCount}));
 app.post('/__reset',async(_req,res)=>{current=await setup();res.json({ready:true});});
 app.get('/__state',(_req,res)=>res.json({hash:all(),isolated:store.isIsolated}));
 app.post('/__revoke',(_req,res)=>{put('users','fixture',{...get('users','fixture'),roles:['buyer']});res.json({revoked:true});});
 app.post('/__append',(_req,res)=>{store.addAuditLog('fixture','operator','RESOURCE_REVIEWED',{fixture:true});res.json({appended:true});});
 app.post('/__stop',(_req,res)=>{res.json({stopping:true});setImmediate(stop);});
 const server=app.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({localFixture:'operator-audit',pid:process.pid,port:(server.address() as {port:number}).port,isolated:true})));
 const stop=()=>server.close(()=>{sql.close();store.close();process.exit(0)});process.once('SIGTERM',stop);process.once('SIGINT',stop);
}else await main();
}
void boot().catch(()=>{console.error('Operator fixture bootstrap failed; private values withheld');try{sql.close();store.close();}catch{}process.exitCode=1;});
async function main(){
 let stage='START',cases=0;const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const request=async(url:string,token?:string)=>{const response=await fetch(base+'/api/operator/'+url,{headers:token?{Authorization:'Bearer '+token}:{}});return{response,body:await response.json()};};
 const selector=process.argv.find(v=>v.startsWith('--case='))?.slice(7); const check=async(name:string,run:()=>unknown)=>{if(selector&&!new RegExp(selector).test(name))return;stage=name;current=await setup();await run();cases++;console.log(JSON.stringify({case:name,result:'PASS'}));};
 const rejected=(fn:()=>unknown,status:number)=>assert.throws(fn,e=>(e instanceof SessionError||e instanceof OperatorAuditError)&&e.status===status);
 try{
  await check('audit authority headers query and private DTO',async()=>{
   assert.equal((await request('audit-logs')).response.status,401);assert.equal((await request('audit-logs',current.buyer)).response.status,403);assert.equal((await request('audit-logs/verify',current.buyer)).response.status,403);
   for(const query of ['?limit=0','?limit=51','?limit=2.1','?action=not-valid','?actor=constructor','?unknown=value'])assert.equal((await request('audit-logs'+query,current.token)).response.status,400);
   assert.equal((await request('audit-logs/verify?anything=1',current.token)).response.status,400);
   const before=all(),{response,body}=await request('audit-logs',current.token);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(body.scope,'OPERATOR_AUDIT_PAGE');assert.equal(body.logs.length,20);assert.equal(body.integrityChecked,false);
   for(const marker of ['LOCAL_AUDIT_PRIVATE_MARKER','LOCAL_AUDIT_PRIVATE_CONTENT','@fixture.invalid','details','privateExtension','licenseKey','authSessions'])assert.ok(!JSON.stringify(body).includes(marker));assert.equal(all(),before);
  });
  await check('audit filtered cursor pages and empty account filters',async()=>{
   const positions:number[]=[];let cursor:string|undefined;do{const page=listOperatorAudit(current.proof,{limit:'7',action:'RESOURCE_REVIEWED',...(cursor?{cursor}:{})});assert.ok(page.logs.length<=7);for(const row of page.logs){positions.push(row.position);assert.equal(row.action,'RESOURCE_REVIEWED');if(row.actorId===null)assert.equal(row.actorDigest,hash('private-actor@fixture.invalid'));}cursor=page.pagination.nextCursor??undefined;}while(cursor);
   assert.equal(positions.length,55);assert.equal(new Set(positions).size,55);assert.ok(positions.every((p,i)=>i===0||p>positions[i-1]));
   const filtered=listOperatorAudit(current.proof,{limit:'50',action:'RESOURCE_REVIEWED',actor:'fixture'});assert.equal(filtered.logs.length,49);assert.ok(filtered.logs.every(r=>r.actorId==='fixture'));assert.equal(filtered.pagination.nextCursor,null);
   assert.equal(listOperatorAudit(current.proof,{actor:'private-actor@fixture.invalid'}).logs.length,0);assert.equal(listOperatorAudit(current.proof,{action:'NO_MATCH'}).logs.length,0);
  });
  await check('audit cursor actor session deployment purpose and stale revision',async()=>{
   const page=listOperatorAudit(current.proof,{limit:'1'}),cursor=page.pagination.nextCursor!;assert.ok(cursor);rejected(()=>listOperatorAudit(current.otherProof,{limit:'1',cursor}),400);rejected(()=>listOperatorAudit(current.proof,{limit:'2',cursor}),400);rejected(()=>listOperatorAudit(current.proof,{limit:'1',action:'RESOURCE_REVIEWED',cursor}),400);rejected(()=>listOperatorAudit(current.proof,{limit:'1',actor:'fixture',cursor}),400);rejected(()=>listOperatorAudit(current.proof,{limit:'1',cursor:cursor.slice(0,-1)+(cursor.endsWith('a')?'b':'a')}),400);
   const second=SessionService.authenticate(SessionService.issue(store.db.users.fixture,'EVM_WALLET','ADMIN'));await current.enrollment.service.authorize(second);rejected(()=>listOperatorAudit(second,{limit:'1',cursor}),400);
   const userCursor=listOperatorUsers(current.proof,{limit:'1'}).pagination.nextCursor!;assert.ok(userCursor);rejected(()=>listOperatorAudit(current.proof,{limit:'1',cursor:userCursor}),400);
   const revisionCursor=listOperatorAudit(current.proof,{limit:'1'}).pagination.nextCursor!;injectedRevision=(sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as {revision:number}).revision;sql.prepare('UPDATE storage_revision SET revision=revision+1 WHERE id=1').run();rejected(()=>listOperatorAudit(current.proof,{limit:'1',cursor:revisionCursor}),409);
  });
  await check('audit ignores pending cache and preserves committed rows cache and revision',async()=>{
   const before=all(),committed=get('auditLogs','state');store.db.auditLogs.unshift({id:'audit_pending',timestamp:1700000000001,actor:'fixture',role:'operator',action:'PENDING_AUDIT_FIXTURE',details:{privateExtension:'LOCAL_AUDIT_PRIVATE_MARKER'},hash:'1'.repeat(64),prevHash:'0'.repeat(64)});
   const cache=JSON.stringify(store.db.auditLogs),page=listOperatorAudit(current.proof,{}),verified=verifyOperatorAudit(current.proof,{});console.log(JSON.stringify({diagnostic:'PENDING_CACHE_GUARD',valid:verified.valid,reason:verified.reason,checked:verified.checked,expectedChecked:committed.length,brokenPosition:verified.brokenPosition,pendingReturned:page.logs.some(r=>r.id==='audit_pending'),cacheUnchanged:JSON.stringify(store.db.auditLogs)===cache,sqlUnchanged:all()===before}));assert.ok(!page.logs.some(r=>r.id==='audit_pending'));assert.equal(verified.valid,true);assert.equal(verified.checked,committed.length);assert.equal(JSON.stringify(store.db.auditLogs),cache);assert.equal(all(),before);
  });
  await check('audit integrity detects stored hash and link changes without exposing contents',async()=>{
   let logs=get('auditLogs','state');logs[2].details.privateExtension='LOCAL_TAMPERED_AUDIT';put('auditLogs','state',logs);const before=all(),v=verifyOperatorAudit(current.proof,{});assert.equal(v.valid,false);assert.equal(v.reason,'HASH_MISMATCH');assert.equal(v.brokenPosition,2);assert.equal(all(),before);assert.ok(!JSON.stringify(v).includes('LOCAL_TAMPERED_AUDIT'));
   current=await setup(205);const full=verifyOperatorAudit(current.proof,{});assert.equal(full.valid,true);assert.equal(full.checked,current.auditCount);
   logs=get('auditLogs','state');logs[0].prevHash='f'.repeat(64);const first=logs[0];first.hash=hash(first.prevHash+':'+first.timestamp+':'+first.actor+':'+first.role+':'+first.action+':'+JSON.stringify(first.details));put('auditLogs','state',logs);const link=await request('audit-logs/verify',current.token);assert.equal(link.response.status,200);assert.equal(link.body.reason,'CHAIN_LINK_MISMATCH');assert.equal(link.body.brokenPosition,0);assert.ok(!JSON.stringify(link.body).includes('details'));
  });
  await check('audit rejects revoked actor and inactive session even with previously valid proofs',async()=>{
   put('users','fixture',{...get('users','fixture'),roles:['buyer']});rejected(()=>listOperatorAudit(current.proof,{}),409);rejected(()=>verifyOperatorAudit(current.proof,{}),409);assert.equal((await request('audit-logs',current.token)).response.status,403);
   current=await setup();const session=get('authSessions',current.proof.key);put('authSessions',current.proof.key,{...session,state:'REVOKED',revokedAt:Date.now()});rejected(()=>listOperatorAudit(current.proof,{}),401);rejected(()=>verifyOperatorAudit(current.proof,{}),401);
   current=await setup();const now=Date.now;try{Date.now=()=>now()+24*60*60*1000+1;rejected(()=>listOperatorAudit(current.proof,{}),401);Date.now=()=>now()+8*86400000;rejected(()=>verifyOperatorAudit(current.proof,{}),401);}finally{Date.now=now;}
  });
  await check('audit malformed records fail closed and read callbacks expire',async()=>{
   const logs=get('auditLogs','state');logs[0].hash='invalid';put('auditLogs','state',logs);rejected(()=>listOperatorAudit(current.proof,{}),503);assert.equal(verifyOperatorAudit(current.proof,{}).reason,'AUDIT_RECORD_INVALID');
   put('auditLogs','state',{privateExtension:'LOCAL_AUDIT_PRIVATE_MARKER'});rejected(()=>listOperatorAudit(current.proof,{}),503);rejected(()=>verifyOperatorAudit(current.proof,{}),503);
   current=await setup();let held:any;store.readOperatorAdministration('fixture',current.proof.key,state=>{held=state;return true;});assert.throws(()=>held.auditPage(1,-1));assert.throws(()=>held.auditIntegrityPage(1,-1));
  });
  console.log(JSON.stringify({result:'PASS',cases,originalDatabaseSqlOpened:false,networkScope:'LOOPBACK_ONLY',isolated:true}));
 }catch(e){console.error(JSON.stringify({result:'FAIL',stage,errorCode:e instanceof OperatorAuditError||e instanceof SessionError?e.code:'LOCAL_ASSERTION_FAILED'}));process.exitCode=1;}
 finally{await new Promise<void>(r=>server.close(()=>r()));sql.close();store.close();}
}
