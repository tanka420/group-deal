import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {ethers} from 'ethers';
import {config} from '../config';
import {TransactionalStore} from '../db/store';
import {BackupService} from './backupService';
import {backupRuntimeStore} from './runtimeBackup';
import {readRecoveryRuntimeSnapshotSource,recoveryApplicationInputs} from './recoveryApplication';
import {privateRecoveryDirectory,sourceFootprint,verifyPrivateRecovery} from './recoveryDrillService';
import {ArcReadProvider} from './arcReadProvider';
import {assertProjectionScope} from './projectionScope';
import {ReconciliationService} from './reconciliationService';
import {readRestoredWorkBarrier} from '../domain/restoredWork';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {restoredExternalWorkSummary} from './restoredWorkReview';
import {UpgradeReference,signRuntimeUpgradeInput,signRuntimeUpgradePreparation,assertRuntimeUpgradeHolds,upgradeDigest,upgradeReportContent,upgradeFail,RuntimeUpgradeError} from '../domain/runtimeUpgrade';
import {RuntimeUpgradeScope,upgradeScope,upgradeFileReference,runtimeUpgradeKey,loadRuntimeUpgradeInput,containedUpgradePath} from './runtimeUpgradeSource';

const root=path.resolve(__dirname,'../../..'),normal=(r:UpgradeReference)=>({path:r.path,sha256:r.sha256,byteLength:r.byteLength});
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const scopeOnly=(options:RuntimeUpgradeScope):RuntimeUpgradeScope=>options.inputScope==='EXISTING_DATA'?{inputScope:'EXISTING_DATA'}:{inputScope:'LOCAL_FIXTURE',fixtureRoot:options.fixtureRoot,sourceDirectory:options.sourceDirectory};
function writeReport(report:any,directory:string){fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return upgradeFileReference(file);}
function pointer(file:string,ref:unknown){const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(ref,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,file);}
type LocalAdmission=Extract<Parameters<typeof readRecoveryRuntimeSnapshotSource>[0],{inputScope:'LOCAL_FIXTURE'}>;
type IntakeOptions={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';fixtureRoot:string;sourceDirectory:string;recovery:LocalAdmission};
/** Run BEFORE changing source/build files; refuses any active live-store lease. */
export function prepareRuntimeUpgradeInput(options:IntakeOptions){
 if(options.inputScope==='EXISTING_DATA'&&Object.keys(options).some(k=>k!=='inputScope'))upgradeFail('RUNTIME_UPGRADE_SCOPE_OVERRIDE_DISABLED');
 const scope=upgradeScope(scopeOnly(options)),resolver=readRecoveryRuntimeSnapshotSource(options.inputScope==='EXISTING_DATA'?{inputScope:'EXISTING_DATA'}:options.recovery);
 containedUpgradePath(resolver.directory,scope.parent('.cache/application-recovery'),true);
 if(fs.existsSync(path.join(resolver.directory,'RECOVERY_RUNNING.json')))upgradeFail('RUNTIME_UPGRADE_LIVE_PROCESS_PRESENT');
 const prior=read(path.join(root,resolver.preparationReference.path)),original=sourceFootprint(scope.source),live=sourceFootprint(resolver.directory),inputs=recoveryApplicationInputs();
 const backup=backupRuntimeStore(options.inputScope==='EXISTING_DATA'?{inputScope:'EXISTING_RUNTIME'}:{inputScope:'LOCAL_FIXTURE',recovery:options.recovery,privateParent:path.join(options.fixtureRoot,'backups'),reportDirectory:path.join(options.fixtureRoot,'backup-reports')});
 if(backup.status!=='RUNTIME_BACKUP_RESTORE_DATA_VERIFIED'||backup.report.selectedStoreScope!=='RECOVERED_LIVE_STORE'||backup.report.restore?.allFieldsPreserved!==true||backup.report.privateRecovery?.verified!==true)upgradeFail('RUNTIME_UPGRADE_BACKUP_INVALID');
 const decoded=BackupService.readEncryptedBackup(path.join(root,backup.report.archive.path));resolver.verifyCopiedState(decoded.data);resolver.verifyUnchanged();
 if(!isDeepStrictEqual(original,sourceFootprint(scope.source))||!isDeepStrictEqual(live,sourceFootprint(resolver.directory))||!isDeepStrictEqual(inputs,recoveryApplicationInputs()))upgradeFail('RUNTIME_UPGRADE_INTAKE_CHANGED');
 const directory=privateRecoveryDirectory(options.inputScope==='EXISTING_DATA'?path.join(root,'.cache/runtime-upgrade-inputs'):path.join(options.fixtureRoot,'upgrade-input')),saved=path.join(directory,'PRIOR_ADMISSION.json');
 fs.copyFileSync(path.join(root,resolver.receiptReference.path),saved,fs.constants.COPYFILE_EXCL);
 const body={version:1,purpose:'RECOVERY_RUNTIME_SOURCE_UPGRADE_INPUT',keyId:config.masterEncryptionKeyId,recordedAt:new Date().toISOString(),inputScope:options.inputScope,deployment:prior.deployment,sourceFootprint:original,sourceDirectory:path.relative(root,resolver.directory).replaceAll('\\','/'),liveSourceFootprint:live,priorPreparation:normal(resolver.preparationReference),priorAdmission:upgradeFileReference(saved),liveArchive:normal(backup.report.archive),backupProof:normal(backup),legacyArchive:prior.legacyDisposition?.archiveReference??null,sourceRuntimeInputs:inputs,originalHeldCount:readRestoredWorkBarrier(decoded.data)!.heldCount,originalRecordsPreserved:true,financialBindingAssigned:false,accountOrFinancialAuthorityAssigned:false,heldWorkReleaseAllowed:false,applicationAdmissionAllowed:false,acceptanceEligible:false};
 const receipt=path.join(directory,'INPUT_RECEIPT.json');fs.writeFileSync(receipt,JSON.stringify(signRuntimeUpgradeInput(body,runtimeUpgradeKey(body.keyId).bytes),null,2)+'\n',{flag:'wx',mode:0o600});
 const {version,purpose,keyId,...fields}=body,report={schemaVersion:1,status:'RUNTIME_SOURCE_UPGRADE_INPUT_PREPARED',...fields,signedPrivateReceipt:upgradeFileReference(receipt)};
 const ref=writeReport(report,options.inputScope==='EXISTING_DATA'?path.join(root,'reports/evidence/runtime-upgrade-inputs'):path.join(options.fixtureRoot,'upgrade-input-reports'));
 if(options.inputScope==='EXISTING_DATA')pointer(path.join(root,'reports/evidence/RUNTIME_UPGRADE_INPUT_LATEST.json'),{schemaVersion:1,...ref,status:report.status,acceptanceEligible:false});
 return{...ref,status:report.status,report};
}
type PreparationOptions={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';fixtureRoot:string;sourceDirectory:string;inputReference:UpgradeReference;provider:any;verifyDeployment:(provider:any,block:number)=>Promise<void>};
/** Exact live-state restore plus fresh fixed-block verification. Startup separately catches up to head. */
export async function prepareRuntimeUpgradeApplication(options:PreparationOptions){
 if(options.inputScope==='EXISTING_DATA'&&Object.keys(options).some(k=>k!=='inputScope'))upgradeFail('RUNTIME_UPGRADE_SCOPE_OVERRIDE_DISABLED');
 const scope=upgradeScope(scopeOnly(options)),ref=options.inputScope==='EXISTING_DATA'?read(path.join(root,'reports/evidence/RUNTIME_UPGRADE_INPUT_LATEST.json')):options.inputReference,input=loadRuntimeUpgradeInput(normal(ref),scopeOnly(options));
 if(fs.existsSync(path.join(input.source,'RECOVERY_RUNNING.json')))upgradeFail('RUNTIME_UPGRADE_LIVE_PROCESS_PRESENT');
 const directory=privateRecoveryDirectory(options.inputScope==='EXISTING_DATA'?path.join(root,'.cache/application-recovery'):path.join(options.fixtureRoot,'upgrade-application')),inputs=recoveryApplicationInputs();
 const report:Record<string,any>={schemaVersion:1,recordedAt:new Date().toISOString(),inputScope:options.inputScope,status:'UNVERIFIED',deployment:input.body.deployment,sourceFootprint:input.body.sourceFootprint,targetDirectory:path.relative(root,directory).replaceAll('\\','/'),runtimeInputs:inputs,runtimeUpgrade:{inputReference:normal(ref)},applicationBootEligible:false,promoted:false,rolloutAllowed:false,authCutoverAllowed:false,acceptanceEligible:false,financialAccountingVerified:false,accountOrFinancialAuthorityAssigned:false,heldWorkReleaseAllowed:false};
 let retained:TransactionalStore|undefined,candidate:TransactionalStore|undefined,provider:any;
 try{
  retained=new TransactionalStore(path.join(directory,'retained-live'));retained.initializeRecoverySnapshot(input.original);
  candidate=new TransactionalStore(path.join(directory,'candidate'));candidate.initializeRecoverySnapshot(input.original);
  if(!isDeepStrictEqual(retained.snapshot(),input.original)||!isDeepStrictEqual(candidate.snapshot(),input.original))upgradeFail('RUNTIME_UPGRADE_RESTORE_CHANGED');
  assertProjectionScope(candidate.db);if(!retained.verifyAuditLogIntegrity().valid||!candidate.verifyAuditLogIntegrity().valid||!readAuthRecoveryBarrier(candidate.db.authRecovery))upgradeFail('RUNTIME_UPGRADE_AUDIT_OR_AUTH_INVALID');
  report.auditVerified=true;report.privateRecovery=verifyPrivateRecovery(candidate.db);if(!report.privateRecovery.verified)upgradeFail('RUNTIME_UPGRADE_PRIVATE_DATA_INVALID');
  report.archivedWorkHold=assertRuntimeUpgradeHolds(candidate.db,input.original,true);report.restoredExternalWork=restoredExternalWorkSummary(candidate.db);
  const prior=read(path.join(root,input.body.priorPreparation.path));if(input.body.legacyArchive)report.legacyDisposition=prior.legacyDisposition;report.retention=prior.retention;
  report.originalCounts=Object.fromEntries(Object.entries(input.original).filter(([,v])=>v&&typeof v==='object').map(([k,v])=>[k,Object.keys(v).length]));
  provider=options.inputScope==='LOCAL_FIXTURE'?options.provider:new ArcReadProvider();
  if(Number((await provider.getNetwork()).chainId)!==config.arcChainId)upgradeFail('RUNTIME_UPGRADE_NETWORK_MISMATCH');
  const block=input.original.syncState.lastIndexedBlock,head=await provider.getBlockNumber(),canonical=await provider.getBlock(block);
  if(!Number.isSafeInteger(block)||block<config.deploymentBlock||block>head||!canonical?.hash||!ethers.isHexString(canonical.hash,32)||canonical.hash!==input.original.syncState.lastIndexedBlockHash)upgradeFail('RUNTIME_UPGRADE_CANONICAL_CURSOR_INVALID');
  report.fixedBlock={number:block,hash:canonical.hash,observedHead:head};
  if(options.inputScope==='LOCAL_FIXTURE')await options.verifyDeployment(provider,block);
  else{
   const m=read(config.manifestPath);
   if(m.chainId!==config.arcChainId||m.contracts.GroupDealHub.address.toLowerCase()!==config.hubAddress.toLowerCase()||m.contracts.GroupDealHub.deploymentBlock!==config.deploymentBlock||(m.protocolVersion||1)!==config.protocolVersion||m.contracts.USDC.address.toLowerCase()!==config.usdcAddress.toLowerCase())upgradeFail('RUNTIME_UPGRADE_MANIFEST_MISMATCH');
   const code=await provider.getCode(config.hubAddress,block);if(code==='0x'||ethers.keccak256(code).toLowerCase()!==m.contracts.GroupDealHub.bytecodeHash.toLowerCase())upgradeFail('RUNTIME_UPGRADE_RUNTIME_MISMATCH');
  }
  report.reconciliation=await ReconciliationService.runReconciliation({fixedBlockNumber:block,customProvider:provider,projectionStore:candidate});
  const r=report.reconciliation;if(r.status!=='HEALTHY'||!r.perOrderVerified||!r.coverageVerified||!r.onchainBalanceVerified||!r.conservationLawPassed||r.blockNumber!==block||r.projectionBlock!==block||r.blockHash!==canonical.hash||r.discrepancies.length||(await provider.getBlock(block))?.hash!==canonical.hash)upgradeFail('RUNTIME_UPGRADE_RECONCILIATION_UNVERIFIED');
  if(!isDeepStrictEqual(candidate.snapshot(),input.original)||!isDeepStrictEqual(retained.snapshot(),input.original))upgradeFail('RUNTIME_UPGRADE_LIVE_RECORD_CHANGED');
  report.allLiveFieldsPreserved=true;report.authPreparation={freshLoginRequired:true,authBarrierPreservedUntilAdmission:true,transientRecordsRetainedUntilAdmission:true};report.status='RECOVERY_APPLICATION_PREPARED';report.applicationBootEligible=true;
 }catch(error){report.status='REJECTED';report.failureCode=error instanceof RuntimeUpgradeError?error.code:'RUNTIME_UPGRADE_PREPARATION_REJECTED';report.applicationBootEligible=false;}
 finally{retained?.close();candidate?.close();provider?.destroy?.();}
 report.originalFilesPreserved=isDeepStrictEqual(input.body.sourceFootprint,sourceFootprint(scope.source));report.liveSourceFilesPreserved=isDeepStrictEqual(input.body.liveSourceFootprint,sourceFootprint(input.source));
 if(!report.originalFilesPreserved||!report.liveSourceFilesPreserved||!isDeepStrictEqual(inputs,recoveryApplicationInputs())){report.status='REJECTED';report.failureCode='RUNTIME_UPGRADE_INPUT_OR_RUNTIME_CHANGED';report.applicationBootEligible=false;}
 if(report.status==='RECOVERY_APPLICATION_PREPARED'){
  report.candidateDatabase=upgradeFileReference(path.join(directory,'candidate/groupdeal.sqlite'));report.retainedDatabase=upgradeFileReference(path.join(directory,'retained-live/groupdeal.sqlite'));
  const receipt=path.join(directory,'UPGRADE_RECEIPT.json'),body={version:1,purpose:'RECOVERY_RUNTIME_SOURCE_UPGRADE_PREPARATION',keyId:config.masterEncryptionKeyId,inputReference:normal(ref),reportSha256:upgradeDigest(upgradeReportContent(report)),applicationStorageOnly:true,accountOrFinancialAuthorityAssigned:false,heldWorkReleaseAllowed:false,acceptanceEligible:false};
  fs.writeFileSync(receipt,JSON.stringify(signRuntimeUpgradePreparation(body,runtimeUpgradeKey(body.keyId).bytes),null,2)+'\n',{flag:'wx',mode:0o600});report.runtimeUpgrade.signedPrivateReceipt=upgradeFileReference(receipt);
 }
 const result=writeReport(report,options.inputScope==='EXISTING_DATA'?path.join(root,'reports/evidence/application-recovery'):path.join(options.fixtureRoot,'upgrade-application-reports'));
 fs.writeFileSync(path.join(directory,'PREPARATION.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 const next={schemaVersion:1,...result,status:report.status,inputScope:options.inputScope,applicationBootEligible:report.applicationBootEligible,acceptanceEligible:false};
 if(options.inputScope==='EXISTING_DATA'&&report.applicationBootEligible)pointer(path.join(root,'reports/evidence/RECOVERY_APPLICATION_LATEST.json'),next);
 return{...next,report,directory};
}
