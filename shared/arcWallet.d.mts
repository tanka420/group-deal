export type ArcWalletToken='USDC'|'EURC'|'cirBTC';
export type ArcToken={readonly symbol:ArcWalletToken;readonly address:string;readonly decimals:6|8};
export const ARC_WALLET_CHAIN_ID:import('./network.mjs').ArcChainId;
export const ARC_WALLET_CHAIN:'Arc'|'Arc_Testnet';
export const ARC_SWAP_ADAPTER:string;
export const ARC_WALLET_TOKENS:Readonly<{USDC:ArcToken}&Partial<Record<ArcWalletToken,ArcToken>>>;
export function arcWalletToken(symbol:string):ArcToken;
export function parseWalletAmount(value:string,symbol:ArcWalletToken):bigint;
export function formatWalletAmount(value:bigint,symbol:ArcWalletToken):string;
