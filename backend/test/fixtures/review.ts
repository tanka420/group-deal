import {ethers} from 'ethers';
import type {TransactionalStore,EventJournalRecord} from '../../src/db/store';
import {config} from '../../src/config';
import {HUB_ABI} from '../../src/contracts/hubAbi';
import {eventDigest} from '../../src/services/eventEvidence';
const iface=new ethers.Interface(HUB_ABI);
/** Synthetic receipt-shaped lineage in a test-only store, never live acceptance. */
export function installReviewLineage(database:TransactionalStore,orderId:string){
 if(!database.isIsolated)throw Error('Review fixture requires isolated storage');
 const order=database.db.orders[orderId],campaign=database.db.campaigns[order.campaignId],base=Math.max(config.deploymentBlock,1)+10,t=Math.floor(Date.now()/1000)-30;
 order.deliveryTimestamp=t+5;order.disputeDeadline=t+86405;
 order.commitmentTxHash??=order.txHash;order.deliveryTxHash??=ethers.id('review-delivery-'+orderId);order.deliveryProofHash??=ethers.id('review-proof-'+orderId);
 order.chainId=config.arcChainId;order.hubAddress=config.hubAddress;order.protocolVersion=config.protocolVersion;
 campaign.onchainCampaignId??=1;campaign.chainId=config.arcChainId;campaign.hubAddress=config.hubAddress;
 database.db.campaignIdentities[order.buyerAccountId+':'+order.campaignId]={accountId:order.buyerAccountId,campaignId:order.campaignId,identity:order.campaignIdentity,derivationVersion:1,createdAt:Date.now()};
 const values=[
 {name:'CommitmentMade',txHash:order.commitmentTxHash,blockNumber:base,args:[campaign.onchainCampaignId,order.onchainOrderId,order.campaignIdentity,order.buyerPrincipal,order.quantity,order.lockedUnitPrice,order.committedGross,order.isEarlySupporter,order.earlyRebateValue]},
 {name:'DeliveryRecorded',txHash:order.deliveryTxHash,blockNumber:base+1,args:[campaign.onchainCampaignId,order.onchainOrderId,order.deliveryProofHash,order.deliveryTimestamp,order.disputeDeadline]},
 ];
 const previous=order.transactionHistory?.[0];order.transactionHistory=[];
 for(const v of values){
  const encoded=iface.encodeEventLog(iface.getEvent(v.name)!,v.args),parsed=iface.parseLog(encoded)!,blockHash=ethers.id('review-block-'+v.blockNumber),logIndex=0,key=config.arcChainId+'_'+config.hubAddress.toLowerCase()+'_'+v.txHash!.toLowerCase()+'_'+logIndex;
  const journal:EventJournalRecord={id:key,chainId:config.arcChainId,contractAddress:config.hubAddress,blockNumber:v.blockNumber,blockHash,transactionIndex:0,txHash:v.txHash!,logIndex,eventName:v.name,payload:JSON.parse(JSON.stringify(parsed.args.toObject(),(_key,value)=>typeof value==='bigint'?value.toString():value)),processedAt:Date.now(),evidenceVersion:2,eventDigest:eventDigest(encoded),blockTimestamp:t+(v.name==='DeliveryRecorded'?5:0)};
  database.db.eventJournal[key]=journal;
  order.transactionHistory.push({...previous,action:v.name,txHash:v.txHash!,blockNumber:v.blockNumber,blockHash,logIndex,chainId:config.arcChainId,hubAddress:config.hubAddress});
 }
 order.financialProjectionBlock=base+1;
 return values.map(v=>config.arcChainId+'_'+config.hubAddress.toLowerCase()+'_'+v.txHash!.toLowerCase()+'_0');
}
