import assert from "node:assert/strict";
import { ethers } from "ethers";
import { config } from "../src/config";
import { store } from "../src/db/store";
import { AuthService } from "../src/services/authService";
import { AuthorizationService } from "../src/services/authorizationService";
import { readArcContract } from "../src/services/arcReadRpc";
import { deriveCampaignIdentity } from "../src/utils/crypto";

async function run() {
  assert.ok(store.filePath.includes("groupdeal-test-"));
  const originalFetch = globalThis.fetch;
  const originalConfig = { arcRpcUrl: config.arcRpcUrl, arcChainId: config.arcChainId, hubAddress: config.hubAddress, authorizedSignerPrivateKey: config.authorizedSignerPrivateKey };
  const signer = ethers.Wallet.createRandom();
  const buyer = ethers.Wallet.createRandom().address;
  Object.assign(config, { arcRpcUrl: "https://fixture.invalid", arcChainId: 5042002, hubAddress: ethers.Wallet.createRandom().address, authorizedSignerPrivateKey: signer.privateKey });
  const session = AuthService.createCircleSession("fixture@example.com", "fixture-circle");
  store.db.users[session.user.id].activeWallet = buyer;
  const id = "fixture-campaign";
  store.db.campaigns[id] = { id, status: "ACTIVE", onchainCampaignId: 1, endTime: Math.floor(Date.now() / 1000) + 3600,
    maxPerAccount: 10, inventoryLimit: 100, totalUnitsCommitted: 2, termsHash: ethers.id("fixture terms") } as any;
  store.db.orders["fixture-old-order"] = { campaignId: id, campaignIdentity: deriveCampaignIdentity(session.user.id, id), quantity: 2, buyerPrincipal: buyer } as any;
  const hub = new ethers.Interface([
    "function campaignIdentityPrincipals(uint256,bytes32) view returns(address)",
    "function identityNonces(uint256,bytes32) view returns(uint256)",
  ]);
  let requests = 0;
  let mode: "fallback" | "offline" | "revert" = "fallback";
  globalThis.fetch = (async (url, init) => {
    requests++;
    if (mode === "offline" || String(url).includes("fixture.invalid")) return new Response("", { status: 429 });
    const batch = JSON.parse(String(init?.body));
    const principal = batch[1].params[0].data.startsWith(hub.getFunction("campaignIdentityPrincipals")!.selector);
    const value = hub.encodeFunctionResult(principal ? "campaignIdentityPrincipals" : "identityNonces", [principal ? buyer : 7n]);
    return new Response(JSON.stringify([
      { id: 1, result: String(url).includes("blockdaemon") ? "0x1" : "0x4cef52" },
      mode === "revert" ? { id: 2, error: { code: 3, message: "execution reverted" } } : { id: 2, result: value },
    ]), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    for (const quantity of [-1, 0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(AuthorizationService.generateBuyAuthorization(session.user.id, id, quantity, buyer), /positive safe integer/);
    }
    assert.equal(requests, 0, "Invalid quantities must not perform RPC reads");
    const result = await AuthorizationService.generateBuyAuthorization(session.user.id, id, 1, buyer);
    assert.equal(result.nonce, 7);
    assert.equal(result.maxQuantity, 3, "Authorization limit must include earlier units");
    assert.ok(result.signature.startsWith("0x"));
    assert.equal(requests, 6, "Each read skips 429 and wrong-chain endpoints");
    mode = "offline";
    await assert.rejects(AuthorizationService.generateBuyAuthorization(session.user.id, id, 1, buyer), /Fail-Closed/);
    mode = "revert";
    await assert.rejects(readArcContract(hub.encodeFunctionData("identityNonces", [1, ethers.ZeroHash])), /reverted/);
    console.log("PASS: checkout quantity validation, cumulative authorization, RPC 429/wrong-chain fallback and fail-closed reads");
  } finally { globalThis.fetch = originalFetch; Object.assign(config, originalConfig); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
