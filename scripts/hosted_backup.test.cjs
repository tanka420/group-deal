'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {schema,managedArchives,retentionCandidates,pruneManaged,backupFreshness,observeBackup}=require('./hosted_backup.cjs');
const base=path.resolve(__dirname,'../.cache/backup-helper-tests');fs.mkdirSync(base,{recursive:true});
function fixture(t){const dir=fs.mkdtempSync(path.join(base,'test-'));t.after(()=>{assert.equal(fs.realpathSync(dir),dir);assert.ok(dir.startsWith(base+path.sep));fs.rmSync(dir,{recursive:true});});const archives=path.join(dir,'archives');fs.mkdirSync(archives);const ownerId=crypto.randomUUID(),key=crypto.randomBytes(32);fs.writeFileSync(path.join(dir,'OWNER.json'),JSON.stringify({schema,ownerId}));return{dir,archives,ownerId,key};}
function archive(f,timestamp,ownerId=f.ownerId,manifest=true){
 const name=`backup_${timestamp}_${crypto.randomUUID()}.enc`,file=path.join(f.archives,name),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',f.key,iv);cipher.setAAD(Buffer.from(String(timestamp)));
 const encrypted=Buffer.concat([cipher.update('synthetic-data'),cipher.final()]),bytes=Buffer.from(JSON.stringify({timestamp,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),encrypted:encrypted.toString('hex')}));fs.writeFileSync(file,bytes);
 const value={schema,ownerId,archive:name,timestamp,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,verified:true,sourceReadOnly:true,privateRestoreVerified:true,auditAndSqliteIntegrity:true,sourceRowsPreserved:true};if(manifest)fs.writeFileSync(file+'.json',JSON.stringify(value));return{file,value};
}
function authenticate(f,file){const e=JSON.parse(fs.readFileSync(file)),d=crypto.createDecipheriv('aes-256-gcm',f.key,Buffer.from(e.iv,'hex'));d.setAAD(Buffer.from(String(e.timestamp)));d.setAuthTag(Buffer.from(e.tag,'hex'));assert.equal(Buffer.concat([d.update(Buffer.from(e.encrypted,'hex')),d.final()]).toString(),'synthetic-data');return{timestamp:e.timestamp,envelopeVersion:3,metadataAuthenticated:true};}
function candidates(f,now){for(let i=0;i<24;i++)archive(f,now-86400000-i);return[archive(f,now-8*86400000),archive(f,now-9*86400000)];}
test('freshness accepts exactly 90 minutes and rejects future, stale or unverified restore metadata',()=>{
 const now=1792000000000,value={schema,timestamp:now,verified:true,sourceReadOnly:true,privateRestoreVerified:true,auditAndSqliteIntegrity:true,sourceRowsPreserved:true};
 assert.equal(backupFreshness({...value,timestamp:now-90*60000},now).status,'UP');assert.equal(backupFreshness({...value,timestamp:now-90*60000-1},now).code,'BACKUP_STALE');
 for(const invalid of [null,{...value,timestamp:now+30001},{...value,verified:false},{...value,sourceReadOnly:false},{...value,privateRestoreVerified:false},{...value,auditAndSqliteIntegrity:false},{...value,sourceRowsPreserved:false},{...value,timestamp:NaN}])assert.equal(backupFreshness(invalid,now).code,'BACKUP_METADATA_INVALID');assert.equal(backupFreshness(value,NaN).code,'BACKUP_METADATA_INVALID');
});
test('retention keeps at least 24 archives and excludes the exact seven-day boundary',()=>{
 const now=1792000000000,records=Array.from({length:24},()=>({timestamp:now-9*86400000}));assert.equal(retentionCandidates(records,now).length,0);assert.equal(retentionCandidates([...records,{timestamp:now-7*86400000},{timestamp:now-7*86400000-1}],now).length,1);assert.throws(()=>retentionCandidates(records,now,1,0),/RETENTION_POLICY_INVALID/);
});
test('pruning authenticates old owned archives and preserves unmarked and foreign-owner files',t=>{
 const f=fixture(t),now=1792000000000,old=candidates(f,now),unmarked=archive(f,now-20*86400000,f.ownerId,false),foreign=archive(f,now-30*86400000,crypto.randomUUID());fs.writeFileSync(path.join(f.archives,'proof-t279.enc'),'historical-proof');
 assert.equal(pruneManaged(f.archives,f.ownerId,file=>authenticate(f,file),now),2);for(const r of old)assert.equal(fs.existsSync(r.file),false);for(const file of [unmarked.file,foreign.file,path.join(f.archives,'proof-t279.enc')])assert.equal(fs.existsSync(file),true);assert.equal(managedArchives(f.archives,f.ownerId).length,24);
});
test('changed bytes fail before any retention candidate is removed',t=>{
 const f=fixture(t),now=1792000000000,old=candidates(f,now);fs.appendFileSync(old[1].file,'tampered');assert.throws(()=>pruneManaged(f.archives,f.ownerId,file=>authenticate(f,file),now));for(const r of old)assert.ok(fs.existsSync(r.file)&&fs.existsSync(r.file+'.json'));
});
test('authentication failure leaves every deletion candidate intact',t=>{
 const f=fixture(t),now=1792000000000,old=candidates(f,now);let count=0;assert.throws(()=>pruneManaged(f.archives,f.ownerId,file=>{authenticate(f,file);if(++count===2)throw Error('authentication-failed');return{timestamp:JSON.parse(fs.readFileSync(file)).timestamp,envelopeVersion:3,metadataAuthenticated:true};},now));assert.equal(count,2);for(const r of old)assert.ok(fs.existsSync(r.file)&&fs.existsSync(r.file+'.json'));
});
test('symlinks and invalid owned manifests halt pruning; unknown manifests and external targets are preserved',t=>{
 const f=fixture(t),now=1792000000000,old=candidates(f,now),external=path.join(f.dir,'outside');fs.mkdirSync(external);const marker=path.join(external,'keep');fs.writeFileSync(marker,'keep');const link=path.join(f.archives,`backup_${now-20*86400000}_${crypto.randomUUID()}.enc`);fs.symlinkSync(external,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>pruneManaged(f.archives,f.ownerId,file=>authenticate(f,file),now),/FILE_SCOPE/);assert.equal(fs.readFileSync(marker,'utf8'),'keep');for(const r of old)assert.ok(fs.existsSync(r.file));fs.unlinkSync(link);
 const m=JSON.parse(fs.readFileSync(old[0].file+'.json'));fs.writeFileSync(old[0].file+'.json',JSON.stringify({...m,sha256:'invalid'}));assert.throws(()=>pruneManaged(f.archives,f.ownerId,file=>authenticate(f,file),now),/MANAGED_MANIFEST_INVALID/);for(const r of old)assert.ok(fs.existsSync(r.file));m.archive='../historical.enc';fs.writeFileSync(old[0].file+'.json',JSON.stringify(m));assert.equal(pruneManaged(f.archives,f.ownerId,file=>authenticate(f,file),now),1);assert.ok(fs.existsSync(old[0].file));
});
test('freshness requires a matching owned manifest and existing unchanged ciphertext',t=>{
 const f=fixture(t),now=1792000000000,r=archive(f,now),latest=path.join(f.dir,'LATEST.json');fs.writeFileSync(latest,JSON.stringify(r.value));assert.equal(observeBackup(latest,now).code,'BACKUP_CURRENT');assert.equal(observeBackup(latest,now+90*60000+1).code,'BACKUP_STALE');
 fs.writeFileSync(r.file+'.json',JSON.stringify({...r.value,privateRestoreVerified:false}));assert.equal(observeBackup(latest,now).status,'ATTENTION');fs.writeFileSync(r.file+'.json',JSON.stringify(r.value));fs.appendFileSync(r.file,'changed');assert.equal(observeBackup(latest,now).code,'BACKUP_METADATA_UNAVAILABLE');assert.equal(observeBackup(path.join(f.dir,'other.json'),now).status,'ATTENTION');
});
test('missing metadata and rejected CLI arguments expose only bounded public codes',t=>{
 const f=fixture(t);assert.equal(observeBackup(path.join(f.dir,'LATEST.json')).code,'BACKUP_METADATA_UNAVAILABLE');for(const script of ['hosted_backup.cjs','observe_hosted_health.cjs']){const r=cp.spawnSync(process.execPath,[path.join(__dirname,script),'--unknown','private-provider-diagnostic'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,2);assert.ok(!(r.stdout+r.stderr).includes('private-provider-diagnostic'));}
});
