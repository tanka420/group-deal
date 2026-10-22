import {useEffect,useState} from 'react';
import {useLanguage} from '../context/LanguageContext';
import {orderFilterError,type OrderFilters,emptyOrderFilters} from '../services/orderList';
import {deliveryStatusText} from '../services/buyerOrderPresentation';
import {sellerCampaignStatus} from '../services/sellerOrderPresentation';
export function SellerListFilters({value,campaigns,disputes,onApply}:{value:OrderFilters;campaigns:boolean;disputes:boolean;onApply:(f:OrderFilters)=>void}){
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi,[draft,setDraft]=useState(value),[error,setError]=useState(false);
 useEffect(()=>{setDraft(value);setError(false);},[value]);
 const statuses=campaigns?['DRAFT','PUBLISHED','ACTIVE','FINALIZED','CANCELLED']:disputes?['DISPUTED','RESOLVED']:['READY_TO_DELIVER','OVERDUE','PENDING','DELIVERED','CONFIRMED','DISPUTED','BREACHED_REFUNDED','RESOLVED'];
 return <form className="glass-card seller-list-filters" onSubmit={e=>{e.preventDefault();const invalid=!!orderFilterError(draft);setError(invalid);if(!invalid)onApply({...draft,q:draft.q.trim()});}}>
 <label>{campaigns?text('Tìm mã hoặc tên chiến dịch','Search campaign ID or title'):text('Tìm mã đơn hoặc sản phẩm','Search order ID or product')}<input className="form-input" type="search" maxLength={180} value={draft.q} onChange={e=>setDraft(v=>({...v,q:e.target.value}))}/></label>
 <label>{text('Trạng thái','Status')}<select className="form-input" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}><option value="">{text('Tất cả trạng thái','All statuses')}</option>{statuses.map(s=><option value={s} key={s}>{s==='READY_TO_DELIVER'?text('Đơn cần giao','Ready for delivery'):s==='OVERDUE'?text('Quá hạn giao','Overdue delivery'):campaigns?sellerCampaignStatus(s,language):deliveryStatusText(s,language)}</option>)}</select></label>
 {!campaigns&&<><label>{text('Từ ngày','From date')}<input className="form-input" type="date" value={draft.from} aria-invalid={error} onChange={e=>setDraft(v=>({...v,from:e.target.value}))}/></label><label>{text('Đến ngày','Through date')}<input className="form-input" type="date" value={draft.to} aria-invalid={error} onChange={e=>setDraft(v=>({...v,to:e.target.value}))}/></label></>}
 {error&&<p role="alert">{text('Chọn ngày hợp lệ; ngày bắt đầu không được sau ngày kết thúc.','Choose valid dates; the start date must not follow the end date.')}</p>}
 <div className="seller-filter-actions"><button className="btn btn-primary" type="submit">{text('Áp dụng','Apply')}</button><button className="btn btn-secondary" type="button" onClick={()=>onApply({...emptyOrderFilters})}>{text('Xóa bộ lọc','Clear filters')}</button></div>
 </form>;
}
