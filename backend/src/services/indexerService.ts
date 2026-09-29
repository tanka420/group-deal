import { ethers } from "ethers";
import { config } from "../config";
import { store, OrderRecord, EventJournalRecord, CampaignRecord } from "../db/store";
import { WebhookService } from "./webhookService";
import { HUB_ABI } from "./onchainService";

export class IndexerService {
  private static provider: ethers.JsonRpcProvider | null = null;
  private static wsProvider: ethers.WebSocketProvider | null = null;
  private static hubContract: ethers.Contract | null = null;
  private static isRunning = false;
  private static pollTimer: NodeJS.Timeout | null = null;
  private static isSyncing = false;

  public static setProvider(provider: any): void {
    this.provider = provider;
    if (provider) {
      this.hubContract = new ethers.Contract(config.hubAddress, HUB_ABI, provider);
    }
  }

  public static getProvider(): ethers.JsonRpcProvider | null {
    return this.provider;
  }

  public static async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      this.provider = new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
        staticNetwork: true,
      });
      console.log(`[INDEXER] Connected to RPC: ${config.arcRpcUrl} (Chain ID: ${config.arcChainId})`);

      this.hubContract = new ethers.Contract(config.hubAddress, HUB_ABI, this.provider);

      // Attempt WebSocket real-time subscription for immediate deterministic block notifications
      if (config.arcWsUrl) {
        try {
          this.wsProvider = new ethers.WebSocketProvider(config.arcWsUrl, config.arcChainId, {
            staticNetwork: true,
          });
          this.wsProvider.on("block", async (blockNumber: number) => {
            try {
              await this.syncBlocks();
            } catch (err: any) {
              console.warn(`[INDEXER WS] Error syncing on block ${blockNumber}:`, err.message);
            }
          });
          console.log(`[INDEXER WS] Subscribed to real-time blocks on ${config.arcWsUrl}`);
        } catch (wsErr: any) {
          console.warn(`[INDEXER WS] WebSocket unavailable, falling back to HTTP poller:`, wsErr.message);
          this.wsProvider = null;
        }
      }

      // Initial catch-up sync
      await this.syncBlocks();

      // Poll periodically every 5 seconds to catch up any missed blocks / gaps
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
    if (this.wsProvider) {
      try {
        this.wsProvider.destroy();
      } catch {}
      this.wsProvider = null;
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
        lastBlock = config.deploymentBlock || 0;
      }

      if (currentBlock < lastBlock) {
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

  /**
   * Process a list of logs with strict sorting by (blockNumber, transactionIndex, logIndex)
   * and unique idempotency keys: `${chainId}_${emitter}_${txHash}_${logIndex}`
   */
  public static async processLogs(logs: any[]): Promise<void> {
    const iface = new ethers.Interface(HUB_ABI);

    // Strictly sort by blockNumber, transactionIndex, logIndex (ascending)
    const sortedLogs = [...logs].sort((a, b) => {
      const bDiff = (a.blockNumber ?? 0) - (b.blockNumber ?? 0);
      if (bDiff !== 0) return bDiff;
      const tDiff = (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0);
      if (tDiff !== 0) return tDiff;
      return (a.index ?? a.logIndex ?? 0) - (b.index ?? b.logIndex ?? 0);
    });

    for (const log of sortedLogs) {
      try {
        const parsed = iface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (!parsed) continue;

        const logIdx = log.index ?? log.logIndex ?? 0;
        const emitter = (log.address || config.hubAddress).toLowerCase();
        const txHash = (log.transactionHash || "").toLowerCase();
        const eventKey = `${config.arcChainId}_${emitter}_${txHash}_${logIdx}`;

        if (store.db.eventJournal[eventKey]) {
          // Idempotency: skip already processed event
          continue;
        }

        // Process event state projection
        await this.handleEvent(parsed.name, parsed.args, log, iface);

        // Record in journal
        const journalRecord: EventJournalRecord = {
          id: eventKey,
          chainId: config.arcChainId,
          contractAddress: ethers.getAddress(log.address || config.hubAddress),
          blockNumber: log.blockNumber ?? 0,
          blockHash: log.blockHash ?? "",
          transactionIndex: log.transactionIndex ?? 0,
          txHash: log.transactionHash,
          logIndex: logIdx,
          eventName: parsed.name,
          payload: parsed.args.toObject ? parsed.args.toObject() : {},
          processedAt: Date.now(),
        };
        store.db.eventJournal[eventKey] = journalRecord;
        store.save();
      } catch (err: any) {
        console.warn(`[INDEXER] Error processing log at block ${log.blockNumber}:`, err.message);
      }
    }
  }

  private static async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    if (!this.provider) return;
    const filter = {
      address: config.hubAddress,
      fromBlock,
      toBlock,
    };

    const logs = await this.provider.getLogs(filter);
    await this.processLogs(logs);
  }

  /**
   * Deterministically rebuild projections from clean state
   */
  public static async rebuildFromClean(fromBlock?: number, toBlock?: number): Promise<void> {
    // Reset onchain projections and event journal
    store.db.eventJournal = {};
    store.db.syncState = {
      lastIndexedBlock: 0,
      lastSyncTimestamp: 0,
    };

    // Reset campaign onchain counters while preserving seller drafts
    for (const campaign of Object.values(store.db.campaigns)) {
      campaign.totalBuyerCount = 0;
      campaign.totalUnitsCommitted = 0;
      campaign.totalGrossCommitted = "0";
      campaign.currentUnlockedTier = 0;
      if (campaign.status === "ACTIVE" || campaign.status === "FINALIZED" || campaign.status === "CANCELLED") {
        campaign.status = "DRAFT";
      }
    }

    // Reset order onchain projections
    for (const order of Object.values(store.db.orders)) {
      order.rebateAllocated = "0";
      order.sellerAllocated = "0";
      order.buyerRefundAllocated = "0";
      order.buyerClaimed = false;
      order.sellerClaimed = false;
      order.deliveryStatus = "PENDING";
    }

    store.save();

    // Replay blocks
    if (this.provider) {
      const start = fromBlock !== undefined ? fromBlock : (config.deploymentBlock || 0);
      const end = toBlock !== undefined ? toBlock : await this.provider.getBlockNumber();
      const step = 500;
      for (let from = start; from <= end; from += step) {
        const to = Math.min(from + step - 1, end);
        await this.processBlockRange(from, to);
        store.db.syncState.lastIndexedBlock = to;
        store.db.syncState.lastSyncTimestamp = Date.now();
        store.save();
      }
    }
  }

  private static async handleEvent(
    eventName: string,
    args: any,
    log: any,
    iface: ethers.Interface
  ): Promise<void> {
    const txHash = log.transactionHash;

    switch (eventName) {
      case "CampaignCreated": {
        const campaignId = args.campaignId.toString();
        const sellerPayoutWallet = args.sellerPayoutWallet;
        const termsHash = args.termsHash;

        let campaign = store.db.campaigns[campaignId];
        if (!campaign) {
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
        } else {
          // Synthesize campaign from onchain event if created outside local drafts
          const synthesized: CampaignRecord = {
            id: campaignId,
            onchainCampaignId: Number(args.campaignId),
            title: `Onchain Campaign #${campaignId}`,
            description: "Synchronized directly from Arc Testnet contract event",
            category: "General",
            thumbnailUrl: "",
            sellerId: `seller_${sellerPayoutWallet.toLowerCase().substring(0, 8)}`,
            sellerPayoutWallet: ethers.getAddress(sellerPayoutWallet),
            status: "ACTIVE",
            visibility: "PUBLIC",
            metric: "BUYER_COUNT",
            tiers: [],
            currentUnlockedTier: 0,
            maxPerAccount: 0,
            inventoryLimit: 0,
            durationSeconds: Math.max(0, Number(args.endTime) - Number(args.startTime)),
            deliverySlaSeconds: 86400,
            earlyRebateEnabled: false,
            earlySlotsCount: 0,
            earlyRebateAmount: "0",
            earlyRebateBps: 0,
            platformFeeBps: 0,
            termsHash: termsHash,
            startTime: Number(args.startTime),
            endTime: Number(args.endTime),
            totalBuyerCount: 0,
            totalUnitsCommitted: 0,
            totalGrossCommitted: "0",
            deliveryMethod: "LICENSE_KEY",
            deliveryContentTemplate: "",
            dryRunDeliveryVerified: true,
            amendments: [],
          };
          store.db.campaigns[campaignId] = synthesized;
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

          // Update rebate allocations for all orders in this campaign lazily
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
        const claimType = Number(args.claimType); // 0 = BUYER, 1 = SELLER

        let claimedOrderIds: string[] = [];
        try {
          if (this.provider) {
            const tx = await this.provider.getTransaction(log.transactionHash);
            if (tx && tx.data) {
              const parsedTx = iface.parseTransaction({ data: tx.data, value: tx.value });
              if (parsedTx && (parsedTx.name === "claimBuyerFunds" || parsedTx.name === "claimSellerProceeds")) {
                claimedOrderIds = parsedTx.args[1].map((id: any) => id.toString());
              }
            }
          }
        } catch {
          // Transaction calldata decode fallback
        }

        if (claimedOrderIds.length > 0) {
          for (const oid of claimedOrderIds) {
            const ord = store.db.orders[oid];
            if (ord && ord.campaignId === campaignId) {
              if (claimType === 0) ord.buyerClaimed = true;
              if (claimType === 1) ord.sellerClaimed = true;
            }
          }
        } else {
          // Fallback: match by campaign, recipient and claimType
          for (const order of Object.values(store.db.orders)) {
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
              const allocated =
                BigInt(order.rebateAllocated || "0") +
                BigInt(order.sellerAllocated || "0") +
                BigInt(order.buyerRefundAllocated || "0");
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
