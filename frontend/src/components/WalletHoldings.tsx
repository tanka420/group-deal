import {useEffect,useRef,useState} from 'react';
import {ethers} from 'ethers';
import {ARC_CHAIN_ID,ARC_EXPLORER} from '../../../shared/network.mjs';
import {useLanguage} from '../context/LanguageContext';

type Holding={address:string;symbol:string;name:string;decimals:number;balance:string};
type Page={chainId:number;principal:string;items:Holding[];nextCursor:string|null;discoveryUnavailable:boolean;unreadable:string[]};
const isAddress=(v:unknown):v is string=>typeof v==='string'&&/^0x[\da-f]{40}$/i.test(v)&&v.toLowerCase()!==ethers.ZeroAddress;
const uint=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v)&&BigInt(v)<2n**256n;
const textValue=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
function amount(row:Holding){const digits=row.balance.padStart(row.decimals+1,'0');return row.decimals?digits.slice(0,-row.decimals)+(digits.slice(-row.decimals).replace(/0+$/,'')?'.'+digits.slice(-row.decimals).replace(/0+$/,''):''):digits;}
function imports(key:string){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?[...new Set(value.filter(isAddress).map(v=>v.toLowerCase()))].slice(0,20):[];}catch{return[];}}

export function WalletHoldings({token,userId,principal,revision}:{token:string;userId:string;principal:string;revision?:number}){
 const {language}=useLanguage(),en=language==='en',text=(vi:string,eng:string)=>en?eng:vi,key='groupdeal_tokens:'+ARC_CHAIN_ID+':'+userId+':'+principal.toLowerCase();
 const [custom,setCustom]=useState<string[]>(()=>imports(key)),[rows,setRows]=useState<Holding[]>([]),[cursor,setCursor]=useState<string|null>(null),[pending,setPending]=useState(false),[unavailable,setUnavailable]=useState(false),[unreadable,setUnreadable]=useState(false),[error,setError]=useState(false),[contract,setContract]=useState(''),[inputError,setInputError]=useState(''),[refresh,setRefresh]=useState(0);
 const generation=useRef(0),request=useRef<AbortController|null>(null),inflight=useRef(false);
 const load=async(append=false)=>{
  if(inflight.current)return;const own=generation.current,controller=new AbortController();request.current=controller;inflight.current=true;setPending(true);setError(false);
  const params=new URLSearchParams();if(custom.length)params.set('tokens',custom.join(','));if(append&&cursor)params.set('cursor',cursor);
  try{
   const response=await fetch('/api/wallet/flows/holdings?'+params,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});if(!response.ok)throw Error();const page=await response.json() as Page;
   if(page.chainId!==ARC_CHAIN_ID||page.principal!==principal.toLowerCase()||!Array.isArray(page.items)||page.items.length>70||typeof page.discoveryUnavailable!=='boolean'||!Array.isArray(page.unreadable)||page.unreadable.some(v=>!isAddress(v))||page.nextCursor!==null&&(typeof page.nextCursor!=='string'||page.nextCursor.length>4096||append&&page.nextCursor===cursor)||page.items.some(r=>!isAddress(r.address)||!textValue(r.symbol,32)||!textValue(r.name,120)||!Number.isInteger(r.decimals)||r.decimals<0||r.decimals>255||!uint(r.balance))||new Set(page.items.map(r=>r.address.toLowerCase())).size!==page.items.length)throw Error();
   if(own!==generation.current)return;
   setRows(old=>append?[...new Map([...old,...page.items].map(r=>[r.address.toLowerCase(),r])).values()]:page.items);setCursor(page.nextCursor);setUnavailable(page.discoveryUnavailable);setUnreadable(page.unreadable.length>0);
  }catch{if(own===generation.current&&!controller.signal.aborted)setError(true);}finally{if(own===generation.current){inflight.current=false;setPending(false);}}
 };
 useEffect(()=>{generation.current++;request.current?.abort();inflight.current=false;setRows([]);setCursor(null);setUnavailable(false);setUnreadable(false);void load();return()=>{generation.current++;request.current?.abort();inflight.current=false;};},[token,key,custom.join(','),revision,refresh]);
 const add=(event:React.FormEvent)=>{event.preventDefault();const value=contract.trim().toLowerCase();if(!isAddress(value)){setInputError(text('Nhập địa chỉ contract hợp lệ trên Arc.','Enter a valid token contract address on Arc.'));return;}if(custom.includes(value)){setInputError(text('Token đã được thêm.','Token is already added.'));return;}if(custom.length>=20){setInputError(text('Đã đạt giới hạn 20 token tự thêm.','You have reached the limit of 20 imported tokens.'));return;}try{const next=[...custom,value];localStorage.setItem(key,JSON.stringify(next));setCustom(next);setContract('');setInputError('');}catch{setInputError(text('Chưa lưu được token trong trình duyệt.','Token could not be saved in this browser.'));}};
 return <section className="wallet-holdings" aria-labelledby="wallet-holdings-title"><h3 id="wallet-holdings-title">{text('Token trong ví','Wallet tokens')}</h3>
  <dl className="wallet-assets">{rows.map(row=><div key={row.address}><dt><strong>{row.symbol}</strong><span className="muted">{row.name}</span><a className="font-mono" href={ARC_EXPLORER+'/token/'+row.address} target="_blank" rel="noopener noreferrer">{row.address.slice(0,8)}…{row.address.slice(-4)}</a></dt><dd title={amount(row)}>{amount(row)}</dd></div>)}</dl>
  {pending&&<p role="status">{text('Đang đọc token…','Reading tokens…')}</p>}
  {(error||unavailable)&&<p role="status" className="muted">{text('Chưa tải đủ danh sách token. Bạn có thể thêm token bằng địa chỉ contract.','The full token list is unavailable. You can add a token by its contract address.')}</p>}
  {unreadable&&<p role="status" className="muted">{text('Một số token chưa đọc được số dư.','Some token balances could not be read.')}</p>}
  {(error||unavailable||unreadable)&&<button type="button" className="btn btn-ghost" disabled={pending} onClick={()=>setRefresh(v=>v+1)}>{text('Thử lại','Retry')}</button>}
  {cursor&&<button type="button" className="btn btn-secondary" disabled={pending} onClick={()=>void load(true)}>{text('Xem thêm token','Load more tokens')}</button>}
  <details><summary>{text('Thêm token','Add token')}</summary><form onSubmit={add} className="wallet-token-import"><label className="wallet-field" htmlFor="wallet-token-contract">{text('Địa chỉ contract trên Arc','Token contract on Arc')}<input id="wallet-token-contract" className="form-input font-mono" value={contract} onChange={e=>{setContract(e.target.value);setInputError('');}} placeholder="0x…" maxLength={42} spellCheck={false} autoComplete="off" aria-invalid={!!inputError} aria-describedby={inputError?'wallet-token-error':undefined}/></label><button type="submit" className="btn btn-secondary" disabled={pending}>{text('Thêm token','Add token')}</button>{inputError&&<p role="alert" id="wallet-token-error">{inputError}</p>}</form></details>
 </section>;
}
