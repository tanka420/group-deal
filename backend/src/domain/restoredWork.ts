import crypto from 'node:crypto';
import {z} from 'zod';
import type {DatabaseSchema} from '../db/store';
import {webhookApprovalSchema,WebhookSubscriptionApproval} from './webhookRecovery';

export const restoredWorkCollections=['emailOutbox','webhookQueue','webhookDLQ','webhooks'] as const;
export type RestoredWorkCollection=typeof restoredWorkCollections[number];
export type RestoredWorkHold={collection:RestoredWorkCollection;recordId:string;recordSha256:string;reason:'RESTORED_SNAPSHOT_REQUIRES_REVIEW';}|{collection:'webhookQueue';recordId:string;recordSha256:string;reason:'RESTORED_SUBSCRIPTION_REQUIRES_REVIEW';subscriptionRecordId:string;};
export interface RestoredWorkBarrier {version:2;createdAt:number;sourceSnapshotSha256:string;heldCount:number;entries:Record<string,RestoredWorkHold>;subscriptionApprovals?:Record<string,WebhookSubscriptionApproval>;}
const digest=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().nonnegative().max(8640000000000000);
const identifier=z.string().min(1).max(1024);
const hold=z.union([z.object({collection:z.enum(restoredWorkCollections),recordId:identifier,recordSha256:digest,reason:z.literal('RESTORED_SNAPSHOT_REQUIRES_REVIEW')}).strict(),z.object({collection:z.literal('webhookQueue'),recordId:identifier,recordSha256:digest,reason:z.literal('RESTORED_SUBSCRIPTION_REQUIRES_REVIEW'),subscriptionRecordId:identifier}).strict()]);
const schema=z.object({version:z.literal(2),createdAt:time,sourceSnapshotSha256:digest,heldCount:z.number().int().nonnegative(),entries:z.record(digest,hold),subscriptionApprovals:z.record(digest,webhookApprovalSchema).optional()}).strict();
export const restoredWorkKey=(collection:RestoredWorkCollection,id:string)=>crypto.createHash('sha256').update('groupdeal:restored-work:v2:'+collection+':'+id).digest('hex');

/** A recovered environment cannot silently turn missing or corrupt hold metadata into permission to send. */
export function readRestoredWorkBarrier(state:Pick<DatabaseSchema,'authRecovery'|'restoredWork'>):RestoredWorkBarrier|undefined{
 if(state.restoredWork===undefined){if(state.authRecovery!==undefined)throw Error('RESTORED_WORK_BARRIER_REQUIRED');return undefined;}
 if(!state.restoredWork||typeof state.restoredWork!=='object'||Array.isArray(state.restoredWork)||Object.keys(state.restoredWork).length!==1||!Object.hasOwn(state.restoredWork,'current'))throw Error('RESTORED_WORK_BARRIER_INVALID');
 const result=schema.safeParse(state.restoredWork.current);
 if(!result.success||result.data.createdAt>Date.now()+30000||Object.keys(result.data.entries).length!==result.data.heldCount||Object.entries(result.data.entries).some(([key,h])=>restoredWorkKey(h.collection,h.recordId)!==key||h.reason==='RESTORED_SUBSCRIPTION_REQUIRES_REVIEW'&&!result.data.entries[restoredWorkKey('webhooks',h.subscriptionRecordId)])||Object.entries(result.data.subscriptionApprovals??{}).some(([key,a])=>restoredWorkKey('webhooks',a.sellerId)!==key||!result.data.entries[key]))throw Error('RESTORED_WORK_BARRIER_INVALID');
 return result.data;
}
export function isRestoredWorkHeld(state:Pick<DatabaseSchema,'authRecovery'|'restoredWork'>,collection:RestoredWorkCollection,id:string):boolean{return !!readRestoredWorkBarrier(state)?.entries[restoredWorkKey(collection,id)];}
