import type {OperationReadinessGraph} from '../domain/operationReadiness';
import { ethers } from "ethers";
import { config } from "../config";
import { store } from "../db/store";
import { deriveCampaignIdentity,computeTermsHash } from "../utils/crypto";
import { ArcReadProvider } from "./arcReadProvider";
import { HUB_ABI } from "./onchainService";
import { ProductService } from "./productService";

export class AuthorizationService {
  /**
   * Generates a signed EIP-712 buy authorization for a user to commit USDC on Arc Testnet.
   */
  public static async generateBuyAuthorization(
    userId: string,
    campaignId: string,
    quantity: number,
    buyerWalletAddress: string,
    intent?: {requireEarlySlot:boolean;maxGrossAmount:string;expectedAuthorization?:{nonce:number;maxQuantity:number;deadline:number}},
    context?:OperationReadinessGraph,
    freshness?:()=>OperationReadinessGraph
  ): Promise<{
    campaignId: string;
    campaignIdentity: string;
    buyerWallet: string;
    nonce: number;
    maxQuantity: number;
    deadline: number;
    termsHash: string;
    signature: string;
    quote: { blockNumber: number; blockHash: string; lockedUnitPrice: string; commitmentAmount: string; unitsAlreadyBought: string; remainingInventory: string | null };
  }> {
    const graph:OperationReadinessGraph=context??store.db;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive safe integer");
    if(intent&&(!/^\d+$/.test(intent.maxGrossAmount)||BigInt(intent.maxGrossAmount)<=0n||typeof intent.requireEarlySlot!=="boolean"))throw new Error("VALIDATION: positive integer purchase cap and early preference required");
    const user = graph.users[userId];
    if (!user) throw new Error("User not found");

    const storedCampaign = graph.campaigns[campaignId];
    if (!storedCampaign) throw new Error("Campaign not found");
    const campaign = structuredClone(storedCampaign);
    if (campaign.termsPolicyReviewRequired) throw new Error("CONFLICT: changed chain terms require a verified product/license binding before buying");

    if (!campaign.onchainCampaignId || campaign.chainId !== config.arcChainId || campaign.hubAddress?.toLowerCase() !== config.hubAddress.toLowerCase()) {
      throw new Error("Campaign does not have a verified Arc campaign ID");
    }
    const onchainCampaignId = campaign.onchainCampaignId;

    ProductService.assertPublishable(campaign.sellerId, campaign.productSnapshot, campaign.endTime + campaign.deliverySlaSeconds,campaign.productSnapshot?graph.productPolicies?.[campaign.productSnapshot.productVersionId]:undefined);

    const campaignIdentity = deriveCampaignIdentity(userId, campaignId);
    const buyerWallet = ethers.getAddress(buyerWalletAddress);

    // Verify wallet is bound to this user
    if (!user.activeWallet || user.activeWallet.toLowerCase() !== buyerWallet.toLowerCase()) {
      throw new Error("Specified wallet is not currently active on this account");
    }

    const provider = new ArcReadProvider();
    const hub = new ethers.Interface(HUB_ABI);
    let onchainNonce: number, unitsAlreadyBought: bigint, lockedUnitPrice: bigint, remainingInventory: bigint | null;
    let blockNumber: number, blockHash: string;
    let endTime: number;
    try {
      const blockTag = await provider.send("eth_blockNumber", []);
      blockNumber = Number(BigInt(blockTag));
      const block = await provider.send("eth_getBlockByNumber", [blockTag, false]);
      if (!Number.isSafeInteger(blockNumber) || !block || Number(BigInt(block.number)) !== blockNumber || !ethers.isHexString(block.hash,32)) throw new Error("Invalid quote block");
      blockHash = block.hash;
      const read = async (fn:string, args:unknown[]) => hub.decodeFunctionResult(fn, await provider.send("eth_call", [{to:config.hubAddress,data:hub.encodeFunctionData(fn,args)},blockTag]));
      const identityArgs = [BigInt(onchainCampaignId), campaignIdentity];
      const [terms,state,tiersResult,principal,nonce,units,authorizedSigner] = await Promise.all([
        read("campaignTerms", [onchainCampaignId]), read("campaignStates", [onchainCampaignId]), read("getCampaignTiers", [onchainCampaignId]),
        read("campaignIdentityPrincipals",identityArgs), read("identityNonces",identityArgs), read("buyerUnitsCommitted",identityArgs),read("authorizedSigner",[]),
      ]);
      const onchainPrincipal = principal[0] as string;
      if (onchainPrincipal !== ethers.ZeroAddress && onchainPrincipal.toLowerCase() !== buyerWallet.toLowerCase()) {
        throw new Error("Onchain principal already pinned to a different wallet");
      }
      for (const field of ["sellerPayoutWallet","maxPerAccount","inventoryLimit","durationSeconds","deliverySlaSeconds","earlyRebateEnabled","earlySlotsCount","earlyRebateAmount","earlyRebateBps","platformFeeBps","termsHash"] as const) {
        if (String(terms[field]).toLowerCase() !== String(campaign[field]).toLowerCase()) throw new Error("CHAIN_TERMS_MISMATCH: refresh the verified campaign before buying");
      }
      if (Number(terms.metric)!==(campaign.metric==="BUYER_COUNT"?0:1)) throw new Error("CHAIN_TERMS_MISMATCH: campaign metric");
      const tiers=tiersResult[0];
      if (tiers.length!==campaign.tiers.length||tiers.some((tier:any,i:number)=>String(tier.threshold)!==String(campaign.tiers[i].threshold)||String(tier.price)!==campaign.tiers[i].price)) throw new Error("CHAIN_TERMS_MISMATCH: campaign tiers");
      const timestamp=Number(BigInt(block.timestamp));
      if(!Number.isSafeInteger(timestamp)||Math.abs(Math.floor(Date.now()/1000)-timestamp)>120) throw new Error("Quote block is stale");
      endTime=Number(state.endTime);
      if (![0,1].includes(Number(state.status))||timestamp<Number(state.startTime)||timestamp>endTime||Math.floor(Date.now()/1000)>endTime) throw new Error("Campaign is closed for commitments on chain");
      if (new ethers.Wallet(config.authorizedSignerPrivateKey).address.toLowerCase()!==String(authorizedSigner[0]).toLowerCase()) throw new Error("AUTH_SIGNER_MISMATCH: authorization signer must match chain");
      unitsAlreadyBought=units[0];
      if(intent?.requireEarlySlot&&(!terms.earlyRebateEnabled||unitsAlreadyBought>0n||state.earlySlotsTaken>=terms.earlySlotsCount))throw new Error("Exceeds available first-purchase early slots");
      if (unitsAlreadyBought+BigInt(quantity)>terms.maxPerAccount) throw new Error("Exceeds maximum units per account on chain");
      remainingInventory=terms.inventoryLimit===0n?null:BigInt(terms.inventoryLimit)-BigInt(state.totalUnitsCommitted);
      if (remainingInventory!==null&&(remainingInventory<0n||BigInt(quantity)>remainingInventory)) throw new Error("Exceeds remaining campaign inventory on chain");
      lockedUnitPrice=tiers[Number(state.currentUnlockedTier)]?.price;
      if (typeof lockedUnitPrice!=="bigint"||lockedUnitPrice<=0n) throw new Error("Invalid chain price");
      if(intent&&lockedUnitPrice*BigInt(quantity)>BigInt(intent.maxGrossAmount))throw new Error("Exceeds approved purchase amount on chain");
      onchainNonce = Number(nonce[0]);
      if (!Number.isSafeInteger(onchainNonce)) throw new Error("Onchain nonce exceeds safe integer range");
      if(intent?.expectedAuthorization&&(onchainNonce!==intent.expectedAuthorization.nonce||unitsAlreadyBought+BigInt(quantity)!==BigInt(intent.expectedAuthorization.maxQuantity)))throw new Error("CONFLICT: purchase nonce or cumulative units changed; recover the existing intent");
      const repeatedBlock=await provider.send("eth_getBlockByNumber", [blockTag,false]);
      if(repeatedBlock?.hash!==blockHash)throw new Error("Quote block changed");
    } catch (error) {
      const message=error instanceof Error?error.message:"";
      if (/^(Onchain principal|CHAIN_TERMS_MISMATCH|Campaign is closed|AUTH_SIGNER_MISMATCH|Exceeds|CONFLICT)/.test(message)) throw error;
      throw new Error("[Security Fail-Closed] Failed to verify the fixed-block Arc financial quote. Commitment authorization refused.");
    } finally { provider.destroy(); }
    // Policies may change while RPC is in flight. Do not sign an obsolete account or product intent.
    const currentGraph:OperationReadinessGraph=context?(freshness?.()??context):store.db;
    const current = currentGraph.campaigns[campaignId];
    if (currentGraph.users[userId]?.activeWallet?.toLowerCase()!==buyerWallet.toLowerCase() || current?.termsHash!==campaign.termsHash || current?.onchainCampaignId!==onchainCampaignId) throw new Error("CONFLICT: account or campaign changed during authorization");
    ProductService.assertPublishable(current.sellerId,current.productSnapshot,endTime+current.deliverySlaSeconds,current.productSnapshot?currentGraph.productPolicies?.[current.productSnapshot.productVersionId]:undefined);

    // Authorization valid for 15 minutes
    const deadline = intent?.expectedAuthorization?.deadline??Math.min(endTime,Math.floor(Date.now() / 1000) + 15 * 60);
    if(!Number.isSafeInteger(deadline)||deadline> endTime||deadline<=Math.floor(Date.now()/1000)+30)throw new Error("CONFLICT: immutable purchase authorization expired; do not re-sign this intent");
    // The contract compares cumulative units to maxAuthQuantity, not this purchase alone.
    const maxQuantity = Number(unitsAlreadyBought + BigInt(quantity));
    if(!Number.isSafeInteger(maxQuantity)) throw new Error("Cumulative quantity exceeds safe integer range");

    // EIP-712 Domain
    const domain = {
      name: "GroupDealHub",
      version: "1",
      chainId: config.arcChainId,
      verifyingContract: config.hubAddress,
    };

    const types = {
      BuyAuthorization: [
        { name: "chainId", type: "uint256" },
        { name: "hubContract", type: "address" },
        { name: "campaignId", type: "uint256" },
        { name: "termsHash", type: "bytes32" },
        { name: "campaignIdentity", type: "bytes32" },
        { name: "buyerWallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "maxQuantity", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      chainId: BigInt(config.arcChainId),
      hubContract: config.hubAddress,
      campaignId: BigInt(onchainCampaignId),
      termsHash: campaign.termsHash,
      campaignIdentity: campaignIdentity,
      buyerWallet: buyerWallet,
      nonce: BigInt(onchainNonce),
      maxQuantity: BigInt(maxQuantity),
      deadline: BigInt(deadline),
    };

    const signer = new ethers.Wallet(config.authorizedSignerPrivateKey);
    const signature = await signer.signTypedData(domain, types, value);

    // Local signing awaits promises too. Recheck the pinned intent before releasing bytes or auditing issuance.
    const releasedGraph:OperationReadinessGraph=context?(freshness?.()??context):store.db;
    const released=releasedGraph.campaigns[campaignId];
    if(releasedGraph.users[userId]?.activeWallet?.toLowerCase()!==buyerWallet.toLowerCase()||released?.termsHash!==campaign.termsHash||released?.onchainCampaignId!==onchainCampaignId||released?.sellerId!==campaign.sellerId||released?.termsPolicyReviewRequired||!released?.productSnapshot||computeTermsHash(released.productSnapshot)!==computeTermsHash(campaign.productSnapshot)||deadline<=Math.floor(Date.now()/1000)+30)throw Error('CONFLICT: account or campaign changed during local signing');
    ProductService.assertPublishable(campaign.sellerId,campaign.productSnapshot,endTime+campaign.deliverySlaSeconds,released?.productSnapshot?releasedGraph.productPolicies?.[released.productSnapshot.productVersionId]:undefined);

    if(!context)store.addAuditLog(userId, "buyer", "BUY_AUTHORIZATION_ISSUED", {
      campaignId,
      campaignIdentity,
      buyerWallet,
      quantity,
      nonce: onchainNonce,
      quoteBlock:blockNumber,
    });

    return {
      campaignId: onchainCampaignId.toString(),
      campaignIdentity,
      buyerWallet,
      nonce: onchainNonce,
      maxQuantity,
      deadline,
      termsHash: campaign.termsHash,
      signature,
      quote:{blockNumber,blockHash,lockedUnitPrice:lockedUnitPrice.toString(),commitmentAmount:(lockedUnitPrice*BigInt(quantity)).toString(),unitsAlreadyBought:unitsAlreadyBought.toString(),remainingInventory:remainingInventory?.toString()??null},
    };
  }
}
