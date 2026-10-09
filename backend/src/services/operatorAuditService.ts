import {operatorDealId,assertOperatorDeal,OperatorDealSectionError} from './operatorDealSections';
import crypto from 'node:crypto';
import {z} from 'zod';
import {config} from '../config';
import {store} from '../db/store';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import type {OperatorAdministrationState} from '../db/rowPersistence';

const id=z.string().min(1).max(128).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const number=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),digest=z.string().regex(/^[a-f0-9]{64}$/),action=z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/);
const core=z.object({id,timestamp:number.max(8640000000000000),actor:z.string().min(1).max(4096),role:z.string().regex(/^[A-Za-z][A-Za-z0-9:_-]{0,63}$/),action,prevHash:digest,hash:digest});
const selected=core.extend({position:number,actorId:id.nullable()}).strict();
const querySchema=z.object({limit:z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).default('20'),action:action.optional(),actor:id.optional(),dealId:operatorDealId.optional(),cursor:z.string().min(1).max(2048).optional()}).strict();
const cursorSchema=z.object({after:number,revision:number,operatorId:id,sessionId:id,chainId:number.positive(),hubAddress:z.string().regex(/^0x[0-9a-fA-F]{40}$/),action:action.nullable(),actor:id.nullable(),dealId:operatorDealId.optional(),limit:number.min(1).max(50)}).strict();
export class OperatorAuditError extends Error{constructor(public readonly code:string,public readonly status:number){super(code);}}
function read<T>(proof:SessionProof,inspect:(state:OperatorAdministrationState)=>T):T{
 try{return store.readOperatorAdministration(proof.account.id,proof.key,state=>{const actor=SessionService.assertOperatorCommitted(proof,state.auth);if(!actor.roles.includes('operator'))throw new SessionError('OPERATOR_ROLE_REQUIRED',403);return inspect(state);});}
 catch(e){if(e instanceof SessionError||e instanceof OperatorAuditError||e instanceof OperatorDealSectionError)throw e;throw new OperatorAuditError('OPERATOR_AUDIT_UNAVAILABLE',503);}
}
function metadata(proof:SessionProof,state:OperatorAdministrationState){return{version:'1.0',operatorAccountId:proof.account.id,chainId:number.positive().parse(config.arcChainId),hubAddress:z.string().regex(/^0x[0-9a-fA-F]{40}$/).parse(config.hubAddress),revision:state.revision,observedAt:Date.now()};}
const mac=(body:string)=>crypto.createHmac('sha256',config.jwtSecret).update('groupdeal:operator-audit-cursor:v1:'+body).digest('hex');
export function listOperatorAudit(proof:SessionProof,query:unknown){
 const parsed=querySchema.safeParse(query);if(!parsed.success)throw new OperatorAuditError('OPERATOR_AUDIT_QUERY_INVALID',400);
 const input=parsed.data,limit=Number(input.limit),filters={action:input.action??null,actor:input.actor??null,...(input.dealId?{dealId:input.dealId}:{})};let cursor:z.infer<typeof cursorSchema>|undefined;
 if(input.cursor)try{const [body,signature,...extra]=input.cursor.split('.');if(extra.length||! /^[A-Za-z0-9_-]+$/.test(body)||! /^[a-f0-9]{64}$/.test(signature)||!crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(body),'hex')))throw Error();cursor=cursorSchema.parse(JSON.parse(Buffer.from(body,'base64url').toString()));if(cursor.operatorId!==proof.account.id||cursor.sessionId!==proof.record.id||cursor.action!==filters.action||cursor.actor!==filters.actor||(cursor.dealId??null)!==(input.dealId??null)||cursor.limit!==limit)throw Error();}catch{throw new OperatorAuditError('OPERATOR_AUDIT_CURSOR_INVALID',400);}
 return read(proof,state=>{
  const meta=metadata(proof,state);if(input.dealId)assertOperatorDeal(state,input.dealId);if(cursor&&(cursor.revision!==meta.revision||cursor.chainId!==meta.chainId||cursor.hubAddress.toLowerCase()!==meta.hubAddress.toLowerCase()))throw new OperatorAuditError('OPERATOR_AUDIT_SNAPSHOT_CHANGED',409);
  const rows=state.auditPage(limit+1,cursor?.after?? -1,input.action,input.actor,input.dealId),logs=rows.map(value=>{const r=selected.parse(value);return{id:r.id,position:r.position,timestamp:r.timestamp,actorId:r.actorId,actorDigest:crypto.createHash('sha256').update(r.actor).digest('hex'),role:r.role,action:r.action,hash:r.hash,prevHash:r.prevHash};}).slice(0,limit);
  const last=logs[logs.length-1],body=last&&rows.length>limit?Buffer.from(JSON.stringify({after:last.position,revision:meta.revision,operatorId:proof.account.id,sessionId:proof.record.id,chainId:meta.chainId,hubAddress:meta.hubAddress,...filters,limit})).toString('base64url'):null;
  return{...meta,scope:'OPERATOR_AUDIT_PAGE',filters,limit,logs,pagination:{nextCursor:body?body+'.'+mac(body):null},integrityChecked:false};
 });
}
export function verifyOperatorAudit(proof:SessionProof,query:unknown){
 if(!z.object({}).strict().safeParse(query).success)throw new OperatorAuditError('OPERATOR_AUDIT_QUERY_INVALID',400);
 return read(proof,state=>{
  const meta=metadata(proof,state);let after=-1,checked=0,newer:{position:number;prevHash:string}|undefined;
  const result=(valid:boolean,reason:'AUDIT_RECORD_INVALID'|'HASH_MISMATCH'|'CHAIN_LINK_MISMATCH'|null,brokenPosition:number|null)=>({...meta,scope:'OPERATOR_AUDIT_INTEGRITY',valid,checked,reason,brokenPosition});
  for(;;){const page=state.auditIntegrityPage(200,after);for(const row of page){
   const p=core.safeParse(row.entry);if(!p.success||row.position!==checked)return result(false,'AUDIT_RECORD_INVALID',row.position);
   const r=p.data,details=(row.entry as {details?:unknown}).details;checked++;
   const expected=crypto.createHash('sha256').update(r.prevHash+':'+r.timestamp+':'+r.actor+':'+r.role+':'+r.action+':'+JSON.stringify(details)).digest('hex');
   if(expected!==r.hash)return result(false,'HASH_MISMATCH',row.position);
   if(newer&&newer.prevHash!==r.hash)return result(false,'CHAIN_LINK_MISMATCH',newer.position);
   newer={position:row.position,prevHash:r.prevHash};after=row.position;
  }if(page.length<200)break;}
  if(newer&&newer.prevHash!=='0'.repeat(64))return result(false,'CHAIN_LINK_MISMATCH',newer.position);
  return result(true,null,null);
 });
}
