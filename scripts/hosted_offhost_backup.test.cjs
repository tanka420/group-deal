'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {publishLatest,organizeExisting,observeOffhost,remoteStatExists}=require('./hosted_offhost_backup.cjs'),{schema}=require('./hosted_backup.cjs');
const {layoutFor}=require('./offhost_backup_layout.cjs');
const base=path.resolve(__dirname,'../.cache/offhost-helper-tests');fs.mkdirSync(base,{recursive:true});const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t){
  const dir=fs.mkdtempSync(path.join(base,'case-')),stateDirectory=path.join(dir,'backups'),offhostDirectory=path.join(dir,'offhost');fs.mkdirSync(stateDirectory);fs.mkdirSync(offhostDirectory);fs.mkdirSync(path.join(stateDirectory,'archives'));const configFile=path.join(offhostDirectory,'rclone.conf');fs.writeFileSync(configFile,'[gd_onedrive]\ntype = onedrive\ndrive_id = fixture-drive\ndrive_type = personal\ntoken = fixture-not-a-provider-token\n',{mode:0o600});
  const now=Date.now(),ownerId=crypto.randomUUID(),archive=`backup_${now}_${crypto.randomUUID()}.enc`,bytes=crypto.randomBytes(256),metadata={schema,ownerId,archive,timestamp:now,sha256:hash(bytes),byteLength:bytes.length,verified:true,sourceReadOnly:true,privateRestoreVerified:true,auditAndSqliteIntegrity:true,sourceRowsPreserved:true,sourceCommit:'a'.repeat(40),heldWork:95,financialAccountingVerified:false};
  fs.writeFileSync(path.join(stateDirectory,'OWNER.json'),JSON.stringify({schema,ownerId}));fs.writeFileSync(path.join(stateDirectory,'archives',archive),bytes);fs.writeFileSync(path.join(stateDirectory,'archives',archive+'.json'),JSON.stringify(metadata));fs.writeFileSync(path.join(stateDirectory,'LATEST.json'),JSON.stringify(metadata));
  const remote=new Map(),copied=[];const transport={exists:async p=>remote.has(p),copy:async(file,p)=>{assert.ok(file.endsWith('.enc')||file.endsWith('.enc.json'));copied.push(p);remote.set(p,fs.readFileSync(file));},digest:async p=>({sha256:hash(remote.get(p)),byteLength:remote.get(p).length}),read:async p=>remote.get(p),list:async base=>Buffer.from(JSON.stringify([...remote].filter(([p])=>p.startsWith(base)&&!p.slice(base.length).includes('/')).map(([p,b])=>({Name:p.slice(base.length),IsDir:false,Size:b.length})))),copyRemote:async(source,p)=>{copied.push(p);remote.set(p,Buffer.from(remote.get(source)));}};
  t.after(()=>{assert.equal(fs.realpathSync(dir),dir);assert.ok(dir.startsWith(base+path.sep));fs.rmSync(dir,{recursive:true});});return{stateDirectory,offhostDirectory,configFile,transport,now,remote,copied,metadata};
}
test('rclone successful null stat means the object is missing and first publication uploads it',async t=>{assert.equal(remoteStatExists(Buffer.from('null\n'),'backup.enc'),false);const f=fixture(t);f.transport.exists=async()=>remoteStatExists(Buffer.from('null\n'),'backup.enc');const r=await publishLatest(f);assert.equal(r.uploadedObjects,2);assert.equal(f.copied.length,2);assert.equal(observeOffhost(path.join(f.offhostDirectory,'LATEST.json')).code,'OFFHOST_BACKUP_CURRENT');});
test('rclone object stat must identify a regular file with the requested name and size',()=>{assert.equal(remoteStatExists(Buffer.from(JSON.stringify({Name:'backup.enc',IsDir:false,Size:18_657_196})),'backup.enc'),true);assert.equal(remoteStatExists(Buffer.from(JSON.stringify({Name:'backup.enc',IsDir:false,Size:0})),'backup.enc'),true);});
test('rclone malformed, directory, mismatched-name and invalid-size stats fail closed',()=>{for(const value of ['', 'not-json','[]','{}',JSON.stringify({Name:'backup.enc',IsDir:true,Size:0}),JSON.stringify({Name:'other.enc',IsDir:false,Size:1}),JSON.stringify({Name:'backup.enc',IsDir:false,Size:-1}),JSON.stringify({Name:'backup.enc',IsDir:false,Size:'1'})])assert.throws(()=>remoteStatExists(Buffer.from(value),'backup.enc'),/OFFHOST_REMOTE_STAT_INVALID/);});
test('publishes only verified ciphertext/manifest and checks downloaded bytes; retry is append-only',async t=>{const f=fixture(t),r=await publishLatest(f);assert.equal(r.uploadedObjects,2);assert.equal(r.rpoMeasured,false);assert.equal(r.rtoMeasured,false);assert.equal(f.copied.length,2);assert.ok(f.copied.every(p=>p.startsWith('gd_onedrive:GroupDeal/ArcTestnet/'+f.metadata.ownerId+'/')));assert.equal(observeOffhost(path.join(f.offhostDirectory,'LATEST.json')).code,'OFFHOST_BACKUP_CURRENT');const second=await publishLatest(f);assert.equal(second.uploadedObjects,0);assert.equal(f.copied.length,2);});
test('unconfigured or wrong backend cannot upload any bytes',async t=>{const f=fixture(t);fs.writeFileSync(f.configFile,'[gd_onedrive]\ntype = s3\n');await assert.rejects(()=>publishLatest(f),/OFFHOST_ONEDRIVE_NOT_CONFIGURED/);assert.equal(f.copied.length,0);});
test('stale or modified local backup stops before contacting remote',async t=>{const f=fixture(t);await assert.rejects(()=>publishLatest({...f,now:f.now+91*60000}),/OFFHOST_SOURCE_BACKUP_UNVERIFIED/);fs.appendFileSync(path.join(f.stateDirectory,'archives',f.metadata.archive),'tampered');await assert.rejects(()=>publishLatest(f),/OFFHOST_SOURCE_BACKUP_UNVERIFIED/);assert.equal(f.copied.length,0);});
test('conflicting existing remote object is not overwritten and no success receipt is written',async t=>{const f=fixture(t),p=layoutFor(f.metadata).directory+layoutFor(f.metadata).archive;f.remote.set(p,Buffer.from('foreign'));await assert.rejects(()=>publishLatest(f),/OFFHOST_ROUNDTRIP_MISMATCH/);assert.equal(f.copied.length,0);assert.equal(f.remote.get(p).toString(),'foreign');assert.equal(fs.existsSync(path.join(f.offhostDirectory,'LATEST.json')),false);});
test('provider failure preserves previous verified receipt and does not delete local/remote data',async t=>{const f=fixture(t);await publishLatest(f);const p=path.join(f.offhostDirectory,'LATEST.json'),old=fs.readFileSync(p);f.transport.digest=async()=>{throw Error('fixture transport outage')};await assert.rejects(()=>publishLatest(f));assert.ok(fs.readFileSync(p).equals(old));assert.equal(f.remote.size,2);assert.equal(fs.existsSync(path.join(f.stateDirectory,'archives',f.metadata.archive)),true);});
test('metadata edit during upload cannot produce a success receipt',async t=>{const f=fixture(t),copy=f.transport.copy;f.transport.copy=async(file,p)=>{await copy(file,p);fs.writeFileSync(path.join(f.stateDirectory,'LATEST.json'),JSON.stringify({...f.metadata,sourceCommit:'b'.repeat(40)}));};await assert.rejects(()=>publishLatest(f),/OFFHOST_SOURCE_CHANGED/);assert.equal(fs.existsSync(path.join(f.offhostDirectory,'LATEST.json')),false);});
test('scope traversal and non-file archives fail closed',async t=>{const f=fixture(t);await assert.rejects(()=>publishLatest({...f,offhostDirectory:base}),/OFFHOST_DIRECTORY_SCOPE/);const file=path.join(f.stateDirectory,'archives',f.metadata.archive);fs.unlinkSync(file);fs.mkdirSync(file);await assert.rejects(()=>publishLatest(f),/OFFHOST_SOURCE_BACKUP_UNVERIFIED/);assert.equal(f.copied.length,0);});
test('changing OneDrive identity during upload cannot produce a success receipt',async t=>{const f=fixture(t),copy=f.transport.copy;f.transport.copy=async(file,p)=>{await copy(file,p);fs.writeFileSync(f.configFile,fs.readFileSync(f.configFile,'utf8').replace('fixture-drive','other-drive'));};await assert.rejects(()=>publishLatest(f),/OFFHOST_DRIVE_CHANGED/);assert.equal(fs.existsSync(path.join(f.offhostDirectory,'LATEST.json')),false);assert.equal(f.copied.length,1);});
test('offhost freshness distinguishes stale, absent and invalid receipts',async t=>{const f=fixture(t),p=path.join(f.offhostDirectory,'LATEST.json');assert.equal(observeOffhost(p).code,'OFFHOST_BACKUP_UNAVAILABLE');await publishLatest(f);assert.equal(observeOffhost(p,f.now+151*60000).code,'OFFHOST_BACKUP_STALE');fs.writeFileSync(p,JSON.stringify({schemaVersion:1,result:'ENCRYPTED_BACKUP_OFFHOST_ROUNDTRIP_VERIFIED',recordedAt:new Date(f.now+60000).toISOString()}));assert.equal(observeOffhost(p,f.now).code,'OFFHOST_RECEIPT_INVALID');});


test('UTC date folders and readable names remain stable across month/year boundaries',()=>{
 const ownerId='5d27a82a-100e-41cb-b6a0-d8326e1538f1',make=iso=>{const timestamp=Date.parse(iso);return{ownerId,timestamp,archive:`backup_${timestamp}_11111111-1111-4111-8111-111111111111.enc`,sha256:'abcdef0123456789'.repeat(4)};};
 const a=layoutFor(make('2026-12-31T23:59:59.999Z')),b=layoutFor(make('2027-01-01T00:00:00.007Z'));
 assert.ok(a.directory.endsWith('/2026/12/31/'));assert.ok(b.directory.endsWith('/2027/01/01/'));
 assert.equal(b.archive,'groupdeal-arc-testnet-backup-20270101T000000007Z-abcdef0123456789.enc');
 assert.equal(b.manifest,b.archive.replace('.enc','.manifest.json'));assert.deepEqual(layoutFor(make('2027-01-01T00:00:00.007Z')),b);
 for(const change of [{ownerId:'../escape'},{archive:'../secret.enc'},{timestamp:NaN},{sha256:'invalid'},{timestamp:Date.parse('2027-01-02T00:00:00.007Z')}])assert.throws(()=>layoutFor({...make('2027-01-01T00:00:00.007Z'),...change}),/OFFHOST_LAYOUT_/);
});

test('new sidecar identifies the actual remote archive and retains original source provenance',async t=>{
 const f=fixture(t),source=fs.readFileSync(path.join(f.stateDirectory,'archives',f.metadata.archive+'.json')),r=await publishLatest(f),m=JSON.parse(f.remote.get(r.remoteDirectory+r.remoteObjects[1].name));
 assert.equal(r.schemaVersion,2);assert.equal(m.schema,'GroupDealOffhostManifestV2');assert.equal(m.archive,r.remoteArchive);assert.equal(m.sourceArchive,f.metadata.archive);assert.equal(m.sourceManifestSha256,hash(source));assert.deepEqual(m.sourceManifest,f.metadata);
 assert.ok(fs.readFileSync(path.join(f.stateDirectory,'archives',f.metadata.archive+'.json')).equals(source));assert.equal(fs.readdirSync(f.offhostDirectory).some(name=>name.startsWith('.layout-')),false);
});

test('observer reads historical receipts but rejects a tampered date path or remote name in new receipts',async t=>{
 const f=fixture(t),r=await publishLatest(f),file=path.join(f.offhostDirectory,'LATEST.json');
 fs.writeFileSync(file,JSON.stringify({...r,schemaVersion:1}));assert.equal(observeOffhost(file).code,'OFFHOST_BACKUP_CURRENT');
 for(const change of [{remoteDirectory:r.remoteDirectory.replace(/\d{4}\/\d{2}\/\d{2}\/$/,'2020/01/01/')},{remoteArchive:'other.enc'},{remoteObjects:[]}]){fs.writeFileSync(file,JSON.stringify({...r,...change}));assert.equal(observeOffhost(file).status,'ATTENTION');}
});

function seedLegacy(f){const base=layoutFor(f.metadata).baseDirectory;f.remote.set(base+f.metadata.archive,fs.readFileSync(path.join(f.stateDirectory,'archives',f.metadata.archive)));f.remote.set(base+f.metadata.archive+'.json',fs.readFileSync(path.join(f.stateDirectory,'archives',f.metadata.archive+'.json')));return base;}

test('historical organization verifies copies, preserves originals and unpaired archives, and resumes without duplicates',async t=>{
 const f=fixture(t),base=seedLegacy(f),original=new Map([...f.remote].map(([k,v])=>[k,Buffer.from(v)])),unpaired=`backup_${f.now-1}_${crypto.randomUUID()}.enc`;f.remote.set(base+unpaired,Buffer.from('unpaired fixture'));
 const r=await organizeExisting(f);assert.equal(r.archivesOrganized,1);assert.equal(r.uploadedObjects,2);assert.equal(r.legacyObjectsDeleted,0);assert.deepEqual(r.unpairedArchivesPreserved,[unpaired]);
 for(const [key,bytes]of original)assert.ok(f.remote.get(key).equals(bytes));assert.equal(f.remote.get(base+unpaired).toString(),'unpaired fixture');
 const second=await organizeExisting(f);assert.equal(second.uploadedObjects,0);assert.equal(f.remote.size,5);assert.equal(fs.existsSync(path.join(f.offhostDirectory,'LATEST.json')),false);
});

test('historical conflicts retain originals and the prior migration receipt',async t=>{
 const f=fixture(t),base=seedLegacy(f);await organizeExisting(f);const receipt=path.join(f.offhostDirectory,'LAYOUT-MIGRATION.json'),before=fs.readFileSync(receipt),layout=layoutFor(f.metadata);f.remote.set(layout.directory+layout.archive,Buffer.from('conflicting remote bytes'));
 await assert.rejects(()=>organizeExisting(f),/OFFHOST_ROUNDTRIP_MISMATCH/);assert.ok(fs.readFileSync(receipt).equals(before));assert.equal(hash(f.remote.get(base+f.metadata.archive)),f.metadata.sha256);assert.equal(fs.readdirSync(f.offhostDirectory).some(name=>name.startsWith('.layout-')),false);
});

test('foreign-owner historical manifests and malformed listings fail before remote writes',async t=>{
 const f=fixture(t),base=seedLegacy(f);f.remote.set(base+f.metadata.archive+'.json',Buffer.from(JSON.stringify({...f.metadata,ownerId:crypto.randomUUID()})));
 await assert.rejects(()=>organizeExisting(f),/OFFHOST_LEGACY_METADATA_INVALID/);assert.equal(f.copied.length,0);
 for(const listing of [[{Name:'../escape',IsDir:false,Size:1}],[{Name:'file',IsDir:true,Size:1}],[{Name:'file',IsDir:false,Size:-1}],{}]){f.transport.list=async()=>Buffer.from(JSON.stringify(listing));await assert.rejects(()=>organizeExisting(f),/OFFHOST_REMOTE_LIST_INVALID/);}
 assert.equal(f.copied.length,0);
});
