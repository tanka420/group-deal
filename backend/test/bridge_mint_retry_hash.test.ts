import {BridgeServerClient,serverBridgeJournal} from '../../frontend/src/services/bridgeServer';
import {guardedBridgeProvider,bridgeJournalKey,inspectBridgeJournal,attachBridgeRecoveryHash} from '../../frontend/src/services/bridgeJournal';
import {BridgeSafetyError} from '../../frontend/src/services/bridgeRecovery';
import {MemoryStorage} from '../../frontend/test/fixtures/bridge';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {ethers} from 'ethers';
import {TransactionalStore} from '../src/db/store';
import {SessionRegistry} from '../src/services/sessionService';
import {BridgeTransferRegistry} from '../src/services/bridgeTransferRegistry';
import {BridgeTransferError,reserveBridgeTransferWrite,type BridgeTransferRecord} from '../src/domain/bridgeTransfer';
import {serverBridgeAbi,serverBridgeRoutes,inspectServerBridgeTransfer,type ServerBridgeRead} from '../src/domain/bridgeReceipt';
import {prepareServerBridgeRequest} from '../src/domain/bridgeRequest';
import {readServerBridgeRpc} from '../src/services/bridgeReadRpc';
import {createBridgeRouter} from '../src/routes/bridgeRoutes';
import {bridgeFixture,operation,hashes} from '../../frontend/test/fixtures/bridge';
const origin='https://fixture.groupdeal.invalid',secondOrigin='https://second.fixture.invalid';
const denied=(code:string)=>(e:unknown)=>e instanceof BridgeTransferError&&e.code===code;
let stage='SETUP',cases=0;
async function fixture(limits?:Parameters<typeof createBridgeRouter>[0]['limits']){
 const signer=ethers.Wallet.createRandom(),f=bridgeFixture({...operation,sender:signer.address.toLowerCase()}),dir=mkdtempSync(path.join(os.tmpdir(),'groupdeal-bridge-http-'));assert.ok(dir.includes('local-check-temp'));
 for(const [kind,number]of [['approve','0x21'],['burn','0x22'],['mint','0x21']] as const)f.records[kind].tx.blockNumber=f.records[kind].receipt.blockNumber=f.records[kind].block.number=number;
 const db=new TransactionalStore(dir),otherWallet=ethers.Wallet.createRandom().address.toLowerCase();db.db.users.owner={id:'owner',email:'owner@fixture.invalid',roles:['buyer'],activeWallet:f.op.recipient,createdAt:Date.now()};db.db.users.other={id:'other',email:'other@fixture.invalid',roles:['buyer'],activeWallet:otherWallet,createdAt:Date.now()};db.save();
 const sessions=new SessionRegistry(db),token=sessions.issue(db.db.users.owner,'EVM_WALLET'),otherToken=sessions.issue(db.db.users.other,'EVM_WALLET'),proof=sessions.authenticate(token),registry=new BridgeTransferRegistry(db,origin),sql=new DatabaseSync(path.join(dir,'groupdeal.sqlite'),{readOnly:true});
 const scope={source:f.op.source,sender:f.op.sender,recipient:f.op.recipient,amountBaseUnits:'1250000'},state={head:{Ethereum_Sepolia:'0x20',Arc_Testnet:'0x20'} as Record<string,string>,nonce:{Ethereum_Sepolia:'0xf',Arc_Testnet:'0x11'} as Record<string,string>,native:'0x100000000',token:1250000n,allowance:1250000n,used:0n,irisMessage:f.attested,irisAttestation:'0x'+'4'.repeat(130),reads:[] as Array<{chain:string;method:string;params:unknown[]}>,hook:undefined as ((chain:string,method:string,args:unknown[])=>Promise<void>|void)|undefined};
 const header=(chain:string,number:string)=>Object.values(f.records).find((r:any)=>r.chain===chain&&r.block.number===number)?.block??{number,hash:ethers.id('header-'+chain+'-'+number)};
 const read:ServerBridgeRead=async<T>(chain,method,args)=>{state.reads.push({chain,method,params:structuredClone(args)});await state.hook?.(chain,method,args);if(method==='eth_getBlockByNumber')return structuredClone(header(chain,args[0]==='latest'||args[0]==='finalized'?state.head[chain]:String(args[0]))) as T;if(method==='eth_getTransactionCount')return state.nonce[chain] as T;if(method==='eth_getBalance')return state.native as T;if(method==='eth_gasPrice')return '0x1' as T;if(method==='eth_estimateGas')return '0x5208' as T;if(method==='cctp_attestation')return {messages:[{status:'complete',message:state.irisMessage,attestation:state.irisAttestation,eventNonce:'0x'+state.irisMessage.slice(26,90)}]} as T;if(method==='eth_call'){const call=serverBridgeAbi.parseTransaction({data:(args[0] as any).data});return ethers.toBeHex(call?.name==='balanceOf'?state.token:call?.name==='allowance'?state.allowance:state.used,32) as T;}return await f.read<T>(chain,method,args);};
 const app=express();app.use('/api/bridge',createBridgeRouter({database:db,origins:[origin,secondOrigin],read,limits}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+(server.address() as any).port;
 const headers=(auth=token,o:string|undefined=origin)=>({'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{}),...(o?{Origin:o}:{})});
 const http=async(route:string,body?:unknown,auth=token,o:string|undefined=origin)=>{const response=await fetch(base+'/api/bridge'+route,{method:body===undefined?'GET':'POST',headers:headers(auth,o),...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,headers:response.headers,body:await response.json() as any};};
 const snapshot=()=>sql.prepare("SELECT record_key,record_json FROM domain_records WHERE collection='bridgeTransfers' ORDER BY record_key").all();
 const packet=(r:BridgeTransferRecord,kind:'approve'|'burn'|'mint',writeId=randomUUID())=>({writeId,expectedRevision:r.revision,chainId:kind==='mint'?5042002:11155111,transaction:{from:scope.sender,to:f.records[kind].tx.to,data:f.calls[kind],value:'0x0'}});
 const authorized=async()=>{const draft=registry.create(proof,scope,randomUUID());return registry.authorize(proof,draft.id,await signer.signMessage(registry.sourceMessage(draft)));};
 const advance=(kind:'approve'|'burn'|'mint')=>{const chain=kind==='mint'?'Arc_Testnet':'Ethereum_Sepolia';state.head[chain]=f.records[kind].block.number;state.nonce[chain]=ethers.toQuantity(BigInt(f.records[kind].tx.nonce)+1n);if(kind==='mint')state.used=1n;};
 const seedBurn=async()=>{let r=await authorized();for(const kind of ['approve','burn'] as const){const w={id:randomUUID(),kind,chainId:11155111,calldataHash:ethers.keccak256(f.calls[kind]),nonce:BigInt(f.records[kind].tx.nonce).toString(),afterBlock:'10'};r=registry.reserve(proof,r.id,w,r.revision);r=registry.attach(proof,r.id,w.id,hashes[kind],r.revision);advance(kind);}return r;};
 return{f,signer,db,sessions,token,otherToken,otherWallet,proof,registry,sql,scope,state,read,headers,http,snapshot,packet,authorized,advance,seedBurn,base,close:async()=>{sql.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function failedMint(f:Fixture){
 const r=await f.seedBurn(),ready=await f.http('/'+r.id+'/ready',f.packet(r,'mint'));assert.equal(ready.status,200,JSON.stringify(ready.body));
 const attached=await f.http('/'+r.id+'/writes/'+ready.body.write.id+'/hash',{txHash:hashes.mint,expectedRevision:ready.body.record.revision});assert.equal(attached.status,202);
 f.f.records.mint.receipt.status='0x0';f.f.records.mint.receipt.logs=[];f.advance('mint');f.state.used=0n;return attached.body.record as BridgeTransferRecord;
}
function mintAttempt(f:Fixture,name:string,nonce:string,number:string,reverted=false){
 const row=structuredClone(bridgeFixture(f.f.op).records.mint),hash=ethers.id(name),blockHash=ethers.id(name+'-block');row.tx.hash=row.receipt.transactionHash=hash;row.tx.nonce=nonce;row.tx.blockNumber=row.receipt.blockNumber=row.block.number=number;row.tx.blockHash=row.receipt.blockHash=row.block.hash=blockHash;if(reverted){row.receipt.status='0x0';row.receipt.logs=[];}f.f.records[name]=row;return row;
}
async function scenario(name:string,run:(f:Fixture,r:BridgeTransferRecord,row:any,journal:ReturnType<typeof serverBridgeJournal>,storage:MemoryStorage)=>Promise<void>){stage=name;const f=await fixture();try{const original=await failedMint(f),ready=await f.http('/'+original.id+'/ready',f.packet(original,'mint'));assert.equal(ready.status,200);const r=ready.body.record as BridgeTransferRecord,row=mintAttempt(f,'mint-hash-recovery','0x12','0x22');f.state.head.Arc_Testnet='0x22';f.state.nonce.Arc_Testnet='0x13';f.state.used=1n;const journal=serverBridgeJournal(r as any,null),storage=new MemoryStorage();await run(f,r,row,journal,storage);cases++;console.log('PASS '+name)}finally{await f.close()}}
const fault=(code:string)=>(e:unknown)=>e instanceof BridgeSafetyError&&e.code===code;
async function main(){
await scenario('LOST_RETRY_RESPONSE_RECOVERS_EXACT_PENDING_HASH_THEN_SERVER_FINALIZED_CLOSURE',async(f,r,row,journal,storage)=>{
 const old=structuredClone(r.writes.slice(0,3));await attachBridgeRecoveryHash(journal,'mint',row.tx.hash,f.read,storage);assert.equal(journal.writes.at(-1)!.hash,row.tx.hash);assert.equal(journal.writes[2].hash,hashes.mint);assert.equal(journal.writes.filter(w=>w.kind==='burn').length,1);assert.equal(JSON.parse(storage.getItem(bridgeJournalKey(f.scope.recipient))!).writes.at(-1).hash,row.tx.hash);assert.equal(f.registry.get(f.proof,r.id)!.writes.at(-1)!.state,'REQUESTED');
 const attached=await f.http('/'+r.id+'/writes/'+journal.writes.at(-1)!.id+'/hash',{txHash:row.tx.hash,expectedRevision:r.revision});assert.equal(attached.status,202);assert.equal((await f.http('/'+r.id+'/inspect',{})).body.inspection.state,'MINTED');const closed=await f.http('/'+r.id+'/close',{mode:'complete'});assert.equal(closed.status,200);assert.equal(closed.body.record.completion.receipts.length,4);assert.deepEqual(closed.body.record.writes.slice(0,3),old);
});
await scenario('HASH_RECOVERY_CANNOT_REPLACE_CURRENT_PENDING_ATTEMPT_WITH_OLD_REVERT_HASH',async(f,r,_row,journal,storage)=>{const raw=JSON.stringify(journal),before=f.snapshot();await assert.rejects(attachBridgeRecoveryHash(journal,'mint',hashes.mint,f.read,storage),fault('BRIDGE_RECORD_INVALID'));assert.equal(JSON.stringify(journal),raw);assert.equal(storage.length,0);assert.deepEqual(f.snapshot(),before)});
await scenario('HASH_RECOVERY_REJECTS_THIRD_PARTY_CALLER_FOR_OWNED_PREPARED_NONCE',async(f,_r,row,journal,storage)=>{const caller=ethers.Wallet.createRandom().address.toLowerCase();row.tx.from=row.receipt.from=caller;const raw=JSON.stringify(journal);await assert.rejects(attachBridgeRecoveryHash(journal,'mint',row.tx.hash,f.read,storage),fault('BRIDGE_RECORD_INVALID'));assert.equal(JSON.stringify(journal),raw);assert.equal(storage.length,0)});
await scenario('HASH_RECOVERY_REQUIRES_ALL_PRIOR_MINT_ATTEMPTS_STILL_REVERTED',async(f,_r,row,journal,storage)=>{f.f.records.mint.receipt.status='0x1';f.f.records.mint.receipt.logs=bridgeFixture(f.f.op).records.mint.receipt.logs;const raw=JSON.stringify(journal);await assert.rejects(attachBridgeRecoveryHash(journal,'mint',row.tx.hash,f.read,storage),fault('BRIDGE_WRITE_UNRESOLVED'));assert.equal(JSON.stringify(journal),raw);assert.equal(storage.length,0)});
await scenario('HASH_RECOVERY_REJECTS_REORG_OF_PRIOR_MINT_WITHOUT_JOURNAL_MUTATION',async(f,_r,row,journal,storage)=>{f.f.records.mint.block.hash=ethers.id('prior-mint-reorg');const raw=JSON.stringify(journal);await assert.rejects(attachBridgeRecoveryHash(journal,'mint',row.tx.hash,f.read,storage),fault('BRIDGE_RECEIPT_REORG'));assert.equal(JSON.stringify(journal),raw);assert.equal(storage.length,0)});
await scenario('HASH_RECOVERY_CANNOT_IMPORT_NEW_MINT_WITHOUT_PREPARED_PENDING_WRITE',async(f,_r,row,journal,storage)=>{journal.writes.pop();const raw=JSON.stringify(journal);await assert.rejects(attachBridgeRecoveryHash(journal,'mint',row.tx.hash,f.read,storage),fault('BRIDGE_WRITE_UNRESOLVED'));assert.equal(JSON.stringify(journal),raw);assert.equal(storage.length,0)});
await scenario('HASH_RECOVERY_REJECTS_DIFFERENT_NONCE_OR_CALldata_FROM_PENDING_WRITE',async(f,_r,row,journal,storage)=>{const raw=JSON.stringify(journal);row.tx.nonce='0x14';await assert.rejects(attachBridgeRecoveryHash(journal,'mint',row.tx.hash,f.read,storage),fault('BRIDGE_RECORD_INVALID'));assert.equal(JSON.stringify(journal),raw);row.tx.nonce='0x12';journal.writes.at(-1)!.dataHash=ethers.id('wrong-call');const changed=JSON.stringify(journal);await assert.rejects(attachBridgeRecoveryHash(journal,'mint',row.tx.hash,f.read,storage),fault('BRIDGE_RECORD_INVALID'));assert.equal(JSON.stringify(journal),changed);assert.equal(storage.length,0)});
console.log(JSON.stringify({suite:'BRIDGE_MINT_RETRY_HASH_RECOVERY',result:'PASS',cases,apiSqlAndJournalReal:true,chainWalletSynthetic:true,walletCalls:0,liveFinancialTransaction:false,originalSqliteOpened:false}));
}
main().catch(e=>{console.error(JSON.stringify({suite:'BRIDGE_MINT_RETRY_HASH_RECOVERY',result:'FAIL',stage,cases,message:e instanceof Error?e.message:'unknown'}));process.exitCode=1});