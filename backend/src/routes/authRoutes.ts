import { Router } from "express";
import { AuthService } from "../services/authService";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { store, sanitizeUser } from "../db/store";

export const authRouter = Router();

authRouter.post("/otp/request", (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }
    const result = AuthService.requestOtp(email);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.post("/otp/verify", (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: "Email and OTP code are required" });
      return;
    }
    const result = AuthService.verifyOtp(email, code);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
