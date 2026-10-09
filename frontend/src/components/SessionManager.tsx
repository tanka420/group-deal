import React,{useEffect,useRef,useState} from "react";
import {useAuth} from "../context/AuthContext";
import {useLanguage} from "../context/LanguageContext";
import {AppSession,SessionIntent,SessionScope,readSessionPage,readSessionAck} from "../services/appSession";

export function SessionManager({token,userId}:{token:string;userId:string}){
 const {language}=useLanguage(),en=language==="en",{endConfirmedSession}=useAuth();
 const [open,setOpen]=useState(false),[rows,setRows]=useState<AppSession[]>([]),[cursor,setCursor]=useState<string|null>(null),[currentId,setCurrentId]=useState<string|null>(null),[legacy,setLegacy]=useState(false);
 const [pending,setPending]=useState(false),[error,setError]=useState(false),[message,setMessage]=useState<string|null>(null),[intent,setIntent]=useState<SessionIntent|null>(null),[unknown,setUnknown]=useState(false);
 const epoch=useRef(0),controller=useRef<AbortController|null>(null),locked=useRef(false),statusRef=useRef<HTMLParagraphElement>(null);
 const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
 const alive=(generation:number)=>generation===epoch.current;
 useEffect(()=>{epoch.current++;locked.current=false;setPending(false);return()=>{epoch.current++;controller.current?.abort();};},[token,userId,open]);
 useEffect(()=>{if(open)void load();},[open,token,userId]);
 useEffect(()=>{if(message||error)statusRef.current?.focus();},[message,error]);
 async function load(more=false){
  if(locked.current)return;locked.current=true;controller.current?.abort();const abort=new AbortController();controller.current=abort;const generation=epoch.current;setPending(true);setError(false);
  try{const response=await fetch("/api/auth/sessions?limit=20"+(more&&cursor?"&cursor="+encodeURIComponent(cursor):""),{headers,cache:"no-store",signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10_000)])});if(!response.ok)throw new Error();const page=readSessionPage(await response.json(),userId);if(!alive(generation))return;
   setRows(previous=>{const combined=more?[...previous,...page.sessions]:page.sessions;return Array.from(new Map(combined.map(r=>[r.id,r])).values());});setCursor(page.cursor);setCurrentId(page.currentSessionId);setLegacy(page.legacyUnlisted);
  }catch{if(alive(generation)&&!abort.signal.aborted)setError(true);}finally{if(alive(generation)){setPending(false);locked.current=false;}}
 }
 function select(scope:SessionScope,targetId?:string){setIntent({scope,targetId,requestId:crypto.randomUUID()});setUnknown(false);setMessage(null);setError(false);}
 async function execute(recover=false){
  if(!intent||locked.current)return;locked.current=true;const generation=epoch.current,selected=intent;let confirmed=false;setPending(true);setError(false);setMessage(null);
  try{const endpoint=recover?"/api/auth/session-actions/"+selected.requestId:selected.scope==="ONE"?"/api/auth/sessions/"+selected.targetId+"/revoke":selected.scope==="ALL"?"/api/auth/sessions/revoke-all":"/api/auth/sessions/revoke-others";
   const response=await fetch(endpoint,{method:recover?"GET":"POST",headers,cache:"no-store",...(recover?{}:{body:JSON.stringify({idempotencyKey:selected.requestId})}),signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error();const ack=readSessionAck(await response.json(),userId,selected);if(selected.scope==="ONE"&&ack.currentRevoked!==(selected.targetId===currentId))throw new Error();if(!alive(generation))return;
   if(ack.currentRevoked){endConfirmedSession();return;}confirmed=true;setMessage(en?"Session revocation confirmed by the server.":"Máy chủ đã xác nhận thu hồi phiên.");setIntent(null);setUnknown(false);
  }catch{if(alive(generation)){setUnknown(true);setError(true);}}
  finally{if(alive(generation)){locked.current=false;setPending(false);}}
  if(alive(generation)&&confirmed)void load();
 }
 const date=(value:number)=>new Intl.DateTimeFormat(en?"en-US":"vi-VN",{dateStyle:"short",timeStyle:"short"}).format(value);
 const busy=pending||!!intent;
 return <section className="session-manager">
  <button type="button" className="btn btn-sm btn-secondary" aria-expanded={open} aria-controls="owned-session-list" onClick={()=>{setOpen(v=>!v);setRows([]);setCursor(null);setIntent(null);setError(false);setUnknown(false);setMessage(null);}}>{en?"Manage sign-in sessions":"Quản lý phiên đăng nhập"}</button>
  {open&&<div id="owned-session-list" role="region" aria-label={en?"Your sign-in sessions":"Phiên đăng nhập của bạn"}>
   <p>{en?"Sign-in sessions expire after 30 minutes without interaction, or after 7 days. Revocation does not change wallets or order rights.":"Phiên đăng nhập hết hạn sau 30 phút không tương tác, hoặc sau 7 ngày. Thu hồi phiên không thay đổi ví hay quyền của đơn hàng."}</p>
   {legacy&&<p>{en?"Older tokens appear after first use; copies of one token share a session. Revoke all sessions to invalidate unseen older tokens.":"Token cũ xuất hiện sau lần sử dụng đầu tiên; các bản sao một token dùng chung phiên. Thu hồi tất cả để vô hiệu hóa cả token cũ chưa xuất hiện."}</p>}
   <div className="session-manager-actions"><button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load()}>{en?"Reload sessions":"Tải lại danh sách phiên"}</button><button className="btn btn-sm btn-secondary" disabled={busy||!currentId} onClick={()=>select("OTHERS")}>{en?"Revoke other sessions":"Thu hồi các phiên khác"}</button><button className="btn btn-sm btn-secondary" disabled={busy||!currentId} onClick={()=>select("ALL")}>{en?"Revoke all sessions":"Thu hồi tất cả phiên"}</button></div>
   {pending&&!message&&!error&&<p role="status">{en?"Checking with the server…":"Đang kiểm tra với máy chủ…"}</p>}
   {(error||message)&&<p ref={statusRef} tabIndex={-1} role={error?"alert":"status"}>{error?(unknown?(en?"No matching confirmation received. Check this request before taking another action.":"Chưa nhận được xác nhận khớp yêu cầu. Kiểm tra yêu cầu này trước khi thao tác tiếp."):(en?"Unable to load sessions. Retry when connected.":"Không tải được danh sách phiên. Thử lại khi có kết nối.")):message}</p>}
   {intent&&<div className="session-review" role="group" aria-label={en?"Review session revocation":"Xem lại yêu cầu thu hồi phiên"}>
    <p>{intent.scope==="ALL"?(en?"Revoke every session, including this one? You will sign in again.":"Thu hồi mọi phiên, gồm phiên đang dùng? Bạn cần đăng nhập lại."):intent.scope==="OTHERS"?(en?"Revoke the other sessions and keep this session?":"Thu hồi các phiên khác và giữ phiên đang dùng?"):(en?"Revoke the selected session?":"Thu hồi phiên đã chọn?")}</p>
    {intent.targetId&&<code>{intent.targetId}</code>}
    {!unknown?<><button className="btn btn-sm btn-primary" disabled={pending} onClick={()=>void execute()}>{en?"Confirm revocation":"Xác nhận thu hồi"}</button><button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>setIntent(null)}>{en?"Cancel":"Hủy"}</button></>:<button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void execute(true)}>{en?"Check this request":"Kiểm tra yêu cầu này"}</button>}
   </div>}
   <ul className="owned-session-rows">{rows.map(row=><li key={row.id}><strong>{row.current?(en?"Current session":"Phiên đang dùng"):(en?"Sign-in session":"Phiên đăng nhập")}</strong><code>{row.id}</code><span>{row.kind==="LEGACY"?(en?"Older token":"Token cũ"):row.loginMethod==="CIRCLE_EMAIL"?"Circle Email":row.loginMethod==="EVM_WALLET"?"EVM Wallet":(en?"Unknown sign-in method":"Chưa rõ cách đăng nhập")}</span><span>{en?"Created":"Tạo lúc"}: {date(row.createdAt)}</span><span>{en?"Idle deadline":"Hạn không tương tác"}: {date(row.idleExpiresAt)}</span><span>{en?"Absolute deadline":"Hạn tối đa"}: {date(row.expiresAt)}</span><span>{row.state==="ACTIVE"?(en?"Active":"Đang hoạt động"):row.state==="REVOKED"?(en?"Revoked":"Đã thu hồi"):(en?"Expired":"Đã hết hạn")}</span>{row.state==="ACTIVE"&&<button className="btn btn-sm btn-secondary" disabled={busy} onClick={()=>select("ONE",row.id)}>{en?"Revoke this session":"Thu hồi phiên này"}</button>}</li>)}</ul>
   {cursor&&<button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load(true)}>{en?"More sessions":"Xem thêm phiên"}</button>}
  </div>}
 </section>;
}
