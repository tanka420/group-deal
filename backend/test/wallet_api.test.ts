import assert from 'node:assert/strict';
import express from 'express';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {SessionService} from '../src/services/sessionService';
import {createWalletFlowRouter} from '../src/routes/walletFlowRoutes';
import {WalletFlowService} from '../src/services/walletFlowService';
assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);
void(async()=>{
 const principal=ethers.Wallet.createRandom().address.toLowerCase();store.transaction(()=>{store.db.users.wallet_api={id:'wallet_api',email:'wallet-api@fixture.invalid',roles:['buyer'],activeWallet:principal,createdAt:Date.now()};store.db.userByWallet[principal]='wallet_api';});const token=SessionService.issue(store.db.users.wallet_api),origin='https://wallet.fixture.invalid';let calls=0,release:(()=>void)|undefined;const gate=new Promise<void>(r=>{release=r;});
 const service=new WalletFlowService(store,{rpc:{send:async()=>{throw Error('No API test RPC');}}});(service as any).quote=async()=>{calls++;await gate;return{fixture:true};};
 const app=express();app.use('/api/wallet/flows',createWalletFlowRouter({database:store,origins:[origin],service}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port+'/api/wallet/flows';
 const get=(path:string,headers:Record<string,string>={Authorization:'Bearer '+token})=>fetch(url+path,{headers}),post=(path:string,body:string,headers:Record<string,string>={Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'})=>fetch(url+path,{method:'POST',headers,body});
 try{
  assert.equal((await get('/',{})).status,401);const admin=SessionService.issue(store.db.users.wallet_api,'EVM_WALLET','ADMIN');assert.equal((await get('/',{Authorization:'Bearer '+admin})).status,403);console.log('PASS wallet API rejects guests and admin sessions');
  assert.equal((await get('/',{Authorization:'Bearer '+token,Origin:'https://other.fixture.invalid'})).status,403);assert.equal((await post('/quote','{}',{Authorization:'Bearer '+token,'Content-Type':'application/json'})).status,403);assert.equal(calls,0);console.log('PASS wallet API binds read and mutation origins');
  assert.equal((await get('/?cursor=invalid')).status,400);assert.equal((await get('/?query=unsupported')).status,400);console.log('PASS wallet API rejects forged and unsupported history queries');
  const response=await get('/');assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);assert.deepEqual((await response.json()).operations,[]);console.log('PASS wallet API authenticated scoped history and no-store');
  assert.equal((await get('/wop_'+'1'.repeat(64))).status,404);assert.equal((await get('/balances?rpc=arbitrary')).status,400);console.log('PASS wallet API hides foreign or missing records and arbitrary RPC input');
  assert.equal((await post('/quote','{broken')).status,400);assert.equal((await post('/quote',JSON.stringify({tooLarge:'x'.repeat(13000)}))).status,413);assert.equal(calls,0);console.log('PASS wallet API rejects malformed and oversized bodies');
  const first=post('/quote','{}');for(let i=0;i<100&&calls===0;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls,1);assert.equal((await post('/quote','{}')).status,429);release!();assert.equal((await first).status,200);assert.equal(calls,1);console.log('PASS wallet API serializes account writes without duplicate provider calls');
 }finally{release!();await new Promise<void>(r=>server.close(()=>r()));}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>store.close());
