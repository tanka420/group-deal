import { ethers } from "ethers";
import { config } from "../config";
import { store } from "../db/store";

export interface ReconciliationReport {
  timestamp: number;
  blockNumber: number;
  totalOrdersCount: number;
  totalGrossCommittedUSDC: string;
  totalRebatesAllocatedUSDC: string;
  totalSellerProceedsUSDC: string;
  totalRefundsAllocatedUSDC: string;
  expectedEscrowLiabilitiesUSDC: string;
  onchainHubBalanceUSDC: string;
  conservationLawPassed: boolean;
  onchainBalanceVerified: boolean;
  status: "HEALTHY" | "DISCREPANCY_DETECTED" | "UNVERIFIED";
  discrepancies: string[];
}

export class ReconciliationService {
  /**
   * Run automated reconciliation between database orders and onchain state.
   */
  public static async runReconciliation(): Promise<ReconciliationReport> {
    const orders = Object.values(store.db.orders);
    let totalGross = 0n;
    let totalRebate = 0n;
    let totalSeller = 0n;
    let totalRefund = 0n;
    let totalExpectedEscrow = 0n;
    const discrepancies: string[] = [];

    // Verify per-order conservation
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
      // What the contract Hub must hold for this order:
      // unallocated + (buyer hasn't claimed yet ? rebate + refund : 0) + (seller hasn't claimed yet ? seller : 0)
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
    let currentBlock = 0;

    try {
      const provider = new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
        staticNetwork: true,
      });
      currentBlock = await provider.getBlockNumber();
      const usdcAbi = ["function balanceOf(address) external view returns (uint256)"];
      const usdcContract = new ethers.Contract(config.usdcAddress, usdcAbi, provider);
      contractBalance = await usdcContract.balanceOf(config.hubAddress);

      if (contractBalance < totalExpectedEscrow) {
        discrepancies.push(
          `Onchain Escrow Shortfall at block ${currentBlock}: Contract holds ${ethers.formatUnits(
            contractBalance,
            6
          )} USDC, but total expected liabilities is ${ethers.formatUnits(totalExpectedEscrow, 6)} USDC`
        );
      }
    } catch (e: any) {
      console.warn("[RECONCILE] Could not query onchain balance:", e.message);
      onchainBalanceVerified = false;
    }

    const report: ReconciliationReport = {
      timestamp: Date.now(),
      blockNumber: currentBlock,
      totalOrdersCount: orders.length,
      totalGrossCommittedUSDC: ethers.formatUnits(totalGross, 6),
      totalRebatesAllocatedUSDC: ethers.formatUnits(totalRebate, 6),
      totalSellerProceedsUSDC: ethers.formatUnits(totalSeller, 6),
      totalRefundsAllocatedUSDC: ethers.formatUnits(totalRefund, 6),
      expectedEscrowLiabilitiesUSDC: ethers.formatUnits(totalExpectedEscrow, 6),
      onchainHubBalanceUSDC: ethers.formatUnits(contractBalance, 6),
      conservationLawPassed: discrepancies.length === 0,
      onchainBalanceVerified,
      status:
        discrepancies.length > 0
          ? "DISCREPANCY_DETECTED"
          : !onchainBalanceVerified
          ? "UNVERIFIED"
          : "HEALTHY",
      discrepancies: !onchainBalanceVerified
        ? [...discrepancies, "Onchain escrow balance unverified: RPC endpoint unreachable"]
        : discrepancies,
    };

    return report;
  }
}
