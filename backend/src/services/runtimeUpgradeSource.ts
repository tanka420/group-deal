import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {DatabaseSchema} from '../db/store';
import {config} from '../config';
import {BackupService} from './backupService';
import {sourceFootprint,verifyPrivateRecovery} from './recoveryDrillService';
import {encryptionKey} from '../utils/crypto';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {readRestoredWorkBarrier} from '../domain/restoredWork';
import {UpgradeReference,upgradeReferenceSchema,verifyRuntimeUpgradeInput,verifyRuntimeUpgradePreparation,upgradeDigest,upgradeReportContent,upgradeFail,RuntimeUpgradeError,assertRuntimeUpgradeHolds} from '../domain/runtimeUpgrade';

const root=path.resolve(__dirname,'../../..'),sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
export type RuntimeUpgradeScope={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';fixtureRoot:string;sourceDirectory:string};
export function upgradeScope(options:RuntimeUpgradeScope){
 if(options.inputScope==='EXISTING_DATA'){if(Object.keys(options).some(k=>k!=='inputScope'))upgradeFail('RUNTIME_UPGRADE_SCOPE_OVERRIDE_DISABLED');return{parent:(p:string)=>path.join(root,p),source:config.runtimeDataDirectory};}
 if(options.inputScope!=='LOCAL_FIXTURE'||process.env.NODE_ENV!=='test'||!options.fixtureRoot)upgradeFail('RUNTIME_UPGRADE_FIXTURE_DISABLED');
 const fixture=containedUpgradePath(options.fixtureRoot,path.join(root,'.cache/local-check-temp'),true);
 const source=containedUpgradePath(options.sourceDirectory,fixture,true);
 return{parent:(_p:string)=>fixture,source};
}
export function containedUpgradePath(value:string,parent:string,directory=false){
 const file=path.resolve(root,value),base=fs.realpathSync(parent),real=fs.realpathSync(file),relative=path.relative(base,real);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||(directory?!fs.lstatSync(file).isDirectory():!fs.lstatSync(file).isFile()))upgradeFail('RUNTIME_UPGRADE_PATH_INVALID');
 return file;
}
export function upgradeFileReference(file:string):UpgradeReference{const bytes=fs.readFileSync(file);return{path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(bytes),byteLength:bytes.length};}
export function readUpgradeReference(ref:UpgradeReference,parent:string,limit=2*1024*1024){
 const parsed=upgradeReferenceSchema.safeParse(ref);if(!parsed.success||ref.byteLength>limit)upgradeFail('RUNTIME_UPGRADE_REFERENCE_INVALID');
 const file=containedUpgradePath(ref.path,parent);if(fs.statSync(file).size!==ref.byteLength)upgradeFail('RUNTIME_UPGRADE_REFERENCE_CHANGED');
 const bytes=fs.readFileSync(file);if(sha(bytes)!==ref.sha256)upgradeFail('RUNTIME_UPGRADE_REFERENCE_CHANGED');return{file,bytes,value:()=>JSON.parse(bytes.toString())};
}
export function runtimeUpgradeKey(id:unknown){
 if(typeof id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(id)||['legacy','custom','__proto__','prototype','constructor'].includes(id)||id!==config.masterEncryptionKeyId&&!Object.hasOwn(config.previousEncryptionKeys,id))upgradeFail('RUNTIME_UPGRADE_KEY_UNAVAILABLE');
 const value=id===config.masterEncryptionKeyId?config.masterEncryptionKey:config.previousEncryptionKeys[id as string];if(!value)upgradeFail('RUNTIME_UPGRADE_KEY_UNAVAILABLE');
 return{value:value!,bytes:encryptionKey(id as string,value!)};
}
const deployment=()=>({chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,deploymentBlock:config.deploymentBlock});
/** Historical code authenticates the intake. Only fresh current-code preparation can admit its data. */
export function loadRuntimeUpgradeInput(reference:UpgradeReference,options:RuntimeUpgradeScope){
 try{
  const scope=upgradeScope(options),report=readUpgradeReference(reference,scope.parent('reports/evidence/runtime-upgrade-inputs')).value();
  if(report.schemaVersion!==1||report.status!=='RUNTIME_SOURCE_UPGRADE_INPUT_PREPARED')upgradeFail('RUNTIME_UPGRADE_INPUT_INVALID');
  const receipt=readUpgradeReference(report.signedPrivateReceipt,scope.parent('.cache/runtime-upgrade-inputs')).value();
  const body=verifyRuntimeUpgradeInput(receipt,runtimeUpgradeKey(receipt?.body?.keyId).bytes);
  if(body.inputScope!==options.inputScope||Date.parse(body.recordedAt)>Date.now()+30000||!isDeepStrictEqual(body.deployment,deployment()))upgradeFail('RUNTIME_UPGRADE_INPUT_SCOPE_INVALID');
  for(const field of Object.keys(body).filter(k=>!['version','purpose','keyId'].includes(k)))if(!isDeepStrictEqual((body as any)[field],report[field]))upgradeFail('RUNTIME_UPGRADE_INPUT_BINDING_CHANGED');
  if(!isDeepStrictEqual(body.sourceFootprint,sourceFootprint(scope.source)))upgradeFail('RUNTIME_UPGRADE_ORIGINAL_CHANGED');
  const source=containedUpgradePath(body.sourceDirectory,scope.parent('.cache/application-recovery'),true);
  if(!isDeepStrictEqual(body.liveSourceFootprint,sourceFootprint(source)))upgradeFail('RUNTIME_UPGRADE_LIVE_SOURCE_CHANGED');
  const prior=readUpgradeReference(body.priorPreparation,scope.parent('reports/evidence/application-recovery')).value();
  if(prior.inputScope!==options.inputScope||prior.status!=='RECOVERY_APPLICATION_PREPARED'||prior.applicationBootEligible!==true||prior.promoted!==false||prior.rolloutAllowed!==false||prior.authCutoverAllowed!==false||prior.acceptanceEligible!==false||!isDeepStrictEqual(prior.deployment,body.deployment)||!isDeepStrictEqual(prior.sourceFootprint,body.sourceFootprint)||!isDeepStrictEqual(prior.runtimeInputs,body.sourceRuntimeInputs)||path.dirname(path.resolve(root,prior.candidateDatabase.path))!==source||!isDeepStrictEqual(prior.legacyDisposition?.archiveReference??null,body.legacyArchive))upgradeFail('RUNTIME_UPGRADE_PRIOR_PREPARATION_INVALID');
  if(body.legacyArchive)readUpgradeReference(body.legacyArchive,scope.parent('reports/evidence/internal-test-archives'));
  const admission=readUpgradeReference(body.priorAdmission,scope.parent('.cache/runtime-upgrade-inputs')).value(),a=admission?.body;
  const expected=a?crypto.createHmac('sha256',runtimeUpgradeKey(a.keyId).value).update('groupdeal:recovery-admission:v1:'+JSON.stringify(a)).digest('hex'):'';
  if(!a||typeof admission.mac!=='string'||!/^[a-f0-9]{64}$/.test(admission.mac)||!crypto.timingSafeEqual(Buffer.from(admission.mac,'hex'),Buffer.from(expected,'hex'))||a.version!==1||a.phase!=='COMMITTED'||!isDeepStrictEqual(a.proof,body.priorPreparation)||a.initialDatabaseSha256!==prior.candidateDatabase.sha256||!/^[a-f0-9]{64}$/.test(a.contextSha256))upgradeFail('RUNTIME_UPGRADE_PRIOR_ADMISSION_INVALID');
  const proof=readUpgradeReference(body.backupProof,scope.parent('reports/evidence/runtime-backups')).value();
  if(proof.inputScope!==(options.inputScope==='EXISTING_DATA'?'EXISTING_RUNTIME':'LOCAL_FIXTURE')||proof.status!=='RUNTIME_BACKUP_RESTORE_DATA_VERIFIED'||proof.selectedStoreScope!=='RECOVERED_LIVE_STORE'||proof.sourceFilesUnchanged!==true||proof.restore?.allFieldsPreserved!==true||proof.restore?.auditVerified!==true||proof.restore?.authAuthorityRefreshed!==false||proof.privateRecovery?.verified!==true||proof.promoted!==false||proof.authCutoverAllowed!==false||proof.workersStarted!==false||proof.acceptanceEligible!==false||!isDeepStrictEqual(proof.sourceFootprint,body.liveSourceFootprint)||!proof.preparationReference||!isDeepStrictEqual({path:proof.preparationReference.path,sha256:proof.preparationReference.sha256,byteLength:proof.preparationReference.byteLength},body.priorPreparation))upgradeFail('RUNTIME_UPGRADE_BACKUP_INVALID');
  if(options.inputScope==='EXISTING_DATA'&&(proof.originalStoreFilesUnchanged!==true||!isDeepStrictEqual(proof.originalStoreFootprint,body.sourceFootprint)))upgradeFail('RUNTIME_UPGRADE_ORIGINAL_CHANGED');
  if(!isDeepStrictEqual({path:proof.archive.path,sha256:proof.archive.sha256,byteLength:proof.archive.byteLength},body.liveArchive)||proof.archive.envelopeVersion!==3||proof.archive.metadataAuthenticated!==true)upgradeFail('RUNTIME_UPGRADE_BACKUP_INVALID');
  const archive=readUpgradeReference(body.liveArchive,scope.parent('.cache/runtime-backups'),256*1024*1024),decoded=BackupService.readEncryptedBackup(archive.file);
  runtimeUpgradeKey(decoded.keyId);
  if(decoded.envelopeVersion!==3||!decoded.metadataAuthenticated||decoded.keyId!==proof.archive.keyId||decoded.timestamp!==proof.archive.createdAt||!verifyPrivateRecovery(decoded.data).verified)upgradeFail('RUNTIME_UPGRADE_DATA_UNVERIFIED');
  const auth=readAuthRecoveryBarrier(decoded.data.authRecovery),holds=readRestoredWorkBarrier(decoded.data);
  if(!auth||sha(Buffer.from(auth.context))!==a.contextSha256||!holds||holds.heldCount!==body.originalHeldCount)upgradeFail('RUNTIME_UPGRADE_STATE_BINDING_CHANGED');
  assertRuntimeUpgradeHolds(decoded.data,decoded.data,true);
  return{body,original:decoded.data as DatabaseSchema,reference,source,metadata:{inputReference:reference,priorPreparation:body.priorPreparation,legacyArchive:body.legacyArchive,originalHeldCount:body.originalHeldCount,dataOriginOnly:true,heldWorkReleaseAllowed:false,accountOrFinancialAuthorityAssigned:false,acceptanceEligible:false}};
 }catch(error){if(error instanceof RuntimeUpgradeError)throw error;return upgradeFail('RUNTIME_UPGRADE_INPUT_VERIFICATION_REJECTED');}
}
export function loadRuntimeUpgradePreparation(report:any,options:RuntimeUpgradeScope,currentInputs:unknown){
 try{
  const scope=upgradeScope(options);if(!report.runtimeUpgrade||report.shadowReference!==undefined)upgradeFail('RUNTIME_UPGRADE_REPORT_INVALID');
  const receipt=readUpgradeReference(report.runtimeUpgrade.signedPrivateReceipt,scope.parent('.cache/application-recovery')).value();
  const body=verifyRuntimeUpgradePreparation(receipt,runtimeUpgradeKey(receipt?.body?.keyId).bytes);
  if(!isDeepStrictEqual(body.inputReference,report.runtimeUpgrade.inputReference)||body.reportSha256!==upgradeDigest(upgradeReportContent(report)))upgradeFail('RUNTIME_UPGRADE_PREPARATION_BINDING_CHANGED');
  const input=loadRuntimeUpgradeInput(body.inputReference,options);
  if(report.inputScope!==options.inputScope||report.status!=='RECOVERY_APPLICATION_PREPARED'||report.applicationBootEligible!==true||report.originalFilesPreserved!==true||report.liveSourceFilesPreserved!==true||report.allLiveFieldsPreserved!==true||report.auditVerified!==true||report.privateRecovery?.verified!==true||report.authPreparation?.freshLoginRequired!==true||report.accountOrFinancialAuthorityAssigned!==false||report.heldWorkReleaseAllowed!==false||report.financialAccountingVerified!==false||report.promoted!==false||report.rolloutAllowed!==false||report.authCutoverAllowed!==false||report.acceptanceEligible!==false||!isDeepStrictEqual(report.deployment,input.body.deployment)||!isDeepStrictEqual(report.sourceFootprint,input.body.sourceFootprint)||!isDeepStrictEqual(report.runtimeInputs,currentInputs)||!isDeepStrictEqual(report.legacyDisposition?.archiveReference??null,input.body.legacyArchive)||report.archivedWorkHold?.originalHeldCount!==input.body.originalHeldCount||report.archivedWorkHold?.allOriginalWorkHeld!==true)upgradeFail('RUNTIME_UPGRADE_PREPARATION_INVALID');
  const r=report.reconciliation,b=report.fixedBlock;
  if(!b||b.number!==input.original.syncState.lastIndexedBlock||b.hash!==input.original.syncState.lastIndexedBlockHash||!r||r.status!=='HEALTHY'||r.perOrderVerified!==true||r.coverageVerified!==true||r.onchainBalanceVerified!==true||r.conservationLawPassed!==true||r.blockNumber!==b.number||r.projectionBlock!==b.number||r.blockHash!==b.hash||!Array.isArray(r.discrepancies)||r.discrepancies.length)upgradeFail('RUNTIME_UPGRADE_FINANCIAL_PROOF_INVALID');
  readUpgradeReference(report.retainedDatabase,scope.parent('.cache/application-recovery'),256*1024*1024);
  containedUpgradePath(report.candidateDatabase.path,scope.parent('.cache/application-recovery'));
  return input;
 }catch(error){if(error instanceof RuntimeUpgradeError)throw error;return upgradeFail('RUNTIME_UPGRADE_PREPARATION_VERIFICATION_REJECTED');}
}
