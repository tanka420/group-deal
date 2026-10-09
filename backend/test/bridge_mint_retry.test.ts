import {BridgeServerClient,serverBridgeJournal} from '../../frontend/src/services/bridgeServer';
import {guardedBridgeProvider,bridgeJournalKey,inspectBridgeJournal} from '../../frontend/src/services/bridgeJournal';
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
async function check(name:string,run:(f:Fixture)=>Promise<void>){stage=name;const f=await fixture();try{await run(f);cases++;console.log('PASS '+name)}finally{await f.close()}}
async function main(){
await check('FINALIZED_REVERTED_MINT_NEW_LOGIN_EMPTY_CACHE_REAL_HTTP_GUARD_AND_CLOSURE',async f=>{
 const r=await failedMint(f),original=structuredClone(r.writes),inspection=await f.http('/'+r.id+'/inspect',{});assert.equal(inspection.body.inspection.state,'BURNED');assert.equal((await f.http('/'+r.id+'/close',{mode:'complete'})).status,409);
 f.sessions.logout(f.token,{idempotencyKey:randomUUID()});const token=f.sessions.issue(f.db.db.users.owner,'EVM_WALLET'),proof=f.sessions.authenticate(token);assert.equal(proof.claims.authRecoveryContext,f.proof.claims.authRecoveryContext);const before=f.snapshot();assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'),f.token)).status,401);assert.deepEqual(f.snapshot(),before);
 const transport:typeof fetch=(input,init)=>fetch(f.base+String(input),{...init,headers:{...init?.headers,Origin:origin}}),api=new BridgeServerClient(token,'owner',f.scope.recipient,()=>{},transport,origin);let server=(await api.current())!;assert.equal(server.id,r.id);assert.deepEqual(server.writes,original);let journal=serverBridgeJournal(server,null);const storage=new MemoryStorage();assert.equal(storage.length,0);
 const next=mintAttempt(f,'retry-mint','0x12','0x22');let walletCalls=0,consents=0;
 const provider={request:async({method,params=[]}:any)=>{if(method==='eth_chainId')return ethers.toQuantity(5042002);if(method==='eth_accounts')return[f.scope.sender];if(method==='eth_getTransactionCount')return f.state.nonce.Arc_Testnet;if(method==='eth_blockNumber')return f.state.head.Arc_Testnet;if(method==='eth_sendTransaction'){walletCalls++;assert.equal(server.writes.length,4);assert.equal(server.writes.at(-1)!.state,'REQUESTED');assert.deepEqual(server.writes.slice(0,3),original);assert.equal((params[0] as any).data,f.f.calls.mint);assert.equal((params[0] as any).nonce,'0x12');f.state.head.Arc_Testnet='0x22';f.state.nonce.Arc_Testnet='0x13';f.state.used=1n;return next.tx.hash;}throw Error('Unexpected fixture wallet method '+method)}};
 const guarded=guardedBridgeProvider(provider,{operation:f.f.op,current:()=>true,journal:()=>journal,changed:j=>{journal=j},retry:true,read:f.read,storage,reviewWrite:async request=>{assert.equal(request.kind,'mint');consents++;return()=>{}},server:{reserve:async(w,tx)=>{const p=await api.ready(server,w,tx);server=p.record;return p;},broadcast:async(w,hash)=>{server=await api.attach(server,w.id,hash,true)}}});
 const tx={...f.packet(r,'mint').transaction,nonce:'0x12',chainId:ethers.toQuantity(5042002),gas:'0x5208',gasPrice:'0x1'};assert.equal(await guarded.request({method:'eth_sendTransaction',params:[tx]}),next.tx.hash);assert.equal(walletCalls,1);assert.equal(consents,1);assert.deepEqual(server.writes.slice(0,3),original);assert.equal(journal.writes.filter(w=>w.kind==='burn').length,1);assert.equal(JSON.parse(storage.getItem(bridgeJournalKey(f.scope.recipient))!).writes.at(-1).hash,next.tx.hash);
 const restored=serverBridgeJournal((await api.current())!,null);assert.equal(restored.writes.length,4);assert.equal((await inspectBridgeJournal(restored,f.read)).state,'MINTED');assert.equal((await api.inspect(server)).state,'MINTED');server=await api.close(server,'complete');assert.equal(server.phase,'CLOSED');assert.equal(server.completion!.receipts.length,4);assert.deepEqual(server.writes.slice(0,3),original);assert.equal((server.completion!.receipts[2] as any).reverted,true);assert.equal((server.completion!.receipts[3] as any).reverted,false);
 await assert.rejects(guarded.request({method:'eth_sendTransaction',params:[tx]}),e=>e instanceof BridgeSafetyError&&e.code==='BRIDGE_WRITE_UNRESOLVED');assert.equal(walletCalls,1);
});
await check('MINT_RETRY_REQUESTED_OR_MISSING_RECEIPT_CANNOT_RELEASE_OR_RESERVE',async f=>{
 let r=await f.seedBurn();const ready=await f.http('/'+r.id+'/ready',f.packet(r,'mint'));assert.equal(ready.status,200);r=ready.body.record;let before=f.snapshot(),reads=f.state.reads.length;assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).status,409);assert.equal(f.state.reads.length,reads);assert.deepEqual(f.snapshot(),before);assert.equal((await f.http('/'+r.id+'/close',{mode:'complete'})).status,409);
 r=(await f.http('/'+r.id+'/writes/'+ready.body.write.id+'/hash',{txHash:hashes.mint,expectedRevision:r.revision})).body.record;f.advance('mint');f.state.used=0n;f.f.records.mint.receipt=null;before=f.snapshot();assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).body.code,'BRIDGE_RECEIPT_PENDING');assert.deepEqual(f.snapshot(),before);
});
await check('MINT_RETRY_REQUIRES_FINALITY_AND_CANONICAL_REVERT',async f=>{
 const r=await failedMint(f),before=f.snapshot();f.state.head.Arc_Testnet='0x20';assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).body.code,'BRIDGE_RECEIPT_FINALITY_PENDING');assert.deepEqual(f.snapshot(),before);f.state.head.Arc_Testnet='0x21';f.f.records.mint.block.hash=ethers.id('reorg');assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).body.code,'BRIDGE_RECEIPT_REORG');assert.deepEqual(f.snapshot(),before);
});
await check('MINT_RETRY_REQUIRES_UNUSED_CCTP_NONCE_SAME_ATTESTATION_AND_NEW_EVM_NONCE',async f=>{
 const r=await failedMint(f),before=f.snapshot();f.state.used=1n;assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).body.code,'BRIDGE_TRANSFER_WRITE_UNRESOLVED');f.state.used=0n;f.state.irisAttestation='0x'+'5'.repeat(130);assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).body.code,'BRIDGE_REQUEST_ATTESTATION_CHANGED');f.state.irisAttestation='0x'+'4'.repeat(130);f.state.nonce.Arc_Testnet='0x11';assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).body.code,'BRIDGE_REQUEST_NONCE_CHANGED');assert.deepEqual(f.snapshot(),before);
});
await check('SUCCESSFUL_MINT_NEVER_ALLOWS_RETRY_APPROVE_OR_REBURN',async f=>{
 const r=await failedMint(f),row=bridgeFixture(f.f.op).records.mint;f.f.records.mint.receipt.status='0x1';f.f.records.mint.receipt.logs=row.receipt.logs;f.state.used=1n;const before=f.snapshot();assert.equal((await f.http('/'+r.id+'/inspect',{})).body.inspection.state,'MINTED');for(const kind of ['mint','approve','burn'] as const)assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,kind))).body.code,'BRIDGE_TRANSFER_WRITE_UNRESOLVED');assert.deepEqual(f.snapshot(),before);
});
await check('MULTIPLE_FINALIZED_REVERTS_APPEND_ONLY_AND_EXACT_REPLAY_NEVER_REDISPATCHES',async f=>{
 let r=await failedMint(f),old=structuredClone(r.writes);const second=mintAttempt(f,'retry-2','0x12','0x22',true),packet=f.packet(r,'mint'),ready=await f.http('/'+r.id+'/ready',packet);assert.equal(ready.status,200);assert.equal(ready.body.dispatchAllowed,true);const before=f.snapshot(),reads=f.state.reads.length,replay=await f.http('/'+r.id+'/ready',packet);assert.equal(replay.body.dispatchAllowed,false);assert.deepEqual(f.snapshot(),before);assert.equal(f.state.reads.length,reads);
 r=(await f.http('/'+r.id+'/writes/'+ready.body.write.id+'/hash',{txHash:second.tx.hash,expectedRevision:ready.body.record.revision})).body.record;f.state.head.Arc_Testnet='0x22';f.state.nonce.Arc_Testnet='0x13';assert.equal((await f.http('/'+r.id+'/inspect',{})).body.inspection.state,'BURNED');const third=await f.http('/'+r.id+'/ready',f.packet(r,'mint'));assert.equal(third.status,200);assert.equal(third.body.write.nonce,'19');assert.deepEqual(third.body.record.writes.slice(0,3),old);assert.equal(third.body.record.writes.length,5);assert.equal(third.body.record.writes.filter((w:any)=>w.kind==='burn').length,1);
});
await check('MINT_RETRY_REQUIRES_OPAQUE_CURRENT_SERVER_PLAN_INSIDE_SQL',async f=>{
 const r=await failedMint(f),request=await prepareServerBridgeRequest(r,f.packet(r,'mint'),f.read),next=reserveBridgeTransferWrite(r,request.write,r.revision),selection={actorId:f.proof.account.id,sessionKey:f.proof.key,id:r.id},before=f.snapshot();assert.throws(()=>f.db.mutateBridgeTransfer(selection,()=>({result:null,record:next,request:structuredClone(request)})),denied('BRIDGE_TRANSFER_PROOF_REQUIRED'));
 const {requestHash,...unsealed}=request.write;assert.throws(()=>f.registry.reserve(f.proof,r.id,unsealed,r.revision),denied('BRIDGE_TRANSFER_PROOF_REQUIRED'));const now=Date.now;Date.now=()=>request.readAt+30001;try{assert.throws(()=>f.db.mutateBridgeTransfer(selection,()=>({result:null,record:next,request})),denied('BRIDGE_TRANSFER_PROOF_REQUIRED'))}finally{Date.now=now}assert.deepEqual(f.snapshot(),before);
});
await check('MINT_RETRY_CONCURRENT_WINNER_AND_REVOKED_SESSION_AFTER_RPC',async f=>{
 const r=await failedMint(f),packets=[f.packet(r,'mint'),f.packet(r,'mint')],results=await Promise.all(packets.map(p=>f.http('/'+r.id+'/ready',p)));assert.equal(results.filter(x=>x.status===200&&x.body.dispatchAllowed).length,1);assert.ok(results.filter(x=>x.status!==200).every(x=>[409,429].includes(x.status)));assert.deepEqual(f.registry.get(f.proof,r.id)!.writes.slice(0,3),r.writes);
});
await check('MINT_RETRY_REVOKED_SESSION_DURING_PROOF_CANNOT_COMMIT',async f=>{
 const r=await failedMint(f),before=f.snapshot();let revoked=false;f.state.hook=(_chain,method,args)=>{if(!revoked&&method==='eth_getBlockByNumber'&&args[0]==='latest'){revoked=true;f.sessions.logout(f.token,{idempotencyKey:randomUUID()})}};assert.equal((await f.http('/'+r.id+'/ready',f.packet(r,'mint'))).status,401);assert.equal(revoked,true);assert.deepEqual(f.snapshot(),before);
});
await check('HISTORY_CANNOT_HIDE_SUCCESSFUL_MINT_BEHIND_LATER_REVERT',async f=>{
 const r=await failedMint(f),next=mintAttempt(f,'forged-later-revert','0x12','0x22',true);f.f.records.mint.receipt.status='0x1';f.f.records.mint.receipt.logs=bridgeFixture(f.f.op).records.mint.receipt.logs;f.state.used=1n;f.state.head.Arc_Testnet='0x22';const history={...r,writes:[...r.writes,{...r.writes.at(-1)!,id:randomUUID(),nonce:'18',afterBlock:'33',hash:next.tx.hash}]};await assert.rejects(inspectServerBridgeTransfer(history,f.read),denied('BRIDGE_WRITE_BINDING_INVALID'));assert.deepEqual(f.registry.get(f.proof,r.id),r);
});
console.log(JSON.stringify({suite:'BRIDGE_FINALIZED_MINT_RETRY',result:'PASS',cases,apiSqlClientAndGuardReal:true,generatedSourceSignature:true,chainWalletSynthetic:true,liveFinancialTransaction:false,originalSqliteOpened:false}));
}
main().catch(e=>{console.error(JSON.stringify({suite:'BRIDGE_FINALIZED_MINT_RETRY',result:'FAIL',stage,cases,message:e instanceof Error?e.message:'unknown'}));process.exitCode=1});