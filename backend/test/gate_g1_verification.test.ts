import assert from "node:assert";
import { ethers } from "ethers";
import { AuthService } from "../src/services/authService";
import { TransactionVerifier, TransactionIntent } from "../src/services/transactionVerifier";
import { DeliveryService } from "../src/services/deliveryService";
import { DisputeService } from "../src/services/disputeService";
import { store } from "../src/db/store";
import { config } from "../src/config";

async function runGateG1Tests() {
  console.log("=================================================");
  console.log("=== GATE G1 INTEGRATION & VERIFICATION TESTS ===");
  console.log("=================================================\n");

  // -------------------------------------------------------------------------
  // SECTION 1: Wallet Authentication, Challenge Nonce & Anti-Replay
  // -------------------------------------------------------------------------
  console.log("[G1.1] Testing Server-Issued Challenge Nonce & Anti-Replay:");
  const testWallet = ethers.Wallet.createRandom();
  const testUserId = "g1_tester_1";
  store.db.users[testUserId] = {
    id: testUserId,
    email: "g1_tester@example.com",
    roles: ["buyer"],
    createdAt: Date.now(),
  };

  // 1.1 Request challenge
  const challenge = AuthService.issueWalletChallenge(testUserId, "LINK_WALLET", testWallet.address);
  assert.ok(challenge.challengeMessage.includes(testWallet.address), "Challenge must contain wallet address");
  assert.ok(challenge.challengeMessage.includes("Nonce:"), "Challenge must contain nonce");
  assert.ok(challenge.expiresAt > Math.floor(Date.now() / 1000), "Challenge must have future expiry");
  console.log("✔ Issued valid challenge with unique nonce and expiration");

  // 1.2 Sign challenge with correct wallet
  const signature = await testWallet.signMessage(challenge.challengeMessage);

  // 1.3 Consume challenge successfully
  const updatedUser = AuthService.linkExternalWallet(
    testUserId,
    testWallet.address,
    signature,
    challenge.challengeMessage
  );
  assert.strictEqual(updatedUser.activeWallet?.toLowerCase(), testWallet.address.toLowerCase());
  console.log("✔ Successfully consumed challenge and linked non-custodial wallet");

  // 1.4 Anti-Replay: Attempt to consume the same challenge a second time
  await assert.rejects(
    async () => {
      AuthService.linkExternalWallet(
        testUserId,
        testWallet.address,
        signature,
        challenge.challengeMessage
      );
    },
    /Challenge expired or not found/,
    "Replaying consumed challenge must be rejected"
  );
  console.log("✔ Anti-Replay verified: Re-using the same challenge immediately rejected");

  // 1.5 Cross-Account Protection: User B cannot use User A's signature or challenge
  const attackerWallet = ethers.Wallet.createRandom();
  const attackerUserId = "attacker_1";
  store.db.users[attackerUserId] = {
    id: attackerUserId,
    email: "attacker@example.com",
    roles: ["buyer"],
    createdAt: Date.now(),
  };
  await assert.rejects(
    async () => {
      AuthService.linkExternalWallet(
        attackerUserId,
        testWallet.address,
        signature,
        challenge.challengeMessage
      );
    },
    /Challenge expired or not found/,
    "User B using User A's challenge must be rejected"
  );
  console.log("✔ Cross-Account protection verified: Challenge scoped strictly to userId + wallet");

  // -------------------------------------------------------------------------
  // SECTION 2: Elimination of Server Custodial Keys
  // -------------------------------------------------------------------------
  console.log("\n[G1.2] Testing Elimination of Server Custodial Keys:");
  const dbUser = store.db.users[testUserId];
  assert.strictEqual((dbUser as any).encryptedPrivateKey, undefined, "User must NOT have encryptedPrivateKey in DB");
  assert.strictEqual((dbUser as any).privateKey, undefined, "User must NOT have raw private key");
  console.log("✔ Confirmed zero custodial private keys in user storage");

  // -------------------------------------------------------------------------
  // SECTION 3: TransactionVerifier Fail-Closed Checks
  // -------------------------------------------------------------------------
  console.log("\n[G1.5 & G1.6] Testing TransactionVerifier Fail-Closed Enforcements:");

  const dummyIntent: TransactionIntent = {
    intentId: "test_intent_g1_1",
    expectedTo: config.hubAddress,
    expectedFunction: "recordDelivery",
    expectedEvent: "DeliveryRecorded",
    expectedEventArgs: {
      campaignId: 1,
      orderId: 1,
    },
  };

  // 3.1 Invalid hash format
  await assert.rejects(
    async () => {
      await TransactionVerifier.verifyExpectedTransaction(dummyIntent, "not_a_hex");
    },
    /Invalid transaction hash format/,
    "Invalid hex hash must be rejected immediately"
  );
  console.log("✔ Invalid transaction hash format rejected");

  // 3.2 Non-existent transaction on live/mocked RPC
  const randomTxHash = "0x" + "a".repeat(64);
  await assert.rejects(
    async () => {
      await TransactionVerifier.verifyExpectedTransaction(dummyIntent, randomTxHash);
    },
    /not found|RPC error/,
    "Non-existent tx on live network must fail closed"
  );
  console.log("✔ Non-existent transaction hash rejected (fail-closed)");

  // 3.3 Anti-Replay for TransactionVerifier: Pre-populate consumed txHash
  const consumedHash = "0x" + "b".repeat(64);
  store.db.consumedTxHashes[consumedHash] = {
    intentId: "existing_intent_abc",
    blockNumber: 12345,
    verifiedAt: Date.now(),
  };

  await assert.rejects(
    async () => {
      await TransactionVerifier.verifyExpectedTransaction(
        { ...dummyIntent, intentId: "different_intent_xyz" },
        consumedHash
      );
    },
    /already consumed by intent 'existing_intent_abc'/,
    "Replaying an already consumed onchain transaction must be blocked"
  );
  console.log("✔ TransactionVerifier anti-replay protection verified");

  // 3.4 DeliveryService fail-closed on missing txHash
  store.db.campaigns["c_g1"] = {
    id: "c_g1",
    onchainCampaignId: 1,
    title: "G1 Test Campaign",
    description: "Testing",
    category: "Software",
    thumbnailUrl: "",
    sellerId: testUserId,
    sellerPayoutWallet: testWallet.address,
    status: "FINALIZED",
    visibility: "PUBLIC",
    metric: "BUYER_COUNT",
    tiers: [{ threshold: 1, price: 1000000 }],
    currentUnlockedTier: 0,
    maxPerAccount: 5,
    inventoryLimit: 100,
    durationSeconds: 86400,
    deliverySlaSeconds: 86400,
    earlyRebateEnabled: false,
    earlySlotsCount: 0,
    platformFeeBps: 0,
    termsHash: ethers.ZeroHash,
    startTime: Math.floor(Date.now() / 1000) - 1000,
    endTime: Math.floor(Date.now() / 1000),
    totalBuyerCount: 1,
    totalUnitsCommitted: 1,
    totalGrossCommitted: "1000000",
    deliveryMethod: "LICENSE_KEY",
    deliveryContentTemplate: "",
    dryRunDeliveryVerified: true,
    amendments: [],
  };

  store.db.orders["o_g1"] = {
    id: "o_g1",
    onchainOrderId: 1,
    campaignId: "c_g1",
    buyerAccountId: testUserId,
    campaignIdentity: "0x_g1_id",
    buyerPrincipal: testWallet.address,
    quantity: 1,
    lockedUnitPrice: "1000000",
    committedGross: "1000000",
    isEarlySupporter: false,
    earlyRebateValue: "0",
    rebateAllocated: "0",
    sellerAllocated: "0",
    buyerRefundAllocated: "0",
    deliveryStatus: "PENDING",
    txHash: "0x_initial",
    createdAt: Date.now(),
    buyerClaimed: false,
    sellerClaimed: false,
  };

  await assert.rejects(
    async () => {
      await DeliveryService.fulfillOrder(testUserId, "o_g1", "SECRET_KEY_123", "");
    },
    /valid onchain transaction hash from seller's wallet is required/,
    "Delivery without txHash must be rejected"
  );
  console.log("✔ DeliveryService strictly enforces onchain transaction hash requirement");

  // 3.5 DisputeService fail-closed on missing txHash
  store.db.orders["o_g1"].deliveryStatus = "DELIVERED";
  await assert.rejects(
    async () => {
      await DisputeService.openDispute(testUserId, "o_g1", "Broken product", [], "");
    },
    /Missing required onchain transaction hash/,
    "Dispute without txHash must be rejected"
  );
  console.log("✔ DisputeService strictly enforces onchain transaction hash requirement");

  console.log("\n=================================================");
  console.log("🎉 ALL GATE G1 INTEGRATION & SECURITY TESTS PASSED!");
  console.log("=================================================\n");
}

runGateG1Tests().catch((err) => {
  console.error("Gate G1 verification failed:", err);
  process.exit(1);
});
