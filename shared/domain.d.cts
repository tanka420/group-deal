export const ClaimType: { readonly BUYER: 0; readonly SELLER: 2 };
export const DeliveryStatus: readonly ["PENDING", "DELIVERED", "CONFIRMED", "DISPUTED", "BREACHED_REFUNDED", "RESOLVED"];
export const CampaignStatus: readonly ["CREATED", "ACTIVE", "FINALIZED", "CANCELLED"];
export type Amount = string;
export interface OrderAccounting {
  committedGross: Amount; rebateAllocated: Amount; buyerRefundAllocated: Amount; sellerAllocated: Amount;
  buyerClaimedAmount?: Amount; sellerClaimedAmount?: Amount; buyerClaimed?: boolean; sellerClaimed?: boolean;
}
export function unsignedAmount(value: string): bigint;
export function v1Rebate(lockedPrice: Amount, finalPrice: Amount, quantity: number, earlyValue: Amount, gross: Amount): Amount;
export function protocolRebate(version:number,lockedPrice:Amount,finalPrice:Amount,quantity:number,earlyValue:Amount,gross:Amount):Amount;
export function orderFunds(order: OrderAccounting): {
  buyerAllocated: string; sellerAllocated: string; buyerClaimedAmount: string | null; sellerClaimedAmount: string | null;
  buyerClaimable: string | null; sellerClaimable: string | null; unallocated: string; accountingVerified: boolean;
};
