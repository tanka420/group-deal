import { Router } from "express";
import { ethers } from "ethers";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { store } from "../db/store";
import { config } from "../config";

export const walletRouter = Router();

walletRouter.use(authMiddleware);

// Strict Whitelist Policy for GroupDealHub functions that can be sponsored/relayed
const ALLOWED_HUB_SELECTORS = new Set([
  "0x5656bceb", // commitToBuy
  "0xa724b047", // claimBuyerFunds
  "0xdc5369ad", // claimDeliveryBreach
  "0xde1bf140", // claimSellerProceeds
  "0xe5b56091", // confirmReceipt
  "0xd2e21c7e", // openDispute
  "0x0bb522ec", // createCampaign
  "0x784cd414", // recordDelivery
  "0xed6a2f0a", // settleUndisputedOrder
  "0x16670bcd", // resolveDispute
  "0xf9b60540", // emergencyOpenDisputeWithSignature
]);

const ERC20_APPROVE_SELECTOR = "0x095ea7b3";

/**
 * Arbitrary message signing endpoint is permanently removed to comply with
 * non-custodial architecture (G1.2).
 */
walletRouter.post("/sign-message", async (_req: AuthenticatedRequest, res) => {
  res.status(410).json({
    error: "Security Policy: Arbitrary backend message signing is permanently disabled. All signatures must originate directly from user-controlled wallets.",
  });
});

/**
 * Sponsored/Meta-Transaction Relayer with strict security policies.
 * Never stores or decrypts user private keys.
 * Relaying, if invoked, uses the operator gas sponsor key strictly according to policy.
 */
walletRouter.post("/relay", async (req: AuthenticatedRequest, res) => {
  try {
    const { to, data, value } = req.body;
    if (!to || !ethers.isAddress(to)) {
      res.status(400).json({ error: "Valid 'to' contract address is required" });
      return;
    }

    const normalizedTo = ethers.getAddress(to).toLowerCase();
    const hubAddr = ethers.getAddress(config.hubAddress).toLowerCase();
    const usdcAddr = ethers.getAddress(config.usdcAddress).toLowerCase();

    // 1. Target Whitelist Enforcement
    if (normalizedTo !== hubAddr && normalizedTo !== usdcAddr) {
      res.status(403).json({
        error: "Access Denied: Relayer target is restricted to GroupDealHub and USDC token contracts only.",
      });
      return;
    }

    // 2. Disallow arbitrary native transfers
    if (value && BigInt(value) > 0n) {
      res.status(403).json({ error: "Access Denied: Native currency transfer is strictly forbidden." });
      return;
    }

    const calldata = data || "0x";
    if (calldata.length < 10) {
      res.status(400).json({ error: "Invalid calldata: function selector missing." });
      return;
    }

    const selector = calldata.slice(0, 10).toLowerCase();

    // 3. USDC Token Contract Policy
    if (normalizedTo === usdcAddr) {
      if (selector !== ERC20_APPROVE_SELECTOR) {
        res.status(403).json({
          error: "Access Denied: Only approve(address,uint256) is permitted on the USDC contract.",
        });
        return;
      }
      // Inspect spender argument (first 32-byte param in calldata)
      const decodedSpender = ethers.getAddress("0x" + calldata.slice(34, 74)).toLowerCase();
      if (decodedSpender !== hubAddr) {
        res.status(403).json({
          error: "Access Denied: Spender for USDC approval must be the GroupDealHub contract.",
        });
        return;
      }
    }

    // 4. GroupDealHub Contract Policy
    if (normalizedTo === hubAddr) {
      if (!ALLOWED_HUB_SELECTORS.has(selector)) {
        res.status(403).json({
          error: `Access Denied: Function selector ${selector} is not allowed on GroupDealHub.`,
        });
        return;
      }
    }

    // Sponsor key (Operator gas relayer)
    const provider = new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
      staticNetwork: true,
    });
    const sponsorSigner = new ethers.Wallet(config.authorizedSignerPrivateKey, provider);

    const tx = await sponsorSigner.sendTransaction({
      to: normalizedTo,
      data: calldata,
      value: 0n,
    });

    console.log(`[RELAY] Sponsored tx ${tx.hash} from sponsor ${sponsorSigner.address} to ${normalizedTo}`);

    // Wait for mining to confirm receipt
    const receipt = await tx.wait(1);

    res.json({
      success: true,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      status: receipt?.status,
    });
  } catch (err: any) {
    console.error("[RELAY] Error executing tx:", err.message);
    res.status(500).json({ error: err.message });
  }
});
