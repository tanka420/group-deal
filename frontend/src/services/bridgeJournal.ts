import { ethers } from 'ethers';
import type { Eip1193Provider } from '../context/ExternalWalletContext';
import { paymentLockKey, withCheckoutLock } from './checkout';
import { bridgeSources } from './paymentSafety';
import { ARC_CHAIN_ID } from './arcRpc';
import { BridgeKind, BridgeOperation, BridgeProof, BridgeRead, BridgeSafetyError, CCTP_MESSAGE_TRANSMITTER, assertBridgeAttestation, assertBridgeMessage, bridgeAbi,
  classifyBridgeTransaction, isTxHash, readBridgeRpc, validateBridgeOperation, verifyBridgeReceipt } from './bridgeRecovery';

type WriteState = 'REQUESTED' | 'BROADCAST' | 'REJECTED';
export type BridgeWrite = { id: string; kind: BridgeKind; chainId: number; state: WriteState; hash?: string; dataHash?: string; nonce?: string; afterBlock?: string };
export type BridgeJournal = { version: 2; id: string; createdAt: number; operation: BridgeOperation; writes: BridgeWrite[];
  settled: boolean; legacyDigest?: string };
export const bridgeJournalKey = (recipient: string) => `groupdeal_bridge:v2:${recipient.toLowerCase()}`;
const legacyKey = (recipient: string) => `groupdeal_bridge:${recipient.toLowerCase()}`;
const digest = (raw: string) => ethers.keccak256(ethers.toUtf8Bytes(raw));
function fail(code = 'BRIDGE_RECORD_INVALID'): never { throw new BridgeSafetyError(code); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(k => keys.includes(k));
const count = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value) && BigInt(value) < 2n ** 64n;
function validateJournal(value: unknown, recipient: string): BridgeJournal {
  if (!record(value) || !hasOnly(value, ['version', 'id', 'createdAt', 'operation', 'writes', 'settled', 'legacyDigest']) || value.version !== 2 ||
    typeof value.id !== 'string' || !/^(?:[\da-f-]{36}|0x[\da-f]{64})$/i.test(value.id) ||
    typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 || typeof value.settled !== 'boolean' ||
    !Array.isArray(value.writes) || value.writes.length > 40 || (value.legacyDigest !== undefined && !isTxHash(value.legacyDigest))) fail();
  const operation = validateBridgeOperation(value.operation);
  if (operation.recipient.toLowerCase() !== recipient.toLowerCase()) fail();
  const writes: BridgeWrite[] = value.writes.map((write: unknown) => {
    if (!record(write) || !hasOnly(write, ['id', 'kind', 'chainId', 'state', 'hash', 'dataHash', 'nonce', 'afterBlock']) ||
      typeof write.id !== 'string' || !/^[\da-f-]{36}$/i.test(write.id) || !['approve', 'burn', 'mint'].includes(String(write.kind)) ||
      write.chainId !== (write.kind === 'mint' ? ARC_CHAIN_ID : bridgeSources[operation.source].chainId) ||
      !['REQUESTED', 'BROADCAST', 'REJECTED'].includes(String(write.state)) || (write.hash !== undefined && !isTxHash(write.hash)) ||
      (write.dataHash !== undefined && !isTxHash(write.dataHash)) || (write.state === 'BROADCAST' && !isTxHash(write.hash)) ||
      (write.state !== 'BROADCAST' && write.hash !== undefined) || (write.nonce !== undefined && !count(write.nonce)) ||
      (write.afterBlock !== undefined && !count(write.afterBlock)) ||
      (value.legacyDigest === undefined && (!isTxHash(write.dataHash) || !count(write.nonce) || !count(write.afterBlock)))) fail();
    return { id: write.id, kind: write.kind as BridgeKind, chainId: write.chainId as number, state: write.state as WriteState,
      ...(write.hash ? { hash: write.hash as string } : {}), ...(write.dataHash ? { dataHash: write.dataHash as string } : {}),
      ...(write.nonce !== undefined ? { nonce: write.nonce as string } : {}), ...(write.afterBlock !== undefined ? { afterBlock: write.afterBlock as string } : {}) };
  });
  if (new Set(writes.map(w => w.id)).size !== writes.length) fail();
  return { version: 2, id: value.id, createdAt: value.createdAt, operation, writes, settled: value.settled,
    ...(value.legacyDigest ? { legacyDigest: value.legacyDigest as string } : {}) };
}

/** Preserve the legacy checkpoint verbatim in its existing key. Its SDK result
 * is a hash hint only, never proof of burn, mint or permission to send again. */
export function loadBridgeJournal(recipient: string, storage: Storage = localStorage, legacySession?: Storage): BridgeJournal | null {
  try {
    const oldLocal = storage.getItem(legacyKey(recipient)), oldSession = legacySession?.getItem(legacyKey(recipient));
    if (oldLocal && oldSession && oldLocal !== oldSession) fail();
    const old = oldLocal || oldSession;
    const raw = storage.getItem(bridgeJournalKey(recipient));
    if (raw) {
      const journal = validateJournal(JSON.parse(raw), recipient);
      // A legacy record may have existed only in another tab's sessionStorage.
      // Its absence does not resolve anything: the v2 record still requires
      // independent receipts. If legacy bytes are available, bind them exactly.
      if (old && journal.legacyDigest !== digest(old)) fail();
      return journal;
    }
    if (!old) return null;
    const value = JSON.parse(old), operation = validateBridgeOperation(value.operation);
    if (value.version !== 1 || operation.recipient.toLowerCase() !== recipient.toLowerCase()) fail();
    const writes: BridgeWrite[] = [];
    const steps = value.result?.steps;
    if (steps !== undefined && !Array.isArray(steps)) fail();
    for (const kind of ['approve', 'burn', 'mint'] as const) {
      const hashes = new Set<string>((steps || []).filter((step: any) => step?.name === kind && isTxHash(step.txHash)).map((step: any) => step.txHash.toLowerCase()));
      if (hashes.size > 1) fail();
      for (const hash of hashes) writes.push({ id: crypto.randomUUID(), kind, chainId: kind === 'mint' ? ARC_CHAIN_ID : bridgeSources[operation.source].chainId, state: 'BROADCAST', hash });
    }
    return { version: 2, id: digest(old), createdAt: 0, operation, writes, settled: false, legacyDigest: digest(old) };
  } catch (error) { if (error instanceof BridgeSafetyError) throw error; return fail('BRIDGE_STORAGE_UNAVAILABLE'); }
}
export function saveBridgeJournal(journal: BridgeJournal, storage: Storage = localStorage) {
  validateJournal(journal, journal.operation.recipient);
  try {
    const key = bridgeJournalKey(journal.operation.recipient), raw = JSON.stringify(journal);
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) fail('BRIDGE_STORAGE_UNAVAILABLE');
  } catch { fail('BRIDGE_STORAGE_UNAVAILABLE'); }
}
export function newBridgeJournal(operation: BridgeOperation, previous: BridgeJournal | null, storage: Storage = localStorage): BridgeJournal {
  if (previous) {
    // This is called only after inspectBridgeJournal returns MINTED/NO_BURN.
    // History is retained; no reset or clearing of an unresolved checkpoint.
    try { storage.setItem(`groupdeal_bridge:history:${previous.id}`, JSON.stringify(previous)); } catch { fail('BRIDGE_STORAGE_UNAVAILABLE'); }
  }
  const next: BridgeJournal = { version: 2, id: crypto.randomUUID(), createdAt: Date.now(), operation: validateBridgeOperation(operation), writes: [], settled: false,
    ...(previous?.legacyDigest ? { legacyDigest: previous.legacyDigest } : {}) };
  saveBridgeJournal(next, storage); return next;
}

export type BridgeInspection = { state: 'UNKNOWN' | 'NO_BURN' | 'BURNED' | 'MINTED'; burn?: BridgeProof; mint?: BridgeProof; receipts?: Array<{writeId:string; proof:BridgeProof}> };
/** Re-read every relevant receipt and canonical block on each recovery. Cached
 * SDK success and browser flags cannot become a final financial state. */
export async function inspectBridgeJournal(journal: BridgeJournal, read?: BridgeRead): Promise<BridgeInspection> {
  if (journal.writes.some(w => w.state === 'REQUESTED')) return { state: 'UNKNOWN' };
  let burn: BridgeProof | undefined, mint: BridgeProof | undefined;
  const receipts: NonNullable<BridgeInspection['receipts']> = [];
  for (const write of journal.writes) {
    if (write.state === 'REJECTED') continue;
    if (!write.hash) return { state: 'UNKNOWN' };
    const proof = await verifyBridgeReceipt(journal.operation, write.kind, write.hash, read, burn?.message);
    if (write.dataHash && write.dataHash.toLowerCase() !== proof.dataHash.toLowerCase()) fail();
    if ((write.nonce !== undefined && write.nonce !== proof.nonce) || (write.afterBlock !== undefined && BigInt(proof.blockNumber) < BigInt(write.afterBlock))) fail();
    receipts.push({writeId:write.id,proof});
    if (write.kind === 'burn' && !proof.reverted) { if (burn) fail(); burn = proof; }
    if (write.kind === 'mint' && !proof.reverted) { if (!burn || mint) fail(); mint = proof; }
  }
  if (mint && burn) return { state: 'MINTED', burn, mint, receipts };
  if (burn) return { state: 'BURNED', burn, receipts };
  return { state: journal.settled && !journal.legacyDigest ? 'NO_BURN' : 'UNKNOWN', receipts };
}
/** Scan all recipients while holding the source and destination wallet locks. */
export async function assertBridgeSourceAvailable(sender: string, exceptId?: string, storage: Storage = localStorage, read?: BridgeRead, legacySession?: Storage) {
  const recipients = new Set<string>();
  try {
    for (const source of [storage, legacySession].filter(Boolean) as Storage[]) {
      for (let i = 0; i < source.length; i++) {
        const key = source.key(i), match = key?.match(/^groupdeal_bridge:(?:v2:)?(0x[\da-f]{40})$/i);
        if (match) recipients.add(match[1]);
      }
    }
  } catch { fail('BRIDGE_STORAGE_UNAVAILABLE'); }
  for (const recipient of recipients) {
    const journal = loadBridgeJournal(recipient, storage, legacySession);
    if (!journal || journal.id === exceptId || journal.operation.sender.toLowerCase() !== sender.toLowerCase()) continue;
    const state = (await inspectBridgeJournal(journal, read)).state;
    if (state !== 'MINTED' && state !== 'NO_BURN') fail('BRIDGE_SOURCE_RESERVED');
  }
}
export async function withBridgeLocks(sender: string, recipient: string, action: () => Promise<void>) {
  const keys = [...new Set([paymentLockKey(sender), paymentLockKey(recipient)])].sort();
  async function lock(index: number): Promise<void> {
    if (index === keys.length) return action();
    await withCheckoutLock(keys[index], () => lock(index + 1));
  }
  await lock(0);
}

const readonly = new Set(['eth_chainId', 'eth_accounts', 'eth_getBalance', 'eth_call', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_getBlockByNumber', 'eth_blockNumber', 'eth_getCode', 'eth_estimateGas', 'eth_getTransactionReceipt', 'eth_getTransactionByHash',
  'eth_getTransactionCount', 'wallet_getCapabilities']);
function rejected(error: unknown) {
  const seen = new Set<unknown>(); let value: any = error;
  for (let i = 0; value && i < 8 && !seen.has(value); i++, value = value.cause || value.error) {
    seen.add(value); if (value.code === 4001 || value.code === 'ACTION_REJECTED' || value.name === 'UserRejectedRequestError') return true;
  }
  return false;
}
/** Restrict SDK signing to this reviewed operation. Capture the wallet hash
 * before the SDK waits for mining; unknown writes can never be silently reset. */
export function guardedBridgeProvider(provider: Eip1193Provider, options: {
  current: () => boolean; operation: BridgeOperation; journal: () => BridgeJournal | null;
  changed: (journal: BridgeJournal) => void; burn?: BridgeProof; retry: boolean; storage?: Storage; read?: BridgeRead;
  reviewWrite?: (request: {kind: BridgeKind; chainId: number; transaction: Record<string,unknown>}) => Promise<(() => void)&{transaction?:Record<string,unknown>}>;
  server?:{reserve:(write:BridgeWrite,transaction:Record<string,unknown>)=>Promise<{write:BridgeWrite;transaction:Record<string,unknown>}>;broadcast:(write:BridgeWrite,hash:string)=>Promise<void>};
}): Eip1193Provider {
  let inWrite = false;
  const current = () => { if (!options.current()) fail('BRIDGE_SESSION_CHANGED'); };
  const persist = (journal: BridgeJournal) => { options.changed(journal); saveBridgeJournal(journal, options.storage); };
  return {
    request: async args => {
      if (readonly.has(args.method)) return provider.request(args);
      current();
      if (args.method === 'wallet_switchEthereumChain') {
        const params = args.params as Array<{ chainId: string }>;
        if (!Array.isArray(params) || params.length !== 1 || ![BigInt(bridgeSources[options.operation.source].chainId), BigInt(ARC_CHAIN_ID)].includes(BigInt(params[0]?.chainId))) fail('BRIDGE_REQUEST_INVALID');
        const result = await provider.request(args); current(); return result;
      }
      if (args.method !== 'eth_sendTransaction' || inWrite) fail('BRIDGE_REQUEST_INVALID');
      inWrite = true;
      try {
        const [chain, accounts] = await Promise.all([provider.request({ method: 'eth_chainId' }), provider.request({ method: 'eth_accounts' })]); current();
        if (!Array.isArray(accounts) || !accounts.length || String(accounts[0]).toLowerCase() !== options.operation.sender.toLowerCase()) fail('BRIDGE_SESSION_CHANGED');
        const params = args.params as Array<any>;
        if (!Array.isArray(params) || params.length !== 1 || !record(params[0]) || Object.keys(params[0]).some(k => !['from','to','data','value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','chainId','type','accessList'].includes(k))) fail('BRIDGE_REQUEST_INVALID');
        let tx = structuredClone(params[0]);const chainId = Number(BigInt(String(chain)));
        const journal = options.journal();
        let burn = options.burn;
        if (chainId === ARC_CHAIN_ID) {
          const burnWrite = journal?.writes.find(w => w.kind === 'burn' && w.hash);
          const hash = burnWrite?.hash || burn?.hash;
          if (!hash) fail('BRIDGE_REBURN_BLOCKED');
          burn = await verifyBridgeReceipt(options.operation, 'burn', hash, options.read); current();
          if (burn.reverted || !burn.message) fail('BRIDGE_REBURN_BLOCKED');
        }
        const kind = classifyBridgeTransaction(tx as any, chainId, options.operation, burn?.message);
        if (options.retry && kind !== 'mint') fail('BRIDGE_REBURN_BLOCKED');
        if (!journal || journal.writes.length >= 40 || journal.operation.sender.toLowerCase() !== options.operation.sender.toLowerCase()) fail();
        for (const prior of journal.writes.filter(w => w.kind === kind && w.state !== 'REJECTED')) {
          if (kind !== 'mint' || !prior.hash) fail('BRIDGE_WRITE_UNRESOLVED');
          const proof = await verifyBridgeReceipt(options.operation, 'mint', prior.hash, options.read, burn?.message); current();
          if (!proof.reverted) fail('BRIDGE_WRITE_UNRESOLVED');
        }
        if (kind === 'mint') {
          const call = bridgeAbi.parseTransaction({ data: String(tx.data) })!;
          const message = assertBridgeMessage(call.args.message, options.operation, true);
          if (!burn?.message) fail();
          await assertBridgeAttestation(options.operation, burn.message, message, options.read); current();
          const used = await (options.read || readBridgeRpc)<string>('Arc_Testnet', 'eth_call', [{ to: CCTP_MESSAGE_TRANSMITTER,
            data: bridgeAbi.encodeFunctionData('usedNonces', [message.nonce]) }, 'latest']); current();
          if (!/^0x[\da-f]{64}$/i.test(used) || BigInt(used) !== 0n) fail('BRIDGE_WRITE_UNRESOLVED');
        }
        const assertReviewed = options.reviewWrite ? await options.reviewWrite({kind,chainId,transaction:structuredClone(tx)}) : undefined; current();
        if(assertReviewed?.transaction){tx=structuredClone(assertReviewed.transaction);if(classifyBridgeTransaction(tx as any,chainId,options.operation,burn?.message)!==kind)fail('BRIDGE_REQUEST_INVALID');}
        const [latestChain, latestAccounts] = await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]); current();
        if(BigInt(String(latestChain))!==BigInt(chainId)||!Array.isArray(latestAccounts)||String(latestAccounts[0]).toLowerCase()!==options.operation.sender.toLowerCase())fail('BRIDGE_SESSION_CHANGED');
        const [nextNonce, block] = await Promise.all([
          provider.request({ method: 'eth_getTransactionCount', params: [options.operation.sender, 'pending'] }),
          provider.request({ method: 'eth_blockNumber' }),
        ]); current();
        let nonce: string, afterBlock: string;
        try { nonce = BigInt(String(nextNonce)).toString(); afterBlock = BigInt(String(block)).toString(); } catch { return fail('BRIDGE_REQUEST_INVALID'); }
        if (!count(nonce) || !count(afterBlock) || (tx.nonce !== undefined && BigInt(String(tx.nonce)).toString() !== nonce)) fail('BRIDGE_REQUEST_INVALID');
        assertReviewed?.(); current();
        let write: BridgeWrite = { id: crypto.randomUUID(), kind, chainId, state: 'REQUESTED', dataHash: ethers.keccak256(String(tx.data)), nonce, afterBlock };
        if(options.server){saveBridgeJournal(journal,options.storage);const prepared=await options.server.reserve(write,{...tx,nonce:ethers.toQuantity(BigInt(nonce)),chainId:ethers.toQuantity(chainId)});current();if(prepared.write.id!==write.id||prepared.write.kind!==kind||prepared.write.chainId!==chainId||prepared.write.state!=='REQUESTED'||prepared.write.dataHash!==write.dataHash||prepared.write.nonce!==nonce||!count(prepared.write.afterBlock))fail('BRIDGE_SERVER_RECORD_INVALID');write=structuredClone(prepared.write);tx=structuredClone(prepared.transaction);assertReviewed?.();const [lastChain,lastAccounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);current();if(BigInt(String(lastChain))!==BigInt(chainId)||!Array.isArray(lastAccounts)||String(lastAccounts[0]).toLowerCase()!==options.operation.sender.toLowerCase())fail('BRIDGE_SESSION_CHANGED');}
        journal.writes.push(write);
        try { persist(journal); current(); }
        catch (error) {
          // The wallet request has not been called. Keep this local cancellation
          // distinct from a provider timeout after submission.
          write.state = 'REJECTED'; try { persist(journal); } catch {} throw error;
        }
        let hash: unknown;
        try { hash = await provider.request({ ...args, params: [{ ...tx, nonce: ethers.toQuantity(BigInt(nonce)) }] }); }
        catch (error) { if (rejected(error)) { write.state = 'REJECTED'; persist(journal); } throw error; }
        if (!isTxHash(hash)) fail('BRIDGE_WRITE_UNRESOLVED');
        write.hash = hash; write.state = 'BROADCAST';
        // Even after logout/unmount, the original journal owns a returned hash.
        persist(journal);if(options.server)await options.server.broadcast(write,hash);return hash;
      } finally { inWrite = false; }
    },
    on: provider.on?.bind(provider), removeListener: provider.removeListener?.bind(provider),
  };
}

/** Import tracking metadata only for an exact prepared write. Financial outcome
 * remains a separate receipt/finality check; missing RPC data never proves no burn. */
export async function attachBridgeRecoveryHash(journal: BridgeJournal, kind: BridgeKind, hash: string, read: BridgeRead, storage: Storage = localStorage) {
  if (!isTxHash(hash)) fail();
  const before = JSON.stringify(journal), candidate = validateJournal(structuredClone(journal), journal.operation.recipient);
  const burnWrite = candidate.writes.find(w => w.kind === 'burn' && w.hash);
  const burn = kind === 'mint' && burnWrite?.hash ? await verifyBridgeReceipt(candidate.operation, 'burn', burnWrite.hash, read) : undefined;
  const pending = candidate.writes.find(w => w.kind === kind && w.state === 'REQUESTED');
  for (const prior of candidate.writes.filter(w => w.kind === kind && w.hash && w.hash.toLowerCase() !== hash.toLowerCase())) {
    if (kind !== 'mint' || !pending || !burn || burn.reverted || !burn.message) fail('BRIDGE_WRITE_UNRESOLVED');
    const previous = await verifyBridgeReceipt(candidate.operation, 'mint', prior.hash!, read, burn.message);
    if (!previous.reverted) fail('BRIDGE_WRITE_UNRESOLVED');
    if (prior.dataHash && prior.dataHash.toLowerCase() !== previous.dataHash.toLowerCase() || prior.nonce !== undefined && prior.nonce !== previous.nonce || prior.afterBlock !== undefined && BigInt(previous.blockNumber) < BigInt(prior.afterBlock)) fail();
  }
  let proof: BridgeProof | {kind:BridgeKind;hash:string;nonce:string;dataHash:string;receiptVerified:false};
  if (pending) {
    if (!isTxHash(pending.dataHash) || !count(pending.nonce) || !count(pending.afterBlock) || pending.chainId !== (kind === 'mint' ? ARC_CHAIN_ID : bridgeSources[candidate.operation.source].chainId)) fail();
    const chain = kind === 'mint' ? 'Arc_Testnet' : candidate.operation.source;
    const quantity = (v: unknown) => { if (typeof v !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(v)) return fail(); return BigInt(v); };
    const identity = (raw: unknown) => {
      if (raw === null || raw === undefined) fail('BRIDGE_HASH_OBSERVATION_PENDING');
      if (!record(raw)) return fail(); const tx = structuredClone(raw), data = tx.input ?? tx.data;
      if (typeof tx.hash !== 'string' || tx.hash.toLowerCase() !== hash.toLowerCase() || typeof tx.from !== 'string' || tx.from.toLowerCase() !== candidate.operation.sender.toLowerCase() || typeof tx.to !== 'string' || !ethers.isAddress(tx.to) || typeof data !== 'string' || data.length > 32770 || !/^0x(?:[0-9a-f]{2})+$/i.test(data) || quantity(tx.chainId) !== BigInt(pending.chainId) || quantity(tx.value) !== 0n || quantity(tx.nonce) !== BigInt(pending.nonce!) || ethers.keccak256(data).toLowerCase() !== pending.dataHash!.toLowerCase()) return fail();
      try { if (classifyBridgeTransaction(tx as unknown as Parameters<typeof classifyBridgeTransaction>[0],pending.chainId,candidate.operation,burn?.message) !== kind) return fail(); } catch { return fail(); }
      if ((tx.blockNumber == null) !== (tx.blockHash == null)) return fail();
      if (tx.blockNumber != null) { if (!isTxHash(tx.blockHash) || quantity(tx.blockNumber) < BigInt(pending.afterBlock!) || tx.transactionIndex != null && quantity(tx.transactionIndex) >= 2n ** 64n) return fail(); }
      else if (tx.transactionIndex != null) return fail();
      return JSON.stringify([hash.toLowerCase(),tx.from.toLowerCase(),tx.to.toLowerCase(),data.toLowerCase(),pending.chainId,pending.nonce]);
    };
    const observe = async () => { let tx: unknown; try { tx = await read(chain,'eth_getTransactionByHash',[hash]); } catch (e) { if (e instanceof BridgeSafetyError) throw e; return fail('BRIDGE_READ_UNAVAILABLE'); } return identity(tx); };
    const first = await observe(); if (await observe() !== first) fail();
    proof = {kind,hash:hash.toLowerCase(),nonce:pending.nonce!,dataHash:pending.dataHash!,receiptVerified:false};
    pending.hash = hash.toLowerCase(); pending.state = 'BROADCAST';
  } else {
    if (!candidate.writes.some(w => w.kind === kind && w.hash?.toLowerCase() === hash.toLowerCase())) fail('BRIDGE_WRITE_UNRESOLVED');
    proof = await verifyBridgeReceipt(candidate.operation,kind,hash,read,burn?.message);
  }
  if (JSON.stringify(journal) !== before) fail();
  saveBridgeJournal(candidate,storage); journal.writes = candidate.writes; return proof;
}
