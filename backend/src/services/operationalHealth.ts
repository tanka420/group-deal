import {config} from '../config';
import type {OperationalStorageSnapshot,AlertCode} from '../domain/operations';
import {emailStatuses,webhookStatuses,alertCodes} from '../domain/operations';
import type {IndexerSignals,ReconciliationSignals} from './operationalSignals';

export function operationalHealth(storage:OperationalStorageSnapshot|null,indexer:ReturnType<IndexerSignals['snapshot']>,reconciliationObservation:ReturnType<ReconciliationSignals['snapshot']>,now=Date.now()){
 const reconciliation=reconciliationObservation.latest;
 const alerts:{code:AlertCode;severity:'MEDIUM'|'HIGH'|'CRITICAL'}[]=[],add=(code:AlertCode,severity:'MEDIUM'|'HIGH'|'CRITICAL')=>alerts.push({code,severity});
 if(!storage)add('STORAGE_UNAVAILABLE','CRITICAL');
 if(!indexer.running)add('INDEXER_STOPPED','HIGH');
 const headAge=indexer.headObservedAt===null?null:now-indexer.headObservedAt;
 if(indexer.headBlock===null||headAge===null)add('INDEXER_HEAD_UNOBSERVED','HIGH');else if(headAge<0||headAge>30000)add('INDEXER_OBSERVATION_STALE','HIGH');
 if(indexer.consecutiveFailures>0)add('INDEXER_SYNC_FAILED',indexer.consecutiveFailures>=3?'CRITICAL':'HIGH');
 const lag=storage&&indexer.headBlock!==null?indexer.headBlock-storage.sync.lastIndexedBlock:null;
 if(lag!==null&&lag<0)add('PROJECTION_AHEAD_OF_HEAD','CRITICAL');else if(lag!==null&&lag>10)add('INDEXER_LAG','MEDIUM');
 let reconciliationFresh=false;
 if(reconciliationObservation.unresolvedDiscrepancy)add('RECONCILIATION_DISCREPANCY','CRITICAL');
 if(!reconciliation)add('RECONCILIATION_UNOBSERVED','HIGH');
 else {
  reconciliationFresh=!!storage&&indexer.running&&indexer.consecutiveFailures===0&&headAge!==null&&headAge>=0&&headAge<=30000&&now>=reconciliation.observedAt&&now-reconciliation.observedAt<=60000&&reconciliation.projectionBlock===reconciliation.blockNumber&&reconciliation.blockNumber===storage.sync.lastIndexedBlock&&reconciliation.blockHash.toLowerCase()===storage.sync.lastIndexedBlockHash?.toLowerCase()&&reconciliation.headBlockNumber===indexer.headBlock&&reconciliation.blockNumber===indexer.headBlock;
  if(reconciliation.status==='DISCREPANCY_DETECTED')add('RECONCILIATION_DISCREPANCY','CRITICAL');
  else if(!reconciliationFresh||reconciliation.status==='STALE')add('RECONCILIATION_STALE','HIGH');
  else if(reconciliation.status!=='HEALTHY'||!reconciliation.completeProof)add('RECONCILIATION_UNVERIFIED','HIGH');
 }
 if(storage)for(const [name,queue] of [['EMAIL',storage.email],['WEBHOOK',storage.webhook]] as const){
  if(queue.unknownCount||queue.invalidScheduleCount)add('QUEUE_METADATA_INVALID','HIGH');
  if(queue.counts.DLQ)add(name==='EMAIL'?'EMAIL_DLQ':'WEBHOOK_DLQ','MEDIUM');
  if(queue.overdueCount)add(name==='EMAIL'?'EMAIL_OVERDUE':'WEBHOOK_OVERDUE','HIGH');
  if(queue.expiredLeases)add(name==='EMAIL'?'EMAIL_LEASE_EXPIRED':'WEBHOOK_LEASE_EXPIRED','HIGH');
 }
 const unique=alerts.filter((a,i)=>alerts.findIndex(b=>b.code===a.code)===i);
 return{version:'1.0' as const,scope:'OPERATIONAL_OBSERVATION' as const,chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,observedAt:now,status:!storage?'UNAVAILABLE':unique.length?'ATTENTION':'OBSERVED',financialAccountingVerified:false as const,storage:storage?{state:'READABLE',revision:storage.revision,committedSnapshot:true}: {state:'UNAVAILABLE',revision:null,committedSnapshot:false},indexer:{...indexer,headAgeMs:headAge,lagBlocks:lag,projection:storage?{blockNumber:storage.sync.lastIndexedBlock,blockHash:storage.sync.lastIndexedBlockHash??null,lastRangeCommitAt:storage.sync.lastSyncTimestamp}:null},reconciliation:reconciliation?{...reconciliation,currentObservation:reconciliationFresh}:null,queues:storage?{email:storage.email,webhook:storage.webhook}:null,alerts:unique,limitations:{processObservationsResetOnRestart:true,healthDoesNotEstablishFinancialFinality:true,providerInboxDeliveryVerified:false,backupRestoreObserved:false,remoteAlertReceiverVerified:false}};
}
export type OperationalHealth=ReturnType<typeof operationalHealth>;
export function operationalMetrics(view:OperationalHealth){
 const lines=['# HELP groupdeal_operational_storage_readable Committed row snapshot readable (not accounting health).','# TYPE groupdeal_operational_storage_readable gauge',`groupdeal_operational_storage_readable ${view.storage.state==='READABLE'?1:0}`,'# TYPE groupdeal_indexer_running gauge',`groupdeal_indexer_running ${view.indexer.running?1:0}`,'# TYPE groupdeal_indexer_sync_attempts_total counter',`groupdeal_indexer_sync_attempts_total ${view.indexer.attempts}`,'# TYPE groupdeal_indexer_sync_failures_total counter',`groupdeal_indexer_sync_failures_total ${view.indexer.failures}`];
 if(view.indexer.headAgeMs!==null&&view.indexer.headAgeMs>=0)lines.push('# TYPE groupdeal_indexer_head_age_seconds gauge',`groupdeal_indexer_head_age_seconds ${view.indexer.headAgeMs/1000}`);
 if(view.indexer.lagBlocks!==null)lines.push('# TYPE groupdeal_indexer_lag_blocks gauge',`groupdeal_indexer_lag_blocks ${view.indexer.lagBlocks}`);
 lines.push('# TYPE groupdeal_operational_alert gauge');for(const code of alertCodes)lines.push(`groupdeal_operational_alert{code="${code}"} ${view.alerts.some(a=>a.code===code)?1:0}`);
 if(view.queues){lines.push('# TYPE groupdeal_queue_jobs gauge','# TYPE groupdeal_queue_overdue gauge','# TYPE groupdeal_queue_expired_leases gauge');for(const [kind,queue,statuses] of [['email',view.queues.email,emailStatuses],['webhook',view.queues.webhook,webhookStatuses]] as const){for(const status of statuses)lines.push(`groupdeal_queue_jobs{queue="${kind}",status="${status}"} ${queue.counts[status]??0}`);lines.push(`groupdeal_queue_overdue{queue="${kind}"} ${queue.overdueCount}`,`groupdeal_queue_expired_leases{queue="${kind}"} ${queue.expiredLeases}`);}}
 return lines.join('\n')+'\n';
}
