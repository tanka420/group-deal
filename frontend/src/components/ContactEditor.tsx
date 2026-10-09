import React,{useEffect,useId,useRef,useState} from "react";
import {useLanguage} from "../context/LanguageContext";

type ContactStatus="VERIFIED"|"UNVERIFIED"|"MISSING";
type Challenge={id:string;emailMasked:string|null;expiresAt:number;requestedAt:number;resendAfter:number;attemptsRemaining:number;state:"PENDING"|"VERIFIED"|"EXPIRED"|"LOCKED"|"CANCELLED";mailStatus:string};
type Contact={userId:string;status:ContactStatus;revision:number;emailMasked:string|null;verifiedAt:number|null;lastVerificationId:string|null;challenge:Challenge|null};
const idPattern=/^ctc_[a-f0-9-]{36}$/;
const states=["PENDING","VERIFIED","EXPIRED","LOCKED","CANCELLED"];
function parseContact(value:unknown,userId:string):Contact {
  const c=value as Contact;
  const nullableText=(v:unknown)=>v===null||typeof v==="string";
  const time=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
  if(!c||c.userId!==userId||!["VERIFIED","UNVERIFIED","MISSING"].includes(c.status)||!time(c.revision)
    ||!nullableText(c.emailMasked)||!(c.verifiedAt===null||time(c.verifiedAt))||!(c.lastVerificationId===null||typeof c.lastVerificationId==="string"&&idPattern.test(c.lastVerificationId))
    ||c.status==="VERIFIED"&&!c.emailMasked||c.status!=="VERIFIED"&&c.emailMasked!==null)throw new Error("CONTACT_INVALID_RESPONSE");
  const p=c.challenge;
  if(p!==null&&(!p||!idPattern.test(p.id)||!nullableText(p.emailMasked)||!time(p.expiresAt)||!time(p.requestedAt)||p.expiresAt<=p.requestedAt
    ||!time(p.resendAfter)||!Number.isInteger(p.attemptsRemaining)||p.attemptsRemaining<0||p.attemptsRemaining>5||!states.includes(p.state)
    ||!["QUEUED","PROCESSING","RETRY","SENT","CANCELLED","DLQ","UNVERIFIED"].includes(p.mailStatus)))throw new Error("CONTACT_INVALID_RESPONSE");
  return c;
}
class ContactRequestError extends Error {constructor(public code:string,public retryAfter=0){super(code);}}

export function ContactEditor({token,userId,onChange}:{token:string;userId:string;onChange:(status:ContactStatus)=>void}) {
  const {language}=useLanguage(),en=language==="en",id=useId();
  const [expanded,setExpanded]=useState(false),[contact,setContact]=useState<Contact|null>(null),[email,setEmail]=useState(""),[code,setCode]=useState("");
  const [pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),[confirmed,setConfirmed]=useState(false),[removing,setRemoving]=useState(false),[now,setNow]=useState(Date.now());
  const alive=useRef(false),generation=useRef(0),inFlight=useRef(false),controllers=useRef(new Set<AbortController>());
  const requestKey=useRef<{email:string;key:string}|null>(null),verificationIntent=useRef<string|null>(null),retryUntil=useRef(0);
  const notify=useRef(onChange);notify.current=onChange;
  const fetchContact=async(path="",init:RequestInit={}):Promise<Contact>=>{
    const controller=new AbortController();controllers.current.add(controller);const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch("/api/notifications/contact"+path,{...init,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},signal:controller.signal});
      if(!response.ok){
        let value:any;try{value=await response.json();}catch{}
        throw new ContactRequestError(typeof value?.error==="string"?value.error:"CONTACT_UNAVAILABLE",Math.max(0,Math.min(3600,Number(response.headers.get("Retry-After"))||0)));
      }
      const value=await response.json();return parseContact(value.contact,userId);
    }finally{clearTimeout(timeout);controllers.current.delete(controller);}
  };
  const run=async(action:()=>Promise<Contact>,accept?:(next:Contact)=>void)=>{
    if(inFlight.current)return;const current=++generation.current;inFlight.current=true;setPending(true);setError(null);setConfirmed(false);
    try{
      const next=await action();
      if(alive.current&&generation.current===current){accept?.(next);setContact(next);notify.current(next.status);}
    }catch(e){
      if(alive.current&&generation.current===current){
        setError(e instanceof ContactRequestError?e.code:"CONTACT_UNCONFIRMED");
        if(e instanceof ContactRequestError&&e.retryAfter){retryUntil.current=Date.now()+e.retryAfter*1000;setNow(Date.now());}
      }
    }finally{if(generation.current===current){inFlight.current=false;if(alive.current)setPending(false);}}
  };
  const load=()=>run(()=>fetchContact(),next=>{
    if(verificationIntent.current&&next.status==="VERIFIED"&&next.lastVerificationId===verificationIntent.current){setConfirmed(true);verificationIntent.current=null;}
  });
  useEffect(()=>{
    if(!expanded)return;
    alive.current=true;setContact(null);setCode("");setEmail("");requestKey.current=null;verificationIntent.current=null;retryUntil.current=0;setRemoving(false);void load();
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>{clearInterval(timer);alive.current=false;generation.current++;inFlight.current=false;for(const controller of controllers.current)controller.abort();requestKey.current=null;verificationIntent.current=null;};
  },[expanded,token,userId]);
  const request=async(event:React.FormEvent,resend=false)=>{
    event.preventDefault();if(!contact||inFlight.current)return;
    const target=email.trim().toLowerCase();
    if(!requestKey.current||requestKey.current.email!==target||resend)requestKey.current={email:target,key:crypto.randomUUID()};
    const intended={...requestKey.current};setCode("");verificationIntent.current=null;
    await run(async()=>{
      const next=await fetchContact("/request",{method:"POST",body:JSON.stringify({email:target,idempotencyKey:intended.key,language})});
      const masked=target.slice(0,1)+"***"+target.slice(target.lastIndexOf("@"));
      if(!next.challenge||next.challenge.state!=="PENDING"||next.challenge.emailMasked!==masked||next.revision!==contact.revision)throw new Error("CONTACT_INVALID_RESPONSE");
      return next;
    });
  };
  const verify=async(event:React.FormEvent)=>{
    event.preventDefault();const challenge=contact?.challenge;if(!contact||!challenge||inFlight.current)return;
    const intended=challenge.id,enteredCode=code,priorRevision=contact.revision;verificationIntent.current=intended;setCode("");
    await run(async()=>{
      const next=await fetchContact("/verify",{method:"POST",body:JSON.stringify({challengeId:intended,code:enteredCode})});
      if(next.status!=="VERIFIED"||next.emailMasked!==challenge.emailMasked||next.lastVerificationId!==intended||next.challenge?.id!==intended||next.challenge.state!=="VERIFIED"||next.revision!==priorRevision+1)throw new Error("CONTACT_INVALID_RESPONSE");
      return next;
    },()=>{setConfirmed(true);verificationIntent.current=null;});
  };
  const remove=()=>run(async()=>{
    const next=await fetchContact("",{method:"DELETE"});
    if(next.status!=="MISSING"||next.emailMasked!==null||next.revision!==(contact?.revision??0)+1)throw new Error("CONTACT_INVALID_RESPONSE");return next;
  },()=>{setRemoving(false);setCode("");setEmail("");requestKey.current=null;verificationIntent.current=null;});
  const errors:Record<string,[string,string]>={
    CONTACT_RATE_LIMIT:["Yêu cầu quá nhanh hoặc đã đạt giới hạn. Chờ rồi thử lại.","Too many requests. Wait before trying again."],
    CONTACT_EMAIL_UNAVAILABLE:["Dịch vụ email chưa sẵn sàng. Chưa tạo yêu cầu xác minh.","Email service is unavailable. No verification request was created."],
    CONTACT_CODE_INVALID:["Mã chưa đúng. Tải lại trạng thái để xem số lần thử còn lại.","Incorrect code. Reload the status to see the remaining attempts."],
    CONTACT_CHALLENGE_EXPIRED:["Mã đã hết hạn. Nhập lại email và yêu cầu mã mới.","The code expired. Enter your email and request a new code."],
    CONTACT_CHALLENGE_INACTIVE:["Yêu cầu đã hoàn tất, bị thay thế hoặc khóa. Tải lại trạng thái.","This request is complete, replaced or locked. Reload the status."],
  };
  const message=error?(errors[error]?.[en?1:0]??(en?"Could not confirm the change. Reload the contact status before retrying.":"Chưa xác nhận được thay đổi. Tải lại trạng thái liên hệ trước khi thử lại.")):null;
  const challenge=contact?.challenge,active=challenge?.state==="PENDING"&&challenge.expiresAt>now;
  const waitUntil=Math.max(retryUntil.current,challenge?.resendAfter??0),wait=Math.max(0,Math.ceil((waitUntil-now)/1000));
  return <section className="contact-editor">
    <button type="button" className="btn btn-sm btn-secondary" aria-expanded={expanded} aria-controls={id+"-panel"} onClick={()=>{setExpanded(value=>!value);setCode("");setEmail("");}}>{en?"Contact email":"Email liên hệ"}</button>
    {expanded&&<div id={id+"-panel"} role="region" aria-label={en?"Contact email settings":"Cài đặt email liên hệ"} aria-busy={pending}>
      <p className="contact-note">{en?"Use a verified email for order notifications. Your login, Circle account and wallet stay unchanged.":"Dùng email đã xác minh để nhận thông báo đơn hàng. Đăng nhập, tài khoản Circle và ví được giữ nguyên."}</p>
      {contact&&<p>{contact.status==="VERIFIED"?(en?"Verified contact: ":"Liên hệ đã xác minh: ")+(contact.emailMasked??""):(en?"No verified contact email.":"Chưa có email liên hệ đã xác minh.")}</p>}
      {pending&&<p role="status">{en?"Checking contact status…":"Đang kiểm tra trạng thái liên hệ…"}</p>}
      {confirmed&&<p role="status">{en?"Contact email verified.":"Đã xác minh email liên hệ."}</p>}
      {message&&<p role="alert">{message}</p>}
      {contact&&<>
        <form aria-label={en?"Request contact verification":"Yêu cầu xác minh liên hệ"} onSubmit={event=>void request(event)}>
          <label htmlFor={id+"-email"}>{en?"Contact email address":"Địa chỉ email liên hệ"}</label>
          <input id={id+"-email"} type="email" autoComplete="email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} disabled={pending}/>
          <button className="btn btn-sm btn-primary" type="submit" disabled={pending||!email.trim()||retryUntil.current>now}>{en?"Send verification code":"Gửi mã xác minh"}</button>
          {challenge&&<button className="btn btn-sm btn-secondary" type="button" disabled={pending||!email.trim()||wait>0} onClick={event=>void request(event,true)}>{en?"Request a new code":"Yêu cầu mã mới"}</button>}
        </form>
        {challenge&&<div className="contact-challenge">
          <p>{en?"Request for: ":"Yêu cầu cho: "}{challenge.emailMasked??(en?"Unavailable":"Không khả dụng")}</p>
          <p>{challenge.mailStatus==="SENT"?(en?"Email provider accepted the message. Check your inbox or spam folder.":"Nhà cung cấp email đã nhận thư. Kiểm tra hộp thư đến hoặc thư rác."):challenge.mailStatus==="QUEUED"||challenge.mailStatus==="PROCESSING"||challenge.mailStatus==="RETRY"?(en?"Verification email is queued or being sent.":"Email xác minh đang chờ hoặc đang được gửi."):(en?"This verification email is inactive or unavailable.":"Email xác minh này đã dừng hoặc không khả dụng.")}</p>
          {active?<>
            <p>{en?"Expires at ":"Hết hạn lúc "}{new Date(challenge.expiresAt).toLocaleTimeString(en?"en-GB":"vi-VN")}{en?". Attempts left: ":". Số lần thử còn lại: "}{challenge.attemptsRemaining}</p>
            <form aria-label={en?"Verify contact code":"Xác minh mã liên hệ"} onSubmit={event=>void verify(event)}>
              <label htmlFor={id+"-code"}>{en?"Six-digit code":"Mã 6 chữ số"}</label>
              <input id={id+"-code"} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} disabled={pending}/>
              <button className="btn btn-sm btn-primary" type="submit" disabled={pending||code.length!==6||challenge.attemptsRemaining===0}>{en?"Verify contact":"Xác minh liên hệ"}</button>
            </form>
          </>:<p>{challenge.state==="VERIFIED"?(en?"Request verified.":"Yêu cầu đã xác minh."):(en?"Request expired, locked or cancelled. Request a new code to continue.":"Yêu cầu đã hết hạn, bị khóa hoặc hủy. Yêu cầu mã mới để tiếp tục.")}</p>}
          {wait>0&&<p>{en?"A new code is available in ":"Có thể yêu cầu mã mới sau "}{wait}{en?" seconds.":" giây."}</p>}
        </div>}
        {contact.status==="VERIFIED"&&!removing&&<button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>setRemoving(true)}>{en?"Remove contact email":"Xóa email liên hệ"}</button>}
        {removing&&<div role="group" aria-label={en?"Confirm contact removal":"Xác nhận xóa liên hệ"}>
          <p>{en?"Pending notification emails will be cancelled. Your login and wallet stay unchanged.":"Email thông báo đang chờ sẽ bị hủy. Đăng nhập và ví được giữ nguyên."}</p>
          <button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void remove()}>{en?"Confirm removal":"Xác nhận xóa"}</button>
          <button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>setRemoving(false)}>{en?"Keep contact":"Giữ liên hệ"}</button>
        </div>}
      </>}
      <button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load()}>{en?"Reload contact status":"Tải lại trạng thái liên hệ"}</button>
    </div>}
  </section>;
}
