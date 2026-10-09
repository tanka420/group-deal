import crypto from 'node:crypto';
import {z} from 'zod';
import {store,TransactionalStore,DatabaseSchema} from '../db/store';
import {StorageConflict} from '../db/rowPersistence';
import {SessionRegistry,SessionProof,SessionError} from './sessionService';
import {webhookReviewSchema,reviewIdSchema,WebhookRecoveryReview,WebhookReviewBinding} from '../domain/webhookRecovery';
import {readRestoredWorkBarrier,restoredWorkKey} from '../domain/restoredWork';
import {webhookReviewBinding,webhookReviewDigest,approvedRestoredSubscription,signWebhookApproval} from './webhookRecoveryPolicy';
import {decryptWebhookSecret} from './webhookSecret';
import {encryptEntitlement,decryptEntitlement,signWebhookPayload} from '../utils/crypto';
import {postWebhookReview} from './webhookTransport';

const prepareInput=z.object({idempotencyKey:z.string().uuid()}).strict(),ttl=15*60_000,leaseMs=30_000;
export const webhookReviewResponse=(secret:string,rawBody:string)=>crypto.createHmac('sha256',secret).update('groupdeal:webhook-recovery-response:v1:'+webhookReviewDigest(rawBody)).digest('hex');
export class WebhookRecoveryError extends Error{constructor(public code:string,public status=409){super(code);}}
const sameBinding=(row:WebhookRecoveryReview,binding:WebhookReviewBinding)=>Object.entries(binding).every(([k,v])=>row[k as keyof WebhookReviewBinding]===v);
export class WebhookRecoveryRegistry{
 private readonly sessions:SessionRegistry;
 constructor(private readonly database:TransactionalStore,private readonly send=postWebhookReview){this.sessions=new SessionRegistry(database);}
 private update<T>(fn:()=>T):T{try{return this.database.transaction(fn);}catch(e){if(e instanceof WebhookRecoveryError||e instanceof SessionError)throw e;throw new WebhookRecoveryError(e instanceof StorageConflict?'WEBHOOK_REVIEW_STORAGE_CONFLICT':'WEBHOOK_REVIEW_UNAVAILABLE',503);}}
 private current(proof:SessionProof,id?:string|null){
  const snapshot=this.database.readSellerWebhookState(proof.account.id,proof.key,id),account=this.sessions.assertCommitted(proof,snapshot.auth);
  if(!account.roles.includes('seller'))throw new SessionError('WEBHOOK_SELLER_REQUIRED',403);
  if(!snapshot.webhook||snapshot.webhook.sellerId!==account.id)throw new WebhookRecoveryError('WEBHOOK_REVIEW_NOT_FOUND',404);
  const state={authRecovery:snapshot.auth.authRecovery as DatabaseSchema['authRecovery'],restoredWork:snapshot.restoredWork};
  if(!readRestoredWorkBarrier(state)?.entries[restoredWorkKey('webhooks',account.id)])throw new WebhookRecoveryError('WEBHOOK_REVIEW_NOT_REQUIRED');
  const binding=webhookReviewBinding(state,account.id,snapshot.webhook);
  return {snapshot,account,state,binding};
 }
 private memoryMatches(c:ReturnType<WebhookRecoveryRegistry['current']>){
  const sub=this.database.db.webhooks[c.account.id];
  if(!sub||!sameBinding(c.binding as WebhookRecoveryReview,webhookReviewBinding(this.database.db,c.account.id,sub)))throw new WebhookRecoveryError('WEBHOOK_REVIEW_BINDING_CHANGED');
 }
 private row(value:unknown){const p=webhookReviewSchema.safeParse(value);if(!p.success)throw new WebhookRecoveryError('WEBHOOK_REVIEW_UNAVAILABLE',503);return p.data;}
 private publicRow(row:WebhookRecoveryReview,binding:WebhookReviewBinding,sessionId:string){
  const now=Date.now(),matches=sameBinding(row,binding),phase=!matches?'INVALIDATED':row.phase!=='VERIFIED'&&now>=row.expiresAt?'EXPIRED':row.phase;
  return {id:row.id,subscriptionId:row.subscriptionId,phase,createdAt:row.createdAt,expiresAt:row.expiresAt,attempts:row.attempts,verifiedAt:row.verifiedAt??null,scope:'NEW_EVENTS_ONLY' as const,canVerify:matches&&row.sessionId===sessionId&&now<row.expiresAt&&row.attempts<3&&(['PREPARED','FAILED'].includes(row.phase)||row.phase==='VERIFYING'&&(row.leaseExpiresAt??Infinity)<=now),retryAt:row.phase==='VERIFYING'?row.leaseExpiresAt??null:null};
 }
 public get(proof:SessionProof,id?:string){
  if(id!==undefined&&!reviewIdSchema.safeParse(id).success)throw new WebhookRecoveryError('WEBHOOK_REVIEW_INPUT_INVALID',400);
  const c=this.current(proof,id??null);if(id&&!c.snapshot.review)throw new WebhookRecoveryError('WEBHOOK_REVIEW_NOT_FOUND',404);
  const enabled=approvedRestoredSubscription(c.state,c.account.id,c.snapshot.webhook),review=c.snapshot.review?this.publicRow(this.row(c.snapshot.review),c.binding,proof.record.id):null;
  if(review?.phase==='VERIFIED'&&enabled?.reviewId!==review.id){review.phase='INVALIDATED';review.canVerify=false;}
  return {review,enabledForNewEvents:!!enabled,serverTime:Date.now()};
 }
 public prepare(proof:SessionProof,input:unknown){
  const parsed=prepareInput.safeParse(input);if(!parsed.success)throw new WebhookRecoveryError('WEBHOOK_REVIEW_INPUT_INVALID',400);
  const id='whr_'+parsed.data.idempotencyKey;
  return this.update(()=>{
   const c=this.current(proof,id);this.memoryMatches(c);
   if(proof.record.kind!=='MANAGED')throw new SessionError('WEBHOOK_REVIEW_FRESH_SESSION_REQUIRED',401);
   if(c.snapshot.review){const prior=this.row(c.snapshot.review);if(prior.id!==id||prior.sessionId!==proof.record.id||!sameBinding(prior,c.binding))throw new WebhookRecoveryError('WEBHOOK_REVIEW_IDEMPOTENCY_CONFLICT');return this.publicRow(prior,c.binding,proof.record.id);}
   if(this.database.db.webhookRecoveryReviews?.[id])throw new WebhookRecoveryError('WEBHOOK_REVIEW_IDEMPOTENCY_CONFLICT');
   if(approvedRestoredSubscription(c.state,c.account.id,c.snapshot.webhook))throw new WebhookRecoveryError('WEBHOOK_REVIEW_ALREADY_VERIFIED');
   const now=Date.now(),rows=Object.values(this.database.db.webhookRecoveryReviews??{}).filter(r=>r.sellerId===c.account.id).map(r=>this.row(r));
   if(rows.some(r=>r.phase==='VERIFYING'&&(r.leaseExpiresAt??0)>now))throw new WebhookRecoveryError('WEBHOOK_REVIEW_IN_PROGRESS');
   const budgetKey='webhook-review:'+webhookReviewDigest(c.account.id),old=this.database.db.rateLimits[budgetKey];
   if(old&&(!Number.isSafeInteger(old.count)||old.count<0||!Number.isSafeInteger(old.windowStartedAt)||old.windowStartedAt>now))throw new WebhookRecoveryError('WEBHOOK_REVIEW_UNAVAILABLE',503);
   const budget=!old||now-old.windowStartedAt>=3600_000?{windowStartedAt:now,lastAttemptAt:now,count:0}:old;
   if(budget.count>=10)throw new WebhookRecoveryError('WEBHOOK_REVIEW_RATE_LIMIT',429);
   this.database.db.rateLimits[budgetKey]={...budget,count:budget.count+1,lastAttemptAt:now};
   for(const oldRow of rows)if(['PREPARED','FAILED','VERIFYING'].includes(oldRow.phase)){oldRow.phase='CANCELLED';oldRow.updatedAt=now;delete oldRow.leaseToken;delete oldRow.leaseExpiresAt;this.database.db.webhookRecoveryReviews![oldRow.id]=oldRow;}
   const row:WebhookRecoveryReview={version:1,id,...c.binding,sessionId:proof.record.id,createdAt:now,expiresAt:now+ttl,phase:'PREPARED',attempts:0,updatedAt:now};
   (this.database.db.webhookRecoveryReviews??={})[id]=row;
   this.database.addAuditLog(c.account.id,'seller','WEBHOOK_RECOVERY_REVIEW_PREPARED',{reviewId:id,subscriptionId:row.subscriptionId,configurationSha256:row.configurationSha256,scope:'NEW_EVENTS_ONLY'});
   return this.publicRow(row,c.binding,proof.record.id);
  });
 }
 public async verify(proof:SessionProof,id:string){
  if(!reviewIdSchema.safeParse(id).success)throw new WebhookRecoveryError('WEBHOOK_REVIEW_INPUT_INVALID',400);
  const attempt=this.update(()=>{
   const c=this.current(proof,id);this.memoryMatches(c);if(!c.snapshot.review)throw new WebhookRecoveryError('WEBHOOK_REVIEW_NOT_FOUND',404);
   const row=this.row(c.snapshot.review),now=Date.now();
   if(row.id!==id||row.sessionId!==proof.record.id||!sameBinding(row,c.binding))throw new WebhookRecoveryError('WEBHOOK_REVIEW_BINDING_CHANGED');
   if(row.phase==='VERIFIED'){if(approvedRestoredSubscription(c.state,c.account.id,c.snapshot.webhook)?.reviewId!==id)throw new WebhookRecoveryError('WEBHOOK_REVIEW_BINDING_CHANGED');return {done:this.publicRow(row,c.binding,proof.record.id)};}
   if(row.phase==='CANCELLED'||now>=row.expiresAt||row.attempts>=3)throw new WebhookRecoveryError('WEBHOOK_REVIEW_EXPIRED_OR_EXHAUSTED');
   if(row.phase==='VERIFYING'&&(row.leaseExpiresAt??Infinity)>now)return {done:this.publicRow(row,c.binding,proof.record.id)};
   const nonce=crypto.randomBytes(32).toString('base64url'),leaseToken=crypto.randomUUID();
   row.attempts++;row.phase='VERIFYING';row.leaseToken=leaseToken;row.leaseExpiresAt=now+leaseMs;row.updatedAt=now;delete row.failure;
   const nonceBinding=[id,row.sellerId,row.configurationSha256,row.sourceSnapshotSha256,row.authContextSha256,row.attempts,nonce];
   row.nonceEncrypted=encryptEntitlement(JSON.stringify(nonceBinding));row.nonceSha256=webhookReviewDigest(nonce);
   this.database.db.webhookRecoveryReviews![id]=row;
   return {row:structuredClone(row),target:c.snapshot.webhook!.targetUrl,secret:c.snapshot.webhook!.secretEncrypted?decryptWebhookSecret(c.snapshot.webhook!.secretEncrypted,c.snapshot.webhook!.id):c.snapshot.webhook!.secret};
  });
  if(attempt.done)return attempt.done;
  const row=attempt.row!,timestamp=Math.floor(Date.now()/1000),eventId='evt_'+crypto.randomUUID();
  let success=false,responseSha256:string|undefined;
  try{
   const decoded=JSON.parse(decryptEntitlement(row.nonceEncrypted!));
   if(!Array.isArray(decoded)||decoded.length!==7||JSON.stringify(decoded.slice(0,6))!==JSON.stringify([id,row.sellerId,row.configurationSha256,row.sourceSnapshotSha256,row.authContextSha256,row.attempts])||! /^[A-Za-z0-9_-]{43}$/.test(decoded[6])||webhookReviewDigest(decoded[6])!==row.nonceSha256)throw Error();
   const body=JSON.stringify({version:1,id:eventId,event:'subscription.review',timestamp,createdAt:Date.now(),data:{reviewId:id,subscriptionId:row.subscriptionId,nonce:decoded[6],expiresAt:Math.min(row.expiresAt,row.leaseExpiresAt!),scope:'NEW_EVENTS_ONLY',chainId:row.chainId,hubAddress:row.hubAddress}});
   const reply=await this.send(attempt.target!,body,{'Content-Type':'application/json','X-GroupDeal-Signature':'sha256='+signWebhookPayload(body,attempt.secret!,timestamp),'X-GroupDeal-Timestamp':String(timestamp),'X-GroupDeal-Event':'subscription.review','X-GroupDeal-Event-Id':eventId,'User-Agent':'GroupDeal-Webhook-Review/1.0'});
   const expected=webhookReviewResponse(attempt.secret!,body);
   success=typeof reply==='string'&&/^[a-f0-9]{64}$/.test(reply)&&crypto.timingSafeEqual(Buffer.from(reply,'hex'),Buffer.from(expected,'hex'));if(success)responseSha256=webhookReviewDigest(reply);
  }catch{/* Store only a finite failure; never response bodies, nonce, credentials or remote errors. */}
  this.update(()=>{
   const live=this.database.db.webhookRecoveryReviews?.[id];
   if(!live||live.phase!=='VERIFYING'||live.leaseToken!==row.leaseToken)throw new WebhookRecoveryError('WEBHOOK_REVIEW_ATTEMPT_CHANGED');
   let c:ReturnType<WebhookRecoveryRegistry['current']>|undefined;
   try{c=this.current(proof,id);this.memoryMatches(c);const committed=this.row(c.snapshot.review);if(!sameBinding(live,c.binding)||live.id!==id||live.sessionId!==proof.record.id||committed.id!==id||committed.leaseToken!==row.leaseToken||committed.attempts!==row.attempts||committed.nonceEncrypted!==row.nonceEncrypted||committed.nonceSha256!==row.nonceSha256)throw Error();}catch{success=false;live.failure='BINDING_CHANGED';}
   if(Date.now()>=Math.min(live.expiresAt,live.leaseExpiresAt??0)){success=false;live.failure='EXPIRED';}
   delete live.leaseToken;delete live.leaseExpiresAt;delete live.nonceEncrypted;delete live.nonceSha256;live.updatedAt=Date.now();
   if(success&&c){
    live.phase='VERIFIED';live.verifiedAt=Date.now();live.responseSha256=responseSha256!;
    const barrier=readRestoredWorkBarrier(this.database.db)!;
    (barrier.subscriptionApprovals??={})[restoredWorkKey('webhooks',live.sellerId)]=signWebhookApproval({version:1,scope:'NEW_EVENTS_ONLY',...c.binding,reviewId:id,verifiedAt:live.verifiedAt,responseSha256:responseSha256!});this.database.db.restoredWork!.current=barrier;
    this.database.addAuditLog(live.sellerId,'seller','WEBHOOK_RECOVERY_NEW_EVENTS_ENABLED',{reviewId:id,subscriptionId:live.subscriptionId,configurationSha256:live.configurationSha256,responseSha256,scope:'NEW_EVENTS_ONLY'});
   }else{live.phase='FAILED';live.failure??='ENDPOINT_NOT_VERIFIED';}
   this.database.db.webhookRecoveryReviews![id]=live;
   // A lost/revoked session receives no private state, even after durable failure cleanup.
   return {row:live,binding:c?.binding};
  });
  return this.get(proof,id).review!;
 }
}
export const WebhookRecoveryService=new WebhookRecoveryRegistry(store);
