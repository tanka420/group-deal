import { ethers } from "ethers";
import { config } from "../config";

const equal = (left: unknown, right: unknown) => typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
export const eventIndex = (log: any): number => log.index ?? log.logIndex;
export const eventDigest = (log: any): string => ethers.keccak256(ethers.concat([...log.topics, log.data]));

export function validateEventCoordinates(log: any): void {
  if (!ethers.isAddress(log.address) || !ethers.isHexString(log.transactionHash, 32) || !ethers.isHexString(log.blockHash, 32)
    || !Number.isSafeInteger(log.blockNumber) || log.blockNumber < config.deploymentBlock
    || !Number.isSafeInteger(log.transactionIndex) || log.transactionIndex < 0
    || !Number.isSafeInteger(eventIndex(log)) || eventIndex(log) < 0 || log.removed === true
    || !Array.isArray(log.topics) || !log.topics.length || log.topics.some((topic: unknown) => !ethers.isHexString(topic, 32))
    || !ethers.isHexString(log.data)) throw new Error("EVENT_EVIDENCE_INVALID: malformed or removed log");
}

export async function readCanonicalBlock(provider: any, number: number): Promise<any> {
  const block = await provider.getBlock(number);
  if (!block || block.number !== number || !ethers.isHexString(block.hash, 32) || !Number.isSafeInteger(block.timestamp) || block.timestamp < 0)
    throw new Error("EVENT_EVIDENCE_INVALID: canonical block unavailable");
  return block;
}

/** Read-only proof. A Hub event may originate inside a Safe transaction, so the outer target is bound to its receipt, not assumed to be the Hub. */
export async function readEventTransaction(provider: any, log: any, block: any): Promise<{tx: any; receipt: any}> {
  validateEventCoordinates(log);
  const [tx, receipt] = await Promise.all([provider.getTransaction(log.transactionHash), provider.getTransactionReceipt(log.transactionHash)]);
  if (!tx || !receipt || receipt.status !== 1 || !equal(tx.hash, log.transactionHash) || !equal(receipt.hash, log.transactionHash)
    || BigInt(tx.chainId ?? -1) !== BigInt(config.arcChainId) || !ethers.isAddress(tx.from) || !equal(tx.from, receipt.from)
    || !equal(tx.to || "", receipt.to || "") || tx.blockNumber !== log.blockNumber || receipt.blockNumber !== log.blockNumber
    || !equal(tx.blockHash, block.hash) || !equal(receipt.blockHash, block.hash) || !equal(log.blockHash, block.hash)
    || tx.index !== log.transactionIndex || receipt.index !== log.transactionIndex || !Array.isArray(receipt.logs))
    throw new Error("EVENT_EVIDENCE_INVALID: transaction/receipt/block binding mismatch or unavailable receipt");
  const indices = new Set<number>();
  for (const item of receipt.logs) {
    validateEventCoordinates(item);
    if (!equal(item.transactionHash, tx.hash) || !equal(item.blockHash, block.hash) || item.blockNumber !== block.number
      || item.transactionIndex !== receipt.index || indices.has(eventIndex(item))) throw new Error("EVENT_EVIDENCE_INVALID: receipt log binding mismatch");
    indices.add(eventIndex(item));
  }
  const matches = receipt.logs.filter((item: any) => eventIndex(item) === eventIndex(log));
  if (matches.length !== 1 || !equal(matches[0].address, log.address) || eventDigest(matches[0]) !== eventDigest(log))
    throw new Error("EVENT_EVIDENCE_INVALID: RPC log differs from successful receipt");
  return {tx, receipt};
}
