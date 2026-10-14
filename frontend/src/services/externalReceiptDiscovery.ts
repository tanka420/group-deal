import {ethers} from 'ethers';
import {HUB_ABI} from '../contracts/hubAbi';
import {readArcRpc,ARC_CHAIN_ID} from './arcRpc';
import type {TransactionOperation} from './transactionOperations';
import {UiError,uiMessage} from '../utils/uiMessage';

type Read=(method:string,params:unknown[])=>Promise<unknown>;
export type DiscoveredReceipt={operationId:string;principal:string;hubAddress:string;calldata:string;txHash:string;blockNumber:number;blockHash:string;finalizedBlock:number;finalizedHash:string};
export type ReceiptDiscovery={kind:'FOUND';receipt:DiscoveredReceipt}|{kind:'NOT_FOUND'|'AMBIGUOUS';fromBlock:number;toBlock:number};
const calls:Record<TransactionOperation['action'],[string,string]>={PUBLISH:['createCampaign','CampaignCreated'],DELIVER:['recordDelivery','DeliveryRecorded'],BUY:['commitToBuy','CommitmentMade'],BUYER_CLAIM:['claimBuyerFunds','FundsClaimed'],SELLER_CLAIM:['claimSellerProceeds','FundsClaimed'],CONFIRM:['confirmReceipt','OrderConfirmed'],DISPUTE:['openDispute','OrderDisputed'],BREACH:['claimDeliveryBreach','DeliveryBreached'],SETTLE:['settleUndisputedOrder','OrderConfirmed'],RESOLVE:['resolveDispute','DisputeResolved']};
const hash=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v),address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v),eq=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const unavailable=()=>new UiError(uiMessage('Chưa xác minh được receipt từ RPC. Giữ yêu cầu và thử tra cứu lại hoặc dùng hash từ lịch sử ví.','RPC has not verified a receipt. Keep the request and search again or use a hash from wallet history.'));
function uint(v:unknown):number{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v))throw unavailable();const n=Number(BigInt(v));if(!Number.isSafeInteger(n)||n<0)throw unavailable();return n;}
function record(v:unknown):Record<string,any>{if(!v||typeof v!=='object'||Array.isArray(v))throw unavailable();return v as Record<string,any>;}
function header(v:unknown){const b=record(v);if(!hash(b.hash))throw unavailable();return{number:uint(b.number),hash:b.hash,timestamp:uint(b.timestamp),transactions:b.transactions};}
function sameValue(a:unknown,b:unknown){return typeof a==='bigint'?a.toString()===String(b):String(a).toLowerCase()===String(b).toLowerCase();}
export function discoveryMatches(receipt:DiscoveredReceipt,op:TransactionOperation){return receipt.operationId===op.id&&eq(receipt.principal,op.principal)&&eq(receipt.hubAddress,op.hubAddress)&&receipt.calldata===op.calldata&&hash(receipt.txHash)&&hash(receipt.blockHash)&&hash(receipt.finalizedHash)&&Number.isSafeInteger(receipt.blockNumber)&&receipt.blockNumber>=0&&Number.isSafeInteger(receipt.finalizedBlock)&&receipt.finalizedBlock>=receipt.blockNumber;}

/** Suggest a mined receipt for the existing call. Absence never authorizes another signature or hold release. */
export async function discoverExternalReceipt(op:TransactionOperation,hub:string,assertCurrent:()=>void,read:Read=readArcRpc,excludedHashes:ReadonlySet<string>=new Set()):Promise<ReceiptDiscovery>{
 const iface=new ethers.Interface(HUB_ABI),binding=calls[op.action];
 assertCurrent();
 try{
 if(excludedHashes.size>2048||Array.from(excludedHashes).some(h=>!hash(h)))throw unavailable();const excluded=new Set(Array.from(excludedHashes,h=>h.toLowerCase()));
 if(!binding||op.chainId!==ARC_CHAIN_ID||!address(op.principal)||!address(hub)||!eq(op.hubAddress,hub)||op.txHash||!['AWAITING_SIGNATURE','UNKNOWN'].includes(op.phase)||!Number.isSafeInteger(op.createdAt)||op.createdAt<0||typeof op.calldata!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(op.calldata))throw unavailable();
 const call=iface.parseTransaction({data:op.calldata}),event=iface.getEvent(binding[1]),args=op.expectedEventArgs;
 if(!call||call.name!==binding[0]||iface.encodeFunctionData(call.name,call.args.toArray(true)).toLowerCase()!==op.calldata.toLowerCase()||!event||!args||typeof args!=='object'||Array.isArray(args)||!Object.keys(args).length||Object.entries(args).some(([k,v])=>!event.inputs.some(i=>i.name===k)||!(typeof v==='string'&&v.length<=4096||typeof v==='number'&&Number.isSafeInteger(v))))throw unavailable();
 const rpc=async(method:string,params:unknown[])=>{assertCurrent();const value=await read(method,params);assertCurrent();return value;};
  const finalized=header(await rpc('eth_getBlockByNumber',['finalized',false])),fromBlock=Math.max(0,finalized.number-2047);
  const topics=iface.encodeFilterTopics(event,event.inputs.map(i=>i.indexed&&Object.prototype.hasOwnProperty.call(args,i.name)?args[i.name]:null));
  const pages:unknown[]=[];for(let start=fromBlock;start<=finalized.number;start+=256)pages.push({address:hub,fromBlock:ethers.toQuantity(start),toBlock:ethers.toQuantity(Math.min(start+255,finalized.number)),topics});
  const logs:Record<string,any>[]=[];
  for(let i=0;i<pages.length;i+=2){const responses=await Promise.all(pages.slice(i,i+2).map(filter=>rpc('eth_getLogs',[filter])));for(const response of responses){if(!Array.isArray(response)||response.length>256)throw unavailable();for(const value of response)logs.push(record(value));if(logs.length>256)throw unavailable();}}
  const candidates=new Map<string,Record<string,any>>();
  for(const log of logs){
   if(log.removed!==false||!eq(log.address,hub)||!hash(log.transactionHash)||!hash(log.blockHash)||!Array.isArray(log.topics)||log.topics.length>8||!log.topics.every(hash)||typeof log.data!=='string'||log.data.length>131074)throw unavailable();
   const n=uint(log.blockNumber);uint(log.logIndex);if(n<fromBlock||n>finalized.number)throw unavailable();
   if(excluded.has(log.transactionHash.toLowerCase()))continue;
   const parsed=iface.parseLog({topics:log.topics,data:log.data});if(!parsed||parsed.name!==binding[1]||!Object.entries(args).every(([k,v])=>sameValue(parsed.args[k],v)))continue;
   candidates.set(log.transactionHash.toLowerCase(),log);if(candidates.size>16)throw unavailable();
  }
  const found:DiscoveredReceipt[]=[];
  for(const [txHash,log]of candidates){
   const [txRaw,receiptRaw,blockRaw]=await Promise.all([rpc('eth_getTransactionByHash',[txHash]),rpc('eth_getTransactionReceipt',[txHash]),rpc('eth_getBlockByNumber',[log.blockNumber,false])]);
   const tx=record(txRaw),receipt=record(receiptRaw),block=header(blockRaw);
   if(!eq(tx.hash,txHash)||!eq(receipt.transactionHash,txHash)||!eq(receipt.blockHash,log.blockHash)||!eq(tx.blockHash,log.blockHash)||!eq(block.hash,log.blockHash)||block.number!==uint(log.blockNumber)||uint(tx.blockNumber)!==block.number||uint(receipt.blockNumber)!==block.number||uint(receipt.status)!==1||uint(tx.transactionIndex)!==uint(receipt.transactionIndex)||uint(log.transactionIndex)!==uint(tx.transactionIndex)||!Array.isArray(block.transactions)||!eq(block.transactions[uint(tx.transactionIndex)],txHash)||!Array.isArray(receipt.logs)||receipt.logs.length>256)throw unavailable();
   if(!receipt.logs.some((r:any)=>r&&eq(r.address,hub)&&eq(r.transactionHash,txHash)&&eq(r.blockHash,block.hash)&&r.blockNumber===log.blockNumber&&r.transactionIndex===log.transactionIndex&&r.logIndex===log.logIndex&&r.data===log.data&&JSON.stringify(r.topics)===JSON.stringify(log.topics)))throw unavailable();
   if(!eq(tx.from,op.principal)||!eq(tx.to,hub)||!eq(tx.input,op.calldata)||uint(tx.value)!==0||uint(tx.chainId)!==ARC_CHAIN_ID||!eq(receipt.from,op.principal)||!eq(receipt.to,hub)||block.timestamp<Math.floor(op.createdAt/1000))continue;
   found.push({operationId:op.id,principal:op.principal,hubAddress:op.hubAddress,calldata:op.calldata,txHash,blockNumber:block.number,blockHash:block.hash,finalizedBlock:finalized.number,finalizedHash:finalized.hash});
  }
  const finish=header(await rpc('eth_getBlockByNumber',[ethers.toQuantity(finalized.number),false]));if(finish.number!==finalized.number||!eq(finish.hash,finalized.hash))throw unavailable();
  if(found.length===1)return{kind:'FOUND',receipt:found[0]};return{kind:found.length?'AMBIGUOUS':'NOT_FOUND',fromBlock,toBlock:finalized.number};
 }catch{assertCurrent();throw unavailable();}
}
