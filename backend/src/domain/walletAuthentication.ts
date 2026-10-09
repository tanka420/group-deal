import {ethers} from 'ethers';
import type {WalletChallengeRecord,RateLimitRecord} from '../db/store';
import {readAuthRecoveryBarrier} from './authRecovery';

export class WalletAuthError extends Error {constructor(public code:string,public status=400){super(code);}}
export const walletAddress=(value:unknown):string=>{try{if(typeof value!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(value))throw Error();const wallet=ethers.getAddress(value);if(wallet===ethers.ZeroAddress)throw Error();return wallet;}catch{throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');}};
export function walletAuthContext(value:unknown){try{return readAuthRecoveryBarrier(value)?.context;}catch{throw new WalletAuthError('WALLET_AUTH_UNAVAILABLE',503);}}
export function walletAuthMessage(c:WalletChallengeRecord,timestamp:number):string{
 const login=c.action==='WALLET_LOGIN';return [login?'=== GroupDeal Wallet Login ===':'=== GroupDeal Security Challenge ===',`Action: ${c.action}`,...(login?[]:[`User ID: ${c.userId}`]),`Wallet: ${ethers.getAddress(c.walletAddress)}`,`Chain ID: ${c.chainId}`,`Origin: ${c.origin}`,`Nonce: ${c.nonce}`,`Timestamp: ${timestamp}`,`Expires: ${c.expiresAt}`,...(c.authRecoveryContext?[`Recovery context: ${c.authRecoveryContext}`]:[]),...(login?['This signature does not submit a transaction or spend funds.']:[])].join('\n');
}
export function assertWalletAuthChallenge(c:WalletChallengeRecord|undefined,scope:{action:'WALLET_LOGIN'|'LINK_WALLET';userId:string;wallet:string;chainId:number;context?:string;nonce?:string},message:string,signature:string){
 try{const now=Math.floor(Date.now()/1000),timestamp=Number(/\nTimestamp: (\d+)\nExpires:/.exec(message)?.[1]);
  if(!c||c.action!==scope.action||c.userId!==scope.userId||c.walletAddress!==scope.wallet.toLowerCase()||c.chainId!==scope.chainId||c.authRecoveryContext!==scope.context||scope.nonce!==undefined&&c.nonce!==scope.nonce||typeof c.origin!=='string'||!c.origin||c.origin.length>2000||/[\u0000-\u001f\u007f]/.test(c.origin)||! /^[a-f0-9]{32}$/.test(c.nonce)||!Number.isSafeInteger(timestamp)||timestamp<0||timestamp>now+30||c.expiresAt!==timestamp+300||c.expiresAt<=now||c.message!==message||walletAuthMessage(c,timestamp)!==message||typeof signature!=='string'||!/^0x[0-9a-fA-F]{128}(?:[0-9a-fA-F]{2})?$/.test(signature)||ethers.verifyMessage(message,signature).toLowerCase()!==scope.wallet.toLowerCase())throw Error();
 }catch{throw new WalletAuthError('WALLET_AUTH_CHALLENGE_INVALID');}
}
export type WalletAuthBudget={key:string;limit:number;minimumIntervalMs?:number};
export function walletAuthAdmission(budgets:WalletAuthBudget[],rates:Record<string,RateLimitRecord|undefined>){
 const now=Date.now(),windowMs=600000,writes:{collection:'rateLimits';key:string;value:RateLimitRecord}[]=[];let denied=false;
 for(const b of budgets){const old=rates[b.key];if(old&&(![old.windowStartedAt,old.count,old.lastAttemptAt].every(v=>Number.isSafeInteger(v)&&v>=0)||old.windowStartedAt>now||old.lastAttemptAt>now||old.blockedUntil!==undefined&&(!Number.isSafeInteger(old.blockedUntil)||old.blockedUntil<0)))throw new WalletAuthError('WALLET_AUTH_UNAVAILABLE',503);
  if(old&&(old.blockedUntil!==undefined&&old.blockedUntil>now||now-old.lastAttemptAt<(b.minimumIntervalMs??0))){denied=true;continue;}
  const value=old&&now-old.windowStartedAt<windowMs?{...old}:{windowStartedAt:now,count:0,lastAttemptAt:0};value.count++;value.lastAttemptAt=now;if(value.count>b.limit){value.blockedUntil=value.windowStartedAt+windowMs;denied=true;}writes.push({collection:'rateLimits',key:b.key,value});
 }return{writes,error:denied?new WalletAuthError('WALLET_AUTH_RATE_LIMITED',429):undefined};
}
