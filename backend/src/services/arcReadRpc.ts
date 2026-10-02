import { config } from "../config";

/** Chain-checked read-only failover. Never retries or broadcasts transactions. */
export async function readArcContract(data: string): Promise<string> {
  const endpoints = [...new Set([config.arcRpcUrl, ...(config.arcChainId === 5042002 ? [
    "https://rpc.blockdaemon.testnet.arc.io", "https://rpc.drpc.testnet.arc.io", "https://rpc.quicknode.testnet.arc.io",
  ] : [])])];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(3000),
        body: JSON.stringify([
          { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
          { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: config.hubAddress, data }, "latest"] },
        ]),
      });
      if (!response.ok) continue;
      const replies = await response.json() as Array<{ id: number; result?: string; error?: { code: number; message: string } }>;
      if (!Array.isArray(replies)) continue;
      const chain = replies.find((item) => item.id === 1);
      const call = replies.find((item) => item.id === 2);
      if (chain?.error || BigInt(chain?.result || "-1") !== BigInt(config.arcChainId)) continue;
      if (call?.error && (call.error.code === 3 || /revert/i.test(call.error.message))) {
        throw Object.assign(new Error("Arc contract read reverted"), { code: "CALL_EXCEPTION" });
      }
      if (!call?.error && typeof call?.result === "string" && /^0x[0-9a-fA-F]+$/.test(call.result)) return call.result;
    } catch (error) {
      if ((error as { code?: string }).code === "CALL_EXCEPTION") throw error;
    }
  }
  throw new Error("Arc RPC unavailable or wrong network; authorization refused");
}
