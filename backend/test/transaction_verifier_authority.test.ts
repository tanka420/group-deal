import assert from 'node:assert/strict';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {HUB_ABI} from '../src/contracts/hubAbi';
import {TransactionVerifier,TransactionIntent} from '../src/services/transactionVerifier';
const initial=structuredClone(store.db),iface=new ethers.Interface(HUB_ABI);
assert.ok(store.isIsolated&&store.storageDirectory.includes('local-check-temp'));
const sql=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'),{readOnly:true});
const record=(key:string)=>{const r=sql.prepare("SELECT record_json FROM domain_records WHERE collection='consumedTxHashes' AND record_key=?").get(key) as {record_json:string}|undefined;return r?JSON.parse(r.record_json):undefined;};
const rows=()=>sql.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all();
const revision=()=>Number((sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as {revision:number}).revision);
let stage='SETUP',cases=0,tx:any,receipt:any,block:any,intent:TransactionIntent,hash:string,calls=0,blockReads=0;
let hook:(()=>void)|undefined,blockHook:((n:number)=>any)|undefined;
function setup(){
 store.replace(structuredClone(initial));config.deploymentBlock=1;
 const buyer=ethers.getAddress('0x'+'1'.repeat(40));hash=ethers.id('verifier-fixture-transaction');const blockNumber=10,blockHash=ethers.id('verifier-fixture-block'),calldata=iface.encodeFunctionData('confirmReceipt',[1,1]);
 block={number:blockNumber,hash:blockHash,timestamp:Math.floor(Date.now()/1000)-10};
 tx={hash,from:buyer,to:config.hubAddress,chainId:BigInt(config.arcChainId),blockNumber,blockHash,index:0,nonce:0,value:0n,data:calldata};
 const log={...iface.encodeEventLog(iface.getEvent('OrderConfirmed')!,[1,1,'100']),address:config.hubAddress,transactionHash:hash,blockNumber,blockHash,transactionIndex:0,index:0,removed:false};
 receipt={hash,from:buyer,to:config.hubAddress,status:1,blockNumber,blockHash,index:0,logs:[log]};
 intent={intentId:'receipt:fixture',expectedTo:config.hubAddress,expectedSender:buyer,expectedFunction:'confirmReceipt',expectedCalldata:calldata,expectedEvent:'OrderConfirmed',expectedEventArgs:{campaignId:1,orderId:1,sellerProceeds:'100'}};
 calls=blockReads=0;hook=undefined;blockHook=undefined;
 TransactionVerifier.setProvider({getNetwork:async()=>({chainId:BigInt(config.arcChainId)}),getTransaction:async(h:string)=>{calls++;hook?.();return h===hash?structuredClone(tx):null;},getTransactionReceipt:async(h:string)=>{calls++;return h===hash?structuredClone(receipt):null;},getBlock:async(n:number)=>{blockReads++;return blockHook?blockHook(n):structuredClone(block);}});
}
const verify=(i=intent)=>TransactionVerifier.verifyExpectedTransaction(i,hash);
async function main(){
 try{
 setup();const negative=process.argv.find(a=>a.startsWith('--negative='))?.slice(11);
 if(negative==='cache'){stage='N346_CACHED_CONSUMPTION_ERASE';store.db.consumedTxHashes[hash]={intentId:'receipt:other',blockNumber:10,verifiedAt:Date.now()};store.save();delete store.db.consumedTxHashes[hash];let rejected=false;try{await verify()}catch{rejected=true}console.log(JSON.stringify({observation:stage,rejected,committedIntentChanged:record(hash)?.intentId==='receipt:fixture'}));assert.equal(rejected,true,'Committed receipt binding must survive cache deletion');return;}
 if(negative==='flush'){stage='N347_VERIFIER_SNAPSHOT_FLUSH';store.db.notificationPreferences.pending={inApp:true,email:false};await verify();const r=sql.prepare("SELECT 1 FROM domain_records WHERE collection='notificationPreferences' AND record_key='pending'").get();console.log(JSON.stringify({observation:stage,pendingDomainCommitted:!!r}));assert.equal(r,undefined,'Receipt consumption must not flush unrelated pending rows');return;}
 if(negative==='trailing'){stage='N348_TRAILING_INVALID_RECEIPT_LOG';receipt.logs.push({...receipt.logs[0],address:ethers.getAddress('0x'+'2'.repeat(40)),transactionHash:ethers.id('foreign-transaction'),index:1});let rejected=false;try{await verify()}catch{rejected=true}console.log(JSON.stringify({observation:stage,rejected,receiptConsumed:!!record(hash)}));assert.equal(rejected,true,'All receipt logs must be bound before consuming');return;}
 if(negative==='intent'){stage='N349_SAME_ID_CHANGED_INTENT';await verify();let rejected=false;try{await verify({...intent,expectedSender:undefined,expectedCalldata:undefined})}catch{rejected=true}console.log(JSON.stringify({observation:stage,rejected,receiptConsumed:!!record(hash)}));assert.equal(rejected,true,'A consumed intent cannot be rebound to weaker expectations');return;}
 if(negative)throw Error('Invalid negative selector');
 const {TransactionVerificationError}=await import('../src/domain/receiptConsumption');
 const denied=(status:number)=>(e:unknown)=>e instanceof TransactionVerificationError&&e.status===status;
 const unchanged=async(fn:()=>Promise<unknown>,status:number)=>{const r=rows(),cache=structuredClone(store.db),v=revision();await assert.rejects(fn,denied(status));assert.equal(revision(),v);assert.deepEqual(rows(),r);assert.deepEqual(store.db,cache);};
 const check=async(name:string,fn:()=>Promise<unknown>)=>{stage=name;setup();await fn();cases++;};
 await check('SUCCESS_SHAPE_AND_RECEIPT_INTENT_BINDING',async()=>{const result=await verify();assert.deepEqual(Object.keys(result).sort(),['blockHash','blockNumber','blockTimestamp','eventName','from','logs','parsedEvent','status','to','txHash','verified']);const saved=record(hash);assert.equal(saved.intentId,intent.intentId);assert.equal(saved.bindingVersion,1);assert.equal(saved.chainId,config.arcChainId);assert.equal(saved.hubAddress,config.hubAddress.toLowerCase());assert.equal(saved.blockHash,block.hash);assert.equal(saved.eventName,'OrderConfirmed');assert.ok(ethers.isHexString(saved.intentDigest,32));assert.ok(ethers.isHexString(saved.eventDigest,32));});
 await check('EXACT_RETRY_NO_WRITE_OR_VERIFIED_TIME_CHANGE',async()=>{await verify();const r=rows(),v=revision();await verify({...intent,expectedEventArgs:{sellerProceeds:100,orderId:'1',campaignId:'1'},expectedTo:ethers.getAddress(config.hubAddress)});assert.equal(revision(),v);assert.deepEqual(rows(),r);});
 await check('COMMITTED_OTHER_INTENT_BEATS_DELETED_OR_FORGED_CACHE',async()=>{store.db.consumedTxHashes[hash]={intentId:'receipt:other',blockNumber:10,verifiedAt:Date.now()};store.save();delete store.db.consumedTxHashes[hash];await unchanged(()=>verify(),409);assert.equal(calls,0);});
 await check('IMMUTABLE_INTENT_CONTEXT_CANNOT_CHANGE',async()=>{await verify();await unchanged(()=>verify({...intent,expectedSender:undefined,expectedCalldata:undefined}),409);});
 await check('UNRELATED_PENDING_ROWS_REMAIN_PENDING',async()=>{store.db.notificationPreferences.pending={inApp:true,email:false};store.db.users.pending={id:'pending',email:'pending@fixture.invalid',roles:['operator'],activeWallet:null,createdAt:Date.now()};const before=rows();await verify();assert.equal(sql.prepare("SELECT 1 FROM domain_records WHERE collection='users' AND record_key='pending'").get(),undefined);assert.equal(sql.prepare("SELECT 1 FROM domain_records WHERE collection='notificationPreferences' AND record_key='pending'").get(),undefined);assert.equal(rows().length,before.length+1);assert.ok(store.db.users.pending);});
 await check('DIRTY_RECEIPT_TARGET_REJECTS_WITHOUT_FLUSH',async()=>{store.db.consumedTxHashes[hash]={intentId:intent.intentId,blockNumber:10,verifiedAt:Date.now()};await unchanged(()=>verify(),409);});
 await check('LEGACY_RETRY_UPGRADES_BINDING_AND_PRESERVES_EXTENSIONS',async()=>{const old=Date.now()-1000;store.db.consumedTxHashes[hash]={intentId:intent.intentId,blockNumber:10,verifiedAt:old,privateExtension:'fixture-private-consumption'} as any;store.save();await verify();assert.equal(record(hash).verifiedAt,old);assert.equal(record(hash).privateExtension,'fixture-private-consumption');assert.equal(record(hash).bindingVersion,1);assert.ok(!JSON.stringify((store as any).readReceiptConsumption(hash)).includes('fixture-private'));});
 await check('LEGACY_BLOCK_AND_PARTIAL_BINDING_FAIL_CLOSED',async()=>{store.db.consumedTxHashes[hash]={intentId:intent.intentId,blockNumber:9,verifiedAt:Date.now()};store.save();await unchanged(()=>verify(),409);});
 await check('MALFORMED_COMMITTED_RECEIPT_NOT_OVERWRITTEN',async()=>{store.db.consumedTxHashes[hash]={intentId:intent.intentId,blockNumber:10,verifiedAt:Date.now(),bindingVersion:1} as any;store.save();await unchanged(()=>verify(),503);});
 await check('INVALID_INTENT_AND_HASH_ERRORS_ARE_FINITE',async()=>{const secret='fixture-sensitive-input-never-echoed';for(const value of [null,{...intent,intentId:''},{...intent,expectedSender:'bad'},{...intent,expectedEventArgs:{bad:{secret}}}])await unchanged(()=>TransactionVerifier.verifyExpectedTransaction(value as any,hash),400);await assert.rejects(()=>TransactionVerifier.verifyExpectedTransaction(intent,secret),(e:unknown)=>e instanceof TransactionVerificationError&&e.status===400&&!e.message.includes(secret));});
 await check('RECEIPT_CHAIN_TRANSACTION_AND_BLOCK_BINDING',async()=>{tx.chainId=1n;await unchanged(()=>verify(),400);});
 await check('EXACT_FUNCTION_CALLDATA_AND_ZERO_VALUE',async()=>{tx.value=1n;await unchanged(()=>verify(),400);});
 await check('MISSING_PENDING_RPC_AND_STATUS_FAIL_CLOSED',async()=>{TransactionVerifier.setProvider({getTransaction:async()=>null,getTransactionReceipt:async()=>null});await unchanged(()=>verify(),409);});
 await check('CANONICAL_BLOCK_RECHECK_BEFORE_COMMIT',async()=>{blockHook=()=>blockReads>1?{...block,hash:ethers.id('changed-after-first-read')}:structuredClone(block);await unchanged(()=>verify(),409);});
 await check('TRAILING_FOREIGN_LOG_CANNOT_ESCAPE_COORDINATE_VALIDATION',async()=>{receipt.logs.push({...receipt.logs[0],address:ethers.getAddress('0x'+'2'.repeat(40)),transactionHash:ethers.id('wrong-log-transaction'),index:1});await unchanged(()=>verify(),400);});
 await check('DUPLICATE_REMOVED_UNSAFE_LOGS_REJECT',async()=>{receipt.logs.push({...receipt.logs[0],address:ethers.getAddress('0x'+'2'.repeat(40))});await unchanged(()=>verify(),400);});
 await check('AMBIGUOUS_MATCHING_EVENT_REJECT',async()=>{receipt.logs.push({...receipt.logs[0],index:1});await unchanged(()=>verify(),400);});
 await check('MISMATCHED_EVENT_ARGUMENTS_DO_NOT_CONSUME',async()=>{intent.expectedEventArgs!.orderId=2;await unchanged(()=>verify(),400);});
 await check('SAME_INTENT_CONCURRENCY_ONE_DURABLE_WRITE',async()=>{const v=revision();await Promise.all([verify(),verify()]);assert.equal(revision(),v+1);assert.equal(record(hash).intentId,intent.intentId);});
 await check('DIFFERENT_INTENTS_CONCURRENT_ONE_WINNER',async()=>{const r=await Promise.allSettled([verify(),verify({...intent,intentId:'receipt:other'})]);assert.equal(r.filter(v=>v.status==='fulfilled').length,1);assert.equal(r.filter(v=>v.status==='rejected').length,1);});
 await check('REAL_SQLITE_CONSUMPTION_ABORT_ROLLS_BACK',async()=>{const control=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'));try{control.exec("CREATE TRIGGER fixture_consume_abort BEFORE INSERT ON domain_records WHEN NEW.collection='consumedTxHashes' BEGIN SELECT RAISE(ABORT,'fixture consume abort'); END");await unchanged(()=>verify(),503);}finally{control.exec('DROP TRIGGER fixture_consume_abort');control.close();}});
 await check('REVERTED_PROOF_USES_COMMITTED_REPLAY_BINDING',async()=>{receipt.status=0;receipt.logs=[];store.db.consumedTxHashes[hash]={intentId:'receipt:other',blockNumber:10,verifiedAt:Date.now()};store.save();delete store.db.consumedTxHashes[hash];const r=rows(),cache=structuredClone(store.db),v=revision();assert.equal(await TransactionVerifier.readRevertedProof(intent,hash),null);assert.equal(revision(),v);assert.deepEqual(rows(),r);assert.deepEqual(store.db,cache);});
 await check('REVERTED_EXACT_CANONICAL_PROOF_IS_READ_ONLY',async()=>{receipt.status=0;receipt.logs=[];const r=rows(),v=revision();assert.deepEqual(await TransactionVerifier.readRevertedProof(intent,hash),{blockNumber:block.number,blockHash:block.hash});assert.equal(revision(),v);assert.deepEqual(rows(),r);});
 await check('EXTERNAL_WRITER_REVISION_CANNOT_BE_OVERWRITTEN',async()=>{const control=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'));try{let once=false;hook=()=>{if(once)return;once=true;control.prepare("INSERT INTO domain_records(collection,record_key,record_json) VALUES('consumedTxHashes',?,?)").run(hash,JSON.stringify({intentId:'receipt:external',blockNumber:10,verifiedAt:Date.now()}));control.exec('UPDATE storage_revision SET revision=revision+1 WHERE id=1');};await assert.rejects(()=>verify(),denied(409));assert.equal(record(hash).intentId,'receipt:external');assert.equal(store.db.consumedTxHashes[hash],undefined);}finally{control.close();}});
 console.log('PASS '+cases+' transaction verifier authority cases; isolated native SQLite and synthetic canonical receipts; no live chain or financial broadcast');
 }finally{sql.close();store.close()}
}
main().catch(e=>{console.error(JSON.stringify({result:'FAIL',stage,assertion:e instanceof assert.AssertionError,code:e instanceof assert.AssertionError?e.code:e instanceof Error?e.name:'UNKNOWN'}));process.exitCode=1});
