import assert from "node:assert";
import { ethers } from "ethers";
import { AuthService } from "../src/services/authService";
import { store } from "../src/db/store";

async function runWalletChallengeReplayTests() {
  console.log("=== Running Wallet Challenge Anti-Replay Tests (A11 Mitigation) ===");

  const wallet = ethers.Wallet.createRandom();
  const userId = "test_user_replay_1";

  store.db.users[userId] = {
    id: userId,
    email: "replay_test@example.com",
    roles: ["buyer"],
    createdAt: Date.now(),
    activeWallet:wallet.address,
  };
  store.db.userByWallet[wallet.address.toLowerCase()]=userId;
  store.save();

  // 1. Issue challenge
  const challenge = AuthService.issueWalletChallenge(userId, "LINK_WALLET", wallet.address);
  assert.ok(challenge.challengeMessage.includes("=== GroupDeal Security Challenge ==="));
  assert.ok(challenge.challengeMessage.includes(wallet.address));
  assert.ok(challenge.expiresAt > Math.floor(Date.now() / 1000));
  console.log("✔ Server-side challenge nonce successfully issued");

  // 2. Sign challenge
  const validSignature = await wallet.signMessage(challenge.challengeMessage);

  // 3. First consumption: success
  const userLinked = AuthService.linkExternalWallet(
    userId,
    wallet.address,
    validSignature,
    challenge.challengeMessage
  );
  assert.strictEqual(userLinked.activeWallet?.toLowerCase(), wallet.address.toLowerCase());
  console.log("✔ Legitimate one-time challenge successfully verified and consumed");

  // 4. Replay attempt: must FAIL because challenge was consumed!
  assert.throws(
    () => {
      AuthService.linkExternalWallet(
        userId,
        wallet.address,
        validSignature,
        challenge.challengeMessage
      );
    },
    /WALLET_AUTH_CHALLENGE_INVALID/,
    "Replay of already consumed challenge must be rejected!"
  );
  console.log("✔ Replay attack prevented: re-using the same signature/message was strictly blocked!");

  console.log("🎉 ALL WALLET CHALLENGE ANTI-REPLAY TESTS PASSED!\n");
}

runWalletChallengeReplayTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
