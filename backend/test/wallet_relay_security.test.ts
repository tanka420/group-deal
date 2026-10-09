import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { config } from "../src/config";
import { CircleWalletService } from "../src/services/circleWalletService";
import express from "express";
import { campaignRouter } from "../src/routes/campaignRoutes";
import { publicRouter } from "../src/routes/publicRoutes";
import { store } from "../src/db/store";

async function runWalletPolicyTests() {
  console.log("=== Running Circle User-Controlled Transaction Policy Tests ===");

  const attacker = "0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E";
  const usdc = new ethers.Interface(["function approve(address,uint256)"]);
  const hub = new ethers.Interface([
    "function commitToBuy(uint256,bytes32,uint256,bool,uint256,uint256,bytes) returns (uint256)",
    "function claimBuyerFunds(uint256,uint256[]) returns (uint256)",
  ]);

  const exactApproval = usdc.encodeFunctionData("approve", [config.hubAddress, 25_000_000n]);
  assert.doesNotThrow(() =>
    CircleWalletService.validateTransactionPolicy(config.usdcAddress, exactApproval, {
      type: "USDC_APPROVE",
      amount: "25000000",
    })
  );
  console.log("✔ Exact USDC approval to GroupDealHub accepted");

  assert.throws(
    () =>
      CircleWalletService.validateTransactionPolicy(
        config.usdcAddress,
        usdc.encodeFunctionData("approve", [attacker, 25_000_000n]),
        { type: "USDC_APPROVE", amount: "25000000" }
      ),
    /spender must be GroupDealHub/
  );
  assert.throws(
    () =>
      CircleWalletService.validateTransactionPolicy(
        config.usdcAddress,
        usdc.encodeFunctionData("approve", [config.hubAddress, ethers.MaxUint256]),
        { type: "USDC_APPROVE", amount: ethers.MaxUint256.toString() }
      ),
    /policy limit/
  );
  console.log("✔ Arbitrary spender and unlimited approvals rejected");

  const commit = hub.encodeFunctionData("commitToBuy", [
    12,
    ethers.keccak256(ethers.toUtf8Bytes("identity")),
    2,
    false,
    2,
    Math.floor(Date.now() / 1000) + 300,
    "0x1234",
  ]);
  assert.doesNotThrow(() =>
    CircleWalletService.validateTransactionPolicy(config.hubAddress, commit, {
      type: "COMMIT_BUY",
      campaignId: "12",
      quantity: "2",
    })
  );
  assert.throws(
    () =>
      CircleWalletService.validateTransactionPolicy(config.hubAddress, commit, {
        type: "COMMIT_BUY",
        campaignId: "12",
        quantity: "3",
      }),
    /does not match/
  );
  console.log("✔ Campaign and quantity are bound to the declared purchase intent");

  const claim = hub.encodeFunctionData("claimBuyerFunds", [12, [8, 9]]);
  assert.doesNotThrow(() =>
    CircleWalletService.validateTransactionPolicy(config.hubAddress, claim, {
      type: "CLAIM_BUYER",
      campaignId: "12",
      orderIds: ["8", "9"],
    })
  );
  assert.throws(
    () =>
      CircleWalletService.validateTransactionPolicy(config.hubAddress, claim, {
        type: "CLAIM_BUYER",
        campaignId: "12",
        orderIds: ["9", "8"],
      }),
    /order intent/
  );
  console.log("✔ Claim order IDs are exact and order-sensitive");

  const routeSource = fs.readFileSync(path.resolve(__dirname, "../src/routes/walletRoutes.ts"), "utf8");
  const onchainSource = fs.readFileSync(path.resolve(__dirname, "../src/services/onchainService.ts"), "utf8");
  const campaignRouteSource = fs.readFileSync(path.resolve(__dirname, "../src/routes/campaignRoutes.ts"), "utf8");
  const workerSource = fs.readFileSync(path.resolve(__dirname, "../src/index.ts"), "utf8");
  assert.match(routeSource, /status\(410\)/, "Legacy relayer must remain permanently disabled");
  assert.doesNotMatch(routeSource, /new\s+ethers\.Wallet|sendTransaction\s*\(/, "Backend must not sign user transactions");
  assert.doesNotMatch(onchainSource, /new\s+ethers\.Wallet/, "Onchain service must be read-only");
  assert.doesNotMatch(
    campaignRouteSource,
    /authorizedSignerPrivateKey|createCampaignOnchain/,
    "Campaign publishing must never fall back to a backend signer"
  );
  assert.doesNotMatch(
    campaignRouteSource,
    /onchainCampaignId:\s*Number\(nextId\)/,
    "Drafts must not fabricate an onchain campaign ID before a verified Arc event"
  );
  const app = express(); app.use("/api/campaigns", campaignRouter); app.use("/api/v1", publicRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  try {
    const port = (server.address() as any).port;
    for (const record of [{status:"DRAFT"},{status:"PUBLISHED",projectionOrigin:"CHAIN_UNBOUND"}]) {
      store.db.campaigns.privacy = {id:"privacy",visibility:"PUBLIC",...record} as any;
      for (const route of ["/api/campaigns/privacy","/api/v1/campaigns/privacy","/api/v1/campaigns/privacy/widget-data"]) {
        const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers:{ "x-user-role":"seller" } });
        assert.equal(response.status,404,"Unverified headers cannot expose drafts/unbound chain projections");
      }
      const listing = await fetch(`http://127.0.0.1:${port}/api/v1/campaigns`).then(r=>r.json()) as any;
      assert.ok(!listing.campaigns.some((c:any)=>c.id === "privacy"));
    }
  } finally { delete store.db.campaigns.privacy; await new Promise<void>(resolve=>server.close(()=>resolve())); }
  assert.doesNotMatch(
    workerSource,
    /buyerRefundAllocated\s*=|sellerAllocated\s*=/,
    "Wall-clock workers must not allocate financial state without an Arc event"
  );
  console.log("✔ Legacy signer paths are disabled; financial projection cannot be advanced by a wall-clock worker");

  console.log("All Circle wallet transaction-policy tests passed!\n");
}

runWalletPolicyTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
