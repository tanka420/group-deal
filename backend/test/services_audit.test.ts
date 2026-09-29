import assert from "node:assert";
import { WebhookService } from "../src/services/webhookService";
import { ReconciliationService } from "../src/services/reconciliationService";
import { DeliveryService } from "../src/services/deliveryService";
import { encryptEntitlement, decryptEntitlement, computeTermsHash } from "../src/utils/crypto";
import { store } from "../src/db/store";

async function runServicesAuditTests() {
  console.log("=== Running Backend Services & Invariant Tests ===");

  // 1. WebhookService SSRF Protection (F22)
  console.log("\n[Test 1] WebhookService SSRF Protection:");
  const maliciousUrls = [
    "http://localhost:3000/webhook",
    "http://127.0.0.1/webhook",
    "http://127.0.0.2:8080/hook",
    "http://0.0.0.0/webhook",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.1.5/webhook",
    "http://172.20.0.1:5000/hook",
    "http://192.168.1.100/webhook",
    "ftp://example.com/webhook",
    "file:///etc/passwd",
  ];

  for (const url of maliciousUrls) {
    assert.throws(
      () => WebhookService.validateWebhookUrl(url),
      /SSRF Protection|Invalid protocol/,
      `Failed to block dangerous URL: ${url}`
    );
  }
  console.log("✔ Successfully blocked all 10 SSRF/internal network targets");

  // Legitimate URL
  assert.doesNotThrow(
    () => WebhookService.validateWebhookUrl("https://api.seller-domain.com/webhooks/groupdeal"),
    "Legitimate HTTPS target was incorrectly rejected"
  );
  console.log("✔ Allowed valid public HTTPS target");

  // 2. Reconciliation Service Financial Conservation (F13)
  console.log("\n[Test 2] Reconciliation Service Invariant Conservation:");
  store.db.orders = {};
  store.db.orders["test_ord_1"] = {
    id: "test_ord_1",
    onchainOrderId: 1,
    campaignId: "1",
    buyerAccountId: "usr_buyer_1",
    campaignIdentity: "0x_identity_1",
    buyerPrincipal: "0x1111111111111111111111111111111111111111",
    quantity: 1,
    lockedUnitPrice: "100000000",
    committedGross: "100000000",
    isEarlySupporter: false,
    earlyRebateValue: "0",
    rebateAllocated: "20000000", // $20 rebate
    sellerAllocated: "80000000", // $80 seller proceeds
    buyerRefundAllocated: "0",
    deliveryStatus: "CONFIRMED",
    txHash: "0x_test_tx",
    createdAt: Date.now(),
    buyerClaimed: false,
    sellerClaimed: false,
  };

  const reportHealthy = await ReconciliationService.runReconciliation();
  assert.strictEqual(reportHealthy.conservationLawPassed, true, "Internal conservation should pass for healthy order");
  // When RPC is unreachable, status must be UNVERIFIED, NEVER silently reported as HEALTHY (Fix A07)
  assert.strictEqual(reportHealthy.status, "UNVERIFIED", "Status must be UNVERIFIED when onchain RPC is disconnected");
  assert.strictEqual(reportHealthy.onchainBalanceVerified, false);
  assert.strictEqual(reportHealthy.totalGrossCommittedUSDC, "100.0");
  assert.strictEqual(reportHealthy.totalRebatesAllocatedUSDC, "20.0");
  assert.strictEqual(reportHealthy.totalSellerProceedsUSDC, "80.0");
  console.log("✔ Conservation verified and offline RPC accurately identified as UNVERIFIED (Fix A07 verified)");

  // Invariant leak detection
  store.db.orders["test_ord_leak"] = {
    id: "test_ord_leak",
    onchainOrderId: 2,
    campaignId: "1",
    buyerAccountId: "usr_buyer_2",
    campaignIdentity: "0x_identity_2",
    buyerPrincipal: "0x2222222222222222222222222222222222222222",
    quantity: 1,
    lockedUnitPrice: "100000000",
    committedGross: "100000000",
    isEarlySupporter: false,
    earlyRebateValue: "0",
    rebateAllocated: "20000000",
    sellerAllocated: "70000000", // 20 + 70 = 90 != 100
    buyerRefundAllocated: "0",
    deliveryStatus: "CONFIRMED",
    txHash: "0x_test_tx_2",
    createdAt: Date.now(),
    buyerClaimed: false,
    sellerClaimed: false,
  };

  const reportLeaking = await ReconciliationService.runReconciliation();
  assert.strictEqual(reportLeaking.conservationLawPassed, false, "Should detect math discrepancy");
  assert.strictEqual(reportLeaking.status, "DISCREPANCY_DETECTED");
  assert.strictEqual(reportLeaking.discrepancies.length > 0, true);
  console.log("✔ Math discrepancy successfully flagged by Reconciliation Service");

  // 3. DeliveryService Cryptography & Dry-Run (F21)
  console.log("\n[Test 3] DeliveryService Dry-Run & Cryptography:");
  const testSecret = "PROD-ACTIVATION-KEY-XYZ-9999";
  const encrypted = encryptEntitlement(testSecret);
  assert.notStrictEqual(encrypted, testSecret, "Encrypted payload should not equal cleartext");
  const decrypted = decryptEntitlement(encrypted);
  assert.strictEqual(decrypted, testSecret, "Decrypted payload must match cleartext");
  console.log("✔ AES-256-GCM symmetric encryption roundtrip verified");

  const dryRunOk = DeliveryService.testDeliveryFlow("LICENSE_KEY", "SAMPLE-KEY-TEST");
  assert.strictEqual(dryRunOk.success, true);
  assert.strictEqual(typeof dryRunOk.proofHash, "string");
  assert.strictEqual(dryRunOk.proofHash.startsWith("0x"), true);

  assert.throws(
    () => DeliveryService.testDeliveryFlow("LICENSE_KEY", ""),
    /Sample payload cannot be empty/,
    "Should reject empty delivery template"
  );
  console.log("✔ Delivery dry-run fail-closed logic verified");

  console.log("\n🎉 ALL BACKEND SERVICE INVARIANT AUDIT TESTS PASSED!");
}

runServicesAuditTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
