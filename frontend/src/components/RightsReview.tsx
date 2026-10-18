import { useCallback,useEffect,useLayoutEffect,useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { managedOperationError,operationRequest } from "../services/transactionOperations";
import {useOperationScope} from '../hooks/useOperationScope';
import {useDealLanguage} from './DealPresentation';
import {UiError,uiMessage,messageText,type UiMessage} from '../utils/uiMessage';
import {RecordListControls} from './RecordListControls';
import {cleanHttpsEvidenceUrl} from '../../../shared/evidence.mjs';

interface Submission {id:string;productVersionId:string;licenseVersionId:string;sellerId:string;declaration:'OWNER'|'AUTHORIZED_RESELLER';declarationText:string;evidenceRefs:string[];status:'SUBMITTED'|'APPROVED';validUntil?:number;product:{id:string;title:string;license:{id:string;edition:string;usageTerms:string;seatsPerUnit:number}}|null;}
type Decision='APPROVED'|'REQUESTED_INFO'|'REJECTED'|'REVOKED';
const invalid=()=>new UiError(uiMessage('Hồ sơ quyền chưa có dữ liệu hợp lệ. Giữ quyết định và tải lại hồ sơ.','The rights response has invalid data. Keep your decision and reload the submissions.'));
function readSubmissions(value:{rights:Submission[]}){
 const str=(v:unknown)=>typeof v==='string'&&v.length>0;
 if(!value||!Array.isArray(value.rights)||new Set(value.rights.map(r=>r?.id)).size!==value.rights.length||value.rights.some(r=>!r||!str(r.id)||!str(r.productVersionId)||!str(r.licenseVersionId)||!str(r.sellerId)||!['OWNER','AUTHORIZED_RESELLER'].includes(r.declaration)||typeof r.declarationText!=='string'||!Array.isArray(r.evidenceRefs)||r.evidenceRefs.some(u=>typeof u!=='string')||!['SUBMITTED','APPROVED'].includes(r.status)||r.validUntil!==undefined&&(!Number.isSafeInteger(r.validUntil)||r.validUntil<1||r.validUntil>8640000000000)||r.product!==null&&(!r.product||!str(r.product.id)||!str(r.product.title)||!r.product.license||!str(r.product.license.id)||!str(r.product.license.edition)||typeof r.product.license.usageTerms!=='string'||!Number.isSafeInteger(r.product.license.seatsPerUnit)||r.product.license.seatsPerUnit<1)))throw invalid();
 return value.rights;
}
function versionBound(r:Submission){return !!r.product&&r.product.id===r.productVersionId&&r.product.license.id===r.licenseVersionId;}
export function RightsReview({onBusyChange}:{onBusyChange?:(busy:boolean)=>void}={}) {
  const {token,user}=useAuth(),{getExternalSigner,account}=useWeb3(),{language,text}=useDealLanguage();
  const identity=JSON.stringify([user?.id,token,account?.toLowerCase()]),scope=useOperationScope(identity);
  const [submissions,setSubmissions]=useState<Submission[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<UiMessage|null>(null),[busy,setBusy]=useState<string|null>(null),[uncertain,setUncertain]=useState<string[]>([]);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('ALL'),[limit,setLimit]=useState(10),[expanded,setExpanded]=useState<string|null>(null);
  useLayoutEffect(()=>{onBusyChange?.(!!busy)},[busy,onBusyChange]);
  useLayoutEffect(()=>{setExpanded(null);setSearch('');setStatus('ALL');setLimit(10);setSubmissions([]);setLoading(true);setError(null);setBusy(null);setUncertain([])},[identity]);
  const load=useCallback(async()=>{
   if(!user||!token){setLoading(false);return;}const ticket=scope.start();if(!ticket)return;setLoading(true);setError(null);
   try{const response=await operationRequest<{rights:Submission[]}>(token,'/api/products/rights/review');if(!ticket.current())return;setSubmissions(readSubmissions(response));setUncertain([])}
   catch(e){if(ticket.current())setError(managedOperationError(e,uiMessage('Chưa tải được hồ sơ quyền. Thử tải lại.','Rights submissions could not be loaded. Reload to try again.')))}
   finally{if(ticket.current()){setLoading(false);ticket.finish()}}
  },[identity]);
  useEffect(()=>{void load();},[load]);
  const review=async(event:React.FormEvent<HTMLFormElement>,submission:Submission)=>{
    event.preventDefault();if(!user||!token||!user.roles.includes('operator')||submission.sellerId===user.id||uncertain.includes(submission.id)||!versionBound(submission))return;
    const ticket=scope.start();if(!ticket)return;const node=event.currentTarget,form=new FormData(node),decision=String(form.get('decision')) as Decision,reason=String(form.get('reason')||'').trim(),date=String(form.get('validUntil')||'');let postStarted=false;
    const validUntil=decision==="APPROVED"?Math.floor(new Date(`${date}T23:59:59`).getTime()/1000):undefined;
    setBusy(submission.id);setError(null);
    try {
      if(!reason||reason.length>4000||!(submission.status==='APPROVED'?decision==='REVOKED':['APPROVED','REQUESTED_INFO','REJECTED'].includes(decision))||(decision==='APPROVED'&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isSafeInteger(validUntil)||validUntil!<=Date.now()/1000)))throw new UiError(uiMessage('Nhập lý do và ngày hết hạn trong tương lai cho phê duyệt.','Enter a reason and a future expiry date for approval.'));
      const signer=await getExternalSigner();if(!ticket.current())return;const walletAddress=await signer.getAddress();
      if(!ticket.current())return;
      if(!/^0x[\da-fA-F]{40}$/.test(walletAddress)||account?.toLowerCase()!==walletAddress.toLowerCase()||user.activeWallet?.toLowerCase()!==walletAddress.toLowerCase())throw new UiError(uiMessage('Kết nối đúng ví operator đang hoạt động trước khi ký.','Connect the current operator wallet before signing.'));
      const challenge=await operationRequest<{challengeMessage:string}>(token,"/api/auth/wallet/challenge",{action:"OPERATOR_ACTION",walletAddress});
      if(!ticket.current())return;
      if(!challenge||typeof challenge.challengeMessage!=='string'||!challenge.challengeMessage||challenge.challengeMessage.length>4096)throw invalid();
      const signature=await signer.signMessage(challenge.challengeMessage);
      if(!ticket.current())return;
      postStarted=true;
      const response=await operationRequest<{rights:Omit<Submission,'status'>&{status:Decision}}>(token,`/api/products/rights/${encodeURIComponent(submission.id)}/review`,{decision,reason,validUntil,walletAddress,signature,challengeMessage:challenge.challengeMessage});if(!ticket.current())return;
      const ack=response?.rights;
      if(!ack||ack.id!==submission.id||ack.productVersionId!==submission.productVersionId||ack.licenseVersionId!==submission.licenseVersionId||ack.sellerId!==submission.sellerId||ack.status!==decision||decision==='APPROVED'&&ack.validUntil!==validUntil)throw invalid();
      setSubmissions(current=>current.filter(r=>r.id!==submission.id));node.reset();
      try{const data=await operationRequest<{rights:Submission[]}>(token,'/api/products/rights/review');if(ticket.current())setSubmissions(readSubmissions(data))}catch(e){if(ticket.current())setError(managedOperationError(e,uiMessage('Quyết định đã được xác nhận; chưa tải lại được danh sách.','The decision was acknowledged; the list could not be refreshed.')))}
    }catch(e){if(ticket.current()){if(postStarted)setUncertain(ids=>[...new Set([...ids,submission.id])]);setError(managedOperationError(e,uiMessage('Chưa xác nhận được quyết định. Giữ lý do và tải lại hồ sơ trước khi thử lại.','The decision is unconfirmed. Keep the reason and reload submissions before retrying.')))}}
    finally{if(ticket.current()){setBusy(null);ticket.finish()}}
  };
  const walletMatches=!!account&&account.toLowerCase()===user?.activeWallet?.toLowerCase();
  const query=search.trim().toLocaleLowerCase(),filtered=submissions.filter(r=>(status==='ALL'||r.status===status)&&[r.product?.title,r.product?.license.edition,r.productVersionId,r.licenseVersionId,r.sellerId].some(value=>value?.toLocaleLowerCase().includes(query))).sort((a,b)=>Number(a.status==='APPROVED')-Number(b.status==='APPROVED')),visible=new Set(filtered.slice(0,limit).map(r=>r.id));
  const statusText=(r:Submission)=>r.status==='APPROVED'?text('Đã phê duyệt','Approved'):text('Chờ duyệt','Submitted');
  return <section className="review-section" aria-labelledby="rights-review-title">
    <div className="section-heading"><div><h2 id="rights-review-title">{text('Quyền phân phối','Distribution rights')}</h2><p className="muted">{text('Chọn hồ sơ để xem phiên bản, điều khoản và bằng chứng trước khi quyết định.','Open a record to review its version, terms and evidence before deciding.')}</p></div><button type="button" className="btn btn-secondary" disabled={loading||!!busy} onClick={()=>void load()}>{text('Tải lại hồ sơ','Reload submissions')}</button></div>
    {error&&<p role="alert" className="notice notice-error">{messageText(error,language)}</p>}
    <RecordListControls id="rights-list" search={search} filter={status} onSearch={value=>{setSearch(value);setLimit(10)}} onFilter={value=>{setStatus(value);setLimit(10)}} options={[{value:'ALL',label:text('Tất cả trạng thái','All statuses')},{value:'SUBMITTED',label:text('Chờ duyệt','Submitted')},{value:'APPROVED',label:text('Đã phê duyệt','Approved')}]} count={filtered.length} total={submissions.length} language={language}/>
    {loading&&<p role="status">{text('Đang tải hồ sơ quyền…','Loading rights submissions…')}</p>}
    {!loading&&!error&&filtered.length===0&&<p className="record-list-empty">{submissions.length?text('Không có hồ sơ khớp bộ lọc.','No records match these filters.'):text('Không có hồ sơ chờ duyệt hoặc phê duyệt đang hiệu lực.','No pending submissions or current approvals.')}</p>}
    <ul className="record-list rights-record-list" aria-label={text('Hồ sơ quyền phân phối','Distribution rights records')}>
    {submissions.map(submission=><li key={submission.id} hidden={!visible.has(submission.id)}>
     <article className="rights-review-card">
      <div className="record-summary rights-record-summary"><div className="record-identity"><h3>{submission.product?.title||submission.productVersionId}</h3><p className="muted">{submission.product?.license.edition||text('License chưa xác minh','Unverified license')}</p></div><div><span className={'record-status '+(submission.status==='APPROVED'?'is-approved':'is-pending')}>{statusText(submission)}</span>{submission.validUntil&&<p className="muted record-expiry">{text('Đến','Until')} {new Date(submission.validUntil*1000).toLocaleDateString(language==='en'?'en-US':'vi-VN')}</p>}</div><button className="btn btn-secondary" type="button" aria-expanded={expanded===submission.id} aria-controls={'rights-detail-'+submission.id} onClick={()=>setExpanded(expanded===submission.id?null:submission.id)}>{expanded===submission.id?text('Đóng hồ sơ','Close record'):text('Xem hồ sơ','Review record')}</button></div>
      <div className="record-detail" id={'rights-detail-'+submission.id} hidden={expanded!==submission.id}>
       <dl className="detail-list"><dt>{text('Phiên bản sản phẩm','Product version')}</dt><dd className="address-value">{submission.productVersionId}</dd><dt>{text('Phiên bản license','License version')}</dt><dd className="address-value">{submission.licenseVersionId}</dd><dt>License</dt><dd>{submission.product?submission.product.license.edition+' · '+submission.product.license.seatsPerUnit+' '+text('seat/đơn vị','seats/unit'):text('Chưa xác minh','Unverified')}</dd></dl>
       <div className="record-evidence"><h4>{text('Điều khoản và bằng chứng','Terms and evidence')}</h4><p>{submission.product?.license.usageTerms}</p><p>{submission.declaration==='OWNER'?text('Chủ sở hữu','Owner'):text('Được ủy quyền phân phối','Authorized reseller')} · {submission.declarationText}</p><ul>{submission.evidenceRefs.map((url,i)=>{const safe=cleanHttpsEvidenceUrl(url);return <li key={i}>{safe?<a href={safe} target="_blank" rel="noreferrer">{text('Bằng chứng riêng','Private evidence')} {i+1}</a>:<span>{text('Link bằng chứng cũ cần kiểm tra; chưa mở liên kết.','Legacy evidence link needs review; it has not been opened.')}</span>}</li>})}</ul></div>
       {(!walletMatches||!versionBound(submission)||submission.sellerId===user?.id)&&<p role="status" className="notice">{submission.sellerId===user?.id?text('Cần operator độc lập để duyệt hồ sơ này.','An independent operator must review this submission.'):!versionBound(submission)?text('Phiên bản sản phẩm/license chưa khớp; tải lại hồ sơ trước khi duyệt.','The product/license version is unverified; reload before reviewing.'):text('Kết nối ví operator đang hoạt động để ký quyết định.','Connect the current operator wallet to sign a decision.')}</p>}
       {uncertain.includes(submission.id)&&<p role="status" className="notice notice-warning">{text('Tải lại hồ sơ để kiểm tra quyết định đã lưu trước khi gửi lại.','Reload submissions to check the saved decision before resubmitting.')}</p>}
       <form className="record-decision-form" onSubmit={event=>void review(event,submission)}><div className="form-grid"><label className="form-group" htmlFor={'decision-'+submission.id}>{text('Quyết định','Decision')}<select disabled={!!busy||loading||uncertain.includes(submission.id)} id={'decision-'+submission.id} name="decision" className="form-select">{submission.status==='SUBMITTED'?<><option value="APPROVED">{text('Phê duyệt','Approve')}</option><option value="REQUESTED_INFO">{text('Yêu cầu thêm bằng chứng','Request more evidence')}</option><option value="REJECTED">{text('Từ chối','Reject')}</option></>:<option value="REVOKED">{text('Thu hồi quyền bán mới','Revoke rights for new sales')}</option>}</select></label>{submission.status==='SUBMITTED'&&<label className="form-group" htmlFor={'expiry-'+submission.id}>{text('Ngày hết hạn phê duyệt','Approval expiry date')}<input disabled={!!busy||loading||uncertain.includes(submission.id)} id={'expiry-'+submission.id} name="validUntil" type="date" className="form-input"/></label>}</div><label className="form-group" htmlFor={'reason-'+submission.id}>{text('Lý do quyết định','Decision reason')}<textarea disabled={!!busy||loading||uncertain.includes(submission.id)} id={'reason-'+submission.id} name="reason" className="form-textarea" required maxLength={4000}/></label><button type="submit" className="btn btn-primary" disabled={!!busy||loading||uncertain.includes(submission.id)||!user?.roles.includes('operator')||!walletMatches||!versionBound(submission)||submission.sellerId===user?.id}>{busy===submission.id?text('Đang xác minh…','Verifying…'):text('Ký xác minh và lưu quyết định','Sign and save decision')}</button></form>
      </div>
     </article>
    </li>)}
    </ul>
    {filtered.length>limit&&<button className="btn btn-secondary" type="button" onClick={()=>setLimit(value=>value+10)}>{text('Xem thêm hồ sơ','Load more records')}</button>}
  </section>;
}
