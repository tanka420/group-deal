import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {HUB_ABI} from '../src/contracts/hubAbi';
import {OperationService} from '../src/services/operationService';
import {OperationReplacementService as Replacement} from '../src/services/operationReplacementService';
import {TransactionVerifier} from '../src/services/transactionVerifier';
import {SessionService} from '../src/services/sessionService';
import {SignerReservationRegistry} from '../src/services/signerReservationRegistry';
import {SignerReservationError,signerReservationId,resolveSignerOwner,prepareSignerAcquisition,prepareSignerObservation,isPreparedSignerObservationMutation,isPreparedSignerReadyMutation} from '../src/domain/signerReservation';
import type {ServerBridgeRead} from '../src/domain/bridgeReceipt';
assert.ok(store.isIsolated);let stage='SETUP',cases=0;
const selected=process.argv.find(a=>a.startsWith('--case='))?.slice(7),iface=new ethers.Interface(HUB_ABI);
function sqlRead<T>(fn:(db:DatabaseSync)=>T){const db=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'),{readOnly:true});try{return fn(db)}finally{db.close()}}
const rows=()=>sqlRead(db=>db.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all()),revision=()=>sqlRead(db=>Number((db.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision));
async function fixture(observe=true,cancelOriginal=true,reserveOriginal=false){
 const wallet=ethers.Wallet.createRandom(),id='buyer-'+randomUUID(),hub=ethers.Wallet.createRandom().address;
 Object.assign(config,{arcChainId:5042002,hubAddress:hub,deploymentBlock:1});store.db.users[id]={id,email:id+'@fixture.invalid',roles:['buyer'],activeWallet:wallet.address,createdAt:0};store.save();const token=SessionService.issue(store.db.users[id]),proof=SessionService.authenticate(token);
 const make=()=>{const key='replacement:'+randomUUID();return OperationService.prepare({userId:id,action:'BUYER_CLAIM',resourceId:'campaign',principal:wallet.address,idempotencyKey:key,intentId:key,calldata:iface.encodeFunctionData('claimBuyerFunds',[1,[1]]),expectedFunction:'claimBuyerFunds',expectedEvent:'FundsClaimed',expectedEventArgs:{claimType:0}})};
 const op=make(),raw=await wallet.signTransaction({chainId:config.arcChainId,to:hub,nonce:7,data:op.calldata,value:0n,gasLimit:200000n,type:2,maxFeePerGas:2n,maxPriorityFeePerGas:1n}),old=ethers.Transaction.from(raw).hash!,hash=ethers.id('cancel:'+op.id),blockHash=ethers.id('block:'+op.id);
 if(reserveOriginal)await new SignerReservationRegistry(store).acquire(proof,{purpose:{kind:'HUB_OPERATION',operationId:op.id},chainId:5042002,principal:wallet.address.toLowerCase()},async()=>{throw Error('Fresh first loan needs no receipt RPC')});
 OperationService.submit(id,op.id,old);const txs=new Map<string,any>(),receipts=new Map<string,any>(),original={hash:old,chainId:BigInt(config.arcChainId),from:wallet.address,to:hub,nonce:7,data:op.calldata,value:0n},cancel={...original,hash,to:wallet.address,data:'0x',value:3n,index:0,blockNumber:20,blockHash},receipt={hash,from:wallet.address,to:wallet.address,status:1,index:0,blockNumber:20,blockHash,logs:[] as any[]},block={number:20,hash:blockHash,timestamp:Math.floor(Date.now()/1000),transactions:[hash]};txs.set(old,original);txs.set(hash,cancel);receipts.set(hash,receipt);
 let reads=0,head=21,nonce=8,hook:((method:string,args:any[])=>void)|undefined;
 const provider={getNetwork:async()=>({chainId:5042002n}),getTransaction:async(h:string)=>txs.get(h)??null,getTransactionReceipt:async(h:string)=>receipts.get(h)??null,getBlock:async()=>structuredClone(block)};TransactionVerifier.setProvider(provider);
 if(observe){await Replacement.observe(id,op.id,old,undefined,proof);if(cancelOriginal)await Replacement.replace(id,op.id,old,hash,undefined,proof)}else{store.transaction(()=>{op.broadcastWitnesses=[{txHash:old,nonce:7,observedAt:Date.now(),source:'RPC_TRANSACTION'}];op.replacements=[{previousTxHash:old,txHash:hash,nonce:7,blockNumber:20,blockHash,kind:'NONCE_CONSUMED',verifiedAt:Date.now()}];op.phase='SUPERSEDED';op.errorCode='NONCE_CONSUMED_BY_OTHER_CALL';});}
 const loan=()=>Object.values(store.db.signerReservations??{}).find(r=>r.purpose.kind==='HUB_OPERATION'&&r.purpose.operationId===op.id);
 const rawTx=(t:any)=>t?{hash:t.hash,from:t.from,to:t.to,input:t.data,value:ethers.toQuantity(t.value),nonce:ethers.toQuantity(t.nonce),chainId:ethers.toQuantity(t.chainId),...(t.blockNumber===undefined?{}:{blockNumber:ethers.toQuantity(t.blockNumber),blockHash:t.blockHash,transactionIndex:ethers.toQuantity(t.index)})}:null;
 const rawReceipt=(v:any)=>v?{transactionHash:v.hash,from:v.from,to:v.to,status:ethers.toQuantity(v.status),blockNumber:ethers.toQuantity(v.blockNumber),blockHash:v.blockHash,transactionIndex:ethers.toQuantity(v.index),logs:v.logs}:null;
 const read:ServerBridgeRead=async<T>(chain,method,args)=>{reads++;hook?.(method,args);assert.equal(chain,'Arc_Testnet');let result:any;if(method==='eth_getTransactionByHash')result=rawTx(txs.get(String(args[0])));else if(method==='eth_getTransactionReceipt')result=rawReceipt(receipts.get(String(args[0])));else if(method==='eth_getBlockByNumber'){const number=args[0]==='finalized'?head:Number(BigInt(String(args[0])));result=number===20?{number:'0x14',hash:block.hash,transactions:structuredClone(block.transactions)}:{number:ethers.toQuantity(number),hash:ethers.id('head:'+op.id+':'+number),transactions:[]};}else{assert.equal(method,'eth_getTransactionCount');assert.equal(String(args[0]).toLowerCase(),wallet.address.toLowerCase());assert.equal(args[1],ethers.toQuantity(head));result=ethers.toQuantity(nonce)}return structuredClone(result) as T;};
 const next=make(),reference={purpose:{kind:'HUB_OPERATION' as const,operationId:next.id},chainId:5042002,principal:wallet.address.toLowerCase()},registry=new SignerReservationRegistry(store),acquire=()=>registry.acquire(proof,reference,read),financial=()=>JSON.stringify({orders:store.db.orders,campaigns:store.db.campaigns,grants:store.db.resourceGrants,operations:Object.values(store.db.operations).filter(v=>v.userId===id)});
 return{id,wallet,proof,raw,op,old,hash,original,cancel,receipt,block,txs,receipts,provider,loan,next,reference,read,registry,acquire,financial,get reads(){return reads},set head(v:number){head=v},set nonce(v:number){nonce=v},set hook(fn:typeof hook){hook=fn}};
}
type F=Awaited<ReturnType<typeof fixture>>;
async function check(name:string,fn:(f:F)=>Promise<void>,observe=true,cancelOriginal=true,reserveOriginal=false){if(selected&&selected!==name)return;stage=name;const f=await fixture(observe,cancelOriginal,reserveOriginal);await fn(f);cases++;console.log('PASS '+name)}
async function hold(f:F,code?:string){const before=rows(),v=revision(),cached=structuredClone(store.db);await assert.rejects(f.acquire,(e:any)=>e instanceof SignerReservationError&&(!code||e.code===code));assert.deepEqual(rows(),before);assert.equal(revision(),v);assert.deepEqual(store.db,cached)}
async function run(){try{
 await check('FINALIZED_OTHER_CALL_RELEASES_WITHOUT_FINANCIAL_PROJECTION',async f=>{const before=f.financial();await f.acquire();assert.equal(f.loan()?.phase,'RELEASED');assert.equal(f.loan()?.completion?.hash,f.hash);assert.equal(f.loan()?.completion?.nonce,'7');assert.equal(f.financial(),before)});
 await check('PRUNED_ORIGINAL_USES_PROTECTED_RPC_WITNESS',async f=>{assert.equal(f.loan()?.phase,'OBSERVED');f.txs.delete(f.old);await f.acquire();assert.equal(f.loan()?.completion?.originalWitness?.hash,f.old);assert.equal(f.loan()?.witnesses?.[0].source,'RPC_TRANSACTION')});
 await check('LEGACY_FRESH_ORIGINAL_RPC_PROVES_NONCE',async f=>{assert.equal(f.loan(),undefined);await f.acquire();assert.equal(f.loan()?.completion?.originalWitness?.nonce,'7')},false);
 await check('RAW_OPERATION_METADATA_WITHOUT_ORIGINAL_CANNOT_RELEASE',async f=>{f.txs.delete(f.old);await hold(f,'SIGNER_ORIGINAL_WITNESS_REQUIRED')},false);
 await check('SIGNED_LEGACY_WITNESS_CAPTURE_IS_ATOMIC_AND_PRIVATE',async f=>{f.txs.delete(f.old);const v=revision(),audits=store.db.auditLogs.length,financial=f.financial();await Replacement.observe(f.id,f.op.id,f.old,f.raw,f.proof);assert.equal(revision(),v+1);assert.equal(store.db.auditLogs.length,audits);assert.equal(f.financial(),financial);assert.equal(f.loan()?.witnesses?.[0].source,'SIGNED_TRANSACTION');assert.ok(!JSON.stringify(store.db).includes(f.raw));await f.acquire();assert.equal(f.loan()?.phase,'RELEASED')},false);
 await check('OBSERVATION_RETRY_NO_RPC_OR_SECOND_REVISION',async f=>{const v=revision(),before=rows();f.provider.getNetwork=async()=>{throw Error('RPC must not be called')};await Replacement.observe(f.id,f.op.id,f.old,undefined,f.proof);assert.equal(revision(),v);assert.deepEqual(rows(),before)});
 for(const [name,mutate] of [
 ['WRONG_REPLACEMENT_CALLER',(f:F)=>{f.cancel.from=ethers.Wallet.createRandom().address;f.receipt.from=f.cancel.from}],
 ['WRONG_REPLACEMENT_NONCE',(f:F)=>{f.cancel.nonce=8}],
 ['WRONG_REPLACEMENT_CHAIN',(f:F)=>{f.cancel.chainId=1n}],
 ['RECEIPT_TO_CONTRADICTION',(f:F)=>{f.receipt.to=config.hubAddress}],
 ['CANONICAL_POSITION_MISMATCH',(f:F)=>{f.block.transactions=[f.old]}],
 ['RECEIPT_BLOCK_MISMATCH',(f:F)=>{f.cancel.blockHash=ethers.id('mismatch')}],
 ['FINALITY_PENDING',(f:F)=>{f.head=19}],
 ['NONCE_UNCONSUMED',(f:F)=>{f.nonce=7}],
 ['REORG',(f:F)=>{f.block.hash=ethers.id('reorg')}],
 ['REMOVED_LOG',(f:F)=>{f.receipt.logs=[{removed:true}]}],
 ['REVERTED_WITH_LOGS',(f:F)=>{f.receipt.status=0;f.receipt.logs=[{}]}],
 ['FALSE_OTHER_CALL',(f:F)=>{f.cancel.to=config.hubAddress;f.cancel.data=f.op.calldata;f.cancel.value=0n;f.receipt.to=f.cancel.to}]
 ] as const)await check(name,async f=>{mutate(f);await hold(f)});
 await check('FINALIZED_REVERTED_OTHER_CALL_CONSUMES_NONCE',async f=>{f.receipt.status=0;await f.acquire();assert.equal(f.loan()?.completion?.receiptStatus,0)});
 await check('ORIGINAL_RECEIPT_APPEARS_DURING_PROOF',async f=>{f.hook=(method)=>{if(method==='eth_getBlockByNumber')f.receipts.set(f.old,{...f.receipt,hash:f.old,to:config.hubAddress})};await hold(f,'SIGNER_RECEIPT_REORG')});
 await check('RELEASED_HISTORY_RECHECKS_REPLACEMENT',async f=>{await f.acquire();const record=structuredClone(f.loan()!),owner=resolveSignerOwner(record.purpose,f.op)!;f.block.hash=ethers.id('historical-reorg');const target=resolveSignerOwner(f.reference.purpose,f.next)!;await assert.rejects(prepareSignerAcquisition({target,entries:[{record,owner}]},f.proof.claims.authRecoveryContext,f.read,true),(e:any)=>e.code==='SIGNER_RECEIPT_REORG')});
 await check('GENERIC_CACHE_CANNOT_ALTER_PROTECTED_NONCE',async f=>{const record=structuredClone(f.loan()!),before=rows();f.loan()!.witnesses![0].nonce='8';await assert.rejects(async()=>store.save(),/signer ledger requires scoped mutation/);store.db.signerReservations[record.id]=record;assert.deepEqual(rows(),before)});
 await check('GENERIC_CACHE_CANNOT_DELETE_WITNESS',async f=>{const record=structuredClone(f.loan()!),before=rows();delete store.db.signerReservations[record.id];await assert.rejects(async()=>store.save(),/signer ledger requires scoped mutation/);store.db.signerReservations[record.id]=record;assert.deepEqual(rows(),before)});
 await check('OBSERVATION_SEAL_IS_NOT_READY_OR_CLONE_PERMIT',async f=>{const selection={actorId:f.id,operationId:f.op.id,sessionKey:f.proof.key},state=store.readOperationReplacementState(selection).signer!,plan=prepareSignerObservation(state,f.proof.claims.authRecoveryContext,f.original,'RPC_TRANSACTION',Date.now());assert.equal(isPreparedSignerObservationMutation(plan,state),true);assert.equal(isPreparedSignerReadyMutation(plan,state),false);assert.equal(isPreparedSignerObservationMutation(structuredClone(plan),state),false);const before=rows();assert.throws(()=>store.mutateOperationReplacement(selection,()=>undefined,structuredClone(plan)),/SIGNER_PROOF_REQUIRED/);assert.deepEqual(rows(),before)});
 await check('PENDING_SAME_CALL_HASH_APPENDS_PROTECTED_SAME_NONCE',async f=>{f.cancel.to=config.hubAddress;f.cancel.data=f.op.calldata;f.cancel.value=0n;await Replacement.observe(f.id,f.op.id,f.hash,undefined,f.proof);assert.equal(f.loan()?.witnesses?.length,2);assert.equal(f.loan()?.witnesses?.[1].hash,f.hash);assert.equal(f.op.txHash,f.old);assert.equal(f.op.phase,'SUBMITTED');await hold(f,'SIGNER_RECEIPT_PENDING')},true,false);
 await check('PENDING_DIFFERENT_NONCE_CANNOT_APPEND',async f=>{f.cancel.to=config.hubAddress;f.cancel.data=f.op.calldata;f.cancel.value=0n;f.cancel.nonce=8;const before=rows();await assert.rejects(Replacement.observe(f.id,f.op.id,f.hash,undefined,f.proof),(e:any)=>e.code==='SIGNER_ORIGINAL_WITNESS_REQUIRED'||e.code==='SIGNER_ORIGINAL_WITNESS_CHANGED');assert.deepEqual(rows(),before);assert.equal(f.loan()?.witnesses?.length,1)},true,false);
 await check('ACTIVE_LOAN_OBSERVATION_RETAINS_EXCLUSIVITY_UNTIL_FINALIZED_CANCEL',async f=>{assert.equal(f.loan()?.phase,'ACTIVE');assert.equal(f.loan()?.revision,1);assert.equal(f.loan()?.witnesses?.length,1);assert.equal(Object.values(store.db.signerReservations??{}).filter(r=>r.principal===f.wallet.address.toLowerCase()&&r.phase==='ACTIVE').length,1);await f.acquire();assert.equal(f.loan()?.phase,'RELEASED');assert.equal(f.loan()?.revision,2);assert.equal(Object.values(store.db.signerReservations??{}).filter(r=>r.principal===f.wallet.address.toLowerCase()&&r.phase==='ACTIVE').length,1)},true,true,true);
 console.log(JSON.stringify({suite:'SIGNER_NONCE_REPLACEMENT',result:'PASS',cases,actualReplacementService:true,isolatedSqlite:true,syntheticChain:true,financialProjectionUnchanged:true,originalDbOpened:false}));
}finally{store.close()}}
run().catch(e=>{console.error(JSON.stringify({stage,name:e instanceof Error?e.name:'UNKNOWN',code:typeof e?.code==='string'?e.code:undefined,message:e instanceof assert.AssertionError?e.message:undefined}));process.exitCode=1});