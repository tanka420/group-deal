import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { CircleWalletService } from "../src/services/circleWalletService";
import { AuthService } from "../src/services/authService";
import { store } from "../src/db/store";

async function run() {
  assert.ok(store.isIsolated);
  const service = CircleWalletService as unknown as { client: unknown };
  const original = service.client;
  const deviceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  let userId = "real-circle-user";
  service.client = {
    createDeviceTokenForEmailLogin: async () => ({ data: {
      deviceToken: jwt.sign({ sub: deviceId }, "fixture"), otpToken: "fixture-otp", deviceEncryptionKey: "fixture-key",
    } }),
    getUserStatus: async ({ userToken }: { userToken: string }) => {
      if (userToken === "invalid-token-xxxxxxxxxxxxxxxxxxxxxxxx") throw new Error("Circle rejected token");
      return { data: { id: userId, status: "ENABLED" } };
    },
  };
  const token = jwt.sign({ sub: userId }, "fixture");
  try {
    const attempt = await CircleWalletService.requestEmailOtp("buyer@example.com", deviceId);
    assert.equal(store.db.circleLoginAttempts[attempt.loginAttemptId].circleUserId, undefined);
    const identity = await CircleWalletService.verifyIdentity(token, attempt.loginAttemptId);
    assert.equal(identity.circleUserId, userId, "Device ID must never be compared with user ID");
    assert.equal(identity.email, null, "Requested email is not proof of token ownership");
    const session = AuthService.createCircleSession(identity.email, identity.circleUserId);
    assert.equal(session.user.email, null);
    assert.equal(store.db.userByEmail["buyer@example.com"], undefined);
    await assert.rejects(CircleWalletService.verifyIdentity(token, attempt.loginAttemptId), /consumed/);

    const victim = AuthService.createCircleSession("victim@example.com", "victim-circle");
    store.db.users[victim.user.id].roles.push("operator");
    userId = "attacker-circle";
    const attackerAttempt = await CircleWalletService.requestEmailOtp("victim@example.com", deviceId);
    const attackerIdentity = await CircleWalletService.verifyIdentity(token, attackerAttempt.loginAttemptId);
    const attacker = AuthService.createCircleSession(attackerIdentity.email, attackerIdentity.circleUserId);
    assert.notEqual(attacker.user.id, victim.user.id);
    assert.deepEqual(attacker.user.roles, ["buyer"]);
    assert.equal(store.db.userByEmail["victim@example.com"], victim.user.id);
    assert.throws(() => AuthService.createCircleSession("victim@example.com", "other-circle"), /already bound/);

    const emailAttempt = await CircleWalletService.requestEmailOtp("correct@example.com", deviceId);
    const verifiedToken = jwt.sign({ sub: userId, email: "wrong@example.com", email_verified: true }, "fixture");
    await assert.rejects(CircleWalletService.verifyIdentity(verifiedToken, emailAttempt.loginAttemptId), /does not match/);
    assert.equal(store.db.circleLoginAttempts[emailAttempt.loginAttemptId].consumedAt, undefined);
    const invalidAttempt = await CircleWalletService.requestEmailOtp("buyer@example.com", deviceId);
    await assert.rejects(CircleWalletService.verifyIdentity("invalid-token-xxxxxxxxxxxxxxxxxxxxxxxx", invalidAttempt.loginAttemptId), /rejected/);

    const concurrentAttempt = await CircleWalletService.requestEmailOtp("buyer@example.com", deviceId);
    const outcomes = await Promise.allSettled([
      CircleWalletService.verifyIdentity(token, concurrentAttempt.loginAttemptId),
      CircleWalletService.verifyIdentity(token, concurrentAttempt.loginAttemptId),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    console.log("PASS: Circle device/user separation, verified provider identity, email impersonation, invalid token, replay and concurrent consumption");
  } finally { service.client = original; }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
