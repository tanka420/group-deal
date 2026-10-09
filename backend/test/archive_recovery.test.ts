import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {config} from '../src/config';
import {TransactionalStore} from '../src/db/store';
import {BackupService} from '../src/services/backupService';
import {runRecoveryDrill,sourceFootprint} from '../src/services/recoveryDrillService';
import {prepareShadowCandidate} from '../src/services/shadowPreparation';
import {reviewLegacyData} from '../src/services/legacyDataReview';
import {loadVerifiedInternalTestArchive,internalTestArchiveProducerInputs,InternalTestArchiveRecoveryError} from '../src/services/internalTestArchiveRecovery';
import {parseInternalTestOrigin,assertInternalTestArchiveContent,signInternalTestArchiveReceipt} from '../src/domain/internalTestArchive';
import {readRestoredWorkBarrier,isRestoredWorkHeld} from '../src/domain/restoredWork';
import {prepareRecoveryApplication,admitRecoveryApplication,readRecoveryRuntimeSnapshotSource,RecoveryApplicationError} from '../src/services/recoveryApplication';
import {backupRuntimeStore} from '../src/services/runtimeBackup';
import {SessionRegistry,SessionError} from '../src/services/sessionService';
import {encryptionKey} from '../src/utils/crypto';
import {eventProvider} from './fixtures/events';
import {reconciliationProvider} from './fixtures/reconciliation';

const root=path.resolve(__dirname,'../..'),sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
const reference=(file:string)=>{const bytes=fs.readFileSync(file);return{path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(bytes),byteLength:bytes.length};};
const owned=()=>fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-test-archive-recovery-'));
const opened:TransactionalStore[]=[],open=(directory:string)=>{const db=new TransactionalStore(directory);opened.push(db);return db;};
let cases=0,ordinal=0,current='startup';const fromCase=Number(process.argv.find(a=>a.startsWith('--from='))?.slice(7)??1);
async function check(name:string,fn:()=>void|Promise<void>){if(++ordinal<fromCase)return;current=name;await fn();cases++;console.log('PASS archive recovery: '+name);}
function write(directory:string,name:string,value:unknown){const file=path.join(directory,name+'-'+crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return reference(file);}
function changed(directory:string,ref:{path:string},mutate:(value:any)=>void){const value=JSON.parse(fs.readFileSync(path.resolve(root,ref.path),'utf8'));mutate(value);return write(directory,'changed',value);}
const errorCode=(fn:()=>unknown,code:string)=>assert.throws(fn,e=>(e instanceof RecoveryApplicationError||e instanceof InternalTestArchiveRecoveryError)&&e.code===code);
async function fixture(unknown=false){
 const directory=owned(),sourceDirectory=path.join(directory,'source'),db=open(sourceDirectory);
 db.db.users.retained={id:'retained',email:'retained@example.test',roles:['buyer'],activeWallet:null,createdAt:Date.now(),loginMethod:'EVM_WALLET'};
 db.db.userByEmail['retained@example.test']='retained';
 db.db.campaigns.c={id:'c',onchainCampaignId:1,sellerId:'retained',sellerPayoutWallet:'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',status:'ACTIVE'} as any;
 db.db.orders.o={id:'o',onchainOrderId:1,campaignId:'c',buyerAccountId:'unknown_buyer',buyerPrincipal:'0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'} as any;
 db.db.emailOutbox.email={id:'email',userId:'retained',notificationId:'fixture',status:unknown?'UNKNOWN_FUTURE':'QUEUED',payload:{privateFixture:'old-email'}} as any;
 db.db.webhookQueue.queue={id:'queue',sellerId:'retained',status:'QUEUED',payload:{privateFixture:'old-webhook'}} as any;
 db.db.webhookDLQ.dlq={id:'dlq',sellerId:'retained',status:'DLQ',payload:{privateFixture:'old-dlq'}} as any;
 db.db.webhooks.retained={sellerId:'retained',active:false,url:'https://example.test/fixture',secret:''} as any;
 db.save();const oldToken=new SessionRegistry(db).issue(db.db.users.retained),state=db.snapshot();db.close();
 const chain=structuredClone(state);chain.orders={};chain.campaigns={};const provider={...eventProvider([]),...reconciliationProvider(chain,0n,3),getLogs:async()=>[]};
 const shadow=await prepareShadowCandidate({inputScope:'LOCAL_FIXTURE',migrationOnly:false,retainLegacy:true,sourceDirectory,privateParent:path.join(directory,'shadow'),reportDirectory:path.join(directory,'shadow-reports'),provider,verifyDeployment:async()=>{}});assert.notEqual(shadow.status,'REJECTED');
 const shadowReference=reference(path.resolve(root,shadow.path)),before=sourceFootprint(sourceDirectory);
 const origin={schemaVersion:1,classification:'INTERNAL_TEST',classificationScope:'LEGACY_ROWS_ONLY',declaredSource:'DIRECT_USER_REPLY',declaredAt:new Date().toISOString(),userStatement:'Dữ liệu thử nội bộ',sourceFootprint:before,records:[['CAMPAIGN','campaign','c'],['ORDER','order','o']].map(([kind,scope,id])=>({kind,reference:sha(Buffer.from('groupdeal:legacy-review:'+scope+':'+id))})),ownershipReassignmentAllowed:false,financialBindingAssignmentAllowed:false,heldWorkReleaseAllowed:false,applicationAdmissionAllowed:false};
 const originReference=write(directory,'origin',origin),recovered=await runRecoveryDrill({inputScope:'LOCAL_FIXTURE',sourceDirectory,privateParent:path.join(directory,'recovery'),reportDirectory:path.join(directory,'recovery-reports')});assert.equal(recovered.status,'RESTORE_DATA_VERIFIED_NO_PRIVATE_RESOURCE');
 const recoveryProof=reference(path.resolve(root,recovered.path)),archive=reference(path.resolve(root,recovered.report.backup.file)),decoded=BackupService.readEncryptedBackup(path.resolve(root,archive.path)),classification=assertInternalTestArchiveContent(parseInternalTestOrigin(origin,before),decoded.data,reviewLegacyData(decoded.data)),inputs=internalTestArchiveProducerInputs();
 const receipt=signInternalTestArchiveReceipt({version:1,purpose:'INTERNAL_TEST_ARCHIVE_PREPARATION',keyId:config.masterEncryptionKeyId,origin:originReference,sourceFootprint:before,archive,recoveryProof,sourceToolInputs:inputs,classificationScope:'LEGACY_ROWS_ONLY',originalRecordsPreserved:true,heldWorkReleaseAllowed:false,accountOrFinancialAuthorityAssigned:false,applicationAdmissionAllowed:false,acceptanceEligible:false},encryptionKey(config.masterEncryptionKeyId));
 const signedPrivateReceipt=write(directory,'receipt',receipt),archiveReport={schemaVersion:1,recordedAt:new Date().toISOString(),status:'INTERNAL_TEST_ARCHIVE_PREPARED_ADMISSION_PENDING',inputScope:'LOCAL_FIXTURE',origin:originReference,classification,shadowReference,sourceFootprint:before,toolInputs:inputs,recoveryProof,archive,signedPrivateReceipt,archiveEnvelopeVersion:3,archiveKeyId:config.masterEncryptionKeyId,currentOperatingKeyReadbackVerified:true,fullOriginalFieldsRestored:true,originalFilesPreserved:true,authCutoverAllowed:false,applicationBootEligible:false,heldWorkReleaseAllowed:false,workersStarted:false,financialBindingAssigned:false,acceptanceEligible:false};
 const archiveReference=write(directory,'archive-report',archiveReport),prepare={inputScope:'LOCAL_FIXTURE' as const,sourceDirectory,shadowReference,privateParent:path.join(directory,'applications'),reportDirectory:path.join(directory,'application-reports'),internalTestArchiveReference:archiveReference},verify={inputScope:'LOCAL_FIXTURE' as const,reference:archiveReference,sourceFootprint:before,shadowReference,retention:shadow.report.retention,fixtureRoot:directory};
 return{directory,sourceDirectory,oldToken,state,before,shadow,prepare,verify,archiveReference,archiveReport};
}
async function prepared(){const f=await fixture(),result=await prepareRecoveryApplication(f.prepare);assert.equal(result.status,'RECOVERY_APPLICATION_PREPARED');return{...f,result,admission:{inputScope:'LOCAL_FIXTURE' as const,reference:result,sourceDirectory:f.sourceDirectory,privateParent:f.prepare.privateParent}};}
async function main(){
 config.arcChainId=31337;config.deploymentBlock=1;config.protocolVersion=1;config.arcWsUrl='';
 for(const built of [false,true])await check((built?'emitted':'source')+' authenticated archive prepares and admits isolated storage with every old record held',async()=>{
  const f=await fixture(),api=built?require('../dist/services/recoveryApplication'):{prepareRecoveryApplication,admitRecoveryApplication};if(built)Object.assign(require('../dist/config').config,config);
  const result=await api.prepareRecoveryApplication(f.prepare);assert.equal(result.status,'RECOVERY_APPLICATION_PREPARED');assert.equal(result.report.retention.requiresLegacyAccessAndDependencyReview,true);assert.equal(result.report.legacyDisposition.classification.usersOrExternalWorkClassifiedAsTest,false);assert.equal(result.report.archivedWorkHold.originalHeldCount,4);assert.deepEqual(sourceFootprint(f.sourceDirectory),f.before);
  const archived=loadVerifiedInternalTestArchive(f.verify);assert.deepEqual(archived.original,f.state);const selected=api.admitRecoveryApplication({inputScope:'LOCAL_FIXTURE',reference:result,sourceDirectory:f.sourceDirectory,privateParent:f.prepare.privateParent});
  try{assert.equal(Object.keys(selected.database.db.orders).length,0);assert.equal(Object.keys(selected.database.db.campaigns).length,0);assert.deepEqual(selected.database.db.users.retained.roles,['buyer']);assert.equal(readRestoredWorkBarrier(selected.database.db)?.heldCount,4);for(const [collection,id] of [['emailOutbox','email'],['webhookQueue','queue'],['webhookDLQ','dlq'],['webhooks','retained']] as const)assert.equal(isRestoredWorkHeld(selected.database.db,collection,id),true);assert.throws(()=>new SessionRegistry(selected.database).authenticate(f.oldToken),e=>e instanceof SessionError&&e.code==='AUTH_SESSION_INACTIVE');assert.equal(selected.metadata.workersStarted,false);assert.deepEqual(sourceFootprint(f.sourceDirectory),f.before);}finally{selected.close();}
 });
 await check('metadata, receipt, origin, recovery, tools, ciphertext and private path substitutions fail closed',async()=>{
  const f=await fixture();
  const edits:[(value:any)=>void,string][]=[
   [r=>{r.heldWorkReleaseAllowed=true;},'INTERNAL_TEST_ARCHIVE_SCOPE_INVALID'],
   [r=>{r.sourceFootprint[0].sha256='0'.repeat(64);},'INTERNAL_TEST_ARCHIVE_SOURCE_OR_SHADOW_CHANGED'],
   [r=>{r.shadowReference.sha256='0'.repeat(64);},'INTERNAL_TEST_ARCHIVE_SOURCE_OR_SHADOW_CHANGED'],
   [r=>{r.origin.sha256='0'.repeat(64);},'INTERNAL_TEST_ARCHIVE_RECEIPT_BINDING_CHANGED'],
   [r=>{r.recoveryProof.sha256='0'.repeat(64);},'INTERNAL_TEST_ARCHIVE_RECEIPT_BINDING_CHANGED'],
   [r=>{r.toolInputs[0].sha256='0'.repeat(64);},'INTERNAL_TEST_ARCHIVE_TOOLS_CHANGED'],
   [r=>{r.archive.sha256='0'.repeat(64);},'INTERNAL_TEST_ARCHIVE_RECEIPT_BINDING_CHANGED'],
   [r=>{r.signedPrivateReceipt.path='../receipt.json';},'INTERNAL_TEST_ARCHIVE_REFERENCE_INVALID'],
   [r=>{r.signedPrivateReceipt=changed(f.directory,r.signedPrivateReceipt,v=>{v.mac='0'.repeat(64);});},'INTERNAL_TEST_ARCHIVE_RECEIPT_INVALID'],
   [r=>{r.signedPrivateReceipt=changed(f.directory,r.signedPrivateReceipt,v=>{v.body.keyId='legacy';});},'INTERNAL_TEST_ARCHIVE_KEY_UNAVAILABLE'],
   [r=>{r.signedPrivateReceipt=changed(f.directory,r.signedPrivateReceipt,v=>{v.body.keyId='missing-fixture-key';});},'INTERNAL_TEST_ARCHIVE_KEY_UNAVAILABLE']
  ];for(const [mutate,code] of edits)errorCode(()=>loadVerifiedInternalTestArchive({...f.verify,reference:changed(f.directory,f.archiveReference,mutate)}),code);
  const file=path.resolve(root,f.archiveReport.archive.path),before=fs.readFileSync(file);try{fs.appendFileSync(file,'fixture-corruption');errorCode(()=>loadVerifiedInternalTestArchive(f.verify),'INTERNAL_TEST_ARCHIVE_REFERENCE_CHANGED');}finally{fs.writeFileSync(file,before);}
  errorCode(()=>loadVerifiedInternalTestArchive({...f.verify,fixtureRoot:path.join(root,'backend/data')}),'INTERNAL_TEST_ARCHIVE_FIXTURE_DISABLED');
 });
 await check('missing or unsigned archive cannot clear legacy preparation and admission gates',async()=>{
  const f=await fixture(),{internalTestArchiveReference,...missing}=f.prepare;const a=await prepareRecoveryApplication(missing);assert.equal(a.report.failureCode,'RECOVERY_APPLICATION_LEGACY_REVIEW_REQUIRED');
  const invalid=changed(f.directory,f.archiveReference,r=>{r.signedPrivateReceipt.sha256='0'.repeat(64);}),b=await prepareRecoveryApplication({...f.prepare,internalTestArchiveReference:invalid});assert.equal(b.report.failureCode,'INTERNAL_TEST_ARCHIVE_REFERENCE_CHANGED');assert.equal(b.applicationBootEligible,false);
  const p=await prepareRecoveryApplication(f.prepare);assert.equal(p.status,'RECOVERY_APPLICATION_PREPARED');const admission={inputScope:'LOCAL_FIXTURE' as const,reference:p,sourceDirectory:f.sourceDirectory,privateParent:f.prepare.privateParent};
  errorCode(()=>admitRecoveryApplication({...admission,reference:changed(f.directory,p,r=>{r.retention.requiresLegacyAccessAndDependencyReview=false;r.retention.legacyCampaigns=0;r.retention.legacyOrders=0;delete r.legacyDisposition;})}),'RECOVERY_APPLICATION_RETENTION_CHANGED');
  errorCode(()=>admitRecoveryApplication({...admission,reference:changed(f.directory,p,r=>{delete r.legacyDisposition;})}),'RECOVERY_APPLICATION_LEGACY_REVIEW_REQUIRED');
 });
 await check('altered initial candidate roles cannot gain authority through a recomputed public proof',async()=>{
  const p=await prepared(),file=path.resolve(root,p.result.report.candidateDatabase.path),db=open(path.dirname(file));db.transaction(()=>{db.db.users.retained.roles.push('operator');});db.close();
  const substituted=changed(p.directory,p.result,r=>{r.candidateDatabase=reference(file);});errorCode(()=>admitRecoveryApplication({...p.admission,reference:substituted}),'INTERNAL_TEST_ARCHIVE_OFFCHAIN_RECORD_CHANGED');assert.deepEqual(sourceFootprint(p.sourceDirectory),p.before);
 });
 await check('restart and snapshot backup reject removal of any original hold; new work remains usable',async()=>{
  const p=await prepared(),first=admitRecoveryApplication(p.admission),snapshot=first.database.snapshot(),resolver=readRecoveryRuntimeSnapshotSource(p.admission);resolver.verifyCopiedState(snapshot);
  const originalBarrier=structuredClone(snapshot.restoredWork),empty=structuredClone(snapshot);empty.restoredWork!.current.entries={};empty.restoredWork!.current.heldCount=0;errorCode(()=>resolver.verifyCopiedState(empty),'RECOVERY_APPLICATION_ARCHIVED_HOLD_CHANGED');
  first.database.transaction(()=>{first.database.db.restoredWork!.current.entries={};first.database.db.restoredWork!.current.heldCount=0;});first.close();
  errorCode(()=>admitRecoveryApplication(p.admission),'RECOVERY_APPLICATION_ARCHIVED_HOLD_CHANGED');
  const previousMode=process.env.GROUPDEAL_RECOVERY_MODE;try{process.env.GROUPDEAL_RECOVERY_MODE='1';const backup=backupRuntimeStore({inputScope:'LOCAL_FIXTURE',recovery:p.admission,privateParent:path.join(p.directory,'runtime-backups'),reportDirectory:path.join(p.directory,'runtime-reports')});assert.equal(backup.status,'REJECTED');assert.equal(backup.report.failureCode,'RECOVERY_APPLICATION_ARCHIVED_HOLD_CHANGED');assert.equal(backup.report.archive,undefined);}finally{if(previousMode===undefined)delete process.env.GROUPDEAL_RECOVERY_MODE;else process.env.GROUPDEAL_RECOVERY_MODE=previousMode;}
  const db=open(path.dirname(path.resolve(root,p.result.report.candidateDatabase.path)));db.transaction(()=>{db.db.restoredWork=originalBarrier;db.db.emailOutbox.new={id:'new',userId:'retained',notificationId:'new',status:'QUEUED'} as any;db.db.notificationPreferences.retained={email:false,inApp:true};});db.close();
  const next=admitRecoveryApplication(p.admission);try{assert.equal(next.metadata.restartFromLivePrivateDatabase,true);assert.equal(next.database.db.notificationPreferences.retained.email,false);assert.equal(isRestoredWorkHeld(next.database.db,'emailOutbox','new'),false);assert.equal(readRestoredWorkBarrier(next.database.db)?.heldCount,4);readRecoveryRuntimeSnapshotSource(p.admission).verifyCopiedState(next.database.snapshot());}finally{next.close();}
 });
 await check('retained operating keys verify archives after rotation; missing archive key rejects before opening storage',async()=>{
  const p=await prepared(),first=admitRecoveryApplication(p.admission);first.close();const prior={id:config.masterEncryptionKeyId,key:config.masterEncryptionKey,keys:config.previousEncryptionKeys},file=path.resolve(root,p.result.report.candidateDatabase.path),before=fs.readFileSync(file);
  try{config.masterEncryptionKeyId='rotated-archive-fixture';config.masterEncryptionKey=crypto.randomBytes(32).toString('hex');config.previousEncryptionKeys={};errorCode(()=>admitRecoveryApplication(p.admission),'INTERNAL_TEST_ARCHIVE_KEY_UNAVAILABLE');assert.deepEqual(fs.readFileSync(file),before);config.previousEncryptionKeys={[prior.id]:prior.key};const next=admitRecoveryApplication(p.admission);try{assert.equal(next.metadata.restartFromLivePrivateDatabase,true);assert.equal(readRestoredWorkBarrier(next.database.db)?.heldCount,4);}finally{next.close();}}finally{config.masterEncryptionKeyId=prior.id;config.masterEncryptionKey=prior.key;config.previousEncryptionKeys=prior.keys;}
 });
 await check('archived test provenance never permits an unknown external job status',async()=>{const f=await fixture(true),result=await prepareRecoveryApplication(f.prepare);assert.equal(result.status,'REJECTED');assert.equal(result.report.failureCode,'RECOVERY_APPLICATION_RESTORED_WORK_REVIEW_REQUIRED');assert.equal(result.report.restoredExternalWork.unknownStatus,1);});
 console.log('PASS '+cases+' archive recovery cases; isolated fixtures only, no original SQLite driver, network or old-work release.');
}
void main().catch(error=>{console.error('FAIL archive recovery; private values withheld');console.error(JSON.stringify({case:current,code:error instanceof RecoveryApplicationError||error instanceof InternalTestArchiveRecoveryError?error.code:'LOCAL_ASSERTION_OR_STORAGE',frames:error instanceof Error?error.stack?.split(/\r?\n/).filter(l=>/^\s+at /.test(l)).slice(0,3):[]}));process.exitCode=1;}).finally(()=>{for(const db of opened)try{db.close();}catch{}});
