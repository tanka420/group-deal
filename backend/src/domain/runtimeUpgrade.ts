import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import type {DatabaseSchema} from '../db/store';
import {readRestoredWorkBarrier} from './restoredWork';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const relative=z.string().min(1).max(1024).refine(v=>!v.startsWith('/')&&!v.includes('..')&&!v.includes('\\')&&!v.includes(':'));
export const upgradeReferenceSchema=z.object({path:relative,sha256:digest,byteLength:z.number().int().positive()}).strict();
export type UpgradeReference=z.infer<typeof upgradeReferenceSchema>;
const footprint=z.array(z.object({file:z.enum(['groupdeal.sqlite','groupdeal.sqlite-wal','groupdeal.sqlite-shm','groupdeal_db.json','groupdeal_db.json.tmp']),byteLength:z.number().int().nonnegative(),sha256:digest}).strict()).min(1).max(5).refine(rows=>new Set(rows.map(r=>r.file)).size===rows.length&&rows.some(r=>r.file==='groupdeal.sqlite'&&r.byteLength>0));
const inputs=z.array(z.object({path:relative,sha256:digest}).strict()).min(1).max(1500).refine(rows=>new Set(rows.map(r=>r.path)).size===rows.length);
const keyId=z.string().regex(/^[-A-Za-z0-9_]{1,64}$/).refine(id=>!['legacy','custom','__proto__','prototype','constructor'].includes(id));
const deployment=z.object({chainId:z.number().int().positive(),hubAddress:z.string().regex(/^0x[0-9a-fA-F]{40}$/),protocolVersion:z.number().int().positive(),deploymentBlock:z.number().int().nonnegative()}).strict();
const inputBody=z.object({version:z.literal(1),purpose:z.literal('RECOVERY_RUNTIME_SOURCE_UPGRADE_INPUT'),keyId,recordedAt:z.string().datetime(),inputScope:z.enum(['EXISTING_DATA','LOCAL_FIXTURE']),deployment,sourceFootprint:footprint,sourceDirectory:relative,liveSourceFootprint:footprint,priorPreparation:upgradeReferenceSchema,priorAdmission:upgradeReferenceSchema,liveArchive:upgradeReferenceSchema,backupProof:upgradeReferenceSchema,legacyArchive:upgradeReferenceSchema.nullable(),sourceRuntimeInputs:inputs,originalHeldCount:z.number().int().nonnegative(),originalRecordsPreserved:z.literal(true),financialBindingAssigned:z.literal(false),accountOrFinancialAuthorityAssigned:z.literal(false),heldWorkReleaseAllowed:z.literal(false),applicationAdmissionAllowed:z.literal(false),acceptanceEligible:z.literal(false)}).strict();
const preparationBody=z.object({version:z.literal(1),purpose:z.literal('RECOVERY_RUNTIME_SOURCE_UPGRADE_PREPARATION'),keyId,inputReference:upgradeReferenceSchema,reportSha256:digest,applicationStorageOnly:z.literal(true),accountOrFinancialAuthorityAssigned:z.literal(false),heldWorkReleaseAllowed:z.literal(false),acceptanceEligible:z.literal(false)}).strict();
export class RuntimeUpgradeError extends Error{constructor(public readonly code:string){super(code);}}
export const upgradeFail=(code:string):never=>{throw new RuntimeUpgradeError(code);};
/** Stable encoding authenticates the entire body, independently of JSON property order. */
export function canonicalUpgradeJSON(value:unknown):string{return value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonicalUpgradeJSON).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalUpgradeJSON((value as Record<string,unknown>)[k])).join(',')+'}';}
export const upgradeDigest=(value:unknown)=>crypto.createHash('sha256').update(canonicalUpgradeJSON(value)).digest('hex');
function authenticated<T>(value:unknown,schema:z.ZodType<T>,key:Buffer,purpose:string,sign:boolean){
 if(!Buffer.isBuffer(key)||key.length!==32)upgradeFail('RUNTIME_UPGRADE_KEY_INVALID');
 if(sign){const body=schema.safeParse(value);if(!body.success)upgradeFail('RUNTIME_UPGRADE_RECEIPT_INVALID');return{body:body.data!,mac:crypto.createHmac('sha256',key).update(purpose+canonicalUpgradeJSON(body.data)).digest('hex')};}
 const result=z.object({body:schema,mac:digest}).strict().safeParse(value);if(!result.success)upgradeFail('RUNTIME_UPGRADE_RECEIPT_INVALID');
 const receipt=result.data!,expected=crypto.createHmac('sha256',key).update(purpose+canonicalUpgradeJSON(receipt.body)).digest('hex');
 if(!crypto.timingSafeEqual(Buffer.from(receipt.mac,'hex'),Buffer.from(expected,'hex')))upgradeFail('RUNTIME_UPGRADE_RECEIPT_INVALID');return receipt;
}
export const signRuntimeUpgradeInput=(body:unknown,key:Buffer)=>authenticated(body,inputBody,key,'groupdeal:runtime-upgrade-input:v1:',true);
export const verifyRuntimeUpgradeInput=(value:unknown,key:Buffer)=>authenticated(value,inputBody,key,'groupdeal:runtime-upgrade-input:v1:',false).body;
export const signRuntimeUpgradePreparation=(body:unknown,key:Buffer)=>authenticated(body,preparationBody,key,'groupdeal:runtime-upgrade-preparation:v1:',true);
export const verifyRuntimeUpgradePreparation=(value:unknown,key:Buffer)=>authenticated(value,preparationBody,key,'groupdeal:runtime-upgrade-preparation:v1:',false).body;
/** Preserve old hold entries verbatim. Approvals can change a subscription without releasing its hold. */
export function assertRuntimeUpgradeHolds(state:DatabaseSchema,origin:DatabaseSchema,initial=false){
 const before=readRestoredWorkBarrier(origin),current=readRestoredWorkBarrier(state);if(!before||!current)return upgradeFail('RUNTIME_UPGRADE_HOLD_REQUIRED');
 if(initial&&!isDeepStrictEqual(state.restoredWork,origin.restoredWork))upgradeFail('RUNTIME_UPGRADE_HOLD_CHANGED');
 for(const [key,hold]of Object.entries(before.entries)){
  const row=(state[hold.collection] as Record<string,any>)[hold.recordId],old=(origin[hold.collection] as Record<string,any>)[hold.recordId];
  if(!isDeepStrictEqual(current.entries[key],hold)||!row||!old||row.id!==old.id||row.sellerId!==old.sellerId)upgradeFail('RUNTIME_UPGRADE_HOLD_CHANGED');
 }
 if(current.heldCount<before.heldCount)upgradeFail('RUNTIME_UPGRADE_HOLD_CHANGED');
 return{originalHeldCount:before.heldCount,allOriginalWorkHeld:true,heldWorkReleaseAllowed:false};
}
export function upgradeReportContent(report:any){const copy=structuredClone(report);if(!copy.runtimeUpgrade)upgradeFail('RUNTIME_UPGRADE_REPORT_INVALID');delete copy.runtimeUpgrade.signedPrivateReceipt;return copy;}
