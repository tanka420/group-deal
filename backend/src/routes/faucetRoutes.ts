import { Router } from "express";
import { ethers } from "ethers";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import {AuthService} from '../services/authService';
import {SessionError} from '../services/sessionService';
import {CircleAuthError} from '../domain/circleAuthentication';
import {faucetInput} from '../domain/circleWalletAuthority';
import {config} from '../config';
import { CircleWalletService } from "../services/circleWalletService";

export const faucetRouter = Router();
faucetRouter.use((_req,res,next)=>{if(config.arcChainId!==5042002){res.status(403).json({error:'FAUCET_UNAVAILABLE'});return;}next();});
const OFFICIAL_ARC_FAUCET_URL = "https://faucet.circle.com";
faucetRouter.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(Object.keys(req.query).length){res.status(400).json({error:'FAUCET_INVALID_INPUT'});return}const origin=req.headers.origin,configured=config.publicAppUrl?new URL(config.publicAppUrl).origin:undefined;if(origin&&origin!==configured&&!config.allowedOrigins.includes(origin)){res.status(403).json({error:'FAUCET_INVALID_ORIGIN'});return}next()});

faucetRouter.post("/usdc", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const input=faucetInput.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Valid EVM address is required" });
    return;
  }

  const address=input.data.address;
  try {
    AuthService.reserveFaucet(req.user!.userId,address,req.sessionProof!);
    AuthService.assertFaucetAuthority(req.user!.userId,address,req.sessionProof!);
    await CircleWalletService.requestArcTestnetTokens(address);
    AuthService.assertFaucetAuthority(req.user!.userId,address,req.sessionProof!);
    res.status(202).json({ status: "REQUESTED", recipient: ethers.getAddress(address),
      message: "Circle đã nhận yêu cầu faucet. Số dư sẽ cập nhật khi token đến ví." });
  } catch (error) {
    if(error instanceof CircleAuthError||error instanceof SessionError){if(error.status===429)res.setHeader('Retry-After','60');res.status(error.status).json({error:error.code});return}
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
