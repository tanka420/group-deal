import { Router } from "express";
import { ethers } from "ethers";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { store } from "../db/store";
import { CircleWalletService } from "../services/circleWalletService";

export const faucetRouter = Router();
const OFFICIAL_ARC_FAUCET_URL = "https://faucet.circle.com";

faucetRouter.post("/usdc", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { address } = req.body || {};
  if (typeof address !== "string" || !ethers.isAddress(address)) {
    res.status(400).json({ error: "Valid EVM address is required" });
    return;
  }

  const user = store.db.users[req.user!.userId];
  const ownedAddresses = [user?.activeWallet, user?.circleWallet?.address].filter(Boolean);
  if (!ownedAddresses.some((owned) => owned!.toLowerCase() === address.toLowerCase())) {
    res.status(403).json({ error: "Chỉ được nhận faucet cho ví đã gắn với tài khoản của bạn" });
    return;
  }
  const key = `arc-faucet:${address.toLowerCase()}`;
  const now = Date.now();
  const previous = store.db.rateLimits[key];
  // Reserve before await, including unknown provider outcomes after timeout.
  if (previous && now - previous.lastAttemptAt < 60_000) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Vui lòng đợi ít nhất 60 giây. Circle có hạn mức faucet riêng." });
    return;
  }
  const windowActive = Boolean(previous && now - previous.windowStartedAt < 3600_000);
  if (windowActive && previous.count >= 5) {
    res.status(429).json({ error: "Đã đạt giới hạn 5 yêu cầu faucet mỗi giờ cho ví này. Circle cũng áp dụng hạn mức riêng." });
    return;
  }
  store.db.rateLimits[key] = { windowStartedAt: windowActive ? previous.windowStartedAt : now,
    lastAttemptAt: now, count: windowActive ? previous.count + 1 : 1 };
  store.save();
  try {
    await CircleWalletService.requestArcTestnetTokens(address);
    res.status(202).json({ status: "REQUESTED", recipient: ethers.getAddress(address),
      message: "Circle đã nhận yêu cầu faucet. Số dư sẽ cập nhật khi token đến ví." });
  } catch (error) {
    const providerStatus = (error as { status?: number; statusCode?: number }).status
      || (error as { statusCode?: number }).statusCode;
    res.status(providerStatus === 429 ? 429 : 502).json({
      code: providerStatus === 401 || providerStatus === 403 ? "FAUCET_API_ACCESS_REQUIRED" : "FAUCET_PROVIDER_UNAVAILABLE",
      error: providerStatus === 401 || providerStatus === 403
        ? "Circle từ chối quyền API faucet. API này yêu cầu Console được nâng cấp quyền mainnet; token nhận vẫn là Arc Testnet. Dùng faucet web nếu chưa có quyền."
        : "Circle chưa xác nhận cấp token: có thể hết hạn mức hoặc dịch vụ chưa sẵn sàng. Kiểm tra số dư trước khi thử lại.",
      faucetUrl: OFFICIAL_ARC_FAUCET_URL,
    });
  }
});
