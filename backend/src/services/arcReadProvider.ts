import { ethers } from "ethers";
import { config } from "../config";

const READ_METHODS = new Set(["eth_chainId", "eth_call", "eth_blockNumber", "eth_getLogs", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice", "eth_feeHistory", "eth_maxPriorityFeePerGas"]);
const HASH_READS = new Set(["eth_getTransactionByHash", "eth_getTransactionReceipt"]);
// This configured endpoint serves older hash reads but requires individual envelopes.
const SINGLE_REQUEST_RPC = "https://rpc.drpc.testnet.arc.io";

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
    const historyRead = requests.some(r => HASH_READS.has(r.method));
    const endpoints = historyRead ? [...this.endpoints].sort((a,b) => Number(b === SINGLE_REQUEST_RPC) - Number(a === SINGLE_REQUEST_RPC)) : this.endpoints;
    let incomplete: Array<ethers.JsonRpcResult> | undefined;
    let missingCount = Infinity;
    for (const endpoint of endpoints) {
      try {
        const signal = AbortSignal.timeout(5000);
        const send = async (body: unknown) => {
          const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},signal,body:JSON.stringify(body)});
          if (!response.ok) throw new Error("RPC read unavailable");
          return response.json();
        };
        const replies = (endpoint === SINGLE_REQUEST_RPC
          ? await Promise.all([chainIdRequest, ...requests].map(send))
          : await send([chainIdRequest, ...requests])) as Array<(ethers.JsonRpcResult | ethers.JsonRpcError) & {jsonrpc?:string}>;
        if (!Array.isArray(replies)) continue;
        if (replies.length !== requests.length + 1 || new Set(replies.map(r=>r.id)).size !== replies.length || replies.some(r => r.jsonrpc !== "2.0" || ("result" in r) === ("error" in r))) continue;
        const chain = replies.find(r => r.id === -1);
        if (!chain || !("result" in chain) || BigInt(chain.result) !== BigInt(this.expectedChain)) continue;
        const answers = requests.map(r => replies.find(a => a.id === r.id));
        if (answers.some(a => !a)) continue;
        // A genuine contract revert must reach the caller, never be retried as an outage.
        if (answers.some(a => a && "error" in a && a.error.code !== 3 && !/revert/i.test(a.error.message || ""))) continue;
        // Null does not establish that a known historical transaction is pending.
        // Try the remaining fixed endpoints; if all lack evidence, retain null so guards fail closed.
        const missing = answers.filter((a,i) => a && "result" in a && a.result === null && HASH_READS.has(requests[i].method)).length;
        if (missing && !answers.some(a => a && "error" in a)) {
          if (missing < missingCount) { incomplete = answers as Array<ethers.JsonRpcResult>; missingCount = missing; }
          continue;
        }
        // Ethers' base signature says Result[]; its batch dispatcher also handles RPC Error entries.
        return answers as Array<ethers.JsonRpcResult>;
      } catch { /* Endpoint unavailable/malformed/wrong chain. Credentials never enter errors. */ }
    }
    if (incomplete) return incomplete;
    throw new Error("Arc read RPC unavailable or wrong network");
  }
}
