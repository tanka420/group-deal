import {z} from 'zod';
import {ethers} from 'ethers';
import {config} from '../config';
import {HUB_ABI} from '../contracts/hubAbi';
const messages={
 VERIFIER_HASH_INVALID:'[Verifier] Invalid transaction hash format',
 VERIFIER_INTENT_INVALID:'[Verifier] Invalid transaction intent',
 VERIFIER_CONSUMED_CONFLICT:'[Verifier Security] Transaction already consumed by another intent',
 VERIFIER_INTENT_CHANGED:'[Verifier Security] Immutable transaction intent changed',
 VERIFIER_RECEIPT_CONFLICT:'[Verifier Security] Verified receipt consumption binding mismatch',
 VERIFIER_STORAGE_CONFLICT:'[Verifier Security] Concurrent transaction consumption conflict',
 VERIFIER_STORAGE_UNAVAILABLE:'[Verifier] Receipt consumption storage unavailable',
 VERIFIER_RPC_UNAVAILABLE:'[Verifier] RPC unavailable fetching transaction',
 VERIFIER_TRANSACTION_NOT_FOUND:'[Verifier] Transaction not found in mempool or block',
 VERIFIER_RECEIPT_PENDING:'[Verifier] Receipt not found. PENDING_FINALITY',
 VERIFIER_STATUS_INVALID:'[Verifier] Transaction reverted onchain',
 VERIFIER_BINDING_INVALID:'[Verifier Security] Chain/receipt/block binding mismatch',
 VERIFIER_CALL_INVALID:'[Verifier Security] Function calldata mismatch',
 VERIFIER_DESTINATION_INVALID:'[Verifier Security] Destination contract mismatch',
 VERIFIER_PRINCIPAL_INVALID:'[Verifier Security] Caller principal mismatch',
 VERIFIER_EVENT_REQUIRED:'[Verifier Security] Required event or argument mismatch',
 VERIFIER_EVENT_AMBIGUOUS:'[Verifier Security] Required event ambiguous',
 VERIFIER_CANONICAL_CHANGED:'[Verifier Security] Canonical block changed before receipt consumption',
} as const;
export class TransactionVerificationError extends Error{constructor(public code:keyof typeof messages,public status:number){super(messages[code]);}}
const uint=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/),address=z.string().refine(ethers.isAddress),id=z.string().min(1).max(1024);
const scalar=z.union([z.string().max(4096),z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),z.bigint(),z.boolean()]);
const intentSchema=z.object({intentId:id,expectedTo:address,expectedSender:address.optional(),expectedFunction:z.string().min(1).max(80).optional(),expectedCalldata:z.string().max(1048576).refine(v=>ethers.isHexString(v,true)).optional(),expectedEvent:z.string().min(1).max(80),expectedEventArgs:z.record(scalar).optional()}).strict();
const iface=new ethers.Interface(HUB_ABI);
export function receiptIntent(value:unknown){
 const parsed=intentSchema.safeParse(value);if(!parsed.success)throw new TransactionVerificationError('VERIFIER_INTENT_INVALID',400);const i=parsed.data;
 try{const event=iface.getEvent(i.expectedEvent);if(!event||i.expectedTo.toLowerCase()!==config.hubAddress.toLowerCase()||i.expectedFunction&&!iface.getFunction(i.expectedFunction)||Object.keys(i.expectedEventArgs??{}).some(k=>!event.inputs.some(f=>f.name===k)))throw Error();}catch{throw new TransactionVerificationError('VERIFIER_INTENT_INVALID',400)}
 const args=Object.fromEntries(Object.entries(i.expectedEventArgs??{}).sort(([a],[b])=>a===b?0:a<b?-1:1).map(([key,value])=>[key,String(value).toLowerCase()]));
 const digest=ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({intentId:i.intentId,chainId:config.arcChainId,expectedTo:i.expectedTo.toLowerCase(),expectedSender:i.expectedSender?.toLowerCase()??null,expectedFunction:i.expectedFunction??null,expectedCalldata:i.expectedCalldata?.toLowerCase()??null,expectedEvent:i.expectedEvent,expectedEventArgs:args})));
 return{intent:i,digest};
}
export const receiptBindingSchema=z.object({intentId:id,blockNumber:uint,verifiedAt:uint,bindingVersion:z.literal(1),intentDigest:hash,chainId:uint.positive(),hubAddress:address,blockHash:hash,blockTimestamp:uint,eventName:z.string().min(1).max(80),eventDigest:hash,transactionIndex:uint,logIndex:uint}).strict();
export type ReceiptConsumptionBinding=z.infer<typeof receiptBindingSchema>;
export const revertedReceiptBindingSchema=z.object({intentId:id,blockNumber:uint,verifiedAt:uint,bindingVersion:z.literal(2),receiptStatus:z.literal(0),intentDigest:hash,chainId:uint.positive(),hubAddress:address,blockHash:hash,blockTimestamp:uint,transactionIndex:uint,nonce:uint}).strict();
export type RevertedReceiptBinding=z.infer<typeof revertedReceiptBindingSchema>;
const baseSchema=z.object({intentId:id,blockNumber:uint,verifiedAt:uint,bindingVersion:z.union([z.literal(1),z.literal(2)]).optional(),intentDigest:hash.optional(),chainId:uint.positive().optional(),hubAddress:address.optional(),blockHash:hash.optional(),blockTimestamp:uint.optional(),eventName:z.string().min(1).max(80).optional(),eventDigest:hash.optional(),transactionIndex:uint.optional(),logIndex:uint.optional(),receiptStatus:z.literal(0).optional(),nonce:uint.optional()});
export type ReceiptConsumptionRecord=z.infer<typeof baseSchema>;
export const successfulReceiptFields=['intentId','blockNumber','verifiedAt','bindingVersion','intentDigest','chainId','hubAddress','blockHash','blockTimestamp','eventName','eventDigest','transactionIndex','logIndex'] as const;
export const receiptConsumptionFields=[...successfulReceiptFields,'receiptStatus','nonce'] as const;
export function receiptConsumptionRecord(value:unknown):ReceiptConsumptionRecord{
 const parsed=baseSchema.safeParse(value);if(!parsed.success)throw new TransactionVerificationError('VERIFIER_STORAGE_UNAVAILABLE',503);const r=parsed.data;
 if(r.bindingVersion===1){if(!receiptBindingSchema.safeParse(r).success)throw new TransactionVerificationError('VERIFIER_STORAGE_UNAVAILABLE',503);}
 else if(r.bindingVersion===2){if(!revertedReceiptBindingSchema.safeParse(r).success)throw new TransactionVerificationError('VERIFIER_STORAGE_UNAVAILABLE',503);}
 else if(receiptConsumptionFields.slice(4).some(f=>r[f]!==undefined))throw new TransactionVerificationError('VERIFIER_STORAGE_UNAVAILABLE',503);
 return r;
}
export function assertReceiptConsumption(previous:ReceiptConsumptionRecord|undefined,intentId:string,intentDigest:string,proof?:ReceiptConsumptionBinding){
 if(!previous)return;
 if(previous.intentId!==intentId)throw new TransactionVerificationError('VERIFIER_CONSUMED_CONFLICT',409);
 if(previous.bindingVersion!==undefined&&previous.intentDigest?.toLowerCase()!==intentDigest.toLowerCase())throw new TransactionVerificationError('VERIFIER_INTENT_CHANGED',409);
 if(proof&&(previous.bindingVersion===2||previous.blockNumber!==proof.blockNumber||previous.bindingVersion===1&&successfulReceiptFields.filter(f=>!['verifiedAt','intentId'].includes(f)).some(f=>String(previous[f]).toLowerCase()!==String(proof[f]).toLowerCase())))throw new TransactionVerificationError('VERIFIER_RECEIPT_CONFLICT',409);
}
