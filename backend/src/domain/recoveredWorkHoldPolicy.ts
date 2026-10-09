import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {DatabaseSchema} from '../db/store';
import {readRestoredWorkBarrier,restoredWorkCollections,restoredWorkKey} from './restoredWork';

/** The archived origin pins old holds; newly created work may coexist with that inventory. */
export function assertArchivedWorkHeld(state:DatabaseSchema,original:DatabaseSchema,initial=false){
 const barrier=readRestoredWorkBarrier(state);if(!barrier)throw Error('ARCHIVED_WORK_BARRIER_REQUIRED');
 let expected=0;
 for(const collection of restoredWorkCollections){
  if(!original[collection]||!state[collection])throw Error('ARCHIVED_WORK_COLLECTION_REQUIRED');
  if(initial&&!isDeepStrictEqual(original[collection],state[collection]))throw Error('ARCHIVED_WORK_RECORD_CHANGED');
  for(const [id,row] of Object.entries(original[collection])){
   expected++;const hold=barrier.entries[restoredWorkKey(collection,id)],current=(state[collection] as Record<string,any>)[id],identity=row as any;
   if(!Object.hasOwn(state[collection],id)||!current||current.id!==identity.id||current.sellerId!==identity.sellerId)throw Error('ARCHIVED_WORK_RECORD_CHANGED');
   if(collection==='webhooks'?identity.sellerId!==id:identity.id!==id)throw Error('ARCHIVED_WORK_IDENTITY_INVALID');
   if(!hold||hold.collection!==collection||hold.recordId!==id||hold.reason!=='RESTORED_SNAPSHOT_REQUIRES_REVIEW'||hold.recordSha256!==crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex'))throw Error('ARCHIVED_WORK_HOLD_CHANGED');
  }
 }
 if(barrier.heldCount<expected||initial&&barrier.heldCount!==expected)throw Error('ARCHIVED_WORK_HOLD_CHANGED');
 return{originalHeldCount:expected,allOriginalWorkHeld:true,heldWorkReleaseAllowed:false};
}
