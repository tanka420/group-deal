import { Router } from "express";
import { ethers } from "ethers";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { store } from "../db/store";
import { config } from "../config";
import { decryptEntitlement } from "../utils/crypto";

export const walletRouter = Router();

walletRouter.use(authMiddleware);

// Strict Whitelist Policy for Embedded Custodial Relayer (Mitigation for A03)
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
 * Sign an offchain verification challenge using the user's embedded wallet.
 * Never exposes the private key to the caller.
 */
walletRouter.post("/sign-message", async (req: AuthenticatedRequest, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message string is required" });
      return;
    }

    const user = store.db.users[req.user!.userId];
    if (!user || !user.circleWallet?.encryptedPrivateKey) {
      res.status(400).json({ error: "User does not have an active embedded wallet" });
      return;
    }

    const privateKey = decryptEntitlement(user.circleWallet.encryptedPrivateKey);
    const wallet = new ethers.Wallet(privateKey);
    const signature = await wallet.signMessage(message);

    res.json({
      success: true,
      address: wallet.address,
      signature,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Relay an onchain transaction using the user's embedded wallet with strict security policies.
 * Enforces contract address allowlist, method selector allowlist, zero-native-value cap,
 * and spender verification to prevent arbitrary execution and drain attacks.
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

    const user = store.db.users[req.user!.userId];
    if (!user || !user.circleWallet?.encryptedPrivateKey) {
      res.status(400).json({ error: "User does not have an active embedded wallet" });
      return;
    }

    const privateKey = decryptEntitlement(user.circleWallet.encryptedPrivateKey);
    const provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const tx = await wallet.sendTransaction({
      to: normalizedTo,
      data: calldata,
      value: 0n,
    });

    console.log(`[RELAY] Authorized tx ${tx.hash} from embedded wallet ${wallet.address} to ${normalizedTo}`);

    // Wait for mining to confirm receipt
    const receipt = await tx.wait();

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
