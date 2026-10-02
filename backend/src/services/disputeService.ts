import { store, OrderRecord, SupportMessageRecord } from "../db/store";
import { TransactionVerifier } from "./transactionVerifier";
import { config } from "../config";
import * as crypto from "crypto";
import { NotificationService } from "./notificationService";

export class DisputeService {
  /**
   * Buyer opens a dispute within 48h of delivery with verified onchain transaction.
   */
  public static async openDispute(
    userId: string,
    orderId: string,
    reason: string,
    evidenceUrls: string[],
    txHash: string
  ): Promise<{ order: OrderRecord; txHash: string; blockNumber: number }> {
    const order = store.db.orders[orderId];
    if (!order) throw new Error("Order not found");

    if (order.buyerAccountId !== userId) {
      throw new Error("Only the buyer can open a dispute");
    }

    if (order.deliveryStatus !== "DELIVERED") {
      throw new Error("Order must be in DELIVERED status to open dispute");
    }

    if (order.disputeDeadline && Math.floor(Date.now() / 1000) > order.disputeDeadline) {
      throw new Error("48-hour dispute window has expired");
    }

    if (!txHash) {
      throw new Error("Missing required onchain transaction hash for openDispute");
    }

    const campaign = store.db.campaigns[order.campaignId];
    if (!campaign || !campaign.onchainCampaignId) {
      throw new Error("Campaign has not been published onchain");
    }

    // Verify expected onchain transaction (G1.5 & G1.6)
    const verification = await TransactionVerifier.verifyExpectedTransaction(
      {
        intentId: `dispute_${order.id}_${txHash}`,
        expectedTo: config.hubAddress,
        expectedSender: order.buyerPrincipal,
        expectedFunction: "openDispute",
        expectedEvent: "OrderDisputed",
        expectedEventArgs: {
          campaignId: campaign.onchainCampaignId,
          orderId: order.onchainOrderId,
        },
      },
      txHash
    );

    order.deliveryStatus = "DISPUTED";
    order.disputeReason = reason;
    order.disputeEvidence = evidenceUrls || [];
    order.txHash = verification.txHash;

    // Add initial support message
    DisputeService.addMessage(orderId, "buyer", order.buyerPrincipal, `Dispute opened: ${reason}`);

    store.addAuditLog(userId, "buyer", "DISPUTE_OPENED", {
      orderId,
      reason,
      txHash: verification.txHash,
      blockNumber: verification.blockNumber,
    });
    store.save();

    return { order, txHash: verification.txHash, blockNumber: verification.blockNumber };
  }

  /**
   * Operator resolves a dispute by splitting the exact remaining delivery gross.
   * Strictly verified against onchain DisputeResolved event.
   * Conservation strictly enforced: buyerShare + sellerShare == remainingDeliveryGross.
   */
  public static async resolveDispute(
    operatorId: string,
    orderId: string,
    buyerShareBaseUSDC: string,
    sellerShareBaseUSDC: string,
    notes: string,
    txHash: string
  ): Promise<{ order: OrderRecord; txHash: string; blockNumber: number }> {
    const order = store.db.orders[orderId];
    if (!order) throw new Error("Order not found");

    if (order.deliveryStatus !== "DISPUTED") {
      throw new Error("Order must be in DISPUTED status to resolve");
    }

    if (!txHash) {
      throw new Error("Missing required onchain transaction hash for resolveDispute");
    }

    const campaign = store.db.campaigns[order.campaignId];
    if (!campaign || !campaign.onchainCampaignId) {
      throw new Error("Campaign has not been published onchain");
    }

    const remainingGross = BigInt(order.committedGross) - BigInt(order.rebateAllocated);
    const buyerShare = BigInt(buyerShareBaseUSDC);
    const sellerShare = BigInt(sellerShareBaseUSDC);

    if (buyerShare < 0n || sellerShare < 0n) {
      throw new Error("Phần phân bổ cho buyer và seller phải là số không âm");
    }

    if (buyerShare + sellerShare !== remainingGross) {
      throw new Error(
        `Conservation Law violated: buyerShare (${buyerShare}) + sellerShare (${sellerShare}) !== remainingGross (${remainingGross})`
      );
    }

    // Verify expected onchain transaction (G1.5 & G1.6)
    const verification = await TransactionVerifier.verifyExpectedTransaction(
      {
        intentId: `resolve_${order.id}_${txHash}`,
        expectedTo: config.hubAddress,
        expectedSender: config.operatorAddress,
        expectedFunction: "resolveDispute",
        expectedEvent: "DisputeResolved",
        expectedEventArgs: {
          campaignId: campaign.onchainCampaignId,
          orderId: order.onchainOrderId,
          buyerShare: buyerShareBaseUSDC,
          sellerShare: sellerShareBaseUSDC,
        },
      },
      txHash
    );

    order.buyerRefundAllocated = buyerShare.toString();
    order.sellerAllocated = sellerShare.toString();
    order.deliveryStatus = "RESOLVED";
    order.txHash = verification.txHash;

    DisputeService.addMessage(
      orderId,
      "operator",
      operatorId,
      `Dispute resolved by operator. Buyer refund: ${buyerShareBaseUSDC} USDC, Seller proceeds: ${sellerShareBaseUSDC} USDC. Note: ${notes}`
    );

    store.addAuditLog(operatorId, "operator", "DISPUTE_RESOLVED", {
      orderId,
      buyerShare: buyerShareBaseUSDC,
      sellerShare: sellerShareBaseUSDC,
      notes,
      txHash: verification.txHash,
      blockNumber: verification.blockNumber,
    });
    store.save();

    return { order, txHash: verification.txHash, blockNumber: verification.blockNumber };
  }

  /**
   * Send a support message in an order thread.
   */
  public static addMessage(
    orderId: string,
    senderRole: "buyer" | "seller" | "operator",
    senderWallet: string,
    text: string
  ): SupportMessageRecord {
    if (!store.db.supportMessages[orderId]) {
      store.db.supportMessages[orderId] = [];
    }

    const msg: SupportMessageRecord = {
      id: `msg_${crypto.randomUUID()}`,
      orderId,
      senderRole,
      senderWallet,
      text,
      timestamp: Date.now(),
    };

    store.db.supportMessages[orderId].push(msg);
    store.save();

    const order = store.db.orders[orderId];
    const campaign = order && store.db.campaigns[order.campaignId];
    if (order && senderRole !== "buyer") {
      NotificationService.create(order.buyerAccountId, {
        type: "SUPPORT_MESSAGE",
        title: "Có tin nhắn mới về order",
        message: `Order #${orderId} có phản hồi mới từ ${senderRole}.`,
        link: "#orders",
        dedupeKey: msg.id,
      });
    }
    if (campaign && senderRole !== "seller") {
      NotificationService.create(campaign.sellerId, {
        type: "SUPPORT_MESSAGE",
        title: "Có tin nhắn mới về order",
        message: `Order #${orderId} có phản hồi mới từ ${senderRole}.`,
        link: "#seller",
        dedupeKey: msg.id,
      });
    }

    return msg;
  }

  public static getMessages(orderId: string): SupportMessageRecord[] {
    return store.db.supportMessages[orderId] || [];
  }

  /**
   * Buyer leaves review for a delivered/confirmed order (1 review per order).
   */
  public static addReview(
    userId: string,
    orderId: string,
    score: number,
    comment: string
  ): OrderRecord {
    const order = store.db.orders[orderId];
    if (!order) throw new Error("Order not found");

    if (order.buyerAccountId !== userId) {
      throw new Error("Only the buyer can leave a review");
    }

    if (
      order.deliveryStatus !== "DELIVERED" &&
      order.deliveryStatus !== "CONFIRMED" &&
      order.deliveryStatus !== "RESOLVED"
    ) {
      throw new Error("Chỉ có thể đánh giá những đơn hàng đã được giao sản phẩm.");
    }

    if (order.review) {
      throw new Error("A review has already been submitted for this order");
    }

    order.review = {
      score: Math.min(5, Math.max(1, score)),
      comment,
      createdAt: Date.now(),
    };

    store.addAuditLog(userId, "buyer", "REVIEW_SUBMITTED", { orderId, score, comment });
    store.save();

    return order;
  }

  /**
   * Seller responds to a buyer's review.
   */
  public static replyToReview(
    sellerId: string,
    orderId: string,
    sellerResponse: string
  ): OrderRecord {
    const order = store.db.orders[orderId];
    if (!order) throw new Error("Order not found");

    const campaign = store.db.campaigns[order.campaignId];
    if (!campaign || campaign.sellerId !== sellerId) {
      throw new Error("Unauthorized");
    }

    if (!order.review) {
      throw new Error("No review found on this order to reply to");
    }

    order.review.sellerResponse = sellerResponse;
    store.addAuditLog(sellerId, "seller", "REVIEW_REPLIED", { orderId, sellerResponse });
    store.save();

    return order;
  }
}
