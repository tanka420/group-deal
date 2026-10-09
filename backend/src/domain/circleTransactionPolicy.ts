import {ethers} from 'ethers';
import {z} from 'zod';
import {config} from '../config';
import {CircleAuthError} from './circleAuthentication';
import {circleWalletInput} from './circleWalletAuthority';
import type {DatabaseSchema} from '../db/store';
export type CircleTransactionGraph=Pick<DatabaseSchema,'users'|'campaigns'|'orders'|'operations'>;
const MAX_APPROVAL_BASE_UNITS=BigInt(process.env.CIRCLE_MAX_APPROVAL_BASE_UNITS||'1000000000');
const id=z.string().min(1).max(128).regex(/^[^\s\u0000-\u001f\u007f]+$/).refine(v=>!['constructor','prototype','__proto__'].includes(v)),uint=z.string().max(78).regex(/^(?:0|[1-9]\d*)$/).refine(v=>BigInt(v)<(1n<<256n)),positive=uint.refine(v=>v!=='0'),hash=z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const intent=z.discriminatedUnion('type',[
 z.object({type:z.literal('USDC_APPROVE'),amount:positive}).strict(),z.object({type:z.literal('CREATE_CAMPAIGN'),draftId:id}).strict(),z.object({type:z.literal('COMMIT_BUY'),campaignId:positive,quantity:positive}).strict(),z.object({type:z.literal('RECORD_DELIVERY'),orderId:id,proofHash:hash}).strict(),
 ...(['CLAIM_BUYER','CLAIM_SELLER'] as const).map(type=>z.object({type:z.literal(type),campaignId:positive,orderIds:z.array(positive).min(1).max(50).refine(v=>new Set(v).size===v.length)}).strict()),
 ...(['CONFIRM_RECEIPT','OPEN_DISPUTE','CLAIM_DELIVERY_BREACH','SETTLE_UNDISPUTED'] as const).map(type=>z.object({type:z.literal(type),campaignId:positive,orderId:positive}).strict()),z.object({type:z.literal('RESOLVE_DISPUTE'),campaignId:positive,orderId:positive,buyerShare:uint,sellerShare:uint}).strict()
]);
const feeDecimal=z.string().min(1).max(128).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).refine(v=>v.split('.')[0].length<=78&&/^\d+$/.test(v.split('.')[0])&&BigInt(v.split('.')[0])<(1n<<256n));
const feeGasLimit=z.string().max(78).regex(/^[1-9]\d*$/).refine(v=>v.length<=78&&/^[1-9]\d*$/.test(v)&&BigInt(v)<(1n<<256n));
const feeTier=z.object({gasLimit:feeGasLimit,gasPrice:feeDecimal.optional(),maxFee:feeDecimal.optional(),priorityFee:feeDecimal.optional(),baseFee:feeDecimal.optional(),networkFee:feeDecimal.optional(),networkFeeRaw:feeDecimal.optional(),l1Fee:feeDecimal.optional()}).strict();
const feeFields=['gasLimit','gasPrice','maxFee','priorityFee','baseFee','networkFee','networkFeeRaw','l1Fee'] as const;
function feeUnavailable(){return new CircleAuthError('CIRCLE_TRANSACTION_FEE_UNAVAILABLE',503)}
function feeKnown(value:unknown,fields:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw feeUnavailable();const known:Record<string,unknown>={};for(const key of fields)if(Object.prototype.hasOwnProperty.call(value,key))known[key]=(value as Record<string,unknown>)[key];return known}
function feeSumAtMost(values:string[],cap:string):boolean{const scale=Math.max(...[...values,cap].map(v=>v.split('.')[1]?.length??0)),scaled=(v:string)=>{const [whole,fraction='']=v.split('.');return BigInt(whole+fraction.padEnd(scale,'0'))};return values.reduce((sum,v)=>sum+scaled(v),0n)<=scaled(cap)}
export function circleFeeEstimate(value:unknown){
 const tiers=feeKnown(value,['low','medium','high']),result:Partial<Record<'low'|'medium'|'high',z.infer<typeof feeTier>>>={};
 for(const key of ['low','medium','high'] as const){if(!Object.prototype.hasOwnProperty.call(tiers,key))continue;const known=feeKnown(tiers[key],feeFields);if(known.gasPrice==='')delete known.gasPrice;const p=feeTier.safeParse(known);if(!p.success)throw feeUnavailable();const fee=p.data;
  if(fee.gasPrice!==undefined){if(fee.maxFee!==undefined||fee.priorityFee!==undefined||fee.baseFee!==undefined)throw feeUnavailable()}
  else if(fee.maxFee===undefined||fee.priorityFee===undefined||!feeSumAtMost([fee.priorityFee,...(fee.baseFee===undefined?[]:[fee.baseFee])],fee.maxFee))throw feeUnavailable();
  result[key]=fee;
 }
 if(Object.keys(result).length===0)throw feeUnavailable();return result;
}
export const circlePolicyInput=z.object({contractAddress:z.string().regex(/^0x[a-fA-F0-9]{40}$/).refine(v=>ethers.isAddress(v)&&ethers.getAddress(v)!==ethers.ZeroAddress),callData:z.string().min(10).max(131074).regex(/^0x(?:[a-fA-F0-9]{2})+$/),intent}).strict();
export const circleTransactionInput=circlePolicyInput.extend({userToken:circleWalletInput.shape.userToken,walletId:id}).strict();
export const circleChallengeInput=circleTransactionInput.extend({operationId:z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v))}).strict();
function normalizeIds(values:readonly unknown[]):string[]{return values.map(v=>BigInt(v as ethers.BigNumberish).toString())}
function assertSameIds(actual:readonly unknown[],expected:readonly string[]){const a=normalizeIds(actual),b=expected.map(v=>BigInt(v).toString());if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,'Transaction calldata does not match the declared order intent')}
function orderForPolicy(state:CircleTransactionGraph,id:string){const matches=Object.values(state.orders).filter(o=>String(o.onchainOrderId)===id&&o.chainId===config.arcChainId&&o.hubAddress?.toLowerCase()===config.hubAddress.toLowerCase());if(matches.length>1)throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,'Ambiguous order deployment binding');return matches[0]}
const usdcInterface = new ethers.Interface([
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

const hubInterface = new ethers.Interface([
  "function createCampaign((address sellerPayoutWallet, uint8 metric, uint256 maxPerAccount, uint256 inventoryLimit, uint256 durationSeconds, uint256 deliverySlaSeconds, bool earlyRebateEnabled, uint32 earlySlotsCount, uint256 earlyRebateAmount, uint16 earlyRebateBps, uint16 platformFeeBps, bytes32 termsHash) terms, (uint256 threshold, uint256 price)[] tiers) external returns (uint256 campaignId)",
  "function commitToBuy(uint256 campaignId, bytes32 campaignIdentity, uint256 quantity, bool requireEarlySlot, uint256 maxAuthQuantity, uint256 authDeadline, bytes authSignature) external returns (uint256)",
  "function recordDelivery(uint256 campaignId, uint256 orderId, bytes32 proofHash) external",
  "function claimBuyerFunds(uint256 campaignId, uint256[] orderIds) external returns (uint256)",
  "function claimSellerProceeds(uint256 campaignId, uint256[] orderIds) external returns (uint256)",
  "function confirmReceipt(uint256 campaignId, uint256 orderId) external",
  "function openDispute(uint256 campaignId, uint256 orderId, bytes32 reasonHash) external",
  "function claimDeliveryBreach(uint256 campaignId, uint256 orderId) external",
  "function settleUndisputedOrder(uint256 campaignId, uint256 orderId) external",
  "function resolveDispute(uint256 campaignId, uint256 orderId, uint256 buyerShare, uint256 sellerShare) external",
]);

export type CircleTransactionIntent =
  | { type: "USDC_APPROVE"; amount: string }
  | { type: "CREATE_CAMPAIGN"; draftId: string }
  | { type: "COMMIT_BUY"; campaignId: string; quantity: string }
  | { type: "RECORD_DELIVERY"; orderId: string; proofHash: string }
  | { type: "CLAIM_BUYER"; campaignId: string; orderIds: string[] }
  | { type: "CLAIM_SELLER"; campaignId: string; orderIds: string[] }
  | { type: "CONFIRM_RECEIPT"; campaignId: string; orderId: string }
  | { type: "OPEN_DISPUTE"; campaignId: string; orderId: string }
  | { type: "CLAIM_DELIVERY_BREACH"; campaignId: string; orderId: string }
  | { type: "SETTLE_UNDISPUTED"; campaignId: string; orderId: string }
  | {
      type: "RESOLVE_DISPUTE";
      campaignId: string;
      orderId: string;
      buyerShare: string;
      sellerShare: string;
    };


export function validateCirclePolicy(
    contractAddress: string,
    callData: string,
    intent: CircleTransactionIntent,
    userId?: string,
    state?:CircleTransactionGraph
  ): void {
    const input=circlePolicyInput.safeParse({contractAddress,callData,intent});if(!input.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');
    const target = ethers.getAddress(contractAddress).toLowerCase();
    const hub = ethers.getAddress(config.hubAddress).toLowerCase();
    const usdc = ethers.getAddress(config.usdcAddress).toLowerCase();

    if (!ethers.isHexString(callData) || callData.length < 10) {
      throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Contract calldata is invalid");
    }

    if (intent.type === "USDC_APPROVE") {
      if (target !== usdc) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"USDC approval must target the Arc USDC predeploy");
      const decoded = usdcInterface.decodeFunctionData("approve", callData);
      const amount = BigInt(decoded.amount);
      if (ethers.getAddress(decoded.spender).toLowerCase() !== hub) {
        throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"USDC approval spender must be GroupDealHub");
      }
      if (amount !== BigInt(intent.amount) || amount <= 0n || amount > MAX_APPROVAL_BASE_UNITS) {
        throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"USDC approval amount violates the declared intent or policy limit");
      }
      if(usdcInterface.encodeFunctionData('approve',[decoded.spender,decoded.amount]).toLowerCase()!==callData.toLowerCase())throw new CircleAuthError('CIRCLE_TRANSACTION_NONCANONICAL');
      return;
    }

    if (target !== hub) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"GroupDeal action must target the configured Hub contract");
    const parsed = hubInterface.parseTransaction({ data: callData });
    if (!parsed) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Unsupported GroupDeal calldata");
    if(hubInterface.encodeFunctionData(parsed.fragment,parsed.args).toLowerCase()!==callData.toLowerCase())throw new CircleAuthError('CIRCLE_TRANSACTION_NONCANONICAL');
    if(userId){
      const action={CREATE_CAMPAIGN:'PUBLISH',COMMIT_BUY:'BUY',RECORD_DELIVERY:'DELIVER',CLAIM_BUYER:'BUYER_CLAIM',CLAIM_SELLER:'SELLER_CLAIM',CONFIRM_RECEIPT:'CONFIRM',OPEN_DISPUTE:'DISPUTE',CLAIM_DELIVERY_BREACH:'BREACH',SETTLE_UNDISPUTED:'SETTLE',RESOLVE_DISPUTE:'RESOLVE'}[intent.type],circle=state!.users[userId]?.circleWallet?.address;
      const operations=Object.values(state!.operations).filter(o=>o.userId===userId&&o.action===action&&o.chainId===config.arcChainId&&o.hubAddress.toLowerCase()===hub&&o.calldata.toLowerCase()===callData.toLowerCase()&&o.principal===circle?.toLowerCase()&&o.expectedFunction===parsed.name&&['AWAITING_SIGNATURE','SUBMITTED','UNKNOWN','RECEIPT_VERIFIED'].includes(o.phase));
      if(operations.length!==1||intent.type==='CREATE_CAMPAIGN'&&operations[0].resourceId!==intent.draftId||intent.type==='RECORD_DELIVERY'&&operations[0].resourceId!==intent.orderId)throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,'Action requires the exact owned, reserved operation before a Circle challenge');
    }
    if(userId&&["CONFIRM_RECEIPT","OPEN_DISPUTE","CLAIM_DELIVERY_BREACH","SETTLE_UNDISPUTED","RESOLVE_DISPUTE"].includes(intent.type)){
      const circle=state!.users[userId]?.circleWallet?.address;
      const operation=Object.values(state!.operations).find(o=>o.userId===userId&&["CONFIRM","DISPUTE","BREACH","SETTLE","RESOLVE"].includes(o.action)&&o.chainId===config.arcChainId&&o.hubAddress.toLowerCase()===hub&&o.calldata.toLowerCase()===callData.toLowerCase()&&o.principal===circle?.toLowerCase()&&["AWAITING_SIGNATURE","SUBMITTED","UNKNOWN"].includes(o.phase));
      if(!operation)throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Order action requires the exact owned reserved operation before a Circle challenge");
    }

    switch (intent.type) {
      case "CREATE_CAMPAIGN": {
        if (!userId) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Authenticated user is required for campaign creation");
        const campaign = state!.campaigns[intent.draftId];
        if (!campaign || campaign.sellerId !== userId || campaign.status !== "DRAFT") {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Campaign draft is unavailable or not owned by the Circle user");
        }
        const circleAddress = state!.users[userId]?.circleWallet?.address;
        if (!circleAddress || circleAddress.toLowerCase() !== campaign.sellerPayoutWallet.toLowerCase()) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Seller must sign from the payout wallet bound to the campaign");
        }
        if(!['BUYER_COUNT','UNITS_COUNT'].includes(campaign.metric)||typeof campaign.earlyRebateEnabled!=='boolean'||!Array.isArray(campaign.tiers)||campaign.tiers.length<1||campaign.tiers.length>100)throw new CircleAuthError('CIRCLE_TRANSACTION_UNAVAILABLE',503);
        const expectedTerms = {
          sellerPayoutWallet: ethers.getAddress(campaign.sellerPayoutWallet),
          metric: campaign.metric === "BUYER_COUNT" ? 0 : 1,
          maxPerAccount: BigInt(campaign.maxPerAccount),
          inventoryLimit: BigInt(campaign.inventoryLimit),
          durationSeconds: BigInt(campaign.durationSeconds),
          deliverySlaSeconds: BigInt(campaign.deliverySlaSeconds),
          earlyRebateEnabled: campaign.earlyRebateEnabled,
          earlySlotsCount: campaign.earlySlotsCount,
          earlyRebateAmount: BigInt(campaign.earlyRebateAmount),
          earlyRebateBps: campaign.earlyRebateBps,
          platformFeeBps: campaign.platformFeeBps,
          termsHash: campaign.termsHash,
        };
        const expectedData = hubInterface.encodeFunctionData("createCampaign", [
          expectedTerms,
          campaign.tiers.map((tier) => ({ threshold: BigInt(tier.threshold), price: BigInt(tier.price) })),
        ]);
        if (parsed.name !== "createCampaign" || expectedData.toLowerCase() !== callData.toLowerCase()) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Campaign calldata does not match the immutable server draft");
        }
        break;
      }
      case "COMMIT_BUY":
        if (
          parsed.name !== "commitToBuy" ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString() ||
          BigInt(parsed.args.quantity).toString() !== BigInt(intent.quantity).toString()
        ) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Commit calldata does not match the declared purchase intent");
        }
        if(userId){
          const user=state!.users[userId],operation=Object.values(state!.operations).find(o=>o.userId===userId&&o.action==="BUY"&&o.calldata.toLowerCase()===callData.toLowerCase()&&o.chainId===config.arcChainId&&o.hubAddress.toLowerCase()===hub&&["AWAITING_SIGNATURE","SUBMITTED","UNKNOWN","RECEIPT_VERIFIED"].includes(o.phase));
          if(!operation||!user?.circleWallet||user.circleWallet.address.toLowerCase()!==operation.principal||user.activeWallet?.toLowerCase()!==operation.principal)throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Commit requires the owned, reserved immutable purchase operation and Circle principal");
        }
        break;
      case "RECORD_DELIVERY": {
        if (!userId) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Authenticated user is required for delivery");
        const order = state!.orders[intent.orderId];
        const campaign = order && state!.campaigns[order.campaignId];
        if (!order || !campaign || campaign.sellerId !== userId||order.chainId!==config.arcChainId||order.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()||campaign.chainId!==config.arcChainId||campaign.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Delivery intent is not owned by this seller");
        }
        if (!campaign.onchainCampaignId) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Delivery campaign does not have a verified Arc campaign ID");
        }
        const circleAddress = state!.users[userId]?.circleWallet?.address;
        if (!circleAddress || circleAddress.toLowerCase() !== campaign.sellerPayoutWallet.toLowerCase()) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Delivery must be signed by the campaign payout wallet");
        }
        if (
          parsed.name !== "recordDelivery" ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(campaign.onchainCampaignId).toString() ||
          BigInt(parsed.args.orderId).toString() !== BigInt(order.onchainOrderId).toString() ||
          String(parsed.args.proofHash).toLowerCase() !== intent.proofHash.toLowerCase()
        ) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Delivery calldata does not match the declared seller intent");
        }
        break;
      }
      case "CLAIM_BUYER":
      case "CLAIM_SELLER": {
        const expectedName = intent.type === "CLAIM_BUYER" ? "claimBuyerFunds" : "claimSellerProceeds";
        if (
          parsed.name !== expectedName ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString()
        ) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Claim calldata does not match the declared campaign intent");
        }
        assertSameIds(parsed.args.orderIds, intent.orderIds);
        if (userId) {
          for (const orderId of intent.orderIds) {
            const order = orderForPolicy(state!,BigInt(orderId).toString());
            const campaign = order && state!.campaigns[order.campaignId];
            if (!order || !campaign||campaign.chainId!==config.arcChainId||campaign.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Claim references an unknown order");
            if(String(campaign.onchainCampaignId)!==BigInt(intent.campaignId).toString())throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Claim order belongs to another campaign");
            if (intent.type === "CLAIM_BUYER" && (order.buyerAccountId !== userId||order.buyerPrincipal?.toLowerCase()!==state!.users[userId]?.circleWallet?.address.toLowerCase())) {
              throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Buyer claim references an order owned by another account");
            }
          if (intent.type === "CLAIM_SELLER" && campaign.sellerId !== userId) {
            throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Seller claim references a campaign owned by another account");
          }
          if (
            intent.type === "CLAIM_SELLER" &&
            state!.users[userId]?.circleWallet?.address.toLowerCase() !==
              campaign.sellerPayoutWallet.toLowerCase()
          ) {
            throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Seller claim must be signed by the campaign payout wallet");
          }
          }
        }
        break;
      }
      case "CONFIRM_RECEIPT":
      case "OPEN_DISPUTE":
      case "CLAIM_DELIVERY_BREACH":
      case "SETTLE_UNDISPUTED": {
        const expectedName = {
          CONFIRM_RECEIPT: "confirmReceipt",
          OPEN_DISPUTE: "openDispute",
          CLAIM_DELIVERY_BREACH: "claimDeliveryBreach",
          SETTLE_UNDISPUTED: "settleUndisputedOrder",
        }[intent.type];
        if (
          parsed.name !== expectedName ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString() ||
          BigInt(parsed.args.orderId).toString() !== BigInt(intent.orderId).toString()
        ) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Order calldata does not match the declared intent");
        }
        if (userId) {
          const order = orderForPolicy(state!,BigInt(intent.orderId).toString());
          if (!order) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Order intent references an unknown order");
          if(state!.campaigns[order.campaignId]?.chainId!==config.arcChainId||state!.campaigns[order.campaignId]?.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()||String(state!.campaigns[order.campaignId]?.onchainCampaignId)!==BigInt(intent.campaignId).toString())throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Order belongs to another campaign");
          if (intent.type !== "SETTLE_UNDISPUTED" && (order.buyerAccountId !== userId||order.buyerPrincipal?.toLowerCase()!==state!.users[userId]?.circleWallet?.address.toLowerCase())) {
            throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Order action is not owned by this buyer account");
          }
        }
        break;
      }
      case "RESOLVE_DISPUTE": {
        if (!userId) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Authenticated operator is required");
        const user = state!.users[userId];
        if (!user?.roles.includes("operator")) throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Operator role is required");
        if (user.circleWallet?.address.toLowerCase() !== config.operatorAddress.toLowerCase()) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Dispute resolution must be signed by the configured operator wallet");
        }
        if (
          parsed.name !== "resolveDispute" ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString() ||
          BigInt(parsed.args.orderId).toString() !== BigInt(intent.orderId).toString() ||
          BigInt(parsed.args.buyerShare).toString() !== BigInt(intent.buyerShare).toString() ||
          BigInt(parsed.args.sellerShare).toString() !== BigInt(intent.sellerShare).toString()
        ) {
          throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Dispute resolution calldata does not match the operator intent");
        }
        break;
      }
      default:
        throw new CircleAuthError('CIRCLE_TRANSACTION_POLICY_REJECTED',403,"Unsupported Circle transaction intent");
    }
  }
