import { Router } from "express";
import { store, sanitizeUser } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { DisputeService } from "../services/disputeService";
import { ReconciliationService } from "../services/reconciliationService";

export const operatorRouter = Router();

// Require operator role for all operator routes
operatorRouter.use(authMiddleware);
operatorRouter.use(requireRole("operator"));

// GET all active disputes
operatorRouter.get("/disputes", (req, res) => {
  const disputedOrders = Object.values(store.db.orders).filter(
    (o) => o.deliveryStatus === "DISPUTED"
  );

  const enriched = disputedOrders.map((o) => {
    const campaign = store.db.campaigns[o.campaignId];
    const buyer = store.db.users[o.buyerAccountId];
    const seller = campaign ? store.db.users[campaign.sellerId] : null;

    return {
      ...o,
      campaignTitle: campaign?.title || "Campaign",
      buyerEmail: buyer?.email,
      sellerDisplayName: seller?.sellerProfile?.displayName,
      sellerPayoutWallet: campaign?.sellerPayoutWallet,
      messages: DisputeService.getMessages(o.id),
    };
  });

  res.json({ disputes: enriched });
});

// POST resolve dispute
operatorRouter.post("/disputes/:id/resolve", async (req: AuthenticatedRequest, res) => {
  try {
    const { buyerShareBaseUSDC, sellerShareBaseUSDC, notes, txHash } = req.body;
    if (!buyerShareBaseUSDC || !sellerShareBaseUSDC) {
      res.status(400).json({ error: "buyerShareBaseUSDC and sellerShareBaseUSDC are required" });
      return;
    }
    if (!txHash) {
      res.status(400).json({ error: "Missing required onchain txHash for resolving dispute" });
      return;
    }

    const result = await DisputeService.resolveDispute(
      req.user!.userId,
      req.params.id,
      buyerShareBaseUSDC,
      sellerShareBaseUSDC,
      notes || "Arbitrated by GroupDeal Operator",
      txHash
    );

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET sellers for verification
operatorRouter.get("/sellers", (req, res) => {
  const sellers = Object.values(store.db.users)
    .filter((u) => u.sellerProfile)
    .map(sanitizeUser);
  res.json({ sellers });
});

// POST update verification badges
operatorRouter.post("/sellers/:id/badge", (req: AuthenticatedRequest, res) => {
  try {
    const user = store.db.users[req.params.id];
    if (!user || !user.sellerProfile) {
      res.status(404).json({ error: "Seller profile not found" });
      return;
    }

    const { verifiedSellerBadge, verifiedRightsBadge } = req.body;
    if (verifiedSellerBadge !== undefined) {
      user.sellerProfile.verifiedSellerBadge = !!verifiedSellerBadge;
    }
    if (verifiedRightsBadge !== undefined) {
      user.sellerProfile.verifiedRightsBadge = !!verifiedRightsBadge;
    }

    store.addAuditLog(req.user!.userId, "operator", "SELLER_BADGE_UPDATED", {
      targetUserId: user.id,
      badges: {
        verifiedSellerBadge: user.sellerProfile.verifiedSellerBadge,
        verifiedRightsBadge: user.sellerProfile.verifiedRightsBadge,
      },
    });
    store.save();

    res.json({ success: true, sellerProfile: user.sellerProfile });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET reconciliation report
operatorRouter.get("/reconciliation", async (req, res) => {
  try {
    const report = await ReconciliationService.runReconciliation();
    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET audit logs
operatorRouter.get("/audit-logs", (req, res) => {
  res.json({ logs: store.db.auditLogs.slice(0, 200) });
});
