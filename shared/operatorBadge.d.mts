export type BadgeState={id:string;email:string;canGrant:boolean;sellerProfile:{displayName:string;payoutWallet:string;verifiedSellerBadge:boolean}};
export type BadgeInput={actorId:string;environmentDigest:string;commandId:string;sellerId:string;expectedProfileDigest:string;verifiedSellerBadge:boolean};
export function badgeStateJson(value:BadgeState):string;
export function badgeEnvironmentJson(chainId:number,hubAddress:string,context?:string|null):string;
export function badgeInputJson(value:BadgeInput):string;
export const badgeReceiptFields:readonly string[];
export function badgeReceiptJson(value:Record<string,unknown>):string;
export function badgeChallengeMessage(value:{userId:string;walletAddress:string;chainId:number;origin:string;nonce:string;expiresAt:number;purpose:BadgeInput&{displayName:string;email:string;payoutWallet:string;canGrant:boolean;currentBadge:boolean;inputDigest:string;issuedAt:number}}):string;
