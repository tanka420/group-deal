import {Suspense,useCallback,useEffect,useLayoutEffect,useState,type ReactNode} from 'react';
import {ethers} from 'ethers';
import {useAuth} from '../context/AuthContext';
import {useExternalWallet} from '../context/ExternalWalletContext';
import {useLanguage} from '../context/LanguageContext';
import {useOperationScope} from '../hooks/useOperationScope';
import {enrollmentRequest,readEnrollmentStatus,readEnrollmentChallenge,readEnrollmentCheckpoint,enrollmentCheckpointKey,enrollmentDigest,enrollmentReadback,operatorDeployment,OperatorAccessError,type EnrollmentStatus,type EnrollmentChallenge,type EnrollmentCheckpoint} from '../services/operatorEnrollment';
export function OperatorAccess({children,onBack}:{children:ReactNode;onBack:()=>void}){
 const {user,token,isLoading,refreshUser,getSessionEpoch}=useAuth(),external=useExternalWallet(),{language}=useLanguage(),en=language==='en',text=(vi:string,english:string)=>en?english:vi;
 const identity=JSON.stringify([user?.id,token,user?.activeWallet,external.address,external.chainId]),scope=useOperationScope(identity),key=enrollmentCheckpointKey(user?.id??'none',user?.activeWallet??null);
 const [status,setStatus]=useState<EnrollmentStatus|null>(null),[challenge,setChallenge]=useState<EnrollmentChallenge|null>(null),[pending,setPending]=useState<EnrollmentCheckpoint|null>(null),[phase,setPhase]=useState<'IDLE'|'READING'|'PREPARING'|'SIGNING'|'SUBMITTING'>('IDLE'),[error,setError]=useState<unknown>(null),[storageInvalid,setStorageInvalid]=useState(false),[now,setNow]=useState(Date.now());
 const readPending=()=>{try{const raw=sessionStorage.getItem(key);return raw?readEnrollmentCheckpoint(JSON.parse(raw)):null;}catch{throw new OperatorAccessError('STORAGE');}};
 const removePending=()=>{try{sessionStorage.removeItem(key);}catch{/* A matching committed digest still resolves this checkpoint on the next read. */}};
 useLayoutEffect(()=>{setStatus(null);setChallenge(null);setPending(null);setPhase('IDLE');setError(null);setStorageInvalid(false);try{setPending(readPending());}catch(e){setStorageInvalid(true);setError(e);}},[identity]);
 useEffect(()=>{if(!challenge&&!pending)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[challenge,pending]);
 const load=useCallback(async()=>{
  if(!user||!token||isLoading)return;const ticket=scope.start(true),epoch=getSessionEpoch();if(!ticket)return;setPhase('READING');setStatus(null);setError(null);
  try{const value=readEnrollmentStatus(await enrollmentRequest(token,''),{accountId:user.id,wallet:user.activeWallet});if(!ticket.current()||epoch!==getSessionEpoch())return;const saved=readPending();setStorageInvalid(false);if(saved&&enrollmentReadback(value,saved)==='UNCONFIRMED'){setPending(saved);setStatus(value);}else{removePending();setPending(null);setChallenge(null);setStatus(value);if(value.enrolled)await refreshUser();}}
  catch(e){if(ticket.current())setError(e);}
  finally{if(ticket.current()){setPhase('IDLE');ticket.finish();}}
 },[identity,isLoading]);
 useEffect(()=>{void load();},[load]);
 const connected=external.connected&&external.address?.toLowerCase()===user?.activeWallet?.toLowerCase()&&Number(external.chainId)===operatorDeployment.chainId;
 const authorized=!!status?.enrolled&&!pending&&!storageInvalid&&!!user?.roles.includes('operator'),busy=phase!=='IDLE',expired=!!challenge&&challenge.expiresAt<=Math.floor(now/1000);
 async function connect(){if(busy)return;const ticket=scope.start();if(!ticket)return;setError(null);setPhase('PREPARING');try{await external.connect();}catch(e){if(ticket.current())setError(e);}finally{if(ticket.current()){setPhase('IDLE');ticket.finish();}}}
 async function prepare(){
  if(!user||!token||busy||pending||storageInvalid||!status?.eligible||!connected)return;const ticket=scope.start(),epoch=getSessionEpoch();if(!ticket)return;setPhase('PREPARING');setError(null);setChallenge(null);
  try{const value=await enrollmentRequest(token,'/challenge',{walletAddress:user.activeWallet});if(!ticket.current()||epoch!==getSessionEpoch())return;setChallenge(readEnrollmentChallenge(value,{accountId:user.id,wallet:user.activeWallet!,origin:location.origin}));}
  catch(e){if(ticket.current())setError(e);}finally{if(ticket.current()){setPhase('IDLE');ticket.finish();}}
 }
 async function enroll(){
  if(!user||!token||busy||pending||storageInvalid||!challenge||expired||!connected)return;const ticket=scope.start(),epoch=getSessionEpoch();if(!ticket)return;setPhase('SIGNING');setError(null);let submitted=false;
  const current=()=>ticket.current()&&epoch===getSessionEpoch();
  try{
   const signer=await external.getSigner();if(!current())return;
   const expected=challenge.authority.operatorAddress;if((await signer.getAddress()).toLowerCase()!==expected.toLowerCase()||Number((await signer.provider?.getNetwork())?.chainId)!==operatorDeployment.chainId)throw new OperatorAccessError('WALLET');
   if(!current())return;const signature=await signer.signMessage(challenge.challengeMessage);if(!current())return;
   if((await signer.getAddress()).toLowerCase()!==expected.toLowerCase()||Number((await signer.provider?.getNetwork())?.chainId)!==operatorDeployment.chainId||ethers.verifyMessage(challenge.challengeMessage,signature).toLowerCase()!==expected.toLowerCase())throw new OperatorAccessError('WALLET');
   if(!current())return;if(Date.now()/1000>=challenge.expiresAt)throw new OperatorAccessError('INVALID');
   const saved:EnrollmentCheckpoint={version:1,nonceDigest:enrollmentDigest(challenge.nonce),expiresAt:challenge.expiresAt};try{sessionStorage.setItem(key,JSON.stringify(saved));}catch{throw new OperatorAccessError('STORAGE');}
   setPending(saved);setPhase('SUBMITTING');submitted=true;await enrollmentRequest(token,'/verify',{walletAddress:expected,nonce:challenge.nonce,message:challenge.challengeMessage,signature});
  }catch(e){if(current())setError(e);}finally{if(ticket.current()){setPhase('IDLE');ticket.finish();}}
  if(current()&&submitted)void load();
 }
 const message=error instanceof OperatorAccessError?error.kind==='SESSION'?text('Phiên đăng nhập chưa được xác nhận. Đăng nhập lại để tiếp tục.','The session is unconfirmed. Sign in again to continue.'):error.kind==='LIMIT'?text('Đã đạt giới hạn yêu cầu. Chờ rồi kiểm tra lại quyền.','The request limit was reached. Wait, then check access again.'):error.kind==='WALLET'?text('Dùng đúng ví operator trên Arc Testnet trước khi ký.','Use the exact operator wallet on Arc Testnet before signing.'):error.kind==='AUTHORITY'?text('Quyền onchain đã đổi hoặc chưa xác minh được. Kiểm tra lại trước khi ký.','Onchain authority changed or is unverified. Check again before signing.'):error.kind==='STORAGE'?text('Chưa đọc hoặc lưu được mốc phục hồi trong trình duyệt. Giữ yêu cầu và kiểm tra lại; chưa được ký tiếp.','The browser recovery checkpoint could not be read or saved. Keep this request and check again before another signature.'):text('Chưa xác nhận được phản hồi. Kiểm tra lại quyền trước khi thử tiếp.','The response is unconfirmed. Check access before trying again.'):text('Chưa xác minh được ví hoặc chữ ký. Kiểm tra ví rồi thử lại.','The wallet or signature is unconfirmed. Check your wallet before retrying.');
 const accessPanel=<>
  <section className="glass-card operator-access" aria-labelledby="operator-access-title" aria-busy={busy||isLoading}>
   <h2 id="operator-access-title">{text('Quyền operator','Operator access')}</h2>
   {!user||!token?<><p>{text('Đăng nhập bằng tài khoản đã liên kết ví operator để xác minh quyền vận hành.','Sign in with the account bound to the operator wallet to verify operational access.')}</p><button type="button" className="btn btn-secondary" onClick={onBack}>{text('Khám phá deal','Explore deals')}</button></>:<>
    <p>{authorized?text('Máy chủ đã xác minh chữ ký và quyền operator hiện hành cho tài khoản này.','The server verified the controller signature and current operator authority for this account.'):text('Chữ ký này yêu cầu quyền operator cho tài khoản đang đăng nhập. Đây là chữ ký thông điệp, không gửi giao dịch hoặc chi tiêu USDC.','This signature requests operator access for the signed-in account. It signs a message and does not submit a transaction or spend USDC.')}</p>
    <dl className="detail-list"><dt>{text('Ví operator','Operator wallet')}</dt><dd className="address-value">{status?.expectedWallet??operatorDeployment.operatorAddress}</dd><dt>Network</dt><dd>Arc Testnet · {operatorDeployment.chainId}</dd><dt>Hub</dt><dd className="address-value">{operatorDeployment.hubAddress}</dd></dl>
    {error&&<p role="alert" className="notice notice-error">{message}</p>}
    {busy&&<p role="status">{phase==='SIGNING'?text('Xác nhận chữ ký trong ví…','Confirm the message signature in your wallet…'):phase==='SUBMITTING'?text('Đang xác minh và lưu quyền…','Verifying and saving access…'):text('Đang kiểm tra yêu cầu…','Checking the request…')}</p>}
    {pending&&<p role="status" className="notice">{text('Lần gửi chữ ký chưa có kết quả khớp. Kiểm tra lại quyền; chưa ký hoặc gửi lại. Nếu nonce hết hạn, máy chủ phải xác nhận trạng thái trước yêu cầu mới.','The signature submission has no matching result yet. Check access again; do not sign or resubmit. After nonce expiry, the server must confirm status before a new request.')}</p>}
    {status&&!status.eligible&&<p role="status">{text('Ví hoạt động của tài khoản chưa phải ví operator. Chọn hoặc liên kết đúng ví trong menu tài khoản, rồi kiểm tra lại.','This account’s active wallet is not the operator wallet. Select or bind the correct wallet in the account menu, then check again.')}</p>}
    {challenge&&!pending&&<p role="status">{expired?text('Yêu cầu đã hết hạn. Chuẩn bị yêu cầu mới trước khi ký.','This request expired. Prepare a new request before signing.'):text('Yêu cầu đã sẵn sàng. Kiểm tra ví, network và Hub ở trên trước khi ký; hết hạn lúc ','The request is ready. Check the wallet, network and Hub above before signing; expires at ')+new Date(challenge.expiresAt*1000).toLocaleTimeString(en?'en-US':'vi-VN')}</p>}
    <div className="operator-access-actions">
     <button type="button" className="btn btn-secondary" aria-disabled={busy||undefined} onClick={()=>{if(!busy)void load();}}>{text('Kiểm tra lại quyền','Check access again')}</button>
     {!authorized&&!pending&&status?.eligible&&!storageInvalid&&(!connected?<button type="button" className="btn btn-primary" disabled={!external.configured} aria-disabled={busy||undefined} onClick={()=>{if(!busy)void connect();}}>{text('Kết nối ví operator','Connect operator wallet')}</button>:challenge&&!expired?<button type="button" className="btn btn-primary" aria-disabled={busy||undefined} onClick={()=>{if(!busy)void enroll();}}>{text('Ký & cấp quyền operator','Sign & grant operator access')}</button>:<button type="button" className="btn btn-primary" aria-disabled={busy||undefined} onClick={()=>{if(!busy)void prepare();}}>{text('Chuẩn bị yêu cầu','Prepare request')}</button>)}
    </div>
    {!authorized&&status?.eligible&&!connected&&!external.configured&&<p className="muted">{text('Kết nối ví ngoài chưa được cấu hình. Giữ tài khoản này; không cung cấp khóa ví.','External wallet connection is not configured. Keep this account; do not provide a private key.')}</p>}
   </>}
  </section>
 </>;
 return <div className="operator-access-page">{authorized?<details className="operator-access-details"><summary>{text('Quyền operator đã xác minh','Operator access verified')}</summary>{accessPanel}</details>:accessPanel}
  {authorized&&<Suspense fallback={<p role="status">{text('Đang tải workspace operator…','Loading the operator workspace…')}</p>}>{children}</Suspense>}
 </div>;
}
