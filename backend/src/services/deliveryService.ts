import { ethers } from "ethers";
import { store, OrderRecord } from "../db/store";
import { encryptEntitlement, decryptEntitlement } from "../utils/crypto";
import { OnchainService } from "./onchainService";
import { TransactionVerifier } from "./transactionVerifier";
import { config } from "../config";

export class DeliveryService {
  /**
   * Dry-run delivery test simulator required before publishing a campaign.
   */
  public static testDeliveryFlow(
    method: "LICENSE_KEY" | "FILE_LINK" | "ACCOUNT_INVITE" | "WEBHOOK",
    samplePayload: string
  ): { success: boolean; sampleOutput: string; proofHash: string } {
    if (!samplePayload || samplePayload.trim().length === 0) {
      throw new Error("Sample payload cannot be empty");
    }

    // Encrypt sample payload
    const encrypted = encryptEntitlement(samplePayload);
    // Verify it decrypts back perfectly
    const decrypted = decryptEntitlement(encrypted);
    if (decrypted !== samplePayload) {
      throw new Error("Delivery test failed: Decryption integrity check failed");
    }

    const proofHash = ethers.keccak256(ethers.toUtf8Bytes(samplePayload));

    return {
      success: true,
      sampleOutput: `Verification OK. Encrypted bytes: ${encrypted.substring(0, 32)}...`,
      proofHash,
    };
  }

  /**
   * Seller fulfills an order with encrypted digital entitlements and records delivery onchain.
   * The secret is encrypted offchain and NEVER touches the blockchain or logs!
   */
  public static async fulfillOrder(
    sellerId: string,
    orderId: string,
    secretContent: string,
    txHash?: string
  ): Promise<{ order: OrderRecord; proofHash: string; txHash?: string }> {
    const order = store.db.orders[orderId];
    if (!order) throw new Error("Order not found");

    const campaign = store.db.campaigns[order.campaignId];
    if (!campaign) throw new Error("Campaign not found");

    if (campaign.sellerId !== sellerId) {
      throw new Error("Unauthorized: you are not the seller of this campaign");
    }

    if (order.deliveryStatus !== "PENDING") {
      throw new Error(`Order is not pending delivery (current status: ${order.deliveryStatus})`);
    }

    // Check delivery SLA
    if (campaign.finalizedAt) {
      const slaDeadline = campaign.finalizedAt + campaign.deliverySlaSeconds;
      if (Math.floor(Date.now() / 1000) > slaDeadline) {
        throw new Error("Delivery SLA has expired! Order is subject to breach refund.");
      }
    }

    // Encrypt entitlement
    const encrypted = encryptEntitlement(secretContent);
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes(secretContent));
    const now = Math.floor(Date.now() / 1000);

    if (!txHash) {
      throw new Error("Cannot fulfill order: valid onchain transaction hash from seller's wallet is required.");
    }

    // Verify expected onchain transaction (G1.5 requirement)
    const verification = await TransactionVerifier.verifyExpectedTransaction(
      {
        intentId: `delivery_${order.id}_${proofHash}`,
        expectedTo: config.hubAddress,
        expectedFunction: "recordDelivery",
        expectedEvent: "DeliveryRecorded",
        expectedEventArgs: {
          campaignId: campaign.onchainCampaignId,
          orderId: order.onchainOrderId,
          proofHash: proofHash,
        },
      },
      txHash
    );

    const recordedTxHash = verification.txHash;

    order.deliveredEntitlementEncrypted = encrypted;
    order.deliveryProofHash = proofHash;
    order.deliveryTimestamp = now;
    order.disputeDeadline = now + 48 * 3600; // 48-hour dispute window
    order.deliveryStatus = "DELIVERED";
    if (recordedTxHash) {
      order.txHash = recordedTxHash;
    }

    store.addAuditLog(sellerId, "seller", "ORDER_FULFILLED", {
      orderId,
      campaignId: order.campaignId,
      proofHash,
      disputeDeadline: order.disputeDeadline,
      txHash: recordedTxHash,
    });
    store.save();

    return { order, proofHash, txHash: recordedTxHash };
  }

  /**
   * Buyer retrieves and decrypts their digital product entitlement.
   */
  public static accessEntitlement(userId: string, orderId: string): string {
    const order = store.db.orders[orderId];
    if (!order) throw new Error("Order not found");

    if (order.buyerAccountId !== userId) {
      throw new Error("Unauthorized: you are not the buyer of this order");
    }

    if (!order.deliveredEntitlementEncrypted) {
      throw new Error("Product has not been delivered yet by seller");
    }

    return decryptEntitlement(order.deliveredEntitlementEncrypted);
  }

  /**
   * Buyer confirms receipt of the product with verified onchain transaction (G1.6 requirement).
   */
  public static async confirmReceipt(
    userId: string,
    orderId: string,
    txHash: string
  ): Promise<{ success: boolean; status: string; txHash: string; blockNumber: number }> {
    const order = store.db.orders[orderId];
    if (!order) throw new Error("Order not found");

    if (order.buyerAccountId !== userId) {
      throw new Error("Unauthorized: only the buyer can confirm receipt");
    }

    if (order.deliveryStatus !== "DELIVERED") {
      throw new Error("Order must be in DELIVERED status to confirm receipt");
    }

    if (!txHash) {
      throw new Error("Missing required onchain transaction hash for confirmReceipt");
    }

    const campaign = store.db.campaigns[order.campaignId];
    if (!campaign || !campaign.onchainCampaignId) {
      throw new Error("Associated campaign is not active onchain");
    }

    // Verify expected onchain transaction (G1.5 & G1.6)
    const verification = await TransactionVerifier.verifyExpectedTransaction(
      {
        intentId: `confirm_${order.id}`,
        expectedTo: config.hubAddress,
        expectedFunction: "confirmReceipt",
        expectedEvent: "OrderConfirmed",
        expectedEventArgs: {
          campaignId: campaign.onchainCampaignId,
          orderId: order.onchainOrderId,
        },
      },
      txHash
    );

    // Update state to CONFIRMED based on verified onchain event
    order.deliveryStatus = "CONFIRMED";
    order.txHash = verification.txHash;
    const remaining = BigInt(order.committedGross) - BigInt(order.rebateAllocated);
    order.sellerAllocated = remaining.toString();

    store.addAuditLog(userId, "buyer", "ORDER_CONFIRMED", {
      orderId,
      txHash: verification.txHash,
      blockNumber: verification.blockNumber,
      sellerAllocated: remaining.toString(),
    });
    store.save();

    return {
      success: true,
      status: "CONFIRMED",
      txHash: verification.txHash,
      blockNumber: verification.blockNumber,
    };
  }
}
