import { Router } from "express";
import * as crypto from "crypto";
import { AuthService } from "../services/authService";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { store, sanitizeUser } from "../db/store";

export const authRouter = Router();

function consumeWalletLoginRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number,
  minimumIntervalMs = 0
): void {
  const digest = crypto.createHash("sha256").update(identifier).digest("hex");
  const key = `${scope}:${digest}`;
  const now = Date.now();
  const previous = store.db.rateLimits[key];
  if (previous?.blockedUntil && previous.blockedUntil > now) {
    throw new Error("Quá nhiều yêu cầu đăng nhập ví. Vui lòng thử lại sau.");
  }
  if (previous && now - previous.lastAttemptAt < minimumIntervalMs) {
    throw new Error("Vui lòng đợi trước khi yêu cầu chữ ký mới.");
  }
  const entry = !previous || now - previous.windowStartedAt >= windowMs
    ? { windowStartedAt: now, count: 0, lastAttemptAt: 0 }
    : previous;
  entry.count += 1;
  entry.lastAttemptAt = now;
  if (entry.count > limit) entry.blockedUntil = entry.windowStartedAt + windowMs;
  store.db.rateLimits[key] = entry;
  store.save();
  if (entry.blockedUntil) {
    throw new Error("Quá nhiều yêu cầu đăng nhập ví. Vui lòng thử lại sau.");
  }
}

authRouter.post("/otp/request", (req, res) => {
  res.status(410).json({
    error: "Legacy local OTP is disabled. Use /api/circle/email/token and Circle hosted verification.",
  });
});

authRouter.post("/otp/verify", (req, res) => {
  res.status(410).json({
    error: "Legacy local OTP is disabled. Use Circle hosted verification.",
  });
});

// Wallet-first authentication via a one-time, domain-bound EVM signature.
authRouter.post("/wallet/login/challenge", (req, res) => {
  try {
    const { walletAddress } = req.body || {};
    if (typeof walletAddress !== "string") {
      res.status(400).json({ error: "Wallet address is required" });
      return;
    }
    consumeWalletLoginRateLimit("wallet-login-address", walletAddress.toLowerCase(), 10, 10 * 60_000, 2_000);
    consumeWalletLoginRateLimit(
      "wallet-login-ip",
      req.ip || req.socket.remoteAddress || "unknown",
      30,
      10 * 60_000
    );
    const challenge = AuthService.issueWalletLoginChallenge(
      walletAddress,
      req.get("origin") || "groupdeal.app"
    );
    res.json(challenge);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Cannot create wallet login challenge" });
  }
});

authRouter.post("/wallet/login/verify", (req, res) => {
  try {
    const { walletAddress, signature, message, nonce } = req.body || {};
    if (![walletAddress, signature, message, nonce].every((value) => typeof value === "string")) {
      res.status(400).json({ error: "Wallet address, signature, message, and nonce are required" });
      return;
    }
    consumeWalletLoginRateLimit(
      "wallet-login-verify-ip",
      req.ip || req.socket.remoteAddress || "unknown",
      60,
      10 * 60_000
    );
    res.json(AuthService.verifyWalletLogin(walletAddress, signature, message, nonce));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Wallet login failed" });
  }
});

// Request cryptographic time-bound challenge nonce to bind wallet or payout
authRouter.post("/wallet/challenge", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { action, walletAddress } = req.body;
    if (!action || !walletAddress) {
      res.status(400).json({ error: "Action and walletAddress are required" });
      return;
    }
    if (!["LINK_WALLET", "SELLER_PAYOUT", "OPERATOR_ACTION"].includes(action)) {
      res.status(400).json({ error: "Unsupported wallet challenge action" });
      return;
    }
    const challenge = AuthService.issueWalletChallenge(req.user!.userId, action, walletAddress);
    res.json({ success: true, ...challenge });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.post("/wallet/bind", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { walletAddress, signature, message } = req.body;
    if (!walletAddress || !signature || !message) {
      res.status(400).json({ error: "Wallet address, message, and signature are required" });
      return;
    }
    const updatedUser = AuthService.linkExternalWallet(
      req.user!.userId,
      walletAddress,
      signature,
      message
    );
    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.post("/seller/profile", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { displayName, bio, payoutWallet, proofSignature, challengeMessage } = req.body;
    if (!displayName || !payoutWallet || !proofSignature || !challengeMessage) {
      res.status(400).json({ error: "Missing required seller profile fields or signature proof" });
      return;
    }
    const updatedUser = AuthService.setupSellerProfile(req.user!.userId, {
      displayName,
      bio: bio || "",
      payoutWallet,
      proofSignature,
      challengeMessage,
    });
    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.get("/me", authMiddleware, (req: AuthenticatedRequest, res) => {
  const user = store.db.users[req.user!.userId];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: sanitizeUser(user) });
});
