import { Router } from "express";
import { ethers } from "ethers";
import { store, CampaignRecord } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { DeliveryService } from "../services/deliveryService";
import { computeTermsHash } from "../utils/crypto";

export const campaignRouter = Router();

// GET all public campaigns
campaignRouter.get("/", (req, res) => {
  const campaigns = Object.values(store.db.campaigns).filter(
    (c) => c.visibility === "PUBLIC" && c.status !== "DRAFT"
  );
  res.json({ campaigns });
});

// GET single campaign by ID
campaignRouter.get("/:id", (req, res) => {
  const campaign = store.db.campaigns[req.params.id];
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  // Lookup seller profile & badges
  const seller = store.db.users[campaign.sellerId];
  const sellerInfo = seller?.sellerProfile || {
    displayName: "Seller",
    bio: "",
    payoutWallet: campaign.sellerPayoutWallet,
    verifiedSellerBadge: false,
    verifiedRightsBadge: false,
  };

  res.json({
    campaign,
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

    // Auto-generate campaign ID
    const nextId = (Object.keys(store.db.campaigns).length + 1).toString();
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + durationSeconds;

    const termsHash = computeTermsHash({
      sellerPayoutWallet: user.sellerProfile!.payoutWallet,
      metric,
      tiers: formattedTiers,
      maxPerAccount: maxPerAccount || 5,
      inventoryLimit: inventoryLimit || 0,
      durationSeconds,
      deliverySlaSeconds,
      earlyRebateEnabled: !!earlyRebateEnabled,
      earlySlotsCount: earlySlotsCount || 0,
    });

    const campaign: CampaignRecord = {
      id: nextId,
      onchainCampaignId: Number(nextId),
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
      earlyRebateAmount: earlyRebateAmountUSDC
        ? ethers.parseUnits(earlyRebateAmountUSDC.toString(), 6).toString()
        : "0",
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

// POST publish campaign (Seller)
campaignRouter.post("/:id/publish", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
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

    campaign.status = "PUBLISHED";
    campaign.startTime = Math.floor(Date.now() / 1000);
    campaign.endTime = campaign.startTime + campaign.durationSeconds;

    store.addAuditLog(req.user!.userId, "seller", "CAMPAIGN_PUBLISHED", { campaignId: campaign.id });
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
