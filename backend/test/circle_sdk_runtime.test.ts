import assert from "node:assert/strict";
import { ethers } from "ethers";
import { config } from "../src/config";
import { store } from "../src/db/store";
import { AuthService } from "../src/services/authService";
import { CircleWalletService } from "../src/services/circleWalletService";

async function run() {
  assert.ok(store.filePath.includes("groupdeal-test-"), "Never use the application database");
  // Import the real installed SDK through the service. Mock ONLY remote methods,
  // not SDK exports: declaration-only enums must not accidentally pass this test.
  const service = CircleWalletService as unknown as { client: unknown };
  const original = service.client;
  const circleId = "circle-sdk-runtime-fixture";
  const session = AuthService.createCircleSession(null, circleId);
  const userToken = "fixture-user-token-not-a-real-circle-token";
  const wallet = {
    id: "wallet-runtime-fixture",
    address: ethers.getAddress("0x1111111111111111111111111111111111111111"),
    blockchain: "ARC-TESTNET" as const,
    state: "LIVE",
  };
  let authenticatedId = circleId;
  let wallets: typeof wallet[] = [];
  const initializationRequests: Record<string, any>[] = [];
  const faucetRequests: Record<string, any>[] = [];
  const transactionRequests: Record<string, any>[] = [];
  service.client = {
    getUserStatus: async () => ({ data: { id: authenticatedId, status: "ENABLED" } }),
    listWallets: async () => ({ data: { wallets } }),
    createUserPinWithWallets: async (input: Record<string, any>) => {
      initializationRequests.push(input);
      return { data: { challengeId: "initialization-fixture" } };
    },
    requestTestnetTokens: async (input: Record<string, any>) => {
      faucetRequests.push(input);
      return { data: {} };
    },
    createUserTransactionContractExecutionChallenge: async (input: Record<string, any>) => {
      transactionRequests.push(input);
      return { data: { challengeId: "transaction-fixture" } };
    },
  };
  try {
    authenticatedId = "another-circle-user";
    await assert.rejects(CircleWalletService.initializeArcWallet(session.user.id, userToken), /not bound/);
    assert.equal(initializationRequests.length, 0, "Identity mismatch must never create a wallet");
    authenticatedId = circleId;

    const initialization = await CircleWalletService.initializeArcWallet(session.user.id, userToken);
    assert.deepEqual(initialization, { alreadyInitialized: false, challengeId: "initialization-fixture" });
    assert.equal(initializationRequests[0].accountType, "EOA");
    assert.deepEqual(initializationRequests[0].blockchains, ["ARC-TESTNET"]);
    assert.equal(initializationRequests[0].userToken, userToken);
    await CircleWalletService.initializeArcWallet(session.user.id, userToken);
    assert.equal(initializationRequests[1].idempotencyKey, initializationRequests[0].idempotencyKey);

    wallets = [wallet];
    assert.deepEqual(await CircleWalletService.initializeArcWallet(session.user.id, userToken), {
      alreadyInitialized: true,
      wallet: { walletId: wallet.id, address: wallet.address, blockchain: "ARC-TESTNET" },
    });
    assert.equal(initializationRequests.length, 2, "Existing wallet must not be recreated");

    const originalChainId = config.arcChainId;
    config.arcChainId = 5042002;
    try {
      await CircleWalletService.requestArcTestnetTokens(wallet.address);
      assert.deepEqual(faucetRequests[0], {
        address: wallet.address, blockchain: "ARC-TESTNET", native: true, usdc: false, eurc: false,
      });
      config.arcChainId = 5042;
      await assert.rejects(CircleWalletService.requestArcTestnetTokens(wallet.address), /chỉ dùng cho Arc Testnet/);
      assert.equal(faucetRequests.length, 1, "Never send a mainnet faucet request");
    } finally { config.arcChainId = originalChainId; }

    AuthService.bindCircleWallet(session.user.id, circleId, {
      walletId: wallet.id, address: wallet.address, blockchain: "ARC-TESTNET",
    });
    const usdc = new ethers.Interface(["function approve(address,uint256)"]);
    const input = {
      userId: session.user.id, userToken, walletId: wallet.id,
      contractAddress: config.usdcAddress,
      callData: usdc.encodeFunctionData("approve", [config.hubAddress, 1_000_000n]),
      intent: { type: "USDC_APPROVE" as const, amount: "1000000" },
      operationId: "circle-sdk-runtime-approval",
    };
    assert.deepEqual(await CircleWalletService.createContractChallenge(input), { challengeId: "transaction-fixture" });
    assert.deepEqual(transactionRequests[0].fee, { type: "level", config: { feeLevel: "MEDIUM" } });
    assert.equal(transactionRequests[0].callData, input.callData);
    assert.equal(transactionRequests[0].contractAddress, ethers.getAddress(config.usdcAddress));
    assert.equal(transactionRequests[0].walletId, wallet.id);
    await CircleWalletService.createContractChallenge(input);
    assert.equal(transactionRequests.length, 1, "Completed challenge request must be idempotent");

    await assert.rejects(CircleWalletService.createContractChallenge({
      ...input, operationId: "circle-sdk-runtime-invalid-approval",
      callData: usdc.encodeFunctionData("approve", [wallet.address, 1_000_000n]),
    }), /spender must be GroupDealHub/);
    assert.equal(transactionRequests.length, 1, "Unsafe approval must never reach Circle");
    console.log("PASS: installed Circle SDK runtime, EOA initialization, existing-wallet reuse, native Arc faucet, MEDIUM transaction fee, identity/approval guards and idempotency (remote methods mocked)");
  } finally { service.client = original; }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
