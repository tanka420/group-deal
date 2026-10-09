import crypto from 'node:crypto';
import {z} from 'zod';
import {store,TransactionalStore} from '../db/store';
import {config} from '../config';
import {SessionRegistry,SessionProof,SessionError} from './sessionService';
import {reviewLegacyData} from './legacyDataReview';

const querySchema=z.object({kind:z.enum(['orders','campaigns']).default('orders'),limit:z.string().regex(/^(?:[1-9]\d?|100)$/).default('20'),cursor:z.string().max(2048).optional()}).strict();
export class OperatorLegacyReviewError extends Error{constructor(public readonly code:string,public readonly status=400){super(code);}}
export class OperatorLegacyReview {
 constructor(private readonly database:TransactionalStore=store){}
 public list(proof:SessionProof,query:unknown){
  const parsed=querySchema.safeParse(query);if(!parsed.success)throw new OperatorLegacyReviewError('LEGACY_REVIEW_QUERY_INVALID');
  let snapshot:ReturnType<TransactionalStore['readOperatorLegacyState']>;try{snapshot=this.database.readOperatorLegacyState(proof.account.id,proof.key);}catch{throw new OperatorLegacyReviewError('LEGACY_REVIEW_UNAVAILABLE',503);}
  const account=new SessionRegistry(this.database).assertOperatorCommitted(proof,snapshot.auth);if(!account.roles.includes('operator')||!snapshot.metadata)throw new OperatorLegacyReviewError('LEGACY_REVIEW_ROLE_REQUIRED',403);
  let review:ReturnType<typeof reviewLegacyData>;try{review=reviewLegacyData(snapshot.metadata);}catch{throw new OperatorLegacyReviewError('LEGACY_REVIEW_UNAVAILABLE',503);}
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(review)).digest('hex'),kind=parsed.data.kind,limit=Number(parsed.data.limit),scope=crypto.createHash('sha256').update(JSON.stringify([account.id,proof.record.id,config.arcChainId,config.hubAddress.toLowerCase(),config.protocolVersion,kind,limit])).digest('hex');
  const sign=(data:string)=>crypto.createHmac('sha256',config.jwtSecret).update('groupdeal:legacy-review:cursor:v1:'+data).digest('hex');let after:string|undefined;
  if(parsed.data.cursor){try{const [data,mac,...extra]=parsed.data.cursor.split('.');if(extra.length||!/^[A-Za-z0-9_-]+$/.test(data)||!/^[a-f0-9]{64}$/.test(mac)||!crypto.timingSafeEqual(Buffer.from(sign(data),'hex'),Buffer.from(mac,'hex')))throw Error();const value=JSON.parse(Buffer.from(data,'base64url').toString());if(!Array.isArray(value)||value.length!==4||value[0]!==1||value[1]!==scope||!/^[a-f0-9]{64}$/.test(value[2])||!/^[a-f0-9]{64}$/.test(value[3]))throw Error();if(value[2]!==fingerprint)throw new OperatorLegacyReviewError('LEGACY_REVIEW_CHANGED',409);after=value[3];}catch(error){if(error instanceof OperatorLegacyReviewError)throw error;throw new OperatorLegacyReviewError('LEGACY_REVIEW_CURSOR_INVALID');}}
  const all=review[kind].sort((a,b)=>a.reference.localeCompare(b.reference)),records=all.filter(r=>!after||r.reference>after).slice(0,limit),last=records.at(-1),more=last&&all.some(r=>r.reference>last.reference),data=more?Buffer.from(JSON.stringify([1,scope,fingerprint,last.reference])).toString('base64url'):null;
  return{schemaVersion:1,scope:'SELECTED_DATABASE_DEPENDENCY_METADATA',observedAt:Date.now(),revision:snapshot.revision,fingerprint,status:review.status,kind,records,pagination:{limit,nextCursor:data?data+'.'+sign(data):null},summary:{legacyCounts:review.legacyCounts,restoredExternalWork:review.restoredExternalWork,dependencies:review.dependencies,journal:review.journal,requiredActions:review.requiredActions},financialAccountingVerified:false,financialActionsAllowed:false,productAccessAutoEnabled:false,rightsReassigned:false,workersMayResume:false,retainedArchivePrincipalAccessVerified:false,acceptanceEligible:false};
 }
}
export const operatorLegacyReview=new OperatorLegacyReview();
export {SessionError};
