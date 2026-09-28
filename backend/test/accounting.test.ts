import {
  GroupDealReferenceAccounting,
  MetricType,
  TierConfig,
} from "../src/accounting/referenceModel";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("=== Running Reference Accounting Model Tests ===");

// Test 1: Tier validation
const validTiers: TierConfig[] = [
  { threshold: 1n, price: 100_000000n },
  { threshold: 5n, price: 80_000000n },
  { threshold: 10n, price: 60_000000n },
];
GroupDealReferenceAccounting.validateTiers(validTiers);
console.log("✔ Tier validation passed");

// Test 2: Unlocking tiers
let unlocked = GroupDealReferenceAccounting.computeUnlockedTier(validTiers, 1n, 0);
assert(unlocked === 0, "Metric 1 should unlock tier 0");

unlocked = GroupDealReferenceAccounting.computeUnlockedTier(validTiers, 5n, 0);
assert(unlocked === 1, "Metric 5 should unlock tier 1");

unlocked = GroupDealReferenceAccounting.computeUnlockedTier(validTiers, 12n, 1);
assert(unlocked === 2, "Metric 12 should unlock tier 2");
console.log("✔ Tier progressive unlocking passed");

// Test 3: Commitment & Early Rebate
const terms = {
  metric: MetricType.BUYER_COUNT,
  tiers: validTiers,
  maxPerAccount: 5n,
  inventoryLimit: 50n,
  durationSeconds: 86400,
  deliverySlaSeconds: 86400,
  earlyRebateEnabled: true,
  earlySlotsCount: 2,
  earlyRebateAmount: 10_000000n, // $10
  earlyRebateBps: 0,
  platformFeeBps: 0,
};

// Buyer 1 (1st slot taken)
const c1 = GroupDealReferenceAccounting.calculateCommitment(terms, {
  quantity: 2n,
  currentUnlockedTierIndex: 0,
  isFirstCommitmentOfBuyer: true,
  earlySlotsTaken: 0,
});
assert(c1.committedGross === 200_000000n, "2 * $100 = $200");
assert(c1.isEarlySupporter === true, "Buyer 1 is early supporter");
assert(c1.earlyRebateValue === 10_000000n, "Early rebate = $10");

// Test 4: Final Settlement & Conservation
const s1 = GroupDealReferenceAccounting.calculateRebate(
  {
    lockedUnitPrice: c1.lockedUnitPrice,
    quantity: 2n,
    committedGross: c1.committedGross,
    earlyRebateValue: c1.earlyRebateValue,
  },
  60_000000n // Tier 2 final clearing price = $60
);
// Rebate = (100 - 60) * 2 + 10 = $90
assert(s1.rebateAllocated === 90_000000n, "Rebate should be $90");
assert(s1.remainingGrossPendingDelivery === 110_000000n, "Remaining delivery should be $110");

// Test 5: Dispute Split Conservation
const split = GroupDealReferenceAccounting.calculateDisputeSplit(s1.remainingGrossPendingDelivery, 33);
assert(
  split.buyerShare + split.sellerShare === s1.remainingGrossPendingDelivery,
  "Dispute split must exactly match remaining delivery gross"
);

// Conservation Invariant
const isConserved = GroupDealReferenceAccounting.verifyOrderConservation({
  committedGross: c1.committedGross,
  rebateAllocated: s1.rebateAllocated,
  buyerRefundAllocated: split.buyerShare,
  sellerAllocated: split.sellerShare,
  platformFeeAllocated: 0n,
  unallocated: 0n,
});
assert(isConserved, "Order Conservation Law must hold 100%");
console.log("✔ Commitment, Rebate, Dispute & Conservation Law verified successfully!");
console.log("All Reference Accounting Model tests passed!");
