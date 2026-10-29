import {useEffect,useState} from 'react';
import {ArrowRight,ShoppingBag,Users,PackageCheck} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import {useWeb3} from '../context/Web3Context';
import {getCatalog,defaultCatalogFilters,catalogHref,type CatalogPage} from '../services/catalog';
import {CatalogCard} from './ExplorePage';
import '../styles/home.css';

export function HomePage({onSelectCampaign}:{onSelectCampaign:(id:string)=>void}) {
 const {language}=useLanguage(),{hubAddress}=useWeb3(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [page,setPage]=useState<CatalogPage|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0),[failed,setFailed]=useState<string[]>([]);
 useEffect(()=>{const controller=new AbortController();setPage(null);setError(false);void getCatalog(defaultCatalogFilters,null,controller.signal,hubAddress||undefined).then(result=>{if(!controller.signal.aborted)setPage(result);}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[hubAddress,revision]);
 return <section className="home-page" aria-labelledby="home-title">
  <header className="home-hero"><div className="home-hero-copy"><p className="eyebrow">{text('Mua chung sản phẩm số','Digital group buying')}</p><h1 id="home-title">{text('Cùng mua. Cùng được giá tốt.','Buy together. Unlock better prices.')}</h1><p>{text('Chọn sản phẩm có điều khoản rõ ràng, tham gia bằng USDC và theo dõi đơn đến khi nhận hàng. Giá nhóm thay đổi theo bậc của từng deal.','Choose a product with clear terms, join with USDC, and follow your order through delivery. Each deal has its own group price tiers.')}</p><a className="btn btn-primary" href="/explore">{text('Khám phá deal','Explore deals')}<ArrowRight size={18}/></a><a className="btn btn-secondary" href="/orders">{text('Đơn mua của tôi','My orders')}</a></div><figure className="home-hero-art"><img src="/images/groupdeal-home-banner.png" alt={text('Nhóm người cùng khám phá phần mềm, thiết kế và sách số','People discovering software, design assets and ebooks together')} width={1536} height={1024} fetchPriority="high" decoding="async"/></figure></header>
  <div className="home-steps">{[
   {Icon:ShoppingBag,title:text('Chọn sản phẩm','Choose a product'),body:text('Xem giấy phép, giá hiện tại, hạn và điều kiện giao hàng.','Review the license, current price, deadline and delivery terms.')},
   {Icon:Users,title:text('Tham gia nhóm mua','Join a buying group'),body:text('Kiểm tra số tiền và phí trước khi tự xác nhận bằng ví.','Review the amount and fees before confirming with your wallet.')},
   {Icon:PackageCheck,title:text('Theo dõi và nhận hàng','Track and receive'),body:text('Xem giao hàng, trao đổi với người bán và khoản được nhận lại trong đơn.','Follow delivery, contact the seller and check any rebate or refund in your order.')}
  ].map(({Icon,title,body})=><article key={title}><Icon size={24} aria-hidden="true"/><h2>{title}</h2><p>{body}</p></article>)}</div>
  <section aria-labelledby="home-deals"><div className="catalog-results-heading"><h2 id="home-deals">{text('Deal mới đang nhận mua','New deals accepting purchases')}</h2><a href="/explore">{text('Xem tất cả','View all')} <ArrowRight size={16}/></a></div>
   {!page&&!error&&<p role="status">{text('Đang tải deal…','Loading deals…')}</p>}
   {error&&<div className="notice notice-error"><p role="alert">{text('Chưa tải được deal. Vui lòng thử lại.','Deals could not be loaded. Please try again.')}</p><button className="btn btn-secondary" onClick={()=>setRevision(v=>v+1)}>{text('Thử lại','Retry')}</button></div>}
   {page&&!page.deals.length&&<p className="glass-card catalog-state">{text('Hiện chưa có deal đang nhận mua. Bạn vẫn có thể khám phá các deal khác.','There are no deals accepting purchases right now. You can still explore other deals.')} <a href="/explore?purchasable=0">{text('Khám phá','Explore')}</a></p>}
   <div className="grid-cards catalog-grid">{page?.deals.slice(0,3).map(deal=><CatalogCard key={deal.card.id} deal={deal} language={language} failedImage={failed.includes(deal.card.id)} onImageError={()=>setFailed(v=>v.includes(deal.card.id)?v:[...v,deal.card.id])} onSelect={()=>onSelectCampaign(deal.card.id)}/>)}</div>
  </section>
  {!!page?.categories.length&&<section className="home-categories" aria-labelledby="home-categories"><h2 id="home-categories">{text('Khám phá theo danh mục','Explore by category')}</h2><div>{page.categories.map(c=><a className="btn btn-secondary" key={c.value} href={catalogHref({...defaultCatalogFilters,category:c.value,purchasable:'0'})}>{c.label}<span>{c.campaignCount}</span></a>)}</div></section>}
 </section>;
}
