import * as crypto from "crypto";
import { ethers } from "ethers";
import { config } from "../config";
import { store } from "../db/store";

/**
 * AES-256-GCM authenticated encryption for secret digital entitlements.
 */
export function encryptionKey(keyId: string, customKey?: string): Buffer {
  if (!/^[-a-zA-Z0-9_]{1,64}$/.test(keyId)) throw new Error("Invalid encryption key identifier");
  const source = customKey || (keyId === "legacy" ? config.legacyEncryptionKey : keyId === config.masterEncryptionKeyId ? config.masterEncryptionKey : config.previousEncryptionKeys[keyId]);
  if (!source) throw new Error("Encryption key version is unavailable");
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptEntitlement(plainText: string, customKey?: string): string {
  const keyId = customKey ? "custom" : config.masterEncryptionKeyId;
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey(keyId,customKey),iv);
  cipher.setAAD(Buffer.from("groupdeal:entitlement:v2:"+keyId));
  const encrypted=Buffer.concat([cipher.update(plainText,"utf8"),cipher.final()]);
  return ["v2",keyId,iv.toString("hex"),cipher.getAuthTag().toString("hex"),encrypted.toString("hex")].join(":");
}

export function decryptEntitlement(encryptedPayload: string, customKey?: string): string {
  const parts=encryptedPayload.split(":"), versioned=parts[0] === "v2";
  if (versioned ? parts.length !== 5 : parts.length !== 3) throw new Error("Invalid encrypted format");
  const [keyId,ivHex,authTagHex,cipherText] = versioned ? parts.slice(1) : ["legacy",...parts];
  if (!/^[a-f0-9]{24}$/i.test(ivHex) || !/^[a-f0-9]{32}$/i.test(authTagHex) || !/^(?:[a-f0-9]{2})*$/i.test(cipherText)) throw new Error("Invalid encrypted format");
  const key=encryptionKey(keyId,customKey);
  try {
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(ivHex,"hex"));
    if (versioned) decipher.setAAD(Buffer.from("groupdeal:entitlement:v2:"+keyId));
    decipher.setAuthTag(Buffer.from(authTagHex,"hex"));
    return Buffer.concat([decipher.update(Buffer.from(cipherText,"hex")),decipher.final()]).toString("utf8");
  } catch { throw new Error("Encrypted payload authentication failed"); }
}

/**
 * Derives a cryptographic pseudo-anonymous campaign identity for a user.
 * Persisted independently of secret rotation. Public wallet activity remains linkable.
 */
export function deriveCampaignIdentity(accountId: string, campaignId: string): string {
  const key = `${accountId}:${campaignId}`;
  const existing = store.db.campaignIdentities[key];
  if (existing) return existing.identity;
  const legacy = [...new Set(Object.values(store.db.orders).filter(o => o.buyerAccountId === accountId && o.campaignId === campaignId).map(o => o.campaignIdentity))];
  if (legacy.length > 1) throw new Error("Conflicting historical campaign identities require recovery");
  const salt = config.campaignIdentitySecret;
  const payload = `${accountId}:${campaignId}:${salt}`;
  const identity = legacy[0] || ethers.keccak256(ethers.toUtf8Bytes(payload));
  store.db.campaignIdentities[key] = { accountId, campaignId, identity, derivationVersion: 1, createdAt: Date.now() };
  store.save();
  return identity;
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
