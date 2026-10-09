import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
export function InitialCircleWalletChoice(){
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi,{user,circleWalletChoices:wallets=[],circleWalletSyncing=false,circleWalletChoiceUnknown=false,selectInitialCircleWallet,retryCircleWallet}=useAuth();
 const [selected,setSelected]=useState(''),[filter,setFilter]=useState(''),[error,setError]=useState(false),status=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{setSelected('');setFilter('');setError(false);},[wallets,user?.id]);
 useEffect(()=>{if(circleWalletChoiceUnknown||error)status.current?.focus();},[circleWalletChoiceUnknown,error]);
 if(!wallets.length)return null;
 const visible=wallets.filter(w=>(w.address+' '+w.walletId).toLowerCase().includes(filter.trim().toLowerCase())),chosen=wallets.find(w=>w.walletId===selected),busy=circleWalletSyncing||circleWalletChoiceUnknown;
 return <section className="circle-wallet-choice" aria-label={text('Chọn ví Circle đầu tiên','Choose your first Circle wallet')} aria-busy={circleWalletSyncing}>
  <h4>{text('Chọn ví Circle cho tài khoản','Choose a Circle wallet for this account')}</h4>
  <p>{text('Circle đang có nhiều ví Arc. Chọn đúng địa chỉ bạn muốn liên kết trước khi mua hoặc ký. Các ví và quyền đã có vẫn được giữ.','Circle has several Arc wallets. Choose the address to link before buying or signing. Existing wallets and permissions remain with your account.')}</p>
  {wallets.length>7&&<label>{text('Tìm địa chỉ hoặc mã ví','Find an address or wallet ID')}<input value={filter} disabled={busy} onChange={e=>setFilter(e.target.value)} autoComplete="off" spellCheck={false}/></label>}
  <ul className="circle-wallet-choice-list">{visible.map(w=><li key={w.walletId}><button type="button" aria-pressed={selected===w.walletId} disabled={busy} onClick={()=>{setSelected(w.walletId);setError(false);}}><code>{w.address}</code><span>Arc Testnet · <code>{w.walletId}</code></span></button></li>)}</ul>
  {!visible.length&&<p role="status">{text('Không tìm thấy ví trong danh sách.','No wallet matches this list.')}</p>}
  {chosen&&<p>{text('Ví sẽ liên kết','Wallet to link')}: <code>{chosen.address}</code></p>}
  {(circleWalletChoiceUnknown||error)&&<p ref={status} role="alert" tabIndex={-1}>{circleWalletChoiceUnknown?text('Chưa xác nhận được lựa chọn. Đọc lại trạng thái; không chọn ví khác khi chưa rõ kết quả.','Selection is unconfirmed. Check the current state before choosing another wallet.'):text('Chưa chọn được ví. Đọc lại danh sách để tiếp tục.','Wallet selection is unavailable. Reload the list to continue.')}</p>}
  {circleWalletSyncing&&<p role="status">{text('Đang kiểm tra ví Circle…','Checking the Circle wallet…')}</p>}
  <div className="auth-actions"><button type="button" className="btn btn-secondary" disabled={circleWalletSyncing} onClick={()=>void retryCircleWallet().catch(()=>setError(true))}>{circleWalletChoiceUnknown?text('Kiểm tra lựa chọn hiện tại','Check current selection'):text('Đọc lại ví Circle','Reload Circle wallets')}</button><button type="button" className="btn btn-primary" disabled={busy||!chosen} onClick={()=>{setError(false);void selectInitialCircleWallet(selected).catch(()=>setError(true));}}>{text('Xác nhận ví Circle này','Confirm this Circle wallet')}</button></div>
 </section>;
}
