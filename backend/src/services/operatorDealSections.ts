import crypto from 'node:crypto';
import {z} from 'zod';
import {config} from '../config';
import {store} from '../db/store';
import type {OperatorAdministrationState} from '../db/rowPersistence';
import {SessionService,SessionError,type SessionProof} from './sessionService';
export const operatorDealId=z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const uint=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export class OperatorDealSectionError extends Error{constructor(public readonly code:string,public readonly status:number){super(code);}}
export function assertOperatorDeal(state:OperatorAdministrationState,id:string){
 const raw=state.deal(id);if(raw===null)throw new OperatorDealSectionError('OPERATOR_DEAL_NOT_FOUND',404);
 const value=z.object({id:operatorDealId,chainId:uint,hubAddress:address,protocolVersion:uint.positive(),status:z.enum(['DRAFT','PUBLISHED','ACTIVE','FINALIZED','CANCELLED'])}).strict().parse(raw);
 if(value.status==='DRAFT')throw new OperatorDealSectionError('OPERATOR_DEAL_NOT_FOUND',404);
 if(value.id!==id||value.chainId!==config.arcChainId||value.hubAddress.toLowerCase()!==config.hubAddress.toLowerCase()||value.protocolVersion!==config.protocolVersion)throw new OperatorDealSectionError('OPERATOR_DEAL_SCOPE_CHANGED',409);
 return value;
}
const querySchema=z.object({limit:z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).default('20'),status:z.enum(['ALL','OPEN','RESOLVED']).default('ALL'),cursor:z.string().max(2048).optional()}).strict();
const cursorSchema=z.object({after:operatorDealId,dealId:operatorDealId,revision:uint,operatorId:z.string(),sessionId:z.string(),chainId:uint,hubAddress:address,status:z.enum(['ALL','OPEN','RESOLVED']),limit:uint.min(1).max(50)}).strict();
const text=z.string().max(4000),hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/),url=z.string().max(2048).refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}});
const row=z.object({id:operatorDealId,campaignId:operatorDealId,chainId:uint,hubAddress:address,protocolVersion:uint.positive().nullable(),onchainOrderId:uint,buyerPrincipal:address,committedGross:z.string().regex(/^(0|[1-9][0-9]{0,77})$/),deliveryStatus:z.enum(['DISPUTED','RESOLVED']),disputeReason:text.nullable(),disputeEvidence:z.array(url).max(100).nullable(),disputeResolution:z.object({txHash:hash,notes:text,operatorId:z.string().min(1).max(128)}).strict().nullable()}).strict();
const mac=(body:string)=>crypto.createHmac('sha256',config.jwtSecret).update('groupdeal:operator-deal-disputes:v1:'+body).digest('hex');
export function listOperatorDealDisputes(proof:SessionProof,dealId:string,query:unknown){
 const parsed=querySchema.safeParse(query);if(!operatorDealId.safeParse(dealId).success||!parsed.success)throw new OperatorDealSectionError('OPERATOR_DEAL_QUERY_INVALID',400);
 const input=parsed.data,limit=Number(input.limit);let cursor:z.infer<typeof cursorSchema>|undefined;
 if(input.cursor)try{const [body,signature,...extra]=input.cursor.split('.');if(extra.length||! /^[A-Za-z0-9_-]+$/.test(body)||! /^[a-f0-9]{64}$/.test(signature)||!crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(body),'hex')))throw Error();cursor=cursorSchema.parse(JSON.parse(Buffer.from(body,'base64url').toString()));if(cursor.dealId!==dealId||cursor.operatorId!==proof.account.id||cursor.sessionId!==proof.record.id||cursor.status!==input.status||cursor.limit!==limit)throw Error();}catch{throw new OperatorDealSectionError('OPERATOR_DEAL_CURSOR_INVALID',400);}
 try{return store.readOperatorAdministration(proof.account.id,proof.key,state=>{
  const actor=SessionService.assertOperatorCommitted(proof,state.auth);if(!actor.roles.includes('operator'))throw new SessionError('OPERATOR_ROLE_REQUIRED',403);const deal=assertOperatorDeal(state,dealId);
  if(cursor&&(cursor.revision!==state.revision||cursor.chainId!==deal.chainId||cursor.hubAddress.toLowerCase()!==deal.hubAddress.toLowerCase()))throw new OperatorDealSectionError('OPERATOR_DEAL_SNAPSHOT_CHANGED',409);
  const values=state.disputePage(dealId,limit+1,cursor?.after??'',input.status).map(value=>{const r=row.parse(value);if(r.campaignId!==dealId||r.chainId!==deal.chainId||r.hubAddress.toLowerCase()!==deal.hubAddress.toLowerCase()||(r.protocolVersion??1)!==deal.protocolVersion)throw new OperatorDealSectionError('OPERATOR_DEAL_SCOPE_CHANGED',409);return{id:r.id,campaignId:r.campaignId,onchainOrderId:r.onchainOrderId,buyerPrincipal:r.buyerPrincipal,committedGross:r.committedGross,deliveryStatus:r.deliveryStatus,disputeReason:r.disputeReason,disputeEvidence:r.disputeEvidence??[],disputeResolution:r.disputeResolution};});
  const disputes=values.slice(0,limit),last=disputes.at(-1),body=last&&values.length>limit?Buffer.from(JSON.stringify({after:last.id,dealId,revision:state.revision,operatorId:proof.account.id,sessionId:proof.record.id,chainId:deal.chainId,hubAddress:deal.hubAddress,status:input.status,limit})).toString('base64url'):null;
  return{version:'1.0',scope:'OPERATOR_DEAL_DISPUTES',operatorAccountId:proof.account.id,dealId,chainId:deal.chainId,hubAddress:deal.hubAddress,revision:state.revision,observedAt:Date.now(),status:input.status,limit,disputes,pagination:{nextCursor:body?body+'.'+mac(body):null},chainVerified:false};
 });}catch(e){if(e instanceof OperatorDealSectionError||e instanceof SessionError)throw e;throw new OperatorDealSectionError('OPERATOR_DEAL_UNAVAILABLE',503);}
}
