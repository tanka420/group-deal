import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ethers} from 'ethers';
import {AppKit} from '@circle-fin/app-kit';
import {bridgeAbi,CCTP_TOKEN_MESSENGER,BridgeSafetyError,assertBridgeMessage,canonicalBridgeRoute,classifyBridgeTransaction,verifyBridgeReceipt,bridgeRetryContext,validateBridgeOperation} from '../src/services/bridgeRecovery';
import {BridgeJournal,assertBridgeSourceAvailable,attachBridgeRecoveryHash,bridgeJournalKey,guardedBridgeProvider,inspectBridgeJournal,loadBridgeJournal,newBridgeJournal,saveBridgeJournal,withBridgeLocks} from '../src/services/bridgeJournal';
import {MemoryStorage,bridgeFixture,operation,hashes} from './fixtures/bridge';
const fault=(code:string)=>(e:unknown)=>e instanceof BridgeSafetyError&&e.code===code;
function write(journal:BridgeJournal,kind:'approve'|'burn'|'mint',dataHash?:string){journal.writes.push({id:crypto.randomUUID(),kind,chainId:kind==='mint'?5042002:11155111,state:'BROADCAST',hash:hashes[kind],nonce:kind==='mint'?'17':kind==='approve'?'15':'16',afterBlock:'10',dataHash:dataHash||ethers.keccak256(bridgeFixture(journal.operation).calls[kind])});return journal;}
function guardFixture(){
 const f=bridgeFixture(),storage=new MemoryStorage(),journal=newBridgeJournal(operation,null,storage);
 let current=true,chain='0xaa36a7',gate:Promise<string>|null=null,code:number|undefined,sends=0;
 const provider={request:async({method}:any)=>{
  if(method==='eth_getTransactionCount')return chain==='0x4cef52'?'0x11':'0x10';if(method==='eth_blockNumber')return '0xa';if(method==='eth_chainId')return chain;if(method==='eth_accounts')return [operation.sender];
  if(method==='wallet_switchEthereumChain')return null;
  if(method==='eth_sendTransaction'){sends++;if(code)throw Object.assign(new Error('Private provider diagnostics'),{code});return gate?await gate:hashes.burn;}
  throw Error('Fixture unexpected method');
 }};
 const guarded=guardedBridgeProvider(provider,{current:()=>current,operation,journal:()=>journal,changed:()=>{},retry:false,storage,read:f.read});
 return {f,storage,journal,guarded,get sends(){return sends;},set current(v:boolean){current=v;},set chain(v:string){chain=v;},set gate(v:Promise<string>){gate=v;},set code(v:number){code=v;}};
}
const send=(g:ReturnType<typeof guardFixture>,kind='burn')=>g.guarded.request({method:'eth_sendTransaction',params:[{from:operation.sender,to:g.f.records[kind].tx.to,data:g.f.calls[kind as 'burn'],value:'0x0'}]});
test('operation rejects inherited source, malformed identity, precision and uint256 overflow',()=>{
 for(const op of [{...operation,source:'__proto__'},{...operation,recipient:'bad'},{...operation,amount:'1.0000001'},{...operation,amount:'0'},{...operation,amount:'9'.repeat(80)}])assert.throws(()=>validateBridgeOperation(op));
});
test('SDK route is checked against testnet contracts and receives approved read RPCs',()=>{
 const kit=new AppKit(),route=canonicalBridgeRoute(kit,operation);assert.equal(route.source.chainId,11155111);assert.equal(route.destination.chainId,5042002);
 assert.deepEqual(route.destination.rpcEndpoints,['https://rpc.testnet.arc.io','https://rpc.blockdaemon.testnet.arc.io','https://rpc.drpc.testnet.arc.io','https://rpc.quicknode.testnet.arc.io']);
 const chains=kit.getSupportedChains('bridge');assert.throws(()=>canonicalBridgeRoute({getSupportedChains:()=>chains.map(c=>c.chain==='Arc_Testnet'?{...c,usdcAddress:ethers.ZeroAddress}:c)} as any,operation),fault('BRIDGE_ROUTE_INVALID'));
});
test('approval is exact and limited to the reviewed CCTP spender',()=>{
 const f=bridgeFixture(),tx=f.records.approve.tx;assert.equal(classifyBridgeTransaction(tx,11155111,operation),'approve');
 for(const args of [[ethers.ZeroAddress,1250000n],[CCTP_TOKEN_MESSENGER,ethers.MaxUint256]])assert.throws(()=>classifyBridgeTransaction({...tx,input:bridgeAbi.encodeFunctionData('approve',args)},11155111,operation));
 assert.throws(()=>classifyBridgeTransaction({...tx,input:tx.input+'00'},11155111,operation));
});
test('burn request binds amount, recipient, source token, domain, zero fees and standard finality',()=>{
 const f=bridgeFixture(),tx=f.records.burn.tx;assert.equal(classifyBridgeTransaction(tx,11155111,operation),'burn');
 for(const change of [{amount:1250001n},{mintRecipient:ethers.ZeroHash},{destinationDomain:6},{burnToken:ethers.ZeroAddress},{fee:1},{maxFee:1},{minFinalityThreshold:1000},{destinationCaller:ethers.zeroPadValue(operation.sender,32)}])assert.throws(()=>classifyBridgeTransaction({...tx,input:bridgeAbi.encodeFunctionData('bridgeWithPreapproval',[{...f.params,...change}])},11155111,operation));
 for(const change of [{from:ethers.ZeroAddress},{value:'0x1'},{chainId:'0x1'}])assert.throws(()=>classifyBridgeTransaction({...tx,...change},11155111,operation));
});
test('CCTP packed message binds all immutable terms and rejects fast or zero-nonce attestation',()=>{
 const f=bridgeFixture();assertBridgeMessage(f.message,operation);assertBridgeMessage(f.attested,operation,true);
 for(const offset of [0,4,8,44,76,108,140,148,152,184,216,248,280,312]){
  const index=2+offset*2,raw=f.attested.slice(0,index)+'ff'+f.attested.slice(index+2);assert.throws(()=>assertBridgeMessage(raw,operation,true));
 }
 assert.throws(()=>assertBridgeMessage(f.message,operation,true));
});
test('source proof requires the matching transaction, MessageSent and current canonical block',async()=>{
 const f=bridgeFixture(),proof=await verifyBridgeReceipt(operation,'burn',hashes.burn,f.read);assert.equal(proof.reverted,false);assert.ok(proof.message);
 f.records.burn.block.hash='0x'+'e'.repeat(64);await assert.rejects(verifyBridgeReceipt(operation,'burn',hashes.burn,f.read),fault('BRIDGE_RECEIPT_REORG'));
 f.records.burn.block.hash=f.records.burn.receipt.blockHash;f.records.burn.receipt.logs=[];await assert.rejects(verifyBridgeReceipt(operation,'burn',hashes.burn,f.read));
});
test('mint success requires finalized matching message, MessageReceived and exact USDC Transfer',async()=>{
 const f=bridgeFixture(),burn=await verifyBridgeReceipt(operation,'burn',hashes.burn,f.read);const mint=await verifyBridgeReceipt(operation,'mint',hashes.mint,f.read,burn.message);assert.equal(mint.reverted,false);
 const logs=f.records.mint.receipt.logs;f.records.mint.receipt.logs=[logs[0]];await assert.rejects(verifyBridgeReceipt(operation,'mint',hashes.mint,f.read,burn.message));
 f.records.mint.receipt.logs=logs;const other=bridgeFixture({...operation,recipient:operation.sender});await assert.rejects(verifyBridgeReceipt(operation,'mint',hashes.mint,other.read,burn.message));
 // Identical burn terms do not share completion: Iris binds its assigned nonce
 // to the exact source hash, and its eventNonce must agree with that message.
 f.attestationMessage=f.attested.slice(0,26)+'8'.repeat(64)+f.attested.slice(90);
 await assert.rejects(verifyBridgeReceipt(operation,'mint',hashes.mint,f.read,burn.message),fault('BRIDGE_PROOF_INVALID'));
 f.attestationMessage=f.attested;
 const boundRead:typeof f.read=async(chain,method,args)=>{
  if(method==='cctp_attestation'){
   assert.equal(chain,operation.source);assert.deepEqual(args,[hashes.burn]);
   return {messages:[{status:'complete',message:f.attested,eventNonce:'0x'+'8'.repeat(64)}]} as any;
  }
  return f.read(chain,method,args);
 };
 await assert.rejects(verifyBridgeReceipt(operation,'mint',hashes.mint,boundRead,burn.message),fault('BRIDGE_PROOF_INVALID'));
 assert.equal((await verifyBridgeReceipt(operation,'mint',hashes.mint,f.read,burn.message)).reverted,false);
});
test('a reverted burn is observed but cannot construct an SDK mint recovery',async()=>{
 const f=bridgeFixture();f.records.burn.receipt.status='0x0';const proof=await verifyBridgeReceipt(operation,'burn',hashes.burn,f.read);assert.equal(proof.reverted,true);
 assert.throws(()=>bridgeRetryContext(operation,canonicalBridgeRoute(new AppKit(),operation),proof));
});
test('pending receipt is unknown and absence is never negative proof',async()=>{
 const f=bridgeFixture();f.records.burn.receipt=null;await assert.rejects(verifyBridgeReceipt(operation,'burn',hashes.burn,f.read),fault('BRIDGE_RECEIPT_PENDING'));
});
test('SDK success in a legacy checkpoint is only a hash hint and original bytes remain untouched',async()=>{
 const storage=new MemoryStorage(),key='groupdeal_bridge:'+operation.recipient,raw=JSON.stringify({version:1,operation,result:{state:'success',steps:[{name:'burn',state:'success',txHash:hashes.burn,errorMessage:'Private diagnostic sentinel'}],source:{chain:{rpcEndpoints:['https://untrusted.invalid']}}}});
 storage.setItem(key,raw);const loaded=loadBridgeJournal(operation.recipient,storage)!;assert.equal(loaded.settled,false);assert.equal((await inspectBridgeJournal(loaded,bridgeFixture().read)).state,'BURNED');
 saveBridgeJournal(loaded,storage);assert.equal(storage.getItem(key),raw);assert.ok(!storage.getItem(bridgeJournalKey(operation.recipient))!.includes('Private diagnostic'));assert.ok(!JSON.stringify(loaded).includes('untrusted.invalid'));
});
test('legacy null result, ambiguous request and unfinished empty record keep funding reserved',async()=>{
 const storage=new MemoryStorage();storage.setItem('groupdeal_bridge:'+operation.recipient,JSON.stringify({version:1,operation,result:null}));assert.equal((await inspectBridgeJournal(loadBridgeJournal(operation.recipient,storage)!,bridgeFixture().read)).state,'UNKNOWN');
 const own=newBridgeJournal(operation,null,new MemoryStorage());assert.equal((await inspectBridgeJournal(own)).state,'UNKNOWN');own.settled=true;assert.equal((await inspectBridgeJournal(own)).state,'NO_BURN');
 own.writes.push({id:crypto.randomUUID(),kind:'burn',chainId:11155111,state:'REQUESTED',dataHash:hashes.burn});assert.equal((await inspectBridgeJournal(own)).state,'UNKNOWN');
});
test('journal proof is re-read and cannot accept a changed prepared calldata digest',async()=>{
 const storage=new MemoryStorage(),f=bridgeFixture(),own=write(newBridgeJournal(operation,null,storage),'burn');own.settled=true;
 assert.equal((await inspectBridgeJournal(own,f.read)).state,'BURNED');own.writes[0].dataHash=hashes.approve;await assert.rejects(inspectBridgeJournal(own,f.read));
});
test('source reservation covers a different recipient and ignores no SDK success flag',async()=>{
 const storage=new MemoryStorage(),own=newBridgeJournal({...operation,recipient:operation.sender},null,storage);
 await assert.rejects(assertBridgeSourceAvailable(operation.sender,undefined,storage,bridgeFixture().read),fault('BRIDGE_SOURCE_RESERVED'));
 own.settled=true;saveBridgeJournal(own,storage);await assertBridgeSourceAvailable(operation.sender,undefined,storage,bridgeFixture().read);
});
test('wallet hash is durable before SDK mining wait, and a late hash stays with the original operation',async()=>{
 const g=guardFixture();let resolve!:(hash:string)=>void;g.gate=new Promise(done=>resolve=done);const pending=send(g);
 while(g.sends===0)await Promise.resolve();assert.equal(loadBridgeJournal(operation.recipient,g.storage)!.writes[0].state,'REQUESTED');
 g.current=false;resolve(hashes.burn);await pending;assert.equal(loadBridgeJournal(operation.recipient,g.storage)!.writes[0].hash,hashes.burn);
 await assert.rejects(send(g),fault('BRIDGE_SESSION_CHANGED'));assert.equal(g.sends,1);
});
test('storage failure stops before opening the wallet; provider uncertainty remains reserved',async()=>{
 const g=guardFixture();g.storage.failWrites=true;await assert.rejects(send(g),fault('BRIDGE_STORAGE_UNAVAILABLE'));assert.equal(g.sends,0);
 const other=guardFixture();other.code=4900;await assert.rejects(send(other));assert.equal(other.journal.writes[0].state,'REQUESTED');other.journal.settled=true;assert.equal((await inspectBridgeJournal(other.journal)).state,'UNKNOWN');
});
test('explicit wallet rejection is distinct from a broadcast timeout and duplicate burn is refused',async()=>{
 const g=guardFixture();g.code=4001;await assert.rejects(send(g));assert.equal(g.journal.writes[0].state,'REJECTED');g.journal.settled=true;assert.equal((await inspectBridgeJournal(g.journal)).state,'NO_BURN');
 const other=guardFixture();await send(other);await assert.rejects(send(other),fault('BRIDGE_WRITE_UNRESOLVED'));assert.equal(other.sends,1);
});
test('session guard rejects signing, batching, raw transactions, mainnet switch and wrong sender',async()=>{
 const g=guardFixture();for(const method of ['eth_sign','personal_sign','eth_signTypedData_v4','wallet_sendCalls','eth_sendRawTransaction'])await assert.rejects(g.guarded.request({method,params:[]}));
 await assert.rejects(g.guarded.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x1'}]}));assert.equal(g.sends,0);g.current=false;await assert.rejects(send(g),fault('BRIDGE_SESSION_CHANGED'));
});
test('resume context is rebuilt from verified burn and refuses all source financial writes',async()=>{
 const f=bridgeFixture(),storage=new MemoryStorage(),own=write(newBridgeJournal(operation,null,storage),'burn'),burn=await verifyBridgeReceipt(operation,'burn',hashes.burn,f.read),route=canonicalBridgeRoute(new AppKit(),operation);
 const result=bridgeRetryContext(operation,route,burn);assert.deepEqual(result.steps.map(s=>[s.name,s.state]),[['approve','noop'],['burn','success']]);assert.equal(result.destination.recipientAddress,operation.recipient);
 let sent=0;const provider={request:async({method}:any)=>method==='eth_chainId'?'0xaa36a7':method==='eth_accounts'?[operation.sender]:(sent++,hashes.burn)};
 const guarded=guardedBridgeProvider(provider,{current:()=>true,operation,journal:()=>own,changed:()=>{},burn,retry:true,storage,read:f.read});
 await assert.rejects(guarded.request({method:'eth_sendTransaction',params:[{from:operation.sender,to:f.records.burn.tx.to,data:f.calls.burn,value:'0x0'}]}),fault('BRIDGE_REBURN_BLOCKED'));assert.equal(sent,0);
});
test('unknown burn hash can be recovered with exact prepared data; wrong data cannot replace it',async()=>{
 const g=guardFixture();g.code=4900;await assert.rejects(send(g));await attachBridgeRecoveryHash(g.journal,'burn',hashes.burn,g.f.read,g.storage);assert.equal((await inspectBridgeJournal(g.journal,g.f.read)).state,'BURNED');
 const other=guardFixture();other.code=4900;await assert.rejects(send(other));other.journal.writes[0].dataHash=hashes.mint;await assert.rejects(attachBridgeRecoveryHash(other.journal,'burn',hashes.burn,other.f.read,other.storage));
 for(const changed of [{nonce:'15'},{afterBlock:'17'}]){
  const pending=guardFixture();pending.code=4900;await assert.rejects(send(pending));
  Object.assign(pending.journal.writes[0],changed);
  await assert.rejects(attachBridgeRecoveryHash(pending.journal,'burn',hashes.burn,pending.f.read,pending.storage),fault('BRIDGE_RECORD_INVALID'));
  assert.equal(pending.journal.writes[0].state,'REQUESTED');assert.equal(pending.journal.writes[0].hash,undefined);
 }
 const legacy=newBridgeJournal(operation,null,new MemoryStorage());legacy.legacyDigest=hashes.approve;
 await assert.rejects(attachBridgeRecoveryHash(legacy,'burn',hashes.burn,g.f.read,new MemoryStorage()),fault('BRIDGE_WRITE_UNRESOLVED'));
});
test('mint signing requires burn proof and refuses a CCTP nonce already consumed on Arc',async()=>{
 const g=guardFixture();await send(g);g.chain='0x4cef52';g.f.used='0x'+'0'.repeat(63)+'1';await assert.rejects(send(g,'mint'),fault('BRIDGE_WRITE_UNRESOLVED'));assert.equal(g.sends,1);
 g.f.used='0x'+'0'.repeat(64);await send(g,'mint');assert.equal(g.journal.writes[1].kind,'mint');assert.equal(g.sends,2);
});
test('wallet locks sort and deduplicate addresses; overlapping source never queues a second operation',async()=>{
 const held=new Set<string>(),seen:string[]=[];const prior=(globalThis as any).navigator;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(key:string,options:any,callback:any)=>{
  assert.equal(options.ifAvailable,true);seen.push(key);if(held.has(key))return callback(null);held.add(key);try{return await callback({name:key});}finally{held.delete(key);}
 }}}});
 try{let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(done=>entered=done),gate=new Promise<void>(done=>release=done);const first=withBridgeLocks(operation.sender,operation.recipient,async()=>{entered();await gate;});await ready;
 await assert.rejects(withBridgeLocks(operation.sender,'0x1111111111111111111111111111111111111111',async()=>assert.fail('queued')));
 release();await first;assert.equal(held.size,0);const count=seen.length;await withBridgeLocks(operation.sender,operation.sender,async()=>{});assert.equal(seen.length,count+1);
 }finally{Object.defineProperty(globalThis,'navigator',{configurable:true,value:prior});}
});

test('legacy session-only migration can be inspected in another tab, without implying no burn',async()=>{
 const local=new MemoryStorage(),session=new MemoryStorage();session.setItem('groupdeal_bridge:'+operation.recipient,JSON.stringify({version:1,operation,result:null}));
 const own=loadBridgeJournal(operation.recipient,local,session)!;saveBridgeJournal(own,local);assert.equal((await inspectBridgeJournal(loadBridgeJournal(operation.recipient,local)!)).state,'UNKNOWN');assert.equal(session.length,1);
});
test('mint resume revalidates the source block even when an earlier verified burn is supplied',async()=>{
 const f=bridgeFixture(),storage=new MemoryStorage(),own=write(newBridgeJournal(operation,null,storage),'burn');const burn=await verifyBridgeReceipt(operation,'burn',hashes.burn,f.read);f.records.burn.block.hash='0x'+'d'.repeat(64);
 let sends=0;const guarded=guardedBridgeProvider({request:async({method}:any)=>method==='eth_chainId'?'0x4cef52':method==='eth_accounts'?[operation.sender]:(sends++,hashes.mint)},
 {current:()=>true,operation,journal:()=>own,changed:()=>{},retry:true,burn,storage,read:f.read});
 await assert.rejects(guarded.request({method:'eth_sendTransaction',params:[{from:operation.sender,to:f.records.mint.tx.to,data:f.calls.mint,value:'0x0'}]}),fault('BRIDGE_RECEIPT_REORG'));assert.equal(sends,0);
});

test('storage loss after wallet acceptance keeps the returned hash in the original in-memory journal',async()=>{
 const storage=new MemoryStorage(),own=newBridgeJournal(operation,null,storage),f=bridgeFixture();let observed:string|undefined;
 const guarded=guardedBridgeProvider({request:async({method}:any)=>{if(method==='eth_chainId')return '0xaa36a7';if(method==='eth_accounts')return [operation.sender];if(method==='eth_getTransactionCount')return '0x10';if(method==='eth_blockNumber')return '0xa';storage.failWrites=true;return hashes.burn;}},
 {current:()=>true,operation,journal:()=>own,changed:j=>observed=j.writes[0]?.hash,retry:false,storage,read:f.read});
 await assert.rejects(guarded.request({method:'eth_sendTransaction',params:[{from:operation.sender,to:f.records.burn.tx.to,data:f.calls.burn,value:'0x0'}]}),fault('BRIDGE_STORAGE_UNAVAILABLE'));
 assert.equal(observed,hashes.burn);assert.equal(own.writes[0].hash,hashes.burn);assert.equal(loadBridgeJournal(operation.recipient,storage)!.writes[0].state,'REQUESTED');
});

test('receipt evidence is bound to journal writes and distinguishes revert without mutating the durable record',async()=>{
 const f=bridgeFixture(),own=newBridgeJournal(operation,null,new MemoryStorage());write(own,'approve');write(own,'burn');write(own,'mint');own.settled=true;const raw=JSON.stringify(own);
 const success=await inspectBridgeJournal(own,f.read);assert.equal(success.state,'MINTED');assert.deepEqual(success.receipts?.map(row=>({id:row.writeId,kind:row.proof.kind,hash:row.proof.hash,reverted:row.proof.reverted})),own.writes.map(w=>({id:w.id,kind:w.kind,hash:w.hash,reverted:false})));assert.equal(JSON.stringify(own),raw);
 f.records.approve.receipt.status='0x0';const reverted=await inspectBridgeJournal(own,f.read);assert.equal(reverted.state,'MINTED');assert.equal(reverted.receipts?.[0].proof.reverted,true);assert.equal(reverted.receipts?.[1].proof.reverted,false);assert.equal(JSON.stringify(own),raw);
 f.records.mint.receipt=null;await assert.rejects(inspectBridgeJournal(own,f.read),fault('BRIDGE_RECEIPT_PENDING'));own.writes[0].state='REQUESTED';assert.deepEqual(await inspectBridgeJournal(own,async()=>{throw Error('Ambiguous write must not read receipts');}),{state:'UNKNOWN'});
});
