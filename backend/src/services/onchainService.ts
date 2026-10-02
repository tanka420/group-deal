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
