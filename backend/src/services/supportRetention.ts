import {store} from '../db/store';
import {StorageConflict} from '../db/rowPersistence';

/** Bounded retention for committed new support attachments. */
export function supportRetentionSweep(limit=50,now=Date.now()){
 if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(now)||now<0||now>8640000000000000||!store.isIsolated&&now>Date.now()+30000)throw Error('SUPPORT_RETENTION_INVALID_INPUT');
 try{return {result:'APPLIED' as const,...store.purgeSupportAttachments(limit,now)};}catch(e){if(e instanceof StorageConflict)return {result:'CONCURRENT_RETRY' as const,purged:0};throw e;}
}
