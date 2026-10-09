import {z} from "zod";
import {ethers} from "ethers";
import {store,EventJournalRecord,NotificationSource,DatabaseSchema} from "../db/store";
import {accessiblePublicCampaign,accessiblePublicCampaignRecord} from './publicCampaign';
import crypto from 'node:crypto';
import {supportTicketSchema,supportCommandSchema} from '../domain/support';

const time=z.number().int().nonnegative().max(8640000000000000),hash=z.string().refine(value=>ethers.isHexString(value,32));
const sourceSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("CHAIN_EVENT"),eventId:z.string().max(220),eventName:z.string().min(1).max(80),chainId:z.number().int().positive(),hubAddress:z.string().refine(ethers.isAddress),txHash:hash,blockNumber:z.number().int().nonnegative(),blockHash:hash,logIndex:z.number().int().nonnegative(),occurredAt:time}),
  z.object({kind:z.literal('SELLER_FOLLOW_EVENT'),campaignId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),sellerId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),eventId:z.string().max(220),eventName:z.enum(['CampaignCreated','TierUnlocked','CampaignTermsUpdated','CampaignFinalized','EmergencyCancelled']),chainId:z.number().int().positive(),hubAddress:z.string().refine(ethers.isAddress),txHash:hash,blockNumber:z.number().int().nonnegative(),blockHash:hash,logIndex:z.number().int().nonnegative(),occurredAt:time}),
  z.object({kind:z.literal("SUPPORT_MESSAGE"),eventId:z.string().min(1).max(80),orderId:z.string().min(1).max(180),occurredAt:time}),
  z.object({kind:z.literal('SUPPORT_TICKET'),eventId:z.string().regex(/^support_command_[a-f0-9]{64}$/),ticketId:z.string().regex(/^tkt_[a-f0-9-]{36}$/),occurredAt:time}),
]);
export function notificationSource(value:unknown,userId:string,options:{operatorAuthorized?:boolean;allowPendingSupport?:boolean;allowPendingCampaign?:boolean;state?:DatabaseSchema}={}):NotificationSource|undefined {
  const parsed=sourceSchema.safeParse(value);if(!parsed.success)return undefined;const s=parsed.data;
  const metadataState=options.state??store.db;
  if(s.kind==="CHAIN_EVENT"||s.kind==='SELLER_FOLLOW_EVENT'){
    const row=metadataState.eventJournal[s.eventId];
    if(!row||row.id!==s.eventId||s.eventId!==`${s.chainId}_${s.hubAddress.toLowerCase()}_${s.txHash.toLowerCase()}_${s.logIndex}`||row.evidenceVersion!==2||!ethers.isHexString(row.eventDigest,32)||row.chainId!==s.chainId||typeof row.contractAddress!=="string"||row.contractAddress.toLowerCase()!==s.hubAddress.toLowerCase()||typeof row.txHash!=="string"||row.txHash.toLowerCase()!==s.txHash.toLowerCase()||typeof row.blockHash!=="string"||row.blockHash.toLowerCase()!==s.blockHash.toLowerCase()||row.blockNumber!==s.blockNumber||row.logIndex!==s.logIndex||row.eventName!==s.eventName||row.blockTimestamp===undefined||row.blockTimestamp*1000!==s.occurredAt)return undefined;
    if(s.kind==='SELLER_FOLLOW_EVENT'){const candidate=options.allowPendingCampaign?metadataState.campaigns[s.campaignId]:undefined,c=options.allowPendingCampaign?candidate&&accessiblePublicCampaignRecord(candidate,metadataState.products)?candidate:undefined:accessiblePublicCampaign(s.campaignId);if(!c||c.visibility!=='PUBLIC'||c.projectionOrigin!=='VERIFIED_PUBLISH'||c.sellerId!==s.sellerId||String(c.onchainCampaignId)!==String(row.payload.campaignId)||c.chainId!==s.chainId||c.hubAddress?.toLowerCase()!==s.hubAddress.toLowerCase()||!metadataState.users[s.sellerId]?.sellerProfile)return undefined;}
  }else if(s.kind==='SUPPORT_TICKET'){
    try{
      const state=options.allowPendingSupport?{user:metadataState.users[userId],ticket:metadataState.supportTickets[s.ticketId],command:metadataState.supportCommands[s.eventId]}:store.readSupportState(userId,{ticketId:s.ticketId,commandKey:s.eventId,metadataOnly:true});
      const t=supportTicketSchema.safeParse(state.ticket),c=supportCommandSchema.safeParse(state.command);
      if(!t.success||!c.success||t.data.id!==s.ticketId||c.data.ticketId!==s.ticketId||c.data.createdAt!==s.occurredAt||c.data.appliedRevision>t.data.revision||s.eventId!=='support_command_'+crypto.createHash('sha256').update(JSON.stringify([c.data.userId,c.data.id])).digest('hex')||!state.user||!(options.operatorAuthorized??state.user.roles.includes('operator'))&&![t.data.accountId,t.data.sellerId].includes(userId))return undefined;
    }catch{return undefined;}
  }else{
    if(options.allowPendingSupport){
    const order=metadataState.orders[s.orderId],campaign=order&&metadataState.campaigns[order.campaignId];
    const message=metadataState.supportMessages[s.orderId]?.find(m=>m.id===s.eventId);
    if(!message||message.timestamp!==s.occurredAt||!order||![order.buyerAccountId,campaign?.sellerId].includes(userId))return undefined;
    }else try{const state=store.readOrderThreadNoticeState(userId,s.orderId,s.eventId);if(!state.allowed||state.message?.orderId!==s.orderId||state.message?.timestamp!==s.occurredAt)return undefined;}catch{return undefined;}
  }
  return s;
}
export function journalNotificationSource(row:EventJournalRecord):NotificationSource {
  const source={kind:"CHAIN_EVENT" as const,eventId:row.id,eventName:row.eventName,chainId:row.chainId,hubAddress:row.contractAddress,txHash:row.txHash,blockNumber:row.blockNumber,blockHash:row.blockHash,logIndex:row.logIndex,occurredAt:(row.blockTimestamp??NaN)*1000};
  const parsed=sourceSchema.safeParse(source);if(!parsed.success||row.evidenceVersion!==2)throw new Error("NOTIFICATION_SOURCE_INVALID");return parsed.data;
}
