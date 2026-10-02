import { Router } from "express";
import * as crypto from "crypto";
import { AuthService } from "../services/authService";
import { CircleTransactionIntent, CircleWalletService } from "../services/circleWalletService";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { store } from "../db/store";

export const circleRouter = Router();

circleRouter.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => console.info(JSON.stringify({
    event: "CIRCLE_API", requestId, method: req.method, path: req.path,
    status: res.statusCode, durationMs: Date.now() - startedAt,
  })));
  next();
});

function sendCircleError(res: any, error: unknown): void {
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate?.code === "number" || typeof candidate?.code === "string"
    ? candidate.code
    : undefined;
  const message = typeof candidate?.message === "string" ? candidate.message : "Circle request failed";
  res.status(400).json({ error: message, ...(code !== undefined ? { code } : {}) });
}

function consumeRateLimit(
  scope: string,
  rawIdentifier: string,
  limit: number,
  windowMs: number,
  minimumIntervalMs = 0
): void {
  const digest = crypto.createHash("sha256").update(rawIdentifier).digest("hex");
  const key = `${scope}:${digest}`;
  const now = Date.now();
  const previous = store.db.rateLimits[key];
  if (previous?.blockedUntil && previous.blockedUntil > now) {
    throw new Error("Quá nhiều yêu cầu. Vui lòng thử lại sau.");
  }
  if (previous && now - previous.lastAttemptAt < minimumIntervalMs) {
    throw new Error("Vui lòng đợi trước khi yêu cầu mã đăng nhập mới.");
  }
  const entry = !previous || now - previous.windowStartedAt >= windowMs
    ? { windowStartedAt: now, count: 0, lastAttemptAt: 0 }
    : previous;
  entry.count += 1;
  entry.lastAttemptAt = now;
  if (entry.count > limit) {
    entry.blockedUntil = entry.windowStartedAt + windowMs;
  }
  store.db.rateLimits[key] = entry;

  // Bound persistent limiter state without storing raw email, IP or device identifiers.
  for (const [candidateKey, candidate] of Object.entries(store.db.rateLimits)) {
    if (now - candidate.windowStartedAt > 2 * 86400000) delete store.db.rateLimits[candidateKey];
  }
  store.save();
  if (entry.blockedUntil) throw new Error("Quá nhiều yêu cầu. Vui lòng thử lại sau.");
}

circleRouter.get("/status", (_req, res) => {
  res.json({
    configured: CircleWalletService.isConfigured(),
    blockchain: "ARC-TESTNET",
    chainId: 5042002,
    custody: "USER_CONTROLLED",
  });
});

circleRouter.post("/email/token", async (req, res) => {
  try {
    const { email, deviceId } = req.body || {};
    if (typeof email !== "string" || typeof deviceId !== "string") {
      res.status(400).json({ error: "Email and Circle deviceId are required" });
      return;
    }
    consumeRateLimit("circle-email", email.trim().toLowerCase(), 5, 60 * 60 * 1000, 30_000);
    consumeRateLimit("circle-device", deviceId, 15, 60 * 60 * 1000);
    consumeRateLimit("circle-ip", req.ip || req.socket.remoteAddress || "unknown", 30, 60 * 60 * 1000);
    const result = await CircleWalletService.requestEmailOtp(email, deviceId);
    res.json(result);
  } catch {
    // Keep the response independent of whether the address exists at Circle.
    res.status(400).json({
      error: "Không thể bắt đầu đăng nhập Circle. Vui lòng kiểm tra thông tin hoặc thử lại sau.",
    });
  }
});

circleRouter.post("/session", async (req, res) => {
  try {
    const { userToken, loginAttemptId } = req.body || {};
    if (typeof userToken !== "string" || typeof loginAttemptId !== "string") {
      res.status(400).json({ error: "Circle userToken and loginAttemptId are required" });
      return;
    }
    consumeRateLimit("circle-session-ip", req.ip || req.socket.remoteAddress || "unknown", 30, 10 * 60 * 1000);
    consumeRateLimit("circle-session-token", userToken, 10, 10 * 60 * 1000);
    const identity = await CircleWalletService.verifyIdentity(userToken, loginAttemptId);
    // Authentication must not wait for eventually-consistent wallet inventory.
    // Only /wallets binds an address after Circle verifies its ownership.
    const result = AuthService.createCircleSession(identity.email, identity.circleUserId);
    res.json({ ...result, walletInitialized: Boolean(result.user.circleWallet) });
  } catch (error) {
    sendCircleError(res, error);
  }
});

circleRouter.post("/wallet/initialize", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { userToken } = req.body || {};
    if (typeof userToken !== "string") {
      res.status(400).json({ error: "Circle userToken is required" });
      return;
    }
    const result = await CircleWalletService.initializeArcWallet(req.user!.userId, userToken);
    res.json(result);
  } catch (error) {
    sendCircleError(res, error);
  }
});

circleRouter.post("/wallets", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { userToken } = req.body || {};
    if (typeof userToken !== "string") {
      res.status(400).json({ error: "Circle userToken is required" });
      return;
    }
    const identity = await CircleWalletService.assertBoundIdentity(req.user!.userId, userToken);
    const wallets = await CircleWalletService.listArcWallets(userToken);
    const user = wallets[0]
      ? AuthService.bindCircleWallet(req.user!.userId, identity.circleUserId, wallets[0])
      : undefined;
    res.json({ wallets, user });
  } catch (error) {
    sendCircleError(res, error);
  }
});

circleRouter.post("/transactions/estimate", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { userToken, walletId, contractAddress, callData, intent } = req.body || {};
    if (![userToken, walletId, contractAddress, callData].every((value) => typeof value === "string") || !intent) {
      res.status(400).json({ error: "Incomplete Circle transaction estimate request" });
      return;
    }
    const estimate = await CircleWalletService.estimateContractFee({
      userId: req.user!.userId,
      userToken,
      walletId,
      contractAddress,
      callData,
      intent: intent as CircleTransactionIntent,
    });
    res.json({ estimate });
  } catch (error) {
    sendCircleError(res, error);
  }
});

circleRouter.post("/transactions/challenge", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { userToken, walletId, contractAddress, callData, intent, operationId } = req.body || {};
    if (
      ![userToken, walletId, contractAddress, callData, operationId].every(
        (value) => typeof value === "string"
      ) ||
      !intent
    ) {
      res.status(400).json({ error: "Incomplete Circle transaction challenge request" });
      return;
    }
    const result = await CircleWalletService.createContractChallenge({
      userId: req.user!.userId,
      userToken,
      walletId,
      contractAddress,
      callData,
      intent: intent as CircleTransactionIntent,
      operationId,
    });
    res.json(result);
  } catch (error) {
    sendCircleError(res, error);
  }
});

circleRouter.post("/transactions/:id", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { userToken } = req.body || {};
    if (typeof userToken !== "string") {
      res.status(400).json({ error: "Circle userToken is required" });
      return;
    }
    const transaction = await CircleWalletService.getTransaction(
      req.user!.userId,
      userToken,
      req.params.id
    );
    res.json({ transaction });
  } catch (error) {
    sendCircleError(res, error);
  }
});

circleRouter.post("/challenges/:id", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { userToken } = req.body || {};
    if (typeof userToken !== "string") {
      res.status(400).json({ error: "Circle userToken is required" });
      return;
    }
    const challenge = await CircleWalletService.getChallenge(
      req.user!.userId,
      userToken,
      req.params.id
    );
    res.json({ challenge });
  } catch (error) {
    sendCircleError(res, error);
  }
});
