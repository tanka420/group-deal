import { Router } from "express";
import { ethers } from "ethers";
import * as crypto from "crypto";
import { store, CampaignRecord } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { DeliveryService } from "../services/deliveryService";
import { computeTermsHash, decryptEntitlement } from "../utils/crypto";
import { TransactionVerifier } from "../services/transactionVerifier";
import { config } from "../config";

export const campaignRouter = Router();

// GET all public campaigns
campaignRouter.get("/", (req, res) => {
  const campaigns = Object.values(store.db.campaigns)
    .filter((c) => c.visibility === "PUBLIC" && c.status !== "DRAFT")
    .map(({ deliveryContentTemplate, ...rest }) => rest);
  res.json({ campaigns });
});

// GET single campaign by ID
campaignRouter.get("/:id", (req, res) => {
  const campaign = store.db.campaigns[req.params.id];
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Drafts are only exposed through authenticated seller-specific endpoints.
  if (campaign.status === "DRAFT") {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Lookup seller profile & badges (never expose raw payoutProofSignature)
  const seller = store.db.users[campaign.sellerId];
  const sellerInfo = {
    displayName: seller?.sellerProfile?.displayName || "Seller",
    bio: seller?.sellerProfile?.bio || "",
    payoutWallet: campaign.sellerPayoutWallet,
    verifiedSellerBadge: !!seller?.sellerProfile?.verifiedSellerBadge,
    verifiedRightsBadge: !!seller?.sellerProfile?.verifiedRightsBadge,
  };

  // Do not leak secret fulfillment template to public callers
  const { deliveryContentTemplate, ...safeCampaign } = campaign;

  res.json({
    campaign: safeCampaign,
    seller: sellerInfo,
  });
});

// POST create campaign draft (Seller only)
campaignRouter.post("/draft", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const user = store.db.users[req.user!.userId];
    const {
      title,
      description,
      category,
      thumbnailUrl,
      metric,
      tiers,
      maxPerAccount,
      inventoryLimit,
      durationDays,
      deliverySlaHours,
      earlyRebateEnabled,
      earlySlotsCount,
      earlyRebateAmountUSDC,
      visibility,
      deliveryMethod,
      deliveryContentTemplate,
    } = req.body;

    if (!title || !description || !tiers || tiers.length < 2 || tiers.length > 5) {
      res.status(400).json({ error: "Title, description, and 2-5 tiers are required" });
      return;
    }

    if (deliverySlaHours !== 24 && deliverySlaHours !== 48) {
      res.status(400).json({ error: "Delivery SLA must be 24 or 48 hours" });
      return;
    }

    const durationSeconds = Math.max(86400, Math.min(2592000, (durationDays || 7) * 86400));
    const deliverySlaSeconds = deliverySlaHours * 3600;

    // Convert tiers to base units (6 decimals)
    const formattedTiers = tiers.map((t: any) => ({
      threshold: Number(t.threshold),
      price: ethers.parseUnits(t.priceUSDC.toString(), 6).toString(),
    }));
    const earlyRebateAmount = earlyRebateAmountUSDC
      ? ethers.parseUnits(earlyRebateAmountUSDC.toString(), 6).toString()
      : "0";

    // A draft has no Arc campaign ID. It is re-keyed only from the verified
    // CampaignCreated event during publish/indexing.
    const nextId = `draft_${crypto.randomUUID()}`;
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + durationSeconds;

    const termsHash = computeTermsHash({
      schema: "GroupDealTermsV1",
      sellerPayoutWallet: user.sellerProfile!.payoutWallet,
      metric: metric === "UNITS_COUNT" ? "UNITS_COUNT" : "BUYER_COUNT",
      tiers: formattedTiers,
      maxPerAccount: maxPerAccount || 5,
      inventoryLimit: inventoryLimit || 0,
      inventoryBehavior: inventoryLimit > 0 ? "AUTO_FINALIZE_WHEN_SOLD_OUT" : "UNBOUNDED",
      durationSeconds,
      deliverySlaSeconds,
      earlyRebateEnabled: !!earlyRebateEnabled,
      earlySlotsCount: earlySlotsCount || 0,
      earlyRebateAmount,
      earlyRebateBps: 0,
      platformFeeBps: 0,
      deliveryMethod: deliveryMethod || "LICENSE_KEY",
      cancellationPolicy: "SECURITY_MULTISIG_REFUNDS_ONLY_UNALLOCATED_ESCROW",
    });

    const campaign: CampaignRecord = {
      id: nextId,
      title,
      description,
      category: category || "Software",
      thumbnailUrl: thumbnailUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
      sellerId: user.id,
      sellerPayoutWallet: user.sellerProfile!.payoutWallet,
      status: "DRAFT",
      visibility: visibility === "UNLISTED" ? "UNLISTED" : "PUBLIC",
      metric: metric === "UNITS_COUNT" ? "UNITS_COUNT" : "BUYER_COUNT",
      tiers: formattedTiers,
      currentUnlockedTier: 0,
      maxPerAccount: maxPerAccount || 5,
      inventoryLimit: inventoryLimit || 0,
      durationSeconds,
      deliverySlaSeconds,
      earlyRebateEnabled: !!earlyRebateEnabled,
      earlySlotsCount: earlySlotsCount || 0,
      earlyRebateAmount,
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash,
      startTime,
      endTime,
      totalBuyerCount: 0,
      totalUnitsCommitted: 0,
      totalGrossCommitted: "0",
      deliveryMethod: deliveryMethod || "LICENSE_KEY",
      deliveryContentTemplate: deliveryContentTemplate || "",
      dryRunDeliveryVerified: false,
      amendments: [],
    };

    store.db.campaigns[nextId] = campaign;
    store.addAuditLog(user.id, "seller", "CAMPAIGN_DRAFT_CREATED", { campaignId: nextId, title });
    store.save();

    res.json({ success: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST standalone delivery test simulator for seller form (F21)
campaignRouter.post("/test-delivery", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const { deliveryMethod, samplePayload } = req.body;
    if (!samplePayload || samplePayload.trim().length === 0) {
      res.status(400).json({ error: "Nội dung mẫu giao hàng không được để trống" });
      return;
    }
    const testResult = DeliveryService.testDeliveryFlow(
      deliveryMethod || "LICENSE_KEY",
      samplePayload
    );
    res.json({ success: true, result: testResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST dry-run delivery test simulator (Seller required before publishing)
campaignRouter.post("/:id/test-delivery", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const campaign = store.db.campaigns[req.params.id];
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (campaign.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const { samplePayload } = req.body;
    const testResult = DeliveryService.testDeliveryFlow(
      campaign.deliveryMethod,
      samplePayload || "TEST_LICENSE_KEY_ABC123_XYZ"
    );

    campaign.dryRunDeliveryVerified = true;
    store.addAuditLog(req.user!.userId, "seller", "DELIVERY_DRY_RUN_PASSED", {
      campaignId: campaign.id,
      proofHash: testResult.proofHash,
    });
    store.save();

    res.json({ success: true, result: testResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update campaign (Only allowed when in DRAFT status)
campaignRouter.put("/:id", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const campaign = store.db.campaigns[req.params.id];
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (campaign.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    if (campaign.status !== "DRAFT") {
      res.status(400).json({
        error: "Cannot modify immutable campaign terms once active or finalized!",
      });
      return;
    }

    const { title, description, category, thumbnailUrl, visibility } = req.body;
    if (title) campaign.title = title;
    if (description) campaign.description = description;
    if (category) campaign.category = category;
    if (thumbnailUrl) campaign.thumbnailUrl = thumbnailUrl;
    if (visibility) campaign.visibility = visibility;

    store.save();
    res.json({ success: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST publish campaign onchain (Seller)
campaignRouter.post("/:id/publish", authMiddleware, requireRole("seller"), async (req: AuthenticatedRequest, res) => {
  try {
    const campaign = store.db.campaigns[req.params.id];
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (campaign.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    if (!campaign.dryRunDeliveryVerified) {
      res.status(400).json({
        error: "Delivery dry-run test must be successfully executed before publishing!",
      });
      return;
    }

    if (campaign.status === "ACTIVE" || campaign.status === "FINALIZED") {
      res.status(400).json({ error: "Campaign is already active or finalized" });
      return;
    }

    const { txHash } = req.body;
    if (typeof txHash !== "string") {
      res.status(400).json({
        error: "Seller must create the campaign from a user-controlled wallet and provide its Arc txHash",
      });
      return;
    }

    const campaignInterface = new ethers.Interface([
      "function createCampaign((address sellerPayoutWallet, uint8 metric, uint256 maxPerAccount, uint256 inventoryLimit, uint256 durationSeconds, uint256 deliverySlaSeconds, bool earlyRebateEnabled, uint32 earlySlotsCount, uint256 earlyRebateAmount, uint16 earlyRebateBps, uint16 platformFeeBps, bytes32 termsHash) terms, (uint256 threshold, uint256 price)[] tiers) returns (uint256)",
    ]);
    const expectedCalldata = campaignInterface.encodeFunctionData("createCampaign", [
      {
        sellerPayoutWallet: campaign.sellerPayoutWallet,
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
      },
      campaign.tiers.map((tier) => ({
        threshold: BigInt(tier.threshold),
        price: BigInt(tier.price),
      })),
    ]);

    let verification;
    try {
      verification = await TransactionVerifier.verifyExpectedTransaction(
        {
          intentId: `campaign_publish_${campaign.id}`,
          expectedTo: config.hubAddress,
          expectedSender: campaign.sellerPayoutWallet,
          expectedFunction: "createCampaign",
          expectedCalldata,
          expectedEvent: "CampaignCreated",
          expectedEventArgs: {
            sellerPayoutWallet: campaign.sellerPayoutWallet,
            termsHash: campaign.termsHash,
          },
        },
        txHash
      );
    } catch (verifErr: any) {
      res.status(400).json({ error: `Onchain transaction verification failed: ${verifErr.message}` });
      return;
    }

    const onchainCampaignId = Number(verification.parsedEvent.campaignId);
    const publishTxHash = verification.txHash;

    if (!onchainCampaignId) {
      res.status(400).json({ error: "Missing verified onchainCampaignId" });
      return;
    }

    const previousDraftId = campaign.id;
    campaign.onchainCampaignId = onchainCampaignId;
    campaign.id = onchainCampaignId.toString();
    if (previousDraftId !== campaign.id) {
      delete store.db.campaigns[previousDraftId];
      store.db.campaigns[campaign.id] = campaign;
    }
    campaign.status = "ACTIVE";
    campaign.startTime = Math.floor(Date.now() / 1000);
    campaign.endTime = campaign.startTime + campaign.durationSeconds;
    if (publishTxHash) {
      campaign.txHash = publishTxHash;
    }

    store.addAuditLog(req.user!.userId, "seller", "CAMPAIGN_PUBLISHED", {
      campaignId: campaign.id,
      onchainCampaignId,
      txHash: publishTxHash,
    });
    store.save();

    res.json({ success: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST non-material amendment (terms immutable, history logged)
campaignRouter.post("/:id/amend", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const campaign = store.db.campaigns[req.params.id];
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (campaign.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const { note } = req.body;
    if (!note) {
      res.status(400).json({ error: "Amendment note is required" });
      return;
    }

    const amendment = {
      id: `amd_${Date.now()}`,
      timestamp: Date.now(),
      note,
      hash: ethers.keccak256(ethers.toUtf8Bytes(note)),
    };

    campaign.amendments.push(amendment);
    store.addAuditLog(req.user!.userId, "seller", "CAMPAIGN_AMENDMENT_LOGGED", {
      campaignId: campaign.id,
      amendment,
    });
    store.save();

    res.json({ success: true, amendment, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
