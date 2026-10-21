'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const schema='GroupDealManagedBackupV1',expectedSource='4b5af7604df53be680e7af9986d45810ac4d26e2',namePattern=/^backup_(\d{13})_[a-f0-9-]{36}\.enc$/;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(code){throw new Error(code);}
function exactDirectory(dir){const absolute=path.resolve(dir);if(fs.realpathSync(absolute)!==absolute||!fs.lstatSync(absolute).isDirectory()||fs.lstatSync(absolute).isSymbolicLink())fail('DIRECTORY_SCOPE');return absolute;}
function child(root,name){if(typeof name!=='string'||!name||name.includes('..')||name.includes('\\')||path.isAbsolute(name))fail('PATH_SCOPE');const value=path.resolve(root,name);if(!value.startsWith(root+path.sep))fail('PATH_SCOPE');return value;}
function regular(file){if(fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())fail('FILE_SCOPE');return fs.statSync(file);}
function json(file){if(regular(file).size>65536)fail('METADATA_SIZE');return JSON.parse(fs.readFileSync(file,'utf8'));}
function atomicJson(dir,name,value){const target=child(dir,name),temp=child(dir,'.'+name+'-'+crypto.randomUUID());if(fs.existsSync(target))regular(target);const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,target);}
function readOwner(state){const file=child(state,'OWNER.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({schema,ownerId:crypto.randomUUID()})+'\n',{flag:'wx',mode:0o600});const value=json(file);if(value.schema!==schema||typeof value.ownerId!=='string'||!/^[a-f0-9-]{36}$/.test(value.ownerId))fail('OWNER_INVALID');return value.ownerId;}
function managedArchives(dir,ownerId){exactDirectory(dir);const records=[];for(const name of fs.readdirSync(dir)){if(!namePattern.test(name))continue;const file=child(dir,name),stat=regular(file),manifest=file+'.json';if(!fs.existsSync(manifest))continue;const m=json(manifest),timestamp=Number(namePattern.exec(name)[1]);if(m.schema!==schema||m.ownerId!==ownerId||m.archive!==name)continue;if(m.timestamp!==timestamp||!Number.isSafeInteger(timestamp)||timestamp<0||m.verified!==true||m.byteLength!==stat.size||!Number.isSafeInteger(m.byteLength)||m.byteLength<=0||!/^[a-f0-9]{64}$/.test(m.sha256))fail('MANAGED_MANIFEST_INVALID');records.push({file,manifest,timestamp,sha256:m.sha256,byteLength:m.byteLength});}return records.sort((a,b)=>b.timestamp-a.timestamp||b.file.localeCompare(a.file));}
// User policy: keep3 verified local archives. OneDrive is configured separately.
function retentionCandidates(records,now,days=0,minimum=3){if(!Number.isSafeInteger(now)||now<0||days!==0||minimum!==3)fail('RETENTION_POLICY_INVALID');return records.slice(minimum);}
function pruneManaged(dir,ownerId,authenticate,now=Date.now()){
 const records=managedArchives(dir,ownerId),candidates=retentionCandidates(records,now);
 // Verify every deletion candidate before deleting any. Unknown archives are preserved.
 for(const r of candidates){if(sha(fs.readFileSync(r.file))!==r.sha256)fail('RETENTION_BYTES_CHANGED');const decoded=authenticate(r.file);if(decoded.envelopeVersion!==3||decoded.metadataAuthenticated!==true||decoded.timestamp!==r.timestamp)fail('RETENTION_AUTHENTICATION');}
 for(const r of candidates){regular(r.file);regular(r.manifest);if(sha(fs.readFileSync(r.file))!==r.sha256)fail('RETENTION_BYTES_CHANGED');fs.unlinkSync(r.file);fs.unlinkSync(r.manifest);}
 return candidates.length;
}
function backupFreshness(value,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0||!value||value.schema!==schema||value.verified!==true||value.sourceReadOnly!==true||value.privateRestoreVerified!==true||value.auditAndSqliteIntegrity!==true||value.sourceRowsPreserved!==true||!Number.isSafeInteger(value.timestamp)||value.timestamp<0||value.timestamp>now+30000)return{status:'ATTENTION',code:'BACKUP_METADATA_INVALID'};
 return now-value.timestamp<=90*60000?{status:'UP',code:'BACKUP_CURRENT'}:{status:'ATTENTION',code:'BACKUP_STALE'};
}
/** Read only the private backup metadata and ciphertext. Never load application credentials or a DB. */
function observeBackup(stateFile,now=Date.now()){
 try{
  if(!path.isAbsolute(stateFile)||path.basename(stateFile)!=='LATEST.json')fail('BACKUP_STATE_PATH');
  const state=exactDirectory(path.dirname(stateFile)),value=json(stateFile),owner=json(child(state,'OWNER.json'));
  const freshness=backupFreshness(value,now);if(freshness.code==='BACKUP_METADATA_INVALID')return freshness;
  if(owner.schema!==schema||typeof owner.ownerId!=='string'||value.ownerId!==owner.ownerId||!namePattern.test(value.archive)||Number(namePattern.exec(value.archive)[1])!==value.timestamp)fail('BACKUP_STATE_OWNER');
  const archives=exactDirectory(child(state,'archives')),file=child(archives,value.archive),stat=regular(file),manifest=json(file+'.json');
  assert.deepStrictEqual(manifest,value);
  if(stat.size!==value.byteLength||stat.size>256*1024*1024||!/^[a-f0-9]{64}$/.test(value.sha256)||sha(fs.readFileSync(file))!==value.sha256)fail('BACKUP_STATE_BYTES');
  return freshness;
 }catch{return{status:'ATTENTION',code:'BACKUP_METADATA_UNAVAILABLE'};}
}
function service(){return Object.fromEntries(cp.execFileSync('systemctl',['show','groupdeal-testnet','--property=MainPID,NRestarts,ActiveState'],{encoding:'utf8',timeout:5000}).trim().split('\n').map(s=>s.split('=')));}
async function run(app,state){
 if(process.platform!=='linux')fail('HOSTED_LINUX_REQUIRED');process.umask(0o077);app=exactDirectory(app);state=exactDirectory(state);
 if(state===app||state.startsWith(app+path.sep)||app.startsWith(state+path.sep))fail('STATE_SOURCE_OVERLAP');
 const runtime=json(child(app,'.cache/hosted/RUN.json')),before=service();if(runtime.sourceCommit!==expectedSource||before.ActiveState!=='active'||Number(before.MainPID)!==runtime.pid||!/^\.cache\/application-recovery\/drill-[A-Za-z0-9]+\/candidate$/.test(runtime.nativeDirectory))fail('ACTIVE_WRITER_SCOPE');
 const sourceFile=child(app,runtime.nativeDirectory+'/groupdeal.sqlite');regular(sourceFile);const ownerId=readOwner(state),archives=child(state,'archives');fs.mkdirSync(archives,{recursive:true,mode:0o700});exactDirectory(archives);
 let archiveBytes=0;
 const work=fs.mkdtempSync(child(state,'work-'));exactDirectory(work);let source,copy,target;const sqlite=require('node:sqlite'),Native=sqlite.DatabaseSync,listen=require('node:net').Server.prototype.listen,start=Date.now();
 const oldCwd=process.cwd(),oldLog={log:console.log,warn:console.warn,error:console.error};
 try{
  sqlite.DatabaseSync=class extends Native{constructor(file,options){const absolute=path.resolve(file);if(absolute===sourceFile){if(options?.readOnly!==true)fail('SOURCE_READ_ONLY_REQUIRED');}else if(!absolute.startsWith(work+path.sep))fail('SHADOW_WRITES_ONLY');super(file,...(options===undefined?[]:[options]));}};
  require('node:net').Server.prototype.listen=()=>fail('APPLICATION_LISTEN_FORBIDDEN');console.log=console.warn=console.error=()=>{};process.env.NODE_ENV='production';process.env.GROUPDEAL_RECOVERY_MODE='1';process.chdir(child(app,'backend'));
  const {TransactionalStore}=require(child(app,'backend/dist/db/store')), {BackupService}=require(child(app,'backend/dist/services/backupService')), {verifyPrivateRecovery}=require(child(app,'backend/dist/services/recoveryDrillService'));require(child(app,'backend/dist/services/runtimeSecurity')).validateRuntimeSecurity();
  const prunedBefore=pruneManaged(archives,ownerId,file=>BackupService.readEncryptedBackup(file));
  archiveBytes=fs.readdirSync(archives).filter(n=>namePattern.test(n)).reduce((total,n)=>total+regular(child(archives,n)).size,0);if(archiveBytes>=512*1024*1024)fail('MANAGED_STORAGE_LIMIT');
  source=new sqlite.DatabaseSync(sourceFile,{readOnly:true});const copyDir=child(work,'copy');fs.mkdirSync(copyDir,{mode:0o700});await sqlite.backup(source,child(copyDir,'groupdeal.sqlite'));source.close();source=null;
  const probe=new sqlite.DatabaseSync(child(copyDir,'groupdeal.sqlite'),{readOnly:true});let originalRows;try{originalRows=probe.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all();if(probe.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')fail('COPY_INTEGRITY');}finally{probe.close();}
  copy=new TransactionalStore(copyDir);const committed=new sqlite.DatabaseSync(child(copyDir,'groupdeal.sqlite'),{readOnly:true});try{assert.deepStrictEqual(committed.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all(),originalRows);}finally{committed.close();}
  const baseline=copy.snapshot();if(baseline.restoredWork?.current?.heldCount!==95)fail('HELD_WORK_SCOPE');
  const backup=BackupService.createEncryptedBackup(archives,copy);regular(backup.backupPath);const decoded=BackupService.readEncryptedBackup(backup.backupPath);assert.deepStrictEqual(decoded.data,baseline);if(decoded.envelopeVersion!==3||!decoded.metadataAuthenticated)fail('BACKUP_AUTHENTICATION');
  target=new TransactionalStore(child(work,'restore'));BackupService.restoreEncryptedBackup(backup.backupPath,target);const restored=target.snapshot();for(const[k,v]of Object.entries(baseline)){if(k==='auditLogs'){assert.deepStrictEqual(restored.auditLogs.slice(1),v);assert.equal(restored.auditLogs.length,v.length+1);}else assert.deepStrictEqual(restored[k],v);}
  if(!target.verifyAuditLogIntegrity().valid||!verifyPrivateRecovery(restored).verified)fail('PRIVATE_RESTORE_INTEGRITY');target.close();target=null;copy.close();copy=null;
  const integrity=new sqlite.DatabaseSync(child(work,'restore/groupdeal.sqlite'),{readOnly:true});try{if(integrity.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')fail('RESTORE_INTEGRITY');}finally{integrity.close();}
  const after=service();if(JSON.stringify(after)!==JSON.stringify(before))fail('WRITER_CHANGED');const archive=path.basename(backup.backupPath),bytes=fs.readFileSync(backup.backupPath);if(archiveBytes+bytes.length>512*1024*1024)fail('MANAGED_STORAGE_LIMIT');
  const result={schema,ownerId,archive,timestamp:decoded.timestamp,sha256:sha(bytes),byteLength:bytes.length,verified:true,sourceReadOnly:true,sourceCommit:runtime.sourceCommit,syncBlock:restored.syncState.lastIndexedBlock,heldWork:95,counts:Object.fromEntries(['users','campaigns','orders','operations','resourceGrants','licenseInventory'].map(k=>[k,Object.keys(restored[k]).length])),privateRestoreVerified:true,auditAndSqliteIntegrity:true,sourceRowsPreserved:true,durationMs:Date.now()-start,applicationRestarted:false,financialAccountingVerified:false,canonicalReconciliationRequiredBeforePromotion:true};
  atomicJson(archives,archive+'.json',result);atomicJson(state,'LATEST.json',result);
  let retention='APPLIED',pruned=prunedBefore;try{pruned+=pruneManaged(archives,ownerId,file=>BackupService.readEncryptedBackup(file));}catch{retention='REVIEW_REQUIRED';}
  return{schemaVersion:1,status:retention==='APPLIED'?'VERIFIED':'ATTENTION',code:retention==='APPLIED'?'BACKUP_RESTORE_VERIFIED':'BACKUP_RETENTION_REVIEW_REQUIRED',timestamp:result.timestamp,sha256:result.sha256,byteLength:result.byteLength,counts:result.counts,heldWork:95,retentionDays:0,minimumRetained:3,retentionPolicy:'LOCAL_LATEST_THREE_OFFHOST_CONFIGURED_SEPARATELY',pruned,retention,sourceReadOnly:true,applicationRestarted:false,financialAccountingVerified:false,privateValuesLogged:false};
 }finally{source?.close();copy?.close();target?.close();sqlite.DatabaseSync=Native;require('node:net').Server.prototype.listen=listen;process.chdir(oldCwd);Object.assign(console,oldLog);if(fs.realpathSync(work)!==work||!work.startsWith(state+path.sep))fail('WORK_CLEANUP_SCOPE');fs.rmSync(work,{recursive:true,force:false});}
}
async function main(){const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--app-root'||args[2]!=='--state-directory'){console.log(JSON.stringify({status:'ATTENTION',code:'BACKUP_ARGUMENTS_INVALID'}));process.exitCode=2;return;}try{const result=await run(args[1],args[3]);console.log(JSON.stringify(result));if(result.status!=='VERIFIED')process.exitCode=1;}catch(e){console.log(JSON.stringify({status:'ATTENTION',code:/^[A-Z_]+$/.test(e.message||'')?e.message:'BACKUP_STAGE_UNAVAILABLE',privateValuesLogged:false}));process.exitCode=1;}}
if(require.main===module)void main();module.exports={schema,managedArchives,retentionCandidates,pruneManaged,backupFreshness,observeBackup};
