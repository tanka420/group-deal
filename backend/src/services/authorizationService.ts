import { ethers } from "ethers";
import { config } from "../config";
import { store } from "../db/store";
import { deriveCampaignIdentity } from "../utils/crypto";

export class AuthorizationService {
  /**
   * Generates a signed EIP-712 buy authorization for a user to commit USDC on Arc Testnet.
   */
  public static async generateBuyAuthorization(
    userId: string,
    campaignId: string,
    quantity: number,
    buyerWalletAddress: string
  ): Promise<{
    campaignId: string;
    campaignIdentity: string;
    buyerWallet: string;
    nonce: number;
    maxQuantity: number;
    deadline: number;
    termsHash: string;
    signature: string;
  }> {
    const user = store.db.users[userId];
    if (!user) throw new Error("User not found");

    const campaign = store.db.campaigns[campaignId];
    if (!campaign) throw new Error("Campaign not found");

    if (campaign.status !== "ACTIVE" && campaign.status !== "PUBLISHED") {
      throw new Error(`Campaign is not open for commitments (status: ${campaign.status})`);
    }

    if (Date.now() > campaign.endTime * 1000) {
      throw new Error("Campaign has expired");
    }

    const campaignIdentity = deriveCampaignIdentity(userId, campaignId);
    const buyerWallet = ethers.getAddress(buyerWalletAddress);

    // Verify wallet is bound to this user
    if (!user.activeWallet || user.activeWallet.toLowerCase() !== buyerWallet.toLowerCase()) {
      throw new Error("Specified wallet is not currently active on this account");
    }

    // Check purchase limits
    let unitsAlreadyBought = 0;
    let pinnedPrincipal: string | null = null;

    for (const order of Object.values(store.db.orders)) {
      if (order.campaignId === campaignId && order.campaignIdentity === campaignIdentity) {
        unitsAlreadyBought += order.quantity;
        pinnedPrincipal = order.buyerPrincipal;
      }
    }

    if (pinnedPrincipal && pinnedPrincipal.toLowerCase() !== buyerWallet.toLowerCase()) {
      throw new Error("Account campaign identity is pinned to a different principal wallet");
    }

    if (unitsAlreadyBought + quantity > campaign.maxPerAccount) {
      throw new Error(
        `Exceeds maximum units per account (${campaign.maxPerAccount}). Already bought: ${unitsAlreadyBought}`
      );
    }

    if (campaign.inventoryLimit > 0 && campaign.totalUnitsCommitted + quantity > campaign.inventoryLimit) {
      throw new Error("Exceeds remaining campaign inventory");
    }

    // Connect to contract to fetch actual onchain nonce
    let onchainNonce = 0;
    try {
      const provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
      const hubAbi = [
        "function identityNonces(uint256, bytes32) external view returns (uint256)",
        "function campaignIdentityPrincipals(uint256, bytes32) external view returns (address)",
      ];
      const hubContract = new ethers.Contract(config.hubAddress, hubAbi, provider);
      const onchainPrincipal = await hubContract.campaignIdentityPrincipals(
        BigInt(campaign.onchainCampaignId),
        campaignIdentity
      );

      if (onchainPrincipal !== ethers.ZeroAddress && onchainPrincipal.toLowerCase() !== buyerWallet.toLowerCase()) {
        throw new Error("Onchain principal already pinned to a different wallet");
      }

      const nonceBigInt = await hubContract.identityNonces(
        BigInt(campaign.onchainCampaignId),
        campaignIdentity
      );
      onchainNonce = Number(nonceBigInt);
    } catch (err: any) {
      console.warn("[AuthService] Could not fetch onchain nonce, falling back to local count:", err.message);
      // Fallback: count local orders for this identity
      onchainNonce = Object.values(store.db.orders).filter(
        (o) => o.campaignId === campaignId && o.campaignIdentity === campaignIdentity
      ).length;
    }

    // Authorization valid for 15 minutes
    const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
    const maxQuantity = campaign.maxPerAccount;

    // EIP-712 Domain
    const domain = {
      name: "GroupDealHub",
      version: "1",
      chainId: config.arcChainId,
      verifyingContract: config.hubAddress,
    };

    const types = {
      BuyAuthorization: [
        { name: "chainId", type: "uint256" },
        { name: "hubContract", type: "address" },
        { name: "campaignId", type: "uint256" },
        { name: "termsHash", type: "bytes32" },
        { name: "campaignIdentity", type: "bytes32" },
        { name: "buyerWallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "maxQuantity", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      chainId: BigInt(config.arcChainId),
      hubContract: config.hubAddress,
      campaignId: BigInt(campaign.onchainCampaignId),
      termsHash: campaign.termsHash,
      campaignIdentity: campaignIdentity,
      buyerWallet: buyerWallet,
      nonce: BigInt(onchainNonce),
      maxQuantity: BigInt(maxQuantity),
      deadline: BigInt(deadline),
    };

    const signer = new ethers.Wallet(config.authorizedSignerPrivateKey);
    const signature = await signer.signTypedData(domain, types, value);

    store.addAuditLog(userId, "buyer", "BUY_AUTHORIZATION_ISSUED", {
      campaignId,
      campaignIdentity,
      buyerWallet,
      quantity,
      nonce: onchainNonce,
    });

    return {
      campaignId: campaign.onchainCampaignId.toString(),
      campaignIdentity,
      buyerWallet,
      nonce: onchainNonce,
      maxQuantity,
      deadline,
      termsHash: campaign.termsHash,
      signature,
    };
  }
}
