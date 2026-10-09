export interface SellerProfilePayload { displayName: string; bio: string; payoutWallet: string }
export interface SellerProfileMessageRecord extends SellerProfilePayload {
  userId: string; profileHash: string; baseProfileHash: string; chainId: number; origin: string;
  id: string; nonce: string; createdAt: number; expiresAt: number;
}
export function sellerProfilePayload(record: SellerProfilePayload): string;
export function sellerProfileMessage(record: SellerProfileMessageRecord): string;
