import {useEffect,useRef,useState} from 'react';
import {ArrowDown} from 'lucide-react';
import {ethers} from 'ethers';
import {useAuth} from '../context/AuthContext';
import {useWeb3} from '../context/Web3Context';
import {useLanguage} from '../context/LanguageContext';
import {DialogSurface} from './DialogSurface';
import {WalletFlowReview} from './WalletFlowReview';
import {ARC_WALLET_TOKENS,formatWalletAmount,parseWalletAmount,type ArcWalletToken} from '../../../shared/arcWallet.mjs';
import {readWalletOperation,walletRequest,walletError,WalletUiError,type WalletOperation} from '../services/walletFlow';

/** Quotes only. Reserving a nonce and opening a signer remain explicit review actions. */
export function WalletSwap({open,balance,onChange,onClose}:{open:boolean;balance:(symbol:ArcWalletToken)=>string;onChange:(r:WalletOperation)=>void;onClose:()=>void}){
 const {user,token,getSessionEpoch}=useAuth(),{account,walletMode}=useWeb3(),{language}=useLanguage(),en=language==='en',text=(vi:string,eng:string)=>en?eng:vi;
 const [amount,setAmount]=useState(''),[tokenIn,setTokenIn]=useState<ArcWalletToken>('USDC'),[tokenOut,setTokenOut]=useState<ArcWalletToken>('EURC'),[slippage,setSlippage]=useState(100);
 const [preview,setPreview]=useState<{key:string;record:WalletOperation;persisted:boolean}|null>(null),[executionBusy,setExecutionBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[now,setNow]=useState(Date.now()),[visible,setVisible]=useState(!document.hidden);
 const epoch=getSessionEpoch(),key=JSON.stringify([token,user?.id,account,walletMode,epoch,amount,tokenIn,tokenOut,slippage]),current=useRef(key);current.current=key;
 let valid=false;try{valid=parseWalletAmount(amount,tokenIn)>0n&&tokenIn!==tokenOut;}catch{/* Wait for a complete, valid amount. */}
 const record=preview?.key===key?preview.record:null,quote=record?.quote,fresh=!!quote&&Date.now()<quote.expiresAt,started=!!record&&!!preview?.persisted,frozen=executionBusy||started&&record!.steps.some(s=>s.state!=='PLANNED'),showQuote=!!quote&&(fresh||started),sequence=useRef(0);
 useEffect(()=>{const sync=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[]);
 useEffect(()=>{if(!open)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[open]);
 useEffect(()=>{
  const own=++sequence.current;setError('');setLoading(false);
  if(!open||!visible||!valid||!token||!user||!account||started||executionBusy)return;
  if(record&&record.quote.expiresAt>Date.now())return;
  let active=true;setLoading(true);
  const timer=setTimeout(async()=>{
   try{const next=readWalletOperation(await walletRequest(token,'/preview',{requestId:crypto.randomUUID(),intent:{kind:'SWAP',tokenIn,tokenOut,amount,slippageBps:slippage}}),user.id);
    if(!active||own!==sequence.current||key!==current.current||epoch!==getSessionEpoch())return;
    if(next.principal!==account.toLowerCase()||next.quote.kind!=='SWAP'||next.quote.tokenIn!==tokenIn||next.quote.tokenOut!==tokenOut||next.quote.amount!==parseWalletAmount(amount,tokenIn).toString()||next.quote.slippageBps!==slippage||next.steps.some(s=>s.state!=='PLANNED')||next.quote.expiresAt<=Date.now())throw new WalletUiError('WALLET_RESPONSE_INVALID');
    setPreview({key,record:next,persisted:false});setNow(Date.now());
   }catch(e){if(active&&key===current.current)setError(walletError(e,en));}finally{if(active&&own===sequence.current)setLoading(false);}
  },800);
  return()=>{active=false;clearTimeout(timer);};
 },[open,visible,key,retry]);
 useEffect(()=>{
  if(!open||!visible||!record||error||started||executionBusy)return;
  const timer=setTimeout(()=>setRetry(n=>n+1),Math.max(0,record.quote.expiresAt-Date.now())+20);
  return()=>clearTimeout(timer);
 },[open,visible,record,error,started,executionBusy]);
 if(!open)return null;
 const maxFee=quote?.calls.reduce((n,c)=>n+BigInt(c.fee.maxNetworkFee),0n);
 return <DialogSurface label={text('Hoán đổi','Swap tokens')} transaction busy={executionBusy} className="wallet-swap-dialog" onClose={()=>{if(!executionBusy)onClose();}}>
  <div className="wallet-swap-heading"><h2>{text('Hoán đổi','Swap tokens')}</h2><button type="button" className="btn btn-ghost" disabled={executionBusy} onClick={onClose}>{text('Đóng','Close')}</button></div><p className="muted">Arc Testnet</p>
  <form className="wallet-swap-form" onSubmit={e=>e.preventDefault()}>
   <div><label className="wallet-field" htmlFor="wallet-swap-amount">{text('Bạn đổi','You swap')}</label><div className="wallet-asset-control"><input id="wallet-swap-amount" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" maxLength={80} disabled={frozen}/><select aria-label={text('Token dùng để đổi','Input token')} value={tokenIn} disabled={frozen} onChange={e=>{const next=e.target.value as ArcWalletToken;setTokenIn(next);if(next===tokenOut)setTokenOut(tokenIn);}}>{Object.keys(ARC_WALLET_TOKENS).map(t=><option key={t}>{t}</option>)}</select></div><p className="muted wallet-swap-balance">{text('Số dư','Balance')}: {balance(tokenIn)} {tokenIn}</p></div>
   <div className="wallet-swap-direction"><ArrowDown size={22} aria-hidden="true"/></div>
   <div><label className="wallet-field" htmlFor="wallet-swap-output">{text('Bạn nhận dự kiến','Estimated received')}</label><div className="wallet-asset-control"><output id="wallet-swap-output" aria-live="polite">{quote&&showQuote?formatWalletAmount(BigInt(quote.estimatedOut),quote.tokenOut):'—'}</output><select aria-label={text('Token nhận','Output token')} value={tokenOut} disabled={frozen} onChange={e=>setTokenOut(e.target.value as ArcWalletToken)}>{Object.keys(ARC_WALLET_TOKENS).filter(t=>t!==tokenIn).map(t=><option key={t}>{t}</option>)}</select></div></div>
   <div className="wallet-field wallet-slippage"><label htmlFor="wallet-slippage">{text('Trượt giá tối đa','Slippage limit')}</label><select className="form-input" id="wallet-slippage" value={slippage} disabled={frozen} onChange={e=>setSlippage(Number(e.target.value))}><option value={50}>0.5%</option><option value={100}>1%</option><option value={300}>3%</option></select></div>
   <div className="wallet-swap-fees" aria-busy={loading}><dl className="wallet-review-details"><div><dt>{text('Nhận tối thiểu','Minimum received')}</dt><dd>{quote&&showQuote?formatWalletAmount(BigInt(quote.minimumOut),quote.tokenOut)+' '+quote.tokenOut:'—'}</dd></div>{quote&&showQuote&&quote.fees.map((f,i)=><div key={i}><dt>{f.kind==='provider'?text('Phí nhà cung cấp (đã tính)','Provider fee (included)'):text('Phí hoán đổi (đã tính)','Swap fee (included)')}</dt><dd>{formatWalletAmount(BigInt(f.amount),f.token)} {f.token}</dd></div>)}<div><dt>{text('Phí mạng tối đa, mọi bước','Maximum network fees, all steps')}</dt><dd>{maxFee!==undefined&&showQuote?ethers.formatUnits(maxFee,18)+' USDC':'—'}</dd></div></dl>
   <p role="status" className="muted">{loading?text('Đang cập nhật số nhận và phí…','Updating amount and fees…'):started?text('Giữ nguyên yêu cầu đã bắt đầu. Xem trạng thái và phí trước khi tiếp tục.','The started request is kept. Review its status and fees before continuing.'):quote&&fresh?text('Tự cập nhật khi hết hạn · còn ','Refreshes on expiry · ')+Math.max(0,Math.ceil((quote.expiresAt-now)/1000))+'s':text('Nhập số lượng để tự tính số nhận và phí.','Enter an amount to calculate the output and fees.')}</p></div>
   {amount&&!valid&&<p role="alert" className="wallet-error">{text('Nhập số lượng lớn hơn 0, dùng dấu chấm; USDC/EURC tối đa 6 số lẻ, cirBTC tối đa 8.','Enter a positive amount with a decimal point; USDC/EURC allow 6 decimals, cirBTC allows 8.')}</p>}
   {error&&<div><p role="alert" className="wallet-error">{error}</p><button type="button" className="btn btn-secondary" onClick={()=>setRetry(n=>n+1)}>{text('Thử lại báo giá','Retry quote')}</button></div>}
   <p className="muted">{text('Bạn ký riêng từng bước cấp quyền và hoán đổi.','Sign approval and swap separately.')}</p>
   {record&&showQuote&&!loading&&!error?<WalletFlowReview key={record.id} initial={record} preview={!preview!.persisted} inline onBusy={setExecutionBusy} onView={(next,persisted)=>{if(key===current.current&&epoch===getSessionEpoch())setPreview({key,record:next,persisted});}} onChange={onChange} onClose={onClose}/>:<button type="button" className="btn btn-primary" disabled>{text('Hoán đổi','Swap tokens')}</button>}
   {frozen&&!executionBusy&&record?.steps.every(s=>s.state==='PLANNED'||s.state==='CONFIRMED')&&record.steps.some(s=>s.state==='PLANNED')&&<button type="button" className="btn btn-secondary" onClick={()=>{setPreview(null);setRetry(n=>n+1);}}>{text('Sửa số lượng','Edit amount')}</button>}
  </form>
 </DialogSurface>;
}
