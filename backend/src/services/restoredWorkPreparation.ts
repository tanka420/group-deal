import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {TransactionalStore} from '../db/store';
import {privateRecoveryDirectory,copyStableDatabase,sourceFootprint,verifyPrivateRecovery,RecoveryDrillError} from './recoveryDrillService';
import {stageRecoverySessionBarrier,RecoverySessionBarrierError} from './recoverySessionBarrier';
import {readRestoredWorkBarrier} from '../domain/restoredWork';
import {reviewLegacyData} from './legacyDataReview';
import {BackupService} from './backupService';
const root=path.resolve(__dirname,'../../..'),sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
export class RestoredWorkPreparationError extends Error{constructor(public readonly code:string){super(code);}}
const inputs=[
 "backend/scripts/prepareRestoredWork.ts",
 "backend/src/services/restoredWorkPreparation.ts",
 "backend/src/services/restoredWorkBarrier.ts",
 "backend/src/domain/restoredWork.ts",
 "backend/src/domain/authRecovery.ts",
 "backend/src/domain/circleAuthentication.ts",
 "backend/src/domain/circleWalletAuthority.ts",
 "backend/src/domain/circleChallenge.ts",
 "backend/src/domain/circleStatus.ts",
 "backend/src/domain/circleTransactionPolicy.ts",
 "backend/src/services/recoverySessionBarrier.ts",
 "backend/src/services/legacyDataReview.ts",
 "backend/src/services/restoredWorkReview.ts",
 "backend/src/services/shadowPreparation.ts",
 "backend/src/services/deploymentBindings.ts",
 "backend/src/services/recoveryDrillService.ts",
 "backend/src/services/webhookSecret.ts",
 "backend/src/services/runtimeSecurity.ts",
 "backend/src/services/backupService.ts",
 "backend/src/db/store.ts",
 "backend/src/domain/operatorCapability.ts",
 "backend/src/domain/operatorEnrollment.ts",
 "backend/src/db/rowPersistence.ts",
 "backend/src/db/operatorDealRead.ts",
 "backend/src/db/operatorAccountAccessRead.ts",
 "backend/src/domain/accountAccess.ts",
 "backend/src/domain/walletCircleRejection.ts",
 "backend/src/db/legacyReviewMetadata.ts",
 "backend/src/config.ts",
 "backend/src/utils/crypto.ts",
 "backend/package-lock.json",
 "shared/contracts.json",
 "shared/manifests/arc-testnet.json",
 "backend/src/contracts/hubAbi.ts",
 "backend/src/domain/operations.ts",
 "backend/src/domain/sellerFollow.ts",
 "backend/src/domain/sellerInventory.ts",
 "backend/src/domain/product.ts",
 "backend/src/services/publicMetadata.ts",
 "backend/src/domain/support.ts",
 "backend/src/domain/webhookRecovery.ts",
 "backend/src/services/arcReadProvider.ts",
 "backend/src/services/campaignDto.ts",
 "backend/src/services/contactIdentity.ts",
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
 "backend/src/services/sellerFollowService.ts",
 "backend/src/services/sessionService.ts",
 "backend/src/services/authService.ts",
 "backend/src/domain/walletAuthentication.ts",
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
export const restoredWorkPreparationInputs=()=>inputs.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
type Options={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';sourceDirectory:string;privateParent:string;reportDirectory:string};
/** Full original records are staged separately. This tool cannot create projection/admission proof or start a worker. */
export function prepareRestoredWork(options:Options){
 if(options.inputScope==='EXISTING_DATA'&&Object.keys(options).some(k=>k!=='inputScope'))throw new RestoredWorkPreparationError('RESTORED_WORK_SCOPE_OVERRIDE_DISABLED');
 if(options.inputScope!=='EXISTING_DATA'&&(options.inputScope!=='LOCAL_FIXTURE'||process.env.NODE_ENV!=='test'))throw new RestoredWorkPreparationError('RESTORED_WORK_FIXTURE_DISABLED');
 const source=options.inputScope==='EXISTING_DATA'?path.join(root,'backend/data'):options.sourceDirectory;
 if(options.inputScope==='LOCAL_FIXTURE'&&fs.realpathSync(source).toLowerCase()===path.join(root,'backend/data').toLowerCase())throw new RestoredWorkPreparationError('RESTORED_WORK_ACTIVE_FIXTURE_DISABLED');
 const before=sourceFootprint(source),toolInputs=restoredWorkPreparationInputs(),directory=privateRecoveryDirectory(options.inputScope==='EXISTING_DATA'?path.join(root,'.cache/restored-work'):options.privateParent),reports=options.inputScope==='EXISTING_DATA'?path.join(root,'reports/evidence/restored-work'):options.reportDirectory;
 const report:Record<string,any>={schemaVersion:1,recordedAt:new Date().toISOString(),inputScope:options.inputScope,status:'UNVERIFIED',sourceFootprint:before,toolInputs,targetDirectory:path.relative(root,directory).replaceAll('\\','/'),sourceAccess:'FILES_READ_ONLY_NO_SQLITE_CONNECTION',financialAccountingVerified:false,applicationBootEligible:false,authCutoverAllowed:false,productAccessAutoEnabled:false,workersStarted:false,promoted:false,acceptanceEligible:false};let copied:TransactionalStore|undefined,candidate:TransactionalStore|undefined,restored:TransactionalStore|undefined;
 try{
  copyStableDatabase(source,path.join(directory,'input'));copied=new TransactionalStore(path.join(directory,'input'));const original=copied.snapshot();if(!copied.verifyAuditLogIntegrity().valid||!verifyPrivateRecovery(original).verified)throw new RestoredWorkPreparationError('RESTORED_WORK_SOURCE_INVALID');
  report.review=reviewLegacyData(original);const staged=stageRecoverySessionBarrier(copied,path.join(directory,'staging'));candidate=new TransactionalStore(staged.candidateDirectory);const state=candidate.snapshot(),barrier=readRestoredWorkBarrier(state)!;
  report.holds={scope:'ALL_SNAPSHOT_JOBS_AND_WEBHOOK_SUBSCRIPTIONS',barrierVersion:barrier.version,heldCount:barrier.heldCount,heldJobCount:Object.keys(original.emailOutbox).length+Object.keys(original.webhookQueue).length+Object.keys(original.webhookDLQ).length,heldSubscriptionCount:Object.keys(original.webhooks).length,counts:{email:Object.keys(original.emailOutbox).length,webhooks:Object.keys(original.webhookQueue).length,webhookDLQ:Object.keys(original.webhookDLQ).length,subscriptions:Object.keys(original.webhooks).length},originalQueueFieldsPreserved:['emailOutbox','webhookQueue','webhookDLQ'].every(name=>isDeepStrictEqual((state as any)[name],(original as any)[name])),originalSubscriptionFieldsPreserved:isDeepStrictEqual(state.webhooks,original.webhooks),releaseOrReplayAllowed:false,sourceSnapshotSha256:barrier.sourceSnapshotSha256};
  report.authStaging=staged.metadata;report.privateRecovery=verifyPrivateRecovery(state);if(!report.holds.originalQueueFieldsPreserved||!report.holds.originalSubscriptionFieldsPreserved||!report.privateRecovery.verified||!candidate.verifyAuditLogIntegrity().valid)throw new RestoredWorkPreparationError('RESTORED_WORK_CANDIDATE_INVALID');
  const archive=BackupService.createEncryptedBackup(path.join(directory,'archives'),candidate);if(!isDeepStrictEqual(BackupService.readEncryptedBackup(archive.backupPath).data,state))throw new RestoredWorkPreparationError('RESTORED_WORK_ARCHIVE_CHANGED');
  restored=new TransactionalStore(path.join(directory,'restore-check'));BackupService.restoreEncryptedBackup(archive.backupPath,restored);const actual=restored.snapshot();if(Object.entries(state).some(([key,value])=>key!=='auditLogs'&&!isDeepStrictEqual(value,(actual as any)[key]))||!isDeepStrictEqual(actual.auditLogs.slice(1),state.auditLogs)||!restored.verifyAuditLogIntegrity().valid)throw new RestoredWorkPreparationError('RESTORED_WORK_RESTORE_CHANGED');
  const value=fs.readFileSync(archive.backupPath);report.archive={path:path.relative(root,archive.backupPath).replaceAll('\\','/'),sha256:sha(value),byteLength:value.length,envelopeVersion:3,fullFieldsPreserved:true,restoreAuditVerified:true,holdLedgerPreserved:true};
  report.status='PRIVATE_RESTORED_WORK_STAGED_REVIEW_REQUIRED';report.reviewRequiredBeforeApplicationAdmission=true;
 }catch(error){report.status='REJECTED';report.failureCode=error instanceof RestoredWorkPreparationError||error instanceof RecoveryDrillError||error instanceof RecoverySessionBarrierError?error.code:'RESTORED_WORK_STAGING_REJECTED';}finally{restored?.close();candidate?.close();copied?.close();}
 report.originalFilesPreserved=isDeepStrictEqual(before,sourceFootprint(source));if(!report.originalFilesPreserved||!isDeepStrictEqual(toolInputs,restoredWorkPreparationInputs())){report.status='REJECTED';report.failureCode=!report.originalFilesPreserved?'RESTORED_WORK_SOURCE_CHANGED':'RESTORED_WORK_TOOLS_CHANGED';}
 const file=path.join(reports,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json'),value=Buffer.from(JSON.stringify(report,null,2)+'\n');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(file,value,{flag:'wx'});fs.writeFileSync(path.join(directory,'PREPARATION.json'),value,{flag:'wx',mode:0o600});const reference={schemaVersion:1,path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(value),byteLength:value.length,status:report.status,inputScope:options.inputScope,applicationBootEligible:false,acceptanceEligible:false};if(options.inputScope==='EXISTING_DATA'){const latest=path.join(root,'reports/evidence/RESTORED_WORK_PREPARATION_LATEST.json'),temporary=latest+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(reference,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,latest);}return{...reference,report,directory};
}
