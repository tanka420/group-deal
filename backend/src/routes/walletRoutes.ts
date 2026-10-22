import { Router } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import {workspaceList,workspaceFailure} from '../services/workspaceView';

export const walletRouter = Router();

walletRouter.use(authMiddleware);
walletRouter.get('/activity',(req:AuthenticatedRequest,res)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');try{res.json(workspaceList(req.sessionProof!,req.query,'wallet-trades'));}catch(error){workspaceFailure(res,error);}});

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
