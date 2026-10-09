import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {z} from 'zod';
import type {UserRecord,WalletChallengeRecord} from '../db/store';
export class OperatorEnrollmentError extends Error{constructor(public readonly code:string,public readonly status=400){super(code);}}
const fail=(code:string,status=400):never=>{throw new OperatorEnrollmentError(code,status);};
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v=>ethers.isAddress(v)&&v.toLowerCase()!==ethers.ZeroAddress).transform(v=>ethers.getAddress(v));
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().nonnegative();
const authoritySchema=z.object({chainId:z.number().int().positive(),hubAddress:address,protocolVersion:z.number().int().positive(),operatorAddress:address,authorizedSigner:address,ownerAddress:address,securityAuthority:address,bytecodeHash:hash,blockNumber:time,blockHash:hash,observedAt:time}).strict();
export type OperatorAuthority=z.infer<typeof authoritySchema>;
export const operatorEnrollmentDigest=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function parseOperatorAuthority(value:unknown){const p=authoritySchema.safeParse(value);if(!p.success)fail('OPERATOR_AUTHORITY_UNVERIFIED',503);return p.data!;}
export function assertOperatorAuthority(value:unknown,scope:{chainId:number;hubAddress:string;protocolVersion:number;operatorAddress:string},now=Date.now()){
 const a=parseOperatorAuthority(value);
 if(a.chainId!==scope.chainId||a.hubAddress.toLowerCase()!==scope.hubAddress.toLowerCase()||a.protocolVersion!==scope.protocolVersion||a.operatorAddress.toLowerCase()!==scope.operatorAddress.toLowerCase()||a.observedAt>now+30000||now-a.observedAt>30000||new Set([a.operatorAddress,a.authorizedSigner,a.ownerAddress,a.securityAuthority].map(v=>v.toLowerCase())).size!==4)fail('OPERATOR_AUTHORITY_MISMATCH',403);
 return a;
}
export function sameOperatorAuthority(before:OperatorAuthority,after:OperatorAuthority){
 for(const field of ['chainId','hubAddress','protocolVersion','operatorAddress','authorizedSigner','ownerAddress','securityAuthority','bytecodeHash'] as const)if(before[field]!==after[field])fail('OPERATOR_AUTHORITY_CHANGED',409);
 if(after.blockNumber<before.blockNumber)fail('OPERATOR_AUTHORITY_CHANGED',409);
}
const challengeSchema=z.object({userId:z.string().min(1).max(128),action:z.literal('OPERATOR_ENROLLMENT'),walletAddress:z.string().regex(/^0x[a-f0-9]{40}$/),message:z.string().min(1).max(4096),expiresAt:time,nonce:z.string().regex(/^[a-f0-9]{32}$/),chainId:z.number().int().positive(),origin:z.string().min(1).max(2000).refine(v=>!(/[\u0000-\u001f\u007f]/.test(v))),authRecoveryContext:z.string().min(1).max(1024).optional(),enrollmentAuthority:authoritySchema}).strict();
export type OperatorEnrollmentChallenge=z.infer<typeof challengeSchema>;
export function operatorEnrollmentMessage(c:Omit<OperatorEnrollmentChallenge,'message'>,timestamp:number){
 return ['=== GroupDeal Operator Enrollment ===','Action: OPERATOR_ENROLLMENT','Role: operator','Account: '+c.userId,'Wallet: '+ethers.getAddress(c.walletAddress),'Chain ID: '+c.chainId,'Hub: '+c.enrollmentAuthority.hubAddress,'Origin: '+c.origin,'Authority block: '+c.enrollmentAuthority.blockNumber,'Authority hash: '+c.enrollmentAuthority.blockHash,'Authority digest: '+operatorEnrollmentDigest(c.enrollmentAuthority),'Nonce: '+c.nonce,'Timestamp: '+timestamp,'Expires: '+c.expiresAt,...(c.authRecoveryContext?['Recovery context: '+c.authRecoveryContext]:[]),'This signature requests GroupDeal operator access for this account. It does not submit a transaction or spend funds.'].join('\n');
}
export function assertOperatorEnrollmentSignature(value:WalletChallengeRecord|undefined,scope:{accountId:string;wallet:string;nonce:string;origin:string;context?:string;authority:OperatorAuthority},message:string,signature:string,nowMs=Date.now()){
 const p=challengeSchema.safeParse(value);if(!p.success)fail('OPERATOR_ENROLLMENT_CHALLENGE_INVALID');const c=p.data!,now=Math.floor(nowMs/1000),timestamp=Number(/\nTimestamp: (\d+)\nExpires:/.exec(message)?.[1]);
 if(c.userId!==scope.accountId||c.walletAddress!==scope.wallet.toLowerCase()||c.nonce!==scope.nonce||c.origin!==scope.origin||c.authRecoveryContext!==scope.context||c.chainId!==scope.authority.chainId||c.enrollmentAuthority.hubAddress!==scope.authority.hubAddress||c.enrollmentAuthority.operatorAddress.toLowerCase()!==scope.wallet.toLowerCase()||c.expiresAt<=now||c.expiresAt!==timestamp+300||timestamp>now+30||!Number.isSafeInteger(timestamp)||timestamp<0||c.message!==message||operatorEnrollmentMessage(c,timestamp)!==message)fail('OPERATOR_ENROLLMENT_CHALLENGE_INVALID');
 sameOperatorAuthority(c.enrollmentAuthority,scope.authority);
 try{if(typeof signature!=='string'||!/^0x[0-9a-fA-F]{128}(?:[0-9a-fA-F]{2})?$/.test(signature)||ethers.verifyMessage(message,signature).toLowerCase()!==scope.wallet.toLowerCase())throw Error();}catch{fail('OPERATOR_ENROLLMENT_SIGNATURE_INVALID',403);}
 return c;
}
const recordSchema=z.object({version:z.literal(1),purpose:z.literal('ONCHAIN_OPERATOR_SELF_ENROLLMENT'),role:z.literal('operator'),accountId:z.string().min(1).max(128),walletAddress:address,authority:authoritySchema,nonceDigest:digest,messageDigest:digest,signatureDigest:digest,signatureEncrypted:z.string().min(1).max(1024),messageEncrypted:z.string().min(1).max(16384),challengeEncrypted:z.string().min(1).max(32768),authContextSha256:digest,verifiedAt:time}).strict();
export type OperatorEnrollmentRecord=z.infer<typeof recordSchema>;
export function readOperatorEnrollmentRecord(value:unknown){const p=recordSchema.safeParse(value);if(!p.success)fail('OPERATOR_ENROLLMENT_RECORD_INVALID',503);return p.data!;}
export function assertOperatorEnrollmentAccount(user:UserRecord|undefined,accountId:string,wallet:string,boundUserId:unknown){
 if(!user||user.id!==accountId||!Array.isArray(user.roles)||new Set(user.roles).size!==user.roles.length||user.roles.some(r=>!['buyer','seller','operator'].includes(r)))fail('OPERATOR_ENROLLMENT_ACCOUNT_UNAVAILABLE',503);
 if(user!.activeWallet?.toLowerCase()!==wallet.toLowerCase()||boundUserId!==accountId)fail('OPERATOR_ENROLLMENT_WALLET_NOT_BOUND',403);return user!;
}
