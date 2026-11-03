import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ethers} from 'ethers';
import {readMainnetHoldings} from '../src/services/walletHoldings';

const principal=ethers.Wallet.createRandom().address;
const token=ethers.Wallet.createRandom().address.toLowerCase();
const key='proapi_fixture_'+ethers.hexlify(ethers.randomBytes(16)).slice(2);
const abi=new ethers.Interface(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function name() view returns(string)']);
const tokenRow={token:{address_hash:token,type:'ERC-20',decimals:'18'},value:'999999999999999999999'};
const response=(items:unknown[]=[tokenRow],next_page_params:unknown=null)=>new Response(JSON.stringify({items,next_page_params}));
function rpc(chain='0x13b2',broken=false){return {send:async(method:string,params:unknown[])=>{
 if(method==='eth_chainId')return chain;
 if(method==='eth_blockNumber')return '0x64';
 assert.equal(method,'eth_call');const [tx,tag]=params as [any,string];assert.equal(tag,'0x64');assert.equal(tx.gas,'0x30d40');assert.equal(tx.to,token);
 if(broken)throw Error('fixture unreadable');
 const call=abi.parseTransaction({data:tx.data})!;
 if(call.name==='balanceOf')assert.equal(call.args[0].toLowerCase(),principal.toLowerCase());
 return abi.encodeFunctionResult(call.name,[({balanceOf:1234567n,decimals:6n,symbol:'TOKEN',name:'Fixture token'} as any)[call.name]]);
}};}

test('fixed Arc gateway uses a private header; displayed amount and decimals come from RPC',async()=>{
 let requests=0;
 const fetcher:typeof fetch=async(input,init)=>{
  requests++;const url=new URL(String(input));
  assert.equal(url.origin,'https://api.blockscout.com');assert.equal(url.pathname,'/5042/api/v2/addresses/'+principal.toLowerCase()+'/tokens');
  assert.equal(url.search,'?type=ERC-20');assert.ok(!url.href.includes(key));
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+key);assert.equal(init?.redirect,'error');assert.ok(init?.signal);
  return response([tokenRow,{token:{type:'ERC-721'}},{token:{type:'ERC-20',address_hash:'0x3600000000000000000000000000000000000000'}}]);
 };
 const result=await readMainnetHoldings(rpc(),principal,{},fetcher,key);
 assert.equal(requests,1);assert.equal(result.discoveryUnavailable,false);
 assert.deepEqual(result.items,[{address:token,symbol:'TOKEN',name:'Fixture token',balance:'1234567',decimals:6}]);
 assert.ok(!JSON.stringify(result).includes(key));
});

test('missing/malformed credentials skip HTTP and preserve manual imports',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error('forbidden');};
 for(const credential of ['', 'not-a-pro-key','proapi_bad\nheader']){
  const result=await readMainnetHoldings(rpc(),principal,{tokens:token},fetcher,credential);
  assert.equal(result.discoveryUnavailable,true);assert.equal(result.items[0].balance,'1234567');
 }
 assert.equal(calls,0);
});

test('documented pagination accepts nullable values and stays bound to principal/chain',async()=>{
 const params={fiat_value:null,id:42,value:'1234567',items_count:50};
 const first=await readMainnetHoldings(rpc(),principal,{},async()=>response([],params),key);
 assert.ok(first.nextCursor);
 const second=await readMainnetHoldings(rpc(),principal,{cursor:first.nextCursor},async(input)=>{
  const url=new URL(String(input));assert.equal(url.searchParams.get('fiat_value'),'null');assert.equal(url.searchParams.get('id'),'42');assert.equal(url.searchParams.get('type'),'ERC-20');return response();
 },key);
 assert.equal(second.items.length,1);
 let requests=0;const noFetch:typeof fetch=async()=>{requests++;throw Error();};
 const decoded=JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString());
 for(const change of [{principal:ethers.Wallet.createRandom().address},{chainId:5042002}]){
  const cursor=Buffer.from(JSON.stringify({...decoded,...change})).toString('base64url');
  await assert.rejects(readMainnetHoldings(rpc(),principal,{cursor},noFetch,key),/WALLET_QUERY_INVALID/);
 }
 assert.equal(requests,0);
});

test('cursor cannot override credentials, chain, host or token type',async()=>{
 let requests=0;const fetcher:typeof fetch=async()=>{requests++;return response();};
 for(const field of ['apikey','api_key','authorization','access_token','chain_id','url','type','__proto__']){
  const params=JSON.parse('{"id":1,"'+field+'":"untrusted"}');
  const cursor=Buffer.from(JSON.stringify({principal,chainId:5042,params})).toString('base64url');
  await assert.rejects(readMainnetHoldings(rpc(),principal,{cursor},fetcher,key),/WALLET_QUERY_INVALID/);
  const result=await readMainnetHoldings(rpc(),principal,{},async()=>response([],params),key);
  assert.equal(result.discoveryUnavailable,true);assert.equal(result.nextCursor,null);
 }
 assert.equal(requests,0);
});

test('provider errors, redirects and invalid or oversized pages preserve manual reads',async()=>{
 for(const fetcher of [async()=>new Response('',{status:429}),async()=>{throw Error(key);},async()=>new Response('not json'),async()=>response(Array(51).fill(tokenRow)),async()=>new Response('x'.repeat(1024*1024+1))]){
  const result=await readMainnetHoldings(rpc(),principal,{tokens:token},fetcher,key);
  assert.equal(result.discoveryUnavailable,true);assert.equal(result.items[0].balance,'1234567');assert.ok(!JSON.stringify(result).includes(key));
 }
});

test('wrong chain stops discovery; unreadable contracts are separate from zero balances',async()=>{
 let requests=0;const fetcher:typeof fetch=async()=>{requests++;return response();};
 await assert.rejects(readMainnetHoldings(rpc('0x4cef52'),principal,{},fetcher,key),/WALLET_CHAIN_UNSUPPORTED/);assert.equal(requests,0);
 const result=await readMainnetHoldings(rpc('0x13b2',true),principal,{},fetcher,key);
 assert.deepEqual(result.items,[]);assert.deepEqual(result.unreadable,[token]);
});
