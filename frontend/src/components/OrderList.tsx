import {useEffect,useState} from 'react';
import {useLanguage} from '../context/LanguageContext';
import {OrderReference} from './OrderReference';
import {filterOrders,formatOrderDate,orderFilterError,readOrderFilters,orderListHref,emptyOrderFilters,orderStates,type OrderFilters} from '../services/orderList';
import {buyerOrderAmounts,orderMoney,deliveryStatusText} from '../services/buyerOrderPresentation';
import {displayUSDC} from '../services/orderAccounting';
import {navigateApp} from '../utils/appRoute';
import '../styles/orders.css';

export function OrderList({orders}:{orders:any[]}){
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [filters,setFilters]=useState(readOrderFilters),[draft,setDraft]=useState<OrderFilters>(filters),[limit,setLimit]=useState(20),[error,setError]=useState<string|null>(null);
 useEffect(()=>{const sync=()=>{const next=readOrderFilters();setFilters(next);setDraft(next);setLimit(20);setError(null);};window.addEventListener('popstate',sync);window.addEventListener('groupdeal:navigate',sync);return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('groupdeal:navigate',sync);};},[]);
 const apply=(next:OrderFilters)=>{const invalid=orderFilterError(next);setError(invalid);if(invalid)return;setFilters(next);setDraft(next);setLimit(20);navigateApp(orderListHref(next));};
 const matching=filterOrders(orders,filters),shown=matching.slice(0,limit),href=(id:string)=>'/orders/'+encodeURIComponent(id)+'?returnTo='+encodeURIComponent(orderListHref(filters));
 return <section className="order-list-section" aria-label={text('Danh sách đơn mua','Purchase order list')}>
  <form className="glass-card order-filter-form" onSubmit={e=>{e.preventDefault();apply({...draft,q:draft.q.trim()});}}>
   <div><label htmlFor="order-search">{text('Tìm mã đơn hoặc sản phẩm','Search order ID or product')}</label><input id="order-search" type="search" maxLength={180} value={draft.q} onChange={e=>setDraft(v=>({...v,q:e.target.value}))}/></div>
   <div><label htmlFor="order-state">{text('Trạng thái đơn','Order status')}</label><select id="order-state" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}><option value="">{text('Tất cả trạng thái','All statuses')}</option>{orderStates.map(s=><option key={s} value={s}>{deliveryStatusText(s,language)}</option>)}</select></div>
   <div><label htmlFor="order-from">{text('Từ ngày ghi nhận (UTC+7)','Recorded from (UTC+7)')}</label><input id="order-from" type="date" value={draft.from} aria-invalid={!!error} aria-describedby={error?'order-filter-error':undefined} onChange={e=>setDraft(v=>({...v,from:e.target.value}))}/></div>
   <div><label htmlFor="order-to">{text('Đến ngày ghi nhận (UTC+7)','Recorded through (UTC+7)')}</label><input id="order-to" type="date" value={draft.to} aria-invalid={!!error} aria-describedby={error?'order-filter-error':undefined} onChange={e=>setDraft(v=>({...v,to:e.target.value}))}/></div>
   {error&&<p role="alert" id="order-filter-error">{text('Chọn ngày hợp lệ; ngày bắt đầu không được sau ngày kết thúc.','Choose valid dates; the start date must not be after the end date.')}</p>}
   <div className="order-filter-actions"><button className="btn btn-primary" type="submit">{text('Áp dụng','Apply')}</button><button className="btn btn-secondary" type="button" onClick={()=>apply({...emptyOrderFilters})}>{text('Xóa bộ lọc','Clear filters')}</button></div>
  </form>
  <p role="status">{text(`${matching.length} đơn phù hợp · Mới nhất trước`,`${matching.length} matching orders · Newest first`)}</p>
  <p className="muted order-time-note">{text('Thời gian hiển thị theo UTC+7. STT thay đổi theo bộ lọc và thứ tự danh sách.','Times are shown in UTC+7. Row numbers follow the filtered list order.')}</p>
  <div className="glass-card order-list"><div className="order-column-head" aria-hidden="true"><span>{text('STT','No.')}</span><span>{text('Đơn / sản phẩm','Order / product')}</span><span>{text('Ngày ghi nhận','Recorded date')}</span><span>{text('Trạng thái','Status')}</span><span>{text('Tiền hàng / thao tác','Amount / actions')}</span></div>
   {shown.map((o,i)=>{const amounts=buyerOrderAmounts(o),gross=orderMoney(o.committedGross);return <article className="order-row" key={o.id} aria-label={text('Đơn ','Order ')+o.id}>
    <span className="order-sequence"><span className="order-mobile-label">{text('STT ','No. ')}</span>{i+1}</span>
    <div className="order-summary"><OrderReference id={o.id} href={href(o.id)}/><h2>{o.campaignTitle}</h2><p>{Number.isSafeInteger(o.quantity)&&o.quantity>0?o.quantity:'—'} {text('đơn vị','units')}</p></div>
    <div className="order-recorded"><span className="order-mobile-label">{text('Ngày ghi nhận: ','Recorded: ')}</span>{formatOrderDate(o.createdAt,language)}</div>
    <span className="badge">{deliveryStatusText(o.deliveryStatus,language)}</span>
    <div className="order-row-actions"><p>{text('Tiền hàng đã cam kết: ','Goods committed: ')}<strong>{gross===null?text('Chưa xác minh','Unverified'):gross+' USDC'}</strong></p><p>{text('Còn có thể rút: ','Remaining claimable: ')}<strong>{amounts.remaining===null?text('Chưa xác minh','Unverified'):displayUSDC(amounts.remaining)+' USDC'}</strong></p><a className="btn btn-secondary" href={href(o.id)}>{o.deliveryStatus==='DELIVERED'?text('Nhận sản phẩm','Receive product'):text('Xem đơn','View order')}</a></div>
   </article>;})}
   {!matching.length&&<p className="catalog-state">{text('Không có đơn phù hợp với điều kiện này.','No orders match these conditions.')}</p>}
  </div>
  {shown.length<matching.length?<button className="btn btn-secondary order-more" onClick={()=>setLimit(v=>v+20)}>{text('Xem thêm đơn','Load more orders')}</button>:matching.length>0&&<p className="muted">{text('Đã xem hết kết quả.','You have reached the end of the results.')}</p>}
 </section>;
}
