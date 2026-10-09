import { ethers } from "ethers";
import { config } from "../../src/config";

/** Deterministic local chain fixture with complete transaction/receipt/log coordinates. No live acceptance evidence. */
export function eventProvider(logs: any[], calldata: Record<string, any> = {}, timestamp = (block: number) => 1700000000 + block) {
  const getBlock = async (number: number) => ({number, hash: ethers.id(`block-${number}`), timestamp: timestamp(number)});
  return {
    getNetwork: async () => ({chainId: BigInt(config.arcChainId)}),
    getBlockNumber: async () => Math.max(0, ...logs.map(log => log.blockNumber)),
    getBlock,
    getLogs: async (filter: any) => logs.filter(log => log.blockNumber >= filter.fromBlock && log.blockNumber <= filter.toBlock),
    getTransaction: async (hash: string) => {
      const log = logs.find(log => log.transactionHash.toLowerCase() === hash.toLowerCase());
      if (!log) return null;
      return {hash: log.transactionHash, from: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", to: config.hubAddress,
        chainId: BigInt(config.arcChainId), blockNumber: log.blockNumber, blockHash: log.blockHash, index: log.transactionIndex,
        value: 0n, data: "0x", ...calldata[hash]};
    },
    getTransactionReceipt: async (hash: string) => {
      const matching = logs.filter(log => log.transactionHash.toLowerCase() === hash.toLowerCase());
      if (!matching.length) return null;
      return {hash: matching[0].transactionHash, from: calldata[hash]?.from || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", to: calldata[hash]?.to || config.hubAddress,
        status: 1, blockNumber: matching[0].blockNumber, blockHash: matching[0].blockHash, index: matching[0].transactionIndex, logs: matching};
    },
  };
}
