import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { store,TransactionalStore } from "../src/db/store";
import { IndexerService } from "../src/services/indexerService";
import { ReconciliationService } from "../src/services/reconciliationService";
import { BackupService } from "../src/services/backupService";
import { WebhookService } from "../src/services/webhookService";
import { config } from "../src/config";
import { HUB_ABI } from "../src/services/onchainService";
import { reconciliationProvider } from "./fixtures/reconciliation";

import { eventProvider } from "./fixtures/events";

async function runGateG3VerificationTests() {
  assert.strictEqual(process.env.NODE_ENV,"test");assert.ok(store.isIsolated,"G3 requires an isolated fixture store");
  console.log("=================================================");
  console.log("=== GATE G3 INTEGRATION & VERIFICATION TESTS ===");
  console.log("=================================================\n");

  const iface = new ethers.Interface(HUB_ABI);
  const testHubAddress = config.hubAddress;
  const testChainId = config.arcChainId;
  config.deploymentBlock=1;
  const creationCalldata=iface.encodeFunctionData("createCampaign",[{sellerPayoutWallet:"0x70997970C51812dc3A010C7d01b50e0d17dc79C8",metric:0,maxPerAccount:10,inventoryLimit:100,durationSeconds:1000,deliverySlaSeconds:86400,earlyRebateEnabled:true,earlySlotsCount:10,earlyRebateAmount:10_000_000,earlyRebateBps:0,platformFeeBps:0,termsHash:ethers.id("canonical_terms_v1")},[{threshold:1,price:100_000_000},{threshold:2,price:90_000_000}]]);

  // ---------------------------------------------------------------------------
  // [G3.1] Store Migrations, Unique Indexes & Tamper-Evident Audit Chain
  // ---------------------------------------------------------------------------
  console.log("[G3.1] Testing Store Migrations & Tamper-Evident Audit Hash Chain:");

  // Test migration runner
  const migrationResult = store.runMigrations();
  assert.ok(migrationResult.currentVersion >= 3, "Migrations should advance schema to version 3");
  console.log(`✔ Store migrations applied successfully (Current schema version: ${migrationResult.currentVersion})`);

  // Test audit hash chain integrity
  store.db.auditLogs = [];
  const log1 = store.addAuditLog("usr_operator", "operator", "CONFIG_UPDATE", { param: "sla", val: 86400 });
  const log2 = store.addAuditLog("usr_seller", "seller", "PROFILE_UPDATE", { displayName: "SuperStore" });
  const log3 = store.addAuditLog("usr_buyer", "buyer", "DISPUTE_OPENED", { orderId: "101" });

  assert.strictEqual(store.db.auditLogs.length, 3, "Should have 3 audit records");
  assert.strictEqual(log3.prevHash, log2.hash, "Hash chain link must connect log3 to log2");
  assert.strictEqual(log2.prevHash, log1.hash, "Hash chain link must connect log2 to log1");

  let integrityCheck = store.verifyAuditLogIntegrity();
  assert.strictEqual(integrityCheck.valid, true, "Untampered audit log chain must pass verification");
  console.log("✔ Tamper-evident audit log SHA-256 hash chain verified");

  // Simulate tampering
  const originalDetails = store.db.auditLogs[1].details;
  store.db.auditLogs[1].details = { displayName: "HACKED_STORE" }; // Tamper with log2
  integrityCheck = store.verifyAuditLogIntegrity();
  assert.strictEqual(integrityCheck.valid, false, "Tampered audit log entry must fail integrity verification");
  assert.strictEqual(integrityCheck.brokenAtId, store.db.auditLogs[1].id, "Integrity check must identify broken log ID");
  console.log("✔ Tamper detection verified: Altering an audit entry broke the cryptographic chain as expected");

  // Restore untampered state
  store.db.auditLogs[1].details = originalDetails;
  assert.strictEqual(store.verifyAuditLogIntegrity().valid, true);

  // ---------------------------------------------------------------------------
  // [G3.2] Arc Deterministic Indexer: Sorting, Idempotency & Clean Rebuild
  // ---------------------------------------------------------------------------
  console.log("\n[G3.2] Testing Arc Deterministic Indexer:");

  // Reset store for indexer testing
  store.transaction(()=>{
  store.db.campaigns = {};
  store.db.orders = {};
  store.db.eventJournal = {};
  store.db.syncState = { lastIndexedBlock: 0, lastSyncTimestamp: 0 };
  });

  // Prepare test events
  const campaignCreatedFragment = iface.getEvent("CampaignCreated")!;
  const commitmentMadeFragment = iface.getEvent("CommitmentMade")!;
  const tierUnlockedFragment = iface.getEvent("TierUnlocked")!;
  const campaignFinalizedFragment = iface.getEvent("CampaignFinalized")!;
  const deliveryRecordedFragment = iface.getEvent("DeliveryRecorded")!;
  const orderConfirmedFragment = iface.getEvent("OrderConfirmed")!;

  const sellerPayout = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const buyerPrincipal = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  const encCampaignCreated = iface.encodeEventLog(campaignCreatedFragment, [
    1n, // campaignId
    sellerPayout, // sellerPayoutWallet
    ethers.keccak256(ethers.toUtf8Bytes("canonical_terms_v1")), // termsHash
    0, // metric (BUYER_COUNT = 0)
    1000n, // startTime
    2000n, // endTime
    100n, // inventoryLimit
  ]);

  const logCampaignCreated = {
    address: testHubAddress,
    blockNumber: 100,
    blockHash: ethers.id("block-100"),
    transactionIndex: 0,
    transactionHash: ethers.id("0xtx_create_campaign"),
    index: 0,
    topics: encCampaignCreated.topics,
    data: encCampaignCreated.data,
  };

  const encCommitment1 = iface.encodeEventLog(commitmentMadeFragment, [
    1n, // campaignId
    1n, // orderId
    ethers.keccak256(ethers.toUtf8Bytes("campaign_identity_1")), // campaignIdentity
    buyerPrincipal, // buyerPrincipal
    2n, // quantity
    100_000_000n, // lockedUnitPrice = 100 USDC
    200_000_000n, // committedGross = 200 USDC
    true, // isEarlySupporter
    10_000_000n, // earlyRebateValue = 10 USDC
  ]);

  const logCommitment1 = {
    address: testHubAddress,
    blockNumber: 105,
    blockHash: ethers.id("block-105"),
    transactionIndex: 0,
    transactionHash: ethers.id("0xtx_commit_order_1"),
    index: 0,
    topics: encCommitment1.topics,
    data: encCommitment1.data,
  };

  const encTierUnlocked = iface.encodeEventLog(tierUnlockedFragment, [
    1n, // campaignId
    1, // tierIndex
    2n, // threshold
    90_000_000n, // price = 90 USDC
  ]);

  const logTierUnlocked = {
    address: testHubAddress,
    blockNumber: 105,
    blockHash: ethers.id("block-105"),
    transactionIndex: 0,
    transactionHash: ethers.id("0xtx_commit_order_1"),
    index: 1,
    topics: encTierUnlocked.topics,
    data: encTierUnlocked.data,
  };

  const encCampaignFinalized = iface.encodeEventLog(campaignFinalizedFragment, [
    1n, // campaignId
    90_000_000n, // finalClearingPrice = 90 USDC
    1, // finalTierIndex
    200_000_000n, // totalCommitted = 200 USDC
    2n, // totalUnits = 2
  ]);

  const logCampaignFinalized = {
    address: testHubAddress,
    blockNumber: 110,
    blockHash: ethers.id("block-110"),
    transactionIndex: 0,
    transactionHash: ethers.id("0xtx_finalize"),
    index: 0,
    topics: encCampaignFinalized.topics,
    data: encCampaignFinalized.data,
  };

  const encDelivery = iface.encodeEventLog(deliveryRecordedFragment, [
    1n, // campaignId
    1n, // orderId
    ethers.keccak256(ethers.toUtf8Bytes("delivery_license_key_secret")), // proofHash
    1500n, // deliveryTimestamp
    1500n + 172800n, // disputeDeadline
  ]);

  const logDelivery = {
    address: testHubAddress,
    blockNumber: 115,
    blockHash: ethers.id("block-115"),
    transactionIndex: 0,
    transactionHash: ethers.id("0xtx_delivery"),
    index: 0,
    topics: encDelivery.topics,
    data: encDelivery.data,
  };

  const encOrderConfirmed = iface.encodeEventLog(orderConfirmedFragment, [
    1n, // campaignId
    1n, // orderId
    170_000_000n, // sellerProceeds = 170 USDC
  ]);

  const logOrderConfirmed = {
    address: testHubAddress,
    blockNumber: 120,
    blockHash: ethers.id("block-120"),
    transactionIndex: 0,
    transactionHash: ethers.id("0xtx_confirm"),
    index: 0,
    topics: encOrderConfirmed.topics,
    data: encOrderConfirmed.data,
  };

  // Test Out-Of-Order Event Sorting: feed logs shuffled
  const shuffledLogs = [
    logDelivery,
    logCampaignCreated,
    logOrderConfirmed,
    logTierUnlocked,
    logCampaignFinalized,
    logCommitment1,
  ];

  IndexerService.setProvider(eventProvider(shuffledLogs,{[logCampaignCreated.transactionHash]:{data:creationCalldata}},block=>block*10));
  await IndexerService.processLogs(shuffledLogs);

  // Check state projections
  const campaign = store.db.campaigns["1"];
  assert.ok(campaign, "Synthesized onchain campaign must exist");
  assert.strictEqual(campaign.status, "FINALIZED", "Campaign must have processed through to FINALIZED");
  assert.strictEqual(campaign.currentUnlockedTier, 1, "Tier 1 must be unlocked");
  assert.strictEqual(campaign.totalBuyerCount, 1, "Buyer count must be 1");
  assert.strictEqual(campaign.totalUnitsCommitted, 2, "Units committed must be 2");

  const order = store.db.orders["1"];
  assert.ok(order, "Order 1 must exist");
  assert.strictEqual(order.deliveryStatus, "CONFIRMED", "Order must reach CONFIRMED delivery status");
  assert.strictEqual(order.rebateAllocated, "30000000", "Rebate must equal (100-90)*2 + 10 early = 30 USDC");
  assert.strictEqual(order.sellerAllocated, "170000000", "Seller proceeds must equal 170 USDC");
  console.log("✔ Out-of-order logs deterministically sorted by (block, txIndex, logIndex) and processed");

  // Test Idempotency: re-processing identical logs must be skipped
  const eventKeysBefore = Object.keys(store.db.eventJournal);
  assert.strictEqual(eventKeysBefore.length, 6, "Must have exactly 6 indexed journal records");
  
  // Verify journal key format: `${chainId}_${emitter}_${txHash}_${logIndex}`
  for (const k of eventKeysBefore) {
    const parts = k.split("_");
    assert.strictEqual(parts[0], testChainId.toString(), "Journal key must start with chain ID");
    assert.strictEqual(parts[1], testHubAddress.toLowerCase(), "Journal key must include emitter address");
  }
  console.log("✔ Event journal keys strictly follow ${chainId}_${emitter}_${txHash}_${logIndex}");

  await IndexerService.processLogs([logCommitment1, logCampaignFinalized]);
  assert.strictEqual(Object.keys(store.db.eventJournal).length, 6, "Re-processing logs must be idempotent (no duplicate journal entries)");
  assert.strictEqual(store.db.campaigns["1"].totalUnitsCommitted, 2, "Counters must not be re-incremented on duplicate events");
  console.log("✔ Event processing idempotency verified: duplicates skipped without side effects");

  // Test Deterministic Clean Rebuild
  const snapshotCampaign = JSON.stringify(store.db.campaigns["1"]);
  const snapshotOrder = JSON.stringify(store.db.orders["1"]);

  // Reset projection and re-process the exact event stream
  store.transaction(()=>{
  store.db.eventJournal = {};
  store.db.orders = {};
  store.db.campaigns = {};
  });

  await IndexerService.processLogs([
    logCampaignCreated,
    logCommitment1,
    logTierUnlocked,
    logCampaignFinalized,
    logDelivery,
    logOrderConfirmed,
  ]);

  const { finalizedAt: _f1, ...campaignProps } = store.db.campaigns["1"];
  const { finalizedAt: _f2, ...expectedCampaignProps } = JSON.parse(snapshotCampaign);
  assert.deepStrictEqual(
    campaignProps,
    expectedCampaignProps,
    "Reconstructed campaign projection must be identical in all onchain and financial fields"
  );

  const { createdAt: _c1, ...orderProps } = store.db.orders["1"];
  const { createdAt: _c2, ...expectedOrderProps } = JSON.parse(snapshotOrder);
  assert.deepStrictEqual(
    orderProps,
    expectedOrderProps,
    "Reconstructed order projection must be identical in all onchain and financial fields"
  );
  console.log("✔ Deterministic Clean Rebuild verified: Replaying event stream reproduces exact projection");

  // ---------------------------------------------------------------------------
  // [G3.3] Fixed-Block Reconciliation & Invariant Testing
  // ---------------------------------------------------------------------------
  console.log("\n[G3.3] Testing Fixed-Block Reconciliation Service:");

  // Case 1: Healthy & Solvency Verified
  const mockHealthyProvider = reconciliationProvider(store.db, 200_000_000n);

  store.transaction(()=>{store.db.syncState.lastIndexedBlock = 125;store.db.syncState.lastIndexedBlockHash=ethers.id("block-125");});
  let report = await ReconciliationService.runReconciliation({
    fixedBlockNumber: 125,
    customProvider: mockHealthyProvider,
  });

  assert.strictEqual(report.status, "HEALTHY", "Reconciliation status should be HEALTHY");
  assert.strictEqual(report.severity, "NONE", "Healthy reconciliation has NONE severity");
  assert.strictEqual(report.conservationLawPassed, true, "Conservation law must pass");
  assert.strictEqual(report.onchainBalanceVerified, true, "Onchain balance must be verified");
  assert.strictEqual(report.blockHash, ethers.id("block-125"), "Report captures fixed block hash");
  console.log("✔ Healthy scenario verified at fixed block 125 with solvency passed");

  // Case 2: Escrow Shortfall Detected (Discrepancy)
  const mockShortfallProvider = reconciliationProvider(store.db, 50_000_000n);

  report = await ReconciliationService.runReconciliation({
    fixedBlockNumber: 125,
    customProvider: mockShortfallProvider,
  });

  assert.strictEqual(report.status, "DISCREPANCY_DETECTED", "Shortfall must trigger DISCREPANCY_DETECTED");
  assert.strictEqual(report.severity, "CRITICAL", "Escrow shortfall must be CRITICAL severity");
  assert.ok(report.discrepancies.some((d) => d.includes("Escrow Shortfall")), "Discrepancy report must specify escrow shortfall");
  console.log("✔ Escrow shortfall discrepancy detected with CRITICAL severity as required");

  // Case 3: Stale Indexer Lag Detected
  store.transaction(()=>{store.db.syncState.lastIndexedBlock = 100;store.db.syncState.lastIndexedBlockHash=ethers.id("block-100");}); // 25 blocks behind target block 125
  report = await ReconciliationService.runReconciliation({
    fixedBlockNumber: 125,
    customProvider: mockHealthyProvider,
  });

  assert.strictEqual(report.status, "STALE", "Lag > 10 blocks must report STALE status");
  assert.strictEqual(report.severity, "MEDIUM", "Stale status has MEDIUM severity");
  assert.strictEqual(report.indexerLagBlocks, 25, "Lag must accurately calculate 25 blocks behind");
  console.log("✔ Stale indexer lag (>10 blocks) detected with STALE status and MEDIUM severity");

  // Case 4: RPC Unreachable
  const mockOfflineProvider = {
    getBlockNumber: async () => { throw new Error("Connection refused (ECONNREFUSED)"); },
    getBlock: async () => { throw new Error("Connection refused"); },
    call: async () => { throw new Error("Connection refused"); },
  };

  report = await ReconciliationService.runReconciliation({
    fixedBlockNumber: 125,
    customProvider: mockOfflineProvider,
  });

  assert.strictEqual(report.status, "UNVERIFIED", "RPC offline must yield UNVERIFIED status");
  assert.strictEqual(report.severity, "HIGH", "Unverified RPC yields HIGH severity");
  assert.strictEqual(report.onchainBalanceVerified, false, "Onchain balance verified must be false");
  console.log("✔ Offline RPC scenario correctly reported as UNVERIFIED with HIGH severity");

  // ---------------------------------------------------------------------------
  // [G3.4] Encrypted Backup & Restore Drill
  // ---------------------------------------------------------------------------
  console.log("\n[G3.4] Testing Encrypted Backup, Retention & Clean Restore Drill:");

  const testBackupDir = path.join(store.storageDirectory,"gate-g3-backups");
  if (!fs.existsSync(testBackupDir)) fs.mkdirSync(testBackupDir, { recursive: true });

  // Create encrypted backup
  const backup = BackupService.createEncryptedBackup(testBackupDir);
  assert.ok(fs.existsSync(backup.backupPath), "Backup file must be written to disk");
  assert.ok(backup.checksum.length === 64, "Checksum must be 64-char SHA-256");

  // Verify file is authenticated AES-256-GCM envelope
  const envelopeRaw = fs.readFileSync(backup.backupPath, "utf8");
  const envelope = JSON.parse(envelopeRaw);
  assert.strictEqual(envelope.version, 3, "Current backup envelope must use version 3 and retain its encryption key ID");
  assert.strictEqual(envelope.keyId, config.masterEncryptionKeyId);
  assert.ok(envelope.authTagHex, "Envelope must have authTagHex");
  assert.ok(envelope.encryptedDataHex, "Envelope must have encryptedDataHex");
  console.log("✔ Encrypted backup created with AES-256-GCM authentication tag and SHA-256 checksum");

  const sourceState=structuredClone(store.db),sourceFinance=JSON.stringify(store.readFinancialProjectionState({wholeScope:true}).graph);
  const restoredStore=new TransactionalStore(fs.mkdtempSync(path.join(store.storageDirectory,"gate-g3-restore-")));
  // Corrupt only the source cache; restore must use an empty isolated target.
  store.db.campaigns = {};
  store.db.orders = {};
  assert.strictEqual(Object.keys(store.db.campaigns).length, 0);

  // Restore drill
  const restoreResult = BackupService.restoreEncryptedBackup(backup.backupPath,restoredStore);
  assert.strictEqual(restoreResult.restored, true, "Restore drill must return restored: true");
  assert.strictEqual(restoreResult.checksum, backup.checksum, "Restored checksum must match backup checksum");
  assert.ok(restoredStore.db.campaigns["1"], "Campaign '1' must be restored into the separate candidate");
  assert.ok(restoredStore.db.orders["1"], "Order '1' must be restored into the separate candidate");
  assert.strictEqual(JSON.stringify(store.readFinancialProjectionState({wholeScope:true}).graph),sourceFinance,"Restore must not change the source SQL projection");
  store.db.campaigns=sourceState.campaigns;store.db.orders=sourceState.orders;
  console.log("✔ Clean restore drill succeeded: database state restored with full checksum validation");

  // Tamper detection on corrupted backup file (flipping ciphertext byte causes AES-GCM auth tag rejection)
  const tamperedEnvelope = JSON.parse(envelopeRaw);
  const firstByte = tamperedEnvelope.encryptedDataHex.substring(0, 2);
  const flippedByte = firstByte === "aa" ? "bb" : "aa";
  tamperedEnvelope.encryptedDataHex = flippedByte + tamperedEnvelope.encryptedDataHex.substring(2);
  fs.writeFileSync(backup.backupPath, JSON.stringify(tamperedEnvelope), "utf8");

  assert.throws(
    () => BackupService.restoreEncryptedBackup(backup.backupPath),
    /Integrity check failed|unsupported state or unable to authenticate data/i,
    "Tampering with backup ciphertext or metadata must throw cryptographic failure"
  );
  console.log("✔ Cryptographic tamper detection verified: Modified backup was rejected during restore");

  restoredStore.close(); // Keep owned fixture artifacts for failure review.

  // ---------------------------------------------------------------------------
  // [G3.5] Webhook Durability, SSRF, Persistent Queue & DLQ Replay
  // ---------------------------------------------------------------------------
  console.log("\n[G3.5] Testing Webhook SSRF Rejection, Persistent Queue & DLQ Replay:");

  const dangerousSSRF = [
    "http://127.0.0.1:8080/hook",
    "http://localhost/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1/hook",
    "http://172.16.0.1/hook",
    "http://192.168.1.1/hook",
    "http://0.0.0.0:4000/hook",
    "file:///etc/shadow",
    "ftp://malicious.com/hook",
  ];

  for (const url of dangerousSSRF) {
    await assert.rejects(
      async () => await WebhookService.validateWebhookUrl(url),
      /SSRF Protection|Invalid protocol/,
      `SSRF validator must reject ${url}`
    );
  }
  console.log("✔ SSRF Protection: Blocked all 9 private, loopback, metadata, and invalid protocol URLs");

  // Persistent Queue & DLQ
  const testSellerId = "seller_dlq_test";
  store.db.webhooks[testSellerId] = {
    id: "wh_test",
    sellerId: testSellerId,
    targetUrl: "https://api.seller-test.com/fail-webhook",
    secret: "test_secret",
    events: ["order.committed"],
    logs: [],
  };

  const job = WebhookService.enqueueEvent(testSellerId, "order.committed", { test: true });
  assert.ok(job, "Job must be enqueued");
  assert.strictEqual(job.status, "QUEUED");
  assert.ok(store.db.webhookQueue[job.id], "Job must exist in persistent webhookQueue");
  console.log("✔ Webhook persistent queue enqueue verified");

  // Simulate execution failure up to maxAttempts
  job.attempts = 2; // Next failure will hit maxAttempts (3)
  job.maxAttempts = 3;
  job.nextAttemptAt = 0; // Ready now

  // Fixture transport only: exercise persisted retry/DLQ without external egress.
  const originalTransport=(WebhookService as any).sendWebhook;
  const delivered:any[]=[];(WebhookService as any).sendWebhook=async(_url:string,body:string)=>{delivered.push(JSON.parse(body));return 503;};
  try {
  await WebhookService.processQueue();

  assert.strictEqual(job.status, "DLQ", "Exhausted job must transition to DLQ");
  const dlqId = `dlq_${job.id}`;
  const dlqEntry = store.db.webhookDLQ[dlqId];
  assert.ok(dlqEntry, "Record must exist in webhookDLQ");
  assert.strictEqual(dlqEntry.replayed, false, "DLQ record starts as unreplayed");
  console.log("✔ Webhook retry exhaustion transitioned job to Dead Letter Queue (DLQ)");

  // Replay from DLQ
  (WebhookService as any).sendWebhook=async(_url:string,body:string)=>{delivered.push(JSON.parse(body));return 202;};
  const replayResult = await WebhookService.replayDLQ(dlqId);
  assert.strictEqual(replayResult, true, "Replay DLQ must succeed");
  assert.strictEqual(dlqEntry.replayed, true, "DLQ entry marked as replayed");
  assert.ok(delivered.length===2&&delivered.every(body=>body.id===job.eventId),"DLQ redrive must retain the original event identity");
  console.log("✔ Webhook DLQ replay mechanism verified with isolated transport");
  }finally{(WebhookService as any).sendWebhook=originalTransport;}

  console.log("\n=================================================");
  console.log("🎉 ALL GATE G3 VERIFICATION & SECURITY TESTS PASSED!");
  console.log("=================================================\n");
}

runGateG3VerificationTests().catch((err) => {
  console.error("\n❌ Gate G3 test suite failed:", err);
  process.exit(1);
});
