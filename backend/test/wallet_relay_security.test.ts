import assert from "node:assert";
import { ethers } from "ethers";

async function runWalletRelayPolicyTests() {
  console.log("=== Running Wallet Relayer Policy Security Tests (A03 Mitigation) ===");

  const hubAddr = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512".toLowerCase();
  const usdcAddr = "0x5FbDB2315678afecb367f032d93F642f64180aa3".toLowerCase();
  const randomAttackerAddr = "0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E".toLowerCase();

  const ALLOWED_HUB_SELECTORS = new Set([
    "0x5656bceb", // commitToBuy
    "0xa724b047", // claimBuyerFunds
    "0xdc5369ad", // claimDeliveryBreach
    "0xde1bf140", // claimSellerProceeds
    "0xe5b56091", // confirmReceipt
    "0xd2e21c7e", // openDispute
    "0x0bb522ec", // createCampaign
    "0x784cd414", // recordDelivery
    "0xed6a2f0a", // settleUndisputedOrder
    "0x16670bcd", // resolveDispute
    "0xf9b60540", // emergencyOpenDisputeWithSignature
  ]);

  function validateRelayRequest(to: string, data: string, value?: string | number) {
    const normalizedTo = ethers.getAddress(to).toLowerCase();

    // 1. Target Allowlist
    if (normalizedTo !== hubAddr && normalizedTo !== usdcAddr) {
      throw new Error("Target address not allowed");
    }

    // 2. No native value
    if (value && BigInt(value) > 0n) {
      throw new Error("Native value not allowed");
    }

    const calldata = data || "0x";
    if (calldata.length < 10) {
      throw new Error("Calldata too short");
    }
    const selector = calldata.slice(0, 10).toLowerCase();

    // 3. USDC contract check
    if (normalizedTo === usdcAddr) {
      if (selector !== "0x095ea7b3") {
        throw new Error("Only approve allowed on USDC");
      }
      const spender = ethers.getAddress("0x" + calldata.slice(34, 74)).toLowerCase();
      if (spender !== hubAddr) {
        throw new Error("Spender must be hub");
      }
    }

    // 4. Hub contract check
    if (normalizedTo === hubAddr) {
      if (!ALLOWED_HUB_SELECTORS.has(selector)) {
        throw new Error(`Selector ${selector} not allowed on Hub`);
      }
    }

    return true;
  }

  // Test 1: Reject unauthorized target
  assert.throws(
    () => validateRelayRequest(randomAttackerAddr, "0x1234567800000"),
    /Target address not allowed/,
    "Failed to block unauthorized destination contract"
  );
  console.log("✔ Blocked arbitrary external target address");

  // Test 2: Reject native transfer
  assert.throws(
    () => validateRelayRequest(hubAddr, "0x5656bceb00000000000000000000000000000000", "1000000000000000000"),
    /Native value not allowed/,
    "Failed to block native currency transfer"
  );
  console.log("✔ Blocked native value transfer attempt");

  // Test 3: Reject dangerous transfer on USDC
  const transferSelector = "0xa9059cbb"; // transfer(address,uint256)
  assert.throws(
    () => validateRelayRequest(usdcAddr, transferSelector + "00".repeat(32)),
    /Only approve allowed on USDC/,
    "Failed to block arbitrary token transfer"
  );
  console.log("✔ Blocked unauthorized token transfer function on USDC");

  // Test 4: Reject approval to attacker address
  const erc20 = new ethers.Interface(["function approve(address,uint256)"]);
  const maliciousApprove = erc20.encodeFunctionData("approve", [randomAttackerAddr, 1000000n]);
  assert.throws(
    () => validateRelayRequest(usdcAddr, maliciousApprove),
    /Spender must be hub/,
    "Failed to block approval to non-hub address"
  );
  console.log("✔ Blocked malicious approve to non-hub spender");

  // Test 5: Allow legitimate approve to Hub
  const legitApprove = erc20.encodeFunctionData("approve", [hubAddr, ethers.MaxUint256]);
  assert.strictEqual(validateRelayRequest(usdcAddr, legitApprove), true);
  console.log("✔ Allowed legitimate approve to GroupDealHub");

  // Test 6: Allow legitimate commitToBuy on Hub
  assert.strictEqual(validateRelayRequest(hubAddr, "0x5656bceb" + "00".repeat(32)), true);
  console.log("✔ Allowed legitimate commitToBuy on GroupDealHub");

  console.log("🎉 ALL WALLET RELAY POLICY SECURITY TESTS PASSED!\n");
}

runWalletRelayPolicyTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
