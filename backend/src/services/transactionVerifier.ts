import {ethers} from 'ethers';
import {config} from '../config';
import {store} from '../db/store';
import {StorageConflict} from '../db/rowPersistence';
import {HUB_ABI} from '../contracts/hubAbi';
import {ArcReadProvider} from './arcReadProvider';
import {validateEventCoordinates,eventIndex,eventDigest} from './eventEvidence';
import {TransactionVerificationError,receiptIntent,assertReceiptConsumption} from '../domain/receiptConsumption';
export {TransactionVerificationError} from '../domain/receiptConsumption';
export interface TransactionIntent{intentId:string;expectedTo:string;expectedSender?:string;expectedFunction?:string;expectedCalldata?:string;expectedEvent:string;expectedEventArgs?:Record<string,any>;}
export interface VerificationResult{verified:boolean;txHash:string;blockNumber:number;blockHash:string;from:string;to:string;status:number;parsedEvent:any;eventName:string;logs:readonly ethers.Log[];blockTimestamp:number;}
const same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export class TransactionVerifier{
 private static provider:ethers.JsonRpcProvider|null=null;
 private static hubInterface=new ethers.Interface(HUB_ABI);
 public static getProvider():ethers.JsonRpcProvider{if(!this.provider)this.provider=new ArcReadProvider();return this.provider;}
 public static setProvider(provider:any):void{this.provider=provider;}
 private static storageFailure(e:unknown):never{if(e instanceof TransactionVerificationError)throw e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))throw new TransactionVerificationError('VERIFIER_STORAGE_CONFLICT',409);throw new TransactionVerificationError('VERIFIER_STORAGE_UNAVAILABLE',503);}
 private static consumption(hash:string,intentId:string,digest:string){try{const r=store.readReceiptConsumption(hash);assertReceiptConsumption(r,intentId,digest);return r;}catch(e){return this.storageFailure(e)}}
 private static async canonicalBlock(provider:any,number:number){
  let block:any;try{block=await provider.getBlock(number)}catch{throw new TransactionVerificationError('VERIFIER_RPC_UNAVAILABLE',503)}
  if(!block||block.number!==number||!ethers.isHexString(block.hash,32)||!Number.isSafeInteger(block.timestamp)||block.timestamp<0)throw new TransactionVerificationError('VERIFIER_BINDING_INVALID',400);return block;
 }
 /** Read-only proof of an exact reverted call. Committed success/replay bindings cannot be bypassed by cache edits. */
 public static async readRevertedProof(raw:TransactionIntent,txHash:string):Promise<{blockNumber:number;blockHash:string}|null>{const r=await this.readRevertedEvidence(raw,txHash);return r?{blockNumber:r.blockNumber,blockHash:r.blockHash}:null;}
 public static async readRevertedEvidence(raw:TransactionIntent,txHash:string):Promise<{blockNumber:number;blockHash:string;blockTimestamp:number;transactionIndex:number;nonce:number}|null>{
  if(!ethers.isHexString(txHash,32))return null;
  try{
   const {intent,digest}=receiptIntent(raw);if(!intent.expectedSender||!intent.expectedCalldata||!intent.expectedFunction)return null;
   const hash=txHash.toLowerCase(),consumed=this.consumption(hash,intent.intentId,digest);if(consumed?.bindingVersion===1)return null;
   const provider=this.getProvider(),[tx,receipt]=await Promise.all([provider.getTransaction(hash),provider.getTransactionReceipt(hash)]);
   if(!tx||!receipt||receipt.status!==0||!Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<config.deploymentBlock||!Number.isSafeInteger(tx.nonce)||tx.nonce<0||!Number.isSafeInteger(tx.index)||tx.index<0||receipt.index!==tx.index||!ethers.isHexString(receipt.blockHash,32)||!Array.isArray(receipt.logs)||receipt.logs.length!==0)return null;
   if(!same(tx.hash,hash)||!same(receipt.hash,hash)||tx.chainId!==BigInt(config.arcChainId)||!same(tx.from,intent.expectedSender)||!same(tx.from,receipt.from)||!same(tx.to,intent.expectedTo)||!same(tx.to,receipt.to)||!same(tx.data,intent.expectedCalldata)||tx.value!==0n||tx.blockNumber!==receipt.blockNumber||!same(tx.blockHash,receipt.blockHash)||consumed&&consumed.blockNumber!==receipt.blockNumber)return null;
   const decoded=this.hubInterface.parseTransaction({data:tx.data});if(decoded?.name!==intent.expectedFunction)return null;
   const block=await this.canonicalBlock(provider,receipt.blockNumber);if(!same(block.hash,receipt.blockHash))return null;
   const repeated=await this.canonicalBlock(provider,receipt.blockNumber);if(!same(repeated.hash,block.hash)||repeated.timestamp!==block.timestamp)return null;
   const current=this.consumption(hash,intent.intentId,digest);if(current?.bindingVersion===1||current&&current.blockNumber!==receipt.blockNumber)return null;
   if(current?.bindingVersion===2&&(!same(current.blockHash,receipt.blockHash)||current.blockTimestamp!==block.timestamp||current.transactionIndex!==receipt.index||current.nonce!==tx.nonce))return null;
   return{blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,blockTimestamp:block.timestamp,transactionIndex:receipt.index,nonce:tx.nonce};
  }catch{return null}
 }
 /** Validate the entire receipt and canonical scope before one-row, committed immutable-intent consumption. */
 public static async verifyExpectedTransaction(raw:TransactionIntent,txHash:string):Promise<VerificationResult>{
  if(!ethers.isHexString(txHash,32))throw new TransactionVerificationError('VERIFIER_HASH_INVALID',400);
  const {intent,digest}=receiptIntent(raw),hash=txHash.toLowerCase();this.consumption(hash,intent.intentId,digest);
  const provider=this.getProvider();let tx:ethers.TransactionResponse|null,receipt:ethers.TransactionReceipt|null;
  try{[tx,receipt]=await Promise.all([provider.getTransaction(hash),provider.getTransactionReceipt(hash)])}catch{throw new TransactionVerificationError('VERIFIER_RPC_UNAVAILABLE',503)}
  if(!tx)throw new TransactionVerificationError('VERIFIER_TRANSACTION_NOT_FOUND',409);
  if(!receipt)throw new TransactionVerificationError('VERIFIER_RECEIPT_PENDING',409);
  if(receipt.status!==1)throw new TransactionVerificationError('VERIFIER_STATUS_INVALID',400);
  if(!Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<config.deploymentBlock||!ethers.isHexString(receipt.blockHash,32)||!Number.isSafeInteger(tx.index)||tx.index<0||receipt.index!==tx.index||tx.chainId!==BigInt(config.arcChainId)||tx.value!==0n||!same(tx.hash,hash)||!same(receipt.hash,hash)||!ethers.isAddress(tx.from)||!ethers.isAddress(tx.to)||!same(tx.from,receipt.from)||!same(tx.to,receipt.to)||tx.blockNumber!==receipt.blockNumber||!same(tx.blockHash,receipt.blockHash))throw new TransactionVerificationError('VERIFIER_BINDING_INVALID',400);
  const block=await this.canonicalBlock(provider,receipt.blockNumber);if(!same(block.hash,receipt.blockHash))throw new TransactionVerificationError('VERIFIER_BINDING_INVALID',400);
  const actualTo=ethers.getAddress(tx.to).toLowerCase(),actualFrom=ethers.getAddress(tx.from).toLowerCase();
  if(actualTo!==intent.expectedTo.toLowerCase())throw new TransactionVerificationError('VERIFIER_DESTINATION_INVALID',400);
  if(intent.expectedSender&&actualFrom!==intent.expectedSender.toLowerCase())throw new TransactionVerificationError('VERIFIER_PRINCIPAL_INVALID',400);
  if(intent.expectedFunction){try{const call=this.hubInterface.parseTransaction({data:tx.data,value:tx.value});if(call?.name!==intent.expectedFunction)throw Error();}catch{throw new TransactionVerificationError('VERIFIER_CALL_INVALID',400)}}
  if(intent.expectedCalldata&&!same(tx.data,intent.expectedCalldata))throw new TransactionVerificationError('VERIFIER_CALL_INVALID',400);
  if(!Array.isArray(receipt.logs)||!receipt.logs.length||receipt.logs.length>4096)throw new TransactionVerificationError('VERIFIER_BINDING_INVALID',400);
  const indices=new Set<number>(),matches:{parsed:ethers.LogDescription;log:ethers.Log}[]=[];
  for(const log of receipt.logs){
   try{validateEventCoordinates(log);if(!same(log.transactionHash,hash)||!same(log.blockHash,receipt.blockHash)||log.blockNumber!==receipt.blockNumber||log.transactionIndex!==receipt.index||indices.has(eventIndex(log)))throw Error();indices.add(eventIndex(log));}catch{throw new TransactionVerificationError('VERIFIER_BINDING_INVALID',400)}
   if(!same(log.address,actualTo))continue;
   let parsed:ethers.LogDescription|null;try{parsed=this.hubInterface.parseLog({topics:[...log.topics],data:log.data})}catch{continue}
   if(parsed?.name===intent.expectedEvent&&Object.entries(intent.expectedEventArgs??{}).every(([k,v])=>String(parsed!.args[k]).toLowerCase()===String(v).toLowerCase()))matches.push({parsed,log});
  }
  if(matches.length!==1)throw new TransactionVerificationError(matches.length?'VERIFIER_EVENT_AMBIGUOUS':'VERIFIER_EVENT_REQUIRED',400);
  const matched=matches[0],repeated=await this.canonicalBlock(provider,receipt.blockNumber);if(!same(repeated.hash,block.hash)||repeated.timestamp!==block.timestamp)throw new TransactionVerificationError('VERIFIER_CANONICAL_CHANGED',409);
  try{store.consumeReceiptConsumption(hash,{intentId:intent.intentId,blockNumber:receipt.blockNumber,verifiedAt:Date.now(),bindingVersion:1,intentDigest:digest,chainId:config.arcChainId,hubAddress:actualTo,blockHash:receipt.blockHash.toLowerCase(),blockTimestamp:block.timestamp,eventName:matched.parsed.name,eventDigest:eventDigest(matched.log),transactionIndex:receipt.index,logIndex:eventIndex(matched.log)});}catch(e){return this.storageFailure(e)}
  return{verified:true,txHash:hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,from:actualFrom,to:actualTo,status:receipt.status,parsedEvent:matched.parsed.args,eventName:matched.parsed.name,logs:receipt.logs,blockTimestamp:block.timestamp};
 }
}
