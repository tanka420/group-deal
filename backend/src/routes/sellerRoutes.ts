import { Router } from "express";
import { store } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { DeliveryService } from "../services/deliveryService";
import { DisputeService } from "../services/disputeService";
import { WebhookService } from "../services/webhookService";

export const sellerRouter = Router();

// GET seller's campaigns
sellerRouter.get("/campaigns", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  const campaigns = Object.values(store.db.campaigns).filter(
    (c) => c.sellerId === req.user!.userId
  );
  res.json({ campaigns });
});

// GET seller's orders
sellerRouter.get("/orders", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  const sellerCampaignIds = new Set(
    Object.values(store.db.campaigns)
      .filter((c) => c.sellerId === req.user!.userId)
      .map((c) => c.id)
  );

  const orders = Object.values(store.db.orders).filter((o) =>
    sellerCampaignIds.has(o.campaignId)
  );

  const enriched = orders.map((o) => ({
    ...o,
    campaignTitle: store.db.campaigns[o.campaignId]?.title || "Campaign",
  }));

  res.json({ orders: enriched });
});

// POST fulfill order with encrypted entitlement
sellerRouter.post("/orders/:id/deliver", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const { secretContent } = req.body;
    if (!secretContent) {
      res.status(400).json({ error: "Digital entitlement secret content is required" });
      return;
    }
    const result = DeliveryService.fulfillOrder(
      req.user!.userId,
      req.params.id,
      secretContent
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST reply to buyer review
sellerRouter.post("/orders/:id/reply-review", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const { sellerResponse } = req.body;
    if (!sellerResponse) {
      res.status(400).json({ error: "Seller response is required" });
      return;
    }
    const order = DisputeService.replyToReview(
      req.user!.userId,
      req.params.id,
      sellerResponse
    );
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET webhook settings & logs
sellerRouter.get("/webhooks", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  const webhook = store.db.webhooks[req.user!.userId] || null;
  res.json({ webhook });
});

// POST save webhook endpoint
sellerRouter.post("/webhooks", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    const { targetUrl, events } = req.body;
    if (!targetUrl) {
      res.status(400).json({ error: "targetUrl is required" });
      return;
    }
    const sub = WebhookService.registerWebhook(
      req.user!.userId,
      targetUrl,
      events || ["order.committed", "order.delivered", "order.disputed"]
    );
    res.json({ success: true, webhook: sub });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
