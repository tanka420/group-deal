import { ethers } from "ethers";

export const ARC_CHAIN_ID = 5042002;
export const ARC_RPC_ENDPOINTS = [
  "https://rpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io",
] as const;

const readMethods = new Set([
  "eth_chainId", "eth_getBalance", "eth_call", "eth_gasPrice", "eth_maxPriorityFeePerGas",
  "eth_getBlockByNumber", "eth_blockNumber", "eth_getCode", "eth_estimateGas",
  "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getTransactionCount",
]);
const inFlight = new Map<string, Promise<unknown>>();
const blockedUntil = new Map<string, number>();

/** Read-only, chain-checked RPC failover. No signing or broadcast methods. */
export function readArcRpc<T = string>(method: string, params: unknown[] = []): Promise<T> {
  if (!readMethods.has(method)) return Promise.reject(new Error("RPC chỉ cho phép đọc dữ liệu Arc"));
  const key = JSON.stringify([method, params]);
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const request = (async () => {
    const available = ARC_RPC_ENDPOINTS.filter((url) => (blockedUntil.get(url) || 0) <= Date.now());
    const endpoints = available.length ? available : [...ARC_RPC_ENDPOINTS].sort(
      (left, right) => (blockedUntil.get(left) || 0) - (blockedUntil.get(right) || 0));
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
            { jsonrpc: "2.0", id: 2, method, params },
          ]), signal: AbortSignal.timeout(3_000),
        });
        if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
        const replies = await response.json() as Array<{ id: number; result?: T; error?: { code: number; message: string; data?: unknown } }>;
        if (!Array.isArray(replies)) throw new Error("RPC response is not a batch");
        const network = replies.find((item) => item.id === 1);
        const result = replies.find((item) => item.id === 2);
        if (network?.error || BigInt(String(network?.result)) !== BigInt(ARC_CHAIN_ID)) throw new Error("RPC network mismatch");
        if (result?.error) {
          // A contract revert is not an infrastructure failure. Do not replay it
          // on multiple endpoints or hide its reason behind a balance error.
          if (result.error.code === 3 || result.error.message.toLowerCase().includes("revert")) {
            throw Object.assign(new Error(result.error.message), { code: "CALL_EXCEPTION", data: result.error.data });
          }
          throw new Error("RPC unavailable");
        }
        if (!result || result.result === undefined) throw new Error("Incomplete RPC response");
        return result.result;
      } catch (error) {
        if ((error as { code?: string }).code === "CALL_EXCEPTION") throw error;
        blockedUntil.set(url, Date.now() + 30_000);
      }
    }
    throw new Error("Không thể đọc dữ liệu Arc Testnet. Các RPC đang bận; hãy thử lại sau.");
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

let provider: ethers.BrowserProvider | undefined;
export function getArcReadProvider(): ethers.BrowserProvider {
  provider ||= new ethers.BrowserProvider({
    request: ({ method, params }) => readArcRpc(method, Array.isArray(params) ? params : []),
  }, { name: "Arc Testnet", chainId: ARC_CHAIN_ID }, { cacheTimeout: -1 });
  return provider;
}

export async function readArcBalance(address: string): Promise<bigint> {
  return BigInt(await readArcRpc("eth_getBalance", [ethers.getAddress(address), "latest"]));
}
