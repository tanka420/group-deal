import {ARC_CHAIN_ID} from '../../../shared/network.mjs';
import {useDealLanguage} from './DealPresentation';
export function ProviderEntitlementContent({content,orderId,buyerPrincipal,quantity}:{content:string;orderId:string;buyerPrincipal?:string;quantity:number}){
 const {text,language}=useDealLanguage();let value:any;try{value=JSON.parse(content);}catch{return <>{content}</>;}
 if(value?.method!=='WEBHOOK')return <>{content}</>;
 let url:URL;try{url=new URL(value.downloadUrl);if(value.version!==1||value.orderId!==orderId||typeof buyerPrincipal!=='string'||value.buyerPrincipal?.toLowerCase()!==buyerPrincipal.toLowerCase()||value.quantity!==quantity||value.chainId!==ARC_CHAIN_ID||!/^0x[0-9a-fA-F]{40}$/.test(value.hubAddress)||!/^[a-f0-9]{64}$/.test(value.packageSha256)||!Number.isSafeInteger(value.byteLength)||value.byteLength<1||value.byteLength>16777216||!Number.isSafeInteger(value.expiresAt)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^\/entitlements\/[a-f0-9]{64}\/csv-studio\.zip$/.test(url.pathname))throw Error();}
 catch{return <p role="alert">{text('Thông tin provider chưa khớp đơn. Liên hệ hỗ trợ của đơn để kiểm tra.','Provider access does not match this order. Contact order support.')}</p>;}
 const expired=value.expiresAt<=Date.now();
 return <div><p>{text('Gói từ provider: ','Provider package: ')}{url.hostname} · {quantity} seat · {(value.byteLength/1024).toFixed(1)} KiB</p>
  <p>{text('Hạn tải: ','Download until: ')}{new Date(value.expiresAt).toLocaleString(language==='en'?'en-GB':'vi-VN')}</p>
  {expired?<p role="status">{text('Đường dẫn tải đã hết hạn. Liên hệ hỗ trợ của đơn.','The download link expired. Contact order support.')}</p>:<a className="btn btn-primary" href={url.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{text('Tải ZIP từ provider','Download ZIP from provider')}</a>}
  <p className="muted">{text('Đường dẫn riêng cho đơn này; giữ riêng tư. Bản đã tải chạy offline theo license.','This order has a private download link; keep it private. Downloaded files run offline under the license.')}</p>
 </div>;
}
