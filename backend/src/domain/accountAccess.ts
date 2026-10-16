import {z} from 'zod';
import crypto from 'node:crypto';
import type {UserRecord} from '../db/store';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const time=z.number().int().nonnegative().max(8640000000000000);
export const accountAccessSchema=z.object({version:z.literal(1),revision:z.number().int().nonnegative(),restricted:z.boolean(),sellerEnabled:z.boolean(),updatedAt:time,updatedBy:id,reason:z.string().min(1).max(500)}).strict();
export type AccountAccess=z.infer<typeof accountAccessSchema>;
export const accessAction=z.enum(['RESTRICT','RESTORE','GRANT_SELLER','REVOKE_SELLER']);
export type AccessAction=z.infer<typeof accessAction>;
export const accessCommandInput=z.object({commandId:z.string().uuid(),environmentDigest:z.string().regex(/^[a-f0-9]{64}$/),expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),action:accessAction,reason:z.string().trim().min(5).max(500).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict();
export const digest=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const accountCommandKey=(actor:string,commandId:string)=>'aac_'+digest([actor,commandId]);
export class AccountAccessError extends Error{constructor(public readonly code:string,public readonly status=409){super(status===403?'FORBIDDEN: '+code:code);}}
export function readAccountAccess(value:unknown):AccountAccess|undefined{if(value===undefined)return undefined;const parsed=accountAccessSchema.safeParse(value);if(!parsed.success)throw new AccountAccessError('ACCOUNT_ACCESS_UNAVAILABLE',503);return parsed.data;}
/** Historical orders, claims, wallet custody and support use their existing authorization. */
export function assertNewBusinessAction(user:Pick<UserRecord,'accountAccess'>|undefined,kind:'BUY'|'SELLER'){
 if(!user)throw new AccountAccessError('ACCOUNT_ACCESS_UNAVAILABLE',503);
 const state=readAccountAccess(user.accountAccess);
 if(state?.restricted)throw new AccountAccessError('ACCOUNT_NEW_ACTIONS_RESTRICTED',403);
 if(kind==='SELLER'&&state?.sellerEnabled===false)throw new AccountAccessError('ACCOUNT_SELLER_PERMISSION_REVOKED',403);
}
export type AccountAccessCommand={id:string;schema:'GroupDealAccountAccessCommandV1';actorId:string;targetId:string;commandId:string;environmentDigest:string;inputDigest:string;action:AccessAction;reason:string;beforeDigest:string;afterDigest:string;committedAt:number;access:AccountAccess;roles:UserRecord['roles']};
export type AccountAccessTarget={id:string;roles:UserRecord['roles'];accountAccess?:AccountAccess;sellerProfilePresent:boolean;protected:boolean;openObligations:number};
export const targetDigest=(target:AccountAccessTarget)=>digest({id:target.id,roles:target.roles,accountAccess:readAccountAccess(target.accountAccess)??null});
