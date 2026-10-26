import {useEffect,useRef,useState} from 'react';
import {useLanguage} from '../context/LanguageContext';
import {SellerFollow,followRequest,followPage} from '../services/sellerFollow';
import {SellerFollowControl} from './SellerFollowControl';
export function SellerFollowsPanel({token,userId}:{token:string;userId:string}){
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
 const [open,setOpen]=useState(false),[rows,setRows]=useState<SellerFollow[]>([]),[cursor,setCursor]=useState<string|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState<string|null>(null);
 const generation=useRef(0),busy=useRef(false),requests=useRef(new Set<AbortController>()),seen=useRef(new Set<string>());
 async function load(more=false){if(busy.current||more&&!cursor)return;const g=generation.current,c=new AbortController();requests.current.add(c);busy.current=true;setPending(true);setError(false);const pageCursor=more?cursor:null;
  try{const page=followPage(await followRequest('?limit=20'+(pageCursor?'&cursor='+encodeURIComponent(pageCursor):''),token,c.signal),userId);if(g!==generation.current||c.signal.aborted)return;
   if(more&&page.rows.some(f=>rows.some(old=>old.sellerId===f.sellerId))||more&&page.cursor&&(seen.current.has(page.cursor)||page.cursor===pageCursor))throw Error('FOLLOW_INVALID_PAGE');if(!more)seen.current.clear();if(page.cursor)seen.current.add(page.cursor);setRows(old=>more?[...old,...page.rows]:page.rows);setCursor(page.cursor);
  }catch{if(g===generation.current&&!c.signal.aborted){setRows([]);setCursor(null);setSelected(null);setError(true);}}
  finally{requests.current.delete(c);if(g===generation.current){busy.current=false;setPending(false);}}
 }
 useEffect(()=>{generation.current++;if(open)void load();return()=>{generation.current++;busy.current=false;for(const c of requests.current)c.abort();};},[open,token,userId]);
 return <details className="seller-follows-panel" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{text('Seller đang theo dõi','Followed sellers')}</summary>{open&&<section aria-label={text('Danh sách seller theo dõi','Your followed sellers')} aria-busy={pending}>
  {pending&&<p role="status">{text('Đang tải seller theo dõi…','Loading followed sellers…')}</p>}{error&&<p role="alert">{text('Chưa tải được danh sách. Dữ liệu cũ đã được ẩn.','Could not load the list. Previous data has been hidden.')}</p>}{!pending&&!error&&!rows.length&&<p>{text('Bạn chưa theo dõi seller nào.','You are not following any sellers.')}</p>}
  <ul className="record-scroll-stack">{rows.map(f=><li key={f.sellerId}><span>{f.displayName||f.sellerId}</span>{f.available?<a href={'#seller-profile-'+encodeURIComponent(f.sellerId)}>{text('Xem hồ sơ','View profile')}</a>:<p>{text('Hiện không có hồ sơ công khai khả dụng.','No public profile is currently available.')}</p>}<button type="button" className="btn btn-sm btn-secondary" onClick={()=>setSelected(v=>v===f.sellerId?null:f.sellerId)}>{selected===f.sellerId?text('Đóng tùy chọn','Close preferences'):text('Cài đặt theo dõi','Follow settings')}</button>{selected===f.sellerId&&<SellerFollowControl sellerId={f.sellerId} onSaved={()=>void load()}/>}</li>)}</ul>
  <div className="action-row"><button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load()}>{text('Tải lại danh sách theo dõi','Reload followed sellers')}</button>{cursor&&<button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load(true)}>{text('Xem thêm seller','More sellers')}</button>}</div>
 </section>}</details>;
}
