/**
 * Reference Accounting Model for GroupDeal
 * Independent offchain specification and verification engine.
 * All calculations use integer arithmetic in base USDC units (6 decimals).
 * Floating point operations are strictly prohibited.
 */

export interface TierConfig {
  threshold: bigint;
  price: bigint; // USDC base units (6 decimals)
}

export enum MetricType {
  BUYER_COUNT = 0,
  UNITS_COUNT = 1,
}

export interface CampaignTermsModel {
  metric: MetricType;
  tiers: TierConfig[];
  maxPerAccount: bigint;
  inventoryLimit: bigint;
  durationSeconds: number;
  deliverySlaSeconds: number;
  earlyRebateEnabled: boolean;
  earlySlotsCount: number;
  earlyRebateAmount: bigint;
  earlyRebateBps: number;
  platformFeeBps: number;
}

export interface OrderCommitmentInput {
  quantity: bigint;
  currentUnlockedTierIndex: number;
  isFirstCommitmentOfBuyer: boolean;
  earlySlotsTaken: number;
  requireEarlySlot?: boolean;
}

export interface OrderAccountingResult {
  lockedUnitPrice: bigint;
  committedGross: bigint;
  isEarlySupporter: boolean;
  earlyRebateValue: bigint;
}

export interface OrderSettlementResult {
  finalClearingPrice: bigint;
  rebateAllocated: bigint;
  remainingGrossPendingDelivery: bigint;
}

export class GroupDealReferenceAccounting {
  /**
   * Validate tier structure: 2-5 tiers, strictly increasing thresholds, strictly decreasing prices.
   */
  public static validateTiers(tiers: TierConfig[]): void {
    if (tiers.length < 2 || tiers.length > 5) {
      throw new Error("Tiers must be between 2 and 5");
    }
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i].threshold <= 0n) throw new Error("Threshold must be > 0");
      if (tiers[i].price <= 0n) throw new Error("Price must be > 0");
      if (i > 0) {
        if (tiers[i].threshold <= tiers[i - 1].threshold) {
          throw new Error("Thresholds must strictly increase");
        }
        if (tiers[i].price >= tiers[i - 1].price) {
          throw new Error("Prices must strictly decrease");
        }
      }
    }
  }

  /**
   * Determine current unlocked tier given the metric progress. Tiers never downgrade.
   */
  public static computeUnlockedTier(
    tiers: TierConfig[],
    currentMetric: bigint,
    previousTierIndex: number = 0
  ): number {
    let tierIndex = previousTierIndex;
    while (tierIndex + 1 < tiers.length) {
      if (currentMetric >= tiers[tierIndex + 1].threshold) {
        tierIndex++;
      } else {
        break;
      }
    }
    return tierIndex;
  }

  /**
   * Calculate commitment gross and early supporter benefit.
   */
  public static calculateCommitment(
    terms: CampaignTermsModel,
    input: OrderCommitmentInput
  ): OrderAccountingResult {
    if (input.quantity <= 0n) {
      throw new Error("Quantity must be > 0");
    }

    const currentTier = terms.tiers[input.currentUnlockedTierIndex];
    if (!currentTier) {
      throw new Error("Invalid tier index");
    }

    const lockedUnitPrice = currentTier.price;
    const committedGross = lockedUnitPrice * input.quantity;

    let isEarlySupporter = false;
    let earlyRebateValue = 0n;

    if (terms.earlyRebateEnabled) {
      if (input.isFirstCommitmentOfBuyer && input.earlySlotsTaken < terms.earlySlotsCount) {
        isEarlySupporter = true;
        if (terms.earlyRebateAmount > 0n) {
          earlyRebateValue = terms.earlyRebateAmount;
        } else if (terms.earlyRebateBps > 0) {
          earlyRebateValue = (lockedUnitPrice * BigInt(terms.earlyRebateBps)) / 10000n;
        }
        if (earlyRebateValue > lockedUnitPrice) {
          earlyRebateValue = lockedUnitPrice;
        }
      } else if (input.requireEarlySlot) {
        throw new Error("Early supporter slot exhausted");
      }
    }

    return {
      lockedUnitPrice,
      committedGross,
      isEarlySupporter,
      earlyRebateValue,
    };
  }

  /**
   * Final clearing calculation at campaign conclusion.
   */
  public static calculateRebate(
    order: {
      lockedUnitPrice: bigint;
      quantity: bigint;
      committedGross: bigint;
      earlyRebateValue: bigint;
    },
    finalClearingPrice: bigint
  ): OrderSettlementResult {
    const unitDiff =
      order.lockedUnitPrice > finalClearingPrice
        ? order.lockedUnitPrice - finalClearingPrice
        : 0n;

    let rebate = unitDiff * order.quantity + order.earlyRebateValue;
    if (rebate > order.committedGross) {
      rebate = order.committedGross;
    }

    const remainingGrossPendingDelivery = order.committedGross - rebate;

    return {
      finalClearingPrice,
      rebateAllocated: rebate,
      remainingGrossPendingDelivery,
    };
  }

  /**
   * Calculate dispute split between buyer and seller preserving conservation.
   */
  public static calculateDisputeSplit(
    remainingGross: bigint,
    buyerPercentage: number // 0 to 100
  ): { buyerShare: bigint; sellerShare: bigint } {
    if (buyerPercentage < 0 || buyerPercentage > 100) {
      throw new Error("Percentage must be 0 to 100");
    }
    const buyerShare = (remainingGross * BigInt(buyerPercentage)) / 100n;
    // Seller share gets exact remainder to prevent rounding leakage
    const sellerShare = remainingGross - buyerShare;

    if (buyerShare + sellerShare !== remainingGross) {
      throw new Error("Conservation invariant violated in dispute split");
    }

    return { buyerShare, sellerShare };
  }

  /**
   * Verify Global Conservation Law for an order:
   * buyerRebate + buyerRefund + sellerProceeds + platformFee + unallocated == committedGross
   */
  public static verifyOrderConservation(order: {
    committedGross: bigint;
    rebateAllocated: bigint;
    buyerRefundAllocated: bigint;
    sellerAllocated: bigint;
    platformFeeAllocated: bigint;
    unallocated: bigint;
  }): boolean {
    const totalAllocated =
      order.rebateAllocated +
      order.buyerRefundAllocated +
      order.sellerAllocated +
      order.platformFeeAllocated +
      order.unallocated;

    return totalAllocated === order.committedGross;
  }
}
