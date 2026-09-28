import { Router } from "express";
import { ethers } from "ethers";
import { config } from "../config";

export const faucetRouter = Router();

faucetRouter.post("/usdc", async (req, res) => {
  try {
    const { address } = req.body;
    if (!address || !ethers.isAddress(address)) {
      res.status(400).json({ error: "Valid EVM address is required" });
      return;
    }

    const provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
    const signer = new ethers.Wallet(config.authorizedSignerPrivateKey, provider);

    const usdcAbi = [
      "function faucet(address to) external",
      "function mint(address to, uint256 amount) external",
      "function balanceOf(address) external view returns (uint256)",
    ];
    const usdcContract = new ethers.Contract(config.usdcAddress, usdcAbi, signer);

    console.log(`[FAUCET] Dispensing 500 USDC to ${address}...`);
    try {
      const tx = await usdcContract.faucet(address);
      const receipt = await tx.wait();
      res.json({
        success: true,
        amountUSDC: 500,
        recipient: address,
        txHash: receipt.hash,
      });
    } catch (e) {
      // Fallback to mint
      const amount = ethers.parseUnits("500", 6);
      const tx = await usdcContract.mint(address, amount);
      const receipt = await tx.wait();
      res.json({
        success: true,
        amountUSDC: 500,
        recipient: address,
        txHash: receipt.hash,
      });
    }
  } catch (err: any) {
    console.error("[FAUCET] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
