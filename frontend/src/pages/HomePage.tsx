import {useEffect,useState} from 'react';
import {ArrowRight,Users,ShieldCheck,Layers,PlayCircle,PackageCheck} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import {useWeb3} from '../context/Web3Context';
import {getCatalog,defaultCatalogFilters,catalogHref,type CatalogPage} from '../services/catalog';
import {CatalogCard} from './ExplorePage';
import '../styles/home.css';

export function HomePage({onSelectCampaign}:{onSelectCampaign:(id:string)=>void}) {
 const {language}=useLanguage(),{hubAddress}=useWeb3(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [page,setPage]=useState<CatalogPage|null>(null),[categories,setCategories]=useState<CatalogPage['categories']>([]);
 const [category,setCategory]=useState(''),[cursor,setCursor]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'|'more'|'more-error'>('loading'),[failed,setFailed]=useState<string[]>([]);
 useEffect(()=>{
  const controller=new AbortController();setPhase(cursor?'more':'loading');if(!cursor)setPage(null);
  void getCatalog({...defaultCatalogFilters,category},cursor,controller.signal,hubAddress||undefined).then(result=>{
   if(controller.signal.aborted)return;
   setCategories(result.categories);
   setPage(previous=>cursor&&previous?{...result,deals:[...previous.deals,...result.deals.filter(deal=>!previous.deals.some(item=>item.card.id===deal.card.id))]}:result);
   setPhase('ready');
  }).catch(()=>{if(!controller.signal.aborted)setPhase(cursor?'more-error':'error');});
  return()=>controller.abort();
 },[hubAddress,category,cursor,revision]);
 const imageFailed=(id:string)=>setFailed(v=>v.includes(id)?v:[...v,id]);
 const selectCategory=(value:string)=>{setCategory(value);setCursor(null);};
 const browseHref=catalogHref({...defaultCatalogFilters,category});
 return <section className="home-page" aria-labelledby="home-title">
  <header className="home-hero marketplace-hero">
   <figure className="marketplace-hero-art"><img src="/images/marketplace-banner.png" alt={text('Minh họa người mua cùng mở bậc giá tốt hơn','Illustration of buyers unlocking better group prices')} width={1896} height={829} decoding="async"/></figure>
   <div className="home-hero-copy">
    <h1 id="home-title">{text('Phần mềm tốt hơn.','Better software.')}{' '}<span>{text('Giá tốt hơn. Cùng nhau.','Lower prices. Together.')}</span></h1>
    <p>{text('Tham gia mua chung phần mềm và sản phẩm số. Càng nhiều người mua, cả nhóm càng gần bậc giá tốt hơn.','Join group deals for premium software and digital products. More buyers unlock lower prices for everyone.')}</p>
    <ul className="home-hero-benefits"><li><Users size={20} aria-hidden="true"/><span>{text('Cùng mua, cùng mở giá','Buy together')}<small>{text('Theo từng bậc của deal','Unlock group price tiers')}</small></span></li><li><ShieldCheck size={20} aria-hidden="true"/><span>{text('Điều khoản rõ ràng','Clear terms')}<small>{text('Xem trước khi cam kết','Review before committing')}</small></span></li><li><Layers size={20} aria-hidden="true"/><span>Arc Testnet<small>{text('Thanh toán bằng USDC','Pay with USDC')}</small></span></li></ul>
    <div className="home-hero-actions"><a className="btn btn-primary" href="/explore">{text('Khám phá deal','Browse deals')}<ArrowRight size={18} aria-hidden="true"/></a><a className="btn btn-secondary" href="/policies/how"><PlayCircle size={18} aria-hidden="true"/>{text('Cách hoạt động','How it works')}</a></div>
    <p className="home-banner-caption">{text('Hình minh họa cơ chế giá nhóm. Giá và điều kiện theo từng deal.','Group pricing illustrated. Prices and terms follow each deal.')}</p>
   </div>
  </header>
  <section className="home-how" aria-labelledby="home-how"><h2 id="home-how">{text('Cách hoạt động','How it works')}</h2><ol>{[
   {title:text('Chọn sản phẩm','Choose a product'),body:text('Xem giấy phép, giá hiện tại, hạn và điều kiện giao hàng.','Review the license, current price, deadline and delivery terms.')},
   {title:text('Tham gia nhóm mua','Join a buying group'),body:text('Kiểm tra số tiền và phí trước khi tự xác nhận bằng ví.','Review the amount and fees before confirming with your wallet.')},
   {title:text('Theo dõi và nhận hàng','Track and receive'),body:text('Xem giao hàng, trao đổi với người bán và khoản được nhận lại trong đơn.','Follow delivery, contact the seller and check any rebate or refund in your order.')}
  ].map(({title,body})=><li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol></section>
  <section className="home-value" aria-labelledby="home-value"><h2 id="home-value">{text('Lợi ích khi cùng mua','Why buy together?')}</h2><ul>{[
   {Icon:Users,title:text('Mở giá nhóm tốt hơn','Unlock better group prices'),body:text('Thêm người mua có thể mở bậc giá thấp hơn. Khoản rebate được phân bổ có thể nhận từ đơn hàng.','More buyers can unlock lower price tiers. Claim any allocated rebate from your order.')},
   {Icon:ShieldCheck,title:text('Hiểu rõ trước khi mua','Know what you are buying'),body:text('Xem giấy phép, quyền sử dụng và điều kiện giao hàng đã ghim trước khi cam kết.','Review the pinned license, usage rights and delivery terms before committing.')},
   {Icon:PackageCheck,title:text('Theo dõi trong một nơi','Keep your order in view'),body:text('Theo dõi giao hàng, liên hệ người bán và xem khoản rebate hoặc hoàn tiền được phân bổ.','Track delivery, contact the seller and see any allocated rebate or refund.')}
  ].map(({Icon,title,body})=><li key={title}><Icon size={24} aria-hidden="true"/><div><h3>{title}</h3><p>{body}</p></div></li>)}</ul></section>
  <section className="home-collection" aria-labelledby="home-deals">
   <nav className="home-category-tabs" aria-label={text('Chọn danh mục deal','Choose a deal category')}><button type="button" aria-pressed={!category} aria-controls="home-deal-results" onClick={()=>selectCategory('')}>{text('Tất cả','All')}</button>{categories.map(c=><button type="button" key={c.value} aria-pressed={category===c.value} aria-controls="home-deal-results" onClick={()=>selectCategory(c.value)}>{c.label}</button>)}</nav>
   <div className="catalog-results-heading"><h2 id="home-deals">{text('Khám phá deal','Discover group deals')}</h2><a className="text-link" href={browseHref}>{text('Xem tất cả','View all')} <ArrowRight size={17} aria-hidden="true"/></a></div>
   <div id="home-deal-results" aria-busy={phase==='loading'||phase==='more'}>
    {phase==='loading'&&<p className="home-load-state" role="status">{text('Đang tải deal…','Loading deals…')}</p>}
    {phase==='error'&&<div className="notice notice-error home-load-state"><p role="alert">{text('Chưa tải được deal. Vui lòng thử lại.','Deals could not be loaded. Please try again.')}</p><button className="btn btn-secondary" onClick={()=>setRevision(v=>v+1)}>{text('Thử lại','Retry')}</button></div>}
    {page&&!page.deals.length&&<div className="catalog-state home-load-state"><h3>{text('Chưa có nhóm mua đang mở','No buying groups open right now')}</h3><p>{text('Thử danh mục khác hoặc khám phá các deal khác.','Try another category or explore other deals.')}</p><a className="btn btn-primary" href={catalogHref({...defaultCatalogFilters,category,purchasable:'0'})}>{text('Khám phá','Explore')}</a></div>}
    {!!page?.deals.length&&<div className="grid-cards catalog-grid">{page.deals.map(deal=><CatalogCard key={deal.card.id} deal={deal} language={language} failedImage={failed.includes(deal.card.id)} onImageError={()=>imageFailed(deal.card.id)} onSelect={()=>onSelectCampaign(deal.card.id)}/>)}</div>}
    {phase==='more-error'&&<p className="notice notice-error" role="alert">{text('Chưa tải được thêm deal. Các deal đã tải vẫn được giữ lại.','More deals could not be loaded. Previously loaded deals are kept.')}</p>}
    {page?.nextCursor&&<button className="btn btn-secondary home-load-more" disabled={phase==='more'} onClick={()=>phase==='more-error'?setRevision(v=>v+1):setCursor(page.nextCursor)}>{phase==='more'?text('Đang tải…','Loading…'):phase==='more-error'?text('Thử tải thêm','Retry loading more'):text('Xem thêm deal','Load more deals')}</button>}
   </div>
  </section>
 </section>;
}
