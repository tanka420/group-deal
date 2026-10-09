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
import {config} from '../src/config';
import {stageRecoverySessionBarrier} from '../src/services/recoverySessionBarrier';
import {prepareShadowCandidate} from '../src/services/shadowPreparation';
import {prepareRecoveryApplication,admitRecoveryApplication} from '../src/services/recoveryApplication';
import {eventProvider} from './fixtures/events';
import {reconciliationProvider} from './fixtures/reconciliation';
const origin='https://fixture.groupdeal.invalid',secondOrigin='https://second.fixture.invalid';
const denied=(code:string)=>(e:unknown)=>e instanceof BridgeTransferError&&e.code===code;

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

import {attachBridgeTransferHash} from '../src/domain/bridgeTransfer';
type Fixture=Awaited<ReturnType<typeof fixture>>;
type Recovered=Awaited<ReturnType<typeof recover>>;
let stage='SETUP',cases=0,ordinal=0;
const from=Number(process.argv.find(a=>a.startsWith('--from='))?.slice(7)??1),root=path.resolve(__dirname,'../..');
async function recover(f:Fixture,options:{built?:boolean;admitted?:boolean}={}){
 const directory=mkdtempSync(path.join(os.tmpdir(),'groupdeal-bridge-recovery-close-'));assert.ok(directory.includes('local-check-temp'));
 let candidateDirectory:string,lease:ReturnType<typeof admitRecoveryApplication>|undefined;
 if(options.admitted){const state=f.db.snapshot(),provider={...eventProvider([]),...reconciliationProvider(state,0n,3),getLogs:async()=>[]},shadow=await prepareShadowCandidate({inputScope:'LOCAL_FIXTURE',migrationOnly:false,retainLegacy:true,sourceDirectory:f.db.storageDirectory,privateParent:path.join(directory,'shadow'),reportDirectory:path.join(directory,'shadow-reports'),provider,verifyDeployment:async()=>{}});assert.notEqual(shadow.status,'REJECTED',shadow.report.failureCode);const prepared=await prepareRecoveryApplication({inputScope:'LOCAL_FIXTURE',shadowReference:shadow,sourceDirectory:f.db.storageDirectory,privateParent:path.join(directory,'application'),reportDirectory:path.join(directory,'application-reports')});assert.equal(prepared.status,'RECOVERY_APPLICATION_PREPARED',prepared.report.failureCode);lease=admitRecoveryApplication({inputScope:'LOCAL_FIXTURE',reference:prepared,sourceDirectory:f.db.storageDirectory,privateParent:path.join(directory,'application')});candidateDirectory=lease.database.storageDirectory}
 else candidateDirectory=stageRecoverySessionBarrier(f.db,path.join(directory,'staging')).candidateDirectory;
 const Store=options.built?require('../dist/db/store').TransactionalStore:TransactionalStore,Sessions=options.built?require('../dist/services/sessionService').SessionRegistry:SessionRegistry,Registry=options.built?require('../dist/services/bridgeTransferRegistry').BridgeTransferRegistry:BridgeTransferRegistry,router=options.built?require('../dist/routes/bridgeRoutes').createBridgeRouter:createBridgeRouter;
 const db:TransactionalStore=lease?.database??new Store(candidateDirectory),sessions:SessionRegistry=new Sessions(db),token=sessions.issue(db.db.users.owner,'EVM_WALLET'),otherToken=sessions.issue(db.db.users.other,'EVM_WALLET'),proof=sessions.authenticate(token),registry:BridgeTransferRegistry=new Registry(db,origin),sql=new DatabaseSync(path.join(candidateDirectory,'groupdeal.sqlite'),{readOnly:true}),app=express();
 app.use('/api/bridge',router({database:db,origins:[origin],read:f.read}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+(server.address() as any).port;
 const http=async(route:string,body?:unknown,auth=token)=>{const response=await fetch(base+'/api/bridge'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth,Origin:origin},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json() as any}};
 const snapshot=()=>sql.prepare("SELECT collection,record_key,record_json FROM domain_records WHERE collection IN ('bridgeTransfers','signerReservations','operations') ORDER BY collection,record_key").all();
 return{db,sessions,token,otherToken,proof,registry,http,base,snapshot,close:async()=>{sql.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));if(lease)lease.close();else db.close()}};
}
async function writes(f:Fixture,kinds:('approve'|'burn'|'mint')[],attach=true,finalized=true){let r=await f.authorized();for(const kind of kinds){const prepared=await f.registry.ready(f.proof,r.id,f.packet(r,kind),f.read);assert.equal(prepared.dispatchAllowed,true);r=prepared.record;if(attach)r=f.registry.attach(f.proof,r.id,prepared.write.id,hashes[kind],r.revision);if(finalized)f.advance(kind)}return r}
async function check(name:string,run:(f:Fixture,own:(r:Recovered)=>Recovered)=>Promise<void>){if(++ordinal<from)return;stage=name;const f=await fixture(),recovered:Recovered[]=[];try{await run(f,r=>{recovered.push(r);return r});cases++;console.log('PASS pending hash real HTTP: '+name)}finally{for(const r of recovered)await r.close();await f.close();f.db.close()}}
import {BridgeServerClient,serverBridgeJournal} from '../../frontend/src/services/bridgeServer';
import {attachBridgeRecoveryHash,inspectBridgeJournal,bridgeJournalKey} from '../../frontend/src/services/bridgeJournal';
import {MemoryStorage} from '../../frontend/test/fixtures/bridge';
function pending(f:Fixture,kind:'approve'|'burn'|'mint'){const row=f.f.records[kind] as any;row.tx.blockNumber=null;row.tx.blockHash=null;row.tx.transactionIndex=null;row.receipt=null;}
async function main(){Object.assign(config,{arcChainId:5042002,deploymentBlock:1,protocolVersion:1,arcWsUrl:''});for(const kind of ['approve','burn','mint'] as const)await check('fresh recovery login imports pending '+kind+' through actual journal client and authenticated API',async(f,own)=>{let old=kind==='approve'?await f.authorized():await writes(f,kind==='burn'?['approve']:['approve','burn']);old=(await f.registry.ready(f.proof,old.id,f.packet(old,kind),f.read)).record;pending(f,kind);const r=own(await recover(f)),loans=structuredClone(r.db.db.signerReservations),operations=structuredClone(r.db.db.operations),transport:typeof fetch=(input,init)=>fetch(r.base+String(input),{...init,headers:{...init?.headers,Origin:origin}}),api=new BridgeServerClient(r.token,'owner',f.scope.recipient,()=>{},transport,origin),record=await api.get(old.id),journal=serverBridgeJournal(record,null),storage=new MemoryStorage();await attachBridgeRecoveryHash(journal,kind,hashes[kind],f.read,storage);const next=await api.attach(record,journal.writes.at(-1)!.id,hashes[kind]),restored=serverBridgeJournal(next,journal);assert.equal(next.authRecoveryContext,old.authRecoveryContext);assert.deepEqual(next.sourceAuthorization,old.sourceAuthorization);assert.equal(next.revision,old.revision+1);assert.equal(next.writes.at(-1)!.hash,hashes[kind]);assert.deepEqual(r.db.db.signerReservations,loans);assert.deepEqual(r.db.db.operations,operations);await assert.rejects(inspectBridgeJournal(restored,f.read),/BRIDGE_RECEIPT_PENDING/);assert.equal(JSON.parse(storage.getItem(bridgeJournalKey(f.scope.recipient))!).writes.at(-1).hash,hashes[kind]);storage.clear();const fromServer=serverBridgeJournal(await api.get(old.id),null);assert.equal(fromServer.writes.at(-1)!.hash,hashes[kind]);await assert.rejects(r.registry.ready(r.proof,old.id,f.packet(next as any,kind),f.read),/BRIDGE_TRANSFER_FORBIDDEN/)});console.log(JSON.stringify({suite:'PENDING_HASH_REAL_HTTP',result:'PASS',cases,liveFinancialTransaction:false,actualJournalAndClientAndAuthenticatedApi:true}));}
main().catch(e=>{console.error(JSON.stringify({suite:'PENDING_HASH_REAL_HTTP',result:'FAIL',stage,cases,message:e instanceof Error?e.message:'unknown'}));process.exitCode=1});
