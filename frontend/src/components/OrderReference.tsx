import {useState} from 'react';
import {Copy,Check} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import '../styles/orders.css';

/** Business order ID, identical in every workspace; never a row number or tx hash. */
export function OrderReference({id,href}:{id:string;href?:string}){
 const {language}=useLanguage(),en=language==='en',[copied,setCopied]=useState(false),[failed,setFailed]=useState(false);
 const copy=async()=>{try{await navigator.clipboard.writeText(id);setCopied(true);setFailed(false);}catch{setFailed(true);}};
 return <span className="order-reference"><span>{en?'Order':'Đơn'} </span>{href?<a href={href}><code>{id}</code></a>:<code>{id}</code>}<button type="button" className="btn btn-ghost" aria-label={(copied?(en?'Copied order ID ':'Đã sao chép mã đơn '):(en?'Copy order ID ':'Sao chép mã đơn '))+id} onClick={()=>void copy()}>{copied?<Check size={16} aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}</button>{failed&&<span role="alert">{en?'Copy failed. Select the ID to copy it.':'Chưa sao chép được. Chọn mã đơn để sao chép.'}</span>}</span>;
}
