import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {walletErc20} from '../src/domain/walletQuote';
import {assertWalletTransaction,verifyWalletReceipt} from '../src/domain/walletReceipt';
import type {WalletFlowRecord} from '../src/domain/walletFlow';
import type {ServerBridgeRead} from '../src/domain/bridgeReceipt';
import {ARC_WALLET_TOKENS,ARC_SWAP_ADAPTER} from '../../shared/arcWallet.mjs';
const principal='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32),headHash='0x'+'ef'.repeat(32);
function fixture(kind:'APPROVE'|'SWAP'){
 const to=kind==='APPROVE'?ARC_WALLET_TOKENS.USDC.address:ARC_SWAP_ADAPTER,data=kind==='APPROVE'?walletErc20.encodeFunctionData('approve',[ARC_SWAP_ADAPTER,1000000n]):'0x12345678';
 const record={principal,quote:{tokenIn:'USDC',tokenOut:'EURC',amount:'1000000',minimumOut:'990000',calls:[{kind,to,data,value:'0',fee:{gasLimit:'60000',maxFeePerGas:'200',maxNetworkFee:'12000000'}}]},steps:[{index:0,nonce:'0',txHash:hash,state:'SUBMITTED'}]} as WalletFlowRecord;
 const tx={hash,from:principal,to,input:data,value:'0x0',chainId:'0x4cef52',nonce:'0x0',gas:'0xea60',gasPrice:'0xc8',blockNumber:'0x20',blockHash,transactionIndex:'0x0'};
 const event=(token:string,name:string,args:unknown[],index:number)=>({address:token,...walletErc20.encodeEventLog(walletErc20.getEvent(name)!,args),removed:false,transactionHash:hash,blockHash,blockNumber:'0x20',transactionIndex:'0x0',logIndex:ethers.toQuantity(index)});
 const receipt={transactionHash:hash,from:principal,to,status:'0x1',blockNumber:'0x20',blockHash,transactionIndex:'0x0',logs:kind==='APPROVE'?[event(to,'Approval',[principal,ARC_SWAP_ADAPTER,1000000n],0)]:[event(ARC_WALLET_TOKENS.USDC.address,'Transfer',[principal,ARC_SWAP_ADAPTER,1000000n],0),event(ARC_WALLET_TOKENS.EURC.address,'Transfer',[recipient,principal,990000n],1)]};
 let finality=true,reorg=false,changed=false,reads=0;const read:ServerBridgeRead=async<T>(_chain,method,args)=>{if(method==='eth_chainId')return '0x4cef52' as T;if(method==='eth_getTransactionByHash')return tx as T;if(method==='eth_getTransactionReceipt'){reads++;return(changed&&reads>1?{...receipt,status:'0x0'}:receipt) as T;}if(method==='eth_getBlockByNumber')return{number:args[0]==='finalized'?(finality?'0x30':'0x1'):args[0],hash:args[0]==='0x20'?(reorg?headHash:blockHash):headHash} as T;throw Error('Unexpected RPC');};
 return{record,tx,receipt,read,event,set finality(v:boolean){finality=v;},set reorg(v:boolean){reorg=v;},set changed(v:boolean){changed=v;}};
}
void(async()=>{
 for(const kind of ['APPROVE','SWAP'] as const){const f=fixture(kind);assert.equal((await verifyWalletReceipt(f.record,0,f.read)).receiptStatus,1);}console.log('PASS wallet approval and swap finalized token semantics');
 {const f=fixture('APPROVE');f.receipt.logs=[f.event(ARC_WALLET_TOKENS.USDC.address,'Approval',[principal,recipient,1000000n],0)];await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_APPROVAL_NOT_CONFIRMED/);}console.log('PASS wallet approval rejects another spender');
 {const f=fixture('SWAP');f.receipt.logs[1]=f.event(ARC_WALLET_TOKENS.EURC.address,'Transfer',[recipient,principal,989999n],1);await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_SWAP_NOT_CONFIRMED/);}console.log('PASS wallet swap enforces minimum received');
 {const f=fixture('SWAP');f.receipt.logs[0]=f.event(ARC_WALLET_TOKENS.USDC.address,'Transfer',[principal,ARC_SWAP_ADAPTER,999999n],0);await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_SWAP_NOT_CONFIRMED/);}console.log('PASS wallet swap rejects a different input spend');
 {const f=fixture('SWAP');f.receipt.logs[1].logIndex='0x0';await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_RECEIPT_INVALID/);}console.log('PASS wallet receipt rejects duplicate log indices');
 {const f=fixture('SWAP');f.finality=false;await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_FINALITY_PENDING/);}console.log('PASS wallet receipt waits for finality');
 {const f=fixture('SWAP');f.reorg=true;await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_RECEIPT_REORG/);}console.log('PASS wallet receipt rejects noncanonical block');
 {const f=fixture('SWAP');f.changed=true;await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_RECEIPT_REORG/);}console.log('PASS wallet receipt rejects a changed reread');
 {const f=fixture('SWAP');f.tx.gasPrice='0xc9';await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_TRANSACTION_FEE_MISMATCH/);}console.log('PASS wallet transaction respects reviewed network fee cap');
 // Regression: the external wallet changed the live approval's gas allocation
 // while retaining a smaller total ceiling (84,362 * 39 gwei < 73,114 * 50 gwei).
 {const f=fixture('APPROVE');Object.assign(f.record.quote.calls[0].fee,{gasLimit:'73114',maxFeePerGas:'50000000000',maxNetworkFee:'3655700000000000'});Object.assign(f.tx,{gas:'0x1498a',gasPrice:'0x826299e00',maxFeePerGas:'0x91494c600',maxPriorityFeePerGas:'0x37e11d600'});assertWalletTransaction(f.record,0,f.tx,hash);assert.equal((await verifyWalletReceipt(f.record,0,f.read)).receiptStatus,1);}console.log('PASS live approval gas allocation remains within reviewed total fee');
 {const f=fixture('APPROVE');Object.assign(f.tx,{gas:'0xc350',maxFeePerGas:'0xf0',maxPriorityFeePerGas:'0x1'});assertWalletTransaction(f.record,0,f.tx,hash);assert.equal((await verifyWalletReceipt(f.record,0,f.read)).receiptStatus,1);}console.log('PASS higher gas price with lower limit accepts exact total cap');
 {const f=fixture('APPROVE');Object.assign(f.tx,{gas:'0xc350',gasPrice:'0x1',maxFeePerGas:'0xf1'});await assert.rejects(verifyWalletReceipt(f.record,0,f.read),/WALLET_TRANSACTION_FEE_MISMATCH/);}console.log('PASS type2 maximum liability cannot hide behind low effective gas price');
 {const f=fixture('APPROVE');Object.assign(f.tx,{maxFeePerGas:'0xc8',maxPriorityFeePerGas:'0xc9'});assert.throws(()=>assertWalletTransaction(f.record,0,f.tx,hash),/WALLET_TRANSACTION_FEE_MISMATCH/);}console.log('PASS priority fee above maximum remains rejected');
 for(const gas of ['0x0','0x2710','0x989681']){const f=fixture('APPROVE');Object.assign(f.tx,{gas,gasPrice:'0x1'});assert.throws(()=>assertWalletTransaction(f.record,0,f.tx,hash),/WALLET_TRANSACTION_FEE_MISMATCH/);}console.log('PASS invalid gas allocation remains rejected');
})().catch(e=>{console.error(e);process.exitCode=1;});
