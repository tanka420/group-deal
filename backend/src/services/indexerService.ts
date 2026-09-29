import { ethers } from "ethers";
import { config } from "../config";
import { store, OrderRecord, EventJournalRecord } from "../db/store";
import { WebhookService } from "./webhookService";
import { HUB_ABI } from "./onchainService";

export class IndexerService {
  private static provider: ethers.JsonRpcProvider;
  private static hubContract: ethers.Contract;
  private static isRunning = false;
  private static pollTimer: NodeJS.Timeout | null = null;
  private static isSyncing = false;

  public static async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      this.provider = new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
        staticNetwork: true,
      });
      console.log(`[INDEXER] Connected to RPC: ${config.arcRpcUrl} (Chain ID: ${config.arcChainId})`);

      this.hubContract = new ethers.Contract(config.hubAddress, HUB_ABI, this.provider);

      // Perform initial catch-up sync
      await this.syncBlocks();

      // Poll periodically every 5 seconds to catch up missed blocks & handle re-orgs
      this.pollTimer = setInterval(async () => {
        try {
          await this.syncBlocks();
        } catch (e: any) {
          console.warn("[INDEXER] Periodic sync warning:", e.message);
        }
      }, 5000);

      this.isRunning = true;
      console.log("[INDEXER] Event listeners & block poller initialized successfully");
    } catch (err: any) {
      console.warn("[INDEXER] Failed to attach onchain listener, running in offline/sync mode:", err.message);
    }
  }

  public static stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
  }

  /**
   * Scan and sync events across block ranges with cursor & idempotency
   */
  public static async syncBlocks(): Promise<void> {
    if (this.isSyncing || !this.provider || !this.hubContract) return;
    this.isSyncing = true;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      let lastBlock = store.db.syncState?.lastIndexedBlock || 0;

      if (lastBlock === 0) {
        // Start from configured deployment block or 0
        lastBlock = config.deploymentBlock || 0;
      }

      if (currentBlock < lastBlock) {
        // Potential chain reorganization or node reset
        lastBlock = Math.max(0, currentBlock - 50);
      }

      if (currentBlock === lastBlock) {
        this.isSyncing = false;
        return;
      }

      // Query logs in chunks of up to 500 blocks
      const step = 500;
      for (let from = lastBlock + 1; from <= currentBlock; from += step) {
        const to = Math.min(from + step - 1, currentBlock);
        await this.processBlockRange(from, to);
        store.db.syncState.lastIndexedBlock = to;
        store.db.syncState.lastSyncTimestamp = Date.now();
        store.save();
      }
    } catch (err: any) {
      console.warn("[INDEXER] syncBlocks error:", err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  private static async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    const filter = {
      address: config.hubAddress,
      fromBlock,
      toBlock,
    };

    const logs = await this.provider.getLogs(filter);
    const iface = new ethers.Interface(HUB_ABI);

    for (const log of logs) {
      try {
        const parsed = iface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (!parsed) continue;

        const eventKey = `${log.transactionHash}_${log.index}`;
        if (store.db.eventJournal[eventKey]) {
          // Idempotency: skip already processed event
          continue;
        }

        // Process event
        await this.handleEvent(parsed.name, parsed.args, log);

        // Record in journal
        const journalRecord: EventJournalRecord = {
          id: eventKey,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.index,
          eventName: parsed.name,
          payload: parsed.args.toObject ? parsed.args.toObject() : {},
          processedAt: Date.now(),
        };
        store.db.eventJournal[eventKey] = journalRecord;
      } catch (err: any) {
        console.warn(`[INDEXER] Error processing log at block ${log.blockNumber}:`, err.message);
      }
    }
  }

  private static async handleEvent(eventName: string, args: any, log: ethers.Log): Promise<void> {
    const txHash = log.transactionHash;

    switch (eventName) {
      case "CampaignCreated": {
        const campaignId = args.campaignId.toString();
        const sellerPayoutWallet = args.sellerPayoutWallet;
        const termsHash = args.termsHash;

        let campaign = store.db.campaigns[campaignId];
        if (!campaign) {
          // Find matching draft by termsHash
          for (const c of Object.values(store.db.campaigns)) {
            if (c.termsHash === termsHash) {
              campaign = c;
              break;
            }
          }
        }

        if (campaign) {
          campaign.onchainCampaignId = Number(args.campaignId);
          campaign.status = "ACTIVE";
          campaign.startTime = Number(args.startTime);
          campaign.endTime = Number(args.endTime);
          store.save();
        }
        break;
      }

      case "TierUnlocked": {
        const campaignId = args.campaignId.toString();
        const tierIndex = Number(args.tierIndex);
        const threshold = args.threshold.toString();
        const price = args.price.toString();

        const campaign = store.db.campaigns[campaignId];
        if (campaign) {
          campaign.currentUnlockedTier = tierIndex;
          store.save();
          WebhookService.dispatchEvent(campaign.sellerId, "campaign.tier_unlocked", {
            campaignId,
            tierIndex,
            threshold,
            price,
          });
        }
        break;
      }

      case "CommitmentMade": {
        const campaignId = args.campaignId.toString();
        const orderId = args.orderId.toString();
        const campaignIdentity = args.campaignIdentity;
        const buyerPrincipal = ethers.getAddress(args.buyerPrincipal);
        const quantity = Number(args.quantity);
        const lockedUnitPrice = args.lockedUnitPrice.toString();
        const committedGross = args.committedGross.toString();
        const isEarlySupporter = args.isEarlySupporter;
        const earlyRebateValue = args.earlyRebateValue.toString();

        let buyerAccountId = store.db.userByWallet[buyerPrincipal.toLowerCase()] || "unknown_buyer";

        let order = store.db.orders[orderId];
        if (!order) {
          order = {
            id: orderId,
            onchainOrderId: Number(args.orderId),
            campaignId,
            buyerAccountId,
            campaignIdentity,
            buyerPrincipal,
            quantity,
            lockedUnitPrice,
            committedGross,
            isEarlySupporter,
            earlyRebateValue,
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
        }

        const campaign = store.db.campaigns[campaignId];
        if (campaign) {
          campaign.status = "ACTIVE";
          campaign.totalUnitsCommitted += quantity;
          campaign.totalGrossCommitted = (
            BigInt(campaign.totalGrossCommitted || "0") + BigInt(committedGross)
          ).toString();
          campaign.totalBuyerCount += 1;
          WebhookService.dispatchEvent(campaign.sellerId, "order.committed", order);
        }
        store.save();
        break;
      }

      case "CampaignFinalized": {
        const campaignId = args.campaignId.toString();
        const finalClearingPrice = args.finalClearingPrice.toString();

        const campaign = store.db.campaigns[campaignId];
        if (campaign) {
          campaign.status = "FINALIZED";
          campaign.finalClearingPrice = finalClearingPrice;
          campaign.finalizedAt = Math.floor(Date.now() / 1000);

          // Update rebate allocations for all orders in this campaign
          for (const ord of Object.values(store.db.orders)) {
            if (ord.campaignId === campaignId) {
              const locked = BigInt(ord.lockedUnitPrice);
              const finalPrice = BigInt(finalClearingPrice);
              let rebate = 0n;
              if (locked > finalPrice) {
                rebate = (locked - finalPrice) * BigInt(ord.quantity);
              }
              if (ord.isEarlySupporter) {
                rebate += BigInt(ord.earlyRebateValue || "0");
              }
              ord.rebateAllocated = rebate.toString();
            }
          }

          store.save();
          WebhookService.dispatchEvent(campaign.sellerId, "campaign.finalized", {
            campaignId,
            finalClearingPrice,
          });
        }
        break;
      }

      case "DeliveryRecorded": {
        const orderId = args.orderId.toString();
        const proofHash = args.proofHash;
        const deliveryTimestamp = Number(args.deliveryTimestamp);
        const disputeDeadline = Number(args.disputeDeadline);

        const order = store.db.orders[orderId];
        if (order) {
          order.deliveryStatus = "DELIVERED";
          order.deliveryProofHash = proofHash;
          order.deliveryTimestamp = deliveryTimestamp;
          order.disputeDeadline = disputeDeadline;
          order.txHash = txHash;
          store.save();

          const campaign = store.db.campaigns[order.campaignId];
          if (campaign) {
            WebhookService.dispatchEvent(campaign.sellerId, "order.delivered", order);
          }
        }
        break;
      }

      case "DeliveryBreached": {
        const orderId = args.orderId.toString();
        const refundAmount = args.refundAmount.toString();

        const order = store.db.orders[orderId];
        if (order) {
          order.deliveryStatus = "BREACHED_REFUNDED";
          order.buyerRefundAllocated = refundAmount;
          store.save();

          const campaign = store.db.campaigns[order.campaignId];
          if (campaign) {
            WebhookService.dispatchEvent(campaign.sellerId, "order.breached", order);
          }
        }
        break;
      }

      case "OrderConfirmed": {
        const orderId = args.orderId.toString();
        const sellerProceeds = args.sellerProceeds.toString();

        const order = store.db.orders[orderId];
        if (order) {
          order.deliveryStatus = "CONFIRMED";
          order.sellerAllocated = sellerProceeds;
          store.save();

          const campaign = store.db.campaigns[order.campaignId];
          if (campaign) {
            WebhookService.dispatchEvent(campaign.sellerId, "order.confirmed", order);
          }
        }
        break;
      }

      case "OrderDisputed": {
        const orderId = args.orderId.toString();

        const order = store.db.orders[orderId];
        if (order) {
          order.deliveryStatus = "DISPUTED";
          store.save();

          const campaign = store.db.campaigns[order.campaignId];
          if (campaign) {
            WebhookService.dispatchEvent(campaign.sellerId, "order.disputed", order);
          }
        }
        break;
      }

      case "DisputeResolved": {
        const orderId = args.orderId.toString();
        const buyerShare = args.buyerShare.toString();
        const sellerShare = args.sellerShare.toString();

        const order = store.db.orders[orderId];
        if (order) {
          order.deliveryStatus = "RESOLVED";
          order.buyerRefundAllocated = buyerShare;
          order.sellerAllocated = sellerShare;
          store.save();

          const campaign = store.db.campaigns[order.campaignId];
          if (campaign) {
            WebhookService.dispatchEvent(campaign.sellerId, "order.resolved", order);
          }
        }
        break;
      }

      case "FundsClaimed": {
        const campaignId = args.campaignId.toString();
        const recipient = ethers.getAddress(args.recipient).toLowerCase();
        const amount = args.amount.toString();
        const claimType = Number(args.claimType); // 0 = BUYER, 1 = SELLER

        for (const order of Object.values(store.db.orders)) {
          // Strictly restrict to orders belonging to THIS campaign
          if (order.campaignId !== campaignId) continue;

          if (claimType === 0 && order.buyerPrincipal.toLowerCase() === recipient) {
            order.buyerClaimed = true;
          } else if (claimType === 1) {
            const campaign = store.db.campaigns[order.campaignId];
            if (campaign && campaign.sellerPayoutWallet.toLowerCase() === recipient) {
              order.sellerClaimed = true;
            }
          }
        }
        store.save();
        break;
      }

      case "EmergencyCancelled": {
        const campaignId = args.campaignId.toString();
        const campaign = store.db.campaigns[campaignId];
        if (campaign) {
          campaign.status = "CANCELLED";
          for (const order of Object.values(store.db.orders)) {
            if (order.campaignId === campaignId) {
              // Only unallocated committed funds become buyer refund, preserving already-allocated amounts
              const allocated = BigInt(order.rebateAllocated || "0") + BigInt(order.sellerAllocated || "0") + BigInt(order.buyerRefundAllocated || "0");
              const committed = BigInt(order.committedGross);
              if (committed > allocated) {
                const unallocated = committed - allocated;
                order.buyerRefundAllocated = (BigInt(order.buyerRefundAllocated || "0") + unallocated).toString();
              }
              if (order.deliveryStatus !== "CONFIRMED" && order.deliveryStatus !== "RESOLVED") {
                order.deliveryStatus = "BREACHED_REFUNDED";
              }
            }
          }
          store.save();
          WebhookService.dispatchEvent(campaign.sellerId, "campaign.cancelled", { campaignId });
        }
        break;
      }
    }
  }
}
