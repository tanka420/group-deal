import {DealPriceSummary} from '../components/DealPriceSummary';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Search,SlidersHorizontal,Sparkles,ImageIcon,CheckCircle2,Clock,ArrowRight,RefreshCw,X,Store} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import {useWeb3} from '../context/Web3Context';
import {catalogHref,catalogFilters,catalogPriceError,catalogUSDC,CatalogUnavailable,defaultCatalogFilters,getCatalog,readCatalogPreference,saveCatalogPreference,type CatalogDeal,type CatalogFilters,type CatalogPage} from '../services/catalog';
import {navigateApp} from '../utils/appRoute';
import {publicWidgetText} from '../../../shared/publicWidget.mjs';
import {focusPageElement} from '../utils/focus';
import '../styles/catalog.css';

type View={phase:'LOADING'|'READY'|'ERROR';page:CatalogPage|null;more:boolean;moreError:boolean;limited:boolean};
const initial:View={phase:'LOADING',page:null,more:false,moreError:false,limited:false};
export function ExplorePage({onSelectCampaign}:{onSelectCampaign:(id:string)=>void}){
 const {language,t}=useLanguage(),{hubAddress}=useWeb3(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [filters,setFilters]=useState<CatalogFilters>(readCatalogPreference),[draft,setDraft]=useState<CatalogFilters>(filters),[view,setView]=useState<View>(initial),[revision,setRevision]=useState(0);
 const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:768px)').matches),[drawerOpen,setDrawerOpen]=useState(false),[failedImages,setFailedImages]=useState<string[]>([]);
 const [priceError,setPriceError]=useState<ReturnType<typeof catalogPriceError>>(null);
 const generation=useRef(0),request=useRef<AbortController|null>(null),busy=useRef(false),seenCursors=useRef(new Set<string>()),dialog=useRef<HTMLDialogElement>(null),filterHeading=useRef<HTMLHeadingElement>(null),alert=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{const sync=()=>{const next=readCatalogPreference();setFilters(current=>JSON.stringify(current)===JSON.stringify(next)?current:next);setDraft(next);setDrawerOpen(false);};window.addEventListener('popstate',sync);window.addEventListener('groupdeal:navigate',sync);return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('groupdeal:navigate',sync);};},[]);
 useEffect(()=>{const media=window.matchMedia('(max-width:768px)'),change=()=>{setCompact(media.matches);setDrawerOpen(false);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useLayoutEffect(()=>{
  const node=dialog.current;if(!drawerOpen||!compact||!node)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';node.showModal();filterHeading.current?.focus();
  const keydown=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const nodes=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0),first=nodes[0],last=nodes[nodes.length-1];if(!first||!last)return;if(event.shiftKey&&(document.activeElement===first||!nodes.includes(document.activeElement as HTMLElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!nodes.includes(document.activeElement as HTMLElement))){event.preventDefault();first.focus();}};
  node.addEventListener('keydown',keydown);return()=>{node.removeEventListener('keydown',keydown);if(node.open)node.close();document.body.style.overflow=overflow;if(previous?.isConnected)focusPageElement(previous);};
 },[drawerOpen,compact]);
 useEffect(()=>{
  const current=++generation.current,controller=new AbortController();request.current?.abort();request.current=controller;busy.current=true;seenCursors.current.clear();setView(initial);setFailedImages([]);saveCatalogPreference(filters);
  void getCatalog(filters,null,controller.signal,hubAddress||undefined).then(page=>{if(current===generation.current&&!controller.signal.aborted)setView({phase:'READY',page,more:false,moreError:false,limited:false});}).catch(error=>{if(current===generation.current&&!controller.signal.aborted)setView({...initial,phase:'ERROR',limited:error instanceof CatalogUnavailable&&error.status===429});}).finally(()=>{if(current===generation.current)busy.current=false;});
  return()=>{generation.current++;controller.abort();request.current?.abort();busy.current=false;};
 },[filters,revision,hubAddress]);
 useEffect(()=>{if(view.phase==='ERROR')focusPageElement(alert.current);},[view.phase]);
 const commit=(next:CatalogFilters)=>{setFilters(next);setDraft(next);setPriceError(null);setDrawerOpen(false);navigateApp(catalogHref(next));};
 const apply=()=>{const error=catalogPriceError(draft);setPriceError(error);if(error){document.getElementById(error==='maxPrice'?'catalog-max-price':'catalog-min-price')?.focus();return;}commit(catalogFilters(draft));};
 const cancelFilters=()=>{setDraft(v=>({...filters,q:v.q}));setPriceError(null);setDrawerOpen(false);};
 const clear=()=>commit({...defaultCatalogFilters,purchasable:'0'});
 const active=Object.entries(filters).filter(([key,value])=>value&&(key==='purchasable'?value==='1':key==='sort'?value!=='newest':true));
 const remove=(key:string)=>commit({...filters,[key]:key==='purchasable'?'0':key==='sort'?'newest':''});
 const chip=(key:string,value:string)=>({q:text('Tìm: ','Search: ')+value,category:value,purchasable:text('Đang nhận mua','Accepting purchases'),minPrice:text('Từ ','From ')+value+' USDC',maxPrice:text('Đến ','Up to ')+value+' USDC',status:value,metric:value,sort:({'ending':text('Sắp kết thúc','Ending soon'),'price-asc':text('Giá tăng dần','Price: low to high'),'price-desc':text('Giá giảm dần','Price: high to low'),'oldest':text('Cũ nhất','Oldest')} as Record<string,string>)[value]}[key]||value);
 const more=async()=>{
  if(busy.current||view.phase!=='READY'||!view.page?.nextCursor)return;
  const cursor=view.page.nextCursor,current=generation.current,controller=new AbortController();busy.current=true;request.current=controller;setView(v=>({...v,more:true,moreError:false}));
  try{
   const page=await getCatalog(filters,cursor,controller.signal,hubAddress||undefined);if(current!==generation.current||controller.signal.aborted)return;
   const ids=new Set(view.page.deals.map(d=>d.card.id));if(page.summary.campaignCount<ids.size+page.deals.length||page.deals.some(d=>ids.has(d.card.id))||page.nextCursor&&seenCursors.current.has(page.nextCursor))throw Error('CATALOG_CURSOR_REPEATED');
   seenCursors.current.add(cursor);setView(v=>({...v,page:{...page,deals:[...v.page!.deals,...page.deals]},more:false,moreError:false}));
  }catch{if(current===generation.current&&!controller.signal.aborted)setView(v=>({...v,more:false,moreError:true}));}
  finally{if(current===generation.current)busy.current=false;}
 };
 const controls=<div className="catalog-filter-fields">
  <div><label htmlFor="catalog-category">{text('Danh mục','Category')}</label><select id="catalog-category" value={draft.category} onChange={e=>setDraft(v=>({...v,category:e.target.value}))}><option value="">{text('Tất cả danh mục','All categories')}</option>{view.page?.categories.map(c=><option key={c.value} value={c.value}>{c.label} ({c.campaignCount})</option>)}{draft.category&&!view.page?.categories.some(c=>c.value===draft.category)&&<option value={draft.category}>{draft.category}</option>}</select></div>
  <div><label htmlFor="catalog-min-price">{text('Giá từ (USDC / đơn vị)','Minimum price (USDC / unit)')}</label><input id="catalog-min-price" inputMode="decimal" maxLength={85} value={draft.minPrice} aria-invalid={priceError==='minPrice'||priceError==='range'} aria-describedby={priceError?'catalog-price-error':undefined} onChange={e=>setDraft(v=>({...v,minPrice:e.target.value}))}/></div>
  <div><label htmlFor="catalog-max-price">{text('Giá đến (USDC / đơn vị)','Maximum price (USDC / unit)')}</label><input id="catalog-max-price" inputMode="decimal" maxLength={85} value={draft.maxPrice} aria-invalid={priceError==='maxPrice'||priceError==='range'} aria-describedby={priceError?'catalog-price-error':undefined} onChange={e=>setDraft(v=>({...v,maxPrice:e.target.value}))}/></div>
  <div><label htmlFor="catalog-sort">{text('Sắp xếp','Sort')}</label><select id="catalog-sort" value={draft.sort} onChange={e=>setDraft(v=>({...v,sort:e.target.value as CatalogFilters['sort']}))}><option value="newest">{text('Mới nhất','Newest')}</option><option value="ending">{text('Sắp kết thúc','Ending soon')}</option><option value="price-asc">{text('Giá tăng dần','Price: low to high')}</option><option value="price-desc">{text('Giá giảm dần','Price: high to low')}</option>{draft.sort==='oldest'&&<option value="oldest">{text('Cũ nhất','Oldest')}</option>}</select></div>
  <label className="catalog-availability"><input type="checkbox" checked={draft.purchasable==='1'} onChange={e=>setDraft(v=>({...v,purchasable:e.target.checked?'1':'0'}))}/>{text('Chỉ deal đang nhận mua','Only deals accepting purchases')}</label>
  <p className="catalog-price-help muted">{text('Giá hiện tại mỗi đơn vị, trước rebate. Có thể để trống một đầu; dùng dấu chấm và tối đa 6 chữ số thập phân.','Current price per unit, before rebate. Either bound may be empty; use a decimal point and up to 6 decimal places.')}</p>
  {priceError&&<p id="catalog-price-error" role="alert" className="notice notice-error">{priceError==='range'?text('Giá từ phải nhỏ hơn hoặc bằng giá đến.','Minimum price must not exceed maximum price.'):text('Nhập giá không âm, tối đa 6 chữ số thập phân; không dùng ký hiệu hoặc dấu phân cách hàng nghìn.','Enter a non-negative price with up to 6 decimal places, without symbols or thousands separators.')}</p>}
 </div>;
 const summary=view.page?.summary;
 return <section className="catalog-page" aria-labelledby="catalog-title">
  <header className="catalog-heading"><p className="eyebrow">GroupDeal</p><h1 id="catalog-title">{text('Khám phá deal','Explore deals')}</h1><p className="muted">{text('Tìm sản phẩm số theo danh mục, giá hiện tại và hạn tham gia.','Find digital products by category, current price and deadline.')}</p></header>

  <form className="glass-card catalog-search" role="search" onSubmit={e=>{e.preventDefault();apply();}} aria-label={text('Tìm và lọc chiến dịch','Search and filter campaigns')}>
   <label htmlFor="catalog-search">{text('Tìm chiến dịch, sản phẩm hoặc nhà cung cấp','Search campaigns, products or vendors')}</label><div className="catalog-search-row"><input id="catalog-search" type="search" maxLength={120} value={draft.q} onChange={e=>setDraft(v=>({...v,q:e.target.value}))} autoComplete="off"/><button type="submit" className="btn btn-primary"><Search size={18} aria-hidden="true"/>{text('Tìm kiếm','Search')}</button>{compact&&<button type="button" className="btn btn-secondary" onClick={()=>{setDraft(v=>({...filters,q:v.q}));setPriceError(null);setDrawerOpen(true);}}><SlidersHorizontal size={18} aria-hidden="true"/>{text('Bộ lọc','Filters')} <span aria-label={text('Số điều kiện','Active conditions')}>{active.length}</span></button>}<button type="button" className="btn btn-ghost" onClick={clear}>{text('Xóa bộ lọc','Clear filters')}</button></div>
   {!compact&&controls}
  </form>
  {compact&&<dialog ref={dialog} className="catalog-filter-drawer" aria-labelledby="catalog-filter-title" onCancel={e=>{e.preventDefault();cancelFilters();}} onClose={()=>setDrawerOpen(false)}><form onSubmit={e=>{e.preventDefault();apply();}}><div className="modal-header"><h2 id="catalog-filter-title" tabIndex={-1} ref={filterHeading}>{text('Bộ lọc và sắp xếp','Filters and sorting')}</h2><button type="button" className="modal-close" onClick={cancelFilters} aria-label={text('Đóng bộ lọc','Close filters')}><X size={18} aria-hidden="true"/></button></div><div className="catalog-filter-scroll">{controls}</div><div className="catalog-filter-actions"><button type="button" className="btn btn-secondary" onClick={()=>{setDraft({...defaultCatalogFilters,purchasable:'0'});setPriceError(null);}}>{text('Đặt lại','Reset')}</button><button type="submit" className="btn btn-primary">{text('Áp dụng bộ lọc','Apply filters')}</button></div></form></dialog>}
  {active.length>0&&<div className="catalog-chips" aria-label={text('Điều kiện đang dùng','Active filters')}>{active.map(([key,value])=><button className="btn btn-secondary" key={key} onClick={()=>remove(key)} aria-label={text('Xóa: ','Remove: ')+chip(key,value)}>{chip(key,value)} <X size={14} aria-hidden="true"/></button>)}</div>}
  <div className="catalog-results-heading"><h2 tabIndex={-1}>{text('Khám phá chiến dịch','Explore campaigns')}</h2><button className="btn btn-secondary" disabled={view.phase==='LOADING'||view.more} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16} aria-hidden="true"/>{text('Tải lại kết quả','Refresh results')}</button></div>
  {view.phase==='LOADING'&&<p className="catalog-state" role="status">{text('Đang tải chiến dịch công khai…','Loading public campaigns…')}</p>}
  {view.phase==='ERROR'&&<div className="glass-card catalog-state"><p ref={alert} role="alert" tabIndex={-1}>{view.limited?text('Đã gửi nhiều yêu cầu. Chờ một lúc rồi tải lại kết quả.','Too many requests. Wait a moment, then refresh the results.'):text('Chưa tải được danh sách chiến dịch. Hãy thử lại; lỗi kết nối không có nghĩa là hết chiến dịch.','The campaign catalogue could not be loaded. Try again; a connection error does not mean there are no campaigns.')}</p><button className="btn btn-primary" onClick={()=>setRevision(v=>v+1)}>{text('Thử lại','Retry')}</button></div>}
  {view.phase==='READY'&&view.page&&<>
   <p role="status" className="muted">{text(`Đã tải ${view.page.deals.length} / ${view.page.summary.campaignCount} chiến dịch phù hợp.`,`Loaded ${view.page.deals.length} / ${view.page.summary.campaignCount} matching campaigns.`)}</p>
   {!view.page.deals.length&&<div className="glass-card catalog-state"><h3>{text('Chưa có chiến dịch phù hợp','No matching campaigns')}</h3><p>{text('Thử từ khóa hoặc bộ lọc khác.','Try another search or filter.')}</p><button className="btn btn-secondary" onClick={clear}>{text('Xóa bộ lọc','Clear filters')}</button></div>}
   <div className="grid-cards catalog-grid">{view.page.deals.map(deal=><CatalogCard key={deal.card.id} deal={deal} language={language} failedImage={failedImages.includes(deal.card.id)} onImageError={()=>setFailedImages(v=>v.includes(deal.card.id)?v:[...v,deal.card.id])} onSelect={()=>onSelectCampaign(deal.card.id)}/>)}</div>
   {view.moreError&&<p role="alert" className="notice notice-error">{text('Chưa tải được trang tiếp theo. Các kết quả đã tải vẫn được giữ; thử lại hoặc tải lại toàn bộ kết quả.','The next page could not be loaded. Previously loaded results are kept; retry or refresh all results.')}</p>}
   {view.page.nextCursor&&<div className="catalog-more"><button className="btn btn-primary" disabled={view.more} onClick={()=>void more()}>{view.more?text('Đang tải thêm…','Loading more…'):view.moreError?text('Thử tải thêm lần nữa','Retry loading more'):text('Xem thêm chiến dịch','Load more campaigns')}</button></div>}
   {!view.page.nextCursor&&view.page.deals.length>0&&<p className="catalog-end muted">{text('Đã xem hết kết quả phù hợp.','You have reached the end of the matching results.')}</p>}
  </>}
 </section>;
}
export function CatalogCard({deal,language,failedImage,onImageError,onSelect}:{deal:CatalogDeal;language:'vi'|'en';failedImage:boolean;onImageError:()=>void;onSelect:()=>void}){
 const c=deal.card,labels=publicWidgetText(c,language),text=(vi:string,en:string)=>language==='en'?en:vi;
 const currentPrice=catalogUSDC(c.currentPriceBaseUnits,language),nextPrice=c.nextPriceBaseUnits?catalogUSDC(c.nextPriceBaseUnits,language):null;
 const end=new Date(c.endTime*1000),deadline=new Intl.DateTimeFormat(language==='vi'?'vi-VN':'en-US',{dateStyle:'medium',timeStyle:'short'}).format(end);
 const progress=c.nextThreshold?Math.min(100,Number(BigInt(c.currentMetric)*100n/BigInt(c.nextThreshold))):100;
 const href='/deals/'+encodeURIComponent(c.id)+'?returnTo='+encodeURIComponent(window.location.pathname+window.location.search),title='catalog-deal-'+c.id;
 return <article className="glass-card catalog-deal" aria-labelledby={title}>
  <div className="catalog-deal-media">{deal.thumbnailUrl&&!failedImage?<img src={deal.thumbnailUrl} alt="" loading="lazy" decoding="async" onError={onImageError}/>:<div className="catalog-image-placeholder"><ImageIcon size={42} aria-hidden="true"/><span>{text('Chưa có ảnh sản phẩm','Product image unavailable')}</span></div>}<div className="catalog-deal-badges"><span className="badge">{labels.status}</span>{deal.rightsApproved&&<span className="badge badge-verified-rights"><CheckCircle2 size={13} aria-hidden="true"/>{text('Quyền phân phối đã duyệt','Distribution rights approved')}</span>}</div></div>
  <div className="catalog-deal-content"><p className="eyebrow">{deal.category}</p><h3 id={title}><a href={href} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onSelect();}}}>{c.title}</a></h3><p className="catalog-deal-description">{deal.description}</p>
   <p className="catalog-seller"><Store size={15} aria-hidden="true"/>{deal.seller.profilePath?<a href={deal.seller.profilePath}>{deal.seller.displayName}</a>:deal.seller.displayName}</p>
   {deal.product&&<p className="catalog-license">{deal.product.vendor} · {deal.product.edition}<br/>{text(deal.product.usageScope==='COMMERCIAL'?'Sử dụng thương mại':'Sử dụng cá nhân',deal.product.usageScope==='COMMERCIAL'?'Commercial use':'Personal use')} · {deal.product.seatsPerUnit} {text('chỗ / đơn vị','seats / unit')} · {deal.product.durationDays===null?text('Không giới hạn thời hạn theo license','No duration limit in the license'):text(`${deal.product.durationDays} ngày`,`${deal.product.durationDays} days`)}</p>}
   <p className="catalog-sla"><Clock size={14} aria-hidden="true"/>{text(`SLA giao hàng: ${deal.deliverySlaSeconds/3600} giờ sau khi chốt giá`,`Delivery SLA: ${deal.deliverySlaSeconds/3600} hours after finalization`)}</p>
   {deal.earlyRebateEnabled&&<p className="catalog-early">{text('Có điều khoản rebate cho người mua sớm','Early buyer rebate terms available')}</p>}
   <DealPriceSummary opening={deal.openingPriceBaseUnits} current={c.currentPriceBaseUnits} participants={deal.participantCount} language={language} priceLabel={labels.priceLabel}/><div className="catalog-tier"><p>{labels.metric}</p>{nextPrice?<><div className="progress-bar-container" role="progressbar" aria-label={text('Tiến độ đến bậc giá tiếp theo','Progress to the next price tier')} aria-valuemin={0} aria-valuemax={c.nextThreshold!} aria-valuenow={c.currentMetric}><div className="progress-bar-fill" style={{width:progress+'%'}}/></div><p>{text(`Còn ${Math.max(0,c.nextThreshold!-c.currentMetric)} ${c.metric==='BUYER_COUNT'?'tài khoản':'đơn vị'} để mở giá ${nextPrice} USDC / đơn vị`,`Another ${Math.max(0,c.nextThreshold!-c.currentMetric)} ${c.metric==='BUYER_COUNT'?'accounts':'units'} to unlock ${nextPrice} USDC / unit`)}</p></>:!c.purchaseHeld&&<p>{text('Đã mở bậc giá tốt nhất','Best price tier unlocked')}</p>}</div>

   {c.purchaseHeld&&<p className="catalog-held">{labels.held}</p>}<p className="catalog-deadline">{text('Hạn cam kết: ','Commitment deadline: ')}<time dateTime={end.toISOString()}>{deadline}</time></p>
   <a className="btn btn-primary catalog-deal-action" href={href} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onSelect();}}}>{labels.cta}<ArrowRight size={16} aria-hidden="true"/></a>
  </div>
 </article>;
}
