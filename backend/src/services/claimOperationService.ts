import {OperationPreparationService} from './operationPreparationService';
import type {SessionProof} from './sessionService';
import type {OperationReadinessGraph} from '../domain/operationReadiness';
import {ethers} from "ethers";
import {config} from "../config";
import {store} from "../db/store";
import {ArcReadProvider} from "./arcReadProvider";
import {HUB_ABI} from "../contracts/hubAbi";
import {OperationService} from "./operationService";
import {orderForChainId} from "./deploymentBindings";
import {TransactionOperation} from "../domain/operation";

const iface=new ethers.Interface(HUB_ABI);
type ClaimAction="BUYER_CLAIM"|"SELLER_CLAIM";
export class ClaimOperationService {
  private static provider:any;
  public static setProvider(provider:any):void {this.provider=provider;}

  private static intent(userId:string,campaignId:string,action:ClaimAction,orderIds:string[],graph:OperationReadinessGraph=store.db){
    const account=graph.users[userId],campaign=graph.campaigns[campaignId];
    if(!account||!campaign||!account.activeWallet||!ethers.isAddress(account.activeWallet))throw new Error("FORBIDDEN: an authenticated active principal and campaign are required");
    if(!["BUYER_CLAIM","SELLER_CLAIM"].includes(action)||!Array.isArray(orderIds)||!orderIds.length||orderIds.length>50||new Set(orderIds).size!==orderIds.length)throw new Error("VALIDATION: select 1–50 unique orders for this claim");
    if(campaign.chainId!==config.arcChainId||campaign.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()||!campaign.onchainCampaignId||!Number.isSafeInteger(campaign.onchainCampaignId))throw new Error("CONFLICT: campaign deployment is not verified");
    const principal=ethers.getAddress(account.activeWallet);
    if(action==="SELLER_CLAIM"&&(campaign.sellerId!==userId||!account.roles.includes("seller")||campaign.sellerPayoutWallet.toLowerCase()!==principal.toLowerCase()))throw new Error("FORBIDDEN: connect the campaign payout principal");
    const chainIds=orderIds.map(id=>{
      if(typeof id!=="string"||!Object.hasOwn(graph.orders,id))throw new Error("FORBIDDEN: selected order is unavailable");
      const order=graph.orders[id];
      if(order.campaignId!==campaignId||order.chainId!==config.arcChainId||order.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()||!Number.isSafeInteger(order.onchainOrderId)||order.onchainOrderId<1)throw new Error("CONFLICT: order campaign/deployment binding is not verified");
      if(action==="BUYER_CLAIM"&&(order.buyerAccountId!==userId||order.buyerPrincipal.toLowerCase()!==principal.toLowerCase()))throw new Error("FORBIDDEN: connect the order buyer principal");
      return order.onchainOrderId;
    }).sort((a,b)=>a-b);
    const expectedFunction=action==="BUYER_CLAIM"?"claimBuyerFunds":"claimSellerProceeds";
    return {principal,campaign:structuredClone(campaign),chainIds,expectedFunction,calldata:iface.encodeFunctionData(expectedFunction,[campaign.onchainCampaignId,chainIds])};
  }

  /** This is a read-only simulation quote, not an allocation or completed transfer. All reads use the same canonical block. */
  public static async quote(userId:string,campaignId:string,action:ClaimAction,orderIds:string[],graph?:OperationReadinessGraph){
    const intent=this.intent(userId,campaignId,action,orderIds,graph),provider=this.provider||new ArcReadProvider(),owned=!this.provider;
    try {
      const network=await provider.getNetwork();if(network.chainId!==BigInt(config.arcChainId))throw new Error("Wrong chain");
      const number=await provider.getBlockNumber(),block=await provider.getBlock(number);
      if(!Number.isSafeInteger(number)||number<config.deploymentBlock||!block||block.number!==number||!ethers.isHexString(block.hash,32)||!Number.isSafeInteger(block.timestamp)||Math.abs(Math.floor(Date.now()/1000)-block.timestamp)>120)throw new Error("Unverified claim quote block");
      const call=async(name:string,args:unknown[])=>iface.decodeFunctionResult(name,await provider.call({to:config.hubAddress,data:iface.encodeFunctionData(name,args),blockTag:number}));
      const terms=await call("campaignTerms",[intent.campaign.onchainCampaignId]);
      if(String(terms.sellerPayoutWallet).toLowerCase()!==intent.campaign.sellerPayoutWallet.toLowerCase()||String(terms.termsHash).toLowerCase()!==intent.campaign.termsHash.toLowerCase())throw new Error("Campaign terms mismatch");
      for(const chainId of intent.chainIds){
        const [order]=await call("getOrderDetails",[chainId]);
        if(order.campaignId!==BigInt(intent.campaign.onchainCampaignId!)||action==="BUYER_CLAIM"&&String(order.buyerPrincipal).toLowerCase()!==intent.principal.toLowerCase())throw new Error("Onchain order principal/campaign mismatch");
      }
      const simulated=await provider.call({to:config.hubAddress,from:intent.principal,data:intent.calldata,blockTag:number});
      const [amount]=iface.decodeFunctionResult(intent.expectedFunction,simulated);
      if(typeof amount!=="bigint"||amount<=0n)throw new Error("No chain-verified claimable funds");
      const repeated=await provider.getBlock(number);if(repeated?.hash!==block.hash)throw new Error("Claim quote block changed");
      const current=this.intent(userId,campaignId,action,orderIds,graph);if(current.calldata!==intent.calldata||current.principal!==intent.principal||current.campaign.termsHash!==intent.campaign.termsHash)throw new Error("Account or claim intent changed");
      return {intent,financialQuote:{kind:"READ_ONLY_SIMULATION" as const,blockNumber:number,blockHash:block.hash,amountBaseUnits:amount.toString()}};
    }catch(error){if(error instanceof Error&&/^(FORBIDDEN|CONFLICT|VALIDATION)/.test(error.message))throw error;throw new Error("RPC_UNAVAILABLE: fixed-block claim simulation could not be verified; no signature has been reserved");}
    finally{if(owned)provider.destroy();}
  }

  public static preparationIntent(userId:string,campaignId:string,action:ClaimAction,orderIds:string[],graph:OperationReadinessGraph){return this.intent(userId,campaignId,action,orderIds,graph);}
  public static async prepare(userId:string,campaignId:string,action:ClaimAction,orderIds:string[],idempotencyKey:string,proof?:SessionProof){return OperationPreparationService.claim(userId,campaignId,action,orderIds,idempotencyKey,proof);}
  public static assertCurrentOwnership(userId:string,operation:TransactionOperation,graph:OperationReadinessGraph=store.db):string[]{
    if(!["BUYER_CLAIM","SELLER_CLAIM"].includes(operation.action))throw new Error("VALIDATION: claim operation required");
    const parsed=iface.parseTransaction({data:operation.calldata});
    if(!parsed||parsed.name!==operation.expectedFunction)throw new Error("CONFLICT: claim calldata changed");
    const ids=(parsed.args[1] as bigint[]).map(id=>{const order=orderForChainId(graph,id.toString());if(!order)throw new Error("CONFLICT: claim order projection is missing");return order.id;});
    const current=this.intent(userId,operation.resourceId,operation.action as ClaimAction,ids,graph);
    if(current.calldata!==operation.calldata||current.principal.toLowerCase()!==operation.principal)throw new Error("CONFLICT: claim principal/calldata changed");
    return ids;
  }
  public static async validateReady(userId:string,operation:TransactionOperation,graph?:OperationReadinessGraph){
    const ids=this.assertCurrentOwnership(userId,operation,graph);
    const result=await this.quote(userId,operation.resourceId,operation.action as ClaimAction,ids,graph);
    if(result.intent.calldata!==operation.calldata||result.intent.principal.toLowerCase()!==operation.principal)throw new Error("CONFLICT: claim principal/calldata changed");
    return result.financialQuote;
  }
}
