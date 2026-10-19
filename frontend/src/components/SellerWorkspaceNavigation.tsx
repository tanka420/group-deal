import {useEffect,useRef,useState} from 'react';
import {Menu,Store,Package,ShoppingBag,Coins,Scale,User,Plug,History} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import {DialogSurface} from './DialogSurface';
import {type SellerSection} from '../services/sellerNavigation';
import '../styles/seller-workspace.css';
export function SellerWorkspaceNavigation({active,onChange}:{active:SellerSection;onChange:(s:SellerSection)=>void}){
 const {language}=useLanguage(),en=language==='en',[open,setOpen]=useState(false),[mobile,setMobile]=useState(()=>matchMedia('(max-width:1023px)').matches),root=useRef<HTMLElement>(null);
 useEffect(()=>{const q=matchMedia('(max-width:1023px)'),sync=()=>setMobile(q.matches);q.addEventListener('change',sync);return()=>q.removeEventListener('change',sync);},[]);
 useEffect(()=>{if(mobile||!open)return;setOpen(false);const frame=requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus());return()=>cancelAnimationFrame(frame);},[mobile]);
 useEffect(()=>setOpen(false),[active]);
 const items=[{id:'CAMPAIGNS',label:en?'My campaigns':'Chiến dịch của tôi',Icon:Store},{id:'PRODUCTS',label:en?'Products & licenses':'Sản phẩm & license',Icon:Package},{id:'FULFILLMENT',label:en?'Orders & access delivery':'Đơn hàng & Giao quyền truy cập',Icon:ShoppingBag},{id:'REVENUE',label:en?'Allocations & claims':'Phân bổ & rút tiền',Icon:Coins},{id:'DISPUTES',label:en?'Disputed orders':'Đơn tranh chấp',Icon:Scale},{id:'PROFILE',label:en?'Profile & Payout':'Hồ sơ & Ví nhận tiền',Icon:User},{id:'TRANSACTIONS',label:en?'Transactions & recovery':'Lịch sử & phục hồi',Icon:History},{id:'WEBHOOKS',label:en?'HMAC webhook integration':'Tích hợp Webhook HMAC',Icon:Plug}] as const;
 const list=()=> <nav aria-label={en?'Seller sections':'Các mục người bán'}>{items.map(({id,label,Icon})=><button key={id} type="button" className={'btn '+(id===active?'btn-primary':'btn-secondary')} aria-current={id===active?'page':undefined} onClick={()=>{setOpen(false);onChange(id);}}><Icon size={18} aria-hidden="true"/><span>{label}</span></button>)}</nav>;
 return <aside ref={root} className="seller-workspace-nav">{mobile?<><button className="btn btn-secondary" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Menu size={18} aria-hidden="true"/>{en?'Seller menu':'Menu người bán'}</button>{open&&<DialogSurface className="seller-menu-drawer" label={en?'Seller menu':'Menu người bán'} onClose={()=>setOpen(false)}><h2>{en?'Seller menu':'Menu người bán'}</h2>{list()}</DialogSurface>}</>:<><h2>{en?'Seller studio':'Kênh người bán'}</h2>{list()}</>}</aside>;
}
