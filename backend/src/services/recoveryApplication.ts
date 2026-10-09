import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {TransactionalStore} from '../db/store';
import {config} from '../config';
import {privateRecoveryDirectory,copyStableDatabase,sourceFootprint,verifyPrivateRecovery} from './recoveryDrillService';
import {shadowPreparationInputs} from './shadowPreparation';
import {stageRecoverySessionBarrier} from './recoverySessionBarrier';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {assertProjectionScope} from './projectionScope';
import {BackupService} from './backupService';
import {restoredExternalWorkSummary} from './restoredWorkReview';
import {readRestoredWorkBarrier} from '../domain/restoredWork';
import {loadVerifiedInternalTestArchive,assertArchivedProjectionPreserved,InternalTestArchiveRecoveryError} from './internalTestArchiveRecovery';
import {assertArchivedWorkHeld} from '../domain/recoveredWorkHoldPolicy';
import {loadRuntimeUpgradePreparation} from './runtimeUpgradeSource';
import {assertRuntimeUpgradeHolds} from '../domain/runtimeUpgrade';

const root=path.resolve(__dirname,'../../..'),sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
type Reference={path:string;sha256:string;byteLength:number};
type Scope='EXISTING_DATA'|'LOCAL_FIXTURE';
export class RecoveryApplicationError extends Error{constructor(public readonly code:string){super(code);}}
const fail=(code:string):never=>{throw new RecoveryApplicationError(code);};
const deployment=()=>({chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,deploymentBlock:config.deploymentBlock});
const json=(file:string,max=2*1024*1024)=>{if(!fs.lstatSync(file).isFile()||fs.statSync(file).size>max)fail('RECOVERY_APPLICATION_FILE_INVALID');return JSON.parse(fs.readFileSync(file,'utf8'));};
function reference(ref:Reference){const file=path.resolve(root,ref.path);if(!fs.lstatSync(file).isFile()||!Number.isSafeInteger(ref.byteLength)||ref.byteLength<1||ref.byteLength>2*1024*1024||!/^[a-f0-9]{64}$/.test(ref.sha256))fail('RECOVERY_APPLICATION_REFERENCE_INVALID');const bytes=fs.readFileSync(file);if(bytes.length!==ref.byteLength||sha(bytes)!==ref.sha256)fail('RECOVERY_APPLICATION_REFERENCE_CHANGED');return JSON.parse(bytes.toString());}
function contained(value:string,parent:string){const file=path.resolve(root,value),base=fs.realpathSync(parent),real=fs.realpathSync(file),relative=path.relative(base,real);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!fs.lstatSync(file).isFile())fail('RECOVERY_APPLICATION_PATH_INVALID');return file;}
function fileRef(file:string):Reference{const bytes=fs.readFileSync(file);return{path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(bytes),byteLength:bytes.length};}
function verifyDatabase(ref:Reference){const file=path.resolve(root,ref.path);if(!fs.lstatSync(file).isFile()||fs.statSync(file).size!==ref.byteLength||sha(fs.readFileSync(file))!==ref.sha256)fail('RECOVERY_APPLICATION_DATABASE_CHANGED');return file;}

/** Pins both source and emitted application files; plaintext runtime data/env/credentials are excluded. */
export function recoveryApplicationInputs(){
 const paths:string[]=[];
 const walk=(directory:string,extension:string)=>{for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){const file=directory+'/'+entry.name;if(entry.isDirectory())walk(file,extension);else if(entry.isFile()&&file.endsWith(extension))paths.push(file);}};
 walk('backend/src','.ts');walk('backend/dist','.js');
 paths.push('backend/scripts/prepareRuntimeUpgradeInput.ts','backend/scripts/prepareRuntimeUpgradeApplication.ts','backend/scripts/prepareRecoveryApplication.ts','backend/scripts/prepareInternalTestArchive.ts','backend/package-lock.json','shared/contracts.json','shared/manifests/arc-testnet.json','shared/domain.cjs','shared/catalogQuery.mjs','shared/evidence.mjs','shared/publicSeller.mjs','shared/publicWidget.mjs','shared/sellerProfileIntent.mjs','shared/operatorBadge.mjs');
 for(const file of ['backend/dist/index.js','backend/dist/services/recoveryApplication.js'])if(!paths.includes(file))fail('RECOVERY_APPLICATION_BUILD_REQUIRED');
 return paths.sort().map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
}
function legacyRequired(proof:any){return !!(proof.retention?.requiresLegacyAccessAndDependencyReview||proof.retention?.legacyOrders||proof.retention?.legacyCampaigns);}
function validateShadowProof(ref:Reference,scope:Scope,before:unknown){
 if(scope==='EXISTING_DATA')contained(ref.path,path.join(root,'reports/evidence/shadow-preparation'));
 const proof=reference(ref);
 if(proof.inputScope!==scope||!['REBUILD_VERIFIED','CURRENT_DEPLOYMENT_REBUILD_VERIFIED_LEGACY_RETAINED'].includes(proof.status)||proof.currentDeploymentFinancialProjectionVerified!==true||proof.originalFilesPreserved!==true||proof.retainedOriginalFieldsPreserved!==true||proof.offchainRecordsPreserved!==true||proof.promoted!==false||proof.rolloutAllowed!==false||proof.authCutoverAllowed!==false||proof.acceptanceEligible!==false||!isDeepStrictEqual(proof.deployment,deployment()))fail('RECOVERY_APPLICATION_SHADOW_SCOPE_INVALID');
 if(!isDeepStrictEqual(proof.toolInputs,shadowPreparationInputs()))fail('RECOVERY_APPLICATION_SHADOW_TOOLS_CHANGED');
 if(!isDeepStrictEqual(proof.sourceFootprint,before))fail('RECOVERY_APPLICATION_SOURCE_CHANGED');
 const r=proof.reconciliation;if(!r||r.status!=='HEALTHY'||!r.perOrderVerified||!r.coverageVerified||!r.onchainBalanceVerified||!r.conservationLawPassed||r.blockNumber!==proof.fixedBlock?.number||r.projectionBlock!==r.blockNumber||r.blockHash!==proof.fixedBlock.hash||r.discrepancies.length)fail('RECOVERY_APPLICATION_FINANCIAL_PROOF_INVALID');
 return proof;
}
function verifiedArchive(scope:Scope,ref:Reference,before:unknown,shadow:Reference,retention:any,source:string){return loadVerifiedInternalTestArchive({inputScope:scope,reference:ref,sourceFootprint:before,shadowReference:shadow,retention,...scope==='LOCAL_FIXTURE'?{fixtureRoot:path.dirname(source)}:{}});}
function archivedHolds(state:TransactionalStore['db'],original:TransactionalStore['db'],initial=false){try{return assertArchivedWorkHeld(state,original,initial);}catch{fail('RECOVERY_APPLICATION_ARCHIVED_HOLD_CHANGED');}}
type PrepareOptions={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';shadowReference:Reference;sourceDirectory:string;privateParent:string;reportDirectory:string;internalTestArchiveReference?:Reference};
export async function prepareRecoveryApplication(options:PrepareOptions){
 if(options.inputScope==='EXISTING_DATA'&&Object.keys(options).some(k=>k!=='inputScope'))fail('RECOVERY_APPLICATION_SCOPE_OVERRIDE_DISABLED');
 if(options.inputScope!=='EXISTING_DATA'&&(options.inputScope!=='LOCAL_FIXTURE'||process.env.NODE_ENV!=='test'))fail('RECOVERY_APPLICATION_FIXTURE_DISABLED');
 const source=options.inputScope==='EXISTING_DATA'?path.join(root,'backend/data'):options.sourceDirectory,before=sourceFootprint(source),parent=options.inputScope==='EXISTING_DATA'?path.join(root,'.cache/application-recovery'):options.privateParent,directory=privateRecoveryDirectory(parent);
 const report:Record<string,any>={schemaVersion:1,recordedAt:new Date().toISOString(),inputScope:options.inputScope,status:'UNVERIFIED',deployment:deployment(),sourceFootprint:before,targetDirectory:path.relative(root,directory).replaceAll('\\','/'),applicationBootEligible:false,promoted:false,rolloutAllowed:false,authCutoverAllowed:false,acceptanceEligible:false,financialAccountingVerified:false};
 let copied:TransactionalStore|undefined;
 try{
  report.runtimeInputs=recoveryApplicationInputs();
  const ref=options.inputScope==='EXISTING_DATA'?json(path.join(root,'reports/evidence/SHADOW_PREPARATION_LATEST.json'),8192):options.shadowReference;
  const proof=validateShadowProof(ref,options.inputScope,before);report.shadowReference=ref;
  report.fixedBlock=proof.fixedBlock;report.originalCounts=proof.originalCounts;report.retention=proof.retention;
  let archive:ReturnType<typeof loadVerifiedInternalTestArchive>|undefined;
  if(legacyRequired(proof)){
   const archivePointer=path.join(root,'reports/evidence/INTERNAL_TEST_ARCHIVE_LATEST.json'),archiveRef=options.inputScope==='EXISTING_DATA'?(fs.existsSync(archivePointer)?json(archivePointer,8192):undefined):options.internalTestArchiveReference;
   if(!archiveRef)fail('RECOVERY_APPLICATION_LEGACY_REVIEW_REQUIRED');
   archive=verifiedArchive(options.inputScope,archiveRef,before,ref,proof.retention,source);report.legacyDisposition=archive.metadata;
  }
  if(options.inputScope==='EXISTING_DATA'){contained(proof.projectionDatabase.path,path.join(root,'.cache/shadow-databases'));contained(proof.retainedDatabase.path,path.join(root,'.cache/shadow-databases'));}
  const database=verifyDatabase(proof.projectionDatabase);verifyDatabase(proof.retainedDatabase);
  copyStableDatabase(path.dirname(database),path.join(directory,'input'));copied=new TransactionalStore(path.join(directory,'input'));assertProjectionScope(copied.db);
  if(!copied.verifyAuditLogIntegrity().valid||!verifyPrivateRecovery(copied.db).verified)fail('RECOVERY_APPLICATION_PRIVATE_OR_AUDIT_INVALID');
  if(archive)assertArchivedProjectionPreserved(archive.original,copied.db);
  const externalWork=restoredExternalWorkSummary(copied.db);report.restoredExternalWork=externalWork;
  if(externalWork.unknownStatus||externalWork.requiresReview&&!archive)fail('RECOVERY_APPLICATION_RESTORED_WORK_REVIEW_REQUIRED');
  const prepared=stageRecoverySessionBarrier(copied,path.join(directory,'staging'));report.authPreparation=prepared.metadata;
  if(archive){const staged=new TransactionalStore(prepared.candidateDirectory);try{assertArchivedProjectionPreserved(archive.original,staged.db,true);report.archivedWorkHold=archivedHolds(staged.db,archive.original,true);}finally{staged.close();}}
  report.candidateDatabase=fileRef(path.join(prepared.candidateDirectory,'groupdeal.sqlite'));report.retainedDatabase=fileRef(path.join(prepared.retainedDirectory,'groupdeal.sqlite'));
  report.status='RECOVERY_APPLICATION_PREPARED';report.applicationBootEligible=true;
 }catch(error){report.status='REJECTED';report.failureCode=error instanceof RecoveryApplicationError||error instanceof InternalTestArchiveRecoveryError?error.code:'RECOVERY_APPLICATION_PREPARATION_REJECTED';report.applicationBootEligible=false;}
 finally{copied?.close();}
 report.originalFilesPreserved=isDeepStrictEqual(before,sourceFootprint(source));if(!report.originalFilesPreserved){report.status='REJECTED';report.failureCode='RECOVERY_APPLICATION_SOURCE_CHANGED';report.applicationBootEligible=false;}
 if(report.runtimeInputs&&!isDeepStrictEqual(report.runtimeInputs,recoveryApplicationInputs())){report.status='REJECTED';report.failureCode='RECOVERY_APPLICATION_RUNTIME_CHANGED';report.applicationBootEligible=false;}
 const reports=options.inputScope==='EXISTING_DATA'?path.join(root,'reports/evidence/application-recovery'):options.reportDirectory;fs.mkdirSync(reports,{recursive:true});const file=path.join(reports,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});const pointer={schemaVersion:1,...fileRef(file),status:report.status,inputScope:options.inputScope,applicationBootEligible:report.applicationBootEligible,acceptanceEligible:false};
 fs.writeFileSync(path.join(directory,'PREPARATION.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});if(options.inputScope==='EXISTING_DATA'){const latest=path.join(root,'reports/evidence/RECOVERY_APPLICATION_LATEST.json'),temp=latest+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(pointer,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,latest);}return{...pointer,report,directory};
}

type AdmissionOptions={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';reference:Reference;sourceDirectory:string;privateParent:string};
const mac=(body:unknown,key:string)=>crypto.createHmac('sha256',key).update('groupdeal:recovery-admission:v1:'+JSON.stringify(body)).digest('hex');
function receiptKey(id:unknown):string{if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(id))throw new RecoveryApplicationError('RECOVERY_APPLICATION_ADMISSION_INVALID');const key=id===config.masterEncryptionKeyId?config.masterEncryptionKey:Object.prototype.hasOwnProperty.call(config.previousEncryptionKeys,id)?config.previousEncryptionKeys[id]:undefined;if(!key)throw new RecoveryApplicationError('RECOVERY_APPLICATION_ADMISSION_INVALID');return key;}
function verifyReceipt(value:any,ref:Reference,initial:Reference){if(!value||!value.body||typeof value.mac!=='string'||!/^[a-f0-9]{64}$/.test(value.mac)||!crypto.timingSafeEqual(Buffer.from(value.mac,'hex'),Buffer.from(mac(value.body,receiptKey(value.body.keyId)),'hex'))||value.body.version!==1||!['PREPARED','COMMITTED'].includes(value.body.phase)||!isDeepStrictEqual(value.body.proof,{path:ref.path,sha256:ref.sha256,byteLength:ref.byteLength})||value.body.initialDatabaseSha256!==initial.sha256||!/^[a-f0-9]{64}$/.test(value.body.contextSha256)||!/^[a-f0-9]{64}$/.test(value.body.previousContextSha256))fail('RECOVERY_APPLICATION_ADMISSION_INVALID');return value.body;}
function writeReceipt(file:string,body:unknown){const temp=file+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({body,mac:mac(body,config.masterEncryptionKey)},null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(fs.existsSync(file))fs.copyFileSync(file,path.join(path.dirname(file),'ADMISSION_PREVIOUS_'+crypto.randomUUID()+'.json'),fs.constants.COPYFILE_EXCL);fs.renameSync(temp,file);}
function lease(directory:string){
 const file=path.join(directory,'RECOVERY_RUNNING.json'),token=crypto.randomUUID();
 const acquire=()=>fs.writeFileSync(file,JSON.stringify({pid:process.pid,token})+'\n',{flag:'wx',mode:0o600});
 try{acquire();}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const previous=json(file,4096);if(!Number.isSafeInteger(previous.pid)||previous.pid<1||typeof previous.token!=='string')fail('RECOVERY_APPLICATION_LEASE_INVALID');try{process.kill(previous.pid,0);fail('RECOVERY_APPLICATION_ALREADY_RUNNING');}catch(observation){if(!(observation instanceof RecoveryApplicationError)&&(observation as NodeJS.ErrnoException).code==='ESRCH'){fs.renameSync(file,path.join(directory,'STALE_RECOVERY_LEASE_'+crypto.randomUUID()+'.json'));acquire();}else fail('RECOVERY_APPLICATION_ALREADY_RUNNING');}}
 return()=>{if(fs.existsSync(file)&&json(file,4096).token===token)fs.unlinkSync(file);};
}
function applicationReadiness(options:AdmissionOptions){
 if(options.inputScope==='EXISTING_DATA'&&Object.keys(options).some(k=>k!=='inputScope'))fail('RECOVERY_APPLICATION_SCOPE_OVERRIDE_DISABLED');
 if(options.inputScope!=='EXISTING_DATA'&&(options.inputScope!=='LOCAL_FIXTURE'||process.env.NODE_ENV!=='test'))fail('RECOVERY_APPLICATION_FIXTURE_DISABLED');
 const ref=options.inputScope==='EXISTING_DATA'?json(path.join(root,'reports/evidence/RECOVERY_APPLICATION_LATEST.json'),8192):options.reference,source=options.inputScope==='EXISTING_DATA'?path.join(root,'backend/data'):options.sourceDirectory,parent=options.inputScope==='EXISTING_DATA'?path.join(root,'.cache/application-recovery'):options.privateParent;
 if(options.inputScope==='EXISTING_DATA')contained(ref.path,path.join(root,'reports/evidence/application-recovery'));
 const report=reference(ref);
 if(report.inputScope!==options.inputScope||report.status!=='RECOVERY_APPLICATION_PREPARED'||report.applicationBootEligible!==true||report.promoted!==false||report.authCutoverAllowed!==false||report.acceptanceEligible!==false||report.rolloutAllowed!==false||!report.authPreparation?.freshLoginRequired||!isDeepStrictEqual(report.deployment,deployment()))fail('RECOVERY_APPLICATION_NOT_ADMITTED');
 if(!isDeepStrictEqual(report.runtimeInputs,recoveryApplicationInputs()))fail('RECOVERY_APPLICATION_RUNTIME_CHANGED');
 if(!isDeepStrictEqual(report.sourceFootprint,sourceFootprint(source)))fail('RECOVERY_APPLICATION_SOURCE_CHANGED');
 let archive:ReturnType<typeof loadVerifiedInternalTestArchive>|undefined;
 let upgradeOrigin:ReturnType<typeof loadRuntimeUpgradePreparation>|undefined;
 if(report.runtimeUpgrade!==undefined){
  upgradeOrigin=loadRuntimeUpgradePreparation(report,options.inputScope==='EXISTING_DATA'?{inputScope:'EXISTING_DATA'}:{inputScope:'LOCAL_FIXTURE',fixtureRoot:path.dirname(source),sourceDirectory:source},recoveryApplicationInputs());
 }else{
 // Re-read the pinned native shadow: mutating a preparation report cannot remove the legacy gate.
 const shadow=validateShadowProof(report.shadowReference,options.inputScope,report.sourceFootprint);
 if(!isDeepStrictEqual(report.retention,shadow.retention)||!isDeepStrictEqual(report.fixedBlock,shadow.fixedBlock))fail('RECOVERY_APPLICATION_RETENTION_CHANGED');
 if(legacyRequired(shadow)){
  if(!report.legacyDisposition?.archiveReference)fail('RECOVERY_APPLICATION_LEGACY_REVIEW_REQUIRED');
  archive=verifiedArchive(options.inputScope,report.legacyDisposition.archiveReference,report.sourceFootprint,report.shadowReference,shadow.retention,source);
  if(!isDeepStrictEqual(report.legacyDisposition,archive.metadata))fail('RECOVERY_APPLICATION_ARCHIVE_DISPOSITION_CHANGED');
 }else if(report.legacyDisposition!==undefined)fail('RECOVERY_APPLICATION_ARCHIVE_DISPOSITION_CHANGED');
 }
 const database=contained(report.candidateDatabase.path,parent);
 return{ref,report,source,database,directory:path.dirname(database),archive,upgradeOrigin};
}
/** A read-only resolver for backup tools; it never acquires a lease or refreshes authentication. */
export function readRecoveryRuntimeSnapshotSource(options:AdmissionOptions){
 const {ref,report,source,directory,archive,upgradeOrigin}=applicationReadiness(options),receiptFile=path.join(directory,'ADMISSION.json');
 if(!fs.existsSync(receiptFile))throw new RecoveryApplicationError('RECOVERY_APPLICATION_RUNTIME_NOT_STARTED');
 const receiptReference=fileRef(receiptFile),body=verifyReceipt(json(receiptFile,8192),ref,report.candidateDatabase);
 if(body.phase!=='COMMITTED')throw new RecoveryApplicationError('RECOVERY_APPLICATION_RUNTIME_NOT_COMMITTED');
 return{directory,preparationReference:ref,receiptReference,verifyCopiedState:(state:TransactionalStore['db'])=>{assertProjectionScope(state);readRestoredWorkBarrier(state);if(archive)archivedHolds(state,archive.original);if(upgradeOrigin)assertRuntimeUpgradeHolds(state,upgradeOrigin.original);const barrier=readAuthRecoveryBarrier(state.authRecovery);if(!barrier||sha(Buffer.from(barrier.context))!==body.contextSha256)throw new RecoveryApplicationError('RECOVERY_APPLICATION_AUTH_BARRIER_CHANGED');},verifyUnchanged:()=>{if(!isDeepStrictEqual(report.sourceFootprint,sourceFootprint(source)))throw new RecoveryApplicationError('RECOVERY_APPLICATION_SOURCE_CHANGED');if(!isDeepStrictEqual(report.runtimeInputs,recoveryApplicationInputs()))throw new RecoveryApplicationError('RECOVERY_APPLICATION_RUNTIME_CHANGED');if(!isDeepStrictEqual(fileRef(receiptFile),receiptReference))throw new RecoveryApplicationError('RECOVERY_APPLICATION_RECEIPT_CHANGED');if(archive||upgradeOrigin){const again=applicationReadiness(options);if(!isDeepStrictEqual(again.ref,ref)||!isDeepStrictEqual(again.archive?.metadata,archive?.metadata)||!isDeepStrictEqual(again.upgradeOrigin?.metadata,upgradeOrigin?.metadata))fail('RECOVERY_APPLICATION_ARCHIVE_DISPOSITION_CHANGED');}}};
}
/** Restart reads the live private DB; it never reimports the original snapshot or silently seeds. */
export function admitRecoveryApplication(options:AdmissionOptions){
 const {ref,report,directory,archive,upgradeOrigin}=applicationReadiness(options),receiptFile=path.join(directory,'ADMISSION.json'),release=lease(directory);let candidate:TransactionalStore|undefined;
 try{
  const body=fs.existsSync(receiptFile)?verifyReceipt(json(receiptFile,8192),ref,report.candidateDatabase):undefined;
  if(!body)verifyDatabase(report.candidateDatabase);
  candidate=new TransactionalStore(directory);assertProjectionScope(candidate.db);if(!candidate.verifyAuditLogIntegrity().valid||!verifyPrivateRecovery(candidate.db).verified)fail('RECOVERY_APPLICATION_PRIVATE_OR_AUDIT_INVALID');
  readRestoredWorkBarrier(candidate.db);
  if(archive){if(!body)assertArchivedProjectionPreserved(archive.original,candidate.db,true);archivedHolds(candidate.db,archive.original,!body);}
  if(upgradeOrigin){if(!body&&!isDeepStrictEqual(candidate.snapshot(),upgradeOrigin.original))fail('RECOVERY_APPLICATION_UPGRADE_RESTORE_CHANGED');assertRuntimeUpgradeHolds(candidate.db,upgradeOrigin.original,!body);}
  const barrier=readAuthRecoveryBarrier(candidate.db.authRecovery);if(!barrier)throw new RecoveryApplicationError('RECOVERY_APPLICATION_AUTH_BARRIER_CHANGED');if(body&&body.contextSha256!==sha(Buffer.from(barrier.context))&&!(body.phase==='PREPARED'&&body.previousContextSha256===sha(Buffer.from(barrier.context))))fail('RECOVERY_APPLICATION_AUTH_BARRIER_CHANGED');
  // Archive every live pre-boot state before replacing only transient authentication authority.
  const startupArchive=path.join(directory,'startup-backups');fs.mkdirSync(startupArchive,{recursive:true});BackupService.createEncryptedBackup(startupArchive,candidate);
  const context=crypto.randomBytes(32).toString('base64url'),next={version:1,keyId:config.masterEncryptionKeyId,phase:'PREPARED',proof:{path:ref.path,sha256:ref.sha256,byteLength:ref.byteLength},initialDatabaseSha256:report.candidateDatabase.sha256,contextSha256:sha(Buffer.from(context)),previousContextSha256:sha(Buffer.from(barrier.context))};writeReceipt(receiptFile,next);
  candidate.transaction(()=>{candidate!.db.authRecovery={current:{version:1,context,createdAt:Date.now()}};candidate!.db.emailOtps={};candidate!.db.walletChallenges={};candidate!.db.circleLoginAttempts={};for(const name of ['walletBindingIntents','sellerProfileIntents'] as const)for(const intent of Object.values(candidate!.db[name]))if(intent.state==='PENDING'){intent.state='CANCELLED';intent.cancelledAt=Date.now();}for(const user of Object.values(candidate!.db.users))if(user.contact?.pending?.state==='PENDING')user.contact.pending.state='CANCELLED';candidate!.addAuditLog('recovery','operator','RECOVERY_APPLICATION_AUTH_REFRESHED',{freshLoginRequired:true,financialPrincipalsChanged:false});});writeReceipt(receiptFile,{...next,phase:'COMMITTED'});
  const selected=candidate;let closed=false;return{database:selected,metadata:{scope:'RECOVERY_APPLICATION_STORAGE_ADMITTED',freshLoginRequired:true,restartFromLivePrivateDatabase:!!body,financialAccountingVerified:false,workersStarted:false,acceptanceEligible:false},close:()=>{if(closed)return;closed=true;selected.close();release();}};
 }catch(error){candidate?.close();release();throw error;}
}

export function selectRecoveryApplication(environment:NodeJS.ProcessEnv=process.env){if(environment.GROUPDEAL_RECOVERY_MODE===undefined)return undefined;if(environment.GROUPDEAL_RECOVERY_MODE!=='1')fail('RECOVERY_APPLICATION_MODE_INVALID');return admitRecoveryApplication({inputScope:'EXISTING_DATA'});}
