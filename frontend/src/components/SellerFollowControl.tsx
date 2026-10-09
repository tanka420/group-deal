import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {SellerFollow,FollowSettings,FollowCheckpoint,FollowRequestError,followRequest,readSellerFollow,followCheckpoint,saveFollowCheckpoint,clearFollowCheckpoint,followCommand} from '../services/sellerFollow';
type Phase='LOADING'|'READY'|'UNKNOWN'|'MISSING'|'ERROR'|'BROKEN';
export function SellerFollowControl({sellerId,onSaved}:{sellerId:string;onSaved?:()=>void}){
 const {token,user}=useAuth(),{language}=useLanguage();
 if(!token||!user)return <p className="notice">{language==='en'?'Sign in using Account above to follow this seller.':'Đăng nhập bằng nút Tài khoản ở trên để theo dõi seller này.'}</p>;
 return <OwnedFollow key={JSON.stringify([token,user.id,sellerId])} token={token} userId={user.id} sellerId={sellerId} onSaved={onSaved}/>;
}
function OwnedFollow({token,userId,sellerId,onSaved}:{token:string;userId:string;sellerId:string;onSaved?:()=>void}){
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [status,setStatus]=useState<SellerFollow|null>(null),[form,setForm]=useState<FollowSettings>({following:false,notifyNewDeals:false,notifyDealUpdates:false}),[phase,setPhase]=useState<Phase>('LOADING'),[pending,setPending]=useState(false),[confirmed,setConfirmed]=useState(false),[checkpoint,setCheckpoint]=useState<FollowCheckpoint|null>(null),[error,setError]=useState(false);
 const alive=useRef(false),busy=useRef(false),controllers=useRef(new Set<AbortController>());
 const apply=(f:SellerFollow)=>{setStatus(f);setForm({following:f.following,notifyNewDeals:f.notifyNewDeals,notifyDealUpdates:f.notifyDealUpdates});};
 const current=(signal:AbortSignal)=>alive.current&&!signal.aborted;
 async function run(action:(signal:AbortSignal)=>Promise<void>){if(busy.current)return;busy.current=true;setPending(true);setError(false);const c=new AbortController();controllers.current.add(c);try{await action(c.signal);}catch{if(current(c.signal))setError(true);}finally{controllers.current.delete(c);if(current(c.signal)){busy.current=false;setPending(false);}}}
 async function load(signal:AbortSignal){const f=readSellerFollow((await followRequest('/'+encodeURIComponent(sellerId),token,signal)).follow,userId,sellerId);if(current(signal))apply(f);}
 useEffect(()=>{alive.current=true;void run(async signal=>{let saved:FollowCheckpoint|null;try{saved=followCheckpoint(userId,sellerId);}catch{if(current(signal))setPhase('BROKEN');return;}if(current(signal)){setCheckpoint(saved);setPhase(saved?'UNKNOWN':'LOADING');}try{await load(signal);if(current(signal))setPhase(saved?'UNKNOWN':'READY');}catch{if(current(signal))setPhase(saved?'UNKNOWN':'ERROR');throw Error('FOLLOW_LOAD_FAILED');}});return()=>{alive.current=false;busy.current=false;for(const c of controllers.current)c.abort();};},[]);
 async function post(saved:FollowCheckpoint,signal:AbortSignal){
  const body={idempotencyKey:saved.idempotencyKey,expectedRevision:saved.expectedRevision,following:saved.following,notifyNewDeals:saved.notifyNewDeals,notifyDealUpdates:saved.notifyDealUpdates};
  try{const f=followCommand(await followRequest('/'+encodeURIComponent(sellerId),token,signal,body),saved);if(!current(signal))return;clearFollowCheckpoint(userId,sellerId,saved.idempotencyKey);apply(f);setCheckpoint(null);setPhase('READY');setConfirmed(true);onSaved?.();}catch{if(current(signal)){setPhase('UNKNOWN');setError(true);}}
 }
 function save(){if(!status||phase!=='READY')return;setConfirmed(false);void run(async signal=>{const saved:FollowCheckpoint={version:1,origin:location.origin,userId,sellerId,idempotencyKey:crypto.randomUUID(),expectedRevision:status.revision,...form};saveFollowCheckpoint(saved);if(!current(signal))return;setCheckpoint(saved);setPhase('UNKNOWN');await post(saved,signal);});}
 function recover(){if(!checkpoint)return;setConfirmed(false);void run(async signal=>{try{const f=followCommand(await followRequest('/'+encodeURIComponent(sellerId)+'/commands/'+checkpoint.idempotencyKey,token,signal),checkpoint);if(!current(signal))return;clearFollowCheckpoint(userId,sellerId,checkpoint.idempotencyKey);apply(f);setCheckpoint(null);setPhase('READY');setConfirmed(true);onSaved?.();}catch(e){if(current(signal)){setPhase(e instanceof FollowRequestError&&e.status===404?'MISSING':'UNKNOWN');setError(true);}}});}
 function reload(){setConfirmed(false);void run(async signal=>{await load(signal);if(current(signal))setPhase('READY');});}
 const dirty=!!status&&(['following','notifyNewDeals','notifyDealUpdates'] as const).some(k=>form[k]!==status[k]);
 return <section className="seller-follow-control" aria-label={text('Theo dõi seller','Follow seller')} aria-busy={pending}>
  <h3>{text('Theo dõi seller','Follow seller')}</h3><p className="muted">{text('Chọn thông báo trong ứng dụng cho các sự kiện công khai mới từ lúc bật.','Choose in-app notices for new public events from the time you enable them.')}</p>
  <fieldset disabled={pending||phase!=='READY'||!status}>
   <legend className="sr-only">{text('Tùy chọn theo dõi seller','Seller follow preferences')}</legend>
   <label><input type="checkbox" checked={form.following} disabled={!status?.available&&!form.following} onChange={e=>{setConfirmed(false);setForm(e.target.checked?{following:true,notifyNewDeals:true,notifyDealUpdates:true}:{following:false,notifyNewDeals:false,notifyDealUpdates:false});}}/>{text('Theo dõi người bán này','Follow this seller')}</label>
   <label><input type="checkbox" checked={form.notifyNewDeals} disabled={!form.following} onChange={e=>{setConfirmed(false);setForm(f=>({...f,notifyNewDeals:e.target.checked}));}}/>{text('Deal công khai mới','New public deals')}</label>
   <label><input type="checkbox" checked={form.notifyDealUpdates} disabled={!form.following} onChange={e=>{setConfirmed(false);setForm(f=>({...f,notifyDealUpdates:e.target.checked}));}}/>{text('Mốc giá, điều khoản và trạng thái deal','Deal price tiers, terms and status')}</label>
  </fieldset>
  {status&&!status.available&&<p className="notice">{text('Seller hiện không có deal công khai khả dụng. Bạn vẫn có thể bỏ theo dõi.','This seller has no available public deal. You can still unfollow.')}</p>}
  {status&&!status.inAppEnabled&&<p className="notice">{text('Thông báo trong ứng dụng đang tắt. Bật trong Tùy chọn thông báo ở tài khoản để nhận tin.','In-app notifications are off. Enable them in account Notification preferences to receive notices.')}</p>}
  {pending&&<p role="status">{text('Đang kiểm tra hoặc lưu theo dõi…','Checking or saving follow preferences…')}</p>}
  {confirmed&&<p role="status">{text('Máy chủ đã xác nhận yêu cầu. Đang hiển thị tùy chọn mới nhất.','The server confirmed the request. Showing the latest preferences.')}</p>}
  {(phase==='UNKNOWN'||phase==='MISSING')&&<p role="alert">{phase==='MISSING'?text('Máy chủ chưa có xác nhận cho yêu cầu này. Có thể gửi lại đúng yêu cầu đã lưu.','The server has no acknowledgement for this request. You can retry the exact saved request.'):text('Chưa xác nhận yêu cầu đã lưu. Kiểm tra đúng yêu cầu trước khi sửa tiếp.','The saved request is unconfirmed. Check that request before editing further.')}</p>}
  {phase==='BROKEN'&&<p role="alert">{text('Không đọc được bản lưu yêu cầu trong tab này. Xóa bản lưu lỗi rồi tải trạng thái từ máy chủ để tiếp tục.','The saved request in this tab cannot be read. Clear it and load the server state to continue.')}</p>}
  {error&&phase!=='UNKNOWN'&&phase!=='MISSING'&&phase!=='BROKEN'&&<p role="alert">{text('Chưa tải hoặc lưu được tùy chọn. Thử tải lại.','Could not load or save preferences. Try reloading.')}</p>}
  <div className="action-row">
   {phase==='READY'&&<button type="button" className="btn btn-sm btn-primary" disabled={pending||!dirty} onClick={save}>{text('Lưu theo dõi','Save follow preferences')}</button>}
   {(phase==='READY'||phase==='ERROR')&&<button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={reload}>{text('Tải lại theo dõi','Reload follow preferences')}</button>}
   {checkpoint&&(phase==='UNKNOWN'||phase==='MISSING')&&<button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={recover}>{text('Kiểm tra yêu cầu theo dõi','Check follow request')}</button>}
   {checkpoint&&phase==='MISSING'&&<><button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={()=>void run(signal=>post(checkpoint,signal))}>{text('Gửi lại đúng yêu cầu','Retry exact request')}</button><button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void run(async signal=>{await load(signal);if(!current(signal))return;clearFollowCheckpoint(userId,sellerId,checkpoint.idempotencyKey);setCheckpoint(null);setPhase('READY');})}>{text('Đọc trạng thái và sửa lại','Load current state and edit')}</button></>}
   {phase==='BROKEN'&&<button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void run(async signal=>{clearFollowCheckpoint(userId,sellerId);await load(signal);if(current(signal))setPhase('READY');})}>{text('Xóa bản lưu lỗi và tải lại','Clear unreadable request and reload')}</button>}
  </div>
 </section>;
}
