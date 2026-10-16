import {z} from 'zod';
import {store} from '../db/store';
import {config} from '../config';
import {StorageConflict,type OperatorAccountAccessState} from '../db/rowPersistence';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import {accountAccessSchema,accessCommandInput,accountCommandKey,digest,targetDigest,readAccountAccess,AccountAccessError,type AccountAccessCommand,type AccountAccessTarget} from '../domain/accountAccess';

const targetId=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const commandSchema=z.object({id:z.string().regex(/^aac_[a-f0-9]{64}$/),schema:z.literal('GroupDealAccountAccessCommandV1'),actorId:targetId,targetId,commandId:z.string().uuid(),environmentDigest:z.string().regex(/^[a-f0-9]{64}$/),inputDigest:z.string().regex(/^[a-f0-9]{64}$/),action:accessCommandInput.shape.action,reason:accessCommandInput.shape.reason,beforeDigest:z.string().regex(/^[a-f0-9]{64}$/),afterDigest:z.string().regex(/^[a-f0-9]{64}$/),committedAt:z.number().int().nonnegative(),access:accountAccessSchema,roles:z.array(z.enum(['buyer','seller'])).min(1).max(2)}).strict();
function authorize(proof:SessionProof,state:OperatorAccountAccessState){
 if(proof.record.realm!=='ADMIN')throw new SessionError('ADMIN_SESSION_REQUIRED',403);
 const actor=SessionService.assertOperatorCommitted(proof,state.auth);
 const environmentDigest=digest([config.arcChainId,config.hubAddress.toLowerCase(),config.operatorAddress.toLowerCase(),state.auth.authRecovery??null]);
 return{actor,environmentDigest};
}
function target(state:OperatorAccountAccessState){if(!state.target)throw new AccountAccessError('ACCOUNT_ACCESS_NOT_FOUND',404);readAccountAccess(state.target.accountAccess);return state.target;}
function view(proof:SessionProof,state:OperatorAccountAccessState){const {environmentDigest}=authorize(proof,state),t=target(state),access=t.accountAccess;return{version:'1.0',scope:'OPERATOR_ACCOUNT_ACCESS',operatorAccountId:proof.account.id,targetId:t.id,chainId:config.arcChainId,hubAddress:config.hubAddress,environmentDigest,targetDigest:targetDigest(t),revision:access?.revision??0,restricted:access?.restricted??false,sellerEnabled:access?.sellerEnabled!==false,sellerRolePresent:t.roles.includes('seller'),protected:t.protected||t.id===proof.account.id,openObligations:t.openObligations,updatedAt:access?.updatedAt??null,updatedBy:access?.updatedBy??null,reason:access?.reason??null,observedAt:Date.now()};}
function selection(proof:SessionProof,id:unknown,commandId?:string){const p=targetId.safeParse(id);if(!p.success)throw new AccountAccessError('ACCOUNT_ACCESS_INPUT_INVALID',400);return{actorId:proof.account.id,sessionKey:proof.key,targetId:p.data,controller:config.operatorAddress,commandId};}
function failure(e:unknown):never{if(e instanceof SessionError||e instanceof AccountAccessError)throw e;if(e instanceof StorageConflict)throw new AccountAccessError('ACCOUNT_ACCESS_CONFLICT');throw new AccountAccessError('ACCOUNT_ACCESS_UNAVAILABLE',503);}
export function readOperatorAccountAccess(proof:SessionProof,id:unknown,query:unknown){if(!z.object({}).strict().safeParse(query).success)throw new AccountAccessError('ACCOUNT_ACCESS_INPUT_INVALID',400);try{return store.readOperatorAccountAccess(selection(proof,id),s=>view(proof,s));}catch(e){return failure(e);}}
export function readOperatorAccountAccessCommand(proof:SessionProof,id:unknown,commandId:unknown,query:unknown){
 const p=z.string().uuid().safeParse(commandId);if(!p.success||!z.object({}).strict().safeParse(query).success)throw new AccountAccessError('ACCOUNT_ACCESS_INPUT_INVALID',400);
 try{return store.readOperatorAccountAccess(selection(proof,id,p.data),state=>{const {environmentDigest}=authorize(proof,state);if(!state.command)throw new AccountAccessError('ACCOUNT_ACCESS_COMMAND_NOT_FOUND',404);const command=commandSchema.safeParse(state.command);if(!command.success||!state.commandAudited||command.data.actorId!==proof.account.id||command.data.targetId!==id||command.data.commandId!==p.data)throw new AccountAccessError('ACCOUNT_ACCESS_COMMAND_UNAVAILABLE',503);return{receipt:command.data,replayed:true};});}catch(e){return failure(e);}
}
export function changeOperatorAccountAccess(proof:SessionProof,id:unknown,body:unknown){
 const parsed=accessCommandInput.safeParse(body);if(!parsed.success)throw new AccountAccessError('ACCOUNT_ACCESS_INPUT_INVALID',400);const input=parsed.data;
 try{return store.mutateOperatorAccountAccess(selection(proof,id,input.commandId),state=>{
  const {actor,environmentDigest}=authorize(proof,state),t=target(state),inputDigest=digest({targetId:t.id,...input});
  if(state.command){const command=commandSchema.safeParse(state.command);if(!command.success||!state.commandAudited||command.data.id!==accountCommandKey(actor.id,input.commandId)||command.data.actorId!==actor.id||command.data.targetId!==t.id||command.data.inputDigest!==inputDigest||command.data.environmentDigest!==input.environmentDigest)throw new AccountAccessError('ACCOUNT_ACCESS_COMMAND_CONFLICT');return{result:{receipt:command.data,replayed:true}};}
  if(environmentDigest!==input.environmentDigest)throw new AccountAccessError('ACCOUNT_ACCESS_ENVIRONMENT_CHANGED');
  if(t.protected||t.id===actor.id)throw new AccountAccessError('ACCOUNT_ACCESS_PROTECTED',403);
  if(targetDigest(t)!==input.expectedDigest)throw new AccountAccessError('ACCOUNT_ACCESS_CONFLICT');
  const before=t.accountAccess,restricted=before?.restricted??false,sellerEnabled=before?.sellerEnabled!==false;
  if(input.action==='RESTRICT'&&restricted||input.action==='RESTORE'&&!restricted||input.action==='GRANT_SELLER'&&sellerEnabled&&t.roles.includes('seller')||input.action==='REVOKE_SELLER'&&(!sellerEnabled||!t.roles.includes('seller')))throw new AccountAccessError('ACCOUNT_ACCESS_ALREADY_CURRENT');
  if(input.action==='REVOKE_SELLER'&&t.openObligations>0)throw new AccountAccessError('ACCOUNT_SELLER_OBLIGATIONS_OPEN');
  const now=Date.now(),access=accountAccessSchema.parse({version:1,revision:(before?.revision??0)+1,restricted:input.action==='RESTRICT'?true:input.action==='RESTORE'?false:restricted,sellerEnabled:input.action==='GRANT_SELLER'?true:input.action==='REVOKE_SELLER'?false:sellerEnabled,updatedAt:now,updatedBy:actor.id,reason:input.reason});
  // The historical seller role is retained for existing records; new activity checks sellerEnabled.
  const roles:AccountAccessTarget['roles']=input.action==='GRANT_SELLER'?[...new Set([...t.roles,'buyer','seller'] as const)]:t.roles.includes('buyer')?t.roles:['buyer',...t.roles];
  const command:AccountAccessCommand={id:accountCommandKey(actor.id,input.commandId),schema:'GroupDealAccountAccessCommandV1',actorId:actor.id,targetId:t.id,commandId:input.commandId,environmentDigest,inputDigest,action:input.action,reason:input.reason,beforeDigest:input.expectedDigest,afterDigest:targetDigest({...t,roles,accountAccess:access}),committedAt:now,access,roles};commandSchema.parse(command);
  return{result:{receipt:command,replayed:false},command};
 });}catch(e){return failure(e);}
}
