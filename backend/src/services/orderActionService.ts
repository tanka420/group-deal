import {OperationCompletionService} from './operationCompletionService';
import {OperationPreparationService} from './operationPreparationService';
import type {OperationReadinessGraph} from '../domain/operationReadiness';
import type {SessionProof} from './sessionService';
import {ethers} from "ethers";
import {z} from "zod";
import {store} from "../db/store";
import {config} from "../config";
import {HUB_ABI} from "../contracts/hubAbi";
import {ArcReadProvider} from "./arcReadProvider";
import {OperationService} from "./operationService";
import {TransactionOperation} from "../domain/operation";
import {VerificationResult} from "./transactionVerifier";
import {IndexerService} from "./indexerService";
import {DisputeService} from "./disputeService";
import {computeTermsHash,encryptEntitlement,decryptEntitlement} from "../utils/crypto";
import {cleanHttpsEvidenceUrl} from "../../../shared/evidence.mjs";

const iface=new ethers.Interface(HUB_ABI);
export const orderActionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("CONFIRM")}).strict(),z.object({action:z.literal("BREACH")}).strict(),z.object({action:z.literal("SETTLE")}).strict(),
  z.object({action:z.literal("DISPUTE"),reason:z.string().min(1).max(4000).refine(s=>!!s.trim()),evidenceUrls:z.array(z.string().refine(s=>!!cleanHttpsEvidenceUrl(s))).max(10)}).strict(),
  z.object({action:z.literal("RESOLVE"),buyerPercent:z.number().int().min(0).max(100),notes:z.string().min(1).max(4000).refine(s=>!!s.trim())}).strict()
]);
export type OrderActionInput=z.infer<typeof orderActionSchema>;
export const isOrderAction=(action:string)=>["CONFIRM","DISPUTE","BREACH","SETTLE","RESOLVE"].includes(action);

/** Order actions reserve an exact call; private evidence is staged before any wallet signature. */
export class OrderActionService {
  private static provider:any;
  public static setProvider(provider:any):void {this.provider=provider;}
  private static identity(userId:string,orderId:string,action:OrderActionInput["action"],graph:OperationReadinessGraph=store.db){
    if(!Object.hasOwn(graph.users,userId)||!Object.hasOwn(graph.orders,orderId))throw new Error("FORBIDDEN: order unavailable");
    const account=graph.users[userId],order=graph.orders[orderId],campaign=graph.campaigns[order.campaignId];
    if(!campaign||!account.activeWallet||!ethers.isAddress(account.activeWallet))throw new Error("FORBIDDEN: authenticated active principal required");
    if(order.chainId!==config.arcChainId||campaign.chainId!==config.arcChainId||order.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()||campaign.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()||!Number.isSafeInteger(order.onchainOrderId)||order.onchainOrderId<1||!Number.isSafeInteger(campaign.onchainCampaignId)||campaign.onchainCampaignId!<1)throw new Error("CONFLICT: order deployment binding is unverified");
    const principal=ethers.getAddress(account.activeWallet);
    if(action==="RESOLVE"){
      if(!account.roles.includes("operator")||principal.toLowerCase()!==config.operatorAddress.toLowerCase())throw new Error("FORBIDDEN: configured operator principal required");
    }else if(action==="SETTLE"){
      if(!account.roles.includes("seller")||campaign.sellerId!==userId||principal.toLowerCase()!==campaign.sellerPayoutWallet.toLowerCase())throw new Error("FORBIDDEN: campaign seller payout principal required");
    }else if(order.buyerAccountId!==userId||order.buyerPrincipal.toLowerCase()!==principal.toLowerCase())throw new Error("FORBIDDEN: order buyer principal required");
    return {principal,order:structuredClone(order),campaign:structuredClone(campaign)};
  }
  public static async quote(userId:string,orderId:string,input:OrderActionInput,graph?:OperationReadinessGraph){
    input=orderActionSchema.parse(input);
    const identity=this.identity(userId,orderId,input.action,graph),provider=this.provider||new ArcReadProvider(),owned=!this.provider;
    try{
      if((await provider.getNetwork()).chainId!==BigInt(config.arcChainId))throw new Error("Wrong chain");
      const number=await provider.getBlockNumber(),block=await provider.getBlock(number);
      if(!Number.isSafeInteger(number)||number<config.deploymentBlock||!block||block.number!==number||!ethers.isHexString(block.hash,32)||!Number.isSafeInteger(block.timestamp)||Math.abs(Math.floor(Date.now()/1000)-block.timestamp)>120)throw new Error("Unverified block");
      const read=async(name:string,args:unknown[])=>iface.decodeFunctionResult(name,await provider.call({to:config.hubAddress,data:iface.encodeFunctionData(name,args),blockTag:number}));
      const terms=await read("campaignTerms",[identity.campaign.onchainCampaignId]);
      if(String(terms.sellerPayoutWallet).toLowerCase()!==identity.campaign.sellerPayoutWallet.toLowerCase()||String(terms.termsHash).toLowerCase()!==identity.campaign.termsHash.toLowerCase())throw new Error("Terms mismatch");
      const [order]=await read("getOrderDetails",[identity.order.onchainOrderId]);
      if(order.orderId!==BigInt(identity.order.onchainOrderId)||order.campaignId!==BigInt(identity.campaign.onchainCampaignId!)||String(order.buyerPrincipal).toLowerCase()!==identity.order.buyerPrincipal.toLowerCase()||order.quantity<=0n||order.lockedUnitPrice*order.quantity!==order.committedGross)throw new Error("Order identity/gross mismatch");
      const allocated=BigInt(order.rebateAllocated)+BigInt(order.buyerRefundAllocated)+BigInt(order.sellerAllocated);
      if(allocated>BigInt(order.committedGross))throw new Error("Over-allocated onchain order");
      const remainingGross=BigInt(order.committedGross)-allocated,args:unknown[]=[identity.campaign.onchainCampaignId,identity.order.onchainOrderId];
      const expectedFunction={CONFIRM:"confirmReceipt",DISPUTE:"openDispute",BREACH:"claimDeliveryBreach",SETTLE:"settleUndisputedOrder",RESOLVE:"resolveDispute"}[input.action];
      const expectedEvent={CONFIRM:"OrderConfirmed",DISPUTE:"OrderDisputed",BREACH:"DeliveryBreached",SETTLE:"OrderConfirmed",RESOLVE:"DisputeResolved"}[input.action];
      const expectedEventArgs:Record<string,string|number>={campaignId:identity.campaign.onchainCampaignId!,orderId:identity.order.onchainOrderId};
      let buyerShare:string|undefined,sellerShare:string|undefined;
      if(input.action==="DISPUTE"){
        const reasonHash=ethers.keccak256(ethers.toUtf8Bytes(input.reason));args.push(reasonHash);Object.assign(expectedEventArgs,{disputedBy:identity.principal,reasonHash});
      }else if(input.action==="RESOLVE"){
        buyerShare=(remainingGross*BigInt(input.buyerPercent)/100n).toString();sellerShare=(remainingGross-BigInt(buyerShare)).toString();
        args.push(buyerShare,sellerShare);Object.assign(expectedEventArgs,{buyerShare,sellerShare});
      }
      const calldata=iface.encodeFunctionData(expectedFunction,args);
      // Contract capability/window/role guards execute at the same block as the financial reads.
      const simulation=await provider.call({to:config.hubAddress,from:identity.principal,data:calldata,blockTag:number});iface.decodeFunctionResult(expectedFunction,simulation);
      if((await provider.getBlock(number))?.hash!==block.hash)throw new Error("Quote block changed");
      const current=this.identity(userId,orderId,input.action,graph);
      if(current.principal!==identity.principal||current.order.onchainOrderId!==identity.order.onchainOrderId||current.campaign.onchainCampaignId!==identity.campaign.onchainCampaignId||current.campaign.termsHash!==identity.campaign.termsHash)throw new Error("CONFLICT: order identity changed during simulation");
      const deadline=order.deliveryTimestamp+172800n;if(deadline>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Unsafe dispute deadline");
      return {identity,calldata,expectedFunction,expectedEvent,expectedEventArgs,orderQuote:{kind:"READ_ONLY_SIMULATION" as const,blockNumber:number,blockHash:block.hash,remainingGross:remainingGross.toString(),...(buyerShare!==undefined?{buyerShare,sellerShare}:{}),disputeDeadline:Number(deadline)}};
    }catch(error){if(error instanceof Error&&/^(FORBIDDEN|CONFLICT|VALIDATION)/.test(error.message))throw error;throw new Error("RPC_UNAVAILABLE: order capability and fixed-block quote could not be verified; no signature reserved");}
    finally{if(owned)provider.destroy();}
  }
  public static preparationIdentity(userId:string,orderId:string,action:OrderActionInput['action'],graph:OperationReadinessGraph){return this.identity(userId,orderId,action,graph);}
  public static async prepare(userId:string,orderId:string,input:OrderActionInput,idempotencyKey:string,proof?:SessionProof){return OperationPreparationService.order(userId,orderId,input,idempotencyKey,proof);}
  public static completionMetadata(operation:TransactionOperation){try{return this.metadata(operation);}catch{throw new Error('CONFLICT: staged order metadata invalid; retain the receipt for recovery');}}
  private static metadata(operation:TransactionOperation){
    if(!operation.stagedOrderMetadataEncrypted)throw new Error("CONFLICT: private order action stage unavailable; keep receipt for recovery");
    const stage=JSON.parse(decryptEntitlement(operation.stagedOrderMetadataEncrypted)),input=orderActionSchema.parse(stage.input);
    if(stage.userId!==operation.userId||stage.orderId!==operation.resourceId||input.action!==operation.action||computeTermsHash(input)!==operation.orderMetadataHash)throw new Error("CONFLICT: order action metadata binding mismatch");return input;
  }
  public static assertCurrentOwnership(userId:string,operation:TransactionOperation,graph?:OperationReadinessGraph){
    const current=this.identity(userId,operation.resourceId,operation.action as OrderActionInput["action"],graph);
    const parsed=iface.parseTransaction({data:operation.calldata});
    if(current.principal.toLowerCase()!==operation.principal||current.campaign.termsHash!==operation.orderTermsHash||parsed?.name!==operation.expectedFunction||parsed.args[0]!==BigInt(current.campaign.onchainCampaignId!)||parsed.args[1]!==BigInt(current.order.onchainOrderId))throw new Error("CONFLICT: order action principal/terms/binding changed");return this.metadata(operation);
  }
  public static async validateReady(userId:string,operation:TransactionOperation,graph?:OperationReadinessGraph){
    const input=this.assertCurrentOwnership(userId,operation,graph),result=await this.quote(userId,operation.resourceId,input,graph);
    if(result.calldata!==operation.calldata)throw new Error("CONFLICT: chain allocation changed; this prepared split cannot be signed");return result.orderQuote;
  }
  public static async recover(userId:string,operation:TransactionOperation,verification:VerificationResult,proof?:SessionProof){
 const current=OperationCompletionService.owned(userId,operation.id,proof);if(current.txHash?.toLowerCase()!==verification.txHash.toLowerCase())throw new Error('CONFLICT: order receipt changed');
 await IndexerService.projectVerifiedReceipt(verification);OperationCompletionService.projected(userId,current.id,proof);
}
}
