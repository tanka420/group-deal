import {encryptWebhookSecret,decryptWebhookSecret} from "./webhookSecret";
import * as crypto from "node:crypto";
import { store, WebhookSubscription, WebhookJobRecord, WebhookDLQRecord, DatabaseSchema } from "../db/store";
import { StorageConflict } from "../db/rowPersistence";
import { signWebhookPayload } from "../utils/crypto";
import { webhookPayload } from "./webhookPayload";
import { resolveWebhookTarget, postWebhook } from "./webhookTransport";
import {isRestoredWorkHeld,readRestoredWorkBarrier} from '../domain/restoredWork';
import {SessionService,SessionProof,SessionError} from './sessionService';
import {holdJobForRestoredSubscription} from './restoredWorkBarrier';
import {isRestoredSubscriptionHeld,approvedRestoredSubscription,restoredWebhookJobCanSend} from './webhookRecoveryPolicy';

export class RestoredSubscriptionError extends Error{constructor(public readonly code='RESTORED_SUBSCRIPTION_REVIEW_REQUIRED',public readonly status=409){super(code);}}

const leaseDuration=15000;
const supportedEvents=new Set(["order.committed","order.delivered","order.disputed","order.confirmed","order.refunded","order.breached","order.resolved","campaign.cancelled","campaign.finalized","campaign.tier_unlocked","*"]);

export class WebhookService {
  public static async validateWebhookUrl(targetUrl:string):Promise<void> {await resolveWebhookTarget(targetUrl);}
  private static sendWebhook=postWebhook;
  public static subscriptionDto(sub:WebhookSubscription,state:Pick<DatabaseSchema,'authRecovery'|'restoredWork'>=store.db,sellerId=sub.sellerId){
    if(sub.sellerId!==sellerId)throw new RestoredSubscriptionError('WEBHOOK_SUBSCRIPTION_UNAVAILABLE',503);
    const held=isRestoredSubscriptionHeld(state,sellerId,sub);
    return{id:sub.id,sellerId:sub.sellerId,targetUrl:sub.targetUrl,events:sub.events.filter(e=>supportedEvents.has(e)),secret:held?null:sub.secretEncrypted?decryptWebhookSecret(sub.secretEncrypted,sub.id):sub.secret,restoredReviewRequired:held,canConfigure:!held,canEnqueue:!held,
      logs:sub.logs.slice(0,50).map(log=>({id:log.id,event:supportedEvents.has(log.event)?log.event:'UNKNOWN',payload:webhookPayload(log.payload),status:['SUCCESS','FAILED','PENDING'].includes(log.status)?log.status:'UNKNOWN',statusCode:log.statusCode,timestamp:log.timestamp,attempts:log.attempts,error:log.error?'Webhook attempt failed':undefined}))};
  }

  public static async registerWebhook(sellerId:string,targetUrl:string,events:string[],proof?:SessionProof):Promise<WebhookSubscription> {
    if(!Array.isArray(events)||!events.length||events.some(event=>!supportedEvents.has(event)))throw new Error("Select supported webhook events");
    const snapshot=store.readSellerWebhookState(sellerId,proof?.key);
    if(proof){const account=SessionService.assertCommitted(proof,snapshot.auth);if(account.id!==sellerId||!account.roles.includes('seller'))throw new SessionError('WEBHOOK_SELLER_REQUIRED',403);}
    if(isRestoredSubscriptionHeld({authRecovery:snapshot.auth.authRecovery as DatabaseSchema['authRecovery'],restoredWork:snapshot.restoredWork},sellerId,snapshot.webhook))throw new RestoredSubscriptionError();
    await this.validateWebhookUrl(targetUrl);
    return store.transaction(()=>{
      if(proof){const account=SessionService.assertCommitted(proof,store.readAuthState(sellerId,proof.key));if(account.id!==sellerId||!account.roles.includes('seller'))throw new SessionError('WEBHOOK_SELLER_REQUIRED',403);}
      if(isRestoredSubscriptionHeld(store.db,sellerId,store.db.webhooks[sellerId]))throw new RestoredSubscriptionError();
      let sub=store.db.webhooks[sellerId];
      if(!sub){sub={id:"wh_"+crypto.randomUUID(),sellerId,targetUrl,secret:"whsec_"+crypto.randomBytes(24).toString("hex"),events:[...new Set(events)],logs:[]};store.db.webhooks[sellerId]=sub;}
      else {sub.targetUrl=targetUrl;sub.events=[...new Set(events)];}
      if(!sub.secretEncrypted)sub.secretEncrypted=encryptWebhookSecret(sub.secret,sub.id);sub.secret="";
      return sub;
    });
  }

  public static enqueueEvent(sellerId:string,eventName:string,payload:any,event?:{eventId:string;eventCreatedAt:number;redrive?:boolean},target=store):WebhookJobRecord|null {
    return target.transaction(()=>{
      const sub=target.db.webhooks[sellerId];
      const subscriptionHeld=isRestoredSubscriptionHeld(target.db,sellerId,sub);
      if(!sub?.targetUrl||!sub.events.includes(eventName)&&!sub.events.includes("*"))return null;
      const eventId=event?.eventId||"evt_"+crypto.randomUUID();
      if(!/^evt_[A-Za-z0-9_-]{1,80}$/.test(eventId))throw new Error("Invalid webhook event identifier");
      const prior=Object.values(target.db.webhookQueue).find(job=>job.sellerId===sellerId&&job.eventId===eventId&&(!event?.redrive||job.status!=="DLQ"));
      if(prior)return prior;
      const job:WebhookJobRecord={id:"job_"+crypto.randomUUID(),eventId,eventCreatedAt:event?.eventCreatedAt??Date.now(),sellerId,targetUrl:sub.targetUrl,secret:"",eventName,payload:webhookPayload(payload),status:"QUEUED",attempts:0,maxAttempts:3,nextAttemptAt:Date.now(),createdAt:Date.now()};
      job.secretEncrypted=encryptWebhookSecret(sub.secretEncrypted?decryptWebhookSecret(sub.secretEncrypted,sub.id):sub.secret,job.id);
      const approval=approvedRestoredSubscription(target.db,sellerId,sub);if(approval)job.subscriptionReviewId=approval.reviewId;
      target.db.webhookQueue[job.id]=job;if(subscriptionHeld)holdJobForRestoredSubscription(target.db,job);return job;
    });
  }

  public static async dispatchEvent(sellerId:string,eventName:string,payload:any):Promise<void>{if(this.enqueueEvent(sellerId,eventName,payload))await this.processQueue();}

  private static deadLetter(job:WebhookJobRecord,error:string):void {
    job.status="DLQ";delete job.leaseToken;delete job.leaseExpiresAt;job.lastError=error;
    const id="dlq_"+job.id;
    const record:WebhookDLQRecord={id,eventId:job.eventId,eventCreatedAt:job.eventCreatedAt,jobId:job.id,sellerId:job.sellerId,targetUrl:job.targetUrl,eventName:job.eventName,payload:webhookPayload(job.payload),error,failedAt:Date.now(),replayed:false};
    store.db.webhookDLQ[id]=record;
    store.addAuditLog("system","operator","WEBHOOK_MOVED_TO_DLQ",{jobId:job.id,dlqId:id,sellerId:job.sellerId,error},"webhook-dlq:"+job.id);
  }

  /** A persisted lease precedes the network call. A crash may repeat a delivery, with exactly the same event ID. */
  public static async processQueue():Promise<{processed:number;succeeded:number;failed:number}> {
    let processed=0,succeeded=0,failed=0;
    try{store.save();}catch(error){if(!(error instanceof StorageConflict))throw error;}
    readRestoredWorkBarrier(store.db);
    const due=Object.entries(store.db.webhookQueue).filter(([id,job])=>job.id===id&&restoredWebhookJobCanSend(store.db,job)&&(job.status==="QUEUED"&&job.nextAttemptAt<=Date.now()||job.status==="PROCESSING"&&(job.leaseExpiresAt??0)<=Date.now())).slice(0,50);
    for(const [id] of due) {
      let claimed:WebhookJobRecord|undefined;
      try {
        claimed=store.transaction(()=>{
          const job=store.db.webhookQueue[id],now=Date.now();
          if(!job||!restoredWebhookJobCanSend(store.db,job)||job.status!=="QUEUED"&&job.status!=="PROCESSING"||job.status==="QUEUED"&&job.nextAttemptAt>now||job.status==="PROCESSING"&&(job.leaseExpiresAt??0)>now)return undefined;
          job.eventId||="evt_"+job.id;job.eventCreatedAt??=job.createdAt;job.payload=webhookPayload(job.payload);
          if(job.attempts>=job.maxAttempts){this.deadLetter(job,"Webhook retry budget exhausted after interrupted delivery");return undefined;}
          job.status="PROCESSING";job.attempts++;job.leaseToken=crypto.randomUUID();job.leaseExpiresAt=now+leaseDuration;
          return structuredClone(job);
        });
      }catch(error){if(error instanceof StorageConflict)continue;throw error;}
      if(!claimed)continue;
      processed++;
      let statusCode:number|undefined,success=false,error="Webhook request or egress policy failed";
      try {
        const timestamp=Math.floor(Date.now()/1000);
        const body=JSON.stringify({id:claimed.eventId,createdAt:claimed.eventCreatedAt,event:claimed.eventName,timestamp,data:claimed.payload});
        statusCode=await this.sendWebhook(claimed.targetUrl,body,{"Content-Type":"application/json","X-GroupDeal-Signature":"sha256="+signWebhookPayload(body,claimed.secretEncrypted?decryptWebhookSecret(claimed.secretEncrypted,claimed.id):claimed.secret,timestamp),"X-GroupDeal-Timestamp":String(timestamp),"X-GroupDeal-Event":claimed.eventName,"X-GroupDeal-Event-Id":claimed.eventId!,"User-Agent":"GroupDeal-Webhook-Dispatcher/2.0"});
        success=statusCode>=200&&statusCode<300;if(!success)error="Webhook endpoint did not acknowledge with HTTP 2xx";
      }catch{/* Do not persist remote errors, URLs, secrets or response content. */}
      let finished=false;
      for(let retry=0;retry<3&&!finished;retry++) {
        try {
          finished=store.transaction(()=>{
            const job=store.db.webhookQueue[id];
            if(!job||!restoredWebhookJobCanSend(store.db,job)||job.status!=="PROCESSING"||job.leaseToken!==claimed!.leaseToken)return false;
            delete job.leaseToken;delete job.leaseExpiresAt;
            if(success){job.status="COMPLETED";job.completedAt=Date.now();delete job.lastError;}
            else if(job.attempts>=job.maxAttempts)this.deadLetter(job,error);
            else {job.status="QUEUED";job.lastError=error;job.nextAttemptAt=Date.now()+1000*2**(job.attempts-1);}
            const sub=store.db.webhooks[job.sellerId];
            if(sub){sub.logs.unshift({id:"log_"+crypto.randomUUID(),event:job.eventName,payload:webhookPayload(job.payload),status:success?"SUCCESS":(job as WebhookJobRecord).status==="DLQ"?"FAILED":"PENDING",statusCode,timestamp:Date.now(),attempts:job.attempts,error:success?undefined:error});sub.logs=sub.logs.slice(0,50);}
            return true;
          });
          if(!finished)break; // Another lease owns this attempt; don't overwrite its result.
        }catch(error){if(!(error instanceof StorageConflict))throw error;}
      }
      if(finished){if(success)succeeded++;else failed++;}
      if(processed>=50)break;
    }
    return {processed,succeeded,failed};
  }

  public static async replayDLQ(dlqId:string):Promise<boolean> {
    const replayed=store.transaction(()=>{
      const dlq=store.db.webhookDLQ[dlqId];if(!dlq||dlq.replayed||isRestoredWorkHeld(store.db,'webhookDLQ',dlqId)||isRestoredWorkHeld(store.db,'webhookQueue',dlq.jobId)||isRestoredSubscriptionHeld(store.db,dlq.sellerId,store.db.webhooks[dlq.sellerId])||isRestoredWorkHeld(store.db,'webhooks',dlq.sellerId)&&(!store.db.webhookQueue[dlq.jobId]||!restoredWebhookJobCanSend(store.db,store.db.webhookQueue[dlq.jobId])))return false;
      const newJob=this.enqueueEvent(dlq.sellerId,dlq.eventName,dlq.payload,{eventId:dlq.eventId||"evt_"+dlq.jobId,eventCreatedAt:dlq.eventCreatedAt??dlq.failedAt,redrive:true});
      if(!newJob)return false;
      dlq.replayed=true;dlq.replayedAt=Date.now();
      store.addAuditLog("system","operator","WEBHOOK_DLQ_REPLAYED",{dlqId,originalJobId:dlq.jobId,newJobId:newJob.id},"webhook-redrive:"+dlqId);
      return true;
    });
    if(replayed)await this.processQueue();return replayed;
  }
}
