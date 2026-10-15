import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {TransactionalStore} from '../db/store';
import {sourceFootprint,copyStableDatabase,privateRecoveryDirectory,verifyPrivateRecovery,RecoveryDrillError} from './recoveryDrillService';
import {reviewLegacyData} from './legacyDataReview';
import {DatabaseSync} from 'node:sqlite';
import {readLegacyReviewMetadata} from '../db/legacyReviewMetadata';
const root=path.resolve(__dirname,'../../..'),sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
export class LegacyReviewError extends Error{constructor(public readonly code:string){super(code);}}
const paths=[
 "backend/scripts/reviewLegacy.ts",
 "backend/src/services/legacyReviewPreparation.ts",
 "backend/src/services/legacyDataReview.ts",
 "backend/src/services/restoredWorkReview.ts",
 "backend/src/services/shadowPreparation.ts",
 "backend/src/services/deploymentBindings.ts",
 "backend/src/services/recoveryDrillService.ts",
 "backend/src/services/webhookSecret.ts",
 "backend/src/db/store.ts",
 "backend/src/domain/operatorCapability.ts",
 "backend/src/domain/operatorEnrollment.ts",
 "backend/src/db/rowPersistence.ts",
 "backend/src/db/operatorDealRead.ts",
 "backend/src/db/legacyReviewMetadata.ts",
 "backend/src/config.ts",
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
 "backend/src/services/backupService.ts",
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
 "backend/src/services/restoredWorkBarrier.ts",
 "backend/src/services/runtimeSecurity.ts",
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
export const legacyReviewInputs=()=>paths.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
type Options={inputScope:'EXISTING_DATA'}|{inputScope:'LOCAL_FIXTURE';sourceDirectory:string;privateParent:string;reportDirectory:string};
/** Review freshly copied original records, independent of historical financial proof. Never clear an admission gate. */
export function prepareLegacyDataReview(options:Options){
 if(options.inputScope==='EXISTING_DATA'&&Object.keys(options).some(k=>k!=='inputScope'))throw new LegacyReviewError('LEGACY_REVIEW_SCOPE_OVERRIDE_DISABLED');
 if(options.inputScope!=='EXISTING_DATA'&&(options.inputScope!=='LOCAL_FIXTURE'||process.env.NODE_ENV!=='test'))throw new LegacyReviewError('LEGACY_REVIEW_FIXTURE_DISABLED');
 const original=options.inputScope==='EXISTING_DATA'?path.join(root,'backend/data'):options.sourceDirectory;
 if(options.inputScope==='LOCAL_FIXTURE'&&fs.realpathSync(original).toLowerCase()===path.join(root,'backend/data').toLowerCase())throw new LegacyReviewError('LEGACY_REVIEW_FIXTURE_ACTIVE_SOURCE_DISABLED');
 const before=sourceFootprint(original),inputs=legacyReviewInputs(),directory=privateRecoveryDirectory(options.inputScope==='EXISTING_DATA'?path.join(root,'.cache/legacy-data-reviews'):options.privateParent),reports=options.inputScope==='EXISTING_DATA'?path.join(root,'reports/evidence/legacy-data-reviews'):options.reportDirectory;
 const report:Record<string,any>={schemaVersion:1,recordedAt:new Date().toISOString(),inputScope:options.inputScope,status:'UNVERIFIED',sourceFootprint:before,toolInputs:inputs,targetDirectory:path.relative(root,directory).replaceAll('\\','/'),sourceAccess:'FILES_READ_ONLY_NO_SQLITE_CONNECTION',financialAccountingVerified:false,authCutoverAllowed:false,productAccessAutoEnabled:false,workersStarted:false,promoted:false,acceptanceEligible:false};let copied:TransactionalStore|undefined;
 try{copyStableDatabase(original,path.join(directory,'source-copy'));copied=new TransactionalStore(path.join(directory,'source-copy'));const state=copied.snapshot();if(!copied.verifyAuditLogIntegrity().valid)throw new LegacyReviewError('LEGACY_REVIEW_AUDIT_INVALID');report.privateRecovery=verifyPrivateRecovery(state);if(!report.privateRecovery.verified)throw new LegacyReviewError('LEGACY_REVIEW_PRIVATE_RECORD_UNVERIFIED');report.review=reviewLegacyData(state);const reader=new DatabaseSync(path.join(directory,'source-copy/groupdeal.sqlite'),{readOnly:true});try{if(!isDeepStrictEqual(report.review,reviewLegacyData(readLegacyReviewMetadata(reader))))throw new LegacyReviewError('LEGACY_REVIEW_METADATA_FACTS_CHANGED');report.operatorMetadataProjection={verifiedAgainstFullCopiedState:true,privateCiphertextAndPayloadFieldsReturned:false,principalAuthenticationVerified:false,financialAccountingVerified:false};}finally{reader.close();}report.status=report.review.status==='ACTION_REQUIRED'?'LEGACY_DATA_REVIEW_ACTION_REQUIRED':'LEGACY_DATA_REVIEW_NO_LEGACY_RECORDS';}
 catch(error){report.status='REJECTED';report.failureCode=error instanceof LegacyReviewError||error instanceof RecoveryDrillError?error.code:'LEGACY_REVIEW_STAGE_REJECTED';}finally{copied?.close();}
 try{report.originalFilesPreserved=isDeepStrictEqual(before,sourceFootprint(original));}catch{report.originalFilesPreserved=false;}if(!report.originalFilesPreserved){report.status='REJECTED';report.failureCode='LEGACY_REVIEW_SOURCE_CHANGED';}if(!isDeepStrictEqual(inputs,legacyReviewInputs())){report.status='REJECTED';report.failureCode='LEGACY_REVIEW_TOOLS_CHANGED';}
 const file=path.join(reports,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});fs.writeFileSync(path.join(directory,'REVIEW.json'),bytes,{flag:'wx',mode:0o600});const ref={schemaVersion:1,path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(bytes),byteLength:bytes.length,status:report.status,inputScope:options.inputScope,acceptanceEligible:false};if(options.inputScope==='EXISTING_DATA'){const pointer=path.join(root,'reports/evidence/LEGACY_DATA_REVIEW_LATEST.json'),temporary=pointer+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(ref,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,pointer);}return{...ref,report,directory};
}
