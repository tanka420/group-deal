import {useRef,useState,useEffect} from 'react';
import {useAuth} from '../context/AuthContext';

/** OTP stays in Circle's UI; the transaction and APP session stay in place. */
export function WalletCircleAuth({en,onBusy,onReady}:{en:boolean;onBusy:(busy:boolean)=>void;onReady:()=>void}){
 const {user,circleLoginEmail,circleReady,circleInitState,prepareCircle,reauthenticateCircle}=useAuth(),[email,setEmail]=useState(user?.email||circleLoginEmail||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),alive=useRef(true),flight=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{void prepareCircle().catch(()=>{});},[prepareCircle]);
 const run=async()=>{if(flight.current)return;flight.current=true;setBusy(true);setError('');onBusy(true);try{await reauthenticateCircle(email);if(alive.current)onReady();}catch(e){if(alive.current)setError(e instanceof Error&&['CIRCLE_AUTH_RATE_LIMIT','AUTH_SESSION_CHANGED','CIRCLE_WALLET_NOT_BOUND'].includes(e.message)?e.message:'INCOMPLETE');}finally{flight.current=false;if(alive.current){setBusy(false);onBusy(false);}}};
 return <section className="notice wallet-inline-auth" aria-label={en?'Authenticate Circle wallet':'Xác thực ví Circle'}>
  <p>{en?'Authenticate your email wallet to continue this transfer.':'Xác thực ví email để tiếp tục giao dịch này.'}</p>
  <label className="wallet-field">{en?'Circle login email':'Email đăng nhập Circle'}<input className="form-input" type="email" readOnly={!!user?.email} value={user?.email||email} maxLength={254} autoComplete="email" disabled={busy} onChange={e=>{setEmail(e.target.value);setError('');}}/></label>
  {!user?.email&&<p className="muted">{en?'Enter the email used for this Circle wallet.':'Nhập email bạn dùng đăng nhập ví Circle này.'}</p>}
  <p className="muted">{en?'Enter the code in Circle. Your recipient and amount stay here.':'Nhập mã trong cửa sổ Circle. Người nhận và số tiền được giữ tại đây.'}</p>
  {circleInitState==='INITIALIZING'&&<p role="status">{en?'Connecting to Circle…':'Đang kết nối Circle…'}</p>}
  {circleInitState==='UNAVAILABLE'&&<><p role="alert">{en?'The Circle connection did not finish. Retry the connection before requesting a code.':'Chưa kết nối được Circle. Thử lại kết nối trước khi yêu cầu gửi mã.'}</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void prepareCircle().catch(()=>{})}>{en?'Retry Circle connection':'Thử lại kết nối Circle'}</button></>}
  <button type="button" className="btn btn-secondary" disabled={busy||!circleReady||!/^\S+@\S+\.\S+$/.test(user?.email||email.trim())} onClick={()=>void run()}>{busy?(en?'Waiting for email verification…':'Đang chờ xác thực email…'):(en?'Send code':'Gửi mã')}</button>
  {error&&<p role="alert">{error==='CIRCLE_AUTH_RATE_LIMIT'?(en?'Too many code requests. Wait before requesting another code.':'Đã yêu cầu mã quá nhiều lần. Chờ trước khi gửi mã tiếp.'):error==='AUTH_SESSION_CHANGED'?(en?'Your account session changed. Reopen this saved request with the current account.':'Phiên tài khoản đã thay đổi. Mở lại yêu cầu đã lưu bằng tài khoản hiện tại.'):error==='CIRCLE_WALLET_NOT_BOUND'?(en?'Circle did not confirm the wallet linked to this account. Authenticate the matching wallet.':'Circle chưa xác nhận đúng ví liên kết với tài khoản này. Xác thực bằng đúng ví.'):en?'Email verification is incomplete. Open it again to continue the saved request.':'Chưa hoàn tất xác thực email. Mở lại để tiếp tục yêu cầu đã lưu.'}</p>}
 </section>;
}
