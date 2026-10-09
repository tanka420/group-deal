import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ethers } from "ethers";
import { store,TransactionalStore } from "../src/db/store";
import { BackupService } from "../src/services/backupService";
import { config } from "../src/config";
import { reviewedProductVerified } from "./fixtures/product";
import { ResourceDeliveryService } from "../src/services/resourceDeliveryService";
import { encryptEntitlement,decryptEntitlement } from "../src/utils/crypto";

import { restoreShadowBackup } from "../scripts/restoreShadowBackup";

async function main() {
const saved={key:config.masterEncryptionKey,id:config.masterEncryptionKeyId,previous:config.previousEncryptionKeys,legacy:config.legacyEncryptionKey};
const backupDir=fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-backup-drill-")),target=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-restore-drill-")));
try {
  config.masterEncryptionKey="fixture-backup-old-key-00000000000";config.masterEncryptionKeyId="backup-old";
  const product=await reviewedProductVerified("seller",ethers.Wallet.createRandom().address),bytes=Buffer.from("Complete protected resource restored after rotation.\n");
  const resource=ResourceDeliveryService.upload("seller",product.version.id,"restored-resource.txt","text/plain",bytes);
  store.db.orders.existing={id:"existing",buyerAccountId:"buyer",deliveredEntitlementEncrypted:encryptEntitlement("fixture private access"),productSnapshot:product.snapshot} as any;
  store.save();
  const backup=BackupService.createEncryptedBackup(backupDir,store),before=structuredClone(store.db);
  const raw=fs.readFileSync(backup.backupPath,"utf8");assert.ok(!raw.includes("fixture private access"));assert.ok(!raw.includes(bytes.toString()));
  config.previousEncryptionKeys={"backup-old":config.masterEncryptionKey};config.legacyEncryptionKey=config.masterEncryptionKey;
  config.masterEncryptionKey="fixture-backup-new-key-00000000000";config.masterEncryptionKeyId="backup-new";
  const read=BackupService.readEncryptedBackup(backup.backupPath);assert.equal(read.checksum,backup.checksum);
  const drill=await restoreShadowBackup(backup.backupPath,false,undefined,"LOCAL_FIXTURE"),proof=JSON.parse(fs.readFileSync(drill.evidence,"utf8"));
  assert.equal(drill.status,"RESTORE_VERIFIED");assert.equal(proof.inputScope,"LOCAL_FIXTURE");assert.equal(proof.acceptanceEligible,false);assert.equal(proof.promoted,false);assert.equal(proof.sqliteIntegrity,"ok");assert.equal(proof.restore.preservedOriginalFields,true);
  const drillStore=new TransactionalStore(drill.targetDirectory);
  try {assert.deepEqual(drillStore.db.resources,read.data.resources);assert.deepEqual(drillStore.db.orders,read.data.orders);} finally {drillStore.close();}
  const restored=BackupService.restoreEncryptedBackup(backup.backupPath,target);assert.equal(restored.restored,true);
  for(const collection of ["users","products","productVersions","licenseVersions","rights","orders","resources","campaignIdentities","operations"] as const)assert.deepEqual(target.db[collection],read.data[collection]);
  assert.deepEqual(store.db,before,"Restore into a shadow cannot modify the source store");
  assert.equal(decryptEntitlement(target.db.orders.existing.deliveredEntitlementEncrypted!),"fixture private access");
  assert.deepEqual(Buffer.from(decryptEntitlement(target.db.resources[resource.id].encryptedPayload),"base64"),bytes);
  assert.throws(()=>BackupService.restoreEncryptedBackup(backup.backupPath,{isIsolated:false} as any),/SHADOW_REQUIRED/);
  const targetBefore=structuredClone(target.db),tampered=JSON.parse(raw);tampered.keyId="backup-new";
  const tamperedPath=path.join(backupDir,"tampered.enc");fs.writeFileSync(tamperedPath,JSON.stringify(tampered));
  assert.throws(()=>BackupService.restoreEncryptedBackup(tamperedPath,target));assert.deepEqual(target.db,targetBefore);
  config.previousEncryptionKeys={};assert.throws(()=>BackupService.readEncryptedBackup(backup.backupPath),/unavailable/);
  config.previousEncryptionKeys={"backup-old":saved.key}; // Deliberately wrong material is rejected by authentication.
  assert.throws(()=>BackupService.readEncryptedBackup(backup.backupPath));
  // Historical v1 backups retain their scrypt format and are read independently of the new active key.
  const data=JSON.stringify(before),iv=crypto.randomBytes(12),key=crypto.scryptSync(config.legacyEncryptionKey,"groupdeal-backup-salt-2026",32),cipher=crypto.createCipheriv("aes-256-gcm",key,iv),ciphertext=Buffer.concat([cipher.update(data),cipher.final()]);
  const legacyPath=path.join(backupDir,"legacy.enc");fs.writeFileSync(legacyPath,JSON.stringify({version:1,timestamp:Date.now(),checksum:crypto.createHash("sha256").update(data).digest("hex"),ivHex:iv.toString("hex"),authTagHex:cipher.getAuthTag().toString("hex"),encryptedDataHex:ciphertext.toString("hex")}));
  assert.deepEqual(BackupService.readEncryptedBackup(legacyPath).data,before);
  console.log("PASS committed encrypted backup, retained-key/legacy recovery, real resource bytes and immutable metadata, shadow-only restore and tamper rollback");
} finally {config.masterEncryptionKey=saved.key;config.masterEncryptionKeyId=saved.id;config.previousEncryptionKeys=saved.previous;config.legacyEncryptionKey=saved.legacy;target.close();store.close();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
