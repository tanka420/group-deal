import crypto from 'node:crypto';
import {z} from 'zod';
import {store} from '../db/store';
import {config} from '../config';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import type {OperatorAdministrationState} from '../db/rowPersistence';

const id=z.string().min(1).max(128).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const role=z.enum(['buyer','seller','operator']);
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const row=z.object({id,roles:z.array(role).max(3).refine(v=>new Set(v).size===v.length),createdAt:integer.max(8640000000000000),loginMethod:z.enum(['CIRCLE_EMAIL','EVM_WALLET']).nullable().optional(),activeWallet:address.nullable(),displayName:z.string().max(160).nullable()}).strict();
const querySchema=z.object({role:z.enum(['ALL','buyer','seller','operator']).default('ALL'),limit:z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).default('20'),cursor:z.string().min(1).max(2048).optional()}).strict();
const cursorSchema=z.object({after:id,revision:integer,actorId:id,sessionId:z.string().min(1).max(128),chainId:integer.positive(),hubAddress:address,role:querySchema.shape.role,limit:integer.min(1).max(50)}).strict();

export class OperatorAdministrationError extends Error {
  constructor(public readonly code:string,public readonly status:number){super(code);}
}
function deployment(){return z.object({chainId:integer.positive(),hubAddress:address}).parse({chainId:config.arcChainId,hubAddress:config.hubAddress});}
function read<T>(proof:SessionProof,verify:(state:OperatorAdministrationState)=>T):T {
  try{return store.readOperatorAdministration(proof.account.id,proof.key,state=>{
    const actor=SessionService.assertOperatorCommitted(proof,state.auth);
    if(!actor.roles.includes('operator'))throw new SessionError('OPERATOR_ROLE_REQUIRED',403);
    return verify(state);
  });}catch(e){if(e instanceof SessionError||e instanceof OperatorAdministrationError)throw e;throw new OperatorAdministrationError('OPERATOR_ADMINISTRATION_UNAVAILABLE',503);}
}
const mac=(value:string)=>crypto.createHmac('sha256',config.jwtSecret).update('groupdeal:operator-users-cursor:v1:'+value).digest('hex');

export function listOperatorUsers(proof:SessionProof,query:unknown){
  const input=querySchema.safeParse(query);
  if(!input.success)throw new OperatorAdministrationError('OPERATOR_USERS_QUERY_INVALID',400);
  const {role,limit:rawLimit}=input.data,limit=Number(rawLimit);
  let cursor:z.infer<typeof cursorSchema>|undefined;
  if(input.data.cursor)try{
    const [body,signature,...extra]=input.data.cursor.split('.');
    if(extra.length||! /^[A-Za-z0-9_-]+$/.test(body)||! /^[a-f0-9]{64}$/.test(signature)||!crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(body),'hex')))throw Error();
    cursor=cursorSchema.parse(JSON.parse(Buffer.from(body,'base64url').toString()));
    if(cursor.actorId!==proof.account.id||cursor.sessionId!==proof.record.id||cursor.limit!==limit||cursor.role!==role)throw Error();
  }catch{throw new OperatorAdministrationError('OPERATOR_USERS_CURSOR_INVALID',400);}
  return read(proof,state=>{
    const scope=deployment();
    if(cursor&&(cursor.revision!==state.revision||cursor.chainId!==scope.chainId||cursor.hubAddress.toLowerCase()!==scope.hubAddress.toLowerCase()))throw new OperatorAdministrationError('OPERATOR_USERS_SNAPSHOT_CHANGED',409);
    const selected=state.page(limit+1,role==='ALL'?undefined:role,cursor?.after);
    const users=selected.map(value=>{const parsed=row.parse(value);return{...parsed,loginMethod:parsed.loginMethod??null};}).slice(0,limit);
    const last=users.at(-1),body=last&&selected.length>limit?Buffer.from(JSON.stringify({after:last.id,revision:state.revision,actorId:proof.account.id,sessionId:proof.record.id,...scope,role,limit})).toString('base64url'):null;
    return{version:'1.0',scope:'OPERATOR_ACCOUNT_DIRECTORY',operatorAccountId:proof.account.id,...scope,revision:state.revision,observedAt:Date.now(),role,limit,users,pagination:{nextCursor:body?body+'.'+mac(body):null}};
  });
}

export function operatorSettings(proof:SessionProof,query:unknown){
  if(!z.object({}).strict().safeParse(query).success)throw new OperatorAdministrationError('OPERATOR_SETTINGS_QUERY_INVALID',400);
  return read(proof,state=>({
    version:'1.0',scope:'OPERATOR_RUNTIME_CONFIGURATION',operatorAccountId:proof.account.id,...deployment(),revision:state.revision,observedAt:Date.now(),
    usdcAddress:address.parse(config.usdcAddress),deploymentBlock:integer.parse(config.deploymentBlock),protocolVersion:integer.positive().parse(config.protocolVersion),operatorWallet:address.parse(config.operatorAddress),production:config.isProduction,
    integrations:{circleConfigured:Boolean(config.circleApiKey),smtpConfigured:config.smtpConfigured,emailApiConfigured:Boolean(config.emailProviderUrl&&config.emailProviderToken)},
  }));
}
