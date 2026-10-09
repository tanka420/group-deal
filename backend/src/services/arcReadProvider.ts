import { ethers } from "ethers";
import { config } from "../config";

const READ_METHODS = new Set(["eth_chainId", "eth_call", "eth_blockNumber", "eth_getLogs", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice", "eth_feeHistory", "eth_maxPriorityFeePerGas"]);

/** Chain-checked HTTP failover for reads only. No signer or transaction broadcast. */
export class ArcReadProvider extends ethers.JsonRpcProvider {
  constructor(private readonly endpoints = [...new Set([config.arcRpcUrl, ...(config.arcChainId === 5042002 ? [
    "https://rpc.blockdaemon.testnet.arc.io", "https://rpc.drpc.testnet.arc.io", "https://rpc.quicknode.testnet.arc.io",
  ] : [])])], private readonly expectedChain = config.arcChainId) {
    // Canonical rechecks and nonce/head recovery require a fresh read, even within one event loop.
    super(endpoints[0], expectedChain, { staticNetwork: true, cacheTimeout: -1 });
  }

  async _send(payload: ethers.JsonRpcPayload | Array<ethers.JsonRpcPayload>): Promise<Array<ethers.JsonRpcResult>> {
    const requests = Array.isArray(payload) ? payload : [payload];
    if (requests.some(r => !READ_METHODS.has(r.method))) throw new Error("Read provider rejects mutation RPC methods");
    if (requests.some(r => r.id === -1) || new Set(requests.map(r=>r.id)).size !== requests.length) throw new Error("Invalid read RPC request IDs");
    const chainIdRequest = { jsonrpc: "2.0", id: -1, method: "eth_chainId", params: [] };
    for (const endpoint of this.endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000),
          body: JSON.stringify([chainIdRequest, ...requests]),
        });
        if (!response.ok) continue;
        const replies = await response.json() as Array<(ethers.JsonRpcResult | ethers.JsonRpcError) & {jsonrpc?:string}>;
        if (!Array.isArray(replies)) continue;
        if (replies.length !== requests.length + 1 || new Set(replies.map(r=>r.id)).size !== replies.length || replies.some(r => r.jsonrpc !== "2.0" || ("result" in r) === ("error" in r))) continue;
        const chain = replies.find(r => r.id === -1);
        if (!chain || !("result" in chain) || BigInt(chain.result) !== BigInt(this.expectedChain)) continue;
        const answers = requests.map(r => replies.find(a => a.id === r.id));
        if (answers.some(a => !a)) continue;
        // A genuine contract revert must reach the caller, never be retried as an outage.
        if (answers.some(a => a && "error" in a && a.error.code !== 3 && !/revert/i.test(a.error.message || ""))) continue;
        // Ethers' base signature says Result[]; its batch dispatcher also handles RPC Error entries.
        return answers as Array<ethers.JsonRpcResult>;
      } catch { /* Endpoint unavailable/malformed/wrong chain. Credentials never enter errors. */ }
    }
    throw new Error("Arc read RPC unavailable or wrong network");
  }
}
