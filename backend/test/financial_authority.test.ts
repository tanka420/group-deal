import {ReconciliationService} from '../src/services/reconciliationService';
import {reconciliationProvider} from './fixtures/reconciliation';
import {installRestoredWorkBarrier} from '../src/services/restoredWorkBarrier';
import {isRestoredWorkHeld} from '../src/domain/restoredWork';
import {restoredWebhookJobCanSend} from '../src/services/webhookRecoveryPolicy';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ethers} from 'ethers';
import {TransactionalStore} from '../src/db/store';
import {IndexerProjection} from '../src/services/indexerService';
import {config} from '../src/config';
import {HUB_ABI} from '../src/contracts/hubAbi';
import {eventDigest} from '../src/services/eventEvidence';
import {eventProvider} from './fixtures/events';
const iface=new ethers.Interface(HUB_ABI),seller='0x70997970C51812dc3A010C7d01b50e0d17dc79C8',buyer='0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',terms=ethers.id('native-financial-terms');
const originalMode=process.argv.includes('--original');
async function fixture(sideEffects=false){
 const state=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-financial-authority-'))),sql=new DatabaseSync(path.join(state.storageDirectory,'groupdeal.sqlite')),indexer=new IndexerProjection(state,sideEffects);
 const event=(name:string,args:unknown[],block:number)=>({...iface.encodeEventLog(iface.getEvent(name)!,args),address:config.hubAddress,blockNumber:block,blockHash:ethers.id('block-'+block),transactionHash:ethers.id('native-financial-'+name),transactionIndex:0,index:0});
 const created=event('CampaignCreated',[1,seller,terms,0,1001,2001,0],1),commit=event('CommitmentMade',[1,1,ethers.id('financial-identity'),buyer,1,100_000_000,100_000_000,false,0],2),finalized=event('CampaignFinalized',[1,90_000_000,1,100_000_000,1],3),claim=event('FundsClaimed',[1,buyer,10_000_000,0],4);
 const logs=[created,commit,finalized,claim],calls:any={[created.transactionHash]:{from:seller,data:iface.encodeFunctionData('createCampaign',[{sellerPayoutWallet:seller,metric:0,maxPerAccount:2,inventoryLimit:0,durationSeconds:1000,deliverySlaSeconds:86400,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash:terms},[{threshold:1,price:100_000_000},{threshold:2,price:90_000_000}]])},[claim.transactionHash]:{from:buyer,to:config.hubAddress,data:iface.encodeFunctionData('claimBuyerFunds',[1,[1]])}};
 const provider=eventProvider(logs,calls,b=>1000+b);indexer.setProvider(provider);
 await indexer.syncThroughBlock(3);
 state.db.users.other={id:'other',email:'other@example.test',createdAt:1,roles:['buyer'],activeWallet:null};state.save();
 const row=(collection:string,key:string)=>{const r=sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,key) as {record_json:string}|undefined;return r?.record_json;},read=(collection:string,key:string)=>JSON.parse(row(collection,key)??'null');
 const eventKey=`${config.arcChainId}_${config.hubAddress.toLowerCase()}_${claim.transactionHash.toLowerCase()}_0`;
 return{state,sql,indexer,provider,claim,eventKey,row,read,add:(name:string,args:unknown[],block:number)=>{const log=event(name,args,block);logs.push(log);return log;},close:()=>{sql.close();state.close();}};
}
async function main(){const beforeDeployment=config.deploymentBlock;config.deploymentBlock=1;const observations:{id:string;defect:boolean;rejected:boolean}[]=[];
 try{
  {const f=await fixture();try{f.state.db.users.other.roles.push('operator');let rejected=false;try{await f.indexer.syncThroughBlock(4);}catch{rejected=true;}observations.push({id:'N382',defect:f.read('users','other').roles.includes('operator'),rejected});if(!originalMode){assert.equal(rejected,false);assert.deepEqual(f.read('users','other').roles,['buyer']);assert.ok(f.state.db.users.other.roles.includes('operator'));assert.equal(f.read('orders','1').buyerClaimedAmount,'10000000');}}finally{f.close();}}
  {const f=await fixture();try{f.state.db.eventJournal[f.eventKey]={id:f.eventKey,chainId:config.arcChainId,contractAddress:config.hubAddress,blockNumber:4,blockHash:f.claim.blockHash,transactionIndex:0,txHash:f.claim.transactionHash,logIndex:0,eventName:'FundsClaimed',payload:iface.parseLog(f.claim)!.args.toObject(),processedAt:1,evidenceVersion:2,eventDigest:eventDigest(f.claim),blockTimestamp:1004};let rejected=false;try{await f.indexer.projectVerifiedReceipt({blockNumber:4,txHash:f.claim.transactionHash,logs:[f.claim as any]});}catch{rejected=true;}observations.push({id:'N383',defect:!rejected&&!f.read('eventJournal',f.eventKey),rejected});if(!originalMode){assert.ok(rejected||f.read('eventJournal',f.eventKey));assert.equal(f.read('orders','1').buyerClaimedAmount,rejected?'0':'10000000');}}finally{f.close();}}
  {const f=await fixture();try{f.state.db.orders['1'].rebateAllocated='11000000';f.state.db.orders['1'].buyerClaimedAmount='1000000';let rejected=false;try{await f.indexer.syncThroughBlock(4);}catch{rejected=true;}observations.push({id:'N384',defect:f.read('orders','1').buyerClaimedAmount==='11000000',rejected});if(!originalMode){assert.equal(rejected,true);assert.equal(f.read('orders','1').buyerClaimedAmount,'0');assert.equal(f.read('orders','1').rebateAllocated,'10000000');assert.equal(f.read('eventJournal',f.eventKey),null);}}finally{f.close();}}
  {const f=await fixture();try{f.sql.exec("CREATE TRIGGER financial_cursor_abort BEFORE UPDATE OF record_json ON domain_records WHEN NEW.collection='syncState' AND json_extract(NEW.record_json,'$.lastIndexedBlock')=4 BEGIN SELECT RAISE(ABORT,'controlled_financial_cursor_abort'); END;");let rejected=false;try{await f.indexer.syncThroughBlock(4);}catch{rejected=true;}observations.push({id:'N385',defect:rejected&&f.read('orders','1').buyerClaimedAmount!=='0'&&!!f.read('eventJournal',f.eventKey)&&f.read('syncState','state').lastIndexedBlock===3,rejected});if(!originalMode){assert.equal(rejected,true);assert.equal(f.read('orders','1').buyerClaimedAmount,'0');assert.equal(f.read('eventJournal',f.eventKey),null);assert.equal(f.read('syncState','state').lastIndexedBlock,3);}}finally{f.close();}}
  if(!originalMode){
   {const f=await fixture();try{
     const opaque={marker:'future-private-financial-extension'},order=f.state.db.orders['1'] as any;order.opaqueExtension=opaque;order.deliveredEntitlementEncrypted='opaque-existing-entitlement';order.transactionHistory[0].opaqueHistory={marker:'future-private-history-extension'};f.state.save();
     f.state.db.users.other.roles.push('operator');await f.indexer.syncThroughBlock(4);
     assert.deepEqual(f.read('orders','1').opaqueExtension,opaque);assert.equal(f.read('orders','1').deliveredEntitlementEncrypted,'opaque-existing-entitlement');assert.equal(f.read('orders','1').transactionHistory[0].opaqueHistory.marker,'future-private-history-extension');assert.deepEqual((f.state.db.orders['1'] as any).opaqueExtension,opaque);
     const declared=f.state.readFinancialProjectionState({wholeScope:true}).graph;assert.equal(Object.hasOwn(declared.orders['1'],'opaqueExtension'),false);assert.equal(Object.hasOwn(declared.orders['1'],'deliveredEntitlementEncrypted'),false);assert.equal(Object.hasOwn(declared.orders['1'].transactionHistory![0],'opaqueHistory'),false);
     const revision=(f.sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision,bytes=f.row('orders','1'),journal=f.row('eventJournal',f.eventKey);await f.indexer.processLogs([f.claim,f.claim]);assert.equal((f.sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision,revision);assert.equal(f.row('orders','1'),bytes);assert.equal(f.row('eventJournal',f.eventKey),journal);assert.deepEqual(f.read('users','other').roles,['buyer']);
   }finally{f.close();}}
   {const f=await fixture();try{
     let advanced=false;f.indexer.setProvider({...f.provider,getTransactionReceipt:async(hash:string)=>{const result=await f.provider.getTransactionReceipt(hash);if(!advanced&&hash===f.claim.transactionHash){advanced=true;const peer=new TransactionalStore(f.state.storageDirectory);try{peer.db.users.other.emailVerified=true;peer.save();}finally{peer.close();}}return result;}});
     await assert.rejects(f.indexer.syncThroughBlock(4),/STORAGE_CONFLICT|concurrent writer|reload/i);assert.equal(f.read('orders','1').buyerClaimedAmount,'0');assert.equal(f.read('eventJournal',f.eventKey),null);assert.equal(f.read('syncState','state').lastIndexedBlock,3);
   }finally{f.close();}}
   for(const abort of [true,false]){const f=await fixture(true);try{
     const campaign=f.state.db.campaigns['1'];Object.assign(campaign,{sellerId:'other',projectionOrigin:'VERIFIED_PUBLISH',visibility:'PUBLIC'});
     Object.assign(f.state.db.users.other,{roles:['seller'],emailVerified:true,sellerProfile:{displayName:'Local seller',bio:'',payoutWallet:seller,verifiedSellerBadge:false,verifiedRightsBadge:false}});
     f.state.db.users['buyer-own']={id:'buyer-own',email:'buyer-own@example.test',emailVerified:true,roles:['buyer'],createdAt:1,activeWallet:buyer};f.state.db.orders['1'].buyerAccountId='buyer-own';
     f.state.db.webhooks.other={id:'wh_native_financial_fixture',sellerId:'other',targetUrl:'https://example.test/native-fixture',secret:'local-only-fixture-webhook',events:['*'],logs:[]};f.state.db.notificationPreferences.other={inApp:true,email:true};f.state.save();
     const breach=f.add('DeliveryBreached',[1,1,90_000_000],5),breachKey=`${config.arcChainId}_${config.hubAddress.toLowerCase()}_${breach.transactionHash.toLowerCase()}_0`,beforeOrder=f.row('orders','1'),beforeCursor=f.row('syncState','state'),revision=(f.sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision;
     f.state.db.webhooks.other.targetUrl='https://example.test/pending-cache-target';f.state.db.notificationPreferences.other.email=false;
     if(abort)f.sql.exec("CREATE TRIGGER financial_webhook_abort BEFORE INSERT ON domain_records WHEN NEW.collection='webhookQueue' BEGIN SELECT RAISE(ABORT,'controlled_financial_webhook_abort'); END;");
     if(abort){await assert.rejects(f.indexer.syncThroughBlock(5));assert.equal(f.row('orders','1'),beforeOrder);assert.equal(f.row('syncState','state'),beforeCursor);assert.equal(f.read('eventJournal',f.eventKey),null);assert.equal(f.read('eventJournal',breachKey),null);assert.equal((f.sql.prepare("SELECT COUNT(*) AS count FROM domain_records WHERE collection IN ('notifications','emailOutbox','webhookQueue')").get() as any).count,0);assert.equal((f.sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision,revision);assert.equal(f.state.db.orders['1'].buyerClaimedAmount,'0');}
     else{await f.indexer.syncThroughBlock(5);assert.equal(f.read('orders','1').buyerClaimedAmount,'10000000');assert.equal(f.read('orders','1').buyerRefundAllocated,'90000000');assert.ok(f.read('eventJournal',f.eventKey));assert.ok(f.read('eventJournal',breachKey));assert.equal(f.read('syncState','state').lastIndexedBlock,5);const jobs=Object.values(f.state.db.webhookQueue);assert.equal(jobs.length,1);assert.equal(jobs[0].targetUrl,'https://example.test/native-fixture');assert.equal(jobs[0].secret,'');assert.ok(jobs[0].secretEncrypted);assert.equal(Object.values(f.state.db.notifications).filter(n=>n.type==='DELIVERY_BREACHED').length,2);assert.ok(Object.values(f.state.db.emailOutbox).some(j=>j.userId==='other'));assert.equal(f.state.db.notificationPreferences.other.email,false);assert.equal(f.read('notificationPreferences','other').email,true);assert.equal(f.state.db.webhooks.other.targetUrl,'https://example.test/pending-cache-target');const counts=Object.keys(f.state.db.notifications).length;await f.indexer.processLogs([breach]);assert.equal(Object.keys(f.state.db.notifications).length,counts);assert.equal(Object.keys(f.state.db.webhookQueue).length,1);}
   }finally{f.close();}}
   {const f=await fixture();try{
     const truth=reconciliationProvider(f.state.db,100_000_000n,3),revision=(f.sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision,bytes=f.row('orders','1');
     f.state.db.orders['1'].rebateAllocated='999';f.state.db.users.other.roles.push('operator');const report=await ReconciliationService.runReconciliation({projectionStore:f.state,customProvider:truth,fixedBlockNumber:3});
     assert.equal(report.status,'HEALTHY',JSON.stringify(report.discrepancies));assert.equal(report.totalRebatesAllocatedUSDC,'10.0');assert.equal((f.sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision,revision);assert.equal(f.row('orders','1'),bytes);assert.equal(f.state.db.orders['1'].rebateAllocated,'999');assert.deepEqual(f.read('users','other').roles,['buyer']);
   }finally{f.close();}}
   for(const abort of [true,false]){const f=await fixture(true);try{
     Object.assign(f.state.db.campaigns['1'],{sellerId:'other',projectionOrigin:'VERIFIED_PUBLISH',visibility:'PUBLIC'});Object.assign(f.state.db.users.other,{roles:['seller'],emailVerified:false,sellerProfile:{displayName:'Local seller',bio:'',payoutWallet:seller,verifiedSellerBadge:false,verifiedRightsBadge:false}});
     f.state.db.webhooks.other={id:'wh_native_financial_held',sellerId:'other',targetUrl:'https://example.test/held-native-fixture',secret:'local-only-held-webhook',events:['*'],logs:[]};f.state.db.authRecovery={current:{version:1,context:'a'.repeat(43),createdAt:Date.now()}};installRestoredWorkBarrier(f.state,structuredClone(f.state.db));f.state.save();
     const breach=f.add('DeliveryBreached',[1,1,90_000_000],5),barrierBefore=f.row('restoredWork','current'),orderBefore=f.row('orders','1');
     if(abort)f.sql.exec("CREATE TRIGGER financial_barrier_abort BEFORE UPDATE OF record_json ON domain_records WHEN NEW.collection='restoredWork' BEGIN SELECT RAISE(ABORT,'controlled_financial_barrier_abort'); END;");
     if(abort){await assert.rejects(f.indexer.syncThroughBlock(5));assert.equal(f.row('restoredWork','current'),barrierBefore);assert.equal(f.row('orders','1'),orderBefore);assert.equal(Object.keys(f.state.db.webhookQueue).length,0);assert.equal(f.read('eventJournal',f.eventKey),null);assert.equal(f.read('syncState','state').lastIndexedBlock,3);}
     else{await f.indexer.syncThroughBlock(5);const jobs=Object.values(f.state.db.webhookQueue);assert.equal(jobs.length,1);assert.equal(isRestoredWorkHeld(f.state.db,'webhookQueue',jobs[0].id),true);assert.equal(restoredWebhookJobCanSend(f.state.db,jobs[0]),false);assert.equal(isRestoredWorkHeld(f.state.db,'webhooks','other'),true);assert.equal(f.read('restoredWork','current').heldCount,2);assert.equal(f.read('syncState','state').lastIndexedBlock,5);assert.equal(f.read('orders','1').buyerRefundAllocated,'90000000');}
   }finally{f.close();}}
   console.log('PASS_FINANCIAL_NATIVE_RECONCILIATION_HOLD: fixed-block reconciliation ignores pending cache without writes; actual indexer events couple restored subscription job hold and rollback barrier abort');
   console.log('PASS_FINANCIAL_COUPLED_AUTHORITY: opaque SQL/cache/history retention, declared private exclusion, no-write duplicate, stale-writer refusal, coupled financial/journal/cursor/notification/encrypted email/webhook rollback, native subscription/preferences and pending-cache preservation');
  }
  if(originalMode)assert.ok(observations.every(v=>v.defect),'Original financial defects must all be observed');else assert.ok(observations.every(v=>!v.defect));
  console.log(JSON.stringify({result:originalMode?'ORIGINAL_FINANCIAL_AUTHORITY_REPRODUCTION':'PASS_FINANCIAL_ORIGINAL_GUARDS',observations}));
 }finally{config.deploymentBlock=beforeDeployment;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});