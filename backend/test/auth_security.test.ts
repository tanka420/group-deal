import assert from "node:assert/strict";
import { AuthService } from "../src/services/authService";
import { store, sanitizeUser } from "../src/db/store";
import { DisputeService } from "../src/services/disputeService";

async function runAuthSecurityTests() {
  console.log("=== Running Backend Auth & Security Tests ===");

  const testEmail = `test_${Date.now()}@example.com`;

  // 1. Request OTP does NOT leak code in return object
  const reqRes = AuthService.requestOtp(testEmail);
  assert.equal(reqRes.success, true);
  assert.equal((reqRes as any).code, undefined, "Security Failure: OTP code leaked in response!");
  console.log("✔ OTP request does not leak code in return value");

  // 2. Request OTP rate-limiting: immediate second request should fail
  assert.throws(
    () => AuthService.requestOtp(testEmail),
    /Vui lòng đợi/,
    "Security Failure: Rate limit did not trigger on rapid OTP request"
  );
  console.log("✔ OTP rate-limiting triggers on rapid requests");

  // Retrieve salt and compute correct code for testing verifyOtp
  const entry = store.db.emailOtps[testEmail];
  assert.ok(entry.salt, "OTP must have a salt");
  assert.ok(entry.hashedCode, "OTP must be stored as hash");

  // 3. Brute force protection: 6 bad attempts will invalidate the OTP
  for (let i = 0; i < 5; i++) {
    assert.throws(() => AuthService.verifyOtp(testEmail, "000000"), /Mã OTP không chính xác/);
  }
  assert.throws(
    () => AuthService.verifyOtp(testEmail, "000000"),
    /Quá số lần thử OTP cho phép/
  );
  assert.equal(store.db.emailOtps[testEmail], undefined, "OTP must be deleted after 5 failed attempts");
  console.log("✔ Brute-force protection: OTP invalidated after 5 failed attempts");

  // 4. Test sanitizeUser: encryptedPrivateKey and payoutProofSignature are removed
  const dummyUser = {
    id: "usr_dummy",
    email: "dummy@example.com",
    createdAt: Date.now(),
    roles: ["buyer" as const, "seller" as const],
    activeWallet: "0x1111111111111111111111111111111111111111",
    circleWallet: {
      address: "0x1111111111111111111111111111111111111111",
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

  // 5. Test dispute resolve non-negative constraint
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

  assert.throws(
    () => DisputeService.resolveDispute("op", "test_order_99", "-10000000", "110000000", "bad"),
    /số không âm/
  );
  console.log("✔ Dispute resolution rejects negative allocations");

  console.log("All Auth & Security tests passed!");
}

runAuthSecurityTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
