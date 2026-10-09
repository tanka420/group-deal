import {OperationCompletionService} from './operationCompletionService';
import {OperationPreparationService} from './operationPreparationService';
import type {SessionProof} from './sessionService';
import type {OperationReadinessGraph} from '../domain/operationReadiness';
import {ethers} from "ethers";
import {z} from "zod";
import {store} from "../db/store";
import {config} from "../config";
import {HUB_ABI} from "../contracts/hubAbi";
import {AuthorizationService} from "./authorizationService";
import {OperationService} from "./operationService";
import {TransactionOperation} from "../domain/operation";
import {deriveCampaignIdentity} from "../utils/crypto";
import {orderForChainId} from "./deploymentBindings";
import {VerificationResult} from "./transactionVerifier";
import {ProductService} from "./productService";

const iface=new ethers.Interface(HUB_ABI);
const schema=z.object({campaignId:z.string().min(1).max(180),quantity:z.number().int().positive().safe(),walletAddress:z.string(),requireEarlySlot:z.boolean(),maxGrossAmount:z.string().regex(/^\d{1,78}$/),idempotencyKey:z.string().regex(/^[a-zA-Z0-9:_-]{8,180}$/)}).strict();
type Input=z.infer<typeof schema>;
export class BuyOperationService {
  private static ownership(userId:string,input:Input,graph:OperationReadinessGraph=store.db){
    if(!Object.hasOwn(graph.users,userId)||!Object.hasOwn(graph.campaigns,input.campaignId))throw new Error("FORBIDDEN: account/campaign unavailable");
    const user=graph.users[userId],campaign=graph.campaigns[input.campaignId];
    if(!ethers.isAddress(input.walletAddress)||!user.activeWallet||user.activeWallet.toLowerCase()!==input.walletAddress.toLowerCase())throw new Error("FORBIDDEN: connect the active buyer principal");
    if(campaign.status==="DRAFT"||campaign.projectionOrigin==="CHAIN_UNBOUND"||!campaign.onchainCampaignId||campaign.chainId!==config.arcChainId||campaign.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase())throw new Error("CONFLICT: campaign deployment is unverified");
    if(campaign.termsPolicyReviewRequired)throw new Error("CONFLICT: changed chain terms require a verified product/license binding before buying");
    if(BigInt(input.maxGrossAmount)<=0n)throw new Error("VALIDATION: positive purchase cap required");
    return {campaign,principal:ethers.getAddress(input.walletAddress)};
  }
  public static authorization(operation:TransactionOperation){
    const call=iface.parseTransaction({data:operation.calldata}),quote=operation.purchaseQuote;
    if(operation.action!=="BUY"||call?.name!=="commitToBuy"||!quote)throw new Error("CONFLICT: durable purchase payload is missing");
    return {campaignId:String(call.args.campaignId),campaignIdentity:String(call.args.campaignIdentity),buyerWallet:operation.principal,nonce:quote.authorizationNonce,maxQuantity:Number(call.args.maxAuthQuantity),deadline:Number(call.args.authDeadline),termsHash:quote.termsHash,signature:String(call.args.authSignature),quote:{blockNumber:quote.blockNumber,blockHash:quote.blockHash,lockedUnitPrice:quote.lockedUnitPrice,commitmentAmount:quote.commitmentAmount,unitsAlreadyBought:quote.unitsAlreadyBought,remainingInventory:quote.remainingInventory}};
  }
  public static preparationIdentity(userId:string,input:Input,graph:OperationReadinessGraph){return this.ownership(userId,input,graph);}
  public static async prepare(userId:string,body:unknown,proof?:SessionProof){return OperationPreparationService.buy(userId,body,proof);}
  public static assertCurrentOwnership(userId:string,operation:TransactionOperation,graph:OperationReadinessGraph=store.db):Input {
    const authorization=this.authorization(operation),call=iface.parseTransaction({data:operation.calldata})!;
    const input:Input={campaignId:operation.resourceId,quantity:Number(call.args.quantity),walletAddress:operation.principal,requireEarlySlot:call.args.requireEarlySlot,maxGrossAmount:operation.purchaseQuote!.maxGrossAmount,idempotencyKey:operation.idempotencyKey};
    const {campaign}=this.ownership(userId,input,graph);
    ProductService.assertPublishable(campaign.sellerId,campaign.productSnapshot,campaign.endTime+campaign.deliverySlaSeconds,campaign.productSnapshot?graph.productPolicies?.[campaign.productSnapshot.productVersionId]:undefined);
    if(operation.chainId!==config.arcChainId||operation.hubAddress.toLowerCase()!==config.hubAddress.toLowerCase()||String(campaign.onchainCampaignId)!==authorization.campaignId||campaign.termsHash!==authorization.termsHash||deriveCampaignIdentity(userId,campaign.id)!==authorization.campaignIdentity)throw new Error("CONFLICT: purchase campaign/identity binding changed");
    return input;
  }
  public static async validateReady(userId:string,operation:TransactionOperation,graph?:OperationReadinessGraph,freshness?:()=>OperationReadinessGraph){
    const input=this.assertCurrentOwnership(userId,operation,graph),prior=this.authorization(operation);
    const current=await AuthorizationService.generateBuyAuthorization(userId,input.campaignId,input.quantity,input.walletAddress,{...input,expectedAuthorization:{nonce:prior.nonce,maxQuantity:prior.maxQuantity,deadline:prior.deadline}},graph,freshness);
    // Keep the signed nonce/deadline/calldata immutable. Only the read-only quote may become cheaper.
    if(current.signature!==prior.signature||current.campaignIdentity!==prior.campaignIdentity||current.termsHash!==prior.termsHash)throw new Error("CONFLICT: purchase authorization changed");
    return {...operation.purchaseQuote!,...current.quote};
  }
  public static validateReceipt(operation:TransactionOperation,proof:VerificationResult):void {
    const event=proof.parsedEvent,quote=operation.purchaseQuote,call=iface.parseTransaction({data:operation.calldata});
    if(!quote||!call||event.committedGross<=0n||event.lockedUnitPrice<=0n||event.committedGross!==event.lockedUnitPrice*event.quantity||event.committedGross>BigInt(quote.maxGrossAmount)||call.args.requireEarlySlot&&!event.isEarlySupporter)throw new Error("CONFLICT: commitment exceeds the approved purchase intent");
  }
  public static projected(userId:string,operation:TransactionOperation,verification:VerificationResult,proof?:SessionProof):void {
 const current=OperationCompletionService.owned(userId,operation.id,proof);if(current.action!=='BUY'||current.txHash?.toLowerCase()!==verification.txHash.toLowerCase())throw new Error('CONFLICT: purchase receipt changed');OperationCompletionService.projected(userId,current.id,proof);
}
}
