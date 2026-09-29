import { ethers } from "ethers";
import { config } from "../config";

export const HUB_ABI = [
  "function createCampaign((address sellerPayoutWallet, uint8 metric, uint256 maxPerAccount, uint256 inventoryLimit, uint256 durationSeconds, uint256 deliverySlaSeconds, bool earlyRebateEnabled, uint32 earlySlotsCount, uint256 earlyRebateAmount, uint16 earlyRebateBps, uint16 platformFeeBps, bytes32 termsHash) terms, (uint256 threshold, uint256 price)[] tiers) external returns (uint256 campaignId)",
  "function recordDelivery(uint256 campaignId, uint256 orderId, bytes32 proofHash) external",
  "function finalizeCampaign(uint256 campaignId) external",
  "function confirmReceipt(uint256 campaignId, uint256 orderId) external",
  "function settleUndisputedOrder(uint256 campaignId, uint256 orderId) external",
  "function resolveDispute(uint256 campaignId, uint256 orderId, uint256 buyerShare, uint256 sellerShare) external",
  "function emergencyCancelCampaign(uint256 campaignId, bytes32 reasonHash) external",
  "function allocateRebatesBatch(uint256 campaignId, uint256 startIndex, uint256 count) external",
  "function nextCampaignId() external view returns (uint256)",
  "function getCampaignTiers(uint256 campaignId) external view returns ((uint256 threshold, uint256 price)[])",
  "function campaignStates(uint256 campaignId) external view returns (uint8 status, uint256 startTime, uint256 endTime, uint256 finalizedAt, uint256 finalClearingPrice, uint8 finalTierIndex, uint256 totalUnitsCommitted, uint256 totalBuyerCount, uint8 currentUnlockedTier, uint32 earlySlotsTaken, uint256 totalGrossCommitted, uint256 totalSellerClaimable, uint256 totalSellerClaimed, uint256 firstCommitmentTime)",
  "event CampaignCreated(uint256 indexed campaignId, address indexed sellerPayoutWallet, bytes32 termsHash, uint8 metric, uint256 startTime, uint256 endTime, uint256 inventoryLimit)",
  "event TierUnlocked(uint256 indexed campaignId, uint8 tierIndex, uint256 threshold, uint256 price)",
  "event CommitmentMade(uint256 indexed campaignId, uint256 indexed orderId, bytes32 indexed campaignIdentity, address buyerPrincipal, uint256 quantity, uint256 lockedUnitPrice, uint256 committedGross, bool isEarlySupporter, uint256 earlyRebateValue)",
  "event CampaignFinalized(uint256 indexed campaignId, uint256 finalClearingPrice, uint8 finalTierIndex, uint256 totalCommitted, uint256 totalUnits)",
  "event DeliveryRecorded(uint256 indexed campaignId, uint256 indexed orderId, bytes32 proofHash, uint256 deliveryTimestamp, uint256 disputeDeadline)",
  "event DeliveryBreached(uint256 indexed campaignId, uint256 indexed orderId, uint256 refundAmount)",
  "event OrderConfirmed(uint256 indexed campaignId, uint256 indexed orderId, uint256 sellerProceeds)",
  "event OrderDisputed(uint256 indexed campaignId, uint256 indexed orderId, address indexed disputedBy, bytes32 reasonHash)",
  "event DisputeResolved(uint256 indexed campaignId, uint256 indexed orderId, uint256 buyerShare, uint256 sellerShare)",
  "event FundsClaimed(uint256 indexed campaignId, address indexed recipient, uint256 amount, uint8 claimType)",
  "event EmergencyCancelled(uint256 indexed campaignId, bytes32 reasonHash, uint256 refundPool)"
];

export interface OnchainCampaignTerms {
  sellerPayoutWallet: string;
  durationSeconds: number;
  deliverySlaSeconds: number;
  maxPerAccount: number;
  inventoryLimit: number;
  platformFeeBps?: number;
  metric: number; // 0 for BUYER_COUNT, 1 for UNITS_COUNT
  tiers: { threshold: number | bigint; price: number | bigint }[];
  earlyRebateEnabled: boolean;
  earlySlotsCount: number;
  earlyRebateAmount: number | bigint;
  earlyRebateBps?: number;
  termsHash: string;
}

export class OnchainService {
  private static providerInstance: ethers.JsonRpcProvider | null = null;

  public static getProvider(): ethers.JsonRpcProvider {
    if (!this.providerInstance) {
      this.providerInstance = new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
        staticNetwork: true,
      });
    }
    return this.providerInstance;
  }

  public static getHubContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
    const p = signerOrProvider || this.getProvider();
    return new ethers.Contract(config.hubAddress, HUB_ABI, p);
  }

  /**
   * Broadcast createCampaign transaction to Arc Testnet
   */
  public static async createCampaignOnchain(
    terms: OnchainCampaignTerms,
    signerPrivateKey: string
  ): Promise<{ onchainCampaignId: number; txHash: string }> {
    const provider = this.getProvider();
    const signer = new ethers.Wallet(signerPrivateKey, provider);
    const hub = this.getHubContract(signer);

    const contractTerms = {
      sellerPayoutWallet: ethers.getAddress(terms.sellerPayoutWallet),
      metric: terms.metric,
      maxPerAccount: BigInt(terms.maxPerAccount),
      inventoryLimit: BigInt(terms.inventoryLimit),
      durationSeconds: BigInt(terms.durationSeconds),
      deliverySlaSeconds: BigInt(terms.deliverySlaSeconds),
      earlyRebateEnabled: Boolean(terms.earlyRebateEnabled),
      earlySlotsCount: Number(terms.earlySlotsCount || 0),
      earlyRebateAmount: BigInt(terms.earlyRebateAmount || 0),
      earlyRebateBps: Number(terms.earlyRebateBps || 0),
      platformFeeBps: Number(terms.platformFeeBps || 0),
      termsHash: terms.termsHash,
    };

    const formattedTiers = terms.tiers.map((t) => ({
      threshold: BigInt(t.threshold),
      price: BigInt(t.price),
    }));

    const tx = await hub.createCampaign(contractTerms, formattedTiers);
    const receipt = await tx.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Failed to create campaign onchain. Tx status: ${receipt?.status}`);
    }

    // Parse event logs
    const iface = new ethers.Interface(HUB_ABI);
    let onchainCampaignId = 0;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (parsed && parsed.name === "CampaignCreated") {
          onchainCampaignId = Number(parsed.args.campaignId);
          break;
        }
      } catch {
        // Skip logs not from GroupDealHub
      }
    }

    if (onchainCampaignId === 0) {
      // Fallback: query nextCampaignId - 1
      const nextId = await hub.nextCampaignId();
      onchainCampaignId = Number(nextId) - 1;
    }

    return { onchainCampaignId, txHash: receipt.hash };
  }

  /**
   * Broadcast recordDelivery transaction to Arc Testnet (Caller must be sellerPayoutWallet or Operator)
   */
  public static async recordDeliveryOnchain(
    onchainCampaignId: number,
    onchainOrderId: number,
    proofHash: string,
    sellerPrivateKey: string
  ): Promise<{ txHash: string }> {
    const provider = this.getProvider();
    const signer = new ethers.Wallet(sellerPrivateKey, provider);
    const hub = this.getHubContract(signer);

    const tx = await hub.recordDelivery(BigInt(onchainCampaignId), BigInt(onchainOrderId), proofHash);
    const receipt = await tx.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Delivery record onchain failed. Status: ${receipt?.status}`);
    }

    return { txHash: receipt.hash };
  }

  /**
   * Confirm receipt onchain (Caller must be buyer principal)
   */
  public static async confirmReceiptOnchain(
    onchainCampaignId: number,
    onchainOrderId: number,
    buyerPrivateKey: string
  ): Promise<{ txHash: string }> {
    const provider = this.getProvider();
    const signer = new ethers.Wallet(buyerPrivateKey, provider);
    const hub = this.getHubContract(signer);

    const tx = await hub.confirmReceipt(BigInt(onchainCampaignId), BigInt(onchainOrderId));
    const receipt = await tx.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Confirm receipt onchain failed. Status: ${receipt?.status}`);
    }

    return { txHash: receipt.hash };
  }

  /**
   * Resolve dispute onchain (Caller must be operator)
   */
  public static async resolveDisputeOnchain(
    onchainCampaignId: number,
    onchainOrderId: number,
    buyerShare: bigint,
    sellerShare: bigint,
    operatorPrivateKey: string
  ): Promise<{ txHash: string }> {
    const provider = this.getProvider();
    const signer = new ethers.Wallet(operatorPrivateKey, provider);
    const hub = this.getHubContract(signer);

    const tx = await hub.resolveDispute(
      BigInt(onchainCampaignId),
      BigInt(onchainOrderId),
      buyerShare,
      sellerShare
    );
    const receipt = await tx.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Resolve dispute onchain failed. Status: ${receipt?.status}`);
    }

    return { txHash: receipt.hash };
  }

  /**
   * Verify an already broadcast transaction hash
   */
  public static async verifyTxReceipt(txHash: string): Promise<ethers.TransactionReceipt> {
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error(`Transaction ${txHash} not yet mined or found on Arc network`);
    }
    if (receipt.status !== 1) {
      throw new Error(`Transaction ${txHash} failed / reverted onchain`);
    }
    return receipt;
  }
}
