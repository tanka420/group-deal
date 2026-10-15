import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {DialogSurface} from './DialogSurface';
import {OrderReference} from './OrderReference';
type Review={score:number;comment:string;sellerResponse?:string};
function review(v:any):Review|null{return v&&Number.isInteger(v.score)&&v.score>=1&&v.score<=5&&typeof v.comment==='string'&&v.comment.length<=4000&&(v.sellerResponse===undefined||typeof v.sellerResponse==='string'&&v.sellerResponse.length<=4000)?{score:v.score,comment:v.comment,sellerResponse:v.sellerResponse}:null;}
export function SellerOrderReview({order}:{order:any}){
 const {user,token,getSessionEpoch}=useAuth(),{language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [shown,setShown]=useState(()=>review(order.review)),[open,setOpen]=useState(false),[draft,setDraft]=useState(order.review?.sellerResponse??''),[pending,setPending]=useState(false),[failed,setFailed]=useState(false),[uncertain,setUncertain]=useState(false),[storageFailed,setStorageFailed]=useState(false),[readAfterFailure,setReadAfterFailure]=useState(false);
 const controller=useRef<AbortController|null>(null),scope=useRef({token,userId:user?.id,id:order.id});scope.current={token,userId:user?.id,id:order.id};
 const key='groupdeal_seller_review_pending_v1:'+user?.id+':'+order.id;
 useEffect(()=>{setShown(review(order.review));setOpen(false);setDraft(typeof order.review?.sellerResponse==='string'?order.review.sellerResponse:'');setPending(false);setFailed(false);setReadAfterFailure(false);try{setUncertain(sessionStorage.getItem(key)==='1');setStorageFailed(false);}catch{setStorageFailed(true);}return()=>{controller.current?.abort();controller.current=null;};},[token,user?.id,order.id]);
 const request=async(save:boolean)=>{
  if(!token||!user?.id||controller.current||save&&(!draft.trim()||draft.length>4000||uncertain||storageFailed))return;
  const owner={token,userId:user.id,id:order.id},epoch=getSessionEpoch(),c=new AbortController();controller.current=c;const current=()=>controller.current===c&&scope.current.token===owner.token&&scope.current.userId===owner.userId&&scope.current.id===owner.id&&getSessionEpoch()===epoch,timer=setTimeout(()=>c.abort(),15000);
  if(save)try{sessionStorage.setItem(key,'1');}catch{setStorageFailed(true);controller.current=null;clearTimeout(timer);return;}
  setPending(true);setFailed(false);
  try{
   const r=await fetch(save?'/api/seller/orders/'+encodeURIComponent(order.id)+'/reply-review':'/api/seller/orders',{method:save?'POST':'GET',signal:c.signal,cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,...(save?{'Content-Type':'application/json'}:{})},...(save?{body:JSON.stringify({sellerResponse:draft.trim()})}:{})}),v=await r.json();if(!r.ok)throw Error();if(!current()||c.signal.aborted)return;
   const own=save?v.order:Array.isArray(v.orders)&&v.sellerAccountId===user.id?v.orders.find((o:any)=>o?.id===order.id):null,found=review(own?.review);
   if(!own||own.id!==order.id||!found||save&&(v.success!==true||found.sellerResponse!==draft.trim()))throw Error();
   setShown(found);if(save){sessionStorage.removeItem(key);setUncertain(false);setOpen(false);}else setReadAfterFailure(true);
  }catch{if(current()){setFailed(true);if(save){setUncertain(true);setReadAfterFailure(false);}}}
  finally{clearTimeout(timer);if(current()){controller.current=null;setPending(false);}}
 };
 const resume=()=>{try{sessionStorage.removeItem(key);setUncertain(false);setDraft(shown?.sellerResponse??'');setFailed(false);setReadAfterFailure(false);}catch{setStorageFailed(true);}};
 if(!shown)return null;
 return <section className="order-review seller-review" aria-label={text('Đánh giá của người mua','Buyer review')}><h3>{text('Đánh giá của người mua','Buyer review')} · {shown.score}/5</h3><p>{shown.comment}</p>{shown.sellerResponse&&<><strong>{text('Phản hồi của bạn','Your response')}</strong><p>{shown.sellerResponse}</p></>}<button className="btn btn-secondary" onClick={()=>setOpen(true)}>{text('Phản hồi đánh giá','Reply to review')}</button>
 {open&&<DialogSurface label={text('Phản hồi đánh giá','Reply to review')} onClose={()=>setOpen(false)}><h2>{text('Phản hồi đánh giá','Reply to review')}</h2><OrderReference id={order.id}/><p>{shown.comment}</p>
 {pending&&<p role="status">{text('Đang xử lý…','Processing…')}</p>}{failed&&!uncertain&&<p role="alert">{text('Chưa tải được đánh giá. Thử đọc lại khi kết nối ổn định.','The review could not be loaded. Retry when connected.')}</p>}
 {uncertain&&<p role="alert">{text('Chưa rõ phản hồi trước đã lưu chưa. Đọc lại đánh giá trước khi sửa hoặc gửi tiếp.','The previous response acknowledgement is uncertain. Reload the review before editing or sending again.')}</p>}{storageFailed&&<p role="alert">{text('Chưa lưu được trạng thái gửi trong trình duyệt.','The send state could not be stored in the browser.')}</p>}
 <div className="seller-review-actions"><button className="btn btn-secondary" disabled={pending} onClick={()=>void request(false)}>{text('Đọc lại đánh giá','Reload review')}</button>{uncertain&&readAfterFailure&&<button className="btn btn-secondary" disabled={pending} onClick={resume}>{text('Đã kiểm tra, tiếp tục sửa','Reviewed, continue editing')}</button>}</div>
 <form onSubmit={e=>{e.preventDefault();void request(true);}}><label htmlFor={'seller-review-'+order.id}>{text('Nội dung phản hồi','Review response')}</label><textarea id={'seller-review-'+order.id} value={draft} maxLength={4000} required disabled={pending||uncertain||storageFailed} onChange={e=>setDraft(e.target.value)}/><p className="muted">{text('Phản hồi sẽ hiển thị với đánh giá của đơn. Đóng cửa sổ giữ bản nháp trong trang này.','Your response will appear with this order review. Closing this dialog keeps the draft on this page.')}</p><button className="btn btn-primary" disabled={pending||uncertain||storageFailed||!draft.trim()}>{text('Lưu phản hồi','Save response')}</button></form>
 </DialogSurface>}</section>;
}
