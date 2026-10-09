import {ethers} from 'ethers';
import {readArcRpc} from './arcRpc';
import {UiError,uiMessage} from '../utils/uiMessage';

export type CircleIntent =
 | {type:'USDC_APPROVE';amount:string} | {type:'CREATE_CAMPAIGN';draftId:string}
 | {type:'COMMIT_BUY';campaignId:string;quantity:string} | {type:'RECORD_DELIVERY';orderId:string;proofHash:string}
 | {type:'CLAIM_BUYER'|'CLAIM_SELLER';campaignId:string;orderIds:string[]}
 | {type:'CONFIRM_RECEIPT'|'OPEN_DISPUTE'|'CLAIM_DELIVERY_BREACH'|'SETTLE_UNDISPUTED';campaignId:string;orderId:string}
 | {type:'RESOLVE_DISPUTE';campaignId:string;orderId:string;buyerShare:string;sellerShare:string};
export type CircleFeeInput={id:string;account:string;walletId:string;token:string;userToken:string;contractAddress:string;callData:string;intent:CircleIntent;grossUsdc:bigint};
export type CircleFeeRequest=CircleFeeInput&{assertCurrent:()=>void};
export type CircleFeeBudget={key:string;account:string;networkFee:bigint;feeReserve:bigint;grossNative:bigint;balance:bigint;required:bigint;shortfall:bigint;requestedAt:number;expiresAt:number};
export const CIRCLE_FEE_TTL_MS=60_000;
const MAX=(1n<<256n)-1n,SCALE=10n**18n;
export class CircleFeeReviewError extends UiError {
 constructor(readonly code:'CIRCLE_FEE_UNAVAILABLE'|'CIRCLE_FEE_STALE'|'CIRCLE_FEE_INSUFFICIENT'|'CIRCLE_FEE_CANCELLED'|'CIRCLE_FEE_BUSY'){
  const copy={CIRCLE_FEE_UNAVAILABLE:['Chưa xác định được phí Circle và ngân sách hợp lệ. Yêu cầu được giữ để kiểm tra lại.','Circle fees and a valid budget are unavailable. Keep the request for review.'],CIRCLE_FEE_STALE:['Ngân sách Circle đã hết hạn. Giữ yêu cầu và đọc lại trước khi ký.','The Circle budget expired. Keep the request and refresh before signing.'],CIRCLE_FEE_INSUFFICIENT:['Không đủ USDC cho tiền hàng và phí. Giữ yêu cầu và nạp thêm trước khi ký.','USDC is insufficient for goods and fees. Keep the request and fund before signing.'],CIRCLE_FEE_CANCELLED:['Đã dừng bước ký. Yêu cầu được giữ trong lịch sử để kiểm tra lại.','Signing stopped. The request remains in history for review.'],CIRCLE_FEE_BUSY:['Một yêu cầu Circle đang được xử lý. Chờ kết quả trước khi mở yêu cầu khác.','A Circle request is in progress. Wait for its outcome before opening another request.']}[code];
  super(uiMessage(copy[0],copy[1]));this.name='CircleFeeReviewError';
 }
}
const unavailable=()=>new CircleFeeReviewError('CIRCLE_FEE_UNAVAILABLE');
function uint(value:unknown,positive=false){if(typeof value!=='bigint'||value<0n||value>MAX||positive&&value===0n)throw unavailable();return value;}
function decimal(value:unknown):string {if(typeof value!=='string'||value.length>128||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)||value.split('.')[0].length>78||BigInt(value.split('.')[0])>MAX)throw unavailable();return value;}
function sumAtMost(values:string[],cap:string){const precision=Math.max(...[...values,cap].map(v=>v.split('.')[1]?.length??0)),scaled=(v:string)=>{const [whole,fraction='']=v.split('.');return BigInt(whole+fraction.padEnd(precision,'0'));};return values.reduce((n,v)=>n+scaled(v),0n)<=scaled(cap);}
/** networkFee is native token units. Never infer rate units or use the lower-buffer raw fee. */
export function circleMediumNetworkFee(value:unknown):bigint {
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.prototype.hasOwnProperty.call(value,'medium'))throw unavailable();
 const tier=(value as Record<string,unknown>).medium;if(!tier||typeof tier!=='object'||Array.isArray(tier))throw unavailable();
 const known:Record<string,unknown>={};for(const key of ['gasLimit','gasPrice','maxFee','priorityFee','baseFee','networkFee','networkFeeRaw','l1Fee'])if(Object.prototype.hasOwnProperty.call(tier,key))known[key]=(tier as Record<string,unknown>)[key];
 if(typeof known.gasLimit!=='string'||known.gasLimit.length>78||!/^[1-9]\d*$/.test(known.gasLimit))throw unavailable();uint(BigInt(known.gasLimit),true);
 if(known.gasPrice==='')delete known.gasPrice;
 if(known.gasPrice!==undefined){if(!/[1-9]/.test(decimal(known.gasPrice))||known.maxFee!==undefined||known.priorityFee!==undefined||known.baseFee!==undefined)throw unavailable();}
 else {const max=decimal(known.maxFee),priority=decimal(known.priorityFee),base=known.baseFee===undefined?undefined:decimal(known.baseFee);if(!/[1-9]/.test(max)||!sumAtMost([priority,...(base===undefined?[]:[base])],max))throw unavailable();}
 for(const key of ['networkFeeRaw','l1Fee'])if(known[key]!==undefined)decimal(known[key]);
 const fee=decimal(known.networkFee),[whole,fraction='']=fee.split('.');
 // Round fractional precision above the native18 unit upward, never truncate a fee to zero.
 return uint(BigInt(whole)*SCALE+BigInt(fraction.slice(0,18).padEnd(18,'0'))+(/[1-9]/.test(fraction.slice(18))?1n:0n),true);
}
export function circleFeeKey(input:CircleFeeInput){
 if(typeof input.id!=='string'||!/^[a-zA-Z0-9:_-]{8,128}$/.test(input.id))throw unavailable();
 if(!ethers.isAddress(input.account)||ethers.getAddress(input.account)===ethers.ZeroAddress||!ethers.isAddress(input.contractAddress)||ethers.getAddress(input.contractAddress)===ethers.ZeroAddress||!/^0x(?:[\da-fA-F]{2}){4,65536}$/.test(input.callData)||typeof input.walletId!=='string'||!input.walletId.trim()||input.walletId.length>128||typeof input.token!=='string'||!input.token.trim()||typeof input.userToken!=='string'||!input.userToken.trim())throw unavailable();
 uint(input.grossUsdc);uint(input.grossUsdc*10n**12n);
 return JSON.stringify([input.id,input.account.toLowerCase(),input.walletId,input.contractAddress.toLowerCase(),input.callData.toLowerCase(),input.intent,input.grossUsdc.toString()]);
}
export function circleFeeIsFresh(budget:CircleFeeBudget,now=Date.now()){return Number.isSafeInteger(now)&&Number.isSafeInteger(budget.requestedAt)&&budget.requestedAt>=0&&budget.requestedAt<=now&&budget.expiresAt===budget.requestedAt+CIRCLE_FEE_TTL_MS&&now<budget.expiresAt;}
async function readBudget(input:CircleFeeInput):Promise<CircleFeeBudget>{
 const key=circleFeeKey(input),requestedAt=Date.now();
 let estimate:unknown,balance:unknown;
 try{const [response,rawBalance]=await Promise.all([fetch('/api/circle/transactions/estimate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${input.token}`},body:JSON.stringify({userToken:input.userToken,walletId:input.walletId,contractAddress:input.contractAddress,callData:input.callData,intent:input.intent}),signal:AbortSignal.timeout(25_000)}),readArcRpc<unknown>('eth_getBalance',[ethers.getAddress(input.account),'latest'])]);if(!response.ok)throw unavailable();const body=await response.json();if(!body||typeof body!=='object'||Array.isArray(body)||!Object.prototype.hasOwnProperty.call(body,'estimate'))throw unavailable();estimate=body.estimate;balance=rawBalance;}catch{throw unavailable();}
 if(typeof balance!=='string'||!/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/.test(balance))throw unavailable();
 const networkFee=circleMediumNetworkFee(estimate),feeReserve=uint(networkFee*2n,true),grossNative=uint(input.grossUsdc*10n**12n),required=uint(grossNative+feeReserve,true),amount=uint(BigInt(balance));
 const budget={key,account:ethers.getAddress(input.account),networkFee,feeReserve,grossNative,balance:amount,required,shortfall:required>amount?required-amount:0n,requestedAt,expiresAt:requestedAt+CIRCLE_FEE_TTL_MS};
 if(!circleFeeIsFresh(budget))throw new CircleFeeReviewError('CIRCLE_FEE_STALE');return budget;
}
const inFlight=new Map<string,Promise<CircleFeeBudget>>();
/** Share only an active read in the same signing/auth scope; never cache completed quotes. */
export async function readCircleFeeBudget(input:CircleFeeInput,assertCurrent:()=>void=()=>{}):Promise<CircleFeeBudget>{
 const key=JSON.stringify([circleFeeKey(input),input.token,input.userToken]);assertCurrent();
 let pending=inFlight.get(key);
 if(!pending){pending=readBudget(input);inFlight.set(key,pending);void pending.finally(()=>{if(inFlight.get(key)===pending)inFlight.delete(key);}).catch(()=>{});}
 try{const budget=await pending;assertCurrent();if(!circleFeeIsFresh(budget))throw new CircleFeeReviewError('CIRCLE_FEE_STALE');return budget;}catch(e){assertCurrent();throw e;}
}
export function assertCircleFeeBudget(budget:CircleFeeBudget,input:CircleFeeInput){
 if(!circleFeeIsFresh(budget))throw new CircleFeeReviewError('CIRCLE_FEE_STALE');
 if(budget.key!==circleFeeKey(input)||budget.account.toLowerCase()!==input.account.toLowerCase()||budget.grossNative!==uint(input.grossUsdc*10n**12n)||budget.feeReserve!==uint(uint(budget.networkFee,true)*2n,true)||budget.required!==uint(budget.grossNative+budget.feeReserve,true)||budget.shortfall!==(budget.required>uint(budget.balance)?budget.required-budget.balance:0n))throw unavailable();
 if(budget.shortfall>0n)throw new CircleFeeReviewError('CIRCLE_FEE_INSUFFICIENT');
}
/** Re-read the shared balance immediately before a new SDK signing handoff. */
export async function assertCurrentCircleFeeBalance(budget:CircleFeeBudget,input:CircleFeeInput,assertCurrent:()=>void){
 assertCurrent();assertCircleFeeBudget(budget,input);
 const raw=await readArcRpc<unknown>('eth_getBalance',[ethers.getAddress(input.account),'latest']);
 assertCurrent();assertCircleFeeBudget(budget,input);
 if(typeof raw!=='string'||!/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/.test(raw))throw unavailable();
 if(uint(BigInt(raw))<budget.required)throw new CircleFeeReviewError('CIRCLE_FEE_INSUFFICIENT');
}
