import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {DatabaseSchema} from '../db/store';
import {config} from '../config';
import {parseInternalTestOrigin,assertInternalTestArchiveContent,verifyInternalTestArchiveReceipt,InternalTestArchiveError} from '../domain/internalTestArchive';
import {recoveryDrillInputs,verifyPrivateRecovery} from './recoveryDrillService';
import {shadowPreparationInputs} from './shadowPreparation';
import {reviewLegacyData} from './legacyDataReview';
import {BackupService} from './backupService';
import {encryptionKey} from '../utils/crypto';

const root=path.resolve(__dirname,'../../..'),sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
type Reference={path:string;sha256:string;byteLength:number};
type Options={inputScope:'EXISTING_DATA'|'LOCAL_FIXTURE';reference:Reference;sourceFootprint:unknown;shadowReference:Reference;retention:any;fixtureRoot?:string};
export class InternalTestArchiveRecoveryError extends Error{constructor(public readonly code:string){super(code);}}
const fail=(code:string):never=>{throw new InternalTestArchiveRecoveryError(code);};
export function internalTestArchiveProducerInputs(){
 return [...recoveryDrillInputs(),...shadowPreparationInputs(),...['backend/scripts/prepareInternalTestArchive.ts','backend/src/domain/internalTestArchive.ts','backend/src/services/legacyDataReview.ts'].map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}))].filter((row,index,rows)=>rows.findIndex(candidate=>candidate.path===row.path)===index);
}
function readReference(ref:Reference,parent:string,limit=2*1024*1024){
 if(!ref||typeof ref.path!=='string'||ref.path.startsWith('/')||ref.path.includes('..')||ref.path.includes('\\')||ref.path.includes(':')||!Number.isSafeInteger(ref.byteLength)||ref.byteLength<1||ref.byteLength>limit||!/^[a-f0-9]{64}$/.test(ref.sha256))fail('INTERNAL_TEST_ARCHIVE_REFERENCE_INVALID');
 const file=path.resolve(root,ref.path),relative=path.relative(fs.realpathSync(parent),fs.realpathSync(file));
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!fs.lstatSync(file).isFile())fail('INTERNAL_TEST_ARCHIVE_PATH_INVALID');
 const bytes=fs.readFileSync(file);if(bytes.length!==ref.byteLength||sha(bytes)!==ref.sha256)fail('INTERNAL_TEST_ARCHIVE_REFERENCE_CHANGED');return{file,bytes,value:()=>JSON.parse(bytes.toString())};
}
function operatingKey(id:unknown){
 if(typeof id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(id)||['legacy','custom','__proto__','prototype','constructor'].includes(id))fail('INTERNAL_TEST_ARCHIVE_KEY_UNAVAILABLE');
 if(id!==config.masterEncryptionKeyId&&!Object.hasOwn(config.previousEncryptionKeys,id as string))fail('INTERNAL_TEST_ARCHIVE_KEY_UNAVAILABLE');
 const value=id===config.masterEncryptionKeyId?config.masterEncryptionKey:config.previousEncryptionKeys[id as string];if(!value)fail('INTERNAL_TEST_ARCHIVE_KEY_UNAVAILABLE');return encryptionKey(id as string,value);
}
/** No driver or network access. Authentication binds full original data before any session staging. */
export function loadVerifiedInternalTestArchive(options:Options){
 try{
  let fixture:string|undefined;
  if(options.inputScope==='LOCAL_FIXTURE'){
   if(process.env.NODE_ENV!=='test'||!options.fixtureRoot)fail('INTERNAL_TEST_ARCHIVE_FIXTURE_DISABLED');
   fixture=fs.realpathSync(options.fixtureRoot!);const relative=path.relative(fs.realpathSync(path.join(root,'.cache/local-check-temp')),fixture);
   if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail('INTERNAL_TEST_ARCHIVE_FIXTURE_DISABLED');
  }else if(options.inputScope!=='EXISTING_DATA'||options.fixtureRoot!==undefined)fail('INTERNAL_TEST_ARCHIVE_SCOPE_INVALID');
  const parent=(relative:string)=>fixture??path.join(root,relative),report=readReference(options.reference,parent('reports/evidence/internal-test-archives')).value();
  if(report.schemaVersion!==1||report.inputScope!==options.inputScope||report.status!=='INTERNAL_TEST_ARCHIVE_PREPARED_ADMISSION_PENDING'||report.archiveEnvelopeVersion!==3||report.currentOperatingKeyReadbackVerified!==true||report.fullOriginalFieldsRestored!==true||report.originalFilesPreserved!==true||report.authCutoverAllowed!==false||report.applicationBootEligible!==false||report.heldWorkReleaseAllowed!==false||report.workersStarted!==false||report.financialBindingAssigned!==false||report.acceptanceEligible!==false)fail('INTERNAL_TEST_ARCHIVE_SCOPE_INVALID');
  if(!isDeepStrictEqual(report.sourceFootprint,options.sourceFootprint)||!isDeepStrictEqual(report.shadowReference,options.shadowReference))fail('INTERNAL_TEST_ARCHIVE_SOURCE_OR_SHADOW_CHANGED');
  const privateReceipt=readReference(report.signedPrivateReceipt,parent('.cache/internal-test-archives')).value();
  const body=verifyInternalTestArchiveReceipt(privateReceipt,operatingKey(privateReceipt?.body?.keyId));
  for(const field of ['origin','sourceFootprint','archive','recoveryProof'] as const)if(!isDeepStrictEqual(body[field],report[field]))fail('INTERNAL_TEST_ARCHIVE_RECEIPT_BINDING_CHANGED');
  const inputs=internalTestArchiveProducerInputs();if(!isDeepStrictEqual(body.sourceToolInputs,inputs)||!isDeepStrictEqual(report.toolInputs,inputs))fail('INTERNAL_TEST_ARCHIVE_TOOLS_CHANGED');
  const origin=parseInternalTestOrigin(readReference(body.origin,parent('reports/evidence/legacy-origins')).value(),options.sourceFootprint),proof=readReference(body.recoveryProof,parent('reports/evidence/recovery-drills')).value();
  if(proof.inputScope!==options.inputScope||!['RESTORE_DATA_AND_PRIVATE_VERIFIED','RESTORE_DATA_VERIFIED_NO_PRIVATE_RESOURCE'].includes(proof.status)||proof.originalFilesPreserved!==true||proof.promoted!==false||proof.acceptanceEligible!==false||proof.originalAccess!=='FILES_READ_ONLY_NO_SQLITE_CONNECTION'||proof.authCutover?.allowed!==false||proof.restore?.allOriginalFieldsPreserved!==true||proof.restore.auditChainValid!==true||proof.sqliteIntegrity!=='ok'||proof.privateRecovery?.verified!==true||proof.backup?.envelopeVersion!==3||proof.backup.metadataAuthenticated!==true)fail('INTERNAL_TEST_ARCHIVE_RECOVERY_INVALID');
  if(!isDeepStrictEqual(proof.sourceFootprint,options.sourceFootprint)||!isDeepStrictEqual(proof.toolInputs,recoveryDrillInputs())||!isDeepStrictEqual(body.archive,{path:proof.backup.file,sha256:proof.backup.ciphertextSha256,byteLength:proof.backup.byteLength}))fail('INTERNAL_TEST_ARCHIVE_RECOVERY_BINDING_CHANGED');
  if(report.archiveKeyId!==body.keyId||proof.backup.keyId!==body.keyId)fail('INTERNAL_TEST_ARCHIVE_KEY_CHANGED');
  operatingKey(report.archiveKeyId);
  const archive=readReference(body.archive,parent('.cache/recovery-drills'),256*1024*1024),decoded=BackupService.readEncryptedBackup(archive.file);
  if(decoded.envelopeVersion!==3||!decoded.metadataAuthenticated||decoded.keyId!==body.keyId||decoded.timestamp!==proof.backup.createdAt||!verifyPrivateRecovery(decoded.data).verified)fail('INTERNAL_TEST_ARCHIVE_DATA_UNVERIFIED');
  const review=reviewLegacyData(decoded.data),classification=assertInternalTestArchiveContent(origin,decoded.data,review);
  if(!isDeepStrictEqual(classification,report.classification)||classification.campaigns!==options.retention?.legacyCampaigns||classification.orders!==options.retention?.legacyOrders||options.retention?.allOriginalRecordsRetainedSeparately!==true||options.retention?.financialBindingAssigned!==false||options.retention?.activeRightsRevoked!==false)fail('INTERNAL_TEST_ARCHIVE_RETENTION_CHANGED');
  const metadata={status:'INTERNAL_TEST_ARCHIVE_VERIFIED',archiveReference:{path:options.reference.path,sha256:options.reference.sha256,byteLength:options.reference.byteLength},origin:body.origin,recoveryProof:body.recoveryProof,classification,originalRecordsPreserved:true,heldWorkReleaseAllowed:false,accountOrFinancialAuthorityAssigned:false,acceptanceEligible:false};
  return{metadata,original:decoded.data};
 }catch(error){if(error instanceof InternalTestArchiveRecoveryError)throw error;if(error instanceof InternalTestArchiveError)return fail(error.code);return fail('INTERNAL_TEST_ARCHIVE_VERIFICATION_REJECTED');}
}
/** The five rebuilt projection fields have separate chain/retention proofs; every offchain field stays exact. */
export function assertArchivedProjectionPreserved(original:DatabaseSchema,projection:DatabaseSchema,staged=false){
 const rebuilt=new Set(['orders','campaigns','campaignIdentities','eventJournal','syncState']),expected=staged?structuredClone(original):original;
 if(staged){
  for(const name of ['authRecovery','restoredWork','auditLogs'])rebuilt.add(name);
  expected.emailOtps={};expected.walletChallenges={};expected.circleLoginAttempts={};
  for(const user of Object.values(expected.users))if(user.contact?.pending?.state==='PENDING')user.contact.pending.state='CANCELLED';
  for(const name of ['walletBindingIntents','sellerProfileIntents'] as const)for(const [id,intent] of Object.entries(expected[name]))if(intent.state==='PENDING'){
   const cancelled=projection[name][id]?.cancelledAt;if(!Number.isSafeInteger(cancelled)||Number(cancelled)<0||Number(cancelled)>Date.now()+30000)fail('INTERNAL_TEST_ARCHIVE_AUTH_STAGING_CHANGED');
   intent.state='CANCELLED';intent.cancelledAt=cancelled;
  }
  if(projection.auditLogs.length!==original.auditLogs.length+1||!isDeepStrictEqual(projection.auditLogs.slice(1),original.auditLogs))fail('INTERNAL_TEST_ARCHIVE_AUDIT_CHANGED');
 }
 for(const key of new Set([...Object.keys(expected),...Object.keys(projection)]))if(!rebuilt.has(key)&&!isDeepStrictEqual((expected as any)[key],(projection as any)[key]))fail('INTERNAL_TEST_ARCHIVE_OFFCHAIN_RECORD_CHANGED');
}
