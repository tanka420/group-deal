import { Router } from "express";
import { store } from "../db/store";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { AuthorizationService } from "../services/authorizationService";
import { DeliveryService } from "../services/deliveryService";
import { DisputeService } from "../services/disputeService";

export const orderRouter = Router();

// POST buy authorization
orderRouter.post("/authorize", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { campaignId, quantity, walletAddress } = req.body;
    if (!campaignId || !quantity || !walletAddress) {
      res.status(400).json({ error: "campaignId, quantity, and walletAddress are required" });
      return;
    }

    const authResult = await AuthorizationService.generateBuyAuthorization(
      req.user!.userId,
      campaignId.toString(),
      Number(quantity),
      walletAddress
    );

    res.json(authResult);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET buyer's orders
orderRouter.get("/buyer", authMiddleware, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const orders = Object.values(store.db.orders).filter(
    (o) => o.buyerAccountId === userId || (req.user!.activeWallet && o.buyerPrincipal.toLowerCase() === req.user!.activeWallet.toLowerCase())
  );

  // Attach campaign metadata for display
  const enriched = orders.map((o) => {
    const campaign = store.db.campaigns[o.campaignId];
    return {
      ...o,
      campaignTitle: campaign?.title || "Campaign",
      campaignThumbnail: campaign?.thumbnailUrl || "",
      campaignStatus: campaign?.status || "ACTIVE",
      sellerPayoutWallet: campaign?.sellerPayoutWallet,
    };
  });

  res.json({ orders: enriched });
});

// GET decrypted entitlement
orderRouter.get("/:id/entitlement", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const content = DeliveryService.accessEntitlement(req.user!.userId, req.params.id);
    res.json({ success: true, entitlement: content });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST confirm receipt early
orderRouter.post("/:id/confirm", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const order = DeliveryService.confirmReceipt(req.user!.userId, req.params.id);
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST open dispute
orderRouter.post("/:id/dispute", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { reason, evidenceUrls } = req.body;
    if (!reason) {
      res.status(400).json({ error: "Dispute reason is required" });
      return;
    }
    const order = DisputeService.openDispute(
      req.user!.userId,
      req.params.id,
      reason,
      evidenceUrls || []
    );
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

function authorizeOrderParty(req: AuthenticatedRequest, orderId: string) {
  const order = store.db.orders[orderId];
  if (!order) {
    return { error: "Order not found", status: 404 };
  }
  const campaign = store.db.campaigns[order.campaignId];
  const isOperator = req.user!.roles.includes("operator");
  const isSeller = campaign && campaign.sellerId === req.user!.userId;
  const isBuyer = order.buyerAccountId === req.user!.userId;

  if (!isOperator && !isSeller && !isBuyer) {
    return { error: "Access denied: you are not a party to this order thread", status: 403 };
  }

  const role: "operator" | "seller" | "buyer" = isOperator
    ? "operator"
    : isSeller
    ? "seller"
    : "buyer";

  return { order, campaign, role };
}

// GET support messages
orderRouter.get("/:id/messages", authMiddleware, (req: AuthenticatedRequest, res) => {
  const auth = authorizeOrderParty(req, req.params.id);
  if (auth.error) {
    res.status(auth.status!).json({ error: auth.error });
    return;
  }
  const messages = DisputeService.getMessages(req.params.id);
  res.json({ messages });
});

// POST support message
orderRouter.post("/:id/messages", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const auth = authorizeOrderParty(req, req.params.id);
    if (auth.error) {
      res.status(auth.status!).json({ error: auth.error });
      return;
    }
    const { text } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Message text is required" });
      return;
    }

    const msg = DisputeService.addMessage(
      req.params.id,
      auth.role!,
      req.user!.activeWallet || req.user!.email,
      text.trim()
    );
    res.json({ success: true, message: msg });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST leave review
orderRouter.post("/:id/review", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { score, comment } = req.body;
    if (!score || !comment) {
      res.status(400).json({ error: "Score (1-5) and comment are required" });
      return;
    }
    const order = DisputeService.addReview(req.user!.userId, req.params.id, score, comment);
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
