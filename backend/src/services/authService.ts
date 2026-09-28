import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { store, UserRecord } from "../db/store";
import { config } from "../config";

export class AuthService {
  /**
   * Request email OTP
   */
  public static requestOtp(email: string): { success: boolean; message: string; code?: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    store.db.emailOtps[normalizedEmail] = { code, expiresAt };
    store.save();

    console.log(`[AUTH] OTP for ${normalizedEmail}: ${code}`);
    return {
      success: true,
      message: "OTP sent to your email",
      code, // returned in development for seamless user experience
    };
  }

  /**
   * Verify email OTP and return JWT session
   */
  public static verifyOtp(email: string, code: string): { token: string; user: UserRecord } {
    const normalizedEmail = email.trim().toLowerCase();
    const entry = store.db.emailOtps[normalizedEmail];

    if (!entry || entry.code !== code || entry.expiresAt < Date.now()) {
      throw new Error("Invalid or expired OTP code");
    }

    // Clear used OTP
    delete store.db.emailOtps[normalizedEmail];

    let userId = store.db.userByEmail[normalizedEmail];
    let user: UserRecord;

    if (!userId) {
      userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      // Generate a Circle user-controlled EOA wallet automatically
      const wallet = ethers.Wallet.createRandom();

      user = {
        id: userId,
        email: normalizedEmail,
        createdAt: Date.now(),
        roles: ["buyer"],
        activeWallet: wallet.address,
        circleWallet: {
          address: wallet.address,
          encryptedPrivateKey: wallet.privateKey,
        },
      };

      store.db.users[userId] = user;
      store.db.userByEmail[normalizedEmail] = userId;
      store.db.userByWallet[wallet.address.toLowerCase()] = userId;
      store.addAuditLog(userId, "buyer", "USER_REGISTERED", { email: normalizedEmail, wallet: wallet.address });
    } else {
      user = store.db.users[userId];
    }

    store.save();

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roles: user.roles,
        activeWallet: user.activeWallet,
      },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    return { token, user };
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
  ): UserRecord {
    const user = store.db.users[userId];
    if (!user) throw new Error("User not found");

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

    return user;
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
  ): UserRecord {
    const user = store.db.users[userId];
    if (!user) throw new Error("User not found");

    const payoutWallet = ethers.getAddress(profileData.payoutWallet);
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

    return user;
  }
}
