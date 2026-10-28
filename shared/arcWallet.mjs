import {ARC_CHAIN_ID,ARC_KIT_CHAIN,ARC_IS_MAINNET} from './network.mjs';
export const ARC_WALLET_CHAIN_ID=ARC_CHAIN_ID;
export const ARC_WALLET_CHAIN=ARC_KIT_CHAIN;
// Mainnet swap is closed until a route and its runtime code have been reviewed.
export const ARC_SWAP_ADAPTER=ARC_IS_MAINNET?'': '0xbbd70b01a1cabc96d5b7b129ae1aaabdf50dd40b';
export const ARC_WALLET_TOKENS=Object.freeze(ARC_IS_MAINNET?{
 USDC:Object.freeze({symbol:'USDC',address:'0x3600000000000000000000000000000000000000',decimals:6}),
}:{
 USDC:Object.freeze({symbol:'USDC',address:'0x3600000000000000000000000000000000000000',decimals:6}),
 EURC:Object.freeze({symbol:'EURC',address:'0x89b50855aa3be2f677cd6303cec089b5f319d72a',decimals:6}),
 cirBTC:Object.freeze({symbol:'cirBTC',address:'0xf0c4a4ce82a5746abaad9425360ab04fbba432bf',decimals:8}),
});
export function arcWalletToken(symbol){const token=Object.hasOwn(ARC_WALLET_TOKENS,symbol)?ARC_WALLET_TOKENS[symbol]:undefined;if(!token)throw Error('WALLET_TOKEN_UNSUPPORTED');return token;}
export function parseWalletAmount(value,symbol){const token=arcWalletToken(symbol);if(typeof value!=='string'||value.length>80||! /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value))throw Error('WALLET_AMOUNT_INVALID');const [whole,fraction='']=value.split('.');if(fraction.length>token.decimals)throw Error('WALLET_AMOUNT_PRECISION');const amount=BigInt(whole)*10n**BigInt(token.decimals)+BigInt(fraction.padEnd(token.decimals,'0'));if(amount<=0n||amount>=2n**256n)throw Error('WALLET_AMOUNT_INVALID');return amount;}
export function formatWalletAmount(value,symbol){const token=arcWalletToken(symbol);if(typeof value!=='bigint'||value<0n||value>=2n**256n)throw Error('WALLET_AMOUNT_INVALID');const divisor=10n**BigInt(token.decimals),fraction=(value%divisor).toString().padStart(token.decimals,'0').replace(/0+$/,'');return (value/divisor).toString()+(fraction?'.'+fraction:'');}
