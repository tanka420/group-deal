import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ethers} from 'ethers';
import type {AppKit} from '@reown/appkit';
import {attachReownRuntime} from '../src/services/reownRuntime';

const address='0x1111111111111111111111111111111111111111';
function fixture({openGate=Promise.resolve(),closeGate=Promise.resolve(),failOpen=false}:{openGate?:Promise<void>;closeGate?:Promise<void>;failOpen?:boolean}={}){
 let open=false,account={address:undefined as string|undefined,isConnected:false},provider:any=null,chainId:number|string=5042002,opened=0,closed=0;
 const listeners=new Map<string,()=>void>(),calls:string[]=[];
 const subscribe=(kind:string,fn:()=>void)=>{listeners.set(kind,fn);return()=>listeners.delete(kind);};
 const sdk={getAccount:()=>account,getWalletProvider:()=>provider,getChainId:()=>chainId,getState:()=>({open}),subscribeAccount:(fn:()=>void)=>subscribe('account',fn),subscribeNetwork:(fn:()=>void)=>subscribe('network',fn),subscribeProviders:(fn:()=>void)=>subscribe('provider',fn),subscribeState:(fn:(state:{open:boolean})=>void)=>subscribe('state',()=>fn({open})),open:async()=>{opened++;await openGate;if(failOpen)throw new Error('Fixture resource failure');open=true;listeners.get('state')?.();},close:async()=>{closed++;await closeGate;open=false;listeners.get('state')?.();},disconnect:async(namespace:string)=>{assert.equal(namespace,'eip155');account={address:undefined,isConnected:false};provider=null;listeners.forEach(fn=>fn());}};
 const localProvider={request:async({method}:any)=>{calls.push(method);if(method==='eth_chainId')return '0x4cef52';if(method==='eth_accounts'||method==='eth_requestAccounts')return [address];throw Error('Unexpected wallet method');}};
 return {runtime:attachReownRuntime(sdk as unknown as AppKit),calls,listeners,get opened(){return opened;},get closed(){return closed;},set connected(value:boolean){account={address:value?address:undefined,isConnected:value};provider=value?localProvider:null;listeners.forEach(fn=>fn());},set provider(value:any){provider=value;listeners.get('provider')?.();},set chain(value:number|string){chainId=value;listeners.get('network')?.();},close:()=>{open=false;listeners.get('state')?.();}};
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return {promise,resolve};}
test('live SDK snapshots require both account and provider, including provider-only changes',()=>{
 const f=fixture(),seen:any[]=[];const stop=f.runtime.subscribe(v=>seen.push(v));assert.equal(f.runtime.snapshot().connected,false);f.connected=true;assert.equal(f.runtime.snapshot().address,address);assert.equal(f.runtime.snapshot().connected,true);f.provider=null;assert.equal(seen.at(-1).connected,false);f.chain='11155111';assert.equal(seen.at(-1).chainId,'11155111');stop();assert.equal(f.listeners.size,0);assert.equal(f.calls.length,0);
});
test('already-connected SDK avoids opening a modal and ethers reads the actual provider',async()=>{
 const f=fixture();f.connected=true;assert.equal(await f.runtime.connect(),address);assert.equal(f.opened,0);const signer=await f.runtime.getSigner();assert.equal(await signer.getAddress(),address);assert.ok(f.calls.includes('eth_accounts'));assert.ok(!f.calls.some(m=>/sendTransaction|sign/.test(m)));
});
test('concurrent connection calls share one request and resolve only after provider ownership exists',async()=>{
 const f=fixture(),a=f.runtime.connect(),b=f.runtime.connect();assert.equal(a,b);assert.equal(f.opened,1);f.connected=true;assert.equal(await a,address);await b;assert.equal(f.opened,1);assert.equal(f.closed,1);
});
test('closing provider dialog rejects the pending connection and an explicit retry is possible',async()=>{
 const f=fixture(),pending=f.runtime.connect();await flush();f.close();await assert.rejects(pending,/đóng kết nối/);await Promise.resolve();const retry=f.runtime.connect();f.connected=true;assert.equal(await retry,address);assert.equal(f.opened,2);
});
test('bounded connection timeout closes only the provider modal without disconnecting credentials',async context=>{
 context.mock.timers.enable({apis:['Date','setTimeout'],now:1000});const f=fixture(),pending=f.runtime.connect();await flush();context.mock.timers.tick(60_001);await assert.rejects(pending,/Hết thời gian/);assert.equal(f.closed,1);assert.equal(f.opened,1);context.mock.timers.reset();
});
test('a late provider connection cannot override the recorded cancellation',async context=>{
 context.mock.timers.enable({apis:['Date','setTimeout'],now:1000});const f=fixture(),pending=f.runtime.connect();await flush();f.close();f.connected=true;context.mock.timers.tick(201);await assert.rejects(pending,/đóng kết nối/);assert.equal(f.listeners.size,0);assert.equal(f.calls.length,0);assert.equal(f.runtime.snapshot().connected,true);context.mock.timers.reset();
});
test('disconnect uses the EVM namespace and invalidates live provider snapshots',async()=>{
 const f=fixture();f.connected=true;await f.runtime.disconnect();assert.equal(f.runtime.snapshot().connected,false);assert.throws(()=>f.runtime.getProvider(),/Chưa kết nối/);
});

test('a UI resource timeout rejects before modal open and closes its late result without allowing a competing request',async context=>{
 context.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const opening=deferred(),f=fixture({openGate:opening.promise}),pending=f.runtime.connect();
 const failure=assert.rejects(pending,/WALLET_RELOAD_REQUIRED/);
 await flush();context.mock.timers.tick(20_001);await failure;
 assert.equal(f.closed,0);assert.equal(f.listeners.size,0);
 await assert.rejects(f.runtime.connect(),/WALLET_RELOAD_REQUIRED/);assert.equal(f.opened,1);
 f.connected=true;opening.resolve();await flush();
 assert.equal(f.closed,1);assert.equal(f.runtime.snapshot().connected,true);assert.deepEqual(f.calls,[]);
 assert.throws(()=>f.runtime.getProvider(),/WALLET_RELOAD_REQUIRED/);await assert.rejects(f.runtime.getSigner(),/WALLET_RELOAD_REQUIRED/);
 context.mock.timers.reset();
});

test('a stuck modal close cannot approve sign-in and cannot block the caller indefinitely',async context=>{
 context.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const closing=deferred(),f=fixture({closeGate:closing.promise});f.connected=false;
 const pending=f.runtime.connect(),failure=assert.rejects(pending,/WALLET_RELOAD_REQUIRED/);
 f.connected=true;await flush();assert.equal(f.closed,1);
 context.mock.timers.tick(5_001);await failure;
 assert.equal(f.listeners.size,0);await assert.rejects(f.runtime.connect(),/WALLET_RELOAD_REQUIRED/);
 assert.equal(f.closed,1);closing.resolve();await flush();assert.equal(f.runtime.snapshot().connected,true);assert.deepEqual(f.calls,[]);
 await assert.rejects(f.runtime.getSigner(),/WALLET_RELOAD_REQUIRED/);assert.deepEqual(f.calls,[]);
 context.mock.timers.reset();
});

test('the overall connection deadline includes time spent loading modal resources',async context=>{
 context.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const opening=deferred(),f=fixture({openGate:opening.promise}),pending=f.runtime.connect();
 const failure=assert.rejects(pending,/Hết thời gian/);
 context.mock.timers.tick(10_000);opening.resolve();await flush();
 context.mock.timers.tick(50_001);await failure;assert.equal(f.closed,1);assert.equal(f.listeners.size,0);
 context.mock.timers.reset();
});

test('aborting the owner during resource loading rejects promptly and cleans up the late modal',async()=>{
 const opening=deferred(),f=fixture({openGate:opening.promise}),controller=new AbortController();
 const pending=f.runtime.connect(controller.signal),failure=assert.rejects(pending,/WALLET_CONNECTION_ENDED/);
 controller.abort();await failure;assert.equal(f.listeners.size,0);assert.equal(f.closed,0);
 opening.resolve();await flush();assert.equal(f.closed,1);assert.deepEqual(f.calls,[]);
 await assert.rejects(f.runtime.connect(),/WALLET_RELOAD_REQUIRED/);assert.equal(f.opened,1);
});

test('aborting an open modal retains credentials and allows another explicit request after closing',async context=>{
 context.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const f=fixture(),controller=new AbortController(),pending=f.runtime.connect(controller.signal);
 const failure=assert.rejects(pending,/WALLET_CONNECTION_ENDED/);
 await flush();controller.abort();context.mock.timers.tick(201);await failure;
 assert.equal(f.closed,1);assert.equal(f.listeners.size,0);assert.deepEqual(f.calls,[]);
 const retry=f.runtime.connect();f.connected=true;assert.equal(await retry,address);assert.equal(f.opened,2);
 context.mock.timers.reset();
});

test('an ended owner and a failed UI import never start a new signing request',async()=>{
 const controller=new AbortController();controller.abort();const f=fixture();
 await assert.rejects(f.runtime.connect(controller.signal),/WALLET_CONNECTION_ENDED/);assert.equal(f.opened,0);
 const failed=fixture({failOpen:true});await assert.rejects(failed.runtime.connect(),/WALLET_RELOAD_REQUIRED/);
 assert.equal(failed.listeners.size,0);await assert.rejects(failed.runtime.connect(),/WALLET_RELOAD_REQUIRED/);
 assert.equal(failed.opened,1);assert.deepEqual(failed.calls,[]);
});
