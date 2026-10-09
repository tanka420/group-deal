export interface SellerProfileIntent {
  version: 1;
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  payoutWallet: string;
  profileHash: string;
  baseProfileHash: string;
  chainId: number;
  origin: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  state: "PENDING" | "COMMITTED" | "CANCELLED";
  committedAt?: number;
  cancelledAt?: number;
  authRecoveryContext?: string;
  circleSigning?: { state: "REQUESTED" | "READY"; walletId: string; challengeId?: string };
}
