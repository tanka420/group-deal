import {useLayoutEffect,useRef,useState} from 'react';
import {useLanguage} from '../context/LanguageContext';
import {PriceDisplay} from './DealPresentation';
import {OrderReference} from './OrderReference';
import {parseDealDisputes,type DealDispute,type DealDisputePage,type DealDisputeStatus} from '../services/operatorDealDisputes';
export function OperatorDealDisputes({token,userId,dealId,onReview}:{token:string;userId:string;dealId:string;onReview:(order:DealDispute)=>void}){
 const {language}=useLanguage(),en=language==='en',epoch=useRef(0),scope=useRef({token,userId,dealId});
 const [status,setStatus]=useState<DealDisputeStatus>('ALL'),[cursors,setCursors]=useState<(string|null)[]>([null]),[refresh,setRefresh]=useState(0),[page,setPage]=useState<DealDisputePage|null>(null),[pending,setPending]=useState(true),[error,setError]=useState<number|null>(null);
 const cursor=cursors[cursors.length-1]??null;
 useLayoutEffect(()=>{
  if(scope.current.token!==token||scope.current.userId!==userId||scope.current.dealId!==dealId){scope.current={token,userId,dealId};setPage(null);setError(null);setStatus('ALL');setCursors([null]);setPending(true);setRefresh(v=>v+1);return;}
  const owned=++epoch.current,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let active=true;setPage(null);setError(null);setPending(true);
  const query=new URLSearchParams({limit:'20',status});if(cursor)query.set('cursor',cursor);
  void(async()=>{try{const response=await fetch('/api/operator/deals/'+encodeURIComponent(dealId)+'/disputes?'+query,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});if(!response.ok)throw response.status;const result=parseDealDisputes(await response.json(),userId,dealId,status);if(active&&epoch.current===owned)setPage(result);}catch(e){if(active&&epoch.current===owned)setError(typeof e==='number'?e:503);}finally{clearTimeout(timer);if(active&&epoch.current===owned)setPending(false);}})();
  return()=>{active=false;epoch.current++;clearTimeout(timer);controller.abort();};
 },[token,userId,dealId,status,cursor,refresh]);
 const reload=()=>{setCursors([null]);setRefresh(v=>v+1);};
 const failure=error===401||error===403?(en?'Your session no longer has access. Sign in with an authorized operator account.':'Phiên hiện tại không còn quyền truy cập. Đăng nhập bằng tài khoản điều hành được cấp quyền.'):error===409?(en?'Deal data or deployment scope changed. Reload before continuing.':'Dữ liệu deal hoặc phạm vi triển khai đã đổi. Tải lại trước khi tiếp tục.'):error===404?(en?'This published deal is no longer available.':'Deal đã xuất bản này không còn trong dữ liệu.'):error===400?(en?'The page request is invalid. Reload this list.':'Yêu cầu trang không hợp lệ. Tải lại danh sách.'):(en?'Data is unavailable. Check your connection and try again.':'Chưa tải được dữ liệu. Kiểm tra kết nối và thử lại.');
 return <section className="glass-card operator-deal-disputes ui-stack" aria-labelledby="operator-deal-disputes-heading" aria-busy={pending}>
  <h3 id="operator-deal-disputes-heading">{en?'Disputes for this deal':'Tranh chấp của deal này'}</h3>
  <div className="operator-outbox-controls"><label>{en?'Dispute status':'Trạng thái tranh chấp'}<select className="form-input" value={status} disabled={pending} onChange={e=>{setStatus(e.target.value as DealDisputeStatus);setCursors([null]);}}><option value="ALL">{en?'Open and resolved':'Đang mở và đã phân xử'}</option><option value="OPEN">{en?'Open':'Đang mở'}</option><option value="RESOLVED">{en?'Resolved':'Đã phân xử'}</option></select></label><button type="button" className="btn btn-secondary" disabled={pending} onClick={reload}>{en?'Reload disputes':'Tải lại tranh chấp'}</button></div>
  {pending&&<p role="status">{en?'Loading disputes…':'Đang tải tranh chấp…'}</p>}{error!==null&&<p role="alert" className="notice notice-error">{failure}</p>}
  {page&&<><p className="muted">{en?'Local records for this deal. Allocation and payment still require chain verification.':'Bản ghi cục bộ của deal này. Khoản chia và thanh toán vẫn cần xác minh trên chain.'}</p><div className="ui-record-list">{page.disputes.length?page.disputes.map(order=><article key={order.id} className="ui-record-card">
   <OrderReference id={order.id}/><p><span className="badge">{order.deliveryStatus==='DISPUTED'?(en?'Open':'Đang mở'):(en?'Resolved':'Đã phân xử')}</span> · <PriceDisplay amount={order.committedGross}/></p><p className="address-value">{en?'Buyer principal':'Ví principal buyer'}: {order.buyerPrincipal}</p>
   <p>{order.disputeReason||(en?'Reason metadata has not been recorded.':'Chưa có metadata lý do tranh chấp.')}</p>{order.disputeEvidence.length>0&&<ul>{order.disputeEvidence.map((link,i)=><li key={i}><a href={link} target="_blank" rel="noopener noreferrer">{en?'Evidence':'Bằng chứng'} {i+1}</a></li>)}</ul>}
   {order.disputeResolution&&<dl className="detail-list"><dt>{en?'Resolution notes':'Ghi chú phân xử'}</dt><dd>{order.disputeResolution.notes}</dd><dt>{en?'Resolution transaction':'Giao dịch phân xử'}</dt><dd className="address-value">{order.disputeResolution.txHash}</dd><dt>{en?'Operator account':'Tài khoản điều hành'}</dt><dd>{order.disputeResolution.operatorId}</dd></dl>}
   {order.deliveryStatus==='DISPUTED'&&<button type="button" className="btn btn-primary" onClick={()=>onReview(order)}>{en?'Review this dispute':'Xem xét tranh chấp'}</button>}
  </article>):<p>{en?'No disputes match this deal and status.':'Không có tranh chấp khớp deal và trạng thái này.'}</p>}</div>
  {(page.disputes.length>0||cursors.length>1)&&<nav className="ui-row" aria-label={en?'Deal dispute pages':'Trang tranh chấp deal'}><button type="button" className="btn btn-secondary" disabled={pending||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>{en?'Previous page':'Trang trước'}</button><span>{en?'Page':'Trang'} {cursors.length}</span><button type="button" className="btn btn-secondary" disabled={pending||!page.pagination.nextCursor} onClick={()=>setCursors(v=>[...v,page.pagination.nextCursor])}>{en?'Next page':'Trang sau'}</button></nav>}</>}
 </section>;
}
