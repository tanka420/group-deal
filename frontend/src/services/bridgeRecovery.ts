import {ARC_KIT_CHAIN,ARC_BRIDGE_ENABLED,ARC_EXPLORER} from '../../../shared/network.mjs';
import { ethers } from 'ethers';
import type { AppKit, BridgeResult, ChainDefinition } from '@circle-fin/app-kit';
import { bridgeSources, BridgeSource, parseUsdc } from './paymentSafety';
import { ARC_CHAIN_ID, ARC_RPC_ENDPOINTS, readArcRpc } from './arcRpc';

export type BridgeOperation = { source: BridgeSource; amount: string; recipient: string; sender: string };
export type BridgeKind = 'approve' | 'burn' | 'mint';
export const CCTP_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
export const CCTP_MESSAGE_TRANSMITTER = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';
export const CIRCLE_BRIDGE_CONTRACT = '0xC5567a5E3370d4DBfB0540025078e283e36A363d';
export const ARC_USDC = '0x3600000000000000000000000000000000000000';
const domains: Record<BridgeSource, number> = { Ethereum_Sepolia: 0, Base_Sepolia: 6, Arbitrum_Sepolia: 3 };
const sourceRpc: Record<BridgeSource, readonly string[]> = {
  Ethereum_Sepolia: ['https://ethereum-sepolia-rpc.publicnode.com'],
  Base_Sepolia: ['https://sepolia.base.org'],
  Arbitrum_Sepolia: ['https://sepolia-rollup.arbitrum.io/rpc'],
};
const explorers: Record<BridgeSource | typeof ARC_KIT_CHAIN, string> = {
  Ethereum_Sepolia: 'https://sepolia.etherscan.io/tx/', Base_Sepolia: 'https://sepolia.basescan.org/tx/',
  Arbitrum_Sepolia: 'https://sepolia.arbiscan.io/tx/', Arc_Testnet: 'https://explorer.testnet.arc.io/tx/',Arc:ARC_EXPLORER+'/tx/',
};
export const bridgeAbi = new ethers.Interface([
  'function approve(address spender,uint256 amount)',
  'function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold)',
  'function bridgeWithPreapproval((uint256 amount,uint256 maxFee,uint256 fee,bytes32 mintRecipient,bytes32 destinationCaller,address burnToken,address feeRecipient,uint32 destinationDomain,uint32 minFinalityThreshold) bridgeParams)',
  'function receiveMessage(bytes message,bytes attestation) returns (bool)',
  'function usedNonces(bytes32 nonce) view returns (uint256)',
  'event MessageSent(bytes message)',
  'event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);

export class BridgeSafetyError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'BridgeSafetyError'; }
}
function fail(code = 'BRIDGE_PROOF_INVALID'): never { throw new BridgeSafetyError(code); }
export const isTxHash = (value: unknown): value is string => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const address32 = (address: string) => ethers.zeroPadValue(address, 32).toLowerCase();
const uint = (value: unknown) => { try { return BigInt(String(value)); } catch { return fail(); } };
export function validateBridgeOperation(input: unknown): BridgeOperation {
  if(!ARC_BRIDGE_ENABLED)throw new BridgeSafetyError('MAINNET_BRIDGE_NOT_ENABLED');
  const op = input as BridgeOperation;
  if (!op || !Object.prototype.hasOwnProperty.call(bridgeSources, op.source) || typeof op.amount !== 'string' || op.amount.length > 80 ||
    !ethers.isAddress(op.sender) || !ethers.isAddress(op.recipient) || parseUsdc(op.amount) > ethers.MaxUint256) fail('BRIDGE_RECORD_INVALID');
  return { source: op.source, amount: op.amount, sender: ethers.getAddress(op.sender), recipient: ethers.getAddress(op.recipient) };
}
export function bridgeExplorer(kind: BridgeKind, source: BridgeSource, hash: unknown): string | undefined {
  return isTxHash(hash) ? explorers[kind === 'mint' ? ARC_KIT_CHAIN : source] + hash : undefined;
}

/** Installed SDK chain definitions are checked against the approved testnet route.
 * Never hydrate RPC URLs, contract addresses or SDK config from browser storage. */
export function canonicalBridgeRoute(kit: Pick<AppKit, 'getSupportedChains'>, op: BridgeOperation) {
  const chains = kit.getSupportedChains('bridge');
  function chain(name: string, id: number, usdc: string, domain: number, rpcEndpoints: readonly string[]): ChainDefinition {
    const value = chains.find(c => String(c.chain) === name);
    const contracts = value?.cctp?.contracts.v2;
    if (!value || value.type !== 'evm' || !value.isTestnet || value.chainId !== id || !same(value.usdcAddress, usdc) ||
      value.cctp?.domain !== domain || !contracts || contracts.type !== 'split' ||
      !same(contracts.tokenMessenger, CCTP_TOKEN_MESSENGER) || !same(contracts.messageTransmitter, CCTP_MESSAGE_TRANSMITTER) ||
      !same(value.kitContracts?.bridge, CIRCLE_BRIDGE_CONTRACT)) fail('BRIDGE_ROUTE_INVALID');
    return { ...value, rpcEndpoints };
  }
  return {
    source: chain(op.source, bridgeSources[op.source].chainId, bridgeSources[op.source].usdc, domains[op.source], sourceRpc[op.source]),
    destination: chain(ARC_KIT_CHAIN, ARC_CHAIN_ID, ARC_USDC, 26, ARC_RPC_ENDPOINTS),
  };
}

export type BridgeMessage = { raw: string; nonce: string; sender: string; body: string; executedFinality: bigint; burnHash?: string };
/** CCTP V2 packed header (148 bytes) plus burn body (228 bytes), without hooks.
 * Circle fills nonce/finality/fee/expiry after MessageSent, so immutable binding
 * deliberately excludes those fields. Zero fee and finalized transfer are required. */
export function assertBridgeMessage(raw: unknown, op: BridgeOperation, attested = false): BridgeMessage {
  if (typeof raw !== 'string' || !/^0x[\da-f]+$/i.test(raw) || raw.length !== 2 + 376 * 2) fail();
  const hex = raw.toLowerCase();
  const field = (offset: number, length: number) => '0x' + hex.slice(2 + offset * 2, 2 + (offset + length) * 2);
  const number = (offset: number, length: number) => BigInt(field(offset, length));
  if (number(0, 4) !== 1n || number(4, 4) !== BigInt(domains[op.source]) || number(8, 4) !== 26n ||
    field(44, 32) !== address32(CCTP_TOKEN_MESSENGER) || field(76, 32) !== address32(CCTP_TOKEN_MESSENGER) ||
    field(108, 32) !== ethers.ZeroHash || number(140, 4) !== 2000n || number(148, 4) !== 1n ||
    field(152, 32) !== address32(bridgeSources[op.source].usdc) || field(184, 32) !== address32(op.recipient) ||
    number(216, 32) !== parseUsdc(op.amount) || ![address32(op.sender), address32(CIRCLE_BRIDGE_CONTRACT)].includes(field(248, 32)) ||
    number(280, 32) !== 0n || number(312, 32) !== 0n ||
    (attested && (number(144, 4) < 2000n || field(12, 32) === ethers.ZeroHash))) fail();
  return { raw: hex, nonce: field(12, 32), sender: field(248, 32), body: field(148, 228), executedFinality: number(144, 4) };
}
export function sameBurnMessage(burn: BridgeMessage, mint: BridgeMessage) {
  // Header before nonce; caller/finality request; body through maxFee; empty hook.
  return burn.raw.slice(0, 26) === mint.raw.slice(0, 26) && burn.raw.slice(90, 290) === mint.raw.slice(90, 290) &&
    burn.body.slice(0, 330) === mint.body.slice(0, 330);
}

export type BridgeTransaction = { from: string; to: string; input?: string; data?: string; value?: string; nonce?: string; chainId?: string; hash?: string; blockHash?: string; blockNumber?: string };
export function classifyBridgeTransaction(tx: BridgeTransaction, chainId: number, op: BridgeOperation, burn?: BridgeMessage): BridgeKind {
  if (!same(tx.from, op.sender) || uint(tx.value ?? '0x0') !== 0n || (tx.chainId !== undefined && uint(tx.chainId) !== BigInt(chainId))) fail('BRIDGE_REQUEST_INVALID');
  const data = tx.input ?? tx.data;
  let call: ethers.TransactionDescription | null;
  try { call = bridgeAbi.parseTransaction({ data: String(data) }); } catch { return fail('BRIDGE_REQUEST_INVALID'); }
  if (!call || bridgeAbi.encodeFunctionData(call.fragment, call.args).toLowerCase() !== String(data).toLowerCase()) fail('BRIDGE_REQUEST_INVALID');
  const args = call.args;
  if (chainId === bridgeSources[op.source].chainId) {
    if (call.name === 'approve' && same(tx.to, bridgeSources[op.source].usdc) &&
      [CCTP_TOKEN_MESSENGER, CIRCLE_BRIDGE_CONTRACT].some(a => same(args.spender, a)) && args.amount === parseUsdc(op.amount)) return 'approve';
    const custom = call.name === 'bridgeWithPreapproval' && same(tx.to, CIRCLE_BRIDGE_CONTRACT);
    const direct = call.name === 'depositForBurn' && same(tx.to, CCTP_TOKEN_MESSENGER);
    const p = custom ? args.bridgeParams : args;
    if ((custom || direct) && p.amount === parseUsdc(op.amount) && p.destinationDomain === 26n &&
      same(p.mintRecipient, address32(op.recipient)) && same(p.burnToken, bridgeSources[op.source].usdc) &&
      same(p.destinationCaller, ethers.ZeroHash) && p.maxFee === 0n && p.minFinalityThreshold === 2000n && (!custom || p.fee === 0n)) return 'burn';
  }
  if (chainId === ARC_CHAIN_ID && call.name === 'receiveMessage' && same(tx.to, CCTP_MESSAGE_TRANSMITTER) && burn &&
    typeof args.attestation === 'string' && /^0x[\da-f]+$/i.test(args.attestation) && args.attestation.length <= 4098) {
    const mint = assertBridgeMessage(args.message, op, true);
    if (sameBurnMessage(burn, mint)) return 'mint';
  }
  return fail('BRIDGE_REQUEST_INVALID');
}

export type BridgeRead = <T = unknown>(chain: BridgeSource | typeof ARC_KIT_CHAIN, method: string, params: unknown[]) => Promise<T>;
/** Independent, read-only RPC; wallet chain switches cannot retarget recovery. */
export const readBridgeRpc: BridgeRead = async <T>(chain: BridgeSource | typeof ARC_KIT_CHAIN, method: string, params: unknown[]): Promise<T> => {
  if(!ARC_BRIDGE_ENABLED)throw new BridgeSafetyError('MAINNET_BRIDGE_NOT_ENABLED');
  if(chain==='Arc'||chain==='Arc_Testnet'){if(chain!==ARC_KIT_CHAIN)fail('BRIDGE_READ_INVALID');return readArcRpc<T>(method,params);}
  if (method === 'cctp_attestation') {
    if (params.length !== 1 || !isTxHash(params[0])) fail('BRIDGE_READ_INVALID');
    try {
      const response = await fetch(`https://iris-api-sandbox.circle.com/v2/messages/${domains[chain]}?transactionHash=${params[0]}`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) fail('BRIDGE_READ_UNAVAILABLE');
      return await response.json() as T;
    } catch { return fail('BRIDGE_READ_UNAVAILABLE'); }
  }

  if (!['eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_estimateGas', 'eth_gasPrice', 'eth_getBalance', 'eth_call'].includes(method)) fail('BRIDGE_READ_INVALID');
  for (const url of sourceRpc[chain]) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }, { jsonrpc: '2.0', id: 2, method, params }]) });
      const replies = await response.json();
      if (!response.ok || !Array.isArray(replies) || replies.length !== 2 || replies.filter(r => r.id === 1).length !== 1 || replies.filter(r => r.id === 2).length !== 1) continue;
      const network = replies.find(r => r.id === 1), result = replies.find(r => r.id === 2);
      if (network.error || uint(network.result) !== BigInt(bridgeSources[chain].chainId) || result.error || result.result === undefined) continue;
      return result.result as T;
    } catch { /* Do not expose RPC/provider diagnostics. */ }
  }
  return fail('BRIDGE_READ_UNAVAILABLE');
};
/** V2 nonces are assigned offchain, not present in source MessageSent. Bind the
 * destination nonce to Circle's attestation for this exact source transaction,
 * then require the destination contract's successful receipt. Identical burns
 * may have identical MessageSent bytes but must never share completion proof. */
export async function assertBridgeAttestation(op: BridgeOperation, burn: BridgeMessage, mint: BridgeMessage, read: BridgeRead = readBridgeRpc) {
  if (!isTxHash(burn.burnHash)) fail();
  const result = await read<{ messages?: Array<{ status?: string; message?: string; eventNonce?: string }> }>(op.source, 'cctp_attestation', [burn.burnHash]);
  if (!Array.isArray(result?.messages) || result.messages.length !== 1 || result.messages[0].status !== 'complete') fail('BRIDGE_ATTESTATION_PENDING');
  const entry = result.messages[0], expected = assertBridgeMessage(entry.message, op, true);
  if (!sameBurnMessage(burn, expected) || !same(entry.eventNonce, expected.nonce) || expected.nonce !== mint.nonce || !sameBurnMessage(expected, mint)) fail();
}
type Receipt = { transactionHash: string; from: string; to: string; blockHash: string; blockNumber: string; status: string; logs: Array<{ address: string; topics: string[]; data: string; removed?: boolean }> };
export type BridgeProof = { kind: BridgeKind; hash: string; blockHash: string; blockNumber: string; nonce: string; dataHash: string; reverted: boolean; message?: BridgeMessage };
export async function verifyBridgeReceipt(op: BridgeOperation, kind: BridgeKind, hash: string, read: BridgeRead = readBridgeRpc, burn?: BridgeMessage): Promise<BridgeProof> {
  if (!isTxHash(hash)) fail();
  const chain = kind === 'mint' ? ARC_KIT_CHAIN : op.source;
  const [tx, receipt] = await Promise.all([read<BridgeTransaction | null>(chain, 'eth_getTransactionByHash', [hash]), read<Receipt | null>(chain, 'eth_getTransactionReceipt', [hash])]);
  if (!tx || !receipt) fail('BRIDGE_RECEIPT_PENDING');
  const id = kind === 'mint' ? ARC_CHAIN_ID : bridgeSources[op.source].chainId;
  // A different caller may mint an already attested message; the recipient and
  // burn binding, contract execution and Transfer event still have to match.
  const classified = classifyBridgeTransaction(kind === 'mint' ? { ...tx, from: op.sender } : tx, id, op, burn);
  if (classified !== kind || !same(tx.hash, hash) || !same(receipt.transactionHash, hash) || !same(receipt.from, tx.from) ||
    !same(receipt.to, tx.to) || !isTxHash(receipt.blockHash) || !same(tx.blockHash, receipt.blockHash) || tx.blockNumber !== receipt.blockNumber ||
    !Array.isArray(receipt.logs) || receipt.logs.length > 1000 || ![0n, 1n].includes(uint(receipt.status))) fail();
  const block = await read<{ hash: string; number: string } | null>(chain, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block || !same(block.hash, receipt.blockHash) || uint(block.number) !== uint(receipt.blockNumber)) fail('BRIDGE_RECEIPT_REORG');
  const proof: BridgeProof = { kind, hash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber,
    nonce: uint(tx.nonce).toString(), dataHash: ethers.keccak256(String(tx.input ?? tx.data)), reverted: uint(receipt.status) === 0n };
  if (proof.reverted && kind === 'burn') {
    const finalized = await read<{ number: string } | null>(chain, 'eth_getBlockByNumber', ['finalized', false]);
    if (!finalized || uint(finalized.number) < uint(receipt.blockNumber)) fail('BRIDGE_RECEIPT_PENDING');
  }
  if (proof.reverted || kind === 'approve') return proof;
  const events = receipt.logs.filter(log => !log.removed).map(log => {
    try { return { address: log.address, event: bridgeAbi.parseLog(log) }; } catch { return { address: log.address, event: null }; }
  });
  if (kind === 'burn') {
    const messages = events.filter(row => same(row.address, CCTP_MESSAGE_TRANSMITTER) && row.event?.name === 'MessageSent');
    if (messages.length !== 1) fail();
    const message = assertBridgeMessage(messages[0].event!.args.message, op);
    if (message.sender !== address32(same(tx.to, CIRCLE_BRIDGE_CONTRACT) ? CIRCLE_BRIDGE_CONTRACT : op.sender)) fail();
    proof.message = { ...message, burnHash: hash };
  } else {
    const call = bridgeAbi.parseTransaction({ data: String(tx.input ?? tx.data) })!;
    const message = assertBridgeMessage(call.args.message, op, true);
    if (!burn) fail();
    await assertBridgeAttestation(op, burn, message, read);
    const received = events.filter(row => same(row.address, CCTP_MESSAGE_TRANSMITTER) && row.event?.name === 'MessageReceived' &&
      row.event.args.sourceDomain === BigInt(domains[op.source]) && same(row.event.args.nonce, message.nonce) &&
      same(row.event.args.sender, address32(CCTP_TOKEN_MESSENGER)) && row.event.args.finalityThresholdExecuted >= 2000n && same(row.event.args.messageBody, message.body));
    const transfers = events.filter(row => same(row.address, ARC_USDC) && row.event?.name === 'Transfer' &&
      same(row.event.args.from, ethers.ZeroAddress) && same(row.event.args.to, op.recipient) && row.event.args.value === parseUsdc(op.amount));
    if (received.length !== 1 || transfers.length !== 1) fail();
    proof.message = message;
  }
  return proof;
}

export function bridgeRetryContext(op: BridgeOperation, route: ReturnType<typeof canonicalBridgeRoute>, burn: BridgeProof): BridgeResult<string> {
  if (burn.kind !== 'burn' || burn.reverted || !burn.message || !isTxHash(burn.hash)) fail();
  return { amount: op.amount, token: 'USDC', state: 'error', provider: 'CCTPV2BridgingProvider',
    config: { batchTransactions: false, transferSpeed: 'SLOW', maxFee: '0' },
    source: { chain: route.source, address: op.sender },
    destination: { chain: route.destination, address: op.sender, recipientAddress: op.recipient, useForwarder: false },
    steps: [{ name: 'approve', state: 'noop' }, { name: 'burn', state: 'success', txHash: burn.hash }] };
}
