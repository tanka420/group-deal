import {useLayoutEffect,useRef,useState} from 'react';
import {useLanguage} from '../context/LanguageContext';
import {parseAccountDirectory,parseRuntimeSettings,type AccountDirectory,type RuntimeSettings,type AccountRole,type RoleFilter} from '../services/operatorAdministration';

export function OperatorAdministration({token,userId,mode}:{token:string;userId:string;mode:'users'|'settings'}){
 const {language}=useLanguage(),en=language==='en';
 const [role,setRole]=useState<RoleFilter>('ALL'),[cursors,setCursors]=useState<(string|null)[]>([null]),[refresh,setRefresh]=useState(0);
 const [view,setView]=useState<AccountDirectory|RuntimeSettings|null>(null),[pending,setPending]=useState(true),[error,setError]=useState<number|null>(null);
 const scope=useRef({token,userId,mode}),epoch=useRef(0),cursor=cursors[cursors.length-1]??null;
 useLayoutEffect(()=>{
  if(scope.current.token!==token||scope.current.userId!==userId||scope.current.mode!==mode){scope.current={token,userId,mode};setCursors([null]);setRole('ALL');setView(null);setError(null);setPending(true);setRefresh(v=>v+1);return;}
  const owned=++epoch.current,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let active=true;
  setView(null);setError(null);setPending(true);
  const query=new URLSearchParams({role,limit:'20'});if(cursor)query.set('cursor',cursor);
  void (async()=>{
   try{
    const response=await fetch('/api/operator/'+mode+(mode==='users'?'?'+query.toString():''),{headers:{Authorization:'Bearer '+token},signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw response.status;
    const value=await response.json(),parsed=mode==='users'?parseAccountDirectory(value,userId,role):parseRuntimeSettings(value,userId);
    if(active&&epoch.current===owned)setView(parsed);
   }catch(e){if(active&&epoch.current===owned)setError(typeof e==='number'?e:503);}
   finally{clearTimeout(timer);if(active&&epoch.current===owned)setPending(false);}
  })();
  return()=>{active=false;epoch.current++;clearTimeout(timer);controller.abort();};
 },[token,userId,mode,role,cursor,refresh]);
 const reload=()=>{setCursors([null]);setRefresh(v=>v+1);},labels:Record<AccountRole,string>={buyer:en?'Buyer':'Người mua',seller:en?'Seller':'Người bán',operator:en?'Operator':'Điều hành'};
 const directory=view?.scope==='OPERATOR_ACCOUNT_DIRECTORY'?view:null,settings=view?.scope==='OPERATOR_RUNTIME_CONFIGURATION'?view:null;
 const configured=(value:boolean)=>value?(en?'Configured':'Đã cấu hình'):(en?'Not configured':'Chưa cấu hình');
 return <section className="ui-stack operator-administration" aria-labelledby={'operator-'+mode+'-heading'} aria-busy={pending}>
  <div className="glass-card">
   <div className="ui-row"><div><h2 id={'operator-'+mode+'-heading'}>{mode==='users'?(en?'Users and roles':'Người dùng và vai trò'):(en?'Runtime settings':'Cài đặt hệ thống')}</h2>
    <p className="muted">{mode==='users'?(en?'View assigned account roles. Wallet actions follow their own authorization checks.':'Xem vai trò đã gán cho tài khoản. Thao tác ví được kiểm tra quyền riêng.'):(en?'Configuration currently used by the backend. Integration status shows configuration only; see Operations for activity.':'Cấu hình backend đang sử dụng. Trạng thái tích hợp chỉ cho biết đã cấu hình; xem Vận hành để theo dõi hoạt động.')}</p></div>
    <button className="btn btn-secondary" type="button" disabled={pending} onClick={reload}>{en?'Reload':'Tải lại'}</button></div>
   {mode==='users'&&<div className="operator-outbox-controls"><label>{en?'Filter by role':'Lọc theo vai trò'}<select value={role} disabled={pending} onChange={e=>{setRole(e.target.value as RoleFilter);setCursors([null]);}}><option value="ALL">{en?'All roles':'Tất cả vai trò'}</option>{(['buyer','seller','operator'] as const).map(r=><option key={r} value={r}>{labels[r]}</option>)}</select></label></div>}
   {pending&&<p role="status">{en?'Loading…':'Đang tải…'}</p>}
   {error!==null&&<p role="alert" className="notice notice-error">{error===409?(en?'Accounts changed while browsing. Reload to start with current data.':'Danh sách tài khoản đã thay đổi. Tải lại để xem dữ liệu hiện hành.'):error===401||error===403?(en?'Your session no longer has access. Sign in with an authorized operator account.':'Phiên hiện tại không còn quyền truy cập. Đăng nhập bằng tài khoản điều hành được cấp quyền.'):(en?'Data is unavailable. Check your connection and try again.':'Chưa tải được dữ liệu. Kiểm tra kết nối và thử lại.')}</p>}
   {view&&<p className="muted">{en?'Updated':'Đọc lúc'}: <time dateTime={new Date(view.observedAt).toISOString()}>{new Date(view.observedAt).toLocaleString(en?'en-GB':'vi-VN')}</time></p>}
  </div>
  {directory&&<><div className="ui-record-list" aria-label={en?'Accounts':'Tài khoản'}>{directory.users.length?directory.users.map(account=><article className="glass-card ui-record-card" key={account.id}>
   <h3>{account.displayName||account.id}</h3><p>{en?'Account ID':'Mã tài khoản'}: <code>{account.id}</code></p>
   <div className="ui-row" aria-label={en?'Assigned roles':'Vai trò đã gán'}>{account.roles.length?account.roles.map(r=><span className="badge" key={r}>{labels[r]}</span>):<span className="muted">{en?'No assigned roles':'Chưa có vai trò'}</span>}</div>
   <dl><dt>{en?'Created':'Ngày tạo'}</dt><dd><time dateTime={new Date(account.createdAt).toISOString()}>{new Date(account.createdAt).toLocaleDateString(en?'en-GB':'vi-VN')}</time></dd>
    <dt>{en?'Sign-in method':'Cách đăng nhập'}</dt><dd>{account.loginMethod==='CIRCLE_EMAIL'?(en?'Circle email':'Email Circle'):account.loginMethod==='EVM_WALLET'?(en?'EVM wallet':'Ví EVM'):(en?'Not recorded':'Chưa ghi nhận')}</dd>
    <dt>{en?'Selected wallet':'Ví đang chọn'}</dt><dd>{account.activeWallet?<code>{account.activeWallet}</code>:(en?'None selected':'Chưa chọn ví')}</dd></dl>
  </article>):<div className="glass-card ui-state"><p>{en?'No accounts match this role.':'Không có tài khoản khớp vai trò này.'}</p></div>}</div>
   <nav className="ui-row" aria-label={en?'Account pages':'Trang tài khoản'}><button type="button" className="btn btn-secondary" disabled={pending||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>{en?'Previous page':'Trang trước'}</button><span>{en?'Page':'Trang'} {cursors.length}</span><button type="button" className="btn btn-secondary" disabled={pending||!directory.pagination.nextCursor} onClick={()=>setCursors(v=>[...v,directory.pagination.nextCursor])}>{en?'Next page':'Trang sau'}</button></nav>
  </>}
  {settings&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:'1rem'}}>
   <div className="glass-card ui-record-card"><h3>{en?'Network and contracts':'Mạng và hợp đồng'}</h3><dl><dt>Chain ID</dt><dd>{settings.chainId}</dd><dt>GroupDeal Hub</dt><dd><code>{settings.hubAddress}</code></dd><dt>USDC</dt><dd><code>{settings.usdcAddress}</code></dd><dt>{en?'Deployment block':'Block triển khai'}</dt><dd>{settings.deploymentBlock}</dd><dt>{en?'Protocol version':'Phiên bản giao thức'}</dt><dd>{settings.protocolVersion}</dd></dl></div>
   <div className="glass-card ui-record-card"><h3>{en?'Operator configuration':'Cấu hình điều hành'}</h3><dl><dt>{en?'Configured operator wallet':'Ví điều hành trong cấu hình'}</dt><dd><code>{settings.operatorWallet}</code></dd><dt>{en?'Backend mode':'Chế độ backend'}</dt><dd>{settings.production?(en?'Production':'Vận hành'):(en?'Development / test':'Phát triển / kiểm thử')}</dd></dl></div>
   <div className="glass-card ui-record-card"><h3>{en?'Integrations':'Tích hợp'}</h3><dl><dt>{en?'Circle wallets':'Ví Circle'}</dt><dd>{configured(settings.integrations.circleConfigured)}</dd><dt>Email SMTP</dt><dd>{configured(settings.integrations.smtpConfigured)}</dd><dt>Email API</dt><dd>{configured(settings.integrations.emailApiConfigured)}</dd></dl></div>
  </div>}
 </section>;
}
