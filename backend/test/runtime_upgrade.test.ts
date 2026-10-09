import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {config} from '../src/config';
import {TransactionalStore} from '../src/db/store';
import {SessionRegistry,SessionError} from '../src/services/sessionService';
import {prepareShadowCandidate} from '../src/services/shadowPreparation';
import {prepareRecoveryApplication,admitRecoveryApplication,recoveryApplicationInputs,RecoveryApplicationError} from '../src/services/recoveryApplication';
import {prepareRuntimeUpgradeInput,prepareRuntimeUpgradeApplication} from '../src/services/runtimeUpgradePreparation';
import {loadRuntimeUpgradeInput,upgradeFileReference,runtimeUpgradeKey} from '../src/services/runtimeUpgradeSource';
import {RuntimeUpgradeError,verifyRuntimeUpgradeInput,signRuntimeUpgradePreparation,upgradeDigest,upgradeReportContent} from '../src/domain/runtimeUpgrade';
import {backupRuntimeStore} from '../src/services/runtimeBackup';
import {BackupService} from '../src/services/backupService';
import {copyStableDatabase} from '../src/services/recoveryDrillService';
import {encryptEntitlement,decryptEntitlement} from '../src/utils/crypto';
import {isRestoredWorkHeld,restoredWorkKey} from '../src/domain/restoredWork';
import {eventProvider} from './fixtures/events';
import {reconciliationProvider} from './fixtures/reconciliation';

const root=path.resolve(__dirname,'../..'),owned=()=>fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-test-runtime-upgrade-')),opened:TransactionalStore[]=[];
const sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex'),read=(p:string)=>JSON.parse(fs.readFileSync(path.resolve(root,p),'utf8'));
let cases=0,current='startup';
async function check(name:string,fn:()=>unknown){current=name;await fn();cases++;console.log('PASS runtime upgrade: '+name);}
const normal=(r:any)=>({path:r.path,sha256:r.sha256,byteLength:r.byteLength});
const rejection=(fn:()=>unknown,code:string)=>assert.throws(fn,e=>e instanceof RuntimeUpgradeError&&e.code===code);
function proof(report:any,directory:string){const file=path.join(directory,crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');return upgradeFileReference(file);}
async function fixture(){
 current='fixture source';const directory=owned(),sourceDirectory=path.join(directory,'source'),source=new TransactionalStore(sourceDirectory);opened.push(source);
 source.transaction(()=>{source.db.users.buyer={id:'buyer',email:'buyer@example.test',roles:['buyer'],createdAt:Date.now(),loginMethod:'EVM_WALLET'};source.db.userByEmail['buyer@example.test']='buyer';
 source.db.emailOutbox.old={id:'old',status:'SENT',payload:{internal:'private email fixture'}} as any;
 source.db.webhookQueue.old={id:'old',sellerId:'seller',status:'COMPLETED',payload:{internal:'private webhook fixture'}} as any;});const chain=source.snapshot();source.close();
 const provider={...eventProvider([]),...reconciliationProvider(chain,0n,3),getLogs:async()=>[]};
 const shadow=await prepareShadowCandidate({inputScope:'LOCAL_FIXTURE',migrationOnly:false,retainLegacy:true,sourceDirectory,privateParent:path.join(directory,'shadow'),reportDirectory:path.join(directory,'shadow-reports'),provider,verifyDeployment:async()=>{}});
 assert.notEqual(shadow.status,'REJECTED');
 const old=await prepareRecoveryApplication({inputScope:'LOCAL_FIXTURE',shadowReference:shadow,sourceDirectory,privateParent:path.join(directory,'applications'),reportDirectory:path.join(directory,'application-reports')});assert.equal(old.status,'RECOVERY_APPLICATION_PREPARED');
 const recovery={inputScope:'LOCAL_FIXTURE' as const,reference:old,sourceDirectory,privateParent:path.join(directory,'applications')},live=admitRecoveryApplication(recovery);
 const token=new SessionRegistry(live.database).issue(live.database.db.users.buyer),secret=crypto.randomBytes(48);
 live.database.transaction(()=>{live.database.db.notificationPreferences.buyer={inApp:true,email:false};live.database.db.resources.live={id:'live',encryptedPayload:encryptEntitlement(secret.toString('base64')),byteLength:secret.length,sha256:sha(secret)} as any;live.database.db.emailOutbox.fresh={id:'fresh',status:'QUEUED',payload:{internal:'fresh local fixture'}} as any;live.database.addAuditLog('buyer','buyer','LOCAL_FIXTURE_LIVE_WRITE',{fixtureOnly:true});});
 const original=live.database.snapshot(),liveDirectory=live.database.storageDirectory;live.close();
 const scope={inputScope:'LOCAL_FIXTURE' as const,fixtureRoot:directory,sourceDirectory};
 const intake=prepareRuntimeUpgradeInput({...scope,recovery});
 const prepare={...scope,inputReference:intake,provider,verifyDeployment:async()=>{}};
 return{directory,sourceDirectory,recovery,scope,intake,prepare,original,liveDirectory,token,secret};
}
function admission(f:Awaited<ReturnType<typeof fixture>>,r:any){return{inputScope:'LOCAL_FIXTURE' as const,reference:r,sourceDirectory:f.sourceDirectory,privateParent:f.directory};}
async function main(){
 const binding={arcChainId:31337,deploymentBlock:1,protocolVersion:1,arcWsUrl:''};Object.assign(config,binding);Object.assign(require('../dist/config').config,binding);process.env.GROUPDEAL_RECOVERY_MODE='1';
 const f=await fixture();
 await check('authenticated intake pins admitted live writes, private data and existing holds without admission',()=>{
  const a=loadRuntimeUpgradeInput(normal(f.intake),f.scope);assert.deepEqual(a.original,f.original);assert.equal(a.body.originalHeldCount,2);assert.equal(a.body.applicationAdmissionAllowed,false);assert.equal(a.body.acceptanceEligible,false);assert.ok(!JSON.stringify(f.intake.report).includes(f.secret.toString('base64')));assert.ok(!JSON.stringify(f.intake.report).includes(f.token));
 });
 await check('altered intake, receipt purpose, unknown key or extra authority cannot be substituted',()=>{
  const changed=structuredClone(f.intake.report);changed.originalHeldCount++;rejection(()=>loadRuntimeUpgradeInput(proof(changed,f.directory),f.scope),'RUNTIME_UPGRADE_INPUT_BINDING_CHANGED');
  const receipt=read(f.intake.report.signedPrivateReceipt.path),key=runtimeUpgradeKey(receipt.body.keyId).bytes;
  for(const mutate of [(r:any)=>{r.body.originalHeldCount++;},(r:any)=>{r.body.applicationAdmissionAllowed=true;},(r:any)=>{r.body.purpose='RECOVERY_RUNTIME_SOURCE_UPGRADE_PREPARATION';},(r:any)=>{r.body.keyId='__proto__';},(r:any)=>{r.body.unexpected=true;}]){const r=structuredClone(receipt);mutate(r);rejection(()=>verifyRuntimeUpgradeInput(r,key),'RUNTIME_UPGRADE_RECEIPT_INVALID');}
  assert.throws(()=>loadRuntimeUpgradeInput({...f.intake,path:'../escape'},f.scope));
 });
 await check('active-process intake and production overrides are refused',()=>{
  const live=admitRecoveryApplication(f.recovery);try{rejection(()=>prepareRuntimeUpgradeInput({...f.scope,recovery:f.recovery}),'RUNTIME_UPGRADE_LIVE_PROCESS_PRESENT');}finally{live.close();}

  rejection(()=>prepareRuntimeUpgradeInput({inputScope:'EXISTING_DATA',sourceDirectory:f.sourceDirectory} as any),'RUNTIME_UPGRADE_SCOPE_OVERRIDE_DISABLED');
 });
 // The active-process check rotates only its own fixture DB, so subsequent cases use a fresh intake.
 const next=prepareRuntimeUpgradeInput({...f.scope,recovery:f.recovery});f.intake=next;f.prepare.inputReference=next;f.original=loadRuntimeUpgradeInput(normal(next),f.scope).original;
 for(const built of [false,true]){
  const api=built?require('../dist/services/runtimeUpgradePreparation'):{prepareRuntimeUpgradeApplication},app=built?require('../dist/services/recoveryApplication'):{admitRecoveryApplication};
  let result:any;
  await check((built?'emitted':'source')+' preparation preserves every live field and performs fresh same-block reconciliation',async()=>{
   result=await api.prepareRuntimeUpgradeApplication(f.prepare);assert.equal(result.status,'RECOVERY_APPLICATION_PREPARED',result.report.failureCode);assert.equal(result.report.allLiveFieldsPreserved,true);assert.deepEqual(result.report.runtimeInputs,recoveryApplicationInputs());assert.equal(result.report.reconciliation.status,'HEALTHY');assert.equal(result.report.financialAccountingVerified,false);
   const readCopy=path.join(f.directory,'read-candidate-'+crypto.randomUUID());copyStableDatabase(path.dirname(path.resolve(root,result.report.candidateDatabase.path)),readCopy);const db=new TransactionalStore(readCopy);try{assert.deepEqual(db.snapshot(),f.original);assert.equal(isRestoredWorkHeld(db.db,'emailOutbox','old'),true);assert.equal(isRestoredWorkHeld(db.db,'emailOutbox','fresh'),false);}finally{db.close();}
  });
  await check((built?'emitted':'source')+' admission, restart and backup keep new data while invalidating the old session',()=>{
   const option=admission(f,result),first=app.admitRecoveryApplication(option);try{
    assert.deepEqual(first.database.db.restoredWork,f.original.restoredWork);assert.equal(first.database.db.notificationPreferences.buyer.email,false);assert.deepEqual(Buffer.from(decryptEntitlement(first.database.db.resources.live.encryptedPayload),'base64'),f.secret);
    assert.throws(()=>new SessionRegistry(first.database).authenticate(f.token),e=>e instanceof SessionError&&e.code==='AUTH_SESSION_INACTIVE');
    first.database.transaction(()=>{first.database.db.notificationPreferences.afterUpgrade={inApp:false,email:true};});
   }finally{first.close();}
   const restart=app.admitRecoveryApplication(option);try{assert.equal(restart.database.db.notificationPreferences.afterUpgrade.email,true);assert.equal(restart.metadata.restartFromLivePrivateDatabase,true);const backup=backupRuntimeStore({inputScope:'LOCAL_FIXTURE',recovery:option,privateParent:path.join(f.directory,'after-backups'),reportDirectory:path.join(f.directory,'after-backup-reports')});assert.equal(backup.status,'RUNTIME_BACKUP_RESTORE_DATA_VERIFIED',backup.report.failureCode);const decoded=BackupService.readEncryptedBackup(path.resolve(root,backup.report.archive.path));assert.equal(decoded.data.notificationPreferences.afterUpgrade.email,true);assert.deepEqual(decoded.data.restoredWork,f.original.restoredWork);}finally{restart.close();}
  });
 }
 await check('bad canonical cursor or failed financial truth cannot produce an admitted upgrade',async()=>{
  for(const provider of [{...f.prepare.provider,getBlock:async(n:number)=>({number:n,hash:ethers.id('wrong-canonical')})},reconciliationProvider(f.original,1n,3)]){
   const r=await prepareRuntimeUpgradeApplication({...f.prepare,provider});assert.equal(r.status,'REJECTED');assert.equal(r.applicationBootEligible,false);assert.equal(r.report.runtimeUpgrade.signedPrivateReceipt,undefined);
  }
 });
 await check('signed preparation rejects changed report, finance fields and release of an original hold',async()=>{
  const r=await prepareRuntimeUpgradeApplication(f.prepare);assert.equal(r.status,'RECOVERY_APPLICATION_PREPARED');
  for(const mutate of [(x:any)=>{x.reconciliation.perOrderVerified=false;},(x:any)=>{x.archivedWorkHold.originalHeldCount=0;},(x:any)=>{x.accountOrFinancialAuthorityAssigned=true;},(x:any)=>{x.legacyDisposition={archiveReference:{path:'bad',sha256:'0'.repeat(64),byteLength:1}};}]){
   const changed=structuredClone(r.report);mutate(changed);rejection(()=>admitRecoveryApplication(admission(f,proof(changed,f.directory))),'RUNTIME_UPGRADE_PREPARATION_BINDING_CHANGED');
  }
  const first=admitRecoveryApplication(admission(f,r));first.database.transaction(()=>{const ledger=(first.database.db.restoredWork as any).current;delete ledger.entries[restoredWorkKey('emailOutbox','old')];ledger.heldCount--;});first.close();
  rejection(()=>admitRecoveryApplication(admission(f,r)),'RUNTIME_UPGRADE_HOLD_CHANGED');
 });
 await check('current runtime inputs remain mandatory even if a fixture holder resigns a stale preparation',async()=>{
  const r=await prepareRuntimeUpgradeApplication(f.prepare),changed=structuredClone(r.report);changed.runtimeInputs[0].sha256='0'.repeat(64);
  const body={version:1,purpose:'RECOVERY_RUNTIME_SOURCE_UPGRADE_PREPARATION',keyId:config.masterEncryptionKeyId,inputReference:changed.runtimeUpgrade.inputReference,reportSha256:upgradeDigest(upgradeReportContent(changed)),applicationStorageOnly:true,accountOrFinancialAuthorityAssigned:false,heldWorkReleaseAllowed:false,acceptanceEligible:false};
  const saved=path.join(f.directory,'stale-own-fixture-receipt.json');fs.writeFileSync(saved,JSON.stringify(signRuntimeUpgradePreparation(body,runtimeUpgradeKey(body.keyId).bytes)));changed.runtimeUpgrade.signedPrivateReceipt=upgradeFileReference(saved);
  assert.throws(()=>admitRecoveryApplication(admission(f,proof(changed,f.directory))),e=>e instanceof RecoveryApplicationError&&e.code==='RECOVERY_APPLICATION_RUNTIME_CHANGED');
 });
 console.log(`PASS ${cases} runtime upgrade cases; source/emitted isolated fixtures, no live financial or operator acceptance.`);
}

void main().catch(error=>{console.error(JSON.stringify({status:'FAIL',case:current,errorName:error instanceof Error?error.name:'unknown',code:error instanceof RuntimeUpgradeError||error instanceof RecoveryApplicationError?error.code:'LOCAL_ASSERTION_OR_STORAGE',frames:error instanceof Error?error.stack?.split(/\r?\n/).filter(l=>/^\s+at /.test(l)).slice(0,6):[]}));process.exitCode=1;}).finally(()=>{for(const db of opened)try{db.close();}catch{}});
