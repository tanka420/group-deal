import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {DatabaseSchema,TransactionalStore,WebhookJobRecord} from '../db/store';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {restoredWorkCollections,restoredWorkKey,readRestoredWorkBarrier,RestoredWorkBarrier} from '../domain/restoredWork';

/** Called only inside new private auth staging. Jobs, subscriptions, payloads, leases, targets and rights stay in the snapshot. */
export function installRestoredWorkBarrier(candidate:TransactionalStore,original:DatabaseSchema){
 if(!candidate.isIsolated||!readAuthRecoveryBarrier(candidate.db.authRecovery))throw Error('RESTORED_WORK_PRIVATE_RECOVERY_REQUIRED');
 const entries:RestoredWorkBarrier['entries']={};
 for(const collection of restoredWorkCollections){
  if(!isDeepStrictEqual(candidate.db[collection],original[collection]))throw Error('RESTORED_WORK_SOURCE_RECORD_CHANGED');
  for(const [recordId,record]of Object.entries(original[collection]))entries[restoredWorkKey(collection,recordId)]={collection,recordId,recordSha256:crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex'),reason:'RESTORED_SNAPSHOT_REQUIRES_REVIEW'};
 }
 candidate.db.restoredWork={current:{version:2,createdAt:Date.now(),sourceSnapshotSha256:crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),heldCount:Object.keys(entries).length,entries}};
 return readRestoredWorkBarrier(candidate.db)!;
}

/** A canonical event is retained atomically with the queue row while its restored subscription remains held. */
export function holdJobForRestoredSubscription(state:DatabaseSchema,job:WebhookJobRecord){
 const barrier=readRestoredWorkBarrier(state);
 if(!barrier?.entries[restoredWorkKey('webhooks',job.sellerId)]||state.webhookQueue[job.id]!==job)throw Error('RESTORED_SUBSCRIPTION_JOB_BINDING_INVALID');
 barrier.entries[restoredWorkKey('webhookQueue',job.id)]={collection:'webhookQueue',recordId:job.id,recordSha256:crypto.createHash('sha256').update(JSON.stringify(job)).digest('hex'),reason:'RESTORED_SUBSCRIPTION_REQUIRES_REVIEW',subscriptionRecordId:job.sellerId};
 barrier.heldCount=Object.keys(barrier.entries).length;state.restoredWork!.current=barrier;
}
