import { ethers } from "ethers";
import { config } from "../config";
import { store, OrderRecord } from "../db/store";
import { WebhookService } from "./webhookService";

export class IndexerService {
  private static provider: ethers.JsonRpcProvider;
  private static hubContract: ethers.Contract;
  private static isRunning = false;

  public static async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      this.provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
      const network = await this.provider.getNetwork();
      console.log(`[INDEXER] Connected to RPC: ${config.arcRpcUrl} (Chain ID: ${network.chainId})`);

      const hubAbi = [
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
        "event EmergencyCancelled(uint256 indexed campaignId, bytes32 reasonHash, uint256 refundPool)",
      ];

      this.hubContract = new ethers.Contract(config.hubAddress, hubAbi, this.provider);

      // Listen for CommitmentMade
      this.hubContract.on(
        "CommitmentMade",
        async (
          campaignIdBig,
          orderIdBig,
          campaignIdentity,
          buyerPrincipal,
          quantityBig,
          lockedUnitPriceBig,
          committedGrossBig,
          isEarlySupporter,
          earlyRebateValueBig,
          eventPayload
        ) => {
          const campaignId = campaignIdBig.toString();
          const orderId = orderIdBig.toString();
          console.log(`[INDEXER] CommitmentMade event: Campaign ${campaignId}, Order ${orderId}`);

          const campaign = store.db.campaigns[campaignId];
          const txHash = eventPayload?.log?.transactionHash || "0x_onchain_event";

          // Lookup buyer account if mapped
          let buyerAccountId = store.db.userByWallet[buyerPrincipal.toLowerCase()] || "unknown_buyer";

          const order: OrderRecord = {
            id: orderId,
            onchainOrderId: Number(orderIdBig),
            campaignId,
            buyerAccountId,
            campaignIdentity,
            buyerPrincipal: ethers.getAddress(buyerPrincipal),
            quantity: Number(quantityBig),
            lockedUnitPrice: lockedUnitPriceBig.toString(),
            committedGross: committedGrossBig.toString(),
            isEarlySupporter,
            earlyRebateValue: earlyRebateValueBig.toString(),
            rebateAllocated: "0",
            sellerAllocated: "0",
            buyerRefundAllocated: "0",
            deliveryStatus: "PENDING",
            txHash,
            createdAt: Date.now(),
            buyerClaimed: false,
            sellerClaimed: false,
          };

          store.db.orders[orderId] = order;

          if (campaign) {
            campaign.status = "ACTIVE";
            campaign.totalUnitsCommitted += Number(quantityBig);
            campaign.totalGrossCommitted = (
              BigInt(campaign.totalGrossCommitted || "0") + committedGrossBig
            ).toString();
            // Dispatch seller webhook
            WebhookService.dispatchEvent(campaign.sellerId, "order.committed", order);
          }

          store.save();
        }
      );

      // Listen for TierUnlocked
      this.hubContract.on("TierUnlocked", (campaignIdBig, tierIndex, thresholdBig, priceBig) => {
        const campaignId = campaignIdBig.toString();
        const campaign = store.db.campaigns[campaignId];
        if (campaign) {
          campaign.currentUnlockedTier = Number(tierIndex);
          store.save();
          WebhookService.dispatchEvent(campaign.sellerId, "campaign.tier_unlocked", {
            campaignId,
            tierIndex: Number(tierIndex),
            threshold: thresholdBig.toString(),
            price: priceBig.toString(),
          });
        }
      });

      // Listen for CampaignFinalized
      this.hubContract.on("CampaignFinalized", (campaignIdBig, finalClearingPriceBig, finalTierIndex) => {
        const campaignId = campaignIdBig.toString();
        const campaign = store.db.campaigns[campaignId];
        if (campaign) {
          campaign.status = "FINALIZED";
          campaign.finalClearingPrice = finalClearingPriceBig.toString();
          campaign.finalizedAt = Math.floor(Date.now() / 1000);
          store.save();
          WebhookService.dispatchEvent(campaign.sellerId, "campaign.finalized", {
            campaignId,
            finalClearingPrice: finalClearingPriceBig.toString(),
          });
        }
      });

      // Listen for OrderDisputed
      this.hubContract.on("OrderDisputed", (campaignIdBig, orderIdBig, disputedBy, reasonHash) => {
        const orderId = orderIdBig.toString();
        const order = store.db.orders[orderId];
        if (order) {
          order.deliveryStatus = "DISPUTED";
          store.save();
          const campaign = store.db.campaigns[order.campaignId];
          if (campaign) {
            WebhookService.dispatchEvent(campaign.sellerId, "order.disputed", order);
          }
        }
      });

      this.isRunning = true;
      console.log("[INDEXER] Event listeners initialized successfully");
    } catch (err: any) {
      console.warn("[INDEXER] Failed to attach onchain listener, running in offline/sync mode:", err.message);
    }
  }
}
