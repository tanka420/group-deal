import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {z} from 'zod';
import {circleSessionInput,CircleAuthError,circleContext,circlePublicUser} from './circleAuthentication';
import type {UserRecord,RateLimitRecord} from '../db/store';
export const circleWalletInput=z.object({userToken:circleSessionInput.shape.userToken}).strict();
const id=z.string().min(1).max(128).regex(/^[^\s\u0000-\u001f\u007f]+$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
export const circleWalletSelectInput=circleWalletInput.extend({walletId:id}).strict();
export const faucetInput=z.object({address:z.string().regex(/^0x[a-fA-F0-9]{40}$/).refine(v=>ethers.isAddress(v)&&ethers.getAddress(v)!==ethers.ZeroAddress).transform(v=>ethers.getAddress(v))}).strict();
export type CircleArcWallet={walletId:string;address:string;blockchain:'ARC-TESTNET'};
export type CircleWalletAuthority={userId:string;circleUserId:string;context?:string;base:string;wallet?:CircleArcWallet};
export function circleWalletRecord(value:unknown):CircleArcWallet{const p=z.object({walletId:id,address:faucetInput.shape.address,blockchain:z.literal('ARC-TESTNET')}).strict().safeParse(value);if(!p.success)throw new CircleAuthError('CIRCLE_WALLET_INVALID_INPUT');return p.data}
export function circleBoundAccount(user:UserRecord|undefined,userId:string,owner:string|undefined,authRecovery:unknown):CircleWalletAuthority{
 if(!user||user.id!==userId)throw new CircleAuthError('CIRCLE_WALLET_ACCOUNT_UNAVAILABLE',503);circlePublicUser(user);const parsed=id.safeParse(user.circleUserId);if(!parsed.success||owner!==user.id)throw new CircleAuthError('CIRCLE_WALLET_NOT_BOUND',403,'Circle session is not bound to this GroupDeal account');
 const context=circleContext(authRecovery),base=crypto.createHash('sha256').update(JSON.stringify([user.id,parsed.data,context??null,user.activeWallet,user.circleWallet??null])).digest('hex');return{userId:user.id,circleUserId:parsed.data,...(context?{context}:{}),base,...(user.circleWallet?{wallet:circleWalletRecord({walletId:user.circleWallet.walletId,address:user.circleWallet.address,blockchain:user.circleWallet.blockchain})}:{})};
}
export function sameCircleAuthority(initial:CircleWalletAuthority,current:CircleWalletAuthority){if(initial.userId!==current.userId||initial.circleUserId!==current.circleUserId||initial.context!==current.context||initial.base!==current.base)throw new CircleAuthError('CIRCLE_WALLET_AUTHORITY_CHANGED',409)}
export function circleProviderWallets(value:unknown,circleUserId?:string):CircleArcWallet[]{
 if(!Array.isArray(value)||value.length>=100)throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503);const wallets:CircleArcWallet[]=[],ids=new Set<string>(),addresses=new Set<string>();
 for(const v of value){if(!v||typeof v!=='object'||Array.isArray(v))throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503);if(v.blockchain!=='ARC-TESTNET'||v.state!=='LIVE')continue;if(v.accountType!=='EOA'||circleUserId!==undefined&&v.userId!==undefined&&v.userId!==circleUserId)throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503);let wallet:CircleArcWallet;try{wallet=circleWalletRecord({walletId:v.id,address:v.address,blockchain:v.blockchain})}catch{throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503)}if(ids.has(wallet.walletId)||addresses.has(wallet.address.toLowerCase()))throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503);ids.add(wallet.walletId);addresses.add(wallet.address.toLowerCase());wallets.push(wallet)}return wallets;
}
export function faucetRate(value:RateLimitRecord|undefined,now:number):RateLimitRecord{
 if(value&&(![value.count,value.windowStartedAt,value.lastAttemptAt].every(v=>Number.isSafeInteger(v)&&v>=0)||value.windowStartedAt>now||value.lastAttemptAt<value.windowStartedAt||value.lastAttemptAt>now||value.blockedUntil!==undefined&&(!Number.isSafeInteger(value.blockedUntil)||value.blockedUntil<value.windowStartedAt)))throw new CircleAuthError('FAUCET_UNAVAILABLE',503);
 if(value&&(now-value.lastAttemptAt<60000||value.blockedUntil!==undefined&&value.blockedUntil>now))throw new CircleAuthError('FAUCET_RATE_LIMIT',429);const active=value&&now-value.windowStartedAt<3600000;if(active&&value.count>=5)throw new CircleAuthError('FAUCET_RATE_LIMIT',429);return{windowStartedAt:active?value.windowStartedAt:now,lastAttemptAt:now,count:active?value.count+1:1};
}
