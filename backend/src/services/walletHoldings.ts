import {ethers} from 'ethers';
import {z} from 'zod';
import {ARC_CHAIN_ID,ARC_IS_MAINNET} from '../../../shared/network.mjs';
import {WalletFlowError} from '../domain/walletQuote';

type Reader={send:(method:string,params:unknown[])=>Promise<any>};
const address=z.string().regex(/^0x[\da-f]{40}$/i).refine(v=>v.toLowerCase()!==ethers.ZeroAddress);
const querySchema=z.object({tokens:z.string().max(900).optional(),cursor:z.string().max(4096).optional()}).strict();
const uint=(v:unknown):bigint=>{if(typeof v!=='string'||!/^0x[\da-f]{1,64}$/i.test(v))throw Error('Invalid uint');return BigInt(v);};
const erc20=new ethers.Interface(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function name() view returns(string)']);
const usdc='0x3600000000000000000000000000000000000000';
export type Holding={address:string;symbol:string;name:string;decimals:number;balance:string};
const label=(value:unknown,fallback:string,max:number)=>typeof value==='string'&&value.trim()&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value)?value.trim().slice(0,max):fallback;

/** Discovery supplies addresses only. Amounts and decimals are read from the selected chain. */
export async function readMainnetHoldings(rpc:Reader,principal:string,query:unknown,fetcher:typeof fetch=fetch){
 if(!ARC_IS_MAINNET)throw new WalletFlowError('WALLET_HOLDINGS_UNSUPPORTED',404);
 const parsed=querySchema.parse(query),imports=parsed.tokens?z.array(address).max(20).parse(parsed.tokens.split(',')).map(v=>v.toLowerCase()):[];
 if(uint(await rpc.send('eth_chainId',[]))!==BigInt(ARC_CHAIN_ID))throw new WalletFlowError('WALLET_CHAIN_UNSUPPORTED',503);
 const tag=await rpc.send('eth_blockNumber',[]);uint(tag);
 const url=new URL('https://explorer.arc.io/api/v2/addresses/'+address.parse(principal).toLowerCase()+'/tokens');url.searchParams.set('type','ERC-20');
 if(parsed.cursor){try{const cursor=JSON.parse(Buffer.from(parsed.cursor,'base64url').toString('utf8'));if(cursor.principal!==principal||cursor.chainId!==ARC_CHAIN_ID)throw Error();const params=z.record(z.string().regex(/^[a-z_]{1,40}$/),z.union([z.string().max(128),z.number().finite()])).parse(cursor.params);if(Object.keys(params).length>12||Object.hasOwn(params,'type'))throw Error();for(const [k,v]of Object.entries(params))url.searchParams.set(k,String(v));}catch{throw new WalletFlowError('WALLET_QUERY_INVALID',400);}}
 let discovered:string[]=[],nextCursor:string|null=null,discoveryUnavailable=false;
 try{
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error();
  const reader=response.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let size=0;while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1024*1024){await reader.cancel();throw Error();}chunks.push(chunk.value);}
  const page=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!Array.isArray(page.items)||page.items.length>50)throw Error();
  discovered=page.items.filter((r:any)=>r?.token?.type==='ERC-20').map((r:any)=>address.parse(r.token.address_hash).toLowerCase());
  if(page.next_page_params!==null&&page.next_page_params!==undefined){const params=z.record(z.string().regex(/^[a-z_]{1,40}$/),z.union([z.string().max(128),z.number().finite()])).parse(page.next_page_params);if(Object.keys(params).length>12||Object.hasOwn(params,'type'))throw Error();nextCursor=Buffer.from(JSON.stringify({principal,chainId:ARC_CHAIN_ID,params})).toString('base64url');if(nextCursor.length>4096)throw Error();}
 }catch{discoveryUnavailable=true;discovered=[];nextCursor=null;}
 const addresses=[...new Set([...imports,...discovered])].filter(a=>a!==usdc),items:Holding[]=[],unreadable:string[]=[];
 for(let offset=0;offset<addresses.length;offset+=4)await Promise.all(addresses.slice(offset,offset+4).map(async contract=>{
  try{
   const call=(method:string,args:unknown[]=[])=>rpc.send('eth_call',[{to:contract,data:erc20.encodeFunctionData(method,args),gas:'0x30d40'},tag]);
   const [rawBalance,rawDecimals]=await Promise.all([call('balanceOf',[principal]),call('decimals')]);
   const balance=uint(rawBalance),decimals=Number(uint(rawDecimals));if(decimals>255)throw Error();
   const short=contract.slice(0,8)+'…'+contract.slice(-4);
   const stringValue=async(method:string,max:number)=>{try{return label(erc20.decodeFunctionResult(method,await call(method))[0],short,max);}catch{return short;}};
   const [symbol,name]=await Promise.all([stringValue('symbol',32),stringValue('name',120)]);
   if(balance>0n||imports.includes(contract))items.push({address:contract,symbol,name,decimals,balance:balance.toString()});
  }catch{unreadable.push(contract);}
 }));
 return{chainId:ARC_CHAIN_ID,principal,blockNumber:uint(tag).toString(),items:items.sort((a,b)=>a.address.localeCompare(b.address)),nextCursor,discoveryUnavailable,unreadable,checkedAt:Date.now()};
}
