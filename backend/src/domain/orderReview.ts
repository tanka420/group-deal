import {z} from 'zod';
import {ethers} from 'ethers';
import {HUB_ABI} from '../contracts/hubAbi';
import {eventDigest} from '../services/eventEvidence';
import type {OrderRecord,CampaignRecord,EventJournalRecord,DatabaseSchema} from '../db/store';
export class OrderReviewError extends Error{constructor(public code:string,public status:number){super(code)}}
export const reviewOrderId=z.string().regex(/^[A-Za-z0-9:_-]{1,180}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const text=z.string().max(4000).transform(v=>v.trim()).refine(v=>v.length>0);
export const reviewInput=z.object({score:z.number().int().min(1).max(5),comment:text});
export const replyInput=z.object({sellerResponse:text});
export const storedReview=z.object({score:z.number().int().min(1).max(5),comment:z.string().min(1).max(4000),createdAt:z.number().int().nonnegative().max(8640000000000000),sellerResponse:z.string().min(1).max(4000).optional()});
export const orderViewFields=['id','onchainOrderId','protocolVersion','chainId','hubAddress','campaignId','buyerAccountId','campaignIdentity','buyerPrincipal','quantity','lockedUnitPrice','committedGross','isEarlySupporter','earlyRebateValue','rebateAllocated','sellerAllocated','buyerRefundAllocated','deliveryStatus','deliveryProofHash','deliveryTimestamp','disputeDeadline','disputeReason','disputeEvidence','txHash','commitmentTxHash','deliveryTxHash','buyerClaimedAmount','sellerClaimedAmount','financialProjectionBlock','createdAt','buyerClaimed','sellerClaimed'] as const;
export const orderHistoryFields=['action','txHash','blockNumber','blockHash','logIndex','chainId','hubAddress'] as const;
export type ReviewEnvironment={chainId:number;hubAddress:string;protocolVersion:number;deploymentBlock:number};
type Lineage={order:OrderRecord;campaign?:Pick<CampaignRecord,'id'|'sellerId'|'onchainCampaignId'|'chainId'|'hubAddress'>;identity?:DatabaseSchema['campaignIdentities'][string];events:EventJournalRecord[]};
const iface=new ethers.Interface(HUB_ABI),same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const uint=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?BigInt(v):typeof v==='string'&&/^\d{1,78}$/.test(v)?BigInt(v):undefined;
/** Committed indexer provenance only. This does not re-query a live receipt or establish product/license acceptance. */
export function indexedReviewEligible(state:Lineage,env:ReviewEnvironment):boolean{
 try{
  const {order:o,campaign:c,identity}=state;
  if(!['DELIVERED','CONFIRMED','RESOLVED'].includes(o.deliveryStatus)||o.chainId!==env.chainId||!same(o.hubAddress,env.hubAddress)||o.protocolVersion!==env.protocolVersion||!c||c.id!==o.campaignId||c.chainId!==env.chainId||!same(c.hubAddress,env.hubAddress)||!Number.isSafeInteger(c.onchainCampaignId)||!c.onchainCampaignId||!Number.isSafeInteger(o.onchainOrderId)||o.onchainOrderId<=0||!ethers.isAddress(o.buyerPrincipal)||!ethers.isHexString(o.campaignIdentity,32)||!identity||identity.accountId!==o.buyerAccountId||identity.campaignId!==o.campaignId||!same(identity.identity,o.campaignIdentity)||identity.derivationVersion!==1)return false;
  if(!Array.isArray(o.transactionHistory)||!ethers.isHexString(o.deliveryTxHash,32)||!ethers.isHexString(o.deliveryProofHash,32)||!Number.isSafeInteger(o.deliveryTimestamp)||!Number.isSafeInteger(o.disputeDeadline)||o.deliveryTimestamp!>o.disputeDeadline!)return false;
  const commitHash=o.commitmentTxHash??o.txHash;if(!ethers.isHexString(commitHash,32))return false;
  const history=(name:string,hash:string)=>{
   const values=o.transactionHistory!.filter(t=>t.action===name&&same(t.txHash,hash));if(values.length!==1)throw Error();
   const t=values[0];if(t.chainId!==env.chainId||!same(t.hubAddress,env.hubAddress)||!ethers.isHexString(t.blockHash,32)||!Number.isSafeInteger(t.blockNumber)||t.blockNumber<env.deploymentBlock||!Number.isSafeInteger(t.logIndex)||t.logIndex<0)throw Error();
   const key=env.chainId+'_'+env.hubAddress.toLowerCase()+'_'+hash.toLowerCase()+'_'+t.logIndex,events=state.events.filter(e=>e.id===key);if(events.length!==1)throw Error();const e=events[0];
   if(e.evidenceVersion!==2||e.eventName!==name||e.chainId!==env.chainId||!same(e.contractAddress,env.hubAddress)||!same(e.txHash,hash)||!same(e.blockHash,t.blockHash)||e.blockNumber!==t.blockNumber||e.logIndex!==t.logIndex||!Number.isSafeInteger(e.transactionIndex)||e.transactionIndex<0||!Number.isSafeInteger(e.blockTimestamp)||e.blockTimestamp!<0||!ethers.isHexString(e.eventDigest,32))throw Error();
   return{entry:t,event:e,payload:e.payload};
  };
  const buy=history('CommitmentMade',commitHash),delivery=history('DeliveryRecorded',o.deliveryTxHash);
  if(buy.entry.blockNumber>delivery.entry.blockNumber||buy.entry.blockNumber===delivery.entry.blockNumber&&buy.entry.logIndex>=delivery.entry.logIndex||!Number.isSafeInteger(o.financialProjectionBlock)||o.financialProjectionBlock!<delivery.entry.blockNumber)return false;
  const b=buy.payload,d=delivery.payload;
  if(uint(b.campaignId)!==BigInt(c.onchainCampaignId)||uint(b.orderId)!==BigInt(o.onchainOrderId)||!same(b.campaignIdentity,o.campaignIdentity)||!same(b.buyerPrincipal,o.buyerPrincipal)||uint(b.quantity)!==uint(o.quantity)||uint(b.lockedUnitPrice)!==uint(o.lockedUnitPrice)||uint(b.committedGross)!==uint(o.committedGross)||b.isEarlySupporter!==o.isEarlySupporter||uint(b.earlyRebateValue)!==uint(o.earlyRebateValue)||!Number.isSafeInteger(o.quantity)||o.quantity<=0||uint(o.lockedUnitPrice)===undefined||uint(o.lockedUnitPrice)!<=0n||uint(o.committedGross)!==BigInt(o.quantity)*uint(o.lockedUnitPrice)!)return false;
  if(uint(d.campaignId)!==BigInt(c.onchainCampaignId)||uint(d.orderId)!==BigInt(o.onchainOrderId)||!same(d.proofHash,o.deliveryProofHash)||uint(d.deliveryTimestamp)!==BigInt(o.deliveryTimestamp!)||uint(d.disputeDeadline)!==BigInt(o.disputeDeadline!)||delivery.event.blockTimestamp!==o.deliveryTimestamp)return false;
  const encodedBuy=iface.encodeEventLog(iface.getEvent('CommitmentMade')!,[b.campaignId,b.orderId,b.campaignIdentity,b.buyerPrincipal,b.quantity,b.lockedUnitPrice,b.committedGross,b.isEarlySupporter,b.earlyRebateValue]);
  const encodedDelivery=iface.encodeEventLog(iface.getEvent('DeliveryRecorded')!,[d.campaignId,d.orderId,d.proofHash,d.deliveryTimestamp,d.disputeDeadline]);
  return same(eventDigest(encodedBuy),buy.event.eventDigest)&&same(eventDigest(encodedDelivery),delivery.event.eventDigest);
 }catch{return false}
}
