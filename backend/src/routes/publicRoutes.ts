import { Router } from "express";
import { store } from "../db/store";

export const publicRouter = Router();

// GET /api/v1/campaigns (Public Read API)
publicRouter.get("/campaigns", (req, res) => {
  const campaigns = Object.values(store.db.campaigns)
    .filter((c) => c.status !== "DRAFT" && c.visibility === "PUBLIC")
    .map((c) => {
      const seller = store.db.users[c.sellerId]?.sellerProfile;
      return {
        id: c.id,
        onchainCampaignId: c.onchainCampaignId,
        title: c.title,
        description: c.description,
        category: c.category,
        thumbnailUrl: c.thumbnailUrl,
        metric: c.metric,
        currentUnlockedTier: c.currentUnlockedTier,
        tiers: c.tiers,
        totalBuyerCount: c.totalBuyerCount,
        totalUnitsCommitted: c.totalUnitsCommitted,
        status: c.status,
        startTime: c.startTime,
        endTime: c.endTime,
        deliverySlaSeconds: c.deliverySlaSeconds,
        seller: {
          displayName: seller?.displayName || "Seller",
          payoutWallet: c.sellerPayoutWallet,
          verifiedSellerBadge: !!seller?.verifiedSellerBadge,
          verifiedRightsBadge: !!seller?.verifiedRightsBadge,
        },
      };
    });

  res.json({
    version: "1.0",
    network: "Arc Testnet (5042002)",
    campaigns,
  });
});

// GET /api/v1/campaigns/:id (Public Single Campaign)
publicRouter.get("/campaigns/:id", (req, res) => {
  const c = store.db.campaigns[req.params.id];
  if (!c || c.status === "DRAFT") {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const { deliveryContentTemplate, ...safeCampaign } = c;
  const seller = store.db.users[c.sellerId]?.sellerProfile;
  res.json({
    version: "1.0",
    network: "Arc Testnet (5042002)",
    campaign: {
      ...safeCampaign,
      seller: {
        displayName: seller?.displayName || "Seller",
        payoutWallet: c.sellerPayoutWallet,
        verifiedSellerBadge: !!seller?.verifiedSellerBadge,
        verifiedRightsBadge: !!seller?.verifiedRightsBadge,
      },
    },
  });
});

// GET /api/v1/campaigns/:id/widget-data (Read-only widget embed data)
publicRouter.get("/campaigns/:id/widget-data", (req, res) => {
  const c = store.db.campaigns[req.params.id];
  if (!c || c.status === "DRAFT") {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const currentTier = c.tiers[c.currentUnlockedTier];
  const nextTier = c.tiers[c.currentUnlockedTier + 1] || null;

  res.json({
    id: c.id,
    title: c.title,
    thumbnailUrl: c.thumbnailUrl,
    currentPriceUSDC: (Number(currentTier.price) / 1e6).toFixed(2),
    nextPriceUSDC: nextTier ? (Number(nextTier.price) / 1e6).toFixed(2) : null,
    nextThreshold: nextTier ? nextTier.threshold : null,
    currentMetric: c.metric === "BUYER_COUNT" ? c.totalBuyerCount : c.totalUnitsCommitted,
    metric: c.metric,
    status: c.status,
    endTime: c.endTime,
    campaignUrl: `http://localhost:5173/campaign/${c.id}`,
  });
});
