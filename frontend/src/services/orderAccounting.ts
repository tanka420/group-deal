import { formatUnits } from "ethers";

type ClaimProjection = { accountingVerified?: boolean; buyerClaimable?: string | null; sellerClaimable?: string | null };
export function claimable(order: ClaimProjection, party: "buyer" | "seller"): bigint | null {
  const value = party === "buyer" ? order.buyerClaimable : order.sellerClaimable;
  return order.accountingVerified && typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
}
export function displayUSDC(baseUnits: bigint | string): string { return formatUnits(baseUnits, 6).replace(/\.0$/, ""); }
