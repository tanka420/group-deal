import {useEffect,useRef,useState} from 'react';
import {ArrowDown} from 'lucide-react';
import {ethers} from 'ethers';
import {useAuth} from '../context/AuthContext';
import {useWeb3} from '../context/Web3Context';
import {useLanguage} from '../context/LanguageContext';
import {DialogSurface} from './DialogSurface';
import {ARC_WALLET_TOKENS,formatWalletAmount,parseWalletAmount,type ArcWalletToken} from '../../../shared/arcWallet.mjs';
import {readWalletOperation,walletRequest,walletError,WalletUiError,type WalletOperation} from '../services/walletFlow';

/** Quotes only. Reserving a nonce and opening a signer remain explicit review actions. */
export function WalletSwap({open,balance,onReview,onClose}:{open:boolean;balance:(symbol:ArcWalletToken)=>string;onReview:(r:WalletOperation)=>void;onClose:()=>void}){
 const {user,token,getSessionEpoch}=useAuth(),{account,walletMode}=useWeb3(),{language}=useLanguage(),en=language==='en',text=(vi:string,eng:string)=>en?eng:vi;
 const [amount,setAmount]=useState(''),[tokenIn,setTokenIn]=useState<ArcWalletToken>('USDC'),[tokenOut,setTokenOut]=useState<ArcWalletToken>('EURC'),[slippage,setSlippage]=useState(100);
 const [preview,setPreview]=useState<{key:string;record:WalletOperation}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[now,setNow]=useState(Date.now()),[visible,setVisible]=useState(!document.hidden);
 const epoch=getSessionEpoch(),key=JSON.stringify([token,user?.id,account,walletMode,epoch,amount,tokenIn,tokenOut,slippage]),current=useRef(key);current.current=key;
 let valid=false;try{valid=parseWalletAmount(amount,tokenIn)>0n&&tokenIn!==tokenOut;}catch{/* Wait for a complete, valid amount. */}
 const record=preview?.key===key?preview.record:null,quote=record?.quote,fresh=!!quote&&Date.now()<quote.expiresAt,sequence=useRef(0);
 useEffect(()=>{const sync=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[]);
 useEffect(()=>{if(!open)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[open]);
 useEffect(()=>{
  const own=++sequence.current;setError('');setLoading(false);
  if(!open||!visible||!valid||!token||!user||!account)return;
  if(record&&record.quote.expiresAt>Date.now())return;
  let active=true;setLoading(true);
  const timer=setTimeout(async()=>{
   try{const next=readWalletOperation(await walletRequest(token,'/quote',{requestId:crypto.randomUUID(),intent:{kind:'SWAP',tokenIn,tokenOut,amount,slippageBps:slippage}}),user.id);
    if(!active||own!==sequence.current||key!==current.current||epoch!==getSessionEpoch())return;
    if(next.principal!==account.toLowerCase()||next.quote.kind!=='SWAP'||next.quote.tokenIn!==tokenIn||next.quote.tokenOut!==tokenOut||next.quote.amount!==parseWalletAmount(amount,tokenIn).toString()||next.quote.slippageBps!==slippage||next.steps.some(s=>s.state!=='PLANNED')||next.quote.expiresAt<=Date.now())throw new WalletUiError('WALLET_RESPONSE_INVALID');
    setPreview({key,record:next});setNow(Date.now());
   }catch(e){if(active&&key===current.current)setError(walletError(e,en));}finally{if(active&&own===sequence.current)setLoading(false);}
  },800);
  return()=>{active=false;clearTimeout(timer);};
 },[open,visible,key,retry]);
 useEffect(()=>{
  if(!open||!visible||!record||error)return;
  const timer=setTimeout(()=>setRetry(n=>n+1),Math.max(0,record.quote.expiresAt-Date.now())+20);
  return()=>clearTimeout(timer);
 },[open,visible,record,error]);
 if(!open)return null;
 const maxFee=quote?.calls.reduce((n,c)=>n+BigInt(c.fee.maxNetworkFee),0n);
 return <DialogSurface label={text('Đổi token','Swap tokens')} className="wallet-swap-dialog" onClose={onClose}>
  <h2>{text('Đổi token','Swap tokens')}</h2><p className="muted">Arc Testnet</p>
  <form className="wallet-swap-form" onSubmit={e=>{e.preventDefault();if(record&&record.quote.expiresAt>Date.now()&&key===current.current&&epoch===getSessionEpoch()&&!loading&&!error){setPreview(null);onReview(record);}}}>
   <div><label className="wallet-field" htmlFor="wallet-swap-amount">{text('Bạn đổi','You swap')}</label><div className="wallet-asset-control"><input id="wallet-swap-amount" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" maxLength={80}/><select aria-label={text('Token dùng để đổi','Input token')} value={tokenIn} onChange={e=>{const next=e.target.value as ArcWalletToken;setTokenIn(next);if(next===tokenOut)setTokenOut(tokenIn);}}>{Object.keys(ARC_WALLET_TOKENS).map(t=><option key={t}>{t}</option>)}</select></div><p className="muted wallet-swap-balance">{text('Số dư','Balance')}: {balance(tokenIn)} {tokenIn}</p></div>
   <div className="wallet-swap-direction"><ArrowDown size={22} aria-hidden="true"/></div>
   <div><label className="wallet-field" htmlFor="wallet-swap-output">{text('Bạn nhận dự kiến','Estimated received')}</label><div className="wallet-asset-control"><output id="wallet-swap-output" aria-live="polite">{quote&&fresh?formatWalletAmount(BigInt(quote.estimatedOut),quote.tokenOut):'—'}</output><select aria-label={text('Token nhận','Output token')} value={tokenOut} onChange={e=>setTokenOut(e.target.value as ArcWalletToken)}>{Object.keys(ARC_WALLET_TOKENS).filter(t=>t!==tokenIn).map(t=><option key={t}>{t}</option>)}</select></div></div>
   <div className="wallet-field wallet-slippage"><label htmlFor="wallet-slippage">{text('Trượt giá tối đa','Slippage limit')}</label><select className="form-input" id="wallet-slippage" value={slippage} onChange={e=>setSlippage(Number(e.target.value))}><option value={50}>0.5%</option><option value={100}>1%</option><option value={300}>3%</option></select></div>
   <div className="wallet-swap-fees" aria-busy={loading}><dl className="wallet-review-details"><div><dt>{text('Nhận tối thiểu','Minimum received')}</dt><dd>{quote&&fresh?formatWalletAmount(BigInt(quote.minimumOut),quote.tokenOut)+' '+quote.tokenOut:'—'}</dd></div>{quote&&fresh&&quote.fees.map((f,i)=><div key={i}><dt>{f.kind==='provider'?text('Phí nhà cung cấp (đã tính)','Provider fee (included)'):text('Phí hoán đổi (đã tính)','Swap fee (included)')}</dt><dd>{formatWalletAmount(BigInt(f.amount),f.token)} {f.token}</dd></div>)}<div><dt>{text('Phí mạng tối đa, mọi bước','Maximum network fees, all steps')}</dt><dd>{maxFee!==undefined&&fresh?ethers.formatUnits(maxFee,18)+' USDC':'—'}</dd></div></dl>
   <p role="status" className="muted">{loading?text('Đang cập nhật số nhận và phí…','Updating amount and fees…'):quote&&fresh?text('Tự cập nhật khi hết hạn · còn ','Refreshes on expiry · ')+Math.max(0,Math.ceil((quote.expiresAt-now)/1000))+'s':text('Nhập số lượng để tự tính số nhận và phí.','Enter an amount to calculate the output and fees.')}</p></div>
   {amount&&!valid&&<p role="alert" className="wallet-error">{text('Nhập số lượng lớn hơn 0, dùng dấu chấm; USDC/EURC tối đa 6 số lẻ, cirBTC tối đa 8.','Enter a positive amount with a decimal point; USDC/EURC allow 6 decimals, cirBTC allows 8.')}</p>}
   {error&&<div><p role="alert" className="wallet-error">{error}</p><button type="button" className="btn btn-secondary" onClick={()=>setRetry(n=>n+1)}>{text('Thử lại báo giá','Retry quote')}</button></div>}
   <p className="muted">{text('Giữ đủ USDC trả phí mạng. Bạn sẽ xem lại quyền approve trước khi ký.','Keep enough USDC for network fees. Review the approval before signing.')}</p>
   <button type="submit" className="btn btn-primary" disabled={!record||!fresh||loading||!!error}>{text('Kiểm tra hoán đổi','Review swap')}</button>
  </form>
 </DialogSurface>;
}
