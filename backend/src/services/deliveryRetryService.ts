import {OperationPreparationService} from './operationPreparationService';
import type {SessionProof} from './sessionService';
import type {OperationReadinessGraph} from '../domain/operationReadiness';
import {ethers} from "ethers";
import {config} from "../config";
import {store} from "../db/store";
import {TransactionOperation} from "../domain/operation";
import {OperationService} from "./operationService";
import {OperationReplacementService} from "./operationReplacementService";
import {ResourceDeliveryService} from "./resourceDeliveryService";
import {ArcReadProvider} from "./arcReadProvider";
import {HUB_ABI} from "../contracts/hubAbi";
import {decryptEntitlement} from "../utils/crypto";
import {ProviderDeliveryService} from './providerDeliveryService';

const iface=new ethers.Interface(HUB_ABI),equal=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
/** Reuse an order's exact staged entitlement after a freshly verified terminal wallet outcome. No revocation, financial projection or signing. */
export class DeliveryRetryService {
 private static scope(sellerId:string,id:string,graph:OperationReadinessGraph=store.db){
  const operation=graph.operations[id];if(!operation||operation.userId!==sellerId)throw Error('FORBIDDEN: operation is not owned by this account');const order=graph.orders[operation.resourceId],campaign=order&&graph.campaigns[order.campaignId];
  if(operation.action!=="DELIVER"||!graph.users[sellerId]?.roles.includes("seller")||!order||!campaign||campaign.sellerId!==sellerId)throw new Error("FORBIDDEN: owned seller delivery is required");
  if(operation.chainId!==config.arcChainId||!equal(operation.hubAddress,config.hubAddress)||order.chainId!==operation.chainId||campaign.chainId!==operation.chainId||!equal(order.hubAddress,operation.hubAddress)||!equal(campaign.hubAddress,operation.hubAddress)||!equal(operation.principal,campaign.sellerPayoutWallet))throw new Error("CONFLICT: delivery deployment or principal changed");
  if(!Number.isSafeInteger(order.onchainOrderId)||order.onchainOrderId<1||!Number.isSafeInteger(campaign.onchainCampaignId)||campaign.onchainCampaignId!<1||!Number.isSafeInteger(order.quantity)||order.quantity<1)throw new Error("CONFLICT: delivery order binding is incomplete");
  return {operation,order,campaign};
 }
 static preparationScope(sellerId:string,id:string,graph:OperationReadinessGraph){return this.scope(sellerId,id,graph);}
 static assertReadyStage(sellerId:string,id:string,graph?:OperationReadinessGraph){this.scope(sellerId,id,graph);return ResourceDeliveryService.assertStage(sellerId,id,graph);}
 private static state(sellerId:string,id:string,graph:OperationReadinessGraph=store.db){
  const scoped=this.scope(sellerId,id,graph),grants=Object.values(graph.resourceGrants).filter(g=>g.orderId===scoped.order.id);
  return JSON.stringify({...scoped,grants,keys:grants.filter(g=>g.licenseKeyId).map(g=>graph.licenseInventory[g.licenseKeyId!]),product:scoped.campaign.productSnapshot,license:scoped.campaign.productSnapshot&&graph.licenseVersions[scoped.campaign.productSnapshot.licenseVersionId]});
 }
 public static async capability(operation:TransactionOperation,terminalBlock:number,graph:OperationReadinessGraph=store.db){
  const {order,campaign}=this.scope(operation.userId,operation.id,graph),provider=new ArcReadProvider();
  try{
   const tag=await provider.send("eth_blockNumber",[]),number=Number(BigInt(tag)),block=await provider.send("eth_getBlockByNumber",[tag,false]);
   if(!Number.isSafeInteger(number)||number<Math.max(config.deploymentBlock,terminalBlock)||!block||Number(BigInt(block.number))!==number||!ethers.isHexString(block.hash,32)||!Number.isSafeInteger(Number(BigInt(block.timestamp)))||Math.abs(Math.floor(Date.now()/1000)-Number(BigInt(block.timestamp)))>120)throw new Error();
   const read=async(fn:string,args:unknown[])=>iface.decodeFunctionResult(fn,await provider.send("eth_call",[{to:operation.hubAddress,data:iface.encodeFunctionData(fn,args)},tag]));
   const [terms,state,[details]]=await Promise.all([read("campaignTerms",[campaign.onchainCampaignId]),read("campaignStates",[campaign.onchainCampaignId]),read("getOrderDetails",[order.onchainOrderId])]);
   if(!equal(terms.sellerPayoutWallet,operation.principal)||!equal(terms.termsHash,campaign.termsHash)||state.status!==2n||state.finalizedAt<=0n||BigInt(block.timestamp)>state.finalizedAt+terms.deliverySlaSeconds||details.orderId!==BigInt(order.onchainOrderId)||details.campaignId!==BigInt(campaign.onchainCampaignId!)||!equal(details.buyerPrincipal,order.buyerPrincipal)||!equal(details.campaignIdentity,order.campaignIdentity)||details.quantity!==BigInt(order.quantity)||details.committedGross!==BigInt(order.committedGross)||details.lockedUnitPrice*details.quantity!==details.committedGross||details.deliveryStatus!==0n||details.deliveryTimestamp!==0n||details.deliveryProofHash!==ethers.ZeroHash)throw new Error("CONFLICT: canonical order is no longer eligible for this staged delivery");
   iface.decodeFunctionResult("recordDelivery",await provider.send("eth_call",[{to:operation.hubAddress,from:operation.principal,data:operation.calldata},tag]));
   const again=await provider.send("eth_getBlockByNumber",[tag,false]);if(!again||again.hash!==block.hash||again.number!==block.number||again.timestamp!==block.timestamp)throw new Error();
   return {blockNumber:number,blockHash:block.hash as string,checkedAt:Date.now()};
  }catch(error){if(error instanceof Error&&error.message.startsWith("CONFLICT:"))throw error;throw new Error("RPC_UNAVAILABLE: fixed-block delivery capability could not be verified; retain staged resources");}
  finally{provider.destroy();}
 }
 static async retry(sellerId:string,previousId:string,key:string,proof?:SessionProof){return OperationPreparationService.retry(sellerId,previousId,key,proof);}
 static async validateReady(sellerId:string,id:string,graph?:OperationReadinessGraph){
  const binding=this.state(sellerId,id,graph),{operation}=this.assertReadyStage(sellerId,id,graph);
  const scoped=this.scope(sellerId,id,graph);
  if(scoped.campaign.deliveryMethod==='WEBHOOK'){
   const current=await ProviderDeliveryService.resolve(sellerId,scoped.order.id,graph??store.db);
   if(JSON.stringify(current)!==decryptEntitlement(operation.stagedEntitlementEncrypted!))throw Error('CONFLICT: provider entitlement changed; retain the exact staged delivery');
  }
  const quote=await this.capability(structuredClone(operation),Math.max(config.deploymentBlock,operation.deliveryRetry?.terminal.blockNumber||0,operation.deliveryRetry?.capability.blockNumber||0),graph);
  if(this.state(sellerId,id,graph)!==binding)throw new Error("CONFLICT: delivery stage changed before signature reservation");
  this.assertReadyStage(sellerId,id,graph);return quote;
 }
}
