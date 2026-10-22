import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {TransactionalStore} from '../db/store';
import {BackupService} from './backupService';
import {sourceFootprint,copyStableDatabase,privateRecoveryDirectory,verifyPrivateRecovery,RecoveryDrillError} from './recoveryDrillService';
import {readRecoveryRuntimeSnapshotSource,RecoveryApplicationError} from './recoveryApplication';

const root=path.resolve(__dirname,'../../..'),sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
export class RuntimeBackupError extends Error{constructor(public readonly code:string){super(code);}}
type LocalRecovery=Extract<Parameters<typeof readRecoveryRuntimeSnapshotSource>[0],{inputScope:'LOCAL_FIXTURE'}>;
type Options={inputScope:'EXISTING_RUNTIME'}|{inputScope:'LOCAL_FIXTURE';sourceDirectory?:string;recovery?:LocalRecovery;privateParent:string;reportDirectory:string};
const paths=[
 "backend/scripts/backupRuntime.ts",
 "backend/src/services/runtimeBackup.ts",
 "backend/src/services/recoveryApplication.ts",
 "backend/src/services/runtimeUpgradeSource.ts",
 "backend/src/domain/runtimeUpgrade.ts",
 "backend/src/services/internalTestArchiveRecovery.ts",
 "backend/src/domain/internalTestArchive.ts",
 "backend/src/domain/recoveredWorkHoldPolicy.ts",
 "backend/scripts/prepareInternalTestArchive.ts",
 "backend/src/services/legacyDataReview.ts",
 "backend/src/services/recoveryDrillService.ts",
 "backend/src/services/webhookSecret.ts",
 "backend/src/services/backupService.ts",
 "backend/src/db/store.ts",
 "backend/src/domain/operatorCapability.ts",
 "backend/src/domain/operatorEnrollment.ts",
 "backend/src/db/rowPersistence.ts",
 "backend/src/db/operatorDealRead.ts",
 "backend/src/db/legacyReviewMetadata.ts",
 "backend/src/config.ts",
 "backend/src/services/runtimeSecurity.ts",
 "backend/src/utils/crypto.ts",
 "backend/package-lock.json",
 "shared/contracts.json",
 "shared/manifests/arc-testnet.json",
 "backend/src/contracts/hubAbi.ts",
 "backend/src/domain/authRecovery.ts",
 "backend/src/domain/circleAuthentication.ts",
 "backend/src/domain/circleWalletAuthority.ts",
 "backend/src/domain/circleChallenge.ts",
 "backend/src/domain/circleStatus.ts",
 "backend/src/domain/circleTransactionPolicy.ts",
 "backend/src/domain/operations.ts",
 "backend/src/domain/restoredWork.ts",
 "backend/src/domain/sellerFollow.ts",
 "backend/src/domain/sellerInventory.ts",
 "backend/src/domain/product.ts",
 "backend/src/services/publicMetadata.ts",
 "backend/src/domain/support.ts",
 "backend/src/domain/webhookRecovery.ts",
 "backend/src/services/arcReadProvider.ts",
 "backend/src/services/campaignDto.ts",
 "backend/src/services/contactIdentity.ts",
 "backend/src/services/deploymentBindings.ts",
 "backend/src/services/eventEvidence.ts",
 "backend/src/services/eventNotifications.ts",
 "backend/src/services/followNotifications.ts",
 "backend/src/services/indexerService.ts",
 "backend/src/services/notificationService.ts",
 "backend/src/services/notificationInboxService.ts",
 "backend/src/services/notificationSource.ts",
 "backend/src/services/onchainService.ts",
 "backend/src/services/operationalSignals.ts",
 "backend/src/services/productService.ts",
 "backend/src/services/projectionScope.ts",
 "backend/src/services/publicCampaign.ts",
 "backend/src/services/publicSellerIdentity.ts",
 "backend/src/services/reconciliationService.ts",
 "backend/src/services/recoverySessionBarrier.ts",
 "backend/src/services/restoredWorkBarrier.ts",
 "backend/src/services/restoredWorkReview.ts",
 "backend/src/services/sellerFollowService.ts",
 "backend/src/services/sessionService.ts",
 "backend/src/services/authService.ts",
 "backend/src/domain/walletAuthentication.ts",
 "backend/src/services/shadowPreparation.ts",
 "backend/src/services/webhookPayload.ts",
 "backend/src/services/webhookRecoveryPolicy.ts",
 "backend/src/services/webhookService.ts",
 "backend/src/services/webhookTransport.ts",
 "shared/domain.cjs",
 "shared/publicWidget.mjs",
 "backend/src/domain/sellerBadge.ts",
 "shared/operatorBadge.mjs",
 "backend/src/domain/operationPreparation.ts",
 "backend/src/domain/operationReadiness.ts",
 "backend/src/domain/operationReplacement.ts",
 "backend/src/domain/operationTracking.ts",
 "backend/src/domain/operationVerification.ts",
 "backend/src/domain/orderReview.ts",
 "backend/src/domain/receiptConsumption.ts",
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
export const runtimeBackupInputs=()=>paths.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
/** An offline, stable physical copy. Live/source databases never get a SQLite connection or writes. */
export function backupRuntimeStore(options:Options){
 if(options.inputScope==='EXISTING_RUNTIME'&&Object.keys(options).some(k=>k!=='inputScope'))throw new RuntimeBackupError('RUNTIME_BACKUP_SCOPE_OVERRIDE_DISABLED');
 if(options.inputScope!=='EXISTING_RUNTIME'&&(options.inputScope!=='LOCAL_FIXTURE'||process.env.NODE_ENV!=='test'))throw new RuntimeBackupError('RUNTIME_BACKUP_FIXTURE_DISABLED');
 const originalFootprint=options.inputScope==='EXISTING_RUNTIME'?sourceFootprint(path.join(root,'backend/data')):undefined;
 const started=performance.now(),parent=options.inputScope==='EXISTING_RUNTIME'?path.join(root,'.cache/runtime-backups'):options.privateParent,reports=options.inputScope==='EXISTING_RUNTIME'?path.join(root,'reports/evidence/runtime-backups'):options.reportDirectory,directory=privateRecoveryDirectory(parent),toolInputs=runtimeBackupInputs();
 const report:Record<string,any>={schemaVersion:1,recordedAt:new Date().toISOString(),inputScope:options.inputScope,status:'UNVERIFIED',selectedStoreScope:'UNSELECTED',toolInputs,targetDirectory:path.relative(root,directory).replaceAll('\\','/'),sourceAccess:'FILES_READ_ONLY_NO_SQLITE_CONNECTION',promoted:false,authCutoverAllowed:false,workersStarted:false,financialAccountingVerified:false,acceptanceEligible:false,actualServiceRTOEstablished:false,actualLostDataRPOEstablished:false};
 let source:TransactionalStore|undefined,target:TransactionalStore|undefined,sourceDirectory:string|undefined,recovery:ReturnType<typeof readRecoveryRuntimeSnapshotSource>|undefined;
 try{
  const mode=process.env.GROUPDEAL_RECOVERY_MODE;
  if(mode!==undefined&&mode!=='1')throw new RuntimeBackupError('RUNTIME_BACKUP_MODE_INVALID');
  if(mode==='1'){
   if(options.inputScope==='LOCAL_FIXTURE'&&!options.recovery)throw new RuntimeBackupError('RUNTIME_BACKUP_RECOVERY_REFERENCE_REQUIRED');
   recovery=readRecoveryRuntimeSnapshotSource(options.inputScope==='EXISTING_RUNTIME'?{inputScope:'EXISTING_DATA'}:options.recovery!);sourceDirectory=recovery.directory;report.selectedStoreScope='RECOVERED_LIVE_STORE';report.preparationReference=recovery.preparationReference;report.admissionReceiptReference=recovery.receiptReference;
  }else{
   if(options.inputScope==='LOCAL_FIXTURE'&&(!options.sourceDirectory||options.recovery))throw new RuntimeBackupError('RUNTIME_BACKUP_LOCAL_SOURCE_REQUIRED');
   sourceDirectory=options.inputScope==='EXISTING_RUNTIME'?path.join(root,'backend/data'):options.sourceDirectory!;report.selectedStoreScope='ORIGINAL_STORE';
  }
  if(options.inputScope==='LOCAL_FIXTURE'&&fs.realpathSync(sourceDirectory).toLowerCase()===path.join(root,'backend/data').toLowerCase())throw new RuntimeBackupError('RUNTIME_BACKUP_FIXTURE_ACTIVE_SOURCE_DISABLED');
  report.sourceFootprint=sourceFootprint(sourceDirectory);const copied=copyStableDatabase(sourceDirectory,path.join(directory,'source-copy'));if(!isDeepStrictEqual(copied,report.sourceFootprint))throw new RuntimeBackupError('RUNTIME_BACKUP_SOURCE_CHANGED');
  source=new TransactionalStore(path.join(directory,'source-copy'));const baseline=source.snapshot();recovery?.verifyCopiedState(baseline);
  if(!source.verifyAuditLogIntegrity().valid)throw new RuntimeBackupError('RUNTIME_BACKUP_AUDIT_INVALID');
  const archive=BackupService.createEncryptedBackup(path.join(directory,'archives'),source),cipher=fs.readFileSync(archive.backupPath),decoded=BackupService.readEncryptedBackup(archive.backupPath);
  if(decoded.envelopeVersion!==3||!decoded.metadataAuthenticated||!isDeepStrictEqual(decoded.data,baseline))throw new RuntimeBackupError('RUNTIME_BACKUP_ARCHIVE_UNVERIFIED');
  report.archive={path:path.relative(root,archive.backupPath).replaceAll('\\','/'),sha256:sha(cipher),byteLength:cipher.length,envelopeVersion:3,metadataAuthenticated:true,keyId:decoded.keyId,createdAt:decoded.timestamp};
  target=new TransactionalStore(path.join(directory,'restore-check'));BackupService.restoreEncryptedBackup(archive.backupPath,target);const restored=target.snapshot();
  for(const [key,value]of Object.entries(baseline))if(key==='auditLogs'){if(restored.auditLogs.length!==baseline.auditLogs.length+1||!isDeepStrictEqual(restored.auditLogs.slice(1),value))throw new RuntimeBackupError('RUNTIME_BACKUP_RESTORED_RECORD_CHANGED');}else if(!isDeepStrictEqual((restored as any)[key],value))throw new RuntimeBackupError('RUNTIME_BACKUP_RESTORED_RECORD_CHANGED');
  recovery?.verifyCopiedState(restored);if(!target.verifyAuditLogIntegrity().valid)throw new RuntimeBackupError('RUNTIME_BACKUP_RESTORED_AUDIT_INVALID');
  report.privateRecovery=verifyPrivateRecovery(restored);if(!report.privateRecovery.verified)throw new RuntimeBackupError('RUNTIME_BACKUP_PRIVATE_DATA_UNVERIFIED');
  recovery?.verifyUnchanged();report.restore={allFieldsPreserved:true,auditVerified:true,authAuthorityRefreshed:false,counts:Object.fromEntries(Object.entries(restored).filter(([,v])=>v&&typeof v==='object').map(([key,v])=>[key,Object.keys(v).length]))};report.status='RUNTIME_BACKUP_RESTORE_DATA_VERIFIED';
 }catch(error){report.status='REJECTED';report.failureCode=error instanceof RuntimeBackupError||error instanceof RecoveryApplicationError||error instanceof RecoveryDrillError?error.code:'RUNTIME_BACKUP_STAGE_REJECTED';}
 finally{source?.close();target?.close();}
 if(sourceDirectory&&report.sourceFootprint){try{report.sourceFilesUnchanged=isDeepStrictEqual(report.sourceFootprint,sourceFootprint(sourceDirectory));}catch{report.sourceFilesUnchanged=false;}if(!report.sourceFilesUnchanged){report.status='REJECTED';report.failureCode='RUNTIME_BACKUP_SOURCE_CHANGED';}}
 if(originalFootprint){report.originalStoreFootprint=originalFootprint;try{report.originalStoreFilesUnchanged=isDeepStrictEqual(originalFootprint,sourceFootprint(path.join(root,'backend/data')));}catch{report.originalStoreFilesUnchanged=false;}if(!report.originalStoreFilesUnchanged){report.status='REJECTED';report.failureCode='RUNTIME_BACKUP_ORIGINAL_SOURCE_CHANGED';}}
 if(!isDeepStrictEqual(toolInputs,runtimeBackupInputs())){report.status='REJECTED';report.failureCode='RUNTIME_BACKUP_TOOLS_CHANGED';}
 report.dataBackupAndRestoreDurationMs=Math.round((performance.now()-started)*1000)/1000;report.completedAt=new Date().toISOString();
 fs.mkdirSync(reports,{recursive:true});const file=path.join(reports,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json'),value=Buffer.from(JSON.stringify(report,null,2)+'\n');fs.writeFileSync(file,value,{flag:'wx'});const ref={schemaVersion:1,path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(value),byteLength:value.length,status:report.status,inputScope:options.inputScope,selectedStoreScope:report.selectedStoreScope,acceptanceEligible:false};
 fs.writeFileSync(path.join(directory,'BACKUP.json'),value,{flag:'wx',mode:0o600});if(options.inputScope==='EXISTING_RUNTIME'){const pointer=path.join(root,'reports/evidence/RUNTIME_BACKUP_LATEST.json'),temporary=pointer+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(ref,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,pointer);}return{...ref,report,directory};
}
