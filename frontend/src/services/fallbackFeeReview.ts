import type {FallbackIntent} from './fallbackAction';
export const FALLBACK_FEE_TTL_MS=60_000;
export type FallbackFeeBudget={gasLimit:string;gasPrice:string;networkFee:string;feeReserve:string;balance:string;requestedAt:number;expiresAt:number};
const MAX=(1n<<256n)-1n;
const invalid=()=>new Error('Ngân sách gas chưa hợp lệ. Đọc lại trước khi ký.');
function uint(value:unknown,positive=false){if(typeof value!=='bigint'||value<0n||value>MAX||positive&&value===0n)throw invalid();return value;}
function rpc(value:unknown,positive=false){if(typeof value!=='string'||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value))throw invalid();return uint(BigInt(value),positive);}
function decimal(value:unknown,positive=false){if(typeof value!=='string'||value.length>78||!/^(?:0|[1-9]\d*)$/.test(value))throw invalid();return uint(BigInt(value),positive);}
export function fallbackGasBudget(gas:unknown,price:unknown,balance:unknown,requestedAt:number):FallbackFeeBudget{
 const gasLimit=rpc(gas,true),gasPrice=rpc(price,true),networkFee=uint(gasLimit*gasPrice,true),feeReserve=uint((networkFee*120n+99n)/100n,true);
 const budget={gasLimit:gasLimit.toString(),gasPrice:gasPrice.toString(),networkFee:networkFee.toString(),feeReserve:feeReserve.toString(),balance:rpc(balance).toString(),requestedAt,expiresAt:requestedAt+FALLBACK_FEE_TTL_MS};assertFallbackFee(budget);if(!fallbackFeeIsFresh(budget))throw new Error('Ngân sách gas đã hết hạn. Đọc lại và đồng ý mới.');return budget;
}
export function assertFallbackFee(budget:FallbackFeeBudget){
 if(!budget||typeof budget!=='object'||!Number.isSafeInteger(budget.requestedAt)||budget.requestedAt<0||!Number.isSafeInteger(budget.expiresAt)||budget.expiresAt!==budget.requestedAt+FALLBACK_FEE_TTL_MS||decimal(budget.networkFee,true)!==uint(decimal(budget.gasLimit,true)*decimal(budget.gasPrice,true),true)||decimal(budget.feeReserve,true)!==uint((decimal(budget.networkFee,true)*120n+99n)/100n,true))throw invalid();decimal(budget.balance);
}
export function fallbackFeeIsFresh(budget:FallbackFeeBudget,now=Date.now()){
 try{assertFallbackFee(budget);return Number.isSafeInteger(now)&&budget.requestedAt<=now&&now<budget.expiresAt;}catch{return false;}
}
export function fallbackFeeKey(intent:FallbackIntent){
 const b=intent.feeReview;if(!b)throw invalid();assertFallbackFee(b);
 if(decimal(intent.gasBudget,true)!==decimal(b.feeReserve,true)||!['DISPUTE','BREACH','BUYER_CLAIM','SELLER_CLAIM'].includes(intent.action)||!/^0x[\da-fA-F]{40}$/.test(intent.principal)||!/^0x(?:[\da-fA-F]{2}){4,65536}$/.test(intent.calldata))throw invalid();
 return JSON.stringify([intent.action,intent.campaignId,intent.orderId,intent.principal.toLowerCase(),intent.calldata.toLowerCase(),intent.amount,intent.reasonHash,intent.gasBudget,b.gasLimit,b.gasPrice,b.networkFee,b.balance,b.requestedAt,b.expiresAt]);
}
export function fallbackFeeCanSign(intent:FallbackIntent,now=Date.now()){
 try{fallbackFeeKey(intent);return !!intent.feeReview&&fallbackFeeIsFresh(intent.feeReview,now)&&BigInt(intent.feeReview.balance)>=BigInt(intent.feeReview.feeReserve);}catch{return false;}
}
