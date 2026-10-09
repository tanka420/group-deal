import {z} from 'zod';
import {ethers} from 'ethers';
import {store} from '../db/store';
import {StorageConflict,type CampaignAmendmentState} from '../db/rowPersistence';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import {inCurrentDeployment} from './deploymentBindings';
import {computeTermsHash} from '../utils/crypto';
const id=z.string().regex(/^[-A-Za-z0-9:_]{1,180}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const body=z.object({note:z.string().max(2000).transform(v=>v.trim()).refine(v=>v.length>0)}).strict();
const amendment=z.object({id,timestamp:z.number().int().nonnegative().max(8640000000000000),note:z.string().min(1).max(100000),hash:z.string().regex(/^0x[a-fA-F0-9]{64}$/)});
export class CampaignAmendmentError extends Error {constructor(readonly code:string,readonly status=409){super(code)}}
function selection(proof:SessionProof|undefined,campaignId:string,amendmentId?:string){if(!proof)throw new SessionError('AUTH_SESSION_INACTIVE',401);if(!id.safeParse(campaignId).success)throw new CampaignAmendmentError('AMENDMENT_INPUT_INVALID',400);return{actorId:proof.account.id,sessionKey:proof.key,campaignId,amendmentId};}
function history(state:CampaignAmendmentState,proof:SessionProof){
 const account=SessionService.assertCommitted(proof,state.auth);if(!account.roles.includes('seller'))throw new CampaignAmendmentError('AMENDMENT_SELLER_REQUIRED',403);
 const c=state.campaign;if(!c||c.sellerId!==account.id)throw new CampaignAmendmentError('AMENDMENT_CAMPAIGN_UNAVAILABLE',404);
 if(!inCurrentDeployment(c)||c.projectionOrigin!=='VERIFIED_PUBLISH'||!Number.isSafeInteger(c.onchainCampaignId)||c.onchainCampaignId!<1||!['PUBLISHED','ACTIVE','FINALIZED','CANCELLED'].includes(c.status)||!ethers.isHexString(c.creationTermsHash,32)||c.creationTermsHash?.toLowerCase()!==c.termsHash?.toLowerCase()||c.termsPolicyReviewRequired)throw new CampaignAmendmentError('AMENDMENT_CAMPAIGN_NEEDS_REVIEW');
 const parsed=z.array(amendment).safeParse(c.amendments);if(!parsed.success)throw new CampaignAmendmentError('AMENDMENT_HISTORY_UNAVAILABLE',503);
 const items=parsed.data;if(new Set(items.map(a=>a.id)).size!==items.length||items.some(a=>ethers.keccak256(ethers.toUtf8Bytes(a.note)).toLowerCase()!==a.hash.toLowerCase()))throw new CampaignAmendmentError('AMENDMENT_HISTORY_UNAVAILABLE',503);return items;
}
function failure(e:unknown):never{if(e instanceof SessionError||e instanceof CampaignAmendmentError)throw e;if(e instanceof Error&&(e.message.startsWith('CONFLICT:')||e instanceof StorageConflict))throw new CampaignAmendmentError('AMENDMENT_CONFLICT');throw new CampaignAmendmentError('AMENDMENT_UNAVAILABLE',503);}
export class CampaignAmendmentService {
 static list(proof:SessionProof|undefined,campaignId:string){const s=selection(proof,campaignId);try{return{campaignId,amendments:history(store.readCampaignAmendmentState(s),proof!)}}catch(e){return failure(e)}}
 static append(proof:SessionProof|undefined,campaignId:string,input:unknown,key:unknown){
  const s=selection(proof,campaignId),parsed=body.safeParse(input);if(!parsed.success||typeof key!=='string'||!/^amendment:[-A-Za-z0-9]{8,100}$/.test(key))throw new CampaignAmendmentError('AMENDMENT_INPUT_INVALID',400);
  const note=parsed.data.note,amendmentId='amd_'+computeTermsHash({schema:'CampaignAmendmentCommandV1',actorId:s.actorId,campaignId,key}).slice(2),hash=ethers.keccak256(ethers.toUtf8Bytes(note));s.amendmentId=amendmentId;
  try{return store.mutateCampaignAmendment(s,state=>{
   const items=history(state,proof!),prior=items.find(a=>a.id===amendmentId);
   if(prior){if(prior.hash!==hash||prior.note!==note)throw new CampaignAmendmentError('AMENDMENT_COMMAND_CONFLICT');if(!state.commandAudited)throw new CampaignAmendmentError('AMENDMENT_HISTORY_UNAVAILABLE',503);return{result:{success:true,campaignId,amendment:prior,amendments:items,replayed:true}};}
   if(state.commandAudited)throw new CampaignAmendmentError('AMENDMENT_HISTORY_UNAVAILABLE',503);if(items.length>=200)throw new CampaignAmendmentError('AMENDMENT_HISTORY_FULL');
   const entry={id:amendmentId,timestamp:Date.now(),note,hash};return{amendment:entry,result:{success:true,campaignId,amendment:entry,amendments:[...items,entry],replayed:false}};
  })}catch(e){return failure(e)}
 }
}
export function campaignAmendmentFailure(res:any,error:unknown){if(error instanceof SessionError||error instanceof CampaignAmendmentError)res.status(error.status).json({error:error.code,code:error.code});else res.status(503).json({error:'AMENDMENT_UNAVAILABLE',code:'AMENDMENT_UNAVAILABLE'});}
