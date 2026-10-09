import React,{useEffect,useRef,useState} from 'react';
import {useLanguage} from '../context/LanguageContext';

type Review={id:string;subscriptionId:string;phase:'PREPARED'|'VERIFYING'|'VERIFIED'|'FAILED'|'CANCELLED'|'INVALIDATED'|'EXPIRED';expiresAt:number;attempts:number;canVerify:boolean;scope:'NEW_EVENTS_ONLY'};
function readReview(value:any,subscriptionId:string):Review|null{
 if(value===null)return null;
 if(!value||!/^whr_[a-f0-9-]{36}$/.test(value.id)||value.subscriptionId!==subscriptionId||!['PREPARED','VERIFYING','VERIFIED','FAILED','CANCELLED','INVALIDATED','EXPIRED'].includes(value.phase)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<0||!Number.isSafeInteger(value.attempts)||value.attempts<0||value.attempts>3||typeof value.canVerify!=='boolean'||value.scope!=='NEW_EVENTS_ONLY')throw Error();
 return {id:value.id,subscriptionId,phase:value.phase,expiresAt:value.expiresAt,attempts:value.attempts,canVerify:value.canVerify,scope:value.scope};
}
export function WebhookRecoveryReview({userId,token,subscriptionId,onVerified}:{userId:string;token:string;subscriptionId:string;onVerified:(signal:AbortSignal)=>Promise<void>}){
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [review,setReview]=useState<Review|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const request=useRef<AbortController|null>(null),generation=useRef(0),callback=useRef(onVerified);callback.current=onVerified;
 const commandKey='groupdeal_webhook_review:'+userId+':'+subscriptionId;
 const pendingKey=useRef<string|null>(null);
 useEffect(()=>{
  const epoch=++generation.current;request.current?.abort();request.current=null;setReview(null);setFailed(false);setBusy(false);setLoading(true);pendingKey.current=null;
  try{const saved=sessionStorage.getItem(commandKey);if(saved&&/^[a-f0-9-]{36}$/.test(saved))pendingKey.current=saved;}catch{/* An in-memory command remains stable if session storage is unavailable. */}
  const controller=new AbortController();request.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
  fetch('/api/seller/webhooks/recovery-reviews',{signal:controller.signal,headers:{Authorization:'Bearer '+token}}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();const parsed=readReview(data.review,subscriptionId);if(typeof data.enabledForNewEvents!=='boolean'||parsed?.phase==='VERIFIED'&&!data.enabledForNewEvents)throw Error();if(epoch!==generation.current||controller.signal.aborted)return;setReview(parsed);if(parsed?.phase==='VERIFIED')await callback.current(controller.signal);}).catch(()=>{if(epoch===generation.current)setFailed(true);}).finally(()=>{clearTimeout(timer);if(epoch===generation.current&&request.current===controller){request.current=null;setLoading(false);}});
  return()=>{generation.current++;controller.abort();request.current?.abort();request.current=null;};
 },[userId,token,subscriptionId,commandKey]);
 async function act(action:'PREPARE'|'VERIFY'|'STATUS'){
  if(request.current)return;const epoch=generation.current,controller=new AbortController();request.current=controller;const timer=setTimeout(()=>controller.abort(),15000);setBusy(true);setFailed(false);
  try{
   let path='/api/seller/webhooks/recovery-reviews',body:any;
   if(action==='PREPARE'){
    pendingKey.current??=crypto.randomUUID();try{sessionStorage.setItem(commandKey,pendingKey.current);}catch{}
    body={idempotencyKey:pendingKey.current};
   }else if(action==='VERIFY'){if(!review?.canVerify)throw Error();path+='/'+review.id+'/verify';body={};}
   const r=await fetch(path,{signal:controller.signal,method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!r.ok)throw Error();const data=await r.json(),parsed=readReview(data.review,subscriptionId);if(!parsed&&action!=='STATUS')throw Error();if(action==='STATUS'&&(typeof data.enabledForNewEvents!=='boolean'||parsed?.phase==='VERIFIED'&&!data.enabledForNewEvents))throw Error();
   if(epoch!==generation.current||controller.signal.aborted)return;setReview(parsed);
   if(action==='PREPARE'){pendingKey.current=null;try{sessionStorage.removeItem(commandKey);}catch{}}
   if(parsed?.phase==='VERIFIED')await callback.current(controller.signal);
  }catch{if(epoch===generation.current)setFailed(true);}
  finally{clearTimeout(timer);if(epoch===generation.current&&request.current===controller){request.current=null;setBusy(false);}}
 }
 const phase=review&&review.phase!=='VERIFIED'&&Date.now()>=review.expiresAt?'EXPIRED':review?.phase;
 const labels={PREPARED:text('Đã chuẩn bị, chưa gửi yêu cầu','Prepared; no request sent'),VERIFYING:text('Đang xác minh endpoint','Endpoint verification in progress'),VERIFIED:text('Đã xác minh cho sự kiện mới','Verified for new events'),FAILED:text('Endpoint chưa được xác minh','Endpoint not verified'),CANCELLED:text('Lượt rà soát đã được thay thế','Review superseded'),INVALIDATED:text('Cấu hình hoặc bối cảnh đã thay đổi','Configuration or context changed'),EXPIRED:text('Lượt rà soát đã hết hạn','Review expired')};
 return <section className="panel-soft" aria-label={text('Xác minh webhook sau phục hồi','Webhook recovery verification')} style={{padding:'1rem',marginBottom:'1rem'}}>
  <h4>{text('Xác minh endpoint để nhận sự kiện mới','Verify endpoint for new events')}</h4>
  <p>{text('Cài receiver có đúng subscription ID và secret hiện có. Chuẩn bị không gửi yêu cầu; khi chọn xác minh, hệ thống gửi challenge có chữ ký tới endpoint đã lưu. Không nhập secret vào lượt rà soát.','Install a receiver with the existing subscription ID and secret. Preparing sends no request; verification sends a signed challenge to the saved endpoint. Do not enter the secret into this review.')}</p>
  <p>{text('Chỉ job mới được mở sau xác minh. Job lịch sử vẫn chờ rà soát riêng.','Only new jobs are enabled after verification. Historical jobs still require separate review.')}</p>
  <p role="status">{loading?text('Đang tải trạng thái rà soát…','Loading review status…'):phase?labels[phase]:text('Chưa có lượt rà soát.','No review prepared.')}</p>
  {failed&&<p role="alert">{text('Chưa xác nhận được kết quả. Tải lại trạng thái trước khi thử lại; kiểm tra phiên đăng nhập và cấu hình receiver.','Could not confirm the result. Refresh status before retrying; check your session and receiver setup.')}</p>}
  <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem'}}>
   {!loading&&(!review||['CANCELLED','INVALIDATED','EXPIRED'].includes(phase??'')||!review.canVerify&&phase!=='VERIFYING'&&phase!=='VERIFIED')&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>{if(review){pendingKey.current=null;try{sessionStorage.removeItem(commandKey);}catch{}}void act('PREPARE');}}>{text('Chuẩn bị lượt rà soát','Prepare review')}</button>}
   {!loading&&!review&&failed&&pendingKey.current&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void act('PREPARE')}>{text('Khôi phục yêu cầu chuẩn bị','Recover preparation request')}</button>}
   {!loading&&review?.canVerify&&phase!=='EXPIRED'&&<button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void act('VERIFY')}>{text('Xác minh endpoint đã lưu','Verify saved endpoint')}</button>}
   <button type="button" className="btn btn-secondary" disabled={loading||busy} onClick={()=>void act('STATUS')}>{text('Tải lại trạng thái','Refresh status')}</button>
  </div>
 </section>;
}
