import React,{useEffect,useRef,useState} from "react";
import {useLanguage} from "../context/LanguageContext";
import {ContactEditor} from "./ContactEditor";

type Preferences={inApp:boolean;email:boolean};
type ContactStatus="VERIFIED"|"UNVERIFIED"|"MISSING";
const parsePreferences=(value:unknown):Preferences=>{
  const input=value as Partial<Preferences>|null;
  if(!input||typeof input.inApp!=="boolean"||typeof input.email!=="boolean")throw new Error("INVALID_RESPONSE");
  return {inApp:input.inApp,email:input.email};
};
export function NotificationPreferences({token,userId}:{token:string;userId:string}) {
  const {language}=useLanguage(),en=language==="en";
  const [preferences,setPreferences]=useState<Preferences|null>(null),[saved,setSaved]=useState<Preferences|null>(null);
  const [contact,setContact]=useState<ContactStatus|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(false),[confirmed,setConfirmed]=useState(false);
  const alive=useRef(false),inFlight=useRef(false),generation=useRef(0),controllers=useRef(new Set<AbortController>());
  const request=async(init:RequestInit={})=>{
    const controller=new AbortController();controllers.current.add(controller);
    const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch("/api/notifications/preferences",{...init,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},signal:controller.signal});
      if(!response.ok)throw new Error("REQUEST_FAILED");
      return await response.json();
    }finally{clearTimeout(timeout);controllers.current.delete(controller);}
  };
  const load=async()=>{
    if(inFlight.current)return;
    const current=++generation.current;
    inFlight.current=true;setPending(true);setError(false);setConfirmed(false);
    try{
      const data=await request(),next=parsePreferences(data.preferences);
      if(!["VERIFIED","UNVERIFIED","MISSING"].includes(data.contactStatus))throw new Error("INVALID_RESPONSE");
      if(alive.current&&generation.current===current){setPreferences(next);setSaved(next);setContact(data.contactStatus);}
    }catch{if(alive.current&&generation.current===current)setError(true);}
    finally{if(generation.current===current){inFlight.current=false;if(alive.current)setPending(false);}}
  };
  useEffect(()=>{
    alive.current=true;void load();
    return()=>{alive.current=false;generation.current++;inFlight.current=false;for(const controller of controllers.current)controller.abort();};
  },[token]);
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(!preferences||inFlight.current)return;
    const current=++generation.current;
    const intended={...preferences};inFlight.current=true;setPending(true);setError(false);setConfirmed(false);
    try{
      const data=await request({method:"PUT",body:JSON.stringify(intended)}),actual=parsePreferences(data.preferences);
      if(actual.inApp!==intended.inApp||actual.email!==intended.email)throw new Error("INVALID_RESPONSE");
      if(alive.current&&generation.current===current){setSaved(actual);setConfirmed(true);}
    }catch{if(alive.current&&generation.current===current)setError(true);}
    finally{if(generation.current===current){inFlight.current=false;if(alive.current)setPending(false);}}
  };
  const dirty=!!preferences&&!!saved&&(preferences.inApp!==saved.inApp||preferences.email!==saved.email);
  const change=(field:keyof Preferences,value:boolean)=>{setPreferences(previous=>previous?{...previous,[field]:value}:previous);setConfirmed(false);};
  return <><form className="notification-preferences" onSubmit={save} aria-label={en?"Notification preferences":"Tùy chọn thông báo"} aria-busy={pending} style={{padding:".75rem",borderBottom:"1px solid var(--border-subtle)",fontSize:".875rem"}}>
    <fieldset disabled={pending||!preferences} style={{border:0,padding:0,margin:0}}>
      <legend style={{fontWeight:700,marginBottom:".5rem"}}>{en?"Notification preferences":"Tùy chọn thông báo"}</legend>
      <label style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".5rem"}}><input type="checkbox" checked={preferences?.inApp??false} onChange={event=>change("inApp",event.target.checked)}/>{en?"In-app notifications":"Thông báo trong ứng dụng"}</label>
      <label style={{display:"flex",alignItems:"center",gap:".5rem"}}><input type="checkbox" checked={preferences?.email??false} onChange={event=>change("email",event.target.checked)}/>{en?"Email notifications":"Thông báo qua email"}</label>
    </fieldset>
    {contact&&<p style={{margin:".5rem 0",color:"var(--text-secondary)",lineHeight:1.5}}>{contact==="VERIFIED"?(en?"Verified contact email. Turning email off cancels queued messages before sending.":"Email liên hệ đã xác minh. Tắt email sẽ hủy thông báo đang chờ trước khi gửi."):(en?"No verified contact email. Email stays unsent until your contact is verified.":"Chưa có email liên hệ đã xác minh. Email chưa được gửi cho đến khi liên hệ được xác minh.")}</p>}
    {pending&&<p role="status">{en?"Loading or saving preferences…":"Đang tải hoặc lưu tùy chọn…"}</p>}
    {confirmed&&<p role="status">{en?"Preferences saved.":"Đã lưu tùy chọn."}</p>}
    {error&&<p role="alert">{en?"Could not confirm preferences. Reload to check the saved state.":"Chưa xác nhận được tùy chọn. Tải lại để kiểm tra trạng thái đã lưu."}</p>}
    <div style={{display:"flex",gap:".5rem",flexWrap:"wrap",marginTop:".5rem"}}>
      <button type="submit" className="btn btn-sm btn-primary" disabled={pending||!dirty}>{en?"Save preferences":"Lưu tùy chọn"}</button>
      <button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load()}>{en?"Reload preferences":"Tải lại tùy chọn"}</button>
    </div>
  </form><ContactEditor token={token} userId={userId} onChange={setContact}/></>;
}
