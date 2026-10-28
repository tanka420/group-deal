import {config} from '../config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {TransactionalStore,DatabaseSchema} from '../db/store';
import {BackupService} from './backupService';
import {privateRecoveryDirectory,sourceFootprint,verifyPrivateRecovery,recoveryDrillInputs} from './recoveryDrillService';
import {assertProjectionScope} from './projectionScope';

const root=path.resolve(__dirname,'../../..');
const digest=(value:Buffer)=>crypto.createHash('sha256').update(value).digest('hex');
export class RecoveryInspectionError extends Error {constructor(public readonly code:string){super(code);}}
type BackupRef={path:string;sha256:string;byteLength:number};
type Options={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';backup:BackupRef;privateParent:string};
export function validateRecoveryReferenceMetadata(pointer:any,proof:any){
 if(pointer.inputScope!=='EXISTING_DATA'||proof.inputScope!=='EXISTING_DATA'||pointer.status!==proof.status||!['RESTORE_DATA_AND_PRIVATE_VERIFIED','RESTORE_DATA_VERIFIED_NO_PRIVATE_RESOURCE'].includes(proof.status)||proof.acceptanceEligible!==false||proof.promoted!==false||proof.originalFilesPreserved!==true||proof.restore?.allOriginalFieldsPreserved!==true||proof.restore.auditChainValid!==true||proof.sqliteIntegrity!=='ok'||proof.backup?.envelopeVersion!==3||proof.backup.metadataAuthenticated!==true||proof.authCutover?.allowed!==false||proof.originalAccess!=='FILES_READ_ONLY_NO_SQLITE_CONNECTION')throw new RecoveryInspectionError('RECOVERY_PROOF_SCOPE_INVALID');
 if(!Array.isArray(proof.toolInputs)||!isDeepStrictEqual(proof.toolInputs.map((f:any)=>f?.path),recoveryDrillInputs().map(f=>f.path))||proof.toolInputs.some((f:any)=>typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256)))throw new RecoveryInspectionError('RECOVERY_TOOL_INPUT_SET_INVALID');
}
const boundedJson=(file:string,limit:number)=>{if(!fs.lstatSync(file).isFile()||fs.statSync(file).size>limit)throw new RecoveryInspectionError('RECOVERY_PROOF_FILE_INVALID');return JSON.parse(fs.readFileSync(file,'utf8'));};
const safePath=(value:unknown,parent:string)=>{
 if(typeof value!=='string'||path.isAbsolute(value)||value.includes('\\'))throw new RecoveryInspectionError('RECOVERY_REFERENCE_PATH_INVALID');
 const target=path.resolve(root,value),base=fs.realpathSync(parent),relative=path.relative(base,fs.realpathSync(target));
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!fs.lstatSync(target).isFile())throw new RecoveryInspectionError('RECOVERY_REFERENCE_PATH_INVALID');
 return target;
};
function existingReference(){
 const pointer=boundedJson(path.join(root,'reports/evidence/recovery-drills/LATEST.json'),4096);
 const proofPath=safePath(pointer.path,path.join(root,'reports/evidence/recovery-drills'));if(fs.statSync(proofPath).size>2*1024*1024)throw new RecoveryInspectionError('RECOVERY_PROOF_FILE_INVALID');const bytes=fs.readFileSync(proofPath);
 if(pointer.sha256!==digest(bytes)||pointer.byteLength!==bytes.length)throw new RecoveryInspectionError('RECOVERY_PROOF_HASH_INVALID');
 const proof=JSON.parse(bytes.toString());
 validateRecoveryReferenceMetadata(pointer,proof);
 if(proof.toolInputs.some((f:any)=>digest(fs.readFileSync(path.join(root,f.path)))!==f.sha256))throw new RecoveryInspectionError('RECOVERY_TOOL_INPUT_CHANGED');
 const original=sourceFootprint(config.runtimeDataDirectory);
 if(!isDeepStrictEqual(original,proof.sourceFootprint))throw new RecoveryInspectionError('RECOVERY_ORIGINAL_DATA_CHANGED');
 const backupPath=safePath(proof.backup.file,path.join(root,'.cache/recovery-drills'));
 return {backup:{path:backupPath,sha256:proof.backup.ciphertextSha256,byteLength:proof.backup.byteLength},proofReference:{path:pointer.path,sha256:pointer.sha256,byteLength:pointer.byteLength},original};
}

/** Reconstruct from authenticated ciphertext; never trust the mutable restored DB from an earlier drill. */
export function prepareRecoveryInspection(options:Options){
 const started=performance.now();let original:ReturnType<typeof sourceFootprint>|undefined,proofReference:BackupRef|undefined;
 let backup:BackupRef,parent:string;
 if(options.inputScope==='EXISTING_DATA'){
  if(Object.keys(options).some(k=>k!=='inputScope'))throw new RecoveryInspectionError('RECOVERY_SCOPE_OVERRIDE_DISABLED');
  const ref=existingReference();backup=ref.backup;original=ref.original;proofReference=ref.proofReference;parent=path.join(root,'.cache/recovery-inspection');
 }else if(options.inputScope==='LOCAL_FIXTURE'&&process.env.NODE_ENV==='test'){
  backup=options.backup;parent=options.privateParent;
 }else throw new RecoveryInspectionError('RECOVERY_FIXTURE_SCOPE_INVALID');
 if(!Number.isSafeInteger(backup.byteLength)||backup.byteLength<1||backup.byteLength>256*1024*1024||!fs.lstatSync(backup.path).isFile()||fs.statSync(backup.path).size!==backup.byteLength)throw new RecoveryInspectionError('RECOVERY_BACKUP_SIZE_INVALID');
 const bytes=fs.readFileSync(backup.path);
 if(!/^[a-f0-9]{64}$/.test(backup.sha256)||digest(bytes)!==backup.sha256)throw new RecoveryInspectionError('RECOVERY_BACKUP_HASH_INVALID');
 const decoded=BackupService.readEncryptedBackup(backup.path);
 if(decoded.envelopeVersion!==3||!decoded.metadataAuthenticated)throw new RecoveryInspectionError('RECOVERY_METADATA_UNAUTHENTICATED');
 const directory=privateRecoveryDirectory(parent),copy=path.join(directory,'input.enc');fs.writeFileSync(copy,bytes,{flag:'wx',mode:0o600});
 const store=new TransactionalStore(path.join(directory,'database'));
 let state:DatabaseSchema;
 try{
  BackupService.restoreEncryptedBackup(copy,store);state=store.snapshot();
  for(const [key,value] of Object.entries(decoded.data))if(key==='auditLogs'){
   if(state.auditLogs.length!==value.length+1||!isDeepStrictEqual(state.auditLogs.slice(1),value))throw new RecoveryInspectionError('RECOVERY_AUDIT_CHANGED');
  }else if(!isDeepStrictEqual((state as any)[key],value))throw new RecoveryInspectionError('RECOVERY_DATA_CHANGED');
  if(!store.verifyAuditLogIntegrity().valid)throw new RecoveryInspectionError('RECOVERY_AUDIT_INVALID');
 }finally{store.close();}
 const database=new DatabaseSync(path.join(directory,'database/groupdeal.sqlite'),{readOnly:true});
 try{if((database.prepare('PRAGMA integrity_check').get() as any).integrity_check!=='ok')throw new RecoveryInspectionError('RECOVERY_SQLITE_INVALID');}finally{database.close();}
 const verified=verifyPrivateRecovery(state!);if(!verified.verified)throw new RecoveryInspectionError('RECOVERY_PRIVATE_DATA_UNVERIFIED');
 let projectionScopeMetadataVerified=true;
 try{assertProjectionScope(state!);}catch{projectionScopeMetadataVerified=false;}
 const metadata={schemaVersion:1,inputScope:options.inputScope,scope:'RECOVERY_INSPECTION_ONLY',inspectionReady:true,productAccessEnabled:false,financialAccountingVerified:false,chainReadbackPerformed:false,workersStarted:false,restoredSessionsAccepted:false,authCutoverAllowed:false,projectionScopeMetadataVerified,projectionAdmission:projectionScopeMetadataVerified?'METADATA_VERIFIED_CHAIN_READBACK_REQUIRED':'BLOCKED_SCOPE_REBUILD_REQUIRED',privateProductResourcesPresent:verified.productResourcePresent,counts:Object.fromEntries(['orders','campaigns','users','authSessions','resources','licenseInventory','resourceGrants','emailOutbox','webhookQueue','webhookDLQ'].map(key=>[key,Object.keys((state! as any)[key]).length])),dataPreparationDurationMs:Math.round((performance.now()-started)*1000)/1000,actualServiceRTOEstablished:false,actualLostDataRPOEstablished:false,acceptanceEligible:false};
 const verifyOriginal=()=>{if(original&&!isDeepStrictEqual(original,sourceFootprint(config.runtimeDataDirectory)))throw new RecoveryInspectionError('RECOVERY_ORIGINAL_DATA_CHANGED');};
 verifyOriginal();
 return{metadata,directory,proofReference,verifyOriginal};
}

/** Only aggregate inspection routes exist. No application routes, restored JWTs, queues or signers. */
export async function startRecoveryInspection(prepared:ReturnType<typeof prepareRecoveryInspection>,port:number){
 if(!Number.isInteger(port)||port<0||port>65535)throw new RecoveryInspectionError('RECOVERY_PORT_INVALID');
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  const address=server.address(),actualPort=typeof address==='object'&&address?address.port:0;
  const send=(status:number,value:unknown)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  if(req.headers.origin!==undefined||![`127.0.0.1:${actualPort}`,`localhost:${actualPort}`].includes(req.headers.host||''))return send(403,{error:'RECOVERY_LOCAL_REQUEST_REQUIRED'});
  if(req.method!=='GET')return send(423,{error:'RECOVERY_PRODUCT_ACCESS_DISABLED'});
  if(req.url==='/health'||req.url==='/api/health')return send(200,{status:'ok',scope:'RECOVERY_INSPECTION_ONLY',productAccessEnabled:false,financialAccountingVerified:false});
  if(req.url==='/api/recovery/status')return send(200,prepared.metadata);
  return send(423,{error:'RECOVERY_PRODUCT_ACCESS_DISABLED'});
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
 try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});}catch{server.close();throw new RecoveryInspectionError('RECOVERY_LISTEN_FAILED');}
 const address=server.address();if(!address||typeof address==='string')throw new RecoveryInspectionError('RECOVERY_LISTEN_FAILED');
 let closed=false;
 return{server,url:'http://127.0.0.1:'+address.port,close:async()=>{if(closed)return;closed=true;server.closeIdleConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));prepared.verifyOriginal();}};
}
