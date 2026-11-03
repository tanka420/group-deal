'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {publicFiles,unit,nginx}=require('./prepare_mainnet_release.cjs'),{retainThree}=require('./mainnet-ops/backup.cjs'),{observe}=require('./mainnet-ops/health.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.cache/mainnet-ops-tests');fs.mkdirSync(base,{recursive:true});
function directory(t){const p=fs.mkdtempSync(path.join(base,'test-'));t.after(()=>{if(fs.realpathSync(p)!==p||path.dirname(p)!==base)throw Error('TEST_CLEANUP_SCOPE');fs.rmSync(p,{recursive:true});});return p;}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function records(dir){return Array.from({length:5},(_,i)=>{const bytes=Buffer.from('isolated archive '+i),r={archive:`backup_${1793000000000+i}_${crypto.randomUUID()}.enc`,timestamp:1793000000000+i,verified:true,chainId:5042,sha256:sha(bytes),byteLength:bytes.length};fs.writeFileSync(path.join(dir,r.archive),bytes);fs.writeFileSync(path.join(dir,r.archive+'.json'),JSON.stringify(r));return r;});}
test('retention authenticates every deletion before pruning, keeps three and leaves unknown files intact',t=>{
 const d=directory(t),r=records(d);fs.writeFileSync(path.join(d,'unknown.enc'),'keep');let checked=0;
 assert.throws(()=>retainThree(d,r,file=>{checked++;if(checked===2)throw Error('bad authentication');return{timestamp:r.find(v=>file.endsWith(v.archive)).timestamp,envelopeVersion:3,metadataAuthenticated:true};}));
 assert(r.every(v=>fs.existsSync(path.join(d,v.archive))));
 const keep=retainThree(d,r,file=>({timestamp:r.find(v=>file.endsWith(v.archive)).timestamp,envelopeVersion:3,metadataAuthenticated:true}));assert.equal(keep.length,3);assert.equal(fs.existsSync(path.join(d,'unknown.enc')),true);assert.equal(fs.existsSync(path.join(d,r[0].archive)),false);
});
test('changed archive bytes or path escape block all pruning',t=>{
 const d=directory(t),r=records(d);assert.throws(()=>retainThree(d,[...r,{...r[0],archive:'../outside.enc'}],()=>{}));
 fs.appendFileSync(path.join(d,r[1].archive),'changed');assert.throws(()=>retainThree(d,r,()=>{}));assert(r.every(v=>fs.existsSync(path.join(d,v.archive))));
});
test('internal health requires Mainnet deployment and fresh authenticated backup bytes without sending email',async()=>{
 const bytes=Buffer.from('isolated ciphertext'),v={status:'OK',scope:'PROCESS_LIVENESS_ONLY',financialAccountingVerified:false,chainId:5042,protocolVersion:2,hubAddress:'0x52A893b45C1BeaBdCe04f58705D7812eA2519Ff8'},b={chainId:5042,hubAddress:v.hubAddress,verified:true,sourceReadOnly:true,privateRestoreVerified:true,archive:`backup_${Date.now()}_${crypto.randomUUID()}.enc`,timestamp:Date.now(),sha256:sha(bytes),byteLength:bytes.length};
 const read=file=>file.endsWith('LATEST.json')?Buffer.from(JSON.stringify(b)):bytes;
 assert.equal((await observe(async url=>{assert.equal(url,'http://127.0.0.1:4100/api/health');return{status:200,json:async()=>v};},read)).status,'UP');
 for(const bad of [{...v,chainId:5042002},{...v,hubAddress:'0x'+'1'.repeat(40)},{...v,financialAccountingVerified:true}])assert.equal((await observe(async()=>({status:200,json:async()=>bad}),read)).status,'ATTENTION');
 b.timestamp=Date.now()-91*60000;assert.equal((await observe(async()=>({status:200,json:async()=>v}),read)).status,'ATTENTION');
 b.timestamp=Date.now();b.sha256='0'.repeat(64);assert.equal((await observe(async()=>({status:200,json:async()=>v}),read)).status,'ATTENTION');
});
test('release copying rejects data, env, path traversal, changed build bytes and missing files',t=>{
 const d=directory(t),bytes=Buffer.from('public bundle');fs.writeFileSync(path.join(d,'bundle.js'),bytes);
 const b={frontend:{directory:d,files:[{path:'bundle.js',sha256:sha(bytes)}]},backend:{directory:d,files:[]}};assert.equal(publicFiles(b).length,1);
 for(const name of ['../bundle.js','.env','data/groupdeal.sqlite','node_modules/a.js','bundle.js.map'])assert.throws(()=>publicFiles({...b,frontend:{directory:d,files:[{path:name,sha256:sha(bytes)}]}}));
 fs.writeFileSync(path.join(d,'bundle.js'),'changed');assert.throws(()=>publicFiles(b),/BUILD_CHANGED/);
 assert(unit('app').includes('User=groupdeal-mainnet\n'));assert(unit('app').includes('ReadWritePaths=/var/lib/groupdeal-mainnet/data\n'));assert(!unit('health').includes('EnvironmentFile='));assert(nginx().includes('proxy_pass http://127.0.0.1:4100;'));
});
test('real SQLite online backup preserves source rows and restores encrypted fixture data in isolation',t=>{
 const d=directory(t),script=String.raw`
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd(),dir=process.argv[1],{TransactionalStore}=require('./backend/dist/db/store'),{encryptEntitlement}=require('./backend/dist/utils/crypto');
const source=new TransactionalStore(path.join(dir,'data'));source.db.users.fixture={id:'fixture',email:'',createdAt:Date.now(),roles:['buyer'],activeWallet:null,contact:{version:1,revision:1,verified:{payloadEncrypted:encryptEntitlement('fixture-private-contact'),source:'CONTACT_CHALLENGE'}}};source.save();
const before=source.snapshot(),state=path.join(dir,'backups');fs.mkdirSync(state);
require('./scripts/mainnet-ops/backup.cjs').snapshotBackup(root,state,path.join(dir,'data/groupdeal.sqlite')).then(result=>{assert.deepStrictEqual(source.snapshot(),before);assert.equal(result.result,'PASS_ENCRYPTED_BACKUP_RESTORE');const latest=JSON.parse(fs.readFileSync(path.join(state,'LATEST.json')));assert(latest.verified);assert(!fs.readFileSync(path.join(state,'archives',latest.archive),'utf8').includes('fixture-private-contact'));source.close();console.log('PASS isolated SQLite/encryption/restore/source preservation');}).catch(()=>{source.close();process.exitCode=1;});`;
 const env={...require('./local_check_runtime.cjs').localCheckEnvironment(root),APP_ENV:'arc-mainnet',ARC_CHAIN_ID:'5042'};
 const result=cp.spawnSync(process.execPath,['-e',script,d],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);assert(result.stdout.includes('PASS isolated SQLite'));
});
