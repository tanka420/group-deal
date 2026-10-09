import assert from "node:assert/strict";
import {ethers} from "ethers";
import {store} from "../src/db/store";
import {config} from "../src/config";
import {IndexerService} from "../src/services/indexerService";
import {NotificationService} from "../src/services/notificationService";
import {HUB_ABI} from "../src/contracts/hubAbi";
import {eventProvider} from "./fixtures/events";
import {decryptEntitlement} from "../src/utils/crypto";
import {DisputeService} from "../src/services/disputeService";
import {notificationSource} from "../src/services/notificationSource";

import {SessionService} from '../src/services/sessionService';

const seller="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",buyer="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",identityA=ethers.id("notification-owner-a"),identityB=ethers.id("notification-owner-b");
const iface=new ethers.Interface(HUB_ABI),termsHash=ethers.id("notification-terms"),logs:any[]=[],calldata:Record<string,any>={};
const event=(name:string,args:unknown[],blockNumber:number,index=0,hash=ethers.id("notification-event-"+logs.length))=>{
  const log={...iface.encodeEventLog(iface.getEvent(name)!,args),address:config.hubAddress,blockNumber,blockHash:ethers.id("block-"+blockNumber),transactionHash:hash,transactionIndex:0,index};logs.push(log);return log;
};
const count=(userId:string,type:string)=>NotificationService.list(userId).filter(n=>n.type===type).length;
const addUser=(id:string,roles:("buyer"|"seller"|"operator")[])=>{
  store.db.users[id]={id,email:id+"@example.test",emailVerified:true,roles,activeWallet:null,createdAt:Date.now()};store.db.userByEmail[id+"@example.test"]=id;
};
async function run(){
  assert.ok(store.isIsolated && store.storageDirectory.includes("local-check-temp"));
  const originalDeployment=config.deploymentBlock;config.deploymentBlock=1;
  try{
  addUser("notification-seller",["seller"]);addUser("notification-buyer-a",["buyer"]);addUser("notification-buyer-b",["buyer"]);addUser("notification-operator",["operator"]);addUser("notification-stranger",["buyer"]);
  store.db.campaigns["deal"]={id:"deal",onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:1,title:"Private fixture title",description:"Fixture",category:"General",thumbnailUrl:"",sellerId:"notification-seller",sellerPayoutWallet:seller,status:"DRAFT",visibility:"UNLISTED",metric:"BUYER_COUNT",tiers:[],currentUnlockedTier:0,maxPerAccount:10,inventoryLimit:0,durationSeconds:1000,deliverySlaSeconds:1000,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:"0",earlyRebateBps:0,platformFeeBps:0,termsHash,startTime:1700000001,endTime:1700001001,totalBuyerCount:0,totalUnitsCommitted:0,totalGrossCommitted:"0",deliveryMethod:"FILE_LINK",deliveryContentTemplate:"private-resource-placeholder",dryRunDeliveryVerified:false,amendments:[]};
  for(const [id,identity] of [["notification-buyer-a",identityA],["notification-buyer-b",identityB]])store.db.campaignIdentities[id+":deal"]={accountId:id,campaignId:"deal",identity,derivationVersion:1,createdAt:Date.now()};
  store.save();IndexerService.setProvider(eventProvider(logs,calldata));
  const created=event("CampaignCreated",[1,seller,termsHash,0,1700000001,1700001001,0],1);
  calldata[created.transactionHash]={from:seller,data:iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:seller,metric:0,maxPerAccount:10,inventoryLimit:0,durationSeconds:1000,deliverySlaSeconds:1000,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash},[{threshold:1,price:10000000},{threshold:2,price:8000000}]])};
  await IndexerService.processLogs([created]);
  const batchHash=ethers.id("notification-multiple-commit-receipt");
  const commits=[event("CommitmentMade",[1,1,identityA,buyer,1,10000000,10000000,false,0],2,0,batchHash),event("CommitmentMade",[1,2,identityB,buyer,1,10000000,10000000,false,0],2,1,batchHash),event("CommitmentMade",[1,3,identityA,buyer,1,10000000,10000000,false,0],2,2,batchHash)];
  const tier=event("TierUnlocked",[1,1,2,8000000],2,3,batchHash);await IndexerService.processLogs([...commits,tier]);
  assert.equal(count("notification-seller","ORDER_COMMITTED"),3,"Each canonical log needs its own seller notification, even inside one transaction");
  assert.equal(count("notification-buyer-a","ORDER_COMMITTED"),2);assert.equal(count("notification-buyer-b","ORDER_COMMITTED"),1);
  for(const id of ["notification-seller","notification-buyer-a","notification-buyer-b"])assert.equal(count(id,"TIER_UNLOCKED"),1);
  assert.equal(NotificationService.list("notification-stranger").length,0);assert.equal(NotificationService.list("notification-operator").length,0);
  const once=JSON.stringify(store.db.notifications);await IndexerService.processLogs([...commits,tier,...commits]);assert.equal(JSON.stringify(store.db.notifications),once);
  console.log("PASS per-log same-receipt dedupe, buyer/seller commit, unique campaign tier recipients and stranger exclusion");

  await IndexerService.processLogs([event("CampaignTermsUpdated",[1,ethers.id("notification-new-terms")],2,0,ethers.id("notification-terms-change"))]);
  for(const id of ["notification-seller","notification-buyer-a","notification-buyer-b"])assert.equal(count(id,"CAMPAIGN_TERMS_UPDATED"),1);
  assert.equal(store.db.campaigns.deal.termsPolicyReviewRequired,true);

  await IndexerService.processLogs([event("CampaignFinalized",[1,8000000,1,30000000,3],3)]);
  const claim=async(type:number,amount:number,ids:number[],block:number)=>{
    const hash=ethers.id("notification-claim-"+logs.length),recipient=type===0?buyer:seller;
    calldata[hash]={from:recipient,data:iface.encodeFunctionData(type===0?"claimBuyerFunds":"claimSellerProceeds",[1,ids])};
    await IndexerService.processLogs([event("FundsClaimed",[1,recipient,amount,type],block,0,hash)]);
  };
  await claim(0,4000000,[1,3],4);
  const deliveryHash=ethers.id("notification-multiple-delivery-receipt");
  await IndexerService.processLogs([event("DeliveryRecorded",[1,1,ethers.id("proof-1"),1700000005,1700001005],5,0,deliveryHash),event("DeliveryRecorded",[1,3,ethers.id("proof-3"),1700000005,1700001005],5,1,deliveryHash)]);
  const stateHash=ethers.id("notification-state-receipt");
  await IndexerService.processLogs([event("OrderDisputed",[1,1,buyer,ethers.id("notification-reason")],6,0,stateHash),event("OrderConfirmed",[1,3,8000000],6,1,stateHash)]);
  await IndexerService.processLogs([event("DisputeResolved",[1,1,3000000,5000000],7)]);
  await claim(0,5000000,[1,2],8);await claim(2,13000000,[1,3],9);
  await IndexerService.processLogs([event("DeliveryBreached",[1,2,8000000],10)]);await claim(0,8000000,[2],11);
  for(const id of ["notification-seller","notification-buyer-a","notification-buyer-b"])assert.equal(count(id,"CAMPAIGN_FINALIZED"),1);
  assert.equal(count("notification-buyer-a","ORDER_DELIVERED"),2);assert.equal(count("notification-seller","ORDER_DELIVERED"),2);
  assert.equal(count("notification-buyer-a","ORDER_CONFIRMED"),1);assert.equal(count("notification-seller","ORDER_CONFIRMED"),1);
  assert.equal(count("notification-buyer-a","ORDER_DISPUTED"),1);assert.equal(count("notification-seller","ORDER_DISPUTED"),1);assert.equal(count("notification-operator","OPERATOR_DISPUTE_REVIEW"),1);
  assert.equal(count("notification-buyer-a","DISPUTE_RESOLVED"),1);assert.equal(count("notification-seller","DISPUTE_RESOLVED"),1);
  assert.equal(count("notification-buyer-b","DELIVERY_BREACHED"),1);assert.equal(count("notification-seller","DELIVERY_BREACHED"),1);
  assert.equal(count("notification-buyer-a","BUYER_FUNDS_CLAIMED"),2);assert.equal(count("notification-buyer-b","BUYER_FUNDS_CLAIMED"),2);assert.equal(count("notification-seller","SELLER_FUNDS_CLAIMED"),1);
  assert.equal(store.db.orders["1"].buyerClaimedAmount,"5000000");assert.equal(store.db.orders["2"].buyerClaimedAmount,"10000000");assert.equal(store.db.orders["3"].sellerClaimedAmount,"8000000");
  console.log("PASS finalization/delivery/confirmation/dispute/resolution/SLA and cumulative buyer/seller claim notifications from pinned order ownership");

  for(const notification of Object.values(store.db.notifications)){
    const source=(notification as any).source;assert.ok(source);assert.equal(source.kind,"CHAIN_EVENT");
    const row=store.db.eventJournal[source.eventId];assert.ok(row);assert.equal(source.occurredAt,(1700000000+row.blockNumber)*1000);assert.equal(source.txHash,row.txHash);assert.equal(source.logIndex,row.logIndex);assert.equal(source.blockHash,row.blockHash);
    assert.ok((notification as any).translations?.en?.title);assert.ok((notification as any).translations?.en?.message);
    assert.ok(!JSON.stringify(notification).includes("private-resource-placeholder"));assert.ok(!JSON.stringify(notification).includes("Private fixture title"));
  }
  const operator=NotificationService.list("notification-operator")[0] as any;(store.db.notifications[operator.id] as any).source.privateField="source-private-extra";
  assert.ok(!JSON.stringify(NotificationService.list("notification-operator")).includes("source-private-extra"));
  assert.equal((NotificationService.list("notification-buyer-a").find(n=>n.type==="ORDER_DELIVERED") as any).title.includes("Sản phẩm số đã được giao"),false);
  const jobs=Object.values(store.db.emailOutbox);assert.equal(jobs.length,Object.keys(store.db.notifications).length);
  for(const job of jobs){const payload=JSON.parse(decryptEntitlement(job.payloadEncrypted!));assert.equal(payload.to,store.db.users[job.userId].email);assert.ok(!JSON.stringify(payload).includes("private-resource-placeholder"));}

  const created2=event("CampaignCreated",[2,seller,termsHash,0,1700000012,1700001012,0],12);
  calldata[created2.transactionHash]={from:seller,data:iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:seller,metric:0,maxPerAccount:10,inventoryLimit:0,durationSeconds:1000,deliverySlaSeconds:1000,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash},[{threshold:1,price:10000000}]])};
  await IndexerService.processLogs([created2]);
  assert.equal(store.db.campaigns["2"].projectionOrigin,"CHAIN_UNBOUND");assert.equal(count("notification-seller","CAMPAIGN_PUBLISHED"),1,"An unbound payout cannot select a seller account");
  store.db.campaignIdentities["notification-buyer-a:2"]={accountId:"notification-buyer-a",campaignId:"2",identity:identityA,derivationVersion:1,createdAt:Date.now()};store.save();
  await IndexerService.processLogs([event("CommitmentMade",[2,4,identityA,buyer,1,10000000,10000000,false,0],13)]);
  await IndexerService.processLogs([event("CampaignFinalized",[2,10000000,0,10000000,1],14)]);
  await IndexerService.processLogs([event("DeliveryRecorded",[2,4,ethers.id("cancelled-delivery-proof"),1700000015,1700001015],15)]);
  await IndexerService.processLogs([event("EmergencyCancelled",[2,ethers.id("notification-emergency-reason"),10000000],16)]);
  const operatorBefore=count("notification-operator","OPERATOR_DISPUTE_REVIEW");
  await IndexerService.processLogs([event("OrderDisputed",[2,4,buyer,ethers.id("post-cancel-reason")],17)]);
  assert.equal(store.db.orders["4"].deliveryStatus,"BREACHED_REFUNDED");assert.equal(store.db.orders["4"].buyerRefundAllocated,"10000000");assert.equal(count("notification-operator","OPERATOR_DISPUTE_REVIEW"),operatorBefore);
  assert.equal(count("notification-buyer-a","CAMPAIGN_CANCELLED"),1);assert.equal(count("notification-buyer-b","CAMPAIGN_CANCELLED"),0);assert.equal(NotificationService.list("notification-stranger").length,0);
  const cancelNotification=NotificationService.list("notification-buyer-a").find(n=>n.type==="CAMPAIGN_CANCELLED")!;
  assert.ok(cancelNotification.message.includes("chưa phân bổ"));assert.ok(!cancelNotification.message.includes("đã nhận tiền"));
  const cancelSource=cancelNotification.source!,row=store.db.eventJournal[cancelSource.eventId],digest=row.eventDigest;delete row.eventDigest;assert.equal(notificationSource(cancelSource,"notification-buyer-a"),undefined);row.eventDigest=digest;
  assert.equal(notificationSource({...cancelSource,eventId:"fabricated-coordinate"},"notification-buyer-a"),undefined);
  console.log("PASS terms review, unbound seller exclusion, emergency unallocated refund and no operator action for a post-cancellation dispute event");

  const privateSupport="synthetic-private-support-fixture",message=DisputeService.addMessage("1","seller",seller,privateSupport,SessionService.authenticate(SessionService.issue(store.db.users["notification-seller"])));
  const support=NotificationService.list("notification-buyer-a").find(n=>n.type==="SUPPORT_MESSAGE")!;
  assert.equal(support.source?.eventId,message.id);assert.equal(support.source?.kind,"SUPPORT_MESSAGE");assert.equal(support.source?.occurredAt,message.timestamp);
  assert.equal(notificationSource(support.source,"notification-buyer-b"),undefined);
  assert.equal(count("notification-seller","SUPPORT_MESSAGE"),0);assert.equal(count("notification-buyer-b","SUPPORT_MESSAGE"),0);
  assert.ok(!JSON.stringify(store.db.notifications).includes(privateSupport));for(const job of Object.values(store.db.emailOutbox))assert.ok(!decryptEntitlement(job.payloadEncrypted!).includes(privateSupport));
  console.log("PASS support source binds message/order/time and owned recipient, with private thread content excluded from notifications and mail");

  const before=JSON.stringify({notifications:store.db.notifications,outbox:store.db.emailOutbox,orders:store.db.orders,journal:store.db.eventJournal});
  const invalid=event("TierUnlocked",[1,1,2,8000000],18);IndexerService.setProvider({...eventProvider(logs,calldata),getTransactionReceipt:async()=>null});await assert.rejects(IndexerService.processLogs([invalid]));
  assert.equal(JSON.stringify({notifications:store.db.notifications,outbox:store.db.emailOutbox,orders:store.db.orders,journal:store.db.eventJournal}),before);
  console.log("PASS verified event timestamp/coordinates, English content, DTO allowlist, private resource exclusion and invalid receipt leaves all writes unchanged");
  console.log("PASS NOTIFICATION_EVENTS: 5 scoped checks; canonical receipt-shaped local fixtures, no live chain/provider/delivery acceptance");
  }finally{config.deploymentBlock=originalDeployment;}
}
run().catch((error:unknown)=>{
  console.error("FAIL NOTIFICATION_EVENTS: "+(error instanceof Error?error.name:"UnknownError"));
  if(error instanceof Error)for(const frame of (error.stack||"").split("\n").filter(line=>/^\s+at /.test(line)&&/notification_events\.test\.ts/.test(line)).slice(0,4))console.error(frame);
  process.exitCode=1;
});
