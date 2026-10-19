import assert from 'node:assert/strict';
import {ArcReadProvider} from '../src/services/arcReadProvider';

const drpc='https://rpc.drpc.testnet.arc.io',primary='https://primary.fixture.invalid',backup='https://backup.fixture.invalid';
const chain='0x4cef52',hash='0x'+'a'.repeat(64),request={jsonrpc:'2.0',id:7,method:'eth_getTransactionReceipt',params:[hash]};
const reply=(r:any,value:any)=>({jsonrpc:'2.0',id:r.id,result:value});
async function main(){const original=globalThis.fetch;let passing=0;
 async function check(endpoints:string[],mock:(url:string,body:any)=>any,run:(p:ArcReadProvider)=>Promise<void>){const p=new ArcReadProvider(endpoints,5042002);globalThis.fetch=(async(url:any,options:any)=>({ok:true,json:async()=>mock(String(url),JSON.parse(options.body))})) as any;try{await run(p);passing++}finally{p.destroy()}}
 try{
  const calls:{url:string;body:any}[]=[];
  await check([primary,drpc],(url,body)=>{calls.push({url,body});assert.equal(url,drpc);assert.equal(Array.isArray(body),false);return reply(body,body.method==='eth_chainId'?chain:{transactionHash:hash})},async p=>{assert.deepEqual((await p._send(request))[0].result,{transactionHash:hash});assert.equal(calls.length,2)});
  await check([primary,backup],(url,body)=>body.map((r:any)=>reply(r,r.method==='eth_chainId'?chain:url===primary?null:{transactionHash:hash})),async p=>assert.deepEqual((await p._send(request))[0].result,{transactionHash:hash}));
  await check([primary,backup],(_url,body)=>body.map((r:any)=>reply(r,r.method==='eth_chainId'?chain:null)),async p=>assert.equal((await p._send(request))[0].result,null));
  await check([drpc,primary],(url,body)=>url===drpc?reply(body,body.method==='eth_chainId'?'0x1':{transactionHash:hash}):body.map((r:any)=>reply(r,r.method==='eth_chainId'?chain:null)),async p=>assert.equal((await p._send(request))[0].result,null));
  await check([drpc,primary],(url,body)=>url===drpc?{...reply(body,body.method==='eth_chainId'?chain:{transactionHash:hash}),id:7}:body.map((r:any)=>reply(r,r.method==='eth_chainId'?chain:null)),async p=>assert.equal((await p._send(request))[0].result,null));
  let callsAfterNull=0;
  await check([primary,backup],(url,body)=>{if(url===backup)callsAfterNull++;return body.map((r:any)=>reply(r,r.method==='eth_chainId'?chain:null))},async p=>{assert.equal((await p._send({...request,method:'eth_getBlockByNumber',params:['latest',false]}))[0].result,null);assert.equal(callsAfterNull,0,'Only hash/receipt null reads use absence failover')});
  const pair=[request,{...request,id:8,method:'eth_getTransactionByHash'}];
  await check([primary,backup],(url,body)=>body.map((r:any)=>reply(r,r.method==='eth_chainId'?chain:r.id===7&&url===primary?{transactionHash:hash}:null)),async p=>{const v=await p._send(pair);assert.deepEqual(v[0].result,{transactionHash:hash});assert.equal(v[1].result,null,'Partial replies are never merged across endpoints')});
  let later=0;
  await check([primary,backup],(url,body)=>{if(url===backup)later++;return body.map((r:any)=>r.method==='eth_chainId'?reply(r,chain):{jsonrpc:'2.0',id:r.id,error:{code:3,message:'execution reverted'}})},async p=>{assert.ok('error' in (await p._send({...request,method:'eth_call'}))[0]);assert.equal(later,0)});
  await check([drpc],()=>{throw Error('Mutation must not reach fetch')},async p=>assert.rejects(p._send({...request,method:'eth_sendTransaction'}),/rejects mutation/));
  await check([drpc],body=>reply(body,chain),async p=>assert.rejects(p._send({...request,id:-1}),/Invalid read RPC request IDs/));
  console.log(`PASS ${passing} historical RPC transport cases: individual envelopes, chain and ID checks, nullable hash fallback, all-null hold, no response merging, revert and mutation guards`);
 }finally{globalThis.fetch=original}
}main().catch(e=>{console.error(e);process.exitCode=1});
