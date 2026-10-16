import {z} from 'zod';
import {WalletFlowError} from './walletQuote';

const fields=['gasprice','gaslimit','maxfee','priorityfee','refid','walletid','calldata','contractaddress','blockchain'] as const;
export const walletCircleRejectionSchema=z.object({requestId:z.string().uuid(),diagnosticId:z.string().uuid(),rejectedAt:z.number().int().nonnegative().safe(),httpStatus:z.union([z.literal(400),z.literal(422)]),providerCode:z.string().regex(/^[A-Z0-9_-]{1,48}$/i).optional(),category:z.enum(['LEGACY_GAS_PRICE_UNSUPPORTED','LEGACY_PRIORITY_FEE_REQUIRED','OTHER']),validationFields:z.array(z.enum(fields)).max(fields.length)}).strict();
export type WalletCircleRejection=z.infer<typeof walletCircleRejectionSchema>;
export class WalletCircleRejectedError extends WalletFlowError{
 constructor(public readonly rejection:WalletCircleRejection){super('WALLET_CIRCLE_REQUEST_REJECTED',409);}
}
/** Only recognised response meanings leave this function. SDK errors may hold
 * credentials in nested request config, headers, body and arbitrary messages. */
export function readWalletCircleRejection(error:unknown,requestId:string,diagnosticId:string,legacy:boolean):WalletCircleRejection|undefined{
 const e=error as {status?:unknown;code?:unknown;response?:{status?:unknown;data?:unknown};error?:{response?:{status?:unknown;data?:unknown}}},body=e?.response?.data??e?.error?.response?.data,status=e?.status??e?.response?.status??e?.error?.response?.status;
 if(status!==400&&status!==422)return undefined;
 const data=body&&typeof body==='object'?body as Record<string,unknown>:undefined,rawCode=data?.code??e?.code,providerCode=typeof rawCode==='number'&&Number.isSafeInteger(rawCode)?String(rawCode):typeof rawCode==='string'&&/^[A-Z0-9_-]{1,48}$/i.test(rawCode)?rawCode:undefined;
 let messages=typeof data?.message==='string'?data.message.slice(0,8000):'';
 if(Array.isArray(data?.errors))for(const item of data.errors.slice(0,16)){if(typeof item==='string')messages+=' '+item.slice(0,512);else if(item&&typeof item==='object')for(const key of ['field','path','message'])if(typeof item[key]==='string')messages+=' '+item[key].slice(0,512);}
 const text=messages.toLowerCase(),validationFields=fields.filter(f=>text.includes(f));
 const incompatible=/gasprice.{0,160}(?:not supported|unsupported|not allowed|must be empty|must not be (?:set|provided)|incompatible)|(?:unsupported|not supported|not allowed|incompatible).{0,160}gasprice/.test(text);
 const missingPriority=/priorityfee.{0,160}(?:required|missing|must be (?:set|provided)|cannot be empty)|(?:required|missing).{0,100}priorityfee/.test(text);
 const category=legacy&&status===400&&providerCode==='2'?(incompatible?'LEGACY_GAS_PRICE_UNSUPPORTED':missingPriority?'LEGACY_PRIORITY_FEE_REQUIRED':'OTHER'):'OTHER';
 return walletCircleRejectionSchema.parse({requestId,diagnosticId,rejectedAt:Date.now(),httpStatus:status,...(providerCode?{providerCode}:{}),category,validationFields});
}
export function permitsWalletCircleFeeRepair(rejection:WalletCircleRejection){return rejection.httpStatus===400&&rejection.providerCode==='2'&&(rejection.category==='LEGACY_GAS_PRICE_UNSUPPORTED'&&rejection.validationFields.includes('gasprice')||rejection.category==='LEGACY_PRIORITY_FEE_REQUIRED'&&rejection.validationFields.includes('priorityfee'));}
