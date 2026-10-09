import assert from "node:assert/strict";
import crypto from "node:crypto";
import { config } from "../src/config";
import { encryptEntitlement,decryptEntitlement } from "../src/utils/crypto";

const saved={key:config.masterEncryptionKey,id:config.masterEncryptionKeyId,legacy:config.legacyEncryptionKey,previous:config.previousEncryptionKeys};
try {
  config.masterEncryptionKey="fixture-old-key-000000000000000000";config.masterEncryptionKeyId="key-old";
  const payload="fixture resource access",old=encryptEntitlement(payload);
  const key=crypto.createHash("sha256").update(config.masterEncryptionKey).digest(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);const legacy=[iv.toString("hex"),cipher.getAuthTag().toString("hex"),ciphertext.toString("hex")].join(":");
  config.legacyEncryptionKey=config.masterEncryptionKey;config.previousEncryptionKeys={"key-old":config.masterEncryptionKey};
  config.masterEncryptionKey="fixture-new-key-000000000000000000";config.masterEncryptionKeyId="key-new";
  assert.equal(decryptEntitlement(old),payload);assert.equal(decryptEntitlement(legacy),payload);
  const rotated=encryptEntitlement(decryptEntitlement(old));assert.ok(rotated.startsWith("v2:key-new:"));assert.equal(decryptEntitlement(rotated),payload);
  assert.throws(()=>decryptEntitlement(old.replace("key-old","key-new")),/authentication failed/);
  config.previousEncryptionKeys={};assert.throws(()=>decryptEntitlement(old),/unavailable/);
  console.log("PASS versioned authenticated encryption, legacy decode, retained-key rotation, AAD tamper rejection and missing-version fail closed");
} finally {config.masterEncryptionKey=saved.key;config.masterEncryptionKeyId=saved.id;config.legacyEncryptionKey=saved.legacy;config.previousEncryptionKeys=saved.previous;}
