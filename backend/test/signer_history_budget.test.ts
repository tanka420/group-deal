import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ethers} from 'ethers';
import {prepareSignerAcquisition,readSignerReservation,signerReservationId,isPreparedSignerReadyMutation,SignerReservationError,type SignerOwner,type SignerState} from '../src/domain/signerReservation';
import type {ServerBridgeRead} from '../src/domain/bridgeReceipt';

const principal='0x2222222222222222222222222222222222222222',to='0x3333333333333333333333333333333333333333',blockHash=ethers.id('history-block'),headHash=ethers.id('history-head');
function fixture(count:number,unreserved=false){
 const rows=new Map<string,{tx:any;receipt:any}>();let calls=0;
 const owner=(n:number):SignerOwner=>({purpose:{kind:'HUB_OPERATION',operationId:'op_'+randomUUID()},accountId:'owner',chainId:5042002,principal,bindingHash:ethers.id('binding-'+n),phase:'PROJECTED',txHash:ethers.id('tx-'+n),hub:{to,calldata:'0x1234',replacements:[]}});
 const owners=Array.from({length:count},(_,n)=>owner(n)),target={...owner(count),phase:'PREPARED',txHash:undefined};
 const entries=owners.map((o,n)=>{const tx={hash:o.txHash,from:principal,to,input:'0x1234',value:'0x0',nonce:ethers.toQuantity(n),chainId:ethers.toQuantity(5042002),blockNumber:'0x10',blockHash},receipt={transactionHash:o.txHash,from:principal,to,blockNumber:'0x10',blockHash,status:'0x1',logs:[]};rows.set(o.txHash!,{tx,receipt});return{owner:o,record:readSignerReservation({version:1,id:signerReservationId(o),accountId:'owner',chainId:5042002,principal,purpose:o.purpose,bindingHash:o.bindingHash,createdAt:Date.now()-10000,revision:1,phase:'RELEASED',completion:{hash:o.txHash,nonce:String(n),blockNumber:'0x10',blockHash,finalizedBlock:{number:'0x20',hash:headHash},receiptStatus:1,checkedAt:Date.now()-1000}})}});
 const state:SignerState={target,entries:unreserved?[]:entries,unreserved:unreserved?owners:[]};
 const read:ServerBridgeRead=async<T>(_chain,method,args)=>{calls++;const row=rows.get(String(args[0]));if(method==='eth_getTransactionByHash'&&row)return structuredClone(row.tx) as T;if(method==='eth_getTransactionReceipt'&&row)return structuredClone(row.receipt) as T;if(method==='eth_getBlockByNumber')return(args[0]==='0x10'?{number:'0x10',hash:blockHash}:{number:'0x20',hash:headHash}) as T;if(method==='eth_getTransactionCount')return ethers.toQuantity(count) as T;throw Error('UNEXPECTED_FIXTURE_READ')};
 return{state,read,rows,get calls(){return calls}};
}
const denied=(code:string)=>(e:unknown)=>e instanceof SignerReservationError&&e.code===code;
let cases=0;
async function check(name:string,run:()=>Promise<void>){await run();cases++;console.log('PASS '+name)}
async function main(){
 for(const count of [13,64])await check('RELEASED_HISTORY_'+count+'_RECHECKS_EVERY_TRANSACTION_WITHIN_CARDINALITY_BUDGET',async()=>{const f=fixture(count),before=structuredClone(f.state),plan=await prepareSignerAcquisition(f.state,undefined,f.read,true);assert.equal(f.calls,count*10);assert.equal(plan.records.length,1);assert.equal(isPreparedSignerReadyMutation(plan,f.state),true);assert.deepEqual(f.state,before)});
 await check('UNRESERVED_HISTORY_USES_SAME_BUDGET_AND_VERIFIED_PROOFS',async()=>{const f=fixture(13,true),before=structuredClone(f.state),plan=await prepareSignerAcquisition(f.state,undefined,f.read,true);assert.equal(f.calls,130);assert.equal(plan.records.length,14);assert.equal(plan.records.filter(r=>r.phase==='RELEASED').length,13);assert.deepEqual(f.state,before)});
 await check('HISTORY_OVER_64_REJECTS_BEFORE_RPC',async()=>{const f=fixture(65);await assert.rejects(prepareSignerAcquisition(f.state,undefined,f.read,true),denied('SIGNER_HISTORY_REVIEW_REQUIRED'));assert.equal(f.calls,0)});
 await check('LAST_HISTORICAL_REORG_AFTER_128_READS_STILL_BLOCKS',async()=>{const f=fixture(13),read:ServerBridgeRead=async<T>(chain,method,args)=>{const result=await f.read<T>(chain,method,args);if(method==='eth_getBlockByNumber'&&f.calls>128)(result as any).hash=ethers.id('reorg');return result},before=structuredClone(f.state);await assert.rejects(prepareSignerAcquisition(f.state,undefined,read,true),denied('SIGNER_RECEIPT_REORG'));assert.equal(f.calls,130);assert.deepEqual(f.state,before)});
 await check('PENDING_HISTORY_CANNOT_BECOME_A_NEW_RESERVATION',async()=>{const f=fixture(13);f.rows.get(f.state.entries[12].owner!.txHash!)!.receipt=null;const before=structuredClone(f.state);await assert.rejects(prepareSignerAcquisition(f.state,undefined,f.read,true),denied('SIGNER_RECEIPT_PENDING'));assert.deepEqual(f.state,before)});
 await check('LARGER_BUDGET_RETAINS_25_SECOND_DEADLINE',async()=>{const f=fixture(13),now=Date.now;let elapsed=0;Date.now=()=>now()+elapsed;const read:ServerBridgeRead=async<T>(chain,method,args)=>{const value=await f.read<T>(chain,method,args);if(f.calls===129)elapsed=25001;return value};try{await assert.rejects(prepareSignerAcquisition(f.state,undefined,read,true),denied('SIGNER_READ_BUDGET_EXHAUSTED'))}finally{Date.now=now}assert.equal(f.calls,129)});
 console.log(JSON.stringify({suite:'SIGNER_HISTORY_BUDGET',result:'PASS',cases,syntheticReceipts:true,liveRpc:false,financialExecution:false}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'CHECK_FAILED');process.exitCode=1});
