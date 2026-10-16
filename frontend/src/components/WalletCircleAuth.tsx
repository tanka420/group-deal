import {useRef,useState,useEffect} from 'react';
import {useAuth} from '../context/AuthContext';

/** OTP stays in Circle's UI; the transaction and APP session stay in place. */
export function WalletCircleAuth({en,onBusy,onReady}:{en:boolean;onBusy:(busy:boolean)=>void;onReady:()=>void}){
 const {user,circleLoginEmail,reauthenticateCircle}=useAuth(),[email,setEmail]=useState(user?.email||circleLoginEmail||''),[busy,setBusy]=useState(false),[error,setError]=useState(false),alive=useRef(true),flight=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const run=async()=>{if(flight.current)return;flight.current=true;setBusy(true);setError(false);onBusy(true);try{await reauthenticateCircle(email);if(alive.current)onReady();}catch{if(alive.current)setError(true);}finally{flight.current=false;if(alive.current){setBusy(false);onBusy(false);}}};
 return <section className="notice wallet-inline-auth" aria-label={en?'Authenticate Circle wallet':'Xác thực ví Circle'}>
  <p>{en?'Authenticate your email wallet to continue this transfer.':'Xác thực ví email để tiếp tục giao dịch này.'}</p>
  <label className="wallet-field">{en?'Circle login email':'Email đăng nhập Circle'}<input className="form-input" type="email" readOnly={!!user?.email} value={user?.email||email} maxLength={254} autoComplete="email" disabled={busy} onChange={e=>{setEmail(e.target.value);setError(false);}}/></label>
  {!user?.email&&<p className="muted">{en?'Enter the email used for this Circle wallet.':'Nhập email bạn dùng đăng nhập ví Circle này.'}</p>}
  <p className="muted">{en?'Enter the code in Circle. Your recipient and amount stay here.':'Nhập mã trong cửa sổ Circle. Người nhận và số tiền được giữ tại đây.'}</p>
  <button type="button" className="btn btn-secondary" disabled={busy||!/^\S+@\S+\.\S+$/.test(user?.email||email.trim())} onClick={()=>void run()}>{busy?(en?'Waiting for email verification…':'Đang chờ xác thực email…'):(en?'Send code':'Gửi mã')}</button>
  {error&&<p role="alert">{en?'Email verification is incomplete. Open it again to continue the saved request.':'Chưa hoàn tất xác thực email. Mở lại để tiếp tục yêu cầu đã lưu.'}</p>}
 </section>;
}
