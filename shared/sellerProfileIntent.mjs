/** Canonical profile payload and EIP-191 text; callers validate records before use. */
export function sellerProfilePayload(r) { return JSON.stringify({ displayName: r.displayName, bio: r.bio, payoutWallet: r.payoutWallet }); }
export function sellerProfileMessage(r) {
  return [
    "=== GroupDeal Seller Profile Approval ===",
    "Action: CREATE_OR_UPDATE_SELLER_PROFILE",
    `Account: ${r.userId}`,
    `Payout credential: ${r.payoutWallet}`,
    `Profile: ${sellerProfilePayload(r)}`,
    `Profile hash: ${r.profileHash}`,
    `Previous profile: ${r.baseProfileHash}`,
    `Chain ID: ${r.chainId}`,
    `Origin: ${r.origin}`,
    `Request: ${r.id}`,
    `Nonce: ${r.nonce}`,
    `Created: ${r.createdAt}`,
    `Expires: ${r.expiresAt}`,
    "The payout wallet is an already verified sign-in credential of this account.",
    "New campaigns use this payout wallet. Existing campaign payouts and order principals do not change.",
    "Changed profile details require operator review again. Product rights are checked per product version.",
    "This signature does not submit a transaction, spend funds, add a sign-in wallet or change the active wallet.",
    "Proof: SIGN_IN_CREDENTIAL_CONTROLS_PAYOUT",
  ].join("\n");
}
