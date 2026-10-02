import {
  type AccountType,
  type Blockchain,
  type FeeLevel,
  type TestnetBlockchain,
  initiateUserControlledWalletsClient,
} from "@circle-fin/user-controlled-wallets";
import * as crypto from "crypto";
import { ethers } from "ethers";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { store } from "../db/store";

// SDK 10.8.1 declares these enums in .d.ts but omits several runtime exports.
// Use API literals checked against SDK types, never declaration-only objects.
const ARC_BLOCKCHAIN = "ARC-TESTNET" satisfies Blockchain & TestnetBlockchain;
const MAX_APPROVAL_BASE_UNITS = BigInt(process.env.CIRCLE_MAX_APPROVAL_BASE_UNITS || "1000000000");

const usdcInterface = new ethers.Interface([
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

const hubInterface = new ethers.Interface([
  "function createCampaign((address sellerPayoutWallet, uint8 metric, uint256 maxPerAccount, uint256 inventoryLimit, uint256 durationSeconds, uint256 deliverySlaSeconds, bool earlyRebateEnabled, uint32 earlySlotsCount, uint256 earlyRebateAmount, uint16 earlyRebateBps, uint16 platformFeeBps, bytes32 termsHash) terms, (uint256 threshold, uint256 price)[] tiers) external returns (uint256 campaignId)",
  "function commitToBuy(uint256 campaignId, bytes32 campaignIdentity, uint256 quantity, bool requireEarlySlot, uint256 maxAuthQuantity, uint256 authDeadline, bytes authSignature) external returns (uint256)",
  "function recordDelivery(uint256 campaignId, uint256 orderId, bytes32 proofHash) external",
  "function claimBuyerFunds(uint256 campaignId, uint256[] orderIds) external returns (uint256)",
  "function claimSellerProceeds(uint256 campaignId, uint256[] orderIds) external returns (uint256)",
  "function confirmReceipt(uint256 campaignId, uint256 orderId) external",
  "function openDispute(uint256 campaignId, uint256 orderId, bytes32 reasonHash) external",
  "function claimDeliveryBreach(uint256 campaignId, uint256 orderId) external",
  "function settleUndisputedOrder(uint256 campaignId, uint256 orderId) external",
  "function resolveDispute(uint256 campaignId, uint256 orderId, uint256 buyerShare, uint256 sellerShare) external",
]);

export type CircleTransactionIntent =
  | { type: "USDC_APPROVE"; amount: string }
  | { type: "CREATE_CAMPAIGN"; draftId: string }
  | { type: "COMMIT_BUY"; campaignId: string; quantity: string }
  | { type: "RECORD_DELIVERY"; orderId: string; proofHash: string }
  | { type: "CLAIM_BUYER"; campaignId: string; orderIds: string[] }
  | { type: "CLAIM_SELLER"; campaignId: string; orderIds: string[] }
  | { type: "CONFIRM_RECEIPT"; campaignId: string; orderId: string }
  | { type: "OPEN_DISPUTE"; campaignId: string; orderId: string }
  | { type: "CLAIM_DELIVERY_BREACH"; campaignId: string; orderId: string }
  | { type: "SETTLE_UNDISPUTED"; campaignId: string; orderId: string }
  | {
      type: "RESOLVE_DISPUTE";
      campaignId: string;
      orderId: string;
      buyerShare: string;
      sellerShare: string;
    };

interface CircleIdentity {
  circleUserId: string;
  email: string | null;
}

function verifiedTokenEmail(token: string): string | null {
  // Call only AFTER Circle validates this exact token. Decoding is not validation.
  // An OTP request's email and a device-token subject are not authenticated user claims.
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string" || decoded.email_verified !== true) return null;
  return typeof decoded.email === "string" && decoded.email.includes("@")
    ? decoded.email.trim().toLowerCase() : null;
}

interface ArcWallet {
  walletId: string;
  address: string;
  blockchain: "ARC-TESTNET";
}

function normalizeIds(values: readonly unknown[]): string[] {
  return values.map((value) => BigInt(value as ethers.BigNumberish).toString());
}

function assertSameIds(actual: readonly unknown[], expected: readonly string[]): void {
  const left = normalizeIds(actual);
  const right = expected.map((value) => BigInt(value).toString());
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    throw new Error("Transaction calldata does not match the declared order intent");
  }
}

function stableUuid(input: string): string {
  const bytes = Buffer.from(crypto.createHash("sha256").update(input).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class CircleWalletService {
  private static client = config.circleApiKey
    ? initiateUserControlledWalletsClient({
        apiKey: config.circleApiKey,
        baseUrl: config.circleBaseUrl,
        userAgent: "groupdeal/1.0",
      })
    : null;

  public static isConfigured(): boolean {
    return Boolean(this.client);
  }

  private static requireClient() {
    if (!this.client) {
      throw new Error("Circle User-Controlled Wallets is not configured (missing CIRCLE_API_KEY)");
    }
    // Bound every provider request, including reads. Never automatically replay
    // timed-out writes: their outcome is unknown and needs reconciliation.
    const client = this.client;
    return new Proxy(client, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Circle không phản hồi trong 20 giây. Vui lòng thử lại.")), 20_000);
          Promise.resolve().then(() => value.apply(target, args)).then(resolve, reject)
            .finally(() => clearTimeout(timer));
        });
      },
    });
  }

  public static async requestArcTestnetTokens(address: string): Promise<void> {
    if (config.arcChainId !== 5042002) throw new Error("Faucet chỉ dùng cho Arc Testnet");
    await this.requireClient().requestTestnetTokens({
      address: ethers.getAddress(address), blockchain: ARC_BLOCKCHAIN,
      native: true, usdc: false, eurc: false,
    });
  }

  public static async requestEmailOtp(email: string, deviceId: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Địa chỉ email không hợp lệ");
    }
    if (!deviceId || deviceId.length < 8 || deviceId.length > 512) {
      throw new Error("Circle device ID không hợp lệ");
    }

    const response = await this.requireClient().createDeviceTokenForEmailLogin({
      email: normalizedEmail,
      deviceId,
      idempotencyKey: crypto.randomUUID(),
      xRequestId: crypto.randomUUID(),
    });
    if (!response.data?.deviceToken || !response.data.otpToken) {
      throw new Error("Circle did not return a complete email login challenge");
    }

    const loginAttemptId = crypto.randomUUID();
    const now = Date.now();
    store.db.circleLoginAttempts[loginAttemptId] = {
      id: loginAttemptId,
      email: normalizedEmail,
      bindingVersion: 2,
      deviceIdHash: crypto.createHash("sha256").update(deviceId).digest("hex"),
      expiresAt: now + 10 * 60 * 1000,
    };
    for (const [id, attempt] of Object.entries(store.db.circleLoginAttempts)) {
      if (attempt.expiresAt < now - 86400000) delete store.db.circleLoginAttempts[id];
    }
    store.save();
    return { ...response.data, loginAttemptId };
  }

  public static async verifyIdentity(userToken: string, loginAttemptId: string): Promise<CircleIdentity> {
    if (!userToken || userToken.length < 32) {
      throw new Error("Circle user token is required");
    }
    const attempt = store.db.circleLoginAttempts[loginAttemptId];
    if (!attempt || attempt.bindingVersion !== 2 || attempt.expiresAt < Date.now() || attempt.consumedAt) {
      throw new Error("Circle login attempt is missing, expired, or already consumed");
    }
    const response = await this.requireClient().getUserStatus({
      userToken,
      xRequestId: crypto.randomUUID(),
    });
    const circleUserId = response.data?.id;
    if (!circleUserId || response.data?.status === "DISABLED") {
      throw new Error("Circle user is unavailable or disabled");
    }
    const verifiedEmail = verifiedTokenEmail(userToken);
    if (verifiedEmail && verifiedEmail !== attempt.email) {
      throw new Error("Circle user token does not match the requested email login");
    }
    // Identity comes exclusively from Circle's authenticated /user response.
    // Tokens without a verified email claim can log in ONLY to their own Circle-ID
    // account; never attach the requested email or merge a legacy email account.
    // Recheck after the remote await to reject concurrent consumption/replay.
    if (attempt.consumedAt || attempt.expiresAt < Date.now()) {
      throw new Error("Circle login attempt is expired or already consumed");
    }
    attempt.consumedAt = Date.now();
    store.save();
    return { circleUserId, email: verifiedEmail };
  }

  public static async assertBoundIdentity(userId: string, userToken: string): Promise<{ circleUserId: string }> {
    if (!userToken || userToken.length < 32) throw new Error("Circle user token is required");
    const response = await this.requireClient().getUserStatus({
      userToken,
      xRequestId: crypto.randomUUID(),
    });
    const circleUserId = response.data?.id;
    if (!circleUserId || response.data?.status === "DISABLED") {
      throw new Error("Circle user is unavailable or disabled");
    }
    const user = store.db.users[userId];
    if (!user || user.circleUserId !== circleUserId) {
      throw new Error("Circle session is not bound to this GroupDeal account");
    }
    return { circleUserId };
  }

  public static async listArcWallets(userToken: string): Promise<ArcWallet[]> {
    const response = await this.requireClient().listWallets({
      userToken,
      blockchain: ARC_BLOCKCHAIN,
      xRequestId: crypto.randomUUID(),
    });
    return (response.data?.wallets || [])
      .filter((wallet) => wallet.blockchain === ARC_BLOCKCHAIN && wallet.state === "LIVE")
      .map((wallet) => ({
        walletId: wallet.id,
        address: ethers.getAddress(wallet.address),
        blockchain: "ARC-TESTNET" as const,
      }));
  }

  public static async initializeArcWallet(userId: string, userToken: string) {
    await this.assertBoundIdentity(userId, userToken);
    const wallets = await this.listArcWallets(userToken);
    if (wallets.length > 0) {
      return { alreadyInitialized: true as const, wallet: wallets[0] };
    }

    const response = await this.requireClient().createUserPinWithWallets({
      userToken,
      blockchains: [ARC_BLOCKCHAIN],
      accountType: "EOA" satisfies AccountType,
      idempotencyKey: stableUuid(`arc-wallet-initialization:${userId}`),
      xRequestId: crypto.randomUUID(),
    });
    if (!response.data?.challengeId) {
      throw new Error("Circle did not return a wallet initialization challenge");
    }
    return { alreadyInitialized: false as const, challengeId: response.data.challengeId };
  }

  private static assertWalletOwnership(userId: string, walletId: string): void {
    const user = store.db.users[userId];
    if (!user?.circleWallet || user.circleWallet.walletId !== walletId) {
      throw new Error("Circle wallet is not bound to this GroupDeal account");
    }
    if (user.circleWallet.blockchain !== "ARC-TESTNET") {
      throw new Error("Only Arc Testnet Circle wallets are allowed");
    }
  }

  public static validateTransactionPolicy(
    contractAddress: string,
    callData: string,
    intent: CircleTransactionIntent,
    userId?: string
  ): void {
    const target = ethers.getAddress(contractAddress).toLowerCase();
    const hub = ethers.getAddress(config.hubAddress).toLowerCase();
    const usdc = ethers.getAddress(config.usdcAddress).toLowerCase();

    if (!ethers.isHexString(callData) || callData.length < 10) {
      throw new Error("Contract calldata is invalid");
    }

    if (intent.type === "USDC_APPROVE") {
      if (target !== usdc) throw new Error("USDC approval must target the Arc USDC predeploy");
      const decoded = usdcInterface.decodeFunctionData("approve", callData);
      const amount = BigInt(decoded.amount);
      if (ethers.getAddress(decoded.spender).toLowerCase() !== hub) {
        throw new Error("USDC approval spender must be GroupDealHub");
      }
      if (amount !== BigInt(intent.amount) || amount <= 0n || amount > MAX_APPROVAL_BASE_UNITS) {
        throw new Error("USDC approval amount violates the declared intent or policy limit");
      }
      return;
    }

    if (target !== hub) throw new Error("GroupDeal action must target the configured Hub contract");
    const parsed = hubInterface.parseTransaction({ data: callData });
    if (!parsed) throw new Error("Unsupported GroupDeal calldata");

    switch (intent.type) {
      case "CREATE_CAMPAIGN": {
        if (!userId) throw new Error("Authenticated user is required for campaign creation");
        const campaign = store.db.campaigns[intent.draftId];
        if (!campaign || campaign.sellerId !== userId || campaign.status !== "DRAFT") {
          throw new Error("Campaign draft is unavailable or not owned by the Circle user");
        }
        const circleAddress = store.db.users[userId]?.circleWallet?.address;
        if (!circleAddress || circleAddress.toLowerCase() !== campaign.sellerPayoutWallet.toLowerCase()) {
          throw new Error("Seller must sign from the payout wallet bound to the campaign");
        }
        const expectedTerms = {
          sellerPayoutWallet: ethers.getAddress(campaign.sellerPayoutWallet),
          metric: campaign.metric === "BUYER_COUNT" ? 0 : 1,
          maxPerAccount: BigInt(campaign.maxPerAccount),
          inventoryLimit: BigInt(campaign.inventoryLimit),
          durationSeconds: BigInt(campaign.durationSeconds),
          deliverySlaSeconds: BigInt(campaign.deliverySlaSeconds),
          earlyRebateEnabled: campaign.earlyRebateEnabled,
          earlySlotsCount: campaign.earlySlotsCount,
          earlyRebateAmount: BigInt(campaign.earlyRebateAmount),
          earlyRebateBps: campaign.earlyRebateBps,
          platformFeeBps: campaign.platformFeeBps,
          termsHash: campaign.termsHash,
        };
        const expectedData = hubInterface.encodeFunctionData("createCampaign", [
          expectedTerms,
          campaign.tiers.map((tier) => ({ threshold: BigInt(tier.threshold), price: BigInt(tier.price) })),
        ]);
        if (parsed.name !== "createCampaign" || expectedData.toLowerCase() !== callData.toLowerCase()) {
          throw new Error("Campaign calldata does not match the immutable server draft");
        }
        break;
      }
      case "COMMIT_BUY":
        if (
          parsed.name !== "commitToBuy" ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString() ||
          BigInt(parsed.args.quantity).toString() !== BigInt(intent.quantity).toString()
        ) {
          throw new Error("Commit calldata does not match the declared purchase intent");
        }
        break;
      case "RECORD_DELIVERY": {
        if (!userId) throw new Error("Authenticated user is required for delivery");
        const order = store.db.orders[intent.orderId];
        const campaign = order && store.db.campaigns[order.campaignId];
        if (!order || !campaign || campaign.sellerId !== userId) {
          throw new Error("Delivery intent is not owned by this seller");
        }
        if (!campaign.onchainCampaignId) {
          throw new Error("Delivery campaign does not have a verified Arc campaign ID");
        }
        const circleAddress = store.db.users[userId]?.circleWallet?.address;
        if (!circleAddress || circleAddress.toLowerCase() !== campaign.sellerPayoutWallet.toLowerCase()) {
          throw new Error("Delivery must be signed by the campaign payout wallet");
        }
        if (
          parsed.name !== "recordDelivery" ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(campaign.onchainCampaignId).toString() ||
          BigInt(parsed.args.orderId).toString() !== BigInt(order.onchainOrderId).toString() ||
          String(parsed.args.proofHash).toLowerCase() !== intent.proofHash.toLowerCase()
        ) {
          throw new Error("Delivery calldata does not match the declared seller intent");
        }
        break;
      }
      case "CLAIM_BUYER":
      case "CLAIM_SELLER": {
        const expectedName = intent.type === "CLAIM_BUYER" ? "claimBuyerFunds" : "claimSellerProceeds";
        if (
          parsed.name !== expectedName ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString()
        ) {
          throw new Error("Claim calldata does not match the declared campaign intent");
        }
        assertSameIds(parsed.args.orderIds, intent.orderIds);
        if (userId) {
          for (const orderId of intent.orderIds) {
            const order = store.db.orders[BigInt(orderId).toString()];
            const campaign = order && store.db.campaigns[order.campaignId];
            if (!order || !campaign) throw new Error("Claim references an unknown order");
            if (intent.type === "CLAIM_BUYER" && order.buyerAccountId !== userId) {
              throw new Error("Buyer claim references an order owned by another account");
            }
          if (intent.type === "CLAIM_SELLER" && campaign.sellerId !== userId) {
            throw new Error("Seller claim references a campaign owned by another account");
          }
          if (
            intent.type === "CLAIM_SELLER" &&
            store.db.users[userId]?.circleWallet?.address.toLowerCase() !==
              campaign.sellerPayoutWallet.toLowerCase()
          ) {
            throw new Error("Seller claim must be signed by the campaign payout wallet");
          }
          }
        }
        break;
      }
      case "CONFIRM_RECEIPT":
      case "OPEN_DISPUTE":
      case "CLAIM_DELIVERY_BREACH":
      case "SETTLE_UNDISPUTED": {
        const expectedName = {
          CONFIRM_RECEIPT: "confirmReceipt",
          OPEN_DISPUTE: "openDispute",
          CLAIM_DELIVERY_BREACH: "claimDeliveryBreach",
          SETTLE_UNDISPUTED: "settleUndisputedOrder",
        }[intent.type];
        if (
          parsed.name !== expectedName ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString() ||
          BigInt(parsed.args.orderId).toString() !== BigInt(intent.orderId).toString()
        ) {
          throw new Error("Order calldata does not match the declared intent");
        }
        if (userId) {
          const order = store.db.orders[BigInt(intent.orderId).toString()];
          if (!order) throw new Error("Order intent references an unknown order");
          if (intent.type !== "SETTLE_UNDISPUTED" && order.buyerAccountId !== userId) {
            throw new Error("Order action is not owned by this buyer account");
          }
        }
        break;
      }
      case "RESOLVE_DISPUTE": {
        if (!userId) throw new Error("Authenticated operator is required");
        const user = store.db.users[userId];
        if (!user?.roles.includes("operator")) throw new Error("Operator role is required");
        if (user.circleWallet?.address.toLowerCase() !== config.operatorAddress.toLowerCase()) {
          throw new Error("Dispute resolution must be signed by the configured operator wallet");
        }
        if (
          parsed.name !== "resolveDispute" ||
          BigInt(parsed.args.campaignId).toString() !== BigInt(intent.campaignId).toString() ||
          BigInt(parsed.args.orderId).toString() !== BigInt(intent.orderId).toString() ||
          BigInt(parsed.args.buyerShare).toString() !== BigInt(intent.buyerShare).toString() ||
          BigInt(parsed.args.sellerShare).toString() !== BigInt(intent.sellerShare).toString()
        ) {
          throw new Error("Dispute resolution calldata does not match the operator intent");
        }
        break;
      }
      default:
        throw new Error("Unsupported Circle transaction intent");
    }
  }

  public static async createContractChallenge(input: {
    userId: string;
    userToken: string;
    walletId: string;
    contractAddress: string;
    callData: string;
    intent: CircleTransactionIntent;
    operationId: string;
  }) {
    await this.assertBoundIdentity(input.userId, input.userToken);
    this.assertWalletOwnership(input.userId, input.walletId);
    this.validateTransactionPolicy(input.contractAddress, input.callData, input.intent, input.userId);
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(input.operationId)) {
      throw new Error("A stable operationId is required");
    }

    const payloadHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          userId: input.userId,
          walletId: input.walletId,
          contractAddress: ethers.getAddress(input.contractAddress),
          callData: input.callData.toLowerCase(),
          intent: input.intent,
        })
      )
      .digest("hex");
    const existing = store.db.circleOperations[input.operationId];
    if (existing) {
      if (existing.userId !== input.userId || existing.payloadHash !== payloadHash) {
        throw new Error("operationId is already bound to a different Circle transaction intent");
      }
      if (existing.challengeId) return { challengeId: existing.challengeId };
    }
    const idempotencyKey = existing?.idempotencyKey || stableUuid(`groupdeal:${input.operationId}`);
    store.db.circleOperations[input.operationId] = {
      operationId: input.operationId,
      userId: input.userId,
      walletId: input.walletId,
      payloadHash,
      idempotencyKey,
      createdAt: existing?.createdAt || Date.now(),
    };
    store.save();

    const response = await this.requireClient().createUserTransactionContractExecutionChallenge({
      userToken: input.userToken,
      walletId: input.walletId,
      contractAddress: ethers.getAddress(input.contractAddress),
      callData: input.callData as `0x${string}`,
      fee: { type: "level", config: { feeLevel: "MEDIUM" satisfies FeeLevel } },
      idempotencyKey,
      refId: input.operationId,
      xRequestId: crypto.randomUUID(),
    });
    if (!response.data?.challengeId) {
      throw new Error("Circle did not return a contract execution challenge");
    }
    store.db.circleOperations[input.operationId].challengeId = response.data.challengeId;
    store.save();
    store.addAuditLog(input.userId, "user", "CIRCLE_TRANSACTION_CHALLENGE_CREATED", {
      operationId: input.operationId,
      target: ethers.getAddress(input.contractAddress),
      intentType: input.intent.type,
      challengeId: response.data.challengeId,
    });
    return { challengeId: response.data.challengeId };
  }

  public static async estimateContractFee(input: {
    userId: string;
    userToken: string;
    walletId: string;
    contractAddress: string;
    callData: string;
    intent: CircleTransactionIntent;
  }) {
    await this.assertBoundIdentity(input.userId, input.userToken);
    this.assertWalletOwnership(input.userId, input.walletId);
    this.validateTransactionPolicy(input.contractAddress, input.callData, input.intent, input.userId);
    const response = await this.requireClient().estimateContractExecutionFee({
      userToken: input.userToken,
      contractAddress: ethers.getAddress(input.contractAddress),
      callData: input.callData as `0x${string}`,
      source: { walletId: input.walletId },
      xRequestId: crypto.randomUUID(),
    });
    return response.data;
  }

  public static async getTransaction(userId: string, userToken: string, transactionId: string) {
    await this.assertBoundIdentity(userId, userToken);
    const response = await this.requireClient().getTransaction({
      userToken,
      id: transactionId,
      xRequestId: crypto.randomUUID(),
    });
    return response.data;
  }

  public static async getChallenge(userId: string, userToken: string, challengeId: string) {
    await this.assertBoundIdentity(userId, userToken);
    const response = await this.requireClient().getUserChallenge({
      userToken,
      challengeId,
      xRequestId: crypto.randomUUID(),
    });
    return response.data?.challenge;
  }
}
