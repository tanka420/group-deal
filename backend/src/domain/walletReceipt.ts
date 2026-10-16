import {ethers} from 'ethers';
import {WalletFlowError,walletErc20} from './walletQuote';
import type {WalletFlowRecord} from './walletFlow';
import type {ServerBridgeRead} from './bridgeReceipt';
import {ARC_SWAP_ADAPTER,arcWalletToken} from '../../../shared/arcWallet.mjs';

const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
const fail=(code='WALLET_RECEIPT_INVALID'):never=>{throw new WalletFlowError(code);};
const hash=(v:unknown):v is string=>typeof v==='string'&&/^0x[\da-f]{64}$/i.test(v);
const uint=(v:unknown):bigint=>{if(typeof v!=='string'||!/^0x[\da-f]{1,64}$/i.test(v))return fail();return BigInt(v);};
export function assertWalletTransaction(record:WalletFlowRecord,index:number,tx:any,txHash:string){
 const step=record.steps[index],call=record.quote.calls[index];
 if(!step||!call||!tx||!same(tx.hash,txHash)||!same(tx.from,record.principal)||!same(tx.to,call.to)||!same(tx.input??tx.data,call.data)||uint(tx.chainId)!==5042002n||uint(tx.nonce).toString()!==step.nonce||uint(tx.value)!==0n)return fail('WALLET_TRANSACTION_MISMATCH');
 // Wallets may adjust the gas limit and price together. Bind their maximum
 // liability to the reviewed total, using maxFeePerGas rather than a mined
 // transaction's effective gasPrice. Call, amount and nonce remain exact.
 const gas=uint(tx.gas),price=uint(tx.maxFeePerGas??tx.gasPrice);
 if(gas<21000n||gas>10000000n||price<=0n||gas*price>BigInt(call.fee.maxNetworkFee)||tx.maxPriorityFeePerGas!==undefined&&uint(tx.maxPriorityFeePerGas)>price)return fail('WALLET_TRANSACTION_FEE_MISMATCH');
}
export type WalletReceiptProof={hash:string;nonce:string;blockNumber:string;blockHash:string;receiptStatus:0|1;digest:string;networkFee?:string;receivedAmount?:string};
const digest=(r:any)=>ethers.id(JSON.stringify({hash:r.transactionHash,from:r.from,to:r.to,blockNumber:r.blockNumber,blockHash:r.blockHash,status:r.status,transactionIndex:r.transactionIndex,logs:r.logs,gasUsed:r.gasUsed,effectiveGasPrice:r.effectiveGasPrice}));
/** Exact transaction, token semantics and canonical finalized receipt. No missing hash is negative proof. */
export async function verifyWalletReceipt(record:WalletFlowRecord,index:number,read:ServerBridgeRead):Promise<WalletReceiptProof>{
 const step=record.steps[index],call=record.quote.calls[index],txHash=step?.txHash;if(!txHash)return fail('WALLET_HASH_REQUIRED');
 const [rawTx,rawReceipt,chain]=await Promise.all([read<any>('Arc_Testnet','eth_getTransactionByHash',[txHash]),read<any>('Arc_Testnet','eth_getTransactionReceipt',[txHash]),read<string>('Arc_Testnet','eth_chainId',[])]);
 const tx=structuredClone(rawTx),r=structuredClone(rawReceipt);if(!tx||!r)return fail('WALLET_RECEIPT_PENDING');assertWalletTransaction(record,index,tx,txHash);
 if(uint(chain)!==5042002n||!same(r.transactionHash,txHash)||!same(r.from,record.principal)||!same(r.to,call.to)||!hash(r.blockHash)||!same(tx.blockHash,r.blockHash)||uint(tx.blockNumber)!==uint(r.blockNumber)||!Array.isArray(r.logs)||r.logs.length>1000||![0n,1n].includes(uint(r.status))||uint(r.status)===0n&&r.logs.length)return fail();
 const indices=new Set<string>();for(const log of r.logs){if(!log||log.removed||!same(log.transactionHash,txHash)||!same(log.blockHash,r.blockHash)||uint(log.blockNumber)!==uint(r.blockNumber)||uint(log.transactionIndex)!==uint(r.transactionIndex)||indices.has(uint(log.logIndex).toString())||!ethers.isAddress(log.address)||!ethers.isHexString(log.data)||!Array.isArray(log.topics)||log.topics.length>4||log.topics.some((v:unknown)=>!hash(v)))return fail();indices.add(uint(log.logIndex).toString());}
 let receivedAmount:string|undefined;
 if(uint(r.status)===1n){
  const events=r.logs.flatMap((log:any)=>{try{const e=walletErc20.parseLog(log);return e?[{address:log.address.toLowerCase(),e}]:[];}catch{return[];}}),input=arcWalletToken(record.quote.tokenIn).address,output=arcWalletToken(record.quote.tokenOut).address,amount=BigInt(record.quote.amount);
  const transfers=(token:string,from:string,to:string)=>events.filter((v:any)=>v.address===token&&v.e.name==='Transfer'&&same(v.e.args.from,from)&&same(v.e.args.to,to));
  if(call.kind==='APPROVE'){const matches=events.filter((v:any)=>v.address===input&&v.e.name==='Approval'&&same(v.e.args.owner,record.principal)&&same(v.e.args.spender,ARC_SWAP_ADAPTER));if(matches.length!==1||matches[0].e.args.value!==amount)return fail('WALLET_APPROVAL_NOT_CONFIRMED');}
  else if(call.kind==='SEND'){const matches=transfers(input,record.principal,record.quote.recipient);if(matches.length!==1||matches[0].e.args.value!==amount)return fail('WALLET_TRANSFER_NOT_CONFIRMED');receivedAmount=amount.toString();}
  else {const spent=transfers(input,record.principal,ARC_SWAP_ADAPTER).reduce((n:bigint,v:any)=>n+v.e.args.value,0n),received=events.filter((v:any)=>v.address===output&&v.e.name==='Transfer'&&same(v.e.args.to,record.principal)).reduce((n:bigint,v:any)=>n+v.e.args.value,0n);if(spent!==amount||received<BigInt(record.quote.minimumOut))return fail('WALLET_SWAP_NOT_CONFIRMED');receivedAmount=received.toString();}
 }
 const [block,head]=await Promise.all([read<any>('Arc_Testnet','eth_getBlockByNumber',[r.blockNumber,false]),read<any>('Arc_Testnet','eth_getBlockByNumber',['finalized',false])]);
 if(!block||!same(block.hash,r.blockHash)||uint(block.number)!==uint(r.blockNumber))return fail('WALLET_RECEIPT_REORG');if(!head||!hash(head.hash)||uint(head.number)<uint(r.blockNumber))return fail('WALLET_FINALITY_PENDING');
 const [again,lastTx,lastReceipt,final]=await Promise.all([read<any>('Arc_Testnet','eth_getBlockByNumber',[r.blockNumber,false]),read<any>('Arc_Testnet','eth_getTransactionByHash',[txHash]),read<any>('Arc_Testnet','eth_getTransactionReceipt',[txHash]),read<any>('Arc_Testnet','eth_getBlockByNumber',[head.number,false])]);
 if(!again||!same(again.hash,r.blockHash)||uint(again.number)!==uint(r.blockNumber)||!lastTx||JSON.stringify(lastTx)!==JSON.stringify(tx)||!lastReceipt||digest(lastReceipt)!==digest(r)||!final||!same(final.hash,head.hash)||uint(final.number)!==uint(head.number))return fail('WALLET_RECEIPT_REORG');
 let networkFee:string|undefined;if(r.gasUsed!==undefined||r.effectiveGasPrice!==undefined){const used=uint(r.gasUsed),price=uint(r.effectiveGasPrice);if(used>uint(tx.gas)||price>uint(tx.maxFeePerGas??tx.gasPrice)||used*price>BigInt(call.fee.maxNetworkFee))return fail('WALLET_RECEIPT_INVALID');networkFee=(used*price).toString();}
 return{...(networkFee!==undefined?{networkFee}:{}),...(receivedAmount!==undefined?{receivedAmount}:{}),hash:txHash,nonce:step.nonce!,blockNumber:uint(r.blockNumber).toString(),blockHash:r.blockHash.toLowerCase(),receiptStatus:Number(uint(r.status)) as 0|1,digest:digest(r)};
}
