import {useEffect,useRef,useState} from "react";
import {useLanguage} from "../context/LanguageContext";
import {focusPageElement} from "../utils/focus";
type Job={id:string;notificationId:string;purpose:string;status:string;attempts:number;attemptLimit:number;createdAt:number;nextAttemptAt:number;sentAt?:number;leaseExpiresAt?:number;lastError?:string;redriveCount:number;redriveRequestIds:string[];canRedrive:boolean;redriveReason:string;canCancel:boolean;source?:{kind:string;eventName?:string;occurredAt:number}};
const failureCodes=new Set(["CONTACT_UNVERIFIED","CONTACT_CHANGED","CONTACT_CHALLENGE_INACTIVE","EMAIL_DISABLED","PAYLOAD_INVALID","LEGACY_RECIPIENT_UNBOUND","RETRY_BUDGET_EXHAUSTED","PROVIDER_NOT_ACKNOWLEDGED","OPERATOR_CANCELLED","LEGACY_ERROR_REDACTED"]);
const statuses=["QUEUED","PROCESSING","RETRY","SENT","DLQ","CANCELLED"],idPattern=/^[A-Za-z0-9_-]{1,180}$/;
function parseJob(value:unknown):Job {
  const j=value as Job;if(!j||!idPattern.test(j.id)||!idPattern.test(j.notificationId)||!["EVENT_NOTIFICATION","CONTACT_VERIFICATION"].includes(j.purpose)||!statuses.includes(j.status)||!Number.isInteger(j.attempts)||j.attempts<0||j.attempts>15||!Number.isInteger(j.redriveCount)||j.redriveCount<0||j.redriveCount>2||j.attemptLimit!==5*(j.redriveCount+1)||!Array.isArray(j.redriveRequestIds)||j.redriveRequestIds.length!==j.redriveCount||j.redriveRequestIds.some(id=>! /^[a-f0-9-]{36}$/.test(id))||typeof j.canRedrive!=="boolean"||typeof j.canCancel!=="boolean"||typeof j.redriveReason!=="string"||![j.createdAt,j.nextAttemptAt].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=8640000000000000))throw new Error("INVALID_OUTBOX_JOB");
  return {id:j.id,notificationId:j.notificationId,purpose:j.purpose,status:j.status,attempts:j.attempts,attemptLimit:j.attemptLimit,createdAt:j.createdAt,nextAttemptAt:j.nextAttemptAt,sentAt:j.sentAt,leaseExpiresAt:j.leaseExpiresAt,lastError:j.lastError?(failureCodes.has(j.lastError)?j.lastError:"LEGACY_ERROR_REDACTED"):undefined,redriveCount:j.redriveCount,redriveRequestIds:j.redriveRequestIds,canRedrive:j.canRedrive,redriveReason:j.redriveReason,canCancel:j.canCancel,...(j.source&&["CHAIN_EVENT","SUPPORT_MESSAGE","SUPPORT_TICKET","SELLER_FOLLOW_EVENT"].includes(j.source.kind)&&Number.isSafeInteger(j.source.occurredAt)&&j.source.occurredAt>=0&&j.source.occurredAt<=8640000000000000?{source:{kind:j.source.kind,eventName:j.source.eventName,occurredAt:j.source.occurredAt}}:{})};
}
export function OperatorEmailOutbox({token,userId}:{token:string;userId:string}){
  const {language}=useLanguage(),en=language==="en";
  const [jobs,setJobs]=useState<Job[]>([]),[filter,setFilter]=useState("ALL"),[cursor,setCursor]=useState<string|null>(null),[provider,setProvider]=useState<boolean|null>(null);
  const [pending,setPending]=useState(false),[error,setError]=useState(false),[confirmed,setConfirmed]=useState(false),[selection,setSelection]=useState<{job:Job;action:"redrive"|"cancel"}|null>(null);
  const alive=useRef(false),epoch=useRef(0),inFlight=useRef(false),controllers=useRef(new Set<AbortController>());
  const intent=useRef<{jobId:string;action:"redrive"|"cancel";key?:string;expectedAttempts?:number;expectedRedriveCount?:number}|null>(null);
  const previousScope=useRef({token,userId});
  const resultRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(confirmed)focusPageElement(resultRef.current);},[confirmed]);
  const request=async(path:string,init:RequestInit={})=>{const controller=new AbortController();controllers.current.add(controller);const timeout=setTimeout(()=>controller.abort(),15000);try{const r=await fetch("/api/operator/email-outbox"+path,{...init,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},signal:controller.signal});if(!r.ok)throw new Error("OUTBOX_REQUEST_FAILED");return await r.json();}finally{clearTimeout(timeout);controllers.current.delete(controller);}};
  const load=async(after?:string)=>{
    if(inFlight.current)return;const ownEpoch=epoch.current;inFlight.current=true;setPending(true);setError(false);setConfirmed(false);setSelection(null);
    try{
      const params=new URLSearchParams({limit:"20"});if(filter!=="ALL")params.set("status",filter);if(after)params.set("cursor",after);
      const value=await request("?"+params);if(!Array.isArray(value.jobs)||value.jobs.length>100||typeof value.providerConfigured!=="boolean"||!(value.pagination?.nextCursor===null||typeof value.pagination?.nextCursor==="string"&&value.pagination.nextCursor.length<=1024))throw new Error("INVALID_OUTBOX_PAGE");
      const next=value.jobs.map(parseJob);if(new Set(next.map((j:Job)=>j.id)).size!==next.length)throw new Error("INVALID_OUTBOX_PAGE");
      let recovered=false;
      if(intent.current){const ownIntent={...intent.current},data=await request("/"+encodeURIComponent(ownIntent.jobId)),job=parseJob(data.job);if(job.id!==ownIntent.jobId)throw new Error("WRONG_OUTBOX_JOB");recovered=ownIntent.action==="redrive"?!!ownIntent.key&&job.redriveRequestIds.includes(ownIntent.key):job.status==="CANCELLED";}
      if(alive.current&&epoch.current===ownEpoch){setJobs(previous=>after?[...previous,...next.filter((j:Job)=>!previous.some(p=>p.id===j.id))]:next);setCursor(value.pagination.nextCursor);setProvider(value.providerConfigured);if(recovered){setConfirmed(true);intent.current=null;}}
    }catch{if(alive.current&&epoch.current===ownEpoch)setError(true);}
    finally{if(epoch.current===ownEpoch){inFlight.current=false;if(alive.current)setPending(false);}}
  };
  useEffect(()=>{alive.current=true;epoch.current++;inFlight.current=false;setJobs([]);setCursor(null);setProvider(null);if(previousScope.current.token!==token||previousScope.current.userId!==userId)intent.current=null;previousScope.current={token,userId};void load();return()=>{alive.current=false;epoch.current++;for(const c of controllers.current)c.abort();};},[token,userId,filter]);
  const submit=async()=>{
    if(!selection||inFlight.current)return;const {job,action}=selection,ownEpoch=epoch.current;
    if(!intent.current||intent.current.jobId!==job.id||intent.current.action!==action)intent.current={jobId:job.id,action,...(action==="redrive"?{key:crypto.randomUUID(),expectedAttempts:job.attempts,expectedRedriveCount:job.redriveCount}:{})};
    const planned={...intent.current};inFlight.current=true;setPending(true);setError(false);setConfirmed(false);
    try{
      const value=await request("/"+encodeURIComponent(job.id)+"/"+action,{method:"POST",body:JSON.stringify(action==="redrive"?{idempotencyKey:planned.key,expectedAttempts:planned.expectedAttempts,expectedRedriveCount:planned.expectedRedriveCount}:{})}),actual=parseJob(value.job);
      if(actual.id!==job.id||(action==="redrive"?(value.requestId!==planned.key||!actual.redriveRequestIds.includes(planned.key!)):actual.status!=="CANCELLED"))throw new Error("OUTBOX_UNCONFIRMED");
      if(alive.current&&epoch.current===ownEpoch){setJobs(previous=>previous.flatMap(p=>p.id!==actual.id?[p]:filter!=="ALL"&&actual.status!==filter?[]:[actual]));setConfirmed(true);setSelection(null);intent.current=null;}
    }catch{if(alive.current&&epoch.current===ownEpoch)setError(true);}
    finally{if(epoch.current===ownEpoch){inFlight.current=false;if(alive.current)setPending(false);}}
  };
  const labels:Record<string,[string,string]>={QUEUED:["Chờ gửi","Queued"],PROCESSING:["Đang xử lý","Processing"],RETRY:["Chờ thử lại","Retry queued"],SENT:["Provider đã nhận","Provider accepted"],DLQ:["Dừng sau lỗi","Dead letter"],CANCELLED:["Đã hủy","Cancelled"]};
  const reasons:Record<string,[string,string]>={CONTACT_REQUEST_REQUIRES_USER:["Mã xác minh phải do user yêu cầu lại.","The user must request a new verification code."],SOURCE_UNVERIFIED:["Chưa có nguồn thông báo được xác minh.","The notification source is unverified."],CONTACT_NOT_CURRENT:["Contact chưa xác minh hoặc đã đổi; không gửi sang địa chỉ khác.","The contact is unverified or changed; the message cannot be retargeted."],EMAIL_DISABLED:["User đã tắt email.","The user disabled email."],REDRIVE_BUDGET_EXHAUSTED:["Đã đạt giới hạn 2 lần operator gửi lại.","The two operator redrives are exhausted."],PAYLOAD_INVALID:["Snapshot thư không hợp lệ; cần điều tra.","The mail snapshot is invalid and needs investigation."],LEGACY_RECIPIENT_UNBOUND:["Thư cũ thiếu recipient binding; cần điều tra.","The legacy recipient binding is missing."],FAILURE_NOT_RETRYABLE:["Lỗi này không được gửi lại tự động.","This failure cannot be redriven."],REDRIVE_HISTORY_INVALID:["Lịch sử gửi lại không hợp lệ; cần điều tra.","The redrive history is invalid."],JOB_NOT_DLQ:["Chỉ gửi lại thư đã dừng trong DLQ.","Only dead-letter jobs can be redriven."]};
  const date=(value:number)=>new Date(value).toLocaleString(en?"en-GB":"vi-VN");
  return <section className="operator-outbox" aria-label={en?"Email outbox operations":"Vận hành email outbox"} aria-busy={pending}>
    <h2>{en?"Email outbox":"Hàng đợi email"}</h2>
    <p>{en?"Provider acceptance is not inbox delivery. Redrive keeps the original message and recipient; retries may duplicate delivery after a lost acknowledgement.":"Provider nhận thư chưa phải thư đã đến inbox. Gửi lại giữ nguyên nội dung và recipient; mất phản hồi có thể dẫn đến thư trùng."}</p>
    <div className="operator-outbox-controls"><label>{en?"Status":"Trạng thái"}<select value={filter} disabled={pending} onChange={event=>setFilter(event.target.value)}><option value="ALL">{en?"All statuses":"Tất cả trạng thái"}</option>{statuses.map(s=><option key={s} value={s}>{labels[s][en?1:0]}</option>)}</select></label><button type="button" className="btn btn-secondary" disabled={pending} onClick={()=>void load()}>{en?"Reload outbox":"Tải lại outbox"}</button></div>
    {provider===false&&<p role="status">{en?"No email provider is configured. Jobs remain queued until a provider is available.":"Chưa cấu hình provider email. Thư tiếp tục chờ đến khi provider sẵn sàng."}</p>}
    {pending&&!confirmed&&<p role="status">{en?"Checking outbox…":"Đang kiểm tra outbox…"}</p>}
    {error&&<p role="alert">{en?"Could not confirm the outbox or action. Reload to check the specific job before retrying.":"Chưa xác nhận được outbox hoặc thao tác. Tải lại để kiểm tra đúng job trước khi thử lại."}</p>}
    {confirmed&&<p ref={resultRef} tabIndex={-1} role="status">{en?"The request is recorded. Check the current job status.":"Đã ghi nhận yêu cầu. Kiểm tra trạng thái job hiện tại."}</p>}
    {!pending&&!error&&jobs.length===0&&<p>{en?"No jobs match this view.":"Không có job phù hợp với bộ lọc."}</p>}
    {jobs.map(job=><article key={job.id} className="glass-card operator-outbox-job" aria-label={job.id}>
      <div className="operator-outbox-job-header"><code>{job.id}</code><strong>{labels[job.status][en?1:0]}</strong></div>
      <p>{job.purpose==="CONTACT_VERIFICATION"?(en?"Contact verification":"Xác minh contact"):(en?"Event notification":"Thông báo sự kiện")} · {en?"Attempts":"Lần gửi"}: {job.attempts}/{job.attemptLimit} · {en?"Operator redrives":"Operator gửi lại"}: {job.redriveCount}/2</p>
      <p>{en?"Created":"Tạo lúc"}: {date(job.createdAt)}{job.source?" · "+(["CHAIN_EVENT","SELLER_FOLLOW_EVENT"].includes(job.source.kind)?(en?"Chain event":"Sự kiện chain"):(en?"Support message":"Tin nhắn hỗ trợ"))+": "+date(job.source.occurredAt):""}</p>
      {job.lastError&&<p>{en?"Failure code":"Mã lỗi"}: <code>{job.lastError}</code></p>}
      {job.redriveReason==="RESTORED_WORK_REVIEW_REQUIRED"&&<p>{en?"This restored job is on hold until its source and recipient are reviewed. It cannot be sent, replayed or cancelled here.":"Job phục hồi đang được giữ để rà soát nguồn và người nhận. Không thể gửi, phát lại hoặc hủy tại đây."}</p>}
      {job.status==="DLQ"&&!job.canRedrive&&job.redriveReason!=="RESTORED_WORK_REVIEW_REQUIRED"&&<p>{reasons[job.redriveReason]?.[en?1:0]??(en?"This job needs investigation.":"Job này cần điều tra.")}</p>}
      <div className="operator-outbox-controls">{job.canRedrive&&<button type="button" className="btn btn-primary" disabled={pending} onClick={()=>{setSelection({job,action:"redrive"});setConfirmed(false);}}>{en?"Review redrive":"Xem yêu cầu gửi lại"}</button>}{job.canCancel&&<button type="button" className="btn btn-secondary" disabled={pending} onClick={()=>{setSelection({job,action:"cancel"});setConfirmed(false);}}>{en?"Review cancellation":"Xem yêu cầu hủy"}</button>}</div>
      {selection?.job.id===job.id&&<div role="group" aria-label={en?"Confirm outbox action":"Xác nhận thao tác outbox"} className="notice">
        <p>{selection.action==="redrive"?(en?"Confirm one additional retry cycle of up to five sends. A previous provider acceptance may have been lost.":"Xác nhận thêm một chu kỳ tối đa 5 lần gửi. Phản hồi nhận thư từ provider trước đó có thể đã mất."):(en?"Stop pending retries. A message already being sent or accepted cannot be recalled.":"Dừng các lần thử đang chờ. Thư đang gửi hoặc đã được nhận không thể thu hồi.")}</p>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={()=>void submit()}>{en?"Confirm outbox action":"Xác nhận thao tác"}</button><button type="button" className="btn btn-secondary" disabled={pending} onClick={()=>setSelection(null)}>{en?"Keep current state":"Giữ trạng thái"}</button>
      </div>}
    </article>)}
    {cursor&&<button type="button" className="btn btn-secondary" disabled={pending} onClick={()=>void load(cursor)}>{en?"Older outbox jobs":"Job outbox trước"}</button>}
  </section>;
}
