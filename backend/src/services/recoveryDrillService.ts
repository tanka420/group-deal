import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {TransactionalStore,DatabaseSchema} from '../db/store';
import {BackupService} from './backupService';
import {decryptEntitlement} from '../utils/crypto';
import {decryptWebhookSecret} from './webhookSecret';

const sourceNames=['groupdeal.sqlite','groupdeal.sqlite-wal','groupdeal.sqlite-shm','groupdeal_db.json','groupdeal_db.json.tmp'];
const hash=(value:Buffer)=>crypto.createHash('sha256').update(value).digest('hex');
const root=path.resolve(__dirname,'../../..');
const toolPaths=[
 "backend/scripts/recoveryDrill.ts",
 "backend/src/services/recoveryDrillService.ts",
 "backend/src/services/webhookSecret.ts",
 "backend/src/services/backupService.ts",
 "backend/src/services/runtimeSecurity.ts",
 "backend/src/utils/crypto.ts",
 "backend/src/config.ts",
 "backend/src/db/store.ts",
 "backend/src/domain/operatorCapability.ts",
 "backend/src/domain/operatorEnrollment.ts",
 "backend/src/domain/walletAuthentication.ts",
 "backend/src/db/rowPersistence.ts",
 "backend/src/db/operatorDealRead.ts",
 "backend/src/db/operatorAccountAccessRead.ts",
 "backend/src/domain/accountAccess.ts",
 "backend/src/domain/walletCircleRejection.ts",
 "backend/src/db/legacyReviewMetadata.ts",
 "backend/package-lock.json",
 "shared/contracts.json",
 "shared/manifests/arc-testnet.json",
 "backend/src/domain/operations.ts",
 "backend/src/domain/sellerInventory.ts",
 "backend/src/domain/product.ts",
 "backend/src/domain/support.ts",
 "backend/src/domain/sellerFollow.ts",
 "backend/src/domain/authRecovery.ts",
 "backend/src/domain/sellerBadge.ts",
 "shared/operatorBadge.mjs",
 "backend/src/contracts/hubAbi.ts",
 "backend/src/domain/operationPreparation.ts",
 "backend/src/domain/operationReadiness.ts",
 "backend/src/domain/operationReplacement.ts",
 "backend/src/domain/operationTracking.ts",
 "backend/src/domain/operationVerification.ts",
 "backend/src/domain/orderReview.ts",
 "backend/src/domain/receiptConsumption.ts",
 "backend/src/services/eventEvidence.ts",
 "backend/src/domain/operationCompletion.ts",
 "backend/src/domain/financialProjection.ts",
 "backend/src/domain/signerReservation.ts",
 "backend/src/domain/walletFlow.ts",
 "backend/src/domain/walletQuote.ts",
 "shared/arcWallet.mjs",
 "backend/src/db/operatorAccountRead.ts",
 "backend/src/domain/bridgeTransfer.ts",
 "backend/src/domain/bridgeReceipt.ts",
 "backend/src/domain/bridgeRequest.ts",
 "backend/src/domain/bridgeClosure.ts"
];
const toolInputs=()=>toolPaths.map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
export const recoveryDrillInputs=toolInputs;
export class RecoveryDrillError extends Error {constructor(public readonly code:string){super(code);}}

/** New directories only; inherited Windows ACLs must not expose raw restored records. */
export function privateRecoveryDirectory(parent:string):string {
 fs.mkdirSync(parent,{recursive:true,mode:0o700});const directory=fs.mkdtempSync(path.join(parent,'drill-'));
 if(process.platform==='win32'){
  const system=path.join(process.env.SystemRoot||'C:\\Windows','System32');
  const environment={SystemRoot:path.dirname(system),PATH:system};
  const identity=execFileSync(path.join(system,'whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true,env:environment});
  const sid=identity.match(/S-1-\d+(?:-\d+)+/)?.[0];if(!sid)throw new RecoveryDrillError('PRIVATE_DIRECTORY_POLICY_FAILED');
  execFileSync(path.join(system,'icacls.exe'),[directory,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'pipe',env:environment});
 }else fs.chmodSync(directory,0o700);
 return directory;
}
export function sourceFootprint(directory:string){
 if(!fs.existsSync(path.join(directory,'groupdeal.sqlite')))throw new RecoveryDrillError('SOURCE_DATABASE_MISSING');
 return sourceNames.filter(name=>fs.existsSync(path.join(directory,name))).map(name=>{const file=path.join(directory,name);if(!fs.lstatSync(file).isFile()||fs.realpathSync(path.dirname(fs.realpathSync(file)))!==fs.realpathSync(directory))throw new RecoveryDrillError('SOURCE_FILE_POLICY_INVALID');const value=fs.readFileSync(file);return{file:name,byteLength:value.length,sha256:hash(value)};});
}
/** No SQLite connection to the original WAL/SHM: validate the physical copy before opening it. */
export function copyStableDatabase(sourceDirectory:string,targetDirectory:string){
 const before=sourceFootprint(sourceDirectory);fs.mkdirSync(targetDirectory,{mode:0o700});
 for(const f of before)fs.copyFileSync(path.join(sourceDirectory,f.file),path.join(targetDirectory,f.file),fs.constants.COPYFILE_EXCL);
 const after=sourceFootprint(sourceDirectory);if(!isDeepStrictEqual(before,after)||!isDeepStrictEqual(before,sourceFootprint(targetDirectory)))throw new RecoveryDrillError('SOURCE_CHANGED_DURING_COPY');
 return before;
}
export function verifyPrivateRecovery(state:DatabaseSchema){
 let encryptedFieldsVerified=0,encryptedFieldsFailed=0,resourceFilesVerified=0,resourceFilesFailed=0,supportFilesVerified=0,supportFilesFailed=0,licenseKeysVerified=0,licenseKeysFailed=0;const requiredKeys=new Set<string>();
 const walk=(value:unknown,location:string[]=[]):void=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(/(?:Encrypted|encryptedPayload)$/i.test(key)&&typeof item==='string'&&item){const keyId=/^(?:v2|wh2):/.test(item)?item.split(':')[1]:'legacy';if(/^[-a-zA-Z0-9_]{1,64}$/.test(keyId))requiredKeys.add(keyId);try{if(key==='secretEncrypted'&&location.length===2&&['webhooks','webhookQueue'].includes(location[0])){const id=(value as {id?:unknown}).id;if(typeof id!=='string'||!id)throw Error('WEBHOOK_RECORD_ID_UNVERIFIED');decryptWebhookSecret(item,id);}else decryptEntitlement(item);encryptedFieldsVerified++;}catch{encryptedFieldsFailed++;}}else if(item&&typeof item==='object')walk(item,[...location,key]);}};
 walk(state);
 const bytesValid=(cipher:string,size:number,digest:string)=>{const encoded=decryptEntitlement(cipher),bytes=Buffer.from(encoded,'base64');return bytes.toString('base64')===encoded&&bytes.length===size&&hash(bytes)===digest;};
 for(const resource of Object.values(state.resources)){try{if(!bytesValid(resource.encryptedPayload,resource.byteLength,resource.sha256))throw Error();resourceFilesVerified++;}catch{resourceFilesFailed++;}}
 for(const key of Object.values(state.licenseInventory)){try{const plain=decryptEntitlement(key.keyEncrypted);if(!/^[-A-Za-z0-9_]{12,128}$/.test(plain)||hash(Buffer.from(plain))!==key.keyFingerprint)throw Error();licenseKeysVerified++;}catch{licenseKeysFailed++;}}
 for(const file of Object.values(state.supportAttachments)){if(file.state==='PURGED')continue;try{if(!bytesValid(file.bytesEncrypted,file.byteLength,file.sha256))throw Error();supportFilesVerified++;}catch{supportFilesFailed++;}}
 const productResourcePresent=Object.values(state.orders).some(o=>!!o.deliveredEntitlementEncrypted)||Object.keys(state.resources).length>0||Object.keys(state.licenseInventory).length>0;
 return{verified:encryptedFieldsFailed===0&&resourceFilesFailed===0&&supportFilesFailed===0&&licenseKeysFailed===0,encryptedDataPresent:encryptedFieldsVerified+encryptedFieldsFailed>0,productResourcePresent,encryptedFieldsVerified,encryptedFieldsFailed,resourceFilesVerified,resourceFilesFailed,supportFilesVerified,supportFilesFailed,licenseKeysVerified,licenseKeysFailed,requiredKeyIds:[...requiredKeys].sort(),secretValuesLogged:false};
}

type DrillOptions={sourceDirectory:string;inputScope:'EXISTING_DATA'|'LOCAL_FIXTURE';privateParent?:string;reportDirectory?:string};
export async function runRecoveryDrill(options:DrillOptions){
 const sourceDirectory=fs.realpathSync(options.sourceDirectory),active=path.resolve(root,'backend/data');
 if(options.inputScope==='LOCAL_FIXTURE'&&(process.env.NODE_ENV!=='test'||sourceDirectory.toLowerCase()===active.toLowerCase()))throw new RecoveryDrillError('FIXTURE_SCOPE_INVALID');
 if(options.inputScope==='EXISTING_DATA'&&(sourceDirectory.toLowerCase()!==active.toLowerCase()||options.privateParent||options.reportDirectory))throw new RecoveryDrillError('EXISTING_DATA_SCOPE_INVALID');
 if(!['EXISTING_DATA','LOCAL_FIXTURE'].includes(options.inputScope))throw new RecoveryDrillError('INPUT_SCOPE_INVALID');
 const parent=options.privateParent??path.join(root,'.cache/recovery-drills'),reports=options.reportDirectory??path.join(root,'reports/evidence/recovery-drills');
 const started=performance.now(),startedAt=Date.now(),directory=privateRecoveryDirectory(parent);let source:TransactionalStore|undefined,target:TransactionalStore|undefined,baseline:DatabaseSchema|undefined,restored:DatabaseSchema|undefined;
 const durations:Record<string,number>={privateDirectoryPolicy:Math.round((performance.now()-started)*1000)/1000},report:Record<string,any>={schemaVersion:1,startedAt:new Date(startedAt).toISOString(),toolInputs:toolInputs(),inputScope:options.inputScope,layer:options.inputScope==='EXISTING_DATA'?'EXISTING_DATA_ISOLATED_RECOVERY':'LOCAL_FIXTURE_RECOVERY',status:'UNVERIFIED',acceptanceEligible:false,promoted:false,financialAccountingVerified:false,privateDirectory:path.relative(root,directory).replaceAll('\\','/'),originalAccess:'FILES_READ_ONLY_NO_SQLITE_CONNECTION',authCutover:{allowed:false,restoredSessionsMayPrecedeRevocation:true,requiresReviewedRevocationBarrierOrPrivateJwtRotation:true},durationsMs:durations};
 const phase=<T>(name:string,fn:()=>T):T=>{const begin=performance.now();try{return fn();}finally{durations[name]=Math.round((performance.now()-begin)*1000)/1000;}};
 try{
  const copyDir=path.join(directory,'source-copy');report.sourceCopyObservedAt=Date.now();report.sourceFootprint=sourceFootprint(sourceDirectory);phase('consistentCopy',()=>{const copied=copyStableDatabase(sourceDirectory,copyDir);if(!isDeepStrictEqual(report.sourceFootprint,copied))throw new RecoveryDrillError('SOURCE_CHANGED_DURING_COPY');});
  source=phase('sourceCopyLoad',()=>new TransactionalStore(copyDir));baseline=source.snapshot();
  const backup=phase('encryptedBackup',()=>BackupService.createEncryptedBackup(path.join(directory,'backups'),source!)),ciphertext=fs.readFileSync(backup.backupPath);
  const decoded=BackupService.readEncryptedBackup(backup.backupPath);if(decoded.envelopeVersion!==3||!decoded.metadataAuthenticated||!isDeepStrictEqual(decoded.data,baseline))throw new RecoveryDrillError('BACKUP_DATA_OR_METADATA_UNVERIFIED');
  report.backup={file:path.relative(root,backup.backupPath).replaceAll('\\','/'),ciphertextSha256:hash(ciphertext),byteLength:ciphertext.length,envelopeVersion:decoded.envelopeVersion,metadataAuthenticated:decoded.metadataAuthenticated,keyId:decoded.keyId,createdAt:decoded.timestamp};
  const targetDirectory=path.join(directory,'restored');target=new TransactionalStore(targetDirectory);
  phase('restore',()=>BackupService.restoreEncryptedBackup(backup.backupPath,target!));restored=target.snapshot();
  for(const [name,value] of Object.entries(decoded.data))if(name==='auditLogs'){if(restored.auditLogs.length!==value.length+1||!isDeepStrictEqual(restored.auditLogs.slice(1),value))throw new RecoveryDrillError('RESTORED_AUDIT_CHANGED');}else if(!isDeepStrictEqual((restored as any)[name],value))throw new RecoveryDrillError('RESTORED_RECORD_CHANGED');
  report.restore={allOriginalFieldsPreserved:true,auditChainValid:target.verifyAuditLogIntegrity().valid,counts:Object.fromEntries(Object.entries(restored).filter(([,v])=>v&&typeof v==='object').map(([key,v])=>[key,Object.keys(v).length]))};
  if(!report.restore.auditChainValid)throw new RecoveryDrillError('RESTORED_AUDIT_UNVERIFIED');
  report.privateRecovery=phase('privateRecordVerification',()=>verifyPrivateRecovery(restored!));report.status=report.privateRecovery.verified?(report.privateRecovery.productResourcePresent?'RESTORE_DATA_AND_PRIVATE_VERIFIED':'RESTORE_DATA_VERIFIED_NO_PRIVATE_RESOURCE'):'RESTORE_DATA_PRESERVED_PRIVATE_UNVERIFIED';
  report.snapshotAgeAtVerificationMs=Date.now()-report.sourceCopyObservedAt;report.dataRecoveryDurationMs=Math.round((performance.now()-started)*1000)/1000;
 }catch(error){report.status='REJECTED';report.failureCode=error instanceof RecoveryDrillError?error.code:'RECOVERY_STAGE_REJECTED';}
 finally{source?.close();target?.close();if(target){const database=new DatabaseSync(path.join(directory,'restored/groupdeal.sqlite'),{readOnly:true});try{report.sqliteIntegrity=(database.prepare('PRAGMA integrity_check').get() as any).integrity_check;}finally{database.close();}if(report.sqliteIntegrity!=='ok'){report.status='REJECTED';report.failureCode='RESTORED_SQLITE_UNVERIFIED';}}}
 try{report.originalFilesPreserved=isDeepStrictEqual(report.sourceFootprint,sourceFootprint(sourceDirectory));}catch{report.originalFilesPreserved=false;}if(!report.originalFilesPreserved){report.status='REJECTED';report.failureCode='SOURCE_CHANGED_DURING_DRILL';}
 if(!isDeepStrictEqual(report.toolInputs,toolInputs())){report.status='REJECTED';report.failureCode='SOURCE_INPUT_CHANGED';}
 report.completedAt=new Date().toISOString();report.limitations={chainReplayAndSameBlockReconciliationVerified:false,actualServiceRTOEstablished:false,actualLostDataRPOEstablished:false,externalSecretManagerRecoveryVerified:false,actualProductDeliveryVerified:false,rawCopiesAndKeysMustRemainPrivate:true};
 fs.mkdirSync(reports,{recursive:true});const evidence=path.join(reports,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');fs.writeFileSync(evidence,bytes,{flag:'wx'});
 const pointer={schemaVersion:1,path:path.relative(root,evidence).replaceAll('\\','/'),sha256:hash(bytes),byteLength:bytes.length,status:report.status,inputScope:report.inputScope,acceptanceEligible:false};
 // Fixture output cannot replace the existing-data recovery pointer.
 if(options.inputScope==='EXISTING_DATA'){const latest=path.join(reports,'LATEST.json'),temporary=latest+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(pointer,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,latest);}
 return{...pointer,evidence,directory,report};
}
