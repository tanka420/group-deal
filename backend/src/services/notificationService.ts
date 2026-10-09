import * as crypto from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { config } from "../config";
import { store,TransactionalStore,type DatabaseSchema, NotificationPreferenceRecord, NotificationRecord, EmailOutboxRecord } from "../db/store";
import { StorageConflict,LegacyWriterConflict,type OperatorMailState,type OperatorMailFrame,type OperatorMailPlan,type OperatorMailSelection } from '../db/rowPersistence';
import {SessionRegistry,SessionError,type SessionProof} from './sessionService';
import { encryptEntitlement, decryptEntitlement } from "../utils/crypto";
import { verifiedContactEmail, verifiedContactEmailFor, contactStatusFor, contactStatus, challengeTarget, contactCodeMatches } from "./contactIdentity";
import {notificationSource} from "./notificationSource";
import {isRestoredWorkHeld,readRestoredWorkBarrier} from '../domain/restoredWork';

export type EmailSender = (input: { to: string; subject: string; text: string; idempotencyKey: string }) => Promise<void>;
type NotificationCreateInput=Pick<NotificationRecord, "type" | "title" | "message" | "link" | "source" | "translations"> & { dedupeKey?: string;channel?:'IN_APP_ONLY' };
const notificationCreateSchema=z.object({type:z.string().min(1).max(128),title:z.string().max(500),message:z.string().max(64000),link:z.unknown().optional(),source:z.unknown().optional(),translations:z.unknown().optional(),dedupeKey:z.string().min(1).max(1024).optional(),channel:z.literal('IN_APP_ONLY').optional()}).strict();
const recipientSchema = z.string().email().max(254);
const preferencesSchema = z.object({ inApp: z.boolean().optional(), email: z.boolean().optional() }).strict();
const eventPayloadSchema = z.object({
  version: z.literal(1), outboxId: z.string(), userId: z.string(), notificationId: z.string(),
  to: recipientSchema, subject: z.string().min(1).max(500), text: z.string().max(64000),
}).strict();
const contactPayloadSchema=z.object({version:z.literal(2),kind:z.literal("CONTACT_VERIFICATION"),outboxId:z.string(),userId:z.string(),challengeId:z.string(),to:recipientSchema,code:z.string().regex(/^\d{6}$/),language:z.enum(["vi","en"])}).strict();
const payloadSchema=z.discriminatedUnion("version",[eventPayloadSchema,contactPayloadSchema]);
type MailPayload = {to:string;subject:string;text:string;contactChallengeId?:string};
const leaseDuration = 60000;
const failureCodes = new Set(["CONTACT_UNVERIFIED", "CONTACT_CHANGED", "CONTACT_CHALLENGE_INACTIVE", "EMAIL_DISABLED", "PAYLOAD_INVALID", "LEGACY_RECIPIENT_UNBOUND", "RETRY_BUDGET_EXHAUSTED", "PROVIDER_NOT_ACKNOWLEDGED", "OPERATOR_CANCELLED"]);
const outboxQuerySchema=z.object({limit:z.string().regex(/^(?:[1-9]\d?|100)$/).default("20"),status:z.enum(["QUEUED","PROCESSING","SENT","RETRY","DLQ","CANCELLED"]).optional(),cursor:z.string().max(1024).optional()}).strict();
const redriveSchema=z.object({idempotencyKey:z.string().uuid(),expectedAttempts:z.number().int().min(0).max(15),expectedRedriveCount:z.number().int().min(0).max(2)}).strict();
const redriveHistorySchema=z.array(z.object({requestId:z.string().uuid(),actorId:z.string().min(1).max(128),createdAt:z.number().int().nonnegative()}).strict()).max(2);
const notificationQuerySchema=z.object({limit:z.string().regex(/^(?:[1-9]\d?|100)$/).default("20"),cursor:z.string().max(1024).optional()}).strict();
export class OutboxError extends Error {constructor(public code:string,public status=409){super(code);}}

export class NotificationService {
  public static preferences(userId: string,target=store): NotificationPreferenceRecord {
    const stored = target.db.notificationPreferences[userId];
    return { inApp: stored?.inApp !== false, email: stored?.email !== false };
  }

  public static contactStatus(userId: string): "VERIFIED" | "UNVERIFIED" | "MISSING" {
    return contactStatus(userId);
  }

  public static updatePreferences(userId: string, input: unknown): NotificationPreferenceRecord {
    const parsed = preferencesSchema.parse(input);
    return store.transaction(() => {
      if (!store.db.users[userId]) throw new Error("NOT_FOUND: user");
      const current = this.preferences(userId);
      const next = { inApp: parsed.inApp ?? current.inApp, email: parsed.email ?? current.email };
      store.db.notificationPreferences[userId] = next;
      store.addAuditLog(userId, "user", "NOTIFICATION_PREFERENCES_UPDATED", next);
      return next;
    });
  }

  private static publicNotification(n: NotificationRecord,target=store,graph?:DatabaseSchema): NotificationRecord|null {
    const source=notificationSource(n.source,n.userId,graph?{state:graph,allowPendingSupport:true,allowPendingCampaign:true}:target===store?{}:{state:target.db,allowPendingCampaign:true}),english=n.translations?.en;
    if((typeof n.type==='string'&&n.type.startsWith('SELLER_FOLLOW_')||n.source?.kind==='SELLER_FOLLOW_EVENT')&&source?.kind!=='SELLER_FOLLOW_EVENT')return null;
    if((n.type==='SUPPORT_TICKET_EVENT'||n.source?.kind==='SUPPORT_TICKET')&&source?.kind!=='SUPPORT_TICKET')return null;
    return { id: n.id, userId: n.userId, type: n.type, title: n.title, message: n.message,
      ...(n.link !== undefined ? { link: n.link } : {}), createdAt: n.createdAt,
      ...(n.readAt !== undefined ? { readAt: n.readAt } : {}),
      ...(source?{source}:{}),...(english&&typeof english.title==="string"&&typeof english.message==="string"?{translations:{en:{title:english.title,message:english.message}}}:{}) };
  }

  public static create(userId:string,input:NotificationCreateInput,target=store):NotificationRecord|null {
    const parsed=notificationCreateSchema.safeParse(input);if(!parsed.success)throw new OutboxError('NOTIFICATION_INVALID_INPUT',400);input=parsed.data as NotificationCreateInput;
      const id = input.dedupeKey ? `ntf_${crypto.createHash("sha256").update(`${userId}:${input.dedupeKey}`).digest("hex")}` : `ntf_${crypto.randomUUID()}`;
    if(target!==store&&!(target instanceof TransactionalStore))return (target as Pick<TransactionalStore,'db'|'transaction'>).transaction(()=>this.createPrepared(userId,input,(target as Pick<TransactionalStore,'db'|'transaction'>).db,id));
    try{return target.mutateNotificationProducer({userId,notificationId:id,source:input.source},graph=>this.createPrepared(userId,input,graph,id));}catch(error){if(error instanceof OutboxError||error instanceof Error&&error.message==='NOTIFICATION_SOURCE_INVALID')throw error;if(error instanceof StorageConflict||error instanceof LegacyWriterConflict)throw new OutboxError('NOTIFICATION_CONCURRENT_WRITE',409);throw new OutboxError('NOTIFICATION_UNAVAILABLE',503);}
  }
  private static createPrepared(userId:string,input:NotificationCreateInput,graph:DatabaseSchema,id:string):NotificationRecord|null {
      const user = graph.users[userId];
      if (!user) return null;
      const stored=graph.notificationPreferences[userId];if(stored!==undefined&&!z.object({inApp:z.boolean().optional(),email:z.boolean().optional()}).passthrough().safeParse(stored).success)throw new OutboxError('NOTIFICATION_UNAVAILABLE',503);const preferences={inApp:stored?.inApp!==false,email:stored?.email!==false};

      const existing = graph.notifications[id];
      if (existing) return existing.inAppEnabled !== false ? this.publicNotification(existing,store,graph) : null;
      const source=input.source?notificationSource(input.source,userId,{allowPendingSupport:true,allowPendingCampaign:true,state:graph}):undefined;
      if(input.source&&!source)throw new Error("NOTIFICATION_SOURCE_INVALID");
      const english=input.translations?z.object({title:z.string().min(1).max(500),message:z.string().max(64000)}).parse(input.translations.en):undefined;
      const notification: NotificationRecord = { id, userId, type: input.type, title: input.title,
        message: input.message, link: input.link, createdAt: Date.now(), inAppEnabled: preferences.inApp,
        ...(source?{source}:{}),...(english?{translations:{en:english}}:{}) };
      graph.notifications[id] = notification;
      if (input.channel!=='IN_APP_ONLY'&&preferences.email && verifiedContactEmailFor(userId,user)!==null) {
        const outboxId = `mail_${id}`;
        const payload = eventPayloadSchema.parse({ version: 1, outboxId, userId, notificationId: id,
          to: verifiedContactEmailFor(userId,user), subject: notification.title, text: notification.message });
        graph.emailOutbox[outboxId] = { id: outboxId, notificationId: id, userId, status: "QUEUED",
          attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now(), payloadEncrypted: encryptEntitlement(JSON.stringify(payload)) };
      }
      return preferences.inApp ? this.publicNotification(notification,store,graph) : null;

  }

  public static list(userId: string): NotificationRecord[] {
    return Object.values(store.db.notifications).filter(n => n.userId === userId && n.inAppEnabled !== false)
      .sort((a,b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).map(n => this.publicNotification(n)).filter((n):n is NotificationRecord=>n!==null).slice(0,100);
  }

  public static notificationPage(userId:string,query:unknown) {
    const parsed=notificationQuerySchema.safeParse(query);if(!parsed.success)throw new OutboxError("NOTIFICATION_INVALID_QUERY",400);
    const {cursor}=parsed.data,limit=Number(parsed.data.limit),scope=crypto.createHash("sha256").update(userId).digest("hex");
    const sign=(value:string)=>crypto.createHmac("sha256",config.jwtSecret).update("groupdeal:notification:cursor:v1:"+value).digest("hex");
    let boundary:{createdAt:number;id:string}|undefined;
    if(cursor){
      try{
        const [data,mac,...extra]=cursor.split(".");if(extra.length||!/^[A-Za-z0-9_-]+$/.test(data)||!/^[a-f0-9]{64}$/.test(mac))throw new Error();
        if(!crypto.timingSafeEqual(Buffer.from(sign(data),"hex"),Buffer.from(mac,"hex")))throw new Error();const value=JSON.parse(Buffer.from(data,"base64url").toString("utf8"));
        if(!Array.isArray(value)||value.length!==4||value[0]!==1||value[1]!==scope||!Number.isSafeInteger(value[2])||value[2]<0||typeof value[3]!=="string"||!/^[A-Za-z0-9_-]{1,180}$/.test(value[3]))throw new Error();boundary={createdAt:value[2],id:value[3]};
      }catch{throw new OutboxError("NOTIFICATION_INVALID_CURSOR",400);}
    }
    const owned=Object.values(store.db.notifications).filter(n=>n.userId===userId&&n.inAppEnabled!==false).map(n=>this.publicNotification(n)).filter((n):n is NotificationRecord=>n!==null),unread=owned.filter(n=>!n.readAt).length;
    const records=owned.filter(n=>!boundary||n.createdAt<boundary.createdAt||n.createdAt===boundary.createdAt&&n.id<boundary.id).sort((a,b)=>b.createdAt-a.createdAt||(a.id===b.id?0:a.id<b.id?1:-1));
    const selected=records.slice(0,limit),last=selected.at(-1),data=last&&records.length>limit?Buffer.from(JSON.stringify([1,scope,last.createdAt,last.id])).toString("base64url"):null;
    return {notifications:selected.map(n=>this.publicNotification(n)),unread,pagination:{limit,nextCursor:data?data+"."+sign(data):null}};
  }

  public static markRead(userId: string, notificationId: string): NotificationRecord {
    return store.transaction(() => {
      const notification = store.db.notifications[notificationId];
      if (!notification || notification.userId !== userId || notification.inAppEnabled === false||!this.publicNotification(notification)) throw new Error("Notification not found");
      notification.readAt ||= Date.now();
      return this.publicNotification(notification)!;
    });
  }

  private static proofOperator(actorId:string,proof?:SessionProof){if(!proof||proof.account.id!==actorId||typeof proof.key!=='string')throw new SessionError('AUTH_SESSION_INVALID');return proof;}
  private static operator(actorId:string,proof:SessionProof,state:OperatorMailState,target:TransactionalStore){const user=new SessionRegistry(target).assertOperatorCommitted(proof,state.auth);if(!user.roles.includes('operator'))throw new OutboxError('FORBIDDEN',403);}
  private static operatorFailure(e:unknown):never{if(e instanceof OutboxError||e instanceof SessionError)throw e;if(e instanceof StorageConflict||e instanceof LegacyWriterConflict)throw new OutboxError('OUTBOX_CONCURRENT_WRITE');throw new OutboxError('OUTBOX_UNAVAILABLE',503);}
  private static readOperator<T>(actorId:string,proof:SessionProof|undefined,jobId:string|undefined,target:TransactionalStore,fn:(state:OperatorMailState)=>T):T {const current=this.proofOperator(actorId,proof);try{return target.readOperatorMail(actorId,current.key,jobId,state=>{this.operator(actorId,current,state,target);return fn(state);});}catch(e){return this.operatorFailure(e);}}
  private static redrives(job:EmailOutboxRecord) {const rows=redriveHistorySchema.parse(job.redrives??[]);if(new Set(rows.map(r=>r.requestId)).size!==rows.length)throw new Error('REDRIVE_HISTORY_INVALID');return rows;}
  private static attemptLimit(job:EmailOutboxRecord):number {try{return 5*(this.redrives(job).length+1);}catch{return 5;}}
  private static operatorHistory(job:EmailOutboxRecord,frame:OperatorMailFrame){let history;try{history=this.redrives(job);}catch{throw new OutboxError('REDRIVE_HISTORY_INVALID');}for(const[r,index]of history.map((r,index)=>[r,index] as const)){const matches=(frame.receipts[job.id]??[]).filter(a=>a.actor===r.actorId&&a.role==='operator'&&a.action==='EMAIL_REDRIVE_REQUESTED'&&a.details?.outboxId===job.id&&a.details.requestId===r.requestId&&a.details.redriveCount===index+1);if(matches.length!==1)throw new OutboxError('OUTBOX_UNAVAILABLE',503);}return history;}
  private static redriveReason(job:EmailOutboxRecord,state:DatabaseSchema=store.db):string {
    if(isRestoredWorkHeld(state,'emailOutbox',job.id))return 'RESTORED_WORK_REVIEW_REQUIRED';if(job.purpose)return 'CONTACT_REQUEST_REQUIRES_USER';if(job.status!=='DLQ')return 'JOB_NOT_DLQ';if(!['PROVIDER_NOT_ACKNOWLEDGED','RETRY_BUDGET_EXHAUSTED'].includes(job.lastError??''))return 'FAILURE_NOT_RETRYABLE';try{if(this.redrives(job).length>=2)return 'REDRIVE_BUDGET_EXHAUSTED';}catch{return 'REDRIVE_HISTORY_INVALID';}if(!job.payloadEncrypted)return 'LEGACY_RECIPIENT_UNBOUND';try{const payload=this.payload(job,state),notification=state.notifications[job.notificationId];if(payload.contactChallengeId||!notificationSource(notification?.source,job.userId,{state,allowPendingSupport:true,allowPendingCampaign:true}))return 'SOURCE_UNVERIFIED';if(contactStatusFor(job.userId,state.users[job.userId])!=='VERIFIED'||verifiedContactEmailFor(job.userId,state.users[job.userId])!==payload.to)return 'CONTACT_NOT_CURRENT';const p=state.notificationPreferences[job.userId];if(p!==undefined&&!z.object({email:z.boolean().optional(),inApp:z.boolean().optional()}).passthrough().safeParse(p).success)return 'PAYLOAD_INVALID';if(p?.email===false)return 'EMAIL_DISABLED';}catch{return 'PAYLOAD_INVALID';}return 'READY';
  }
  private static outboxDto(j:EmailOutboxRecord,frame:OperatorMailFrame){if(!j||! /^[A-Za-z0-9_-]{1,180}$/.test(j.id)||typeof j.notificationId!=='string'||j.notificationId.length>180||!['QUEUED','PROCESSING','SENT','RETRY','DLQ','CANCELLED'].includes(j.status)||![j.attempts,j.createdAt,j.nextAttemptAt].every(n=>Number.isSafeInteger(n)&&n>=0)||j.createdAt>8640000000000000||j.nextAttemptAt>8640000000000000)throw new OutboxError('OUTBOX_UNAVAILABLE',503);const reason=this.redriveReason(j,frame.graph);let requests:string[]=[];try{requests=this.operatorHistory(j,frame).map(r=>r.requestId);}catch(e){if(!(e instanceof OutboxError&&e.code==='REDRIVE_HISTORY_INVALID'))throw e;}const source=notificationSource(frame.graph.notifications[j.notificationId]?.source,j.userId,{state:frame.graph,allowPendingSupport:true,allowPendingCampaign:true});return{id:j.id,notificationId:j.notificationId,purpose:j.purpose??'EVENT_NOTIFICATION',status:j.status,attempts:j.attempts,attemptLimit:this.attemptLimit(j),nextAttemptAt:j.nextAttemptAt,createdAt:j.createdAt,sentAt:j.sentAt,lastError:j.lastError?(failureCodes.has(j.lastError)?j.lastError:'LEGACY_ERROR_REDACTED'):undefined,leaseExpiresAt:j.status==='PROCESSING'?j.leaseExpiresAt:undefined,redriveCount:requests.length,redriveRequestIds:requests,canRedrive:reason==='READY',redriveReason:reason,canCancel:reason!=='RESTORED_WORK_REVIEW_REQUIRED'&&['QUEUED','RETRY','PROCESSING'].includes(j.status),...(source?{source}:{})};}
  public static listEmailOutbox(operatorId:string,query:unknown,proof?:SessionProof,target=store){this.proofOperator(operatorId,proof);const parsed=outboxQuerySchema.safeParse(query);if(!parsed.success)throw new OutboxError('OUTBOX_INVALID_QUERY',400);const options=parsed.data,limit=Number(options.limit),scope=crypto.createHash('sha256').update(JSON.stringify([operatorId,options.status??null])).digest('hex'),sign=(value:string)=>crypto.createHmac('sha256',config.jwtSecret).update('groupdeal:outbox:cursor:v1:'+value).digest('hex');let boundary:{createdAt:number;id:string}|undefined;if(options.cursor)try{const[data,mac,...extra]=options.cursor.split('.');if(extra.length||!/^[A-Za-z0-9_-]+$/.test(data)||!/^[a-f0-9]{64}$/.test(mac)||!crypto.timingSafeEqual(Buffer.from(sign(data),'hex'),Buffer.from(mac,'hex')))throw Error();const v=JSON.parse(Buffer.from(data,'base64url').toString());if(!Array.isArray(v)||v.length!==4||v[0]!==1||v[1]!==scope||!Number.isSafeInteger(v[2])||v[2]<0||v[2]>8640000000000000||typeof v[3]!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(v[3]))throw Error();boundary={createdAt:v[2],id:v[3]};}catch{throw new OutboxError('OUTBOX_INVALID_CURSOR',400);}return this.readOperator(operatorId,proof,undefined,target,state=>{const page=state.page(limit+1,options.status,boundary),jobs=page.jobs.slice(0,limit).map(j=>this.outboxDto(j,page.frame)),last=jobs.at(-1),data=last&&page.jobs.length>limit?Buffer.from(JSON.stringify([1,scope,last.createdAt,last.id])).toString('base64url'):null;return{jobs,pagination:{limit,nextCursor:data?data+'.'+sign(data):null},providerConfigured:config.smtpConfigured||!!(config.emailProviderUrl&&config.emailProviderToken)};});}
  public static emailOutbox(operatorId:string,proof?:SessionProof,target=store){return this.listEmailOutbox(operatorId,{limit:'100'},proof,target).jobs;}
  public static outboxJob(operatorId:string,jobId:string,proof?:SessionProof,target=store){this.proofOperator(operatorId,proof);if(!/^[A-Za-z0-9_-]{1,180}$/.test(jobId))throw new OutboxError('OUTBOX_INVALID_INPUT',400);return this.readOperator(operatorId,proof,jobId,target,state=>{if(!state.job)throw new OutboxError('OUTBOX_NOT_FOUND',404);return{job:this.outboxDto(state.job,state)};});}
  private static mutateOperator<T>(operatorId:string,jobId:string,proof:SessionProof|undefined,target:TransactionalStore,action:OperatorMailSelection['action'],fn:(state:OperatorMailState)=>OperatorMailPlan<T>,requestHash?:string):T{const current=this.proofOperator(operatorId,proof);if(!/^[A-Za-z0-9_-]{1,180}$/.test(jobId))throw new OutboxError('OUTBOX_INVALID_INPUT',400);try{return target.mutateOperatorMail({actorId:operatorId,sessionKey:current.key,jobId,action,requestHash},state=>{this.operator(operatorId,current,state,target);return fn(state);});}catch(e){return this.operatorFailure(e);}}
  public static redriveEmail(operatorId:string,jobId:string,input:unknown,proof?:SessionProof,target=store){this.proofOperator(operatorId,proof);const parsed=redriveSchema.safeParse(input);if(!parsed.success)throw new OutboxError('OUTBOX_INVALID_INPUT',400);const requestHash=crypto.createHash('sha256').update(JSON.stringify([operatorId,jobId,parsed.data.idempotencyKey,parsed.data.expectedAttempts,parsed.data.expectedRedriveCount])).digest('hex');return this.mutateOperator(operatorId,jobId,proof,target,'REDRIVE',state=>{const job=state.job;if(!job)throw new OutboxError('OUTBOX_NOT_FOUND',404);if(isRestoredWorkHeld(state.graph,'emailOutbox',job.id))throw new OutboxError('RESTORED_WORK_REVIEW_REQUIRED');const history=this.operatorHistory(job,state),prior=history.find(r=>r.requestId===parsed.data.idempotencyKey);if(prior){if(prior.actorId!==operatorId)throw new OutboxError('OUTBOX_IDEMPOTENCY_CONFLICT');const receipt=state.receipts[job.id].find(a=>a.actor===operatorId&&a.role==='operator'&&a.details?.requestId===prior.requestId)!;if(receipt.details.requestHash!==undefined&&receipt.details.requestHash!==requestHash)throw new OutboxError('OUTBOX_IDEMPOTENCY_CONFLICT');return{result:{job:this.outboxDto(job,state),requestId:prior.requestId}};}if(job.attempts!==parsed.data.expectedAttempts||history.length!==parsed.data.expectedRedriveCount)throw new OutboxError('OUTBOX_STALE_STATE');const reason=this.redriveReason(job,state.graph);if(reason!=='READY')throw new OutboxError(reason);const redrive={requestId:parsed.data.idempotencyKey,actorId:operatorId,createdAt:Date.now()},next={...job,redrives:[...history,redrive],status:'RETRY' as const,nextAttemptAt:redrive.createdAt};delete next.lastError;delete next.leaseToken;delete next.leaseExpiresAt;const frame={...state,receipts:{...state.receipts,[job.id]:[...(state.receipts[job.id]??[]),{actor:operatorId,role:'operator',action:'EMAIL_REDRIVE_REQUESTED',details:{outboxId:job.id,requestId:redrive.requestId,redriveCount:history.length+1,requestHash}} as DatabaseSchema['auditLogs'][number]]}};return{result:{job:this.outboxDto(next,frame),requestId:redrive.requestId},redrive};},requestHash);}
  public static cancelEmail(operatorId:string,jobId:string,proof?:SessionProof,target=store){return this.mutateOperator(operatorId,jobId,proof,target,'CANCEL',state=>{const job=state.job;if(!job)throw new OutboxError('OUTBOX_NOT_FOUND',404);if(isRestoredWorkHeld(state.graph,'emailOutbox',job.id))throw new OutboxError('RESTORED_WORK_REVIEW_REQUIRED');if(job.status==='CANCELLED')return{result:{job:this.outboxDto(job,state)}};if(!['QUEUED','RETRY','PROCESSING'].includes(job.status))throw new OutboxError('OUTBOX_CANNOT_CANCEL');const next={...job,status:'CANCELLED' as const,lastError:'OPERATOR_CANCELLED'};delete next.leaseToken;delete next.leaseExpiresAt;return{result:{job:this.outboxDto(next,state)},cancel:true};});}

  private static defaultEmailSender: EmailSender = async ({to,subject,text,idempotencyKey}) => {
    if (config.smtpConfigured) {
      const transporter = nodemailer.createTransport({ host:config.smtpHost, port:config.smtpPort, secure:config.smtpSecure,
        requireTLS:!config.smtpSecure, auth:{user:config.smtpUser,pass:config.smtpAppPassword}, tls:{minVersion:"TLSv1.2"},
        connectionTimeout:10000, greetingTimeout:10000, socketTimeout:15000,
        logger:false, debug:false, disableFileAccess:true, disableUrlAccess:true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([transporter.sendMail({from:config.smtpFrom,to,subject,text,
          messageId:`<${idempotencyKey}@groupdeal.local>`,headers:{"X-GroupDeal-Idempotency-Key":idempotencyKey}}),
          new Promise<never>((_resolve,reject) => { timer=setTimeout(() => reject(new Error("SMTP_TIMEOUT")),30000); })]);
        if (!result.accepted.some((address: any) => (typeof address === "string" ? address : address?.address)?.toLowerCase() === to.toLowerCase())) throw new Error("SMTP_NOT_ACCEPTED");
      } finally { if (timer) clearTimeout(timer); transporter.close(); }
      return;
    }
    if (!config.emailProviderUrl || !config.emailProviderToken) throw new Error("EMAIL_NOT_CONFIGURED");
    const response = await fetch(config.emailProviderUrl, { method:"POST", redirect:"error",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${config.emailProviderToken}`,"Idempotency-Key":idempotencyKey},
      body:JSON.stringify({to,subject,text}),signal:AbortSignal.timeout(10000) });
    await response.body?.cancel().catch(() => {});
    if (!response.ok) throw new Error("EMAIL_NOT_ACKNOWLEDGED");
  };

  private static payload(job: EmailOutboxRecord,state:DatabaseSchema=store.db): MailPayload {
    const payload = payloadSchema.parse(JSON.parse(decryptEntitlement(job.payloadEncrypted!)));
    if(payload.version===2){
      const pending=state.users[job.userId]?.contact?.pending;
      if(job.purpose!=="CONTACT_VERIFICATION"||payload.outboxId!==job.id||payload.userId!==job.userId||payload.challengeId!==job.contactChallengeId||payload.challengeId!==job.notificationId||!pending||pending.id!==payload.challengeId||pending.outboxId!==job.id||challengeTarget(job.userId,pending)!==payload.to||!contactCodeMatches(job.userId,pending,payload.code))throw new Error("PAYLOAD_INVALID");
      const en=payload.language==="en";
      return {to:payload.to,contactChallengeId:payload.challengeId,subject:en?"Verify your GroupDeal contact email":"Xác minh email liên hệ GroupDeal",text:en?`Your contact verification code is ${payload.code}. It expires 5 minutes after it was requested. This does not change your login or wallet. If you did not request this, ignore this email.`:`Mã xác minh email liên hệ của bạn là ${payload.code}. Mã hết hạn 5 phút sau khi yêu cầu. Thao tác này không đổi đăng nhập hoặc ví. Nếu bạn không yêu cầu, hãy bỏ qua email này.`};
    }
    const notification = state.notifications[job.notificationId];
    if (job.purpose || payload.outboxId !== job.id || payload.notificationId !== job.notificationId || payload.userId !== job.userId
      || !notification || notification.userId !== job.userId || notification.title !== payload.subject || notification.message !== payload.text) throw new Error("PAYLOAD_INVALID");
    return payload;
  }

  public static cancelContactMail(userId:string,challengeId:string):void {
    for(const job of Object.values(store.db.emailOutbox))if(job.userId===userId&&job.contactChallengeId===challengeId&&!isRestoredWorkHeld(store.db,'emailOutbox',job.id)&&["QUEUED","RETRY","PROCESSING"].includes(job.status))this.terminate(job,"CANCELLED","CONTACT_CHALLENGE_INACTIVE");
  }
  public static cancelUserMail(userId:string):void {
    for(const job of Object.values(store.db.emailOutbox))if(job.userId===userId&&!isRestoredWorkHeld(store.db,'emailOutbox',job.id)&&["QUEUED","RETRY","PROCESSING"].includes(job.status))this.terminate(job,"CANCELLED","CONTACT_CHANGED");
  }

  private static terminate(job: EmailOutboxRecord, status: "DLQ" | "CANCELLED", code: string): void {
    job.status=status; job.lastError=code; delete job.leaseToken; delete job.leaseExpiresAt;
    store.addAuditLog("system","operator",status === "DLQ" ? "EMAIL_NOTIFICATION_DLQ" : "EMAIL_NOTIFICATION_CANCELLED",
      {outboxId:job.id,notificationId:job.notificationId,attempts:job.attempts,reason:code},`email-terminal:${job.id}:${code}`);
  }

  /** Selected SQL leases guard overlapping drains; provider delivery remains at least once. */
  public static async processEmailOutbox(sender:EmailSender=this.defaultEmailSender,target:TransactionalStore=store):Promise<number> {
    if(!config.smtpConfigured&&!config.emailProviderUrl&&sender===this.defaultEmailSender)return 0;
    const ids=target.readMailWorkerDue(Date.now(),state=>{const barrier=readRestoredWorkBarrier(state.graph);return state.due(Object.values(barrier?.entries??{}).filter(h=>h.collection==='emailOutbox').map(h=>h.recordId));}),due=(job:EmailOutboxRecord,now:number)=>(['QUEUED','RETRY'].includes(job.status)&&job.nextAttemptAt<=now)||(job.status==='PROCESSING'&&(job.leaseExpiresAt??0)<=now);
    const mutate=<T>(selection:import('../db/rowPersistence').MailWorkerSelection,verify:(state:import('../db/rowPersistence').MailWorkerState)=>import('../db/rowPersistence').MailWorkerPlan<T>):T=>{try{return target.mutateMailWorker(selection,verify);}catch(error){if(error instanceof StorageConflict||error instanceof LegacyWriterConflict)throw error;if(error instanceof OutboxError||error instanceof Error&&error.message.startsWith('RESTORED_WORK_BARRIER_'))throw error;throw new OutboxError('OUTBOX_UNAVAILABLE',503);}};let processed=0;
    for(const id of ids){let claim:{job:EmailOutboxRecord;payload:MailPayload}|undefined;const now=Date.now();try{claim=mutate<{job:EmailOutboxRecord;payload:MailPayload}|undefined>({jobId:id,phase:'CLAIM',now},state=>{const job=state.job;if(!job||isRestoredWorkHeld(state.graph,'emailOutbox',id)||!due(job,now))return{result:undefined};const terminal=(status:'DLQ'|'CANCELLED',code:import('../db/rowPersistence').MailWorkerTerminalCode):import('../db/rowPersistence').MailWorkerPlan<undefined>=>({result:undefined,change:{kind:'TERMINAL',status,code}});if(!job.payloadEncrypted)return terminal('DLQ','LEGACY_RECIPIENT_UNBOUND');let payload:MailPayload;try{payload=this.payload(job,state.graph);}catch{return terminal('DLQ','PAYLOAD_INVALID');}if(payload.contactChallengeId){const record=state.graph.users[job.userId]?.contact,pending=record?.pending;if(!record||!pending||pending.id!==payload.contactChallengeId||pending.state!=='PENDING'||pending.expiresAt<=now||record.revision!==pending.baseRevision)return terminal('CANCELLED','CONTACT_CHALLENGE_INACTIVE');}else{if(contactStatusFor(job.userId,state.graph.users[job.userId])!=='VERIFIED')return terminal('CANCELLED','CONTACT_UNVERIFIED');if(verifiedContactEmailFor(job.userId,state.graph.users[job.userId])!==payload.to)return terminal('CANCELLED','CONTACT_CHANGED');const preferences=state.graph.notificationPreferences[job.userId];if(preferences!==undefined&&!z.object({email:z.boolean().optional(),inApp:z.boolean().optional()}).passthrough().safeParse(preferences).success)return terminal('DLQ','PAYLOAD_INVALID');if(preferences?.email===false)return terminal('CANCELLED','EMAIL_DISABLED');}this.operatorHistory(job,state);if(job.attempts>=this.attemptLimit(job))return terminal('DLQ','RETRY_BUDGET_EXHAUSTED');const leaseToken=crypto.randomUUID(),claimed={...job,status:'PROCESSING' as const,attempts:job.attempts+1,leaseToken,leaseExpiresAt:now+leaseDuration};return{result:{job:claimed,payload},change:{kind:'CLAIM',leaseToken}};});}catch(error){if(!(error instanceof StorageConflict||error instanceof LegacyWriterConflict))throw error;}if(!claim)continue;const claimed=claim,owned=(state:import('../db/rowPersistence').MailWorkerState,clock:number)=>!!state.job&&!isRestoredWorkHeld(state.graph,'emailOutbox',id)&&state.job.status==='PROCESSING'&&state.job.leaseToken===claimed.job.leaseToken&&(state.job.leaseExpiresAt??0)>clock;
      const heartbeat=setInterval(()=>{const clock=Date.now();try{mutate({jobId:id,phase:'HEARTBEAT',now:clock,leaseToken:claimed.job.leaseToken},state=>({result:undefined,...(owned(state,clock)?{change:{kind:'HEARTBEAT' as const}}:{})}));}catch{/* Unavailable or stale writer cannot extend ownership. */}},10000);heartbeat.unref();let acknowledged=false;processed++;try{await sender({to:claimed.payload.to,subject:claimed.payload.subject,text:claimed.payload.text,idempotencyKey:id});acknowledged=true;}catch{/* No remote exception, credential, recipient or body is stored. */}finally{clearInterval(heartbeat);}const finishedAt=Date.now();try{mutate({jobId:id,phase:'COMPLETE',now:finishedAt,leaseToken:claimed.job.leaseToken},state=>{if(!owned(state,finishedAt))return{result:undefined};const job=state.job!;if(acknowledged)return{result:undefined,change:{kind:'SENT'}};this.operatorHistory(job,state);if(job.attempts>=this.attemptLimit(job))return{result:undefined,change:{kind:'TERMINAL',status:'DLQ',code:'PROVIDER_NOT_ACKNOWLEDGED'}};return{result:undefined,change:{kind:'RETRY',nextAttemptAt:finishedAt+Math.min(60000*2**job.attempts,3600000)}};});}catch(error){if(!(error instanceof StorageConflict||error instanceof LegacyWriterConflict))throw error;}
    }return processed;
  }

}
