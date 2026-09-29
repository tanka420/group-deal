import * as crypto from "crypto";
import { ethers } from "ethers";
import { config } from "../config";

/**
 * AES-256-GCM authenticated encryption for secret digital entitlements.
 */
export function encryptEntitlement(plainText: string, customKey?: string): string {
  const key = crypto
    .createHash("sha256")
    .update(customKey || config.masterEncryptionKey)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptEntitlement(encryptedPayload: string, customKey?: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }
  const [ivHex, authTagHex, cipherText] = parts;
  const key = crypto
    .createHash("sha256")
    .update(customKey || config.masterEncryptionKey)
    .digest();

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let decrypted = decipher.update(cipherText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Derives a cryptographic pseudo-anonymous campaign identity for a user.
 * Cannot be linked cross-campaign or reversed to an email/account ID.
 * Bound to dedicated salt so JWT rotation does not corrupt identities.
 */
export function deriveCampaignIdentity(accountId: string, campaignId: string): string {
  const salt = config.campaignIdentitySecret;
  const payload = `${accountId}:${campaignId}:${salt}`;
  return ethers.keccak256(ethers.toUtf8Bytes(payload));
}

/**
 * Deterministic recursive canonical stringification.
 * Correctly preserves nested tier thresholds, prices, and properties at all depths.
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => JSON.stringify(key) + ":" + canonicalStringify(obj[key])
  );
  return "{" + pairs.join(",") + "}";
}

/**
 * Computes canonical terms hash for contract immutability
 */
export function computeTermsHash(terms: any): string {
  const canonicalString = canonicalStringify(terms);
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalString));
}

/**
 * Generates HMAC-SHA256 signature for seller webhooks
 */
export function signWebhookPayload(payload: string, secret: string, timestamp: number): string {
  const message = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}
