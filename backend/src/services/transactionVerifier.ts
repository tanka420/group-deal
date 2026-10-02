import { ethers } from "ethers";
import { config } from "../config";
import { store } from "../db/store";
import { HUB_ABI } from "../contracts/hubAbi";

export interface TransactionIntent {
  intentId: string;
  expectedTo: string;
  expectedSender?: string;
  expectedFunction?: string;
  expectedCalldata?: string;
  expectedEvent: string;
  expectedEventArgs?: Record<string, any>;
}

export interface VerificationResult {
  verified: boolean;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  status: number;
  parsedEvent: any;
  eventName: string;
}

export class TransactionVerifier {
  private static provider: ethers.JsonRpcProvider | null = null;
  private static hubInterface = new ethers.Interface(HUB_ABI as any);

  public static getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
        staticNetwork: true,
      });
    }
    return this.provider;
  }

  /**
   * Fail-closed verification of an expected transaction against live Arc state.
   */
  public static async verifyExpectedTransaction(
    intent: TransactionIntent,
    txHash: string
  ): Promise<VerificationResult> {
    if (!txHash || !ethers.isHexString(txHash, 32)) {
      throw new Error(`[Verifier] Invalid transaction hash format: '${txHash}'. Must be 32-byte hex.`);
    }

    const normalizedTxHash = txHash.toLowerCase();

    // 1. Anti-Replay: Check if txHash has already been consumed for another intent
    if (!store.db.consumedTxHashes) {
      store.db.consumedTxHashes = {};
    }
    const previousConsumption = store.db.consumedTxHashes[normalizedTxHash];
    if (previousConsumption && previousConsumption.intentId !== intent.intentId) {
      throw new Error(
        `[Verifier Security] Transaction ${normalizedTxHash} was already consumed by intent '${previousConsumption.intentId}'. Replay strictly blocked!`
      );
    }

    const provider = this.getProvider();

    // 2. Fetch Transaction and Receipt
    let tx: ethers.TransactionResponse | null = null;
    let receipt: ethers.TransactionReceipt | null = null;

    try {
      [tx, receipt] = await Promise.all([
        provider.getTransaction(normalizedTxHash),
        provider.getTransactionReceipt(normalizedTxHash),
      ]);
    } catch (err: any) {
      throw new Error(`[Verifier] RPC error fetching transaction ${normalizedTxHash}: ${err.message}`);
    }

    if (!tx) {
      throw new Error(`[Verifier] Transaction ${normalizedTxHash} not found in mempool or block. Pending or dropped.`);
    }

    if (!receipt) {
      throw new Error(`[Verifier] Receipt for ${normalizedTxHash} not found. Transaction is still PENDING_FINALITY.`);
    }

    // 3. Status Check: Must be 1 (Success)
    if (receipt.status !== 1) {
      throw new Error(`[Verifier] Transaction ${normalizedTxHash} reverted onchain. Receipt status is 0.`);
    }

    // 4. Arc Deterministic Finality Verification: Block Number must be present
    if (receipt.blockNumber === null || receipt.blockNumber === undefined) {
      throw new Error(`[Verifier] Transaction ${normalizedTxHash} has not reached Arc finality.`);
    }

    // 5. Target Contract Verification
    const normalizedExpectedTo = ethers.getAddress(intent.expectedTo).toLowerCase();
    const actualTo = tx.to ? ethers.getAddress(tx.to).toLowerCase() : "";
    if (actualTo !== normalizedExpectedTo) {
      throw new Error(
        `[Verifier Security] Destination contract mismatch: expected ${normalizedExpectedTo}, got ${actualTo}. Fraud attempt blocked!`
      );
    }

    // 6. Sender/Principal Verification (if specified)
    const actualFrom = ethers.getAddress(tx.from).toLowerCase();
    if (intent.expectedSender) {
      const normalizedExpectedSender = ethers.getAddress(intent.expectedSender).toLowerCase();
      if (actualFrom !== normalizedExpectedSender) {
        throw new Error(
          `[Verifier Security] Caller principal mismatch: expected ${normalizedExpectedSender}, got ${actualFrom}. Unauthorized execution blocked!`
        );
      }
    }

    // 7. Function Call / Selector Verification (if specified)
    if (intent.expectedFunction) {
      try {
        const parsedTx = this.hubInterface.parseTransaction({ data: tx.data, value: tx.value });
        if (!parsedTx || parsedTx.name !== intent.expectedFunction) {
          throw new Error(
            `[Verifier Security] Function calldata mismatch: expected '${intent.expectedFunction}', but tx executed '${parsedTx?.name || "unknown"}'.`
          );
        }
      } catch (err: any) {
        throw new Error(`[Verifier Security] Failed to decode calldata against Hub ABI: ${err.message}`);
      }
    }

    if (
      intent.expectedCalldata &&
      tx.data.toLowerCase() !== intent.expectedCalldata.toLowerCase()
    ) {
      throw new Error("[Verifier Security] Transaction calldata does not match the immutable server intent.");
    }

    // 8. Log Emitter & Event Arguments Verification
    let matchingEventLog: ethers.LogDescription | null = null;
    for (const log of receipt.logs) {
      const emitter = ethers.getAddress(log.address).toLowerCase();
      if (emitter !== normalizedExpectedTo) {
        continue; // Ignore logs from other contracts
      }

      try {
        const parsed = this.hubInterface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (parsed && parsed.name === intent.expectedEvent) {
          matchingEventLog = parsed;
          break;
        }
      } catch {
        // Not a matching event from this interface
      }
    }

    if (!matchingEventLog) {
      throw new Error(
        `[Verifier Security] Required event '${intent.expectedEvent}' was not emitted by contract ${normalizedExpectedTo} in tx ${normalizedTxHash}.`
      );
    }

    // 9. Event Parameter Verification (e.g. campaignId, orderId, proofHash)
    if (intent.expectedEventArgs) {
      for (const [key, expectedVal] of Object.entries(intent.expectedEventArgs)) {
        const actualVal = matchingEventLog.args[key];
        if (actualVal === undefined) {
          throw new Error(`[Verifier Security] Event '${intent.expectedEvent}' missing expected field '${key}'.`);
        }

        const normActual = typeof actualVal === "bigint" ? actualVal.toString() : String(actualVal).toLowerCase();
        const normExpected = typeof expectedVal === "bigint" ? expectedVal.toString() : String(expectedVal).toLowerCase();

        if (normActual !== normExpected) {
          throw new Error(
            `[Verifier Security] Event argument mismatch for '${key}': expected ${normExpected}, received ${normActual}. Transaction rejected!`
          );
        }
      }
    }

    // 10. Record into consumed transaction hashes
    store.db.consumedTxHashes[normalizedTxHash] = {
      intentId: intent.intentId,
      blockNumber: receipt.blockNumber,
      verifiedAt: Date.now(),
    };
    store.save();

    return {
      verified: true,
      txHash: normalizedTxHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      from: actualFrom,
      to: actualTo,
      status: receipt.status,
      parsedEvent: matchingEventLog.args,
      eventName: matchingEventLog.name,
    };
  }
}
