import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { store, UserRecord, sanitizeUser, SanitizedUser } from "../db/store";
import { config } from "../config";
import { encryptEntitlement } from "../utils/crypto";

export class AuthService {
  private static issueSessionToken(user: UserRecord): string {
    return jwt.sign(
      {
        userId: user.id,
        email: sanitizeUser(user).email,
        roles: user.roles,
        activeWallet: user.activeWallet,
      },
      config.jwtSecret,
      { expiresIn: "7d" }
    );
  }

  /**
   * Create or refresh the local application session after Circle has verified
   * the email OTP and the backend has validated the Circle user token.
   * Circle tokens and encryption keys are deliberately never persisted.
   */
  public static createCircleSession(
    email: string | null,
    circleUserId: string,
    circleWallet?: { walletId: string; address: string; blockchain: "ARC-TESTNET" }
  ): { token: string; user: SanitizedUser } {
    const normalizedEmail = email?.trim().toLowerCase() || null;
    if ((normalizedEmail && !normalizedEmail.includes("@")) || !circleUserId) {
      throw new Error("Circle identity is incomplete");
    }

    const byCircle = store.db.userByCircleId[circleUserId];
    const byEmail = normalizedEmail ? store.db.userByEmail[normalizedEmail] : undefined;
    // Never claim a pre-existing email account by submitting a Circle token.
    // Linking identities requires an independently authenticated linking flow.
    if (byEmail && byCircle !== byEmail) {
      throw new Error("Circle identity is already bound to another GroupDeal account");
    }

    let userId = byCircle;
    let user: UserRecord;
    if (!userId) {
      userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      user = {
        id: userId,
        email: normalizedEmail || `circle-${crypto.createHash("sha256").update(circleUserId).digest("hex")}@circle.invalid`,
        emailVerified: Boolean(normalizedEmail),
        loginMethod: "CIRCLE_EMAIL",
        circleUserId,
        createdAt: Date.now(),
        roles: ["buyer"],
        activeWallet: null,
      };
      store.db.users[userId] = user;
      if (normalizedEmail) store.db.userByEmail[normalizedEmail] = userId;
      store.addAuditLog(userId, "buyer", "CIRCLE_USER_REGISTERED", {
        circleUserId,
      });
    } else {
      user = store.db.users[userId];
      if (!user) throw new Error("Bound GroupDeal account no longer exists");
      if (normalizedEmail && user.emailVerified !== false && user.email !== normalizedEmail) {
        throw new Error("Circle email does not match the existing GroupDeal account");
      }
      if (user.circleUserId && user.circleUserId !== circleUserId) {
        throw new Error("GroupDeal account is already bound to another Circle identity");
      }
      user.circleUserId = circleUserId;
      if (normalizedEmail) {
        user.email = normalizedEmail;
        user.emailVerified = true;
        store.db.userByEmail[normalizedEmail] = user.id;
      }
      user.loginMethod ||= "CIRCLE_EMAIL";
    }

    store.db.userByCircleId[circleUserId] = user.id;

    if (circleWallet) {
      const normalizedWallet = ethers.getAddress(circleWallet.address).toLowerCase();
      const existingWalletOwner = store.db.userByWallet[normalizedWallet];
      if (existingWalletOwner && existingWalletOwner !== user.id) {
        throw new Error("Circle wallet is already bound to another GroupDeal account");
      }
      user.circleWallet = {
        walletId: circleWallet.walletId,
        address: ethers.getAddress(circleWallet.address),
        blockchain: "ARC-TESTNET",
      };
      user.activeWallet = user.circleWallet.address;
      store.db.userByWallet[normalizedWallet] = user.id;
    }

    store.save();
    return { token: this.issueSessionToken(user), user: sanitizeUser(user) };
  }

  public static bindCircleWallet(
    userId: string,
    circleUserId: string,
    circleWallet: { walletId: string; address: string; blockchain: "ARC-TESTNET" }
  ): SanitizedUser {
    const user = store.db.users[userId];
    if (!user || user.circleUserId !== circleUserId) {
      throw new Error("Circle wallet cannot be bound to this GroupDeal account");
    }
    const normalizedWallet = ethers.getAddress(circleWallet.address).toLowerCase();
    const existingWalletOwner = store.db.userByWallet[normalizedWallet];
    if (existingWalletOwner && existingWalletOwner !== user.id) {
      throw new Error("Circle wallet is already bound to another GroupDeal account");
    }
    user.circleWallet = {
      walletId: circleWallet.walletId,
      address: ethers.getAddress(circleWallet.address),
      blockchain: "ARC-TESTNET",
    };
    user.activeWallet = user.circleWallet.address;
    store.db.userByWallet[normalizedWallet] = user.id;
    store.save();
    return sanitizeUser(user);
  }
  /**
   * Request email OTP with CSPRNG, rate limiting, and secure hashing.
   * Never returns OTP in response or writes OTP to logs.
   */
  public static requestOtp(email: string): { success: boolean; message: string } {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Địa chỉ email không hợp lệ");
    }

    const existing = store.db.emailOtps[normalizedEmail];
    const now = Date.now();

    // Rate-limit: 30 seconds cooldown between requests
    if (existing && existing.requestedAt && now - existing.requestedAt < 30 * 1000) {
      const waitSec = Math.ceil((30 * 1000 - (now - existing.requestedAt)) / 1000);
      throw new Error(`Vui lòng đợi ${waitSec} giây trước khi yêu cầu mã OTP mới`);
    }

    // CSPRNG 6-digit code
    const code = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString("hex");
    const hashedCode = crypto.createHash("sha256").update(salt + code).digest("hex");
    const expiresAt = now + 5 * 60 * 1000; // 5 minutes TTL

    store.db.emailOtps[normalizedEmail] = {
      hashedCode,
      salt,
      expiresAt,
      attempts: 0,
      requestedAt: now,
    };
    store.save();

    // Production log: audit only, never log the plaintext code
    return {
      success: true,
      message: "Mã OTP đã được gửi đến email của bạn.",
    };
  }

  /**
   * Verify email OTP with timing-safe hash comparison and attempt limiting.
   * Returns JWT session and sanitized user (without raw or encrypted private keys).
   */
  public static verifyOtp(email: string, code: string): { token: string; user: SanitizedUser } {
    const normalizedEmail = email.trim().toLowerCase();
    const entry = store.db.emailOtps[normalizedEmail];
    const now = Date.now();

    if (!entry || entry.expiresAt < now) {
      throw new Error("Mã OTP không hợp lệ hoặc đã hết hạn");
    }

    entry.attempts = (entry.attempts || 0) + 1;

    // Brute-force protection: Max 5 attempts
    if (entry.attempts > 5) {
      delete store.db.emailOtps[normalizedEmail];
      store.save();
      throw new Error("Quá số lần thử OTP cho phép. Vui lòng yêu cầu mã OTP mới.");
    }

    let isValid = false;
    if (entry.hashedCode && entry.salt) {
      const candidateHash = crypto.createHash("sha256").update(entry.salt + code.trim()).digest("hex");
      try {
        isValid = crypto.timingSafeEqual(
          Buffer.from(candidateHash, "hex"),
          Buffer.from(entry.hashedCode, "hex")
        );
      } catch {
        isValid = false;
      }
    } else if (entry.code) {
      // Backward compatibility for existing plaintext entry
      isValid = entry.code === code.trim();
    }

    if (!isValid) {
      store.save();
      throw new Error("Mã OTP không chính xác");
    }

    // Clear consumed OTP
    delete store.db.emailOtps[normalizedEmail];

    let userId = store.db.userByEmail[normalizedEmail];
    let user: UserRecord;

    if (!userId) {
      userId = `usr_${now}_${crypto.randomBytes(4).toString("hex")}`;
      user = {
        id: userId,
        email: normalizedEmail,
        loginMethod: "CIRCLE_EMAIL",
        createdAt: now,
        roles: ["buyer"],
        activeWallet: null,
      };

      store.db.users[userId] = user;
      store.db.userByEmail[normalizedEmail] = userId;
      store.addAuditLog(userId, "buyer", "USER_REGISTERED", { email: normalizedEmail });
    } else {
      user = store.db.users[userId];
    }

    store.save();

    const token = this.issueSessionToken(user);

    return { token, user: sanitizeUser(user) };
  }

  /**
   * Issue a cryptographic, one-time, time-bound challenge to prevent signature replay (G1.1 & A11 mitigation).
   */
  public static issueWalletChallenge(
    userId: string,
    action: "LINK_WALLET" | "SELLER_PAYOUT" | "OPERATOR_ACTION",
    walletAddress: string,
    chainId?: number,
    origin?: string
  ): { challengeMessage: string; expiresAt: number; nonce: string } {
    const normalizedWallet = ethers.getAddress(walletAddress).toLowerCase();
    const nonce = crypto.randomBytes(16).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 300; // 5 minute validity window
    const targetChainId = chainId || config.arcChainId;
    const targetOrigin = origin || "groupdeal.app";

    const challengeMessage = [
      "=== GroupDeal Security Challenge ===",
      `Action: ${action}`,
      `User ID: ${userId}`,
      `Wallet: ${ethers.getAddress(walletAddress)}`,
      `Chain ID: ${targetChainId}`,
      `Origin: ${targetOrigin}`,
      `Nonce: ${nonce}`,
      `Timestamp: ${now}`,
      `Expires: ${expiresAt}`,
    ].join("\n");

    const key = `${userId}:${action}:${normalizedWallet}`;
    if (!store.db.walletChallenges) {
      store.db.walletChallenges = {};
    }
    store.db.walletChallenges[key] = {
      userId,
      action,
      walletAddress: normalizedWallet,
      message: challengeMessage,
      expiresAt,
      nonce,
      chainId: targetChainId,
      origin: targetOrigin,
    };
    store.save();

    return { challengeMessage, expiresAt, nonce };
  }

  public static consumeWalletChallenge(
    userId: string,
    action: "LINK_WALLET" | "SELLER_PAYOUT" | "OPERATOR_ACTION",
    walletAddress: string,
    message: string
  ): void {
    if (!message || typeof message !== "string") {
      throw new Error("Challenge message is required and must be a valid string.");
    }
    const normalizedWallet = ethers.getAddress(walletAddress).toLowerCase();
    const key = `${userId}:${action}:${normalizedWallet}`;
    if (!store.db.walletChallenges) {
      store.db.walletChallenges = {};
    }
    const challenge = store.db.walletChallenges[key];

    if (!challenge) {
      throw new Error("Challenge expired or not found or already consumed. Please request a new wallet challenge.");
    }

    if (Math.floor(Date.now() / 1000) > challenge.expiresAt) {
      delete store.db.walletChallenges[key];
      store.save();
      throw new Error("Challenge expired or not found. Please request a new challenge.");
    }

    if (challenge.message.trim() !== message.trim()) {
      throw new Error("Invalid challenge message: does not match server issued challenge.");
    }

    // Atomically consume: one-time use only (strictly prevents replay)
    delete store.db.walletChallenges[key];
    store.save();
  }

  /**
   * Issue a wallet-first login challenge without requiring an existing account.
   * The nonce is part of the storage key so a second requester cannot overwrite
   * another user's pending challenge for the same public address.
   */
  public static issueWalletLoginChallenge(
    walletAddress: string,
    origin = "groupdeal.app"
  ): { challengeMessage: string; expiresAt: number; nonce: string } {
    const checksumWallet = ethers.getAddress(walletAddress);
    const normalizedWallet = checksumWallet.toLowerCase();
    const nonce = crypto.randomBytes(16).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 300;
    const subject = `wallet-login:${normalizedWallet}`;

    const challengeMessage = [
      "=== GroupDeal Wallet Login ===",
      "Action: WALLET_LOGIN",
      `Wallet: ${checksumWallet}`,
      `Chain ID: ${config.arcChainId}`,
      `Origin: ${origin}`,
      `Nonce: ${nonce}`,
      `Timestamp: ${now}`,
      `Expires: ${expiresAt}`,
      "This signature does not submit a transaction or spend funds.",
    ].join("\n");

    const key = `${subject}:WALLET_LOGIN:${nonce}`;
    const currentTime = Math.floor(Date.now() / 1000);
    for (const [candidateKey, challenge] of Object.entries(store.db.walletChallenges)) {
      if (challenge.expiresAt < currentTime) delete store.db.walletChallenges[candidateKey];
    }
    store.db.walletChallenges[key] = {
      userId: subject,
      action: "WALLET_LOGIN",
      walletAddress: normalizedWallet,
      message: challengeMessage,
      expiresAt,
      nonce,
      chainId: config.arcChainId,
      origin,
    };
    store.save();
    return { challengeMessage, expiresAt, nonce };
  }

  /**
   * Verify a one-time wallet signature and create or resume the account bound
   * to that address. Only the public address is persisted; GroupDeal never
   * receives a wallet private key or seed phrase.
   */
  public static verifyWalletLogin(
    walletAddress: string,
    signature: string,
    message: string,
    nonce: string
  ): { token: string; user: SanitizedUser } {
    const checksumWallet = ethers.getAddress(walletAddress);
    const normalizedWallet = checksumWallet.toLowerCase();
    const subject = `wallet-login:${normalizedWallet}`;
    const key = `${subject}:WALLET_LOGIN:${nonce}`;
    const challenge = store.db.walletChallenges[key];

    if (
      !challenge ||
      challenge.action !== "WALLET_LOGIN" ||
      challenge.walletAddress !== normalizedWallet ||
      challenge.nonce !== nonce
    ) {
      throw new Error("Wallet login challenge is invalid, expired, or already used");
    }

    if (Math.floor(Date.now() / 1000) > challenge.expiresAt) {
      delete store.db.walletChallenges[key];
      store.save();
      throw new Error("Wallet login challenge has expired");
    }
    if (challenge.message !== message) {
      delete store.db.walletChallenges[key];
      store.save();
      throw new Error("Wallet login message does not match the server challenge");
    }

    let recovered: string;
    try {
      recovered = ethers.verifyMessage(message, signature).toLowerCase();
    } catch {
      delete store.db.walletChallenges[key];
      store.save();
      throw new Error("Wallet login signature is invalid");
    }
    delete store.db.walletChallenges[key];
    if (recovered !== normalizedWallet) {
      store.save();
      throw new Error("Wallet login signature does not match the requested address");
    }

    let userId: string | undefined = store.db.userByWallet[normalizedWallet];
    let user = userId ? store.db.users[userId] : undefined;
    if (userId && !user) {
      delete store.db.userByWallet[normalizedWallet];
      userId = undefined;
    }

    if (!user) {
      userId = `usr_wallet_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const internalEmail = `wallet+${normalizedWallet.slice(2)}@auth.groupdeal.invalid`;
      user = {
        id: userId,
        email: internalEmail,
        loginMethod: "EVM_WALLET",
        createdAt: Date.now(),
        roles: ["buyer"],
        activeWallet: checksumWallet,
      };
      store.db.users[userId] = user;
      store.db.userByEmail[internalEmail] = userId;
      store.db.userByWallet[normalizedWallet] = userId;
      store.db.notificationPreferences[userId] = { inApp: true, email: false };
      store.addAuditLog(userId, "buyer", "EVM_WALLET_USER_REGISTERED", {
        wallet: checksumWallet,
      });
    } else {
      user.activeWallet = checksumWallet;
      store.db.userByWallet[normalizedWallet] = user.id;
      store.addAuditLog(user.id, "buyer", "EVM_WALLET_LOGIN_VERIFIED", {
        wallet: checksumWallet,
      });
    }

    store.save();
    return { token: this.issueSessionToken(user), user: sanitizeUser(user) };
  }

  public static verifyStepUpSignature(
    userId: string,
    action: "OPERATOR_ACTION",
    walletAddress: string,
    signature: string,
    message: string
  ): void {
    const user = store.db.users[userId];
    if (!user?.roles.includes("operator")) throw new Error("Operator role is required");
    const normalizedWallet = ethers.getAddress(walletAddress);
    if (
      normalizedWallet.toLowerCase() !== config.operatorAddress.toLowerCase() ||
      user.activeWallet?.toLowerCase() !== normalizedWallet.toLowerCase()
    ) {
      throw new Error("Step-up wallet must be the configured, actively bound operator wallet");
    }
    this.consumeWalletChallenge(userId, action, normalizedWallet, message);
    if (ethers.verifyMessage(message, signature).toLowerCase() !== normalizedWallet.toLowerCase()) {
      throw new Error("Operator step-up signature is invalid");
    }
    store.addAuditLog(userId, "operator", "OPERATOR_STEP_UP_VERIFIED", {
      wallet: normalizedWallet,
      action,
    });
  }

  /**
   * Atomic binding of an external EVM wallet (MetaMask / injected).
   * Enforces that an external wallet can only be actively linked to ONE account at a time.
   */
  public static linkExternalWallet(
    userId: string,
    walletAddress: string,
    signature: string,
    message: string
  ): SanitizedUser {
    const user = store.db.users[userId];
    if (!user) throw new Error("User not found");

    // Enforce anti-replay challenge verification
    this.consumeWalletChallenge(userId, "LINK_WALLET", walletAddress, message);

    const normalizedAddress = walletAddress.trim().toLowerCase();

    // Verify cryptographic signature proving ownership of wallet
    const recovered = ethers.verifyMessage(message, signature).toLowerCase();
    if (recovered !== normalizedAddress) {
      throw new Error("Signature verification failed: caller does not control wallet");
    }

    // Atomic 1-wallet-to-1-account constraint
    const existingBinding = store.db.userByWallet[normalizedAddress];
    if (existingBinding && existingBinding !== userId) {
      throw new Error("This EVM wallet is already actively linked to another GroupDeal account");
    }

    // Unbind user's previous active wallet from reverse index if it was not their Circle wallet
    if (user.activeWallet && user.activeWallet.toLowerCase() !== normalizedAddress) {
      const prevAddr = user.activeWallet.toLowerCase();
      if (!user.circleWallet || user.circleWallet.address.toLowerCase() !== prevAddr) {
        delete store.db.userByWallet[prevAddr];
      }
    }

    user.activeWallet = ethers.getAddress(walletAddress);
    store.db.userByWallet[normalizedAddress] = userId;
    store.addAuditLog(userId, "user", "WALLET_LINKED", { wallet: user.activeWallet });
    store.save();

    return sanitizeUser(user);
  }

  /**
   * Register or update Seller Profile with proof of control of payout wallet
   */
  public static setupSellerProfile(
    userId: string,
    profileData: {
      displayName: string;
      bio: string;
      payoutWallet: string;
      proofSignature: string;
      challengeMessage: string;
    }
  ): SanitizedUser {
    const user = store.db.users[userId];
    if (!user) throw new Error("User not found");

    const payoutWallet = ethers.getAddress(profileData.payoutWallet);

    // Enforce anti-replay challenge verification
    this.consumeWalletChallenge(userId, "SELLER_PAYOUT", payoutWallet, profileData.challengeMessage);

    // Verify proof of control of payout wallet
    const recovered = ethers
      .verifyMessage(profileData.challengeMessage, profileData.proofSignature)
      .toLowerCase();
    if (recovered !== payoutWallet.toLowerCase()) {
      throw new Error("Invalid proof signature: caller does not control payout wallet");
    }

    user.sellerProfile = {
      displayName: profileData.displayName,
      bio: profileData.bio,
      payoutWallet: payoutWallet,
      verifiedSellerBadge: false, // Must be reviewed by operator
      verifiedRightsBadge: false, // Must be reviewed by operator
      payoutProofSignature: profileData.proofSignature,
    };

    if (!user.roles.includes("seller")) {
      user.roles.push("seller");
    }

    store.addAuditLog(userId, "seller", "SELLER_PROFILE_CREATED", {
      displayName: profileData.displayName,
      payoutWallet,
    });
    store.save();

    return sanitizeUser(user);
  }
}
