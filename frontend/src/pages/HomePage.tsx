import {useEffect,useState} from 'react';
import {ArrowRight,Users,ShieldCheck,Layers,PlayCircle} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import {useWeb3} from '../context/Web3Context';
import {getCatalog,defaultCatalogFilters,catalogHref,type CatalogPage} from '../services/catalog';
import {CatalogCard} from './ExplorePage';
import '../styles/home.css';

export function HomePage({onSelectCampaign}:{onSelectCampaign:(id:string)=>void}) {
 const {language}=useLanguage(),{hubAddress}=useWeb3(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [page,setPage]=useState<CatalogPage|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0),[failed,setFailed]=useState<string[]>([]);
 useEffect(()=>{const controller=new AbortController();setPage(null);setError(false);void getCatalog(defaultCatalogFilters,null,controller.signal,hubAddress||undefined).then(result=>{if(!controller.signal.aborted)setPage(result);}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[hubAddress,revision]);
 const imageFailed=(id:string)=>setFailed(v=>v.includes(id)?v:[...v,id]);
 const featured=page?.deals[0];
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
  {!page&&!error&&<div className="home-loading" role="status"><span className="home-loading-art" aria-hidden="true"/><p>{text('Đang tải deal…','Loading deals…')}</p></div>}
  {error&&<div className="notice notice-error home-load-state"><p role="alert">{text('Chưa tải được deal. Vui lòng thử lại.','Deals could not be loaded. Please try again.')}</p><button className="btn btn-secondary" onClick={()=>setRevision(v=>v+1)}>{text('Thử lại','Retry')}</button></div>}
  {page&&!page.deals.length&&<div className="catalog-state home-load-state"><h2>{text('Chưa có nhóm mua đang mở','No buying groups open right now')}</h2><p>{text('Bạn vẫn có thể khám phá sản phẩm và các deal khác.','You can still explore products and other deals.')}</p><a className="btn btn-primary" href="/explore?purchasable=0">{text('Khám phá','Explore')}</a></div>}
  {featured&&<CatalogCard featured deal={featured} language={language} failedImage={failed.includes(featured.card.id)} onImageError={()=>imageFailed(featured.card.id)} onSelect={()=>onSelectCampaign(featured.card.id)}/>}
  {!!page?.deals.length&&<section className="home-collection" aria-labelledby="home-deals"><div className="catalog-results-heading"><h2 id="home-deals">{text('Dành cho việc bạn sắp làm.','For your next idea.')}</h2><a className="text-link" href="/explore">{text('Xem tất cả','View all')} <ArrowRight size={17} aria-hidden="true"/></a></div>
   <div className="grid-cards catalog-grid">{page.deals.slice(0,3).map(deal=><CatalogCard key={deal.card.id} deal={deal} language={language} failedImage={failed.includes(deal.card.id)} onImageError={()=>imageFailed(deal.card.id)} onSelect={()=>onSelectCampaign(deal.card.id)}/>)}</div>
  </section>}
  {!!page?.categories.length&&<section className="home-categories" aria-labelledby="home-categories"><h2 id="home-categories">{text('Tìm theo điều bạn cần.','Find what you need.')}</h2><div>{page.categories.map(c=><a className="btn btn-secondary" key={c.value} href={catalogHref({...defaultCatalogFilters,category:c.value,purchasable:'0'})}>{c.label}<span>{c.campaignCount}</span><ArrowRight size={16} aria-hidden="true"/></a>)}</div></section>}
  <section className="home-how" aria-labelledby="home-how"><h2 id="home-how">{text('Từ chọn deal đến nhận hàng.','From finding a deal to delivery.')}</h2><ol>{[
   {title:text('Chọn sản phẩm','Choose a product'),body:text('Xem giấy phép, giá hiện tại, hạn và điều kiện giao hàng.','Review the license, current price, deadline and delivery terms.')},
   {title:text('Tham gia nhóm mua','Join a buying group'),body:text('Kiểm tra số tiền và phí trước khi tự xác nhận bằng ví.','Review the amount and fees before confirming with your wallet.')},
   {title:text('Theo dõi và nhận hàng','Track and receive'),body:text('Xem giao hàng, trao đổi với người bán và khoản được nhận lại trong đơn.','Follow delivery, contact the seller and check any rebate or refund in your order.')}
  ].map(({title,body})=><li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol></section>
 </section>;
}
