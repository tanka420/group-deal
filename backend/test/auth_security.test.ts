import assert from "node:assert/strict";
import { ethers } from "ethers";
import { AuthService } from "../src/services/authService";
import { SessionError } from "../src/services/sessionService";
import { store, sanitizeUser } from "../src/db/store";
import { DisputeService } from "../src/services/disputeService";

async function runAuthSecurityTests() {
  console.log("=== Running Backend Auth & Security Tests ===");

  // Legacy OTP is retired; both service entrypoints deny without touching storage.
  const otpBefore=structuredClone(store.db);
  const retired=(e:unknown)=>e instanceof SessionError&&e.code==="LEGACY_EMAIL_OTP_RETIRED"&&e.status===410;
  assert.throws(()=>AuthService.requestOtp("retired@security.example.test"),retired);
  assert.throws(()=>AuthService.verifyOtp("retired@security.example.test","000000"),retired);
  assert.deepEqual(structuredClone(store.db),otpBefore);
  console.log("✔ Retired local OTP cannot mutate storage or issue a session");

  // 4. Test sanitizeUser: encryptedPrivateKey and payoutProofSignature are removed
  const dummyUser = {
    id: "usr_dummy",
    email: "dummy@example.com",
    createdAt: Date.now(),
    roles: ["buyer" as const, "seller" as const],
    activeWallet: "0x1111111111111111111111111111111111111111",
    circleWallet: {
      address: "0x1111111111111111111111111111111111111111",
      walletId: "wallet_test_1",
      blockchain: "ARC-TESTNET" as const,
      encryptedPrivateKey: "super-secret-ciphertext",
    },
    sellerProfile: {
      displayName: "Dummy Seller",
      bio: "bio",
      payoutWallet: "0x1111111111111111111111111111111111111111",
      verifiedSellerBadge: true,
      verifiedRightsBadge: false,
      payoutProofSignature: "0xabcdef123456",
    },
  };

  const sanitized = sanitizeUser(dummyUser);
  assert.equal((sanitized.circleWallet as any)?.encryptedPrivateKey, undefined, "Leaked encryptedPrivateKey in sanitized DTO!");
  assert.equal((sanitized.sellerProfile as any)?.payoutProofSignature, undefined, "Leaked payoutProofSignature in sanitized DTO!");
  assert.equal(sanitized.circleWallet?.address, "0x1111111111111111111111111111111111111111");
  console.log("✔ DTO sanitization strips private keys and proof signatures");

  // 5. Wallet-first login requires a valid one-time signature and stores no key material.
  const loginWallet = ethers.Wallet.createRandom();
  const walletChallenge = AuthService.issueWalletLoginChallenge(
    loginWallet.address,
    "http://localhost:5173"
  );
  const walletSignature = await loginWallet.signMessage(walletChallenge.challengeMessage);
  const walletSession = AuthService.verifyWalletLogin(
    loginWallet.address,
    walletSignature,
    walletChallenge.challengeMessage,
    walletChallenge.nonce
  );
  assert.equal(walletSession.user.email, null);
  assert.equal(walletSession.user.loginMethod, "EVM_WALLET");
  assert.equal(walletSession.user.activeWallet, loginWallet.address);
  assert.equal(
    store.db.userByWallet[loginWallet.address.toLowerCase()],
    walletSession.user.id,
    "Wallet login must create the atomic reverse binding"
  );
  assert.equal(store.db.notificationPreferences[walletSession.user.id]?.email, false);
  assert.throws(
    () =>
      AuthService.verifyWalletLogin(
        loginWallet.address,
        walletSignature,
        walletChallenge.challengeMessage,
        walletChallenge.nonce
      ),
    /WALLET_AUTH_CHALLENGE_INVALID/,
    "Wallet login challenge must not be replayable"
  );
  console.log("✔ Wallet-first login verifies ownership and prevents signature replay");

  // 6. Test dispute resolve non-negative constraint
  // Set up the dependency explicitly rather than relying on seeded/live data.
  store.db.campaigns["1"] = {
    id: "1", onchainCampaignId: 1, title: "Fixture", description: "", category: "Software", thumbnailUrl: "",
    sellerId: "fixture-seller", sellerPayoutWallet: ethers.ZeroAddress, status: "FINALIZED", visibility: "PUBLIC",
    metric: "BUYER_COUNT", tiers: [{ threshold: 1, price: "100000000" }], currentUnlockedTier: 0,
    maxPerAccount: 1, inventoryLimit: 1, durationSeconds: 86400, deliverySlaSeconds: 86400,
    earlyRebateEnabled: false, earlySlotsCount: 0, earlyRebateAmount: "0", earlyRebateBps: 0, platformFeeBps: 0, termsHash: ethers.ZeroHash,
    startTime: 1, endTime: 2, totalBuyerCount: 1, totalUnitsCommitted: 1, totalGrossCommitted: "100000000",
    deliveryMethod: "LICENSE_KEY", deliveryContentTemplate: "", dryRunDeliveryVerified: true, amendments: [],
  };
  store.db.orders["test_order_99"] = {
    id: "test_order_99",
    onchainOrderId: 99,
    campaignId: "1",
    buyerAccountId: "usr_buyer_99",
    campaignIdentity: "0x123",
    buyerPrincipal: "0x2222222222222222222222222222222222222222",
    quantity: 1,
    lockedUnitPrice: "100000000",
    committedGross: "100000000",
    isEarlySupporter: false,
    earlyRebateValue: "0",
    rebateAllocated: "0",
    sellerAllocated: "0",
    buyerRefundAllocated: "0",
    deliveryStatus: "DISPUTED",
    txHash: "0xabc",
    createdAt: Date.now(),
    buyerClaimed: false,
    sellerClaimed: false,
  };

  store.db.users.op = { id: "op", email: "op@fixture.invalid", roles: ["operator"], createdAt: Date.now(), activeWallet: null };
  await assert.rejects(
    async () => DisputeService.resolveDispute("op", "test_order_99", "-10000000", "110000000", "bad", "0x0000000000000000000000000000000000000000000000000000000000000001"),
    /số không âm/
  );
  console.log("✔ Dispute resolution rejects negative allocations");

  console.log("All Auth & Security tests passed!");
}

runAuthSecurityTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
