import {ethers} from 'ethers';
import {bridgeAbi,CIRCLE_BRIDGE_CONTRACT,CCTP_TOKEN_MESSENGER,CCTP_MESSAGE_TRANSMITTER,ARC_USDC,BridgeOperation,BridgeRead} from '../../src/services/bridgeRecovery';
import {bridgeSources} from '../../src/services/paymentSafety';
export const operation:BridgeOperation={source:'Ethereum_Sepolia',amount:'1.25',sender:'0x73307bdd39d875f98857ffce0fed1cdc62f50b6d',recipient:'0x580cdb6a6354313f73ff16b160b15dcc914d21ae'};
const num=(value:number|bigint,bytes:number)=>ethers.toBeHex(value,bytes).slice(2);
const addr=(value:string)=>ethers.zeroPadValue(value,32).slice(2);
export const hashes={approve:'0x'+'1'.repeat(64),burn:'0x'+'2'.repeat(64),mint:'0x'+'3'.repeat(64)};
export function cctpMessage(op:BridgeOperation=operation,attested=false){
 const domain={Ethereum_Sepolia:0,Base_Sepolia:6,Arbitrum_Sepolia:3}[op.source];
 return '0x'+num(1,4)+num(domain,4)+num(26,4)+(attested?'7'.repeat(64):'0'.repeat(64))+addr(CCTP_TOKEN_MESSENGER)+addr(CCTP_TOKEN_MESSENGER)+'0'.repeat(64)+num(2000,4)+num(attested?2000:0,4)+num(1,4)+addr(bridgeSources[op.source].usdc)+addr(op.recipient)+num(ethers.parseUnits(op.amount,6),32)+addr(CIRCLE_BRIDGE_CONTRACT)+num(0,32)+num(0,32)+num(0,32);
}
export function bridgeFixture(op:BridgeOperation=operation){
 const message=cctpMessage(op),attested=cctpMessage(op,true);
 const params={amount:ethers.parseUnits(op.amount,6),maxFee:0n,fee:0n,mintRecipient:ethers.zeroPadValue(op.recipient,32),destinationCaller:ethers.ZeroHash,burnToken:bridgeSources[op.source].usdc,feeRecipient:CIRCLE_BRIDGE_CONTRACT,destinationDomain:26,minFinalityThreshold:2000};
 const calls={approve:bridgeAbi.encodeFunctionData('approve',[CIRCLE_BRIDGE_CONTRACT,params.amount]),burn:bridgeAbi.encodeFunctionData('bridgeWithPreapproval',[params]),mint:bridgeAbi.encodeFunctionData('receiveMessage',[attested,'0x'+'4'.repeat(130)])};
 const log=(address:string,name:string,args:unknown[])=>({address,...bridgeAbi.encodeEventLog(bridgeAbi.getEvent(name)!,args),removed:false});
 const records:any={};
 for(const kind of ['approve','burn','mint'] as const){
  const blockHash='0x'+(kind==='approve'?'a':kind==='burn'?'b':'c').repeat(64),blockNumber='0x10';
  const to=kind==='approve'?bridgeSources[op.source].usdc:kind==='burn'?CIRCLE_BRIDGE_CONTRACT:CCTP_MESSAGE_TRANSMITTER;
  const tx={hash:hashes[kind],from:op.sender,to,input:calls[kind],value:'0x0',nonce:kind==='approve'?'0x0f':kind==='burn'?'0x10':'0x11',chainId:ethers.toBeHex(kind==='mint'?5042002:bridgeSources[op.source].chainId),blockHash,blockNumber};
  const logs=kind==='burn'?[log(CCTP_MESSAGE_TRANSMITTER,'MessageSent',[message])]:kind==='mint'?[log(CCTP_MESSAGE_TRANSMITTER,'MessageReceived',[op.sender,0,'0x'+'7'.repeat(64),ethers.zeroPadValue(CCTP_TOKEN_MESSENGER,32),2000,'0x'+attested.slice(2+148*2)]),log(ARC_USDC,'Transfer',[ethers.ZeroAddress,op.recipient,params.amount])]:[];
  records[kind]={tx,receipt:{transactionHash:tx.hash,from:tx.from,to,blockHash,blockNumber,status:'0x1',logs},block:{hash:blockHash,number:blockNumber},chain:kind==='mint'?'Arc_Testnet':op.source};
 }
 let used='0x'+'0'.repeat(64),attestationMessage=attested,finalized='0x10';
 const read:BridgeRead=async<T>(chain,method,args)=>{
  if(method==='eth_call')return used as T;
  if(method==='cctp_attestation')return {messages:[{status:'complete',message:attestationMessage,eventNonce:'0x'+attestationMessage.slice(26,90)}]} as T;
  if(method==='eth_getBlockByNumber'){
   if(args[0]==='finalized')return {number:finalized} as T;
   const row=Object.values(records).find((r:any)=>r.chain===chain&&r.block.number===args[0]) as any;
   // Source approve and burn fixtures have the same block number, use the
   // currently selected receipt block below through distinct numbers.
   return (row?.block??null) as T;
  }
  const row=Object.values(records).find((r:any)=>r.chain===chain&&r.tx.hash===args[0]) as any;
  return (method==='eth_getTransactionByHash'?row?.tx:method==='eth_getTransactionReceipt'?row?.receipt:null) as T;
 };
 records.approve.tx.blockNumber=records.approve.receipt.blockNumber=records.approve.block.number='0x0f';
 return {op,params,calls,records,message,attested,read,get used(){return used;},set used(value:string){used=value;},get attestationMessage(){return attestationMessage;},set attestationMessage(value:string){attestationMessage=value;},get finalized(){return finalized;},set finalized(value:string){finalized=value;}};
}
export class MemoryStorage implements Storage{
 values=new Map<string,string>(); failWrites=false;
 get length(){return this.values.size;} clear(){this.values.clear();} key(index:number){return [...this.values.keys()][index]??null;}
 getItem(key:string){return this.values.get(key)??null;} removeItem(key:string){this.values.delete(key);}
 setItem(key:string,value:string){if(this.failWrites)throw Error('Fixture storage disabled');this.values.set(key,value);}
}
