import { ethers } from "ethers";
import { config } from "../config";
import { store } from "../db/store";

export interface ReconciliationReport {
  timestamp: number;
  blockNumber: number;
  blockHash: string;
  totalOrdersCount: number;
  totalCampaignsCount: number;
  totalGrossCommittedUSDC: string;
  totalRebatesAllocatedUSDC: string;
  totalSellerProceedsUSDC: string;
  totalRefundsAllocatedUSDC: string;
  expectedEscrowLiabilitiesUSDC: string;
  onchainHubBalanceUSDC: string;
  conservationLawPassed: boolean;
  onchainBalanceVerified: boolean;
  indexerLagBlocks: number;
  status: "HEALTHY" | "DISCREPANCY_DETECTED" | "UNVERIFIED" | "STALE" | "ERROR";
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  discrepancies: string[];
}

export class ReconciliationService {
  /**
   * Run automated reconciliation between database orders and onchain state
   * at a fixed block tag/number.
   */
  public static async runReconciliation(options?: {
    fixedBlockNumber?: number;
    customProvider?: any;
  }): Promise<ReconciliationReport> {
    const orders = Object.values(store.db.orders);
    const campaigns = Object.values(store.db.campaigns);
    let totalGross = 0n;
    let totalRebate = 0n;
    let totalSeller = 0n;
    let totalRefund = 0n;
    let totalExpectedEscrow = 0n;
    const discrepancies: string[] = [];

    // Verify per-order conservation law
    for (const o of orders) {
      const gross = BigInt(o.committedGross);
      const rebate = BigInt(o.rebateAllocated || "0");
      const seller = BigInt(o.sellerAllocated || "0");
      const refund = BigInt(o.buyerRefundAllocated || "0");

      totalGross += gross;
      totalRebate += rebate;
      totalSeller += seller;
      totalRefund += refund;

      // Pending delivery unallocated portion
      let unallocated = 0n;
      if (
        o.deliveryStatus === "PENDING" ||
        o.deliveryStatus === "DELIVERED" ||
        o.deliveryStatus === "DISPUTED"
      ) {
        unallocated = gross - rebate - seller - refund;
      }

      const totalAllocated = rebate + seller + refund + unallocated;
      if (totalAllocated !== gross) {
        discrepancies.push(
          `Order ${o.id} violates Conservation Law: gross (${gross}) != sum (${totalAllocated})`
        );
      }

      // Calculate onchain liabilities for this order:
      // Hub must hold: unallocated + (buyer hasn't claimed ? rebate + refund : 0) + (seller hasn't claimed ? seller : 0)
      let orderLiability = unallocated;
      if (!o.buyerClaimed) {
        orderLiability += rebate + refund;
      }
      if (!o.sellerClaimed) {
        orderLiability += seller;
      }
      totalExpectedEscrow += orderLiability;
    }

    let onchainBalanceVerified = true;
    let contractBalance = 0n;
    let targetBlock = options?.fixedBlockNumber || 0;
    let blockHash = "";
    let providerError = "";

    try {
      const provider =
        options?.customProvider ||
        new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
          staticNetwork: true,
        });

      if (!targetBlock) {
        targetBlock = await provider.getBlockNumber();
      }

      const blockInfo = await provider.getBlock(targetBlock);
      if (blockInfo) {
        blockHash = blockInfo.hash || "";
      }

      const usdcAbi = ["function balanceOf(address) external view returns (uint256)"];
      const usdcContract = new ethers.Contract(config.usdcAddress, usdcAbi, provider);

      // Query onchain balance at fixed block
      contractBalance = await usdcContract.balanceOf(config.hubAddress, {
        blockTag: targetBlock,
      });

      if (contractBalance < totalExpectedEscrow) {
        discrepancies.push(
          `Onchain Escrow Shortfall at block ${targetBlock}: Contract holds ${ethers.formatUnits(
            contractBalance,
            6
          )} USDC, but total expected liabilities is ${ethers.formatUnits(
            totalExpectedEscrow,
            6
          )} USDC`
        );
      }
    } catch (e: any) {
      providerError = e.message;
      onchainBalanceVerified = false;
    }

    const lastIndexed = store.db.syncState?.lastIndexedBlock || 0;
    const indexerLagBlocks = targetBlock > 0 ? Math.max(0, targetBlock - lastIndexed) : 0;
    const isStale = indexerLagBlocks > 10;

    let status: ReconciliationReport["status"] = "HEALTHY";
    let severity: ReconciliationReport["severity"] = "NONE";

    if (discrepancies.length > 0) {
      status = "DISCREPANCY_DETECTED";
      severity = "CRITICAL";
    } else if (!onchainBalanceVerified) {
      status = "UNVERIFIED";
      severity = "HIGH";
      discrepancies.push(
        `Onchain escrow balance unverified at target block ${targetBlock}: ${providerError || "RPC endpoint unreachable"}`
      );
    } else if (isStale) {
      status = "STALE";
      severity = "MEDIUM";
      discrepancies.push(
        `Indexer lag detected: lastIndexedBlock (${lastIndexed}) is ${indexerLagBlocks} blocks behind targetBlock (${targetBlock})`
      );
    }

    return {
      timestamp: Date.now(),
      blockNumber: targetBlock,
      blockHash,
      totalOrdersCount: orders.length,
      totalCampaignsCount: campaigns.length,
      totalGrossCommittedUSDC: ethers.formatUnits(totalGross, 6),
      totalRebatesAllocatedUSDC: ethers.formatUnits(totalRebate, 6),
      totalSellerProceedsUSDC: ethers.formatUnits(totalSeller, 6),
      totalRefundsAllocatedUSDC: ethers.formatUnits(totalRefund, 6),
      expectedEscrowLiabilitiesUSDC: ethers.formatUnits(totalExpectedEscrow, 6),
      onchainHubBalanceUSDC: ethers.formatUnits(contractBalance, 6),
      conservationLawPassed: discrepancies.filter((d) => d.includes("Conservation Law")).length === 0,
      onchainBalanceVerified,
      indexerLagBlocks,
      status,
      severity,
      discrepancies,
    };
  }
}
