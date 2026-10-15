import {useEffect,useRef,useState} from 'react';
import {MessageSquare} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {DialogSurface} from './DialogSurface';
import {OrderReference} from './OrderReference';
import {formatOrderDate,orderTimestamp} from '../services/orderList';
type Message={id:string;orderId:string;senderRole:'buyer'|'seller'|'operator';text:string;timestamp:number};
function readMessage(v:any,id:string):Message{if(!v||typeof v.id!=='string'||v.id.length>80||v.orderId!==id||!['buyer','seller','operator'].includes(v.senderRole)||typeof v.text!=='string'||v.text.length>4500||orderTimestamp(v.timestamp)===null)throw Error('MESSAGE_INVALID');return{id:v.id,orderId:id,senderRole:v.senderRole,text:v.text,timestamp:v.timestamp};}

/** Uses the existing order-party ACL; distinct from an admin support ticket. */
export function OrderConversation({orderId}:{orderId:string}){
 const {user,token,getSessionEpoch}=useAuth(),{language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Message[]>([]),[draft,setDraft]=useState(''),[pending,setPending]=useState(false),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[uncertain,setUncertain]=useState(false),[storageError,setStorageError]=useState(false),[limit,setLimit]=useState(50);
 const busy=useRef(false),controllers=useRef(new Set<AbortController>()),scope=useRef({token,id:user?.id,orderId});scope.current={token,id:user?.id,orderId};
 const key='groupdeal_order_message_pending_v1:'+user?.id+':'+orderId;
 useEffect(()=>{setOpen(false);setRows([]);setDraft('');setLoaded(false);setFailed(false);setPending(false);busy.current=false;setStorageError(false);try{setUncertain(sessionStorage.getItem(key)==='1');}catch{setStorageError(true);}return()=>{for(const c of controllers.current)c.abort();controllers.current.clear();};},[token,user?.id,orderId]);
 const request=async(method:'GET'|'POST')=>{
  if(!token||!user?.id||busy.current||method==='POST'&&(!loaded||uncertain||storageError||!draft.trim()||draft.length>4000))return;
  const owner={token,id:user.id,orderId},epoch=getSessionEpoch(),current=()=>scope.current.token===owner.token&&scope.current.id===owner.id&&scope.current.orderId===owner.orderId&&getSessionEpoch()===epoch;
  if(method==='POST'){try{sessionStorage.setItem(key,'1');}catch{setStorageError(true);return;}}
  busy.current=true;setPending(true);setFailed(false);const controller=new AbortController();controllers.current.add(controller);const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch('/api/orders/'+encodeURIComponent(orderId)+'/messages',{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({text:draft.trim()})}:{}),signal:controller.signal,cache:'no-store',redirect:'error'}),value=await response.json();if(!response.ok)throw Error('MESSAGE_UNAVAILABLE');if(!current()||controller.signal.aborted)return;
   if(method==='GET'){if(!Array.isArray(value.messages))throw Error('MESSAGES_INVALID');const messages=value.messages.map((m:any)=>readMessage(m,orderId));if(new Set(messages.map((m:Message)=>m.id)).size!==messages.length)throw Error('MESSAGES_DUPLICATE');setRows(messages.sort((a:Message,b:Message)=>a.timestamp-b.timestamp));setLoaded(true);}
   else{if(value.success!==true)throw Error('MESSAGE_UNCONFIRMED');const message=readMessage(value.message,orderId);setRows(v=>v.some(m=>m.id===message.id)?v:[...v,message]);setDraft('');setUncertain(false);try{sessionStorage.removeItem(key);}catch{setStorageError(true);}}
  }catch{if(current()){setFailed(true);if(method==='POST')setUncertain(true);setLoaded(false);}}
  finally{clearTimeout(timer);controllers.current.delete(controller);if(current()){busy.current=false;setPending(false);}}
 };
 const reviewed=()=>{try{sessionStorage.removeItem(key);setUncertain(false);setDraft('');setFailed(false);}catch{setStorageError(true);}};
 return <div className="order-conversation"><button className="btn btn-secondary" onClick={()=>{setOpen(true);if(!loaded)void request('GET');}}><MessageSquare size={16} aria-hidden="true"/>{text('Trao đổi với người mua/người bán','Buyer–seller conversation')}</button>
  {open&&<DialogSurface label={text('Trao đổi theo đơn','Order conversation')} onClose={()=>setOpen(false)}><div className="order-conversation"><h2>{text('Trao đổi theo đơn','Order conversation')}</h2><OrderReference id={orderId}/><p className="muted">{text('Nội dung dành cho các bên của đơn và quản trị viên có quyền. Ticket hỗ trợ là mục riêng; trao đổi không mở tranh chấp hoặc tự hoàn tiền.','Visible to the order parties and authorized administrators. Support tickets are separate; messages do not open a dispute or refund funds.')}</p>
   {pending&&<p role="status">{text('Đang xử lý…','Processing…')}</p>}{failed&&!uncertain&&<p role="alert">{text('Chưa tải được trao đổi. Kiểm tra kết nối và thử lại.','The conversation could not be loaded. Check your connection and retry.')}</p>}
   {storageError&&<p role="alert">{text('Chưa lưu được trạng thái gửi. Kiểm tra quyền bộ nhớ trình duyệt trước khi gửi tin.','Send state could not be stored. Check browser storage access before sending.')}</p>}
   {uncertain&&<p role="alert">{text('Chưa rõ tin nhắn trước đã được nhận hay chưa. Tải lại và kiểm tra lịch sử trước khi soạn tin tiếp; hệ thống không tự gửi lại.','The previous message acknowledgement is uncertain. Reload and review the history before composing again; the message will not be resent automatically.')}</p>}
   <div className="order-conversation-actions"><button className="btn btn-secondary" disabled={pending} onClick={()=>void request('GET')}>{text('Tải lại trao đổi','Reload conversation')}</button>{uncertain&&loaded&&<button className="btn btn-secondary" disabled={pending} onClick={reviewed}>{text('Đã kiểm tra lịch sử, soạn tin mới','History reviewed, compose a new message')}</button>}</div>
   {loaded&&!rows.length&&<p>{text('Chưa có tin nhắn trong đơn này.','There are no messages in this order yet.')}</p>}
   {rows.length>limit&&<button className="btn btn-ghost" onClick={()=>setLimit(v=>v+50)}>{text('Xem tin cũ hơn','Show earlier messages')}</button>}
   <ol>{rows.slice(-limit).map(m=><li key={m.id}><strong>{m.senderRole==='buyer'?text('Người mua','Buyer'):m.senderRole==='seller'?text('Người bán','Seller'):text('Quản trị viên','Administrator')}</strong><time dateTime={new Date(m.timestamp).toISOString()}>{formatOrderDate(m.timestamp,language)}</time><p>{m.text}</p></li>)}</ol>
   <form onSubmit={e=>{e.preventDefault();void request('POST');}}><label htmlFor={'order-message-'+orderId}>{text('Tin nhắn theo đơn','Order message')}</label><textarea id={'order-message-'+orderId} maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)} disabled={pending||uncertain||storageError} required/><p className="muted">{text('Bản nháp được giữ khi đóng cửa sổ trong trang này.','Your draft is kept when closing this dialog on this page.')}</p><button type="submit" className="btn btn-primary" disabled={pending||!loaded||uncertain||storageError||!draft.trim()}>{text('Gửi tin nhắn','Send message')}</button></form>
  </div></DialogSurface>}
 </div>;
}
