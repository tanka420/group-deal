import { expect, test } from "@playwright/test";
import { ethers } from "ethers";
import type { BridgeEstimateResult } from "@circle-fin/app-kit";
import { bridgeQuoteSummary, parseUsdc, paymentError } from "../src/services/paymentSafety";
import { assertCommitReceipt } from "../src/services/checkout";
import { readArcRpc, ARC_RPC_ENDPOINTS } from "../src/services/arcRpc";
import { HUB_ABI } from "../src/contracts/hubAbi";
import { messageText } from "../src/utils/uiMessage";

test("USDC arithmetic and fee budgets are exact and fail closed", () => {
  expect(parseUsdc("1.234567")).toBe(1234567n);
  for (const amount of ["0", "-1", "NaN", "1e6", "1.0000001"]) expect(() => parseUsdc(amount)).toThrow();
  const quote = { fees: [{ token: "USDC", amount: "0.01" }], gasFees: [
    { token: "ETH", blockchain: "Ethereum_Sepolia", fees: { fee: "0.000000000000001" } },
    { token: "USDC", blockchain: "Arc_Testnet", fees: { fee: "0.000000000000002" } },
  ] } as BridgeEstimateResult;
  expect(bridgeQuoteSummary(quote, "Ethereum_Sepolia", "1")).toEqual({ received: 990000n, feesUsdc: 10000n, sourceGas: 1200n, arcGas: 2400n });
  expect(() => bridgeQuoteSummary({ ...quote, gasFees: [] }, "Ethereum_Sepolia", "1")).toThrow();
  expect(() => bridgeQuoteSummary({ ...quote, fees: [{ type: "provider", token: "USDC", amount: null }] }, "Ethereum_Sepolia", "1")).toThrow();
  expect(messageText(paymentError({ cause: { code: 4001 } }), "vi")).toContain("Ví đã từ chối");
  expect(messageText(paymentError("Request Signature: User denied request signature."), "vi")).toContain("Ví đã từ chối");
});

test("a purchase requires a matching successful CommitmentMade, not just a tx hash", () => {
  const hubAddress = "0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574";
  const buyer = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
  const txHash = `0x${"1".repeat(64)}`;
  const identity = ethers.id("fixture identity");
  const hub = new ethers.Interface(HUB_ABI);
  const event = hub.encodeEventLog(hub.getEvent("CommitmentMade")!, [1, 2, identity, buyer, 1, 1000000, 1000000, false, 0]);
  const receipt = { status: "0x1", to: hubAddress, from: buyer, transactionHash: txHash, logs: [{ address: hubAddress, ...event }] };
  const expected = { hubAddress, buyer, campaignId: 1, campaignIdentity: identity, quantity: 1, maxGross: 1000000n };
  expect(assertCommitReceipt(receipt, txHash, expected).orderId).toBe("2");
  expect(() => assertCommitReceipt({ ...receipt, status: "0x0" }, txHash, expected)).toThrow();
  expect(() => assertCommitReceipt({ ...receipt, logs: [] }, txHash, expected)).toThrow();
  expect(() => assertCommitReceipt(receipt, txHash, { ...expected, quantity: 2 })).toThrow();
  expect(() => assertCommitReceipt(receipt, txHash, { ...expected, maxGross: 999999n })).toThrow();
  expect(() => assertCommitReceipt(receipt, txHash, { ...expected, campaignId: 3 })).toThrow();
});

test("Arc reads coalesce, skip 429/wrong-chain endpoints and never broadcast", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  let revert = false;
  globalThis.fetch = (async (input, init) => {
    const url = String(input); urls.push(url);
    if (url === ARC_RPC_ENDPOINTS[0]) return new Response("", { status: 429 });
    const batch = JSON.parse(String(init?.body));
    return new Response(JSON.stringify([
      { id: 1, result: url === ARC_RPC_ENDPOINTS[1] ? "0x1" : "0x4cef52" },
      revert ? { id: 2, error: { code: 3, message: "execution reverted" } } : { id: 2, result: "0x123" },
    ]));
  }) as typeof fetch;
  try {
    const params = ["0x73307bdd39d875f98857ffce0fed1cdc62f50b6d", "latest"];
    const values = await Promise.all([readArcRpc("eth_getBalance", params), readArcRpc("eth_getBalance", params)]);
    expect(values).toEqual(["0x123", "0x123"]);
    expect(urls).toEqual(ARC_RPC_ENDPOINTS.slice(0, 3));
    const count = urls.length;
    await expect(readArcRpc("eth_sendRawTransaction", ["0x00"])).rejects.toThrow();
    expect(urls.length).toBe(count);
    revert = true;
    await expect(readArcRpc("eth_call", [{ to: params[0], data: "0x00" }, "latest"])).rejects.toThrow("reverted");
    expect(urls.length, "Contract revert must not be retried on another endpoint").toBe(count + 1);
  } finally { globalThis.fetch = originalFetch; }
});
