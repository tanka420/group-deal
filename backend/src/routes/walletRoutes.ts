import { Router } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

export const walletRouter = Router();

walletRouter.use(authMiddleware);

/**
 * Arbitrary message signing endpoint is permanently removed to comply with
 * non-custodial architecture (G1.2).
 */
walletRouter.post("/sign-message", async (_req: AuthenticatedRequest, res) => {
  res.status(410).json({
    error: "Security Policy: Arbitrary backend message signing is permanently disabled. All signatures must originate directly from user-controlled wallets.",
  });
});

walletRouter.post("/relay", (_req: AuthenticatedRequest, res) => {
  res.status(410).json({
    error:
      "Custodial relay removed. Circle users must approve a User-Controlled Wallet challenge in the browser.",
  });
});
