import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {ethers} from 'ethers';
import {config} from '../config';
import {TransactionalStore,DatabaseSchema} from '../db/store';
import {inCurrentDeployment} from './deploymentBindings';
import {copyStableDatabase,sourceFootprint,privateRecoveryDirectory,verifyPrivateRecovery} from './recoveryDrillService';
import {IndexerProjection} from './indexerService';
import {ReconciliationService} from './reconciliationService';
import {ArcReadProvider} from './arcReadProvider';
import {assertProjectionScope} from './projectionScope';

const root=path.resolve(__dirname,'../../..'),sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
export class ShadowPreparationError extends Error {constructor(public readonly code:string){super(code);}}
const validId=(id:unknown)=>Number.isSafeInteger(id)&&Number(id)>0;

/** Retention is a separate full private database; never assign unknown records to the current Hub. */
export function partitionLegacyProjection(original:DatabaseSchema){
 const state=structuredClone(original),campaignIds=new Set<string>(),orderIds=new Set<string>(),reasons:Record<string,number>={};
 const note=(reason:string)=>{reasons[reason]=(reasons[reason]||0)+1;};
 for(const [key,c] of Object.entries(state.campaigns))if(c.onchainCampaignId!==undefined){
  const reason=!inCurrentDeployment(c)?'CAMPAIGN_DEPLOYMENT_UNVERIFIED':!validId(c.onchainCampaignId)||c.id!==key?'CAMPAIGN_STABLE_ID_INVALID':(c.protocolVersion||1)!==config.protocolVersion?'CAMPAIGN_PROTOCOL_MISMATCH':null;
  if(reason){campaignIds.add(key);note(reason);delete state.campaigns[key];}
 }
 for(const [key,o] of Object.entries(state.orders)){
  const c=state.campaigns[o.campaignId];
  const reason=!inCurrentDeployment(o)?'ORDER_DEPLOYMENT_UNVERIFIED':!validId(o.onchainOrderId)||o.id!==key?'ORDER_STABLE_ID_INVALID':(o.protocolVersion||1)!==config.protocolVersion?'ORDER_PROTOCOL_MISMATCH':!c||c.onchainCampaignId===undefined||!inCurrentDeployment(c)?'ORDER_CAMPAIGN_UNVERIFIED':null;
  if(reason){orderIds.add(key);note(reason);delete state.orders[key];}
 }
 for(const [key,binding]of Object.entries(state.campaignIdentities))if(campaignIds.has(binding.campaignId))delete state.campaignIdentities[key];
 // The original journal/cursor is retained in the complete private snapshot; current replay builds new evidence.
 const journalEntries=Object.keys(state.eventJournal).length;
 const total=campaignIds.size+orderIds.size;
 return{state,retention:{legacyCampaigns:campaignIds.size,legacyOrders:orderIds.size,journalEntriesRetained:journalEntries,reasons,requiresLegacyAccessAndDependencyReview:total>0,allOriginalRecordsRetainedSeparately:true,financialBindingAssigned:false,activeRightsRevoked:false}};
}

type Options={migrationOnly:boolean;retainLegacy:boolean;toBlock?:number;inputScope:'EXISTING_DATA';resumeDirectory?:string;onProgress?:(block:number,end:number)=>void}|{migrationOnly:boolean;retainLegacy:boolean;toBlock?:number;inputScope:'LOCAL_FIXTURE';sourceDirectory:string;privateParent:string;reportDirectory:string;provider?:any;verifyDeployment?:(provider:any,block:number)=>Promise<void>;resumeDirectory?:string;onProgress?:(block:number,end:number)=>void};
const toolPaths=[
 "backend/scripts/prepareShadowDatabase.ts",
 "backend/src/services/shadowPreparation.ts",
 "backend/src/services/indexerService.ts",
 "backend/src/services/recoveryDrillService.ts",
 "backend/src/services/webhookSecret.ts",
 "backend/src/services/projectionScope.ts",
 "backend/src/services/deploymentBindings.ts",
 "backend/src/services/reconciliationService.ts",
 "backend/src/services/eventEvidence.ts",
 "backend/src/services/arcReadProvider.ts",
 "backend/src/db/store.ts",
 "backend/src/domain/operatorCapability.ts",
 "backend/src/domain/operatorEnrollment.ts",
 "backend/src/db/rowPersistence.ts",
 "backend/src/db/operatorDealRead.ts",
 "backend/src/db/legacyReviewMetadata.ts",
 "backend/src/contracts/hubAbi.ts",
 "backend/src/config.ts",
 "backend/src/services/runtimeSecurity.ts",
 "backend/src/utils/crypto.ts",
 "backend/package-lock.json",
 "shared/contracts.json",
 "shared/manifests/arc-testnet.json",
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
 "backend/src/services/backupService.ts",
 "backend/src/services/campaignDto.ts",
 "backend/src/services/contactIdentity.ts",
 "backend/src/services/eventNotifications.ts",
 "backend/src/services/followNotifications.ts",
 "backend/src/services/notificationService.ts",
 "backend/src/services/notificationInboxService.ts",
 "backend/src/services/notificationSource.ts",
 "backend/src/services/onchainService.ts",
 "backend/src/services/operationalSignals.ts",
 "backend/src/services/productService.ts",
 "backend/src/services/publicCampaign.ts",
 "backend/src/services/publicSellerIdentity.ts",
 "backend/src/services/restoredWorkBarrier.ts",
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
export const shadowPreparationInputs=()=>toolPaths.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
const inputs=shadowPreparationInputs;
export async function prepareShadowCandidate(options:Options){
 if(options.inputScope==='EXISTING_DATA'&&Object.keys(options).some(k=>!['inputScope','migrationOnly','retainLegacy','toBlock','onProgress','resumeDirectory'].includes(k)))throw new ShadowPreparationError('SHADOW_EXISTING_SCOPE_OVERRIDE_DISABLED');
 if(options.inputScope!=='EXISTING_DATA'&&(options.inputScope!=='LOCAL_FIXTURE'||process.env.NODE_ENV!=='test'))throw new ShadowPreparationError('SHADOW_FIXTURE_SCOPE_INVALID');
 if(options.migrationOnly&&(options.retainLegacy||options.toBlock!==undefined||options.resumeDirectory))throw new ShadowPreparationError('SHADOW_MIGRATION_OPTIONS_INVALID');
 const sourceDirectory=options.inputScope==='EXISTING_DATA'?path.join(root,'backend/data'):fs.realpathSync(options.sourceDirectory);
 if(options.inputScope==='LOCAL_FIXTURE'&&sourceDirectory.toLowerCase()===path.join(root,'backend/data').toLowerCase())throw new ShadowPreparationError('SHADOW_FIXTURE_SCOPE_INVALID');
 const before=sourceFootprint(sourceDirectory),toolInputs=inputs(),started=performance.now(),directory=privateRecoveryDirectory(options.inputScope==='EXISTING_DATA'?path.join(root,'.cache/shadow-databases'):options.privateParent);
 const report:Record<string,any>={schemaVersion:2,recordedAt:new Date().toISOString(),inputScope:options.inputScope,mode:options.migrationOnly?'MIGRATION':'REBUILD',status:'UNVERIFIED',promoted:false,rolloutAllowed:false,authCutoverAllowed:false,acceptanceEligible:false,financialAccountingVerified:false,sourceAccess:'FILES_READ_ONLY_NO_SQLITE_CONNECTION',sourceFootprint:before,toolInputs,targetDirectory:path.relative(root,directory).replaceAll('\\','/'),deployment:{chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,deploymentBlock:config.deploymentBlock}};
 let retained:TransactionalStore|undefined,target:TransactionalStore|undefined,checkpointStore:TransactionalStore|undefined,provider:any,initial:DatabaseSchema|undefined;
 let previous:any,checkpointBlock:number|undefined;
 try{
  if(options.resumeDirectory){
   const parent=fs.realpathSync(path.resolve(root,options.resumeDirectory));
   if(options.inputScope==='EXISTING_DATA'){const allowed=fs.realpathSync(path.join(root,'.cache/shadow-databases')),relative=path.relative(allowed,parent);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new ShadowPreparationError('SHADOW_RESUME_PATH_INVALID');}
   const file=path.join(parent,'PREPARATION.json');if(!fs.lstatSync(file).isFile()||fs.statSync(file).size>2*1024*1024)throw new ShadowPreparationError('SHADOW_RESUME_METADATA_INVALID');
   const priorBytes=fs.readFileSync(file);previous=JSON.parse(priorBytes.toString());
   if(previous.inputScope!==options.inputScope||previous.mode!=='REBUILD'||previous.status!=='REJECTED'||previous.originalFilesPreserved!==true||previous.acceptanceEligible!==false||previous.rolloutAllowed!==false||!isDeepStrictEqual(previous.deployment,report.deployment)||!isDeepStrictEqual(previous.toolInputs,toolInputs)||!isDeepStrictEqual(previous.sourceFootprint,before)||!previous.checkpointDatabase||!previous.verifiedCheckpoint||!previous.fixedBlock)throw new ShadowPreparationError('SHADOW_RESUME_BINDING_INVALID');
   const checkpointFile=path.join(parent,'verified-checkpoint/groupdeal.sqlite');
   if(path.resolve(root,previous.checkpointDatabase.path)!==checkpointFile||fs.realpathSync(path.dirname(checkpointFile))!==path.join(parent,'verified-checkpoint')||!fs.lstatSync(checkpointFile).isFile()||sha(fs.readFileSync(checkpointFile))!==previous.checkpointDatabase.sha256||fs.statSync(checkpointFile).size!==previous.checkpointDatabase.byteLength)throw new ShadowPreparationError('SHADOW_RESUME_CHECKPOINT_HASH_INVALID');
   report.resumedFrom={path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(priorBytes),byteLength:priorBytes.length,checkpoint:previous.verifiedCheckpoint};
   copyStableDatabase(path.join(parent,'verified-checkpoint'),path.join(directory,'resume-input'));
  }
  const retainedDir=path.join(directory,'retained-original');copyStableDatabase(sourceDirectory,retainedDir);retained=new TransactionalStore(retainedDir);const original=retained.snapshot();
  if(!retained.verifyAuditLogIntegrity().valid)throw new ShadowPreparationError('SHADOW_ORIGINAL_AUDIT_INVALID');
  report.originalCounts=Object.fromEntries(Object.entries(original).filter(([,v])=>v&&typeof v==='object').map(([key,v])=>[key,Object.keys(v).length]));
  report.privateRecovery=verifyPrivateRecovery(original);if(!report.privateRecovery.verified)throw new ShadowPreparationError('SHADOW_PRIVATE_RECORD_UNVERIFIED');
  const partition=partitionLegacyProjection(original);report.retention=partition.retention;
  if(!options.migrationOnly&&!options.retainLegacy&&partition.retention.requiresLegacyAccessAndDependencyReview)throw new ShadowPreparationError('SHADOW_LEGACY_RETENTION_REQUIRED');
  if(previous){const copied=new TransactionalStore(path.join(directory,'resume-input'));try{target=new TransactionalStore(path.join(directory,'projection'));target.initializeRecoverySnapshot(copied.snapshot());}finally{copied.close();}}
  else{target=new TransactionalStore(path.join(directory,'projection'));target.initializeRecoverySnapshot(options.migrationOnly?original:partition.state);}
  initial=target.snapshot();
  if(previous&&(initial.syncState.lastIndexedBlock!==previous.verifiedCheckpoint.blockNumber||initial.syncState.lastIndexedBlockHash!==previous.verifiedCheckpoint.blockHash))throw new ShadowPreparationError('SHADOW_RESUME_CURSOR_BINDING_INVALID');
  if(options.migrationOnly){if(!isDeepStrictEqual(initial,original))throw new ShadowPreparationError('SHADOW_MIGRATION_CHANGED_RECORDS');report.status='MIGRATION_VERIFIED';}
  else{
   provider=options.inputScope==='LOCAL_FIXTURE'&&options.provider?options.provider:new ArcReadProvider();
   const network=await provider.getNetwork();if(BigInt(network.chainId)!==BigInt(config.arcChainId))throw new ShadowPreparationError('SHADOW_NETWORK_MISMATCH');
   const head=await provider.getBlockNumber(),block=previous?.fixedBlock.number??options.toBlock??head;
   if(previous&&options.toBlock!==undefined&&options.toBlock!==block)throw new ShadowPreparationError('SHADOW_RESUME_FIXED_BLOCK_CHANGED');
   if(!Number.isSafeInteger(block)||block<config.deploymentBlock||block>head)throw new ShadowPreparationError('SHADOW_FIXED_BLOCK_INVALID');
   const canonical=await provider.getBlock(block);if(!canonical?.hash||!ethers.isHexString(canonical.hash,32))throw new ShadowPreparationError('SHADOW_FIXED_BLOCK_UNAVAILABLE');if(previous&&canonical.hash.toLowerCase()!==previous.fixedBlock.hash.toLowerCase())throw new ShadowPreparationError('SHADOW_RESUME_TARGET_NOT_CANONICAL');report.fixedBlock={number:block,hash:canonical.hash,observedHead:head};
   if(options.inputScope==='LOCAL_FIXTURE'&&options.verifyDeployment)await options.verifyDeployment(provider,block);
   else{
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'shared/manifests/arc-testnet.json'),'utf8'));
    if(manifest.chainId!==config.arcChainId||manifest.contracts.GroupDealHub.address.toLowerCase()!==config.hubAddress.toLowerCase()||manifest.contracts.GroupDealHub.deploymentBlock!==config.deploymentBlock||(manifest.protocolVersion||1)!==config.protocolVersion||manifest.contracts.USDC.address.toLowerCase()!==config.usdcAddress.toLowerCase())throw new ShadowPreparationError('SHADOW_MANIFEST_BINDING_MISMATCH');
    const code=await provider.getCode(config.hubAddress,block);if(code==='0x'||ethers.keccak256(code).toLowerCase()!==manifest.contracts.GroupDealHub.bytecodeHash.toLowerCase())throw new ShadowPreparationError('SHADOW_RUNTIME_MISMATCH');
   }
   checkpointStore=new TransactionalStore(path.join(directory,'verified-checkpoint'));
   checkpointStore.initializeRecoverySnapshot(initial);
   if(previous){checkpointBlock=initial.syncState.lastIndexedBlock;}
   const indexer=new IndexerProjection(target,false,true);indexer.setProvider(provider);report.replayRangeSize=5000;
   const replayOptions={rangeSize:5000,onProgress:(current:number,end:number)=>{checkpointStore!.replace(target!.snapshot());checkpointBlock=current;options.onProgress?.(current,end);}};
   if(previous)await indexer.resumeFromVerifiedCheckpoint(partition.state.orders,block,replayOptions);else await indexer.rebuildFromClean(config.deploymentBlock,block,replayOptions);assertProjectionScope(target.db);
   for(const [key,value]of Object.entries(partition.state))if(!['orders','campaigns','campaignIdentities','eventJournal','syncState'].includes(key)&&!isDeepStrictEqual((target.db as any)[key],value))throw new ShadowPreparationError('SHADOW_OFFCHAIN_RECORD_CHANGED');
   report.offchainRecordsPreserved=true;
   report.reconciliation=await ReconciliationService.runReconciliation({fixedBlockNumber:block,customProvider:provider,projectionStore:target});
   const r=report.reconciliation;if(r.status!=='HEALTHY'||!r.perOrderVerified||!r.coverageVerified||!r.onchainBalanceVerified||!r.conservationLawPassed||r.blockHash.toLowerCase()!==canonical.hash.toLowerCase()||(await provider.getBlock(block))?.hash?.toLowerCase()!==canonical.hash.toLowerCase())throw new ShadowPreparationError('SHADOW_RECONCILIATION_UNVERIFIED');
   report.status=partition.retention.requiresLegacyAccessAndDependencyReview?'CURRENT_DEPLOYMENT_REBUILD_VERIFIED_LEGACY_RETAINED':'REBUILD_VERIFIED';report.currentDeploymentFinancialProjectionVerified=true;
  }
  if(!isDeepStrictEqual(retained.snapshot(),original))throw new ShadowPreparationError('SHADOW_RETAINED_ORIGINAL_CHANGED');report.retainedOriginalFieldsPreserved=true;
 }catch(error){if(target&&initial)target.replace(initial);report.status='REJECTED';report.failureCode=error instanceof ShadowPreparationError?error.code:error instanceof Error&&error.message==='Arc read RPC unavailable or wrong network'?'SHADOW_READ_RPC_UNAVAILABLE':'SHADOW_REPLAY_OR_STORAGE_REJECTED';report.currentDeploymentFinancialProjectionVerified=false;}
 finally{if(checkpointStore&&checkpointBlock!==undefined)report.verifiedCheckpoint={blockNumber:checkpointBlock,blockHash:checkpointStore.db.syncState.lastIndexedBlockHash};provider?.destroy?.();retained?.close();target?.close();checkpointStore?.close();}
 for(const name of ['retained-original','projection',...(checkpointBlock!==undefined?['verified-checkpoint']:[])]){const file=path.join(directory,name,'groupdeal.sqlite');if(fs.existsSync(file)){const db=new DatabaseSync(file,{readOnly:true});try{if((db.prepare('PRAGMA integrity_check').get() as any).integrity_check!=='ok'){report.status='REJECTED';report.failureCode='SHADOW_SQLITE_INVALID';}}finally{db.close();}report[name==='retained-original'?'retainedDatabase':name==='verified-checkpoint'?'checkpointDatabase':'projectionDatabase']={path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(fs.readFileSync(file)),byteLength:fs.statSync(file).size};}}
 report.originalFilesPreserved=isDeepStrictEqual(before,sourceFootprint(sourceDirectory));if(!report.originalFilesPreserved){report.status='REJECTED';report.failureCode='SHADOW_ORIGINAL_SOURCE_CHANGED';}
 if(!isDeepStrictEqual(toolInputs,inputs())){report.status='REJECTED';report.failureCode='SHADOW_TOOL_INPUT_CHANGED';}
 report.durationMs=Math.round((performance.now()-started)*1000)/1000;
 const reports=options.inputScope==='EXISTING_DATA'?path.join(root,'reports/evidence/shadow-preparation'):options.reportDirectory;fs.mkdirSync(reports,{recursive:true});
 const file=path.join(reports,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n'),pointer={schemaVersion:2,path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(bytes),byteLength:bytes.length,status:report.status,inputScope:options.inputScope,acceptanceEligible:false};
 fs.writeFileSync(file,bytes,{flag:'wx'});fs.writeFileSync(path.join(directory,'PREPARATION.json'),bytes,{flag:'wx',mode:0o600});
 if(options.inputScope==='EXISTING_DATA'){const latest=path.join(root,'reports/evidence/SHADOW_PREPARATION_LATEST.json'),temp=latest+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(pointer,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,latest);}
 return{...pointer,directory,report};
}
