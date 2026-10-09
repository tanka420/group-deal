import {z} from 'zod';
import {ethers} from 'ethers';
import {HUB_ABI} from '../contracts/hubAbi';
import {eventDigest} from '../services/eventEvidence';
import {config} from '../config';
import type {VerificationResult} from '../services/transactionVerifier';
export class DisputeMetadataError extends Error{constructor(public code:string,public status:number){super(code)}}
export const metadataId=z.string().regex(/^[A-Za-z0-9:_-]{1,180}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
export const openMetadata=z.object({reason:z.string().min(1).max(4000).refine(v=>!!v.trim()),evidenceUrls:z.array(z.string().max(2048)).max(10)}).strict();
export const resolveMetadata=z.object({buyerShare:z.string().regex(/^\d{1,78}$/),sellerShare:z.string().regex(/^\d{1,78}$/),notes:z.string().min(1).max(4000).refine(v=>!!v.trim())}).strict();
const iface=new ethers.Interface(HUB_ABI);
export type MetadataKind='OPEN'|'RESOLVE';
export function metadataReceipt(v:VerificationResult,kind:MetadataKind){
 try{
  const name=kind==='OPEN'?'OrderDisputed':'DisputeResolved';
  if(!v||v.verified!==true||v.status!==1||v.eventName!==name||!ethers.isHexString(v.txHash,32)||!ethers.isHexString(v.blockHash,32)||!Number.isSafeInteger(v.blockNumber)||v.blockNumber<config.deploymentBlock||!Number.isSafeInteger(v.blockTimestamp)||v.blockTimestamp<0||!ethers.isAddress(v.from)||v.to?.toLowerCase()!==config.hubAddress.toLowerCase()||!Array.isArray(v.logs)||v.logs.length>256)throw Error();
  const matches=v.logs.flatMap(log=>{if(log.address?.toLowerCase()!==config.hubAddress.toLowerCase())return[];const parsed=iface.parseLog(log);return parsed?.name===name?[{log,parsed}]:[];});
  if(matches.length!==1)throw Error();const {log,parsed}=matches[0];
  if(log.transactionHash?.toLowerCase()!==v.txHash.toLowerCase()||log.blockHash?.toLowerCase()!==v.blockHash.toLowerCase()||log.blockNumber!==v.blockNumber||!Number.isSafeInteger(log.index)||log.index<0||!Number.isSafeInteger(log.transactionIndex)||log.transactionIndex<0)throw Error();
  const fields=kind==='OPEN'?['campaignId','orderId','disputedBy','reasonHash']:['campaignId','orderId','buyerShare','sellerShare'],payload=Object.fromEntries(fields.map(f=>[f,String(parsed.args[f])]));
  if(fields.some(f=>String(v.parsedEvent?.[f]).toLowerCase()!==payload[f].toLowerCase()))throw Error();
  return{verification:v,log,payload,digest:eventDigest(log),key:config.arcChainId+'_'+config.hubAddress.toLowerCase()+'_'+v.txHash.toLowerCase()+'_'+log.index};
 }catch{throw new DisputeMetadataError('DISPUTE_METADATA_PROOF_INVALID',400)}
}
export type MetadataReceipt=ReturnType<typeof metadataReceipt>;
