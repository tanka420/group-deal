'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const archiveName=/^backup_\d{13}_[a-f0-9-]{36}\.enc$/;
function regular(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())throw Error('MAINNET_BACKUP_FILE_INVALID');return s;}
function atomic(file,value){const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}
/** Only authenticated, explicitly managed archives are eligible for retention. Unknown files stay intact. */
function retainThree(directory,records,authenticate){
 const sorted=[...records].sort((a,b)=>b.timestamp-a.timestamp);
 for(const r of sorted){if(!archiveName.test(r.archive)||!Number.isSafeInteger(r.timestamp)||r.verified!==true||r.chainId!==5042)throw Error('MAINNET_BACKUP_MANIFEST_INVALID');const file=path.join(directory,r.archive);if(regular(file).size!==r.byteLength||sha(fs.readFileSync(file))!==r.sha256)throw Error('MAINNET_BACKUP_BYTES_CHANGED');}
 const remove=sorted.slice(3);for(const r of remove){const d=authenticate(path.join(directory,r.archive));if(d.envelopeVersion!==3||d.metadataAuthenticated!==true||d.timestamp!==r.timestamp)throw Error('MAINNET_BACKUP_AUTHENTICATION_FAILED');}
 for(const r of remove){fs.unlinkSync(path.join(directory,r.archive));fs.unlinkSync(path.join(directory,r.archive+'.json'));}
 return sorted.slice(0,3);
}
async function backup(root,state,sourceFile){
 process.umask(0o077);
 if(process.platform!=='linux'||state!=='/var/lib/groupdeal-mainnet/backups'||sourceFile!=='/var/lib/groupdeal-mainnet/data/groupdeal.sqlite'||fs.realpathSync(state)!==state||fs.realpathSync(sourceFile)!==sourceFile)throw Error('MAINNET_BACKUP_PATH_INVALID');
 return snapshotBackup(root,state,sourceFile);
}
/** Online source connection is read-only; all restore checks write only the private work directory. */
async function snapshotBackup(root,state,sourceFile){
 regular(sourceFile);
 const {DatabaseSync,backup:copy}=require('node:sqlite');
 const {TransactionalStore}=require(path.join(root,'backend/dist/db/store.js')),{BackupService}=require(path.join(root,'backend/dist/services/backupService.js'));
 const {verifyPrivateRecovery}=require(path.join(root,'backend/dist/services/recoveryDrillService.js'));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'shared/manifests/arc-mainnet.json')));
 const archives=path.join(state,'archives');fs.mkdirSync(archives,{recursive:true,mode:0o700});if(fs.realpathSync(archives)!==archives)throw Error('MAINNET_BACKUP_PATH_INVALID');
 const work=fs.mkdtempSync(path.join(state,'work-'));let source,copyStore,restoreStore;
 try{
  source=new DatabaseSync(sourceFile,{readOnly:true});await copy(source,path.join(work,'groupdeal.sqlite'));source.close();source=null;
  copyStore=new TransactionalStore(work);const before=copyStore.snapshot();if(!copyStore.verifyAuditLogIntegrity().valid)throw Error('MAINNET_BACKUP_AUDIT_INVALID');
  const archive=BackupService.createEncryptedBackup(archives,copyStore),decoded=BackupService.readEncryptedBackup(archive.backupPath);
  assert.deepStrictEqual(decoded.data,before);if(decoded.envelopeVersion!==3||!decoded.metadataAuthenticated)throw Error('MAINNET_BACKUP_ENVELOPE_INVALID');
  restoreStore=new TransactionalStore(path.join(work,'restore'));BackupService.restoreEncryptedBackup(archive.backupPath,restoreStore);const restored=restoreStore.snapshot();
  for(const [key,value]of Object.entries(before))assert.deepStrictEqual(key==='auditLogs'?restored.auditLogs.slice(1):restored[key],value);
  if(!restoreStore.verifyAuditLogIntegrity().valid||!verifyPrivateRecovery(restored).verified)throw Error('MAINNET_BACKUP_RESTORE_INVALID');
  const bytes=fs.readFileSync(archive.backupPath),record={schemaVersion:1,chainId:5042,hubAddress:manifest.contracts.GroupDealHub.address,archive:path.basename(archive.backupPath),timestamp:decoded.timestamp,sha256:sha(bytes),byteLength:bytes.length,verified:true,sourceReadOnly:true,privateRestoreVerified:true,offhostVerified:false,financialAccountingVerified:false};
  atomic(archive.backupPath+'.json',record);
  const managed=fs.readdirSync(archives).filter(n=>archiveName.test(n.slice(0,-5))&&n.endsWith('.json')).map(n=>{regular(path.join(archives,n));return JSON.parse(fs.readFileSync(path.join(archives,n)));});
  retainThree(archives,managed,BackupService.readEncryptedBackup.bind(BackupService));atomic(path.join(state,'LATEST.json'),record);
  return {result:'PASS_ENCRYPTED_BACKUP_RESTORE',chainId:5042,sha256:record.sha256,privateValuesLogged:false,sourceReadOnly:true,offhostVerified:false,financialAccountingVerified:false};
 }finally{source?.close();copyStore?.close();restoreStore?.close();if(fs.realpathSync(work)!==work||path.dirname(work)!==state)throw Error('MAINNET_BACKUP_CLEANUP_INVALID');fs.rmSync(work,{recursive:true});}
}
if(require.main===module)backup(path.resolve(__dirname,'..'),'/var/lib/groupdeal-mainnet/backups','/var/lib/groupdeal-mainnet/data/groupdeal.sqlite').then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('MAINNET_BACKUP_FAILED');process.exitCode=1;});
module.exports={retainThree,snapshotBackup};
