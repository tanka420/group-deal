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
import {serverBridgeAbi,serverBridgeRoutes,type ServerBridgeRead} from '../src/domain/bridgeReceipt';
import {prepareServerBridgeRequest} from '../src/domain/bridgeRequest';
import {readServerBridgeRpc} from '../src/services/bridgeReadRpc';
import {createBridgeRouter} from '../src/routes/bridgeRoutes';
import {bridgeFixture,operation,hashes} from '../../frontend/test/fixtures/bridge';
import {BridgeServerClient,serverBridgeMessage,serverBridgeJournal} from '../../frontend/src/services/bridgeServer';
import {guardedBridgeProvider,bridgeJournalKey} from '../../frontend/src/services/bridgeJournal';
import {BridgeSafetyError} from '../../frontend/src/services/bridgeRecovery';
import {MemoryStorage} from '../../frontend/test/fixtures/bridge';
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

async function main(){
 const f=await fixture();try{
  let active=true;const assertCurrent=()=>{if(!active)throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED');},transport:typeof fetch=(input,init)=>fetch(f.base+String(input),{...init,headers:{...init?.headers,Origin:origin}});
  const api=new BridgeServerClient(f.token,'owner',f.scope.recipient,assertCurrent,transport,origin);assert.equal(await api.current(),null);
  const r=await api.create(randomUUID(),f.f.op);assert.equal(serverBridgeMessage(r),f.registry.sourceMessage(r));const authorized=await api.authorize(r,await f.signer.signMessage(serverBridgeMessage(r)));let server=authorized,own=serverBridgeJournal(server,null),storage=new MemoryStorage(),walletCalls=0;
  const provider={request:async({method,params=[]}:any)=>{if(method==='eth_chainId')return'0xaa36a7';if(method==='eth_accounts')return[f.scope.sender];if(method==='eth_getTransactionCount')return'0xf';if(method==='eth_blockNumber')return'0x20';if(method==='eth_sendTransaction'){walletCalls++;assert.equal(f.registry.get(f.proof,server.id)?.writes[0].state,'REQUESTED');active=false;return hashes.approve;}throw Error('Unexpected fixture wallet read');}};
  const guarded=guardedBridgeProvider(provider,{operation:f.f.op,current:()=>active,journal:()=>own,changed:j=>{own=j},retry:false,storage,server:{reserve:async(w,tx)=>{const p=await api.ready(server,w,tx);server=p.record;return p;},broadcast:async(w,hash)=>{server=await api.attach(server,w.id,hash,true);}}});
  const tx={...f.packet(server as any,'approve').transaction,nonce:'0xf',chainId:'0xaa36a7',gas:'0x5208',gasPrice:'0x1'};
  const result=await guarded.request({method:'eth_sendTransaction',params:[tx]});assert.equal(result,hashes.approve);assert.equal(walletCalls,1);assert.equal(server.writes[0].hash,hashes.approve);assert.equal(JSON.parse(storage.getItem(bridgeJournalKey(f.scope.recipient))!).writes[0].hash,hashes.approve);active=true;const recovered=serverBridgeJournal((await api.current())!,null);assert.equal(recovered.id,server.id);assert.equal(recovered.writes[0].hash,hashes.approve);await assert.rejects(api.ready(server,own.writes[0],tx),e=>e instanceof BridgeSafetyError&&e.code==='BRIDGE_SERVER_WRITE_UNRESOLVED');assert.equal(walletCalls,1);
  console.log('PASS FRONTEND_REAL_HTTP_SOURCE_PROOF_SERVER_RESERVATION_BEFORE_WALLET_AND_DETACHED_HASH');
 }finally{await f.close();}
 const f2=await fixture();try{const assertCurrent=()=>{},transport:typeof fetch=(input,init)=>fetch(f2.base+String(input),{...init,headers:{...init?.headers,Origin:origin}}),api=new BridgeServerClient(f2.token,'owner',f2.scope.recipient,assertCurrent,transport,origin);let r=await api.create(randomUUID(),f2.f.op);r=await api.authorize(r,await f2.signer.signMessage(serverBridgeMessage(r)));const own=serverBridgeJournal(r,null),storage=new MemoryStorage();let calls=0;const guarded=guardedBridgeProvider({request:async({method}:any)=>{if(method==='eth_chainId')return'0xaa36a7';if(method==='eth_accounts')return[f2.scope.sender];if(method==='eth_sendTransaction'){calls++;return hashes.approve;}throw Error('Unexpected request before cancellation');}},{operation:f2.f.op,current:()=>true,journal:()=>own,changed:()=>{},retry:false,storage,reviewWrite:async()=>{throw new BridgeSafetyError('BRIDGE_FEE_CANCELLED');},server:{reserve:async()=>{throw Error('Reserve must follow consent')},broadcast:async()=>{throw Error('No broadcast after cancellation')}}});await assert.rejects(guarded.request({method:'eth_sendTransaction',params:[f2.packet(r as any,'approve').transaction]}),e=>e instanceof BridgeSafetyError&&e.code==='BRIDGE_FEE_CANCELLED');assert.equal(calls,0);assert.equal(f2.registry.get(f2.proof,r.id)?.writes.length,0);console.log('PASS FEE_CANCEL_BEFORE_SERVER_RESERVATION_AND_WALLET');}finally{await f2.close();}
 console.log(JSON.stringify({suite:'FRONTEND_BRIDGE_REAL_HTTP_COMPOSITION',result:'PASS',cases:2,apiAndGuardReal:true,sourceSignatureGenerated:true,rpcReceiptsWalletBroadcastSynthetic:true,liveFinancialTransaction:false,originalSqliteOpened:false}));
}
main().catch(e=>{console.error(JSON.stringify({suite:'FRONTEND_BRIDGE_REAL_HTTP_COMPOSITION',result:'FAIL',message:e instanceof Error?e.message:'unknown'}));process.exitCode=1;});
