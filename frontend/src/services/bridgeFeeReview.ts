import {ARC_KIT_CHAIN} from '../../../shared/network.mjs';
import {ethers} from 'ethers';
import {BridgeSafetyError,validateBridgeOperation,readBridgeRpc,type BridgeRead,type BridgeKind,type BridgeOperation} from './bridgeRecovery';
import {bridgeSources,parseUsdc} from './paymentSafety';
import {ARC_CHAIN_ID} from './arcRpc';
export const BRIDGE_FEE_TTL_MS=60_000;
export type BridgeFeeInput={id:string;operation:BridgeOperation;kind:BridgeKind;chainId:number;transaction:Record<string,unknown>;assertCurrent:()=>void};
export type BridgeFeeBudget={key:string;gasLimit:bigint;gasPrice:bigint;dataFee:bigint;networkFee:bigint;feeReserve:bigint;nativeBalance:bigint;tokenBalance:bigint;tokenRequired:bigint;shortfall:bigint;tokenShortfall:bigint;requestedAt:number;expiresAt:number};
const MAX=(1n<<256n)-1n,fail=(code='BRIDGE_FEE_UNAVAILABLE'):never=>{throw new BridgeSafetyError(code);};
const uint=(value:unknown,positive=false):bigint=>{if(typeof value!=='bigint'||value<0n||value>MAX||positive&&value===0n)return fail();return value;};
const quantity=(value:unknown,positive=false)=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/.test(value))return fail();return uint(BigInt(value),positive);};
const balanceOf=new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
export function bridgeFeeKey(input:BridgeFeeInput){
 const op=validateBridgeOperation(input.operation),tx=input.transaction;
 if(!/^[a-zA-Z0-9:_-]{8,128}$/.test(input.id)||!['approve','burn','mint'].includes(input.kind)||input.chainId!==(input.kind==='mint'?ARC_CHAIN_ID:bridgeSources[op.source].chainId)||!tx||typeof tx!=='object'||Array.isArray(tx)||typeof tx.from!=='string'||tx.from.toLowerCase()!==op.sender.toLowerCase()||!ethers.isAddress(String(tx.to))||typeof tx.data!=='string'||!/^0x(?:[\da-fA-F]{2}){4,65536}$/.test(tx.data)||quantity(tx.value??'0x0')!==0n)return fail();
 const fields=['from','to','data','value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','chainId','type','accessList'];
 if(Object.keys(tx).some(k=>!fields.includes(k)))return fail();
 for(const field of ['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','chainId','type'])if(tx[field]!==undefined)quantity(tx[field],['gas','gasPrice','maxFeePerGas'].includes(field));
 if(tx.chainId!==undefined&&quantity(tx.chainId)!==BigInt(input.chainId)||tx.gasPrice!==undefined&&(tx.maxFeePerGas!==undefined||tx.maxPriorityFeePerGas!==undefined)||tx.maxPriorityFeePerGas!==undefined&&(tx.maxFeePerGas===undefined||quantity(tx.maxPriorityFeePerGas)>quantity(tx.maxFeePerGas)))return fail();
 if(tx.accessList!==undefined){try{ethers.accessListify(tx.accessList as ethers.AccessListish);}catch{return fail();}}
 return JSON.stringify([input.id,op.source,op.amount,op.sender.toLowerCase(),op.recipient.toLowerCase(),input.kind,input.chainId,fields.map(k=>[k,typeof tx[k]==='string'?(tx[k] as string).toLowerCase():tx[k]])]);
}
function assertBudget(b:BridgeFeeBudget){
 for(const field of ['gasLimit','gasPrice','networkFee','feeReserve'] as const)uint(b[field],true);
 for(const field of ['dataFee','nativeBalance','tokenBalance','tokenRequired','shortfall','tokenShortfall'] as const)uint(b[field]);
 if(b.networkFee!==uint(b.gasLimit*b.gasPrice+b.dataFee,true)||b.feeReserve!==uint((b.networkFee*120n+99n)/100n,true)||b.shortfall!==(b.feeReserve>b.nativeBalance?b.feeReserve-b.nativeBalance:0n)||b.tokenShortfall!==(b.tokenRequired>b.tokenBalance?b.tokenRequired-b.tokenBalance:0n))fail();
}
export function bridgeFeeIsFresh(b:BridgeFeeBudget,now=Date.now()){
 try{assertBudget(b);return Number.isSafeInteger(now)&&Number.isSafeInteger(b.requestedAt)&&b.requestedAt>=0&&b.requestedAt<=now&&b.expiresAt===b.requestedAt+BRIDGE_FEE_TTL_MS&&Number.isSafeInteger(b.expiresAt)&&now<b.expiresAt;}catch{return false;}
}
export function assertReviewedBridgeFee(b:BridgeFeeBudget,input:BridgeFeeInput){
 if(b.key!==bridgeFeeKey(input)||!bridgeFeeIsFresh(b))fail('BRIDGE_FEE_STALE');
 if(b.tokenRequired!==(input.kind==='mint'?0n:parseUsdc(input.operation.amount)))fail();
 if(b.shortfall>0n||b.tokenShortfall>0n)fail('BRIDGE_FEE_INSUFFICIENT');
}
export async function readBridgeFeeBudget(input:BridgeFeeInput,read:BridgeRead=readBridgeRpc):Promise<BridgeFeeBudget>{
 input.assertCurrent();const key=bridgeFeeKey(input),requestedAt=Date.now(),chain=input.kind==='mint'?ARC_KIT_CHAIN:input.operation.source,tx=input.transaction;
 const [gas,price,balance,token]=await Promise.all([read(chain,'eth_estimateGas',[tx,'latest']),read(chain,'eth_gasPrice',[]),read(chain,'eth_getBalance',[input.operation.sender,'latest']),input.kind==='mint'?Promise.resolve('0x'+'0'.repeat(64)):read(chain,'eth_call',[{to:bridgeSources[input.operation.source].usdc,data:balanceOf.encodeFunctionData('balanceOf',[input.operation.sender])},'latest'])]);input.assertCurrent();
 let gasLimit=quantity(gas,true),gasPrice=quantity(price,true),dataFee=0n;
 if(tx.gas!==undefined&&quantity(tx.gas,true)>gasLimit)gasLimit=quantity(tx.gas,true);
 for(const field of ['gasPrice','maxFeePerGas'])if(tx[field]!==undefined&&quantity(tx[field],true)>gasPrice)gasPrice=quantity(tx[field],true);
 if(input.kind!=='mint'&&input.operation.source==='Base_Sepolia'){
  const [{createPublicClient,custom},{baseSepolia},{estimateL1Fee,estimateOperatorFee}]=await Promise.all([import('viem'),import('viem/chains'),import('viem/op-stack')]);input.assertCurrent();
  const client=createPublicClient({chain:baseSepolia,transport:custom({request:({method,params}:any)=>read('Base_Sepolia',method,params??[])},{retryCount:0})});
  const args={account:ethers.getAddress(input.operation.sender) as `0x${string}`,to:ethers.getAddress(String(tx.to)) as `0x${string}`,data:tx.data as `0x${string}`,value:0n};
  const [l1,operator]=await Promise.all([estimateL1Fee(client,args),estimateOperatorFee(client,args)]);input.assertCurrent();dataFee=uint(uint(l1)+uint(operator));
 }
 if(typeof token!=='string'||!/^0x[\da-fA-F]{64}$/.test(token))return fail();
 const nativeBalance=quantity(balance),tokenBalance=uint(BigInt(token)),tokenRequired=input.kind==='mint'?0n:parseUsdc(input.operation.amount),networkFee=uint(gasLimit*gasPrice+dataFee,true),feeReserve=uint((networkFee*120n+99n)/100n,true);
 const budget={key,gasLimit,gasPrice,dataFee,networkFee,feeReserve,nativeBalance,tokenBalance,tokenRequired,shortfall:feeReserve>nativeBalance?feeReserve-nativeBalance:0n,tokenShortfall:tokenRequired>tokenBalance?tokenRequired-tokenBalance:0n,requestedAt,expiresAt:requestedAt+BRIDGE_FEE_TTL_MS};
 if(!bridgeFeeIsFresh(budget))fail('BRIDGE_FEE_STALE');input.assertCurrent();return budget;
}
