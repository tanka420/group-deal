import {ARC_CHAIN_ID} from '../../../shared/network.mjs';
import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {z} from 'zod';
import {CircleAuthError} from './circleAuthentication';
import type {CircleWalletAuthority} from './circleWalletAuthority';
import type {CircleTransactionIntent} from './circleTransactionPolicy';
const id=z.string().min(1).max(128).regex(/^[^\s\u0000-\u001f\u007f]+$/).refine(v=>!['constructor','prototype','__proto__'].includes(v)),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().nonnegative().safe(),address=z.string().refine(v=>ethers.isAddress(v)&&ethers.getAddress(v)!==ethers.ZeroAddress);
const receipt=z.object({operationId:z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),userId:id,walletId:id,payloadHash:hash,idempotencyKey:z.string().uuid(),createdAt:time,version:z.literal(2),state:z.enum(['REQUESTED','READY']),circleUserId:id,walletAddress:address,chainId:z.literal(ARC_CHAIN_ID),contractAddress:address,calldataHash:hash,intentType:id,authorityBase:hash,policyDigest:hash,requestId:z.string().uuid(),authRecoveryContext:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),challengeId:id.optional(),completedAt:time.optional()}).strict();
export type CircleChallengeReceipt=z.infer<typeof receipt>;
export type CircleChallengeBinding={userId:string;walletId:string;contractAddress:string;callData:string;intent:CircleTransactionIntent;operationId:string};
export const circleChallengeHash=(text:string)=>crypto.createHash('sha256').update(text).digest('hex');
export const circleChallengeRequestDigest=(r:CircleChallengeReceipt)=>circleChallengeHash(JSON.stringify([r.version,r.operationId,r.userId,r.walletId,r.payloadHash,r.idempotencyKey,r.createdAt,r.circleUserId,r.walletAddress.toLowerCase(),r.chainId,r.contractAddress.toLowerCase(),r.calldataHash,r.intentType,r.authorityBase,r.policyDigest,r.requestId,r.authRecoveryContext??null]));
export const circleChallengeCompletionDigest=(r:CircleChallengeReceipt)=>circleChallengeHash(JSON.stringify([circleChallengeRequestDigest(r),r.challengeId,r.completedAt]));
export function circleChallengePayload(input:CircleChallengeBinding){return circleChallengeHash(JSON.stringify({userId:input.userId,walletId:input.walletId,contractAddress:ethers.getAddress(input.contractAddress),callData:input.callData.toLowerCase(),intent:input.intent}))}
export function circleProviderChallengeId(value:unknown):string{const p=id.safeParse(value);if(!p.success)throw new CircleAuthError('CIRCLE_TRANSACTION_PROVIDER_RESULT_UNKNOWN',503);return p.data}
export function circleKnownChallengeReceipt(value:unknown,audits:{requestDigest?:unknown;completionDigest?:unknown},now=Date.now()):CircleChallengeReceipt{
 if(value&&typeof value==='object'&&!Array.isArray(value)&&(value as any).version===undefined)throw new CircleAuthError('CIRCLE_TRANSACTION_LEGACY_RECONCILIATION_REQUIRED',409);
 const p=receipt.safeParse(value);if(!p.success)throw new CircleAuthError('CIRCLE_TRANSACTION_RECEIPT_UNAVAILABLE',503);const r=p.data;
 if(r.createdAt>now||r.state==='REQUESTED'&&(r.challengeId!==undefined||r.completedAt!==undefined)||r.state==='READY'&&(!r.challengeId||r.completedAt===undefined||r.completedAt<r.createdAt||r.completedAt>now))throw new CircleAuthError('CIRCLE_TRANSACTION_RECEIPT_UNAVAILABLE',503);
 if(audits.requestDigest!==circleChallengeRequestDigest(r)||r.state==='READY'&&audits.completionDigest!==circleChallengeCompletionDigest(r))throw new CircleAuthError('CIRCLE_TRANSACTION_RECEIPT_UNAVAILABLE',503);
 return r;
}
export function circleChallengeReceipt(value:unknown,input:CircleChallengeBinding,authority:CircleWalletAuthority&{policy:string},audits:{requestDigest?:unknown;completionDigest?:unknown},now=Date.now()):CircleChallengeReceipt{
 const r=circleKnownChallengeReceipt(value,audits,now);
 if(r.operationId!==input.operationId||r.userId!==input.userId||r.walletId!==input.walletId||r.payloadHash!==circleChallengePayload(input))throw new CircleAuthError('CIRCLE_TRANSACTION_INTENT_CONFLICT',409,'operationId is already bound to a different Circle transaction intent');
 if(r.circleUserId!==authority.circleUserId||r.walletAddress.toLowerCase()!==authority.wallet?.address.toLowerCase()||r.contractAddress.toLowerCase()!==input.contractAddress.toLowerCase()||r.calldataHash!==circleChallengeHash(input.callData.toLowerCase())||r.intentType!==input.intent.type||r.authorityBase!==authority.base||r.authRecoveryContext!==authority.context)throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409);
 return r;
}
