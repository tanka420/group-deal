import {z} from 'zod';

export interface AuthRecoveryBarrier {version:1;context:string;createdAt:number;}
const record=z.object({version:z.literal(1),context:z.string().regex(/^[A-Za-z0-9_-]{43}$/),createdAt:z.number().int().nonnegative().max(8640000000000000)}).strict();

/** Absence keeps normal authentication unchanged. Invalid recovery metadata must never become absence. */
export function readAuthRecoveryBarrier(value:unknown):AuthRecoveryBarrier|undefined{
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'current'))throw new Error('AUTH_RECOVERY_METADATA_INVALID');
 const parsed=record.safeParse((value as any).current);
 if(!parsed.success||parsed.data.createdAt>Date.now()+30000)throw new Error('AUTH_RECOVERY_METADATA_INVALID');
 return parsed.data;
}
