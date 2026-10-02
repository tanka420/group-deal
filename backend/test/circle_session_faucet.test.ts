import assert from "node:assert/strict";
import express from "express";
import { ethers } from "ethers";
import { circleRouter } from "../src/routes/circleRoutes";
import { faucetRouter } from "../src/routes/faucetRoutes";
import { CircleWalletService } from "../src/services/circleWalletService";
import { AuthService } from "../src/services/authService";
import { store } from "../src/db/store";

async function run() {
  assert.ok(store.filePath.includes("groupdeal-test-"), "Tests must not open the application database");
  const originals = {
    verifyIdentity: CircleWalletService.verifyIdentity,
    listArcWallets: CircleWalletService.listArcWallets,
    requestArcTestnetTokens: CircleWalletService.requestArcTestnetTokens,
  };
  let inventoryCalls = 0;
  CircleWalletService.verifyIdentity = async () => ({ email: "fixture@example.com", circleUserId: "fixture-circle-id" });
  CircleWalletService.listArcWallets = async () => { inventoryCalls++; throw new Error("Inventory is offline"); };
  const wallet = ethers.Wallet.createRandom();
  const challenge = AuthService.issueWalletLoginChallenge(wallet.address, "http://localhost:5173");
  const session = AuthService.verifyWalletLogin(wallet.address, await wallet.signMessage(challenge.challengeMessage), challenge.challengeMessage, challenge.nonce);
  const app = express();
  app.use(express.json());
  app.use("/circle", circleRouter);
  app.use("/faucet", faucetRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, token?: string) => fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  try {
    const login = await post("/circle/session", { userToken: "mock-circle-token", loginAttemptId: "mock-attempt" });
    assert.equal(login.status, 200);
    const loginBody = await login.json() as { token: string; user: { activeWallet: string | null }; walletInitialized: boolean };
    assert.ok(loginBody.token);
    assert.equal(loginBody.user.activeWallet, null);
    assert.equal(loginBody.walletInitialized, false);
    assert.equal(inventoryCalls, 0, "Verified email session must not wait for wallet inventory");
    assert.equal((await post("/faucet/usdc", { address: wallet.address })).status, 401);
    assert.equal((await post("/faucet/usdc", { address: "0x1111111111111111111111111111111111111111" }, session.token)).status, 403);
    assert.equal((await post("/faucet/usdc", { address: "invalid" }, session.token)).status, 400);
    let faucetCalls = 0;
    CircleWalletService.requestArcTestnetTokens = async (recipient) => {
      assert.equal(recipient, wallet.address);
      faucetCalls++;
      await new Promise((resolve) => setTimeout(resolve, 25));
    };
    const attempts = await Promise.all([post("/faucet/usdc", { address: wallet.address }, session.token), post("/faucet/usdc", { address: wallet.address }, session.token)]);
    assert.deepEqual(attempts.map((response) => response.status).sort(), [202, 429]);
    assert.equal(faucetCalls, 1);
    const accepted = await attempts.find((response) => response.status === 202)!.json() as Record<string, unknown>;
    assert.equal(accepted.status, "REQUESTED");
    assert.equal(accepted.txHash, undefined, "A queued faucet request is not a confirmed transaction");
    delete store.db.rateLimits[`arc-faucet:${wallet.address.toLowerCase()}`];
    CircleWalletService.requestArcTestnetTokens = async () => { throw { status: 403 }; };
    const denied = await post("/faucet/usdc", { address: wallet.address }, session.token);
    assert.equal(denied.status, 502);
    assert.equal((await denied.json() as { code: string }).code, "FAUCET_API_ACCESS_REQUIRED");
    console.log("PASS: session independent of inventory; faucet auth, ownership, concurrency, queued semantics and API access errors");
  } finally {
    Object.assign(CircleWalletService, originals);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
