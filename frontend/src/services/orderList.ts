import {dateTime} from '../utils/dateTime';
import {normalizeCatalogText} from '../../../shared/catalogQuery.mjs';
export type OrderFilters={q:string;status:string;from:string;to:string;campaignId?:string;productId?:string;orderId?:string};
export const orderStates=['PENDING','DELIVERED','CONFIRMED','DISPUTED','BREACHED_REFUNDED','RESOLVED'];
export const emptyOrderFilters:OrderFilters={q:'',status:'',from:'',to:''};
export function orderTimestamp(value:unknown):number|null{return typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=8640000000000000?value:null;}
export function orderDateBound(value:string,end=false):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const ms=Date.parse(value+'T00:00:00+07:00');if(!Number.isFinite(ms)||new Date(ms+7*3600000).toISOString().slice(0,10)!==value)return null;
 return ms+(end?86400000-1:0);
}
export function orderFilterError(f:OrderFilters){if(f.from&&orderDateBound(f.from)===null||f.to&&orderDateBound(f.to)===null)return 'DATE';return f.from&&f.to&&f.from>f.to?'RANGE':null;}
export function readOrderFilters():OrderFilters {const p=new URLSearchParams(window.location.search),q=p.get('q')||'',status=p.get('status')||'',from=p.get('from')||'',to=p.get('to')||'';const f={q:q.slice(0,180),status:orderStates.includes(status)?status:'',from,to,...Object.fromEntries(['campaignId','productId','orderId'].map(k=>[k,p.get(k)??'']).filter(([,v])=>/^[-A-Za-z0-9_:]{1,180}$/.test(v)))};return orderFilterError(f)?{...emptyOrderFilters,q:f.q,status:f.status}:f;}
export function orderListHref(f:OrderFilters){const p=new URLSearchParams();for(const [key,value]of Object.entries(f))if(value)p.set(key,value);return '/orders'+(p.size?'?'+p:'');}
export function filterOrders<T extends {id:string;createdAt?:unknown;campaignTitle?:unknown;deliveryStatus?:unknown;productSnapshot?:any}>(orders:T[],f:OrderFilters):T[]{
 const q=normalizeCatalogText(f.q).split(' ').filter(Boolean),from=f.from?orderDateBound(f.from):null,to=f.to?orderDateBound(f.to,true):null;
 return orders.filter(o=>{const date=orderTimestamp(o.createdAt),haystack=normalizeCatalogText([o.id,o.campaignTitle,o.productSnapshot?.title].filter(v=>typeof v==='string').join(' '));return(!f.status||o.deliveryStatus===f.status)&&q.every(part=>haystack.includes(part))&&(from===null||date!==null&&date>=from)&&(to===null||date!==null&&date<=to);}).sort((a,b)=>(orderTimestamp(b.createdAt)??-1)-(orderTimestamp(a.createdAt)??-1)||(a.id<b.id?-1:a.id>b.id?1:0));
}
export function formatOrderDate(value:unknown,language:'vi'|'en'):string {const stamp=orderTimestamp(value);return stamp===null?(language==='en'?'No recorded date':'Chưa có ngày ghi nhận'):dateTime(stamp,language);}
