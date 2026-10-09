import crypto from "node:crypto";
import {requireOperatorCapability} from "../domain/operatorCapability";
import {OperatorEnrollmentError} from "../domain/operatorEnrollment";
import jwt from "jsonwebtoken";
import {z} from "zod";
import {config} from "../config";
import {store,TransactionalStore,UserRecord,AuthSessionRecord,AuthSessionCommandRecord} from "../db/store";
import {StorageConflict} from "../db/rowPersistence";
import type {SessionManagementSelection,SessionManagementState,SessionManagementPlan,SessionManagementPatch} from '../db/rowPersistence';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';

const absoluteSeconds=7*24*60*60,idleMs=30*60*1000,issuer="groupdeal",audience="groupdeal:app";
const publicId=/^ses_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const time=z.number().int().nonnegative().max(8640000000000000),uuid=z.string().uuid();
const recordSchema=z.object({id:z.string().regex(publicId),userId:z.string().min(1).max(128),kind:z.enum(["MANAGED","LEGACY"]),loginMethod:z.enum(["CIRCLE_EMAIL","EVM_WALLET","UNKNOWN"]),issuedAt:time,expiresAt:time,createdAt:time,lastActivityAt:time,legacyEpoch:z.number().int().nonnegative().optional(),authRecoveryContext:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),state:z.enum(["ACTIVE","REVOKED"]),revokedAt:time.optional(),revokeReason:z.enum(["LOGOUT","USER_REVOKED","OTHER_SESSIONS","ALL_SESSIONS"]).optional(),revokeRequestId:uuid.optional()}).refine(r=>r.expiresAt>r.issuedAt&&r.expiresAt-r.issuedAt<=absoluteSeconds&&r.createdAt>=r.issuedAt*1000-30000&&r.createdAt<r.expiresAt*1000&&r.lastActivityAt>=r.createdAt);
const inputSchema=z.object({idempotencyKey:uuid}).strict();
const querySchema=z.object({limit:z.string().regex(/^(?:[1-9]\d?|100)$/).default("20"),cursor:z.string().max(1024).optional()}).strict();
const commandSchema=z.object({id:uuid,userId:z.string().min(1).max(128),initiatorId:z.string().regex(publicId),scope:z.enum(["ONE","OTHERS","ALL"]),targetId:z.string().regex(publicId).optional(),createdAt:time,affectedCount:z.number().int().nonnegative(),currentRevoked:z.boolean()});
export class SessionError extends Error {constructor(public code:string,public status=401){super(code);}}
export type SessionProof={key:string;account:UserRecord;record:AuthSessionRecord;claims:{userId:string;iat:number;exp:number;authRecoveryContext?:string};blockedLegacy:boolean;missing:boolean};

/** Session identifiers and command ownership are separate from wallet/financial principals. */
export class SessionRegistry {
  constructor(private readonly database:TransactionalStore){}
  private digest(purpose:string,value:string){return crypto.createHmac("sha256",config.jwtSecret).update("groupdeal:"+purpose+":v1:"+value).digest("hex");}
  private epoch(user:UserRecord){const n=user.legacySessionEpoch??0;if(!Number.isSafeInteger(n)||n<0)throw new SessionError("AUTH_SESSION_INVALID");return n;}
  private read(userId:string,key?:string,commandKey?:string){try{return this.database.readAuthState(userId,key,commandKey);}catch{throw new SessionError("AUTH_SESSION_UNAVAILABLE",503);}}
  private account(user:UserRecord|undefined,id:string){if(!user||user.id!==id||!Array.isArray(user.roles)||user.roles.some(r=>!["buyer","seller","operator"].includes(r))||typeof user.email!=="string")throw new SessionError("AUTH_SESSION_INVALID");this.epoch(user);return user;}
  private row(value:unknown,now=Date.now()){const parsed=recordSchema.safeParse(value);if(!parsed.success||parsed.data.lastActivityAt>now+30000)throw new SessionError("AUTH_SESSION_UNAVAILABLE",503);return parsed.data;}
  private active(record:AuthSessionRecord,context?:string,now=Date.now()){return record.authRecoveryContext===context&&record.state==="ACTIVE"&&now<Math.min(record.expiresAt*1000,record.lastActivityAt+idleMs);}
  private recovery(value:unknown){try{return readAuthRecoveryBarrier(value);}catch{throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);}}
  private requireRecovery(value:unknown,context:unknown){const barrier=this.recovery(value);if(barrier?context!==barrier.context:context!==undefined)throw new SessionError('AUTH_SESSION_INACTIVE');}
  private matching(proof:SessionProof,state:ReturnType<TransactionalStore["readAuthState"]>,now=Date.now()){
    this.requireRecovery(state.authRecovery,proof.claims.authRecoveryContext);
    const account=this.account(state.user,proof.account.id),record=this.row(state.sessions[proof.key],now);
    if(record.id!==proof.record.id||record.userId!==account.id||record.kind!==proof.record.kind||record.issuedAt!==proof.claims.iat||record.expiresAt!==proof.claims.exp||record.authRecoveryContext!==proof.claims.authRecoveryContext)throw new SessionError("AUTH_SESSION_INVALID");
    return{account,record};
  }
  private requireCurrent(proof:SessionProof,state:ReturnType<TransactionalStore["readAuthState"]>,now=Date.now()){
    const {account,record}=this.matching(proof,state,now);
    if(!this.active(record,proof.claims.authRecoveryContext,now)||record.kind==="LEGACY"&&record.legacyEpoch!==this.epoch(account))throw new SessionError("AUTH_SESSION_INACTIVE");
    return account;
  }
  private manage<T>(selection:SessionManagementSelection,verify:(state:SessionManagementState)=>SessionManagementPlan<T>):T{try{return this.database.mutateSessionManagement(selection,verify)}catch(e){if(e instanceof SessionError)throw e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))throw new SessionError('AUTH_SESSION_CONFLICT',409);throw new SessionError('AUTH_SESSION_UNAVAILABLE',503)}}

  /** Pure builder: the caller commits the returned session with its verified credential. */
  public prepareIssuedSession(user:UserRecord,authRecovery:unknown,loginMethod:AuthSessionRecord["loginMethod"]=user.loginMethod??"UNKNOWN") {
    const sid=crypto.randomBytes(32).toString("base64url"),now=Date.now(),issuedAt=Math.floor(now/1000),expiresAt=issuedAt+absoluteSeconds,key="session_"+this.digest("session-id",sid);
      const account=this.account(user,user.id),barrier=this.recovery(authRecovery);
      const token=jwt.sign({userId:account.id,sessionVersion:1,sid,iat:issuedAt,exp:expiresAt,...(barrier?{authRecoveryContext:barrier.context}:{})},config.jwtSecret,{algorithm:"HS256",issuer,audience});
      if(!["CIRCLE_EMAIL","EVM_WALLET","UNKNOWN"].includes(loginMethod))throw new SessionError("AUTH_SESSION_INVALID");
      const record:AuthSessionRecord={id:"ses_"+crypto.randomUUID(),userId:account.id,kind:"MANAGED",loginMethod,issuedAt,expiresAt,createdAt:now,lastActivityAt:now,state:"ACTIVE",...(barrier?{authRecoveryContext:barrier.context}:{})};
      return{token,key,record};
  }
  public issue(user:UserRecord,loginMethod?:AuthSessionRecord["loginMethod"]):string {
    try{return this.database.mutateCircleAuthentication({mode:'ISSUE_SESSION',actorId:user.id,rateKeys:[]},state=>{const account=this.account(state.auth.user,user.id),method=loginMethod??account.loginMethod??'UNKNOWN',prepared=this.prepareIssuedSession(account,state.auth.authRecovery,method);return{result:prepared.token,writes:[{collection:'authSessions',key:prepared.key,value:prepared.record}],audit:[{actor:account.id,role:'user',action:'APP_SESSION_CREATED',details:{sessionId:prepared.record.id,loginMethod:method}}]}})}catch(e){if(e instanceof SessionError)throw e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))throw new SessionError('AUTH_SESSION_CONFLICT',409);throw new SessionError('AUTH_SESSION_UNAVAILABLE',503)}
  }

  public authenticate(token:string,options:{allowInactive?:boolean;allowMissingLegacy?:boolean}={}):SessionProof {
    let decoded:any;
    try{if(typeof token!=="string"||!token||token.length>8192)throw new Error();decoded=jwt.verify(token,config.jwtSecret,{algorithms:["HS256"]});}catch{throw new SessionError("AUTH_SESSION_INVALID");}
    if(!decoded||typeof decoded!=="object"||typeof decoded.userId!=="string"||!decoded.userId||decoded.userId.length>128||["constructor","__proto__","prototype"].includes(decoded.userId)||![decoded.iat,decoded.exp].every(Number.isSafeInteger)||decoded.iat<0||decoded.exp<=decoded.iat||decoded.exp-decoded.iat>absoluteSeconds||decoded.iat>Math.floor(Date.now()/1000)+30)throw new SessionError("AUTH_SESSION_INVALID");
    const managed=decoded.sessionVersion!==undefined||decoded.sid!==undefined||decoded.iss!==undefined||decoded.aud!==undefined||decoded.authRecoveryContext!==undefined;
    if(managed&&(decoded.sessionVersion!==1||typeof decoded.sid!=="string"||! /^[A-Za-z0-9_-]{43}$/.test(decoded.sid)||decoded.iss!==issuer||decoded.aud!==audience))throw new SessionError("AUTH_SESSION_INVALID");
    const key="session_"+this.digest(managed?"session-id":"legacy-token",managed?decoded.sid:token),state=this.read(decoded.userId,key),account=this.account(state.user,decoded.userId);
    this.requireRecovery(state.authRecovery,decoded.authRecoveryContext);
    let record=state.sessions[key];const missing=!record;
    if(missing){
      if(managed)throw new SessionError("AUTH_SESSION_INVALID");
      if(this.epoch(account)!==0&&!options.allowInactive)throw new SessionError("AUTH_SESSION_INACTIVE");
      if(options.allowInactive&&!options.allowMissingLegacy)throw new SessionError("AUTH_SESSION_INACTIVE");
      record={id:"ses_"+crypto.randomUUID(),userId:account.id,kind:"LEGACY",loginMethod:"UNKNOWN",issuedAt:decoded.iat,expiresAt:decoded.exp,createdAt:Date.now(),lastActivityAt:Date.now(),legacyEpoch:this.epoch(account),state:"ACTIVE"};
      record=this.row(record);
      if(!options.allowInactive){try{this.database.materializeLegacySession(key,record);}catch{throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);}}
    }
    record=this.row(record);
    if(record.userId!==account.id||record.kind!==(managed?"MANAGED":"LEGACY")||record.issuedAt!==decoded.iat||record.expiresAt!==decoded.exp||record.authRecoveryContext!==decoded.authRecoveryContext)throw new SessionError("AUTH_SESSION_INVALID");
    const blockedLegacy=!managed&&(record.legacyEpoch!==this.epoch(account)||missing&&this.epoch(account)!==0);
    if(!options.allowInactive&&(blockedLegacy||!this.active(record,decoded.authRecoveryContext)))throw new SessionError("AUTH_SESSION_INACTIVE");
    return {key,account,record,claims:{userId:decoded.userId,iat:decoded.iat,exp:decoded.exp,...(decoded.authRecoveryContext!==undefined?{authRecoveryContext:decoded.authRecoveryContext}:{})},blockedLegacy,missing};
  }

  public dto(record:AuthSessionRecord,currentId:string,context?:string){const r=this.row(record);return {id:r.id,userId:r.userId,kind:r.kind,loginMethod:r.loginMethod,createdAt:r.createdAt,expiresAt:r.expiresAt*1000,idleExpiresAt:Math.min(r.expiresAt*1000,r.lastActivityAt+idleMs),state:r.state==="REVOKED"?"REVOKED":this.active(r,context)?"ACTIVE":"EXPIRED",current:r.id===currentId,...(r.revokedAt!==undefined?{revokedAt:r.revokedAt}:{})};}
  public current(proof:SessionProof){return {session:this.dto(proof.record,proof.record.id,proof.claims.authRecoveryContext),serverTime:Date.now()};}
  /** Read services supply their own atomic committed snapshot and must never authorize from cached proof roles. */
  public assertCommitted(proof:SessionProof,state:ReturnType<TransactionalStore['readAuthState']>){return this.requireCurrent(proof,state);}
  public assertOperatorCommitted(proof:SessionProof|undefined,state:ReturnType<TransactionalStore['readAuthState']>){
    if(!proof)throw new SessionError('AUTH_SESSION_INACTIVE');const user=this.requireCurrent(proof,state);try{requireOperatorCapability(proof,state);return user;}catch(error){if(error instanceof OperatorEnrollmentError)throw new SessionError(error.code,error.status);throw new SessionError('OPERATOR_ACCESS_UNAVAILABLE',503);}
  }
  public activity(token:string){const proof=this.authenticate(token);return this.manage({actorId:proof.account.id,sessionKey:proof.key,mode:'ACTIVITY'},state=>{const now=Date.now();this.requireCurrent(proof,state.auth,now);const record=this.row(state.auth.sessions[proof.key],now);if(now<record.createdAt||now<record.lastActivityAt)throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);const patch=now-record.lastActivityAt>=30000?{lastActivityAt:now}:undefined;return{result:{session:this.dto({...record,...patch},record.id,proof.claims.authRecoveryContext),serverTime:now},patches:patch?[{key:proof.key,patch}]:[]}});}

  public logout(token:string,input:unknown){const parsed=inputSchema.safeParse(input);if(!parsed.success)throw new SessionError("AUTH_SESSION_INVALID_INPUT",400);
    const proof=this.authenticate(token,{allowInactive:true,allowMissingLegacy:true});return this.manage({actorId:proof.account.id,sessionKey:proof.key,mode:'LOGOUT'},state=>{const now=Date.now();this.requireRecovery(state.auth.authRecovery,proof.claims.authRecoveryContext);const account=this.account(state.auth.user,proof.account.id),missing=state.auth.sessions[proof.key]===undefined,record=missing?this.row(proof.record,now):this.matching(proof,state.auth,now).record;
      if(missing&&(!proof.missing||record.kind!=='LEGACY'))throw new SessionError('AUTH_SESSION_INVALID');const result={userId:account.id,scope:'CURRENT',revoked:true,requestId:parsed.data.idempotencyKey};if(record.state==='REVOKED'||record.kind==='LEGACY'&&record.legacyEpoch!==this.epoch(account)||missing&&this.epoch(account)!==0)return{result};if(now<record.createdAt||now<record.lastActivityAt)throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);
      const patch:SessionManagementPatch={state:'REVOKED',revokedAt:now,revokeReason:'LOGOUT',revokeRequestId:parsed.data.idempotencyKey};return{result,...(missing?{insert:{...record,...patch} as AuthSessionRecord}:{patches:[{key:proof.key,patch}]}),audit:[{action:'APP_SESSION_LOGOUT',details:{sessionId:record.id,requestId:parsed.data.idempotencyKey}}]};});
  }

  public list(proof:SessionProof,query:unknown){const parsed=querySchema.safeParse(query);if(!parsed.success)throw new SessionError("AUTH_SESSION_INVALID_QUERY",400);
    const actorId=proof.account.id;
    let before:{createdAt:number;id:string}|undefined;
    const sign=(data:string)=>this.digest("session-cursor",data);
    if(parsed.data.cursor)try{const [data,mac,...more]=parsed.data.cursor.split(".");if(more.length||!/^[A-Za-z0-9_-]+$/.test(data)||!/^[a-f0-9]{64}$/.test(mac)||!crypto.timingSafeEqual(Buffer.from(mac,"hex"),Buffer.from(sign(data),"hex")))throw new Error();const c=JSON.parse(Buffer.from(data,"base64url").toString());if(!Array.isArray(c)||c.length!==4||c[0]!==1||c[1]!==actorId||!Number.isSafeInteger(c[2])||c[2]<0||!publicId.test(c[3]))throw new Error();before={createdAt:c[2],id:c[3]};}catch{throw new SessionError("AUTH_SESSION_INVALID_CURSOR",400);}
    const limit=Number(parsed.data.limit);let state:ReturnType<TransactionalStore['readSessionPage']>;try{state=this.database.readSessionPage(actorId,proof.key,limit,before)}catch{throw new SessionError('AUTH_SESSION_UNAVAILABLE',503)}const account=this.requireCurrent(proof,state.auth),rows=state.rows.map(r=>this.row(r));if(rows.some(r=>r.userId!==account.id))throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);const page=rows.slice(0,limit),last=page.at(-1),data=last&&rows.length>limit?Buffer.from(JSON.stringify([1,account.id,last.createdAt,last.id])).toString('base64url'):null;
    return {userId:account.id,currentSessionId:proof.record.id,sessions:page.map(r=>this.dto(r,proof.record.id,proof.claims.authRecoveryContext)),pagination:{nextCursor:data?data+"."+sign(data):null},legacySessionsMayBeUnlisted:proof.claims.authRecoveryContext===undefined&&this.epoch(account)===0,serverTime:Date.now()};
  }

  private commandKey(userId:string,requestId:string){return "command_"+this.digest("session-command",JSON.stringify([userId,requestId]));}
  private commandDto(command:AuthSessionCommandRecord){const r=commandSchema.parse(command);return {requestId:r.id,userId:r.userId,scope:r.scope,...(r.targetId?{targetId:r.targetId}:{}),committed:true,currentSessionRevoked:r.currentRevoked,affectedCount:r.affectedCount};}
  public command(token:string,scope:"ONE"|"OTHERS"|"ALL",targetId:string|undefined,input:unknown){const parsed=inputSchema.safeParse(input);if(!parsed.success||!['ONE','OTHERS','ALL'].includes(scope)||scope==='ONE'&&!publicId.test(targetId??'')||scope!=='ONE'&&targetId!==undefined)throw new SessionError('AUTH_SESSION_INVALID_INPUT',400);
    const proof=this.authenticate(token,{allowInactive:true}),key=this.commandKey(proof.account.id,parsed.data.idempotencyKey),budgetKey='app-session-command:'+this.digest('command-budget',proof.account.id);
    return this.manage({actorId:proof.account.id,sessionKey:proof.key,mode:'COMMAND',scope,targetId,commandKey:key,budgetKey},state=>{
      const now=Date.now(),{account,record:initiator}=this.matching(proof,state.auth,now);
      if(state.command){const prior=commandSchema.safeParse(state.command);if(!prior.success)throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);if(prior.data.userId!==account.id||prior.data.initiatorId!==initiator.id||prior.data.scope!==scope||prior.data.targetId!==targetId)throw new SessionError('AUTH_SESSION_IDEMPOTENCY_CONFLICT',409);return{result:this.commandDto(prior.data)}}
      this.requireCurrent(proof,state.auth,now);if(now<initiator.createdAt||now<initiator.lastActivityAt)throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);
      const rows=Object.entries(state.auth.sessions).map(([key,row])=>[key,this.row(row,now)] as const);if(rows.some(([,r])=>r.userId!==account.id))throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);
      if(scope==='ONE'&&!rows.some(([,r])=>r.id===targetId))throw new SessionError('AUTH_SESSION_NOT_FOUND',404);
      const previous=state.budget;if(previous&&(!Number.isSafeInteger(previous.count)||previous.count<0||!Number.isSafeInteger(previous.windowStartedAt)||previous.windowStartedAt<0||previous.windowStartedAt>now||!Number.isSafeInteger(previous.lastAttemptAt)||previous.lastAttemptAt<previous.windowStartedAt||previous.lastAttemptAt>now))throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);
      const budget=!previous||now-previous.windowStartedAt>=10*60_000?{windowStartedAt:now,lastAttemptAt:now,count:0}:previous;if(budget.count>=30)throw new SessionError('AUTH_SESSION_RATE_LIMIT',429);
      let legacyEpoch:number|undefined;if(scope!=='ONE'){const epoch=this.epoch(account);if(epoch>=Number.MAX_SAFE_INTEGER)throw new SessionError('AUTH_SESSION_UNAVAILABLE',503);legacyEpoch=epoch+1}
      let affectedCount=0,currentRevoked=false;const patches:{key:string;patch:SessionManagementPatch}[]=[];
      for(const [rowKey,row] of rows){const selected=scope==='ALL'||scope==='ONE'&&row.id===targetId||scope==='OTHERS'&&row.id!==initiator.id;
        if(selected&&row.state!=='REVOKED'){patches.push({key:rowKey,patch:{state:'REVOKED',revokedAt:now,revokeReason:scope==='ALL'?'ALL_SESSIONS':scope==='OTHERS'?'OTHER_SESSIONS':'USER_REVOKED',revokeRequestId:parsed.data.idempotencyKey}});affectedCount++;if(row.id===initiator.id)currentRevoked=true}
        if(scope==='OTHERS'&&row.id===initiator.id&&row.kind==='LEGACY')patches.push({key:rowKey,patch:{legacyEpoch}});
      }
      const command:AuthSessionCommandRecord={id:parsed.data.idempotencyKey,userId:account.id,initiatorId:initiator.id,scope,...(targetId?{targetId}:{}),createdAt:now,affectedCount,currentRevoked};
      return{result:this.commandDto(command),patches,legacyEpoch,command,budget:{...budget,count:budget.count+1,lastAttemptAt:now},audit:[{action:'APP_SESSIONS_REVOKED',details:{requestId:command.id,scope,...(targetId?{targetId}:{}),affectedCount}}]};
    });
  }
  public commandStatus(token:string,requestId:string){if(!uuid.safeParse(requestId).success)throw new SessionError("AUTH_SESSION_INVALID_INPUT",400);const proof=this.authenticate(token,{allowInactive:true}),state=this.read(proof.account.id,proof.key,this.commandKey(proof.account.id,requestId));const command=commandSchema.safeParse(state.command);if(!command.success||command.data.userId!==proof.account.id||command.data.initiatorId!==proof.record.id)throw new SessionError("AUTH_SESSION_NOT_FOUND",404);return this.commandDto(command.data);}
}
export const SessionService=new SessionRegistry(store);
