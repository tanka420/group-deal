import {useLanguage} from '../context/LanguageContext';
import {cleanHttpsEvidenceUrl} from '../../../shared/evidence.mjs';
export function OrderDisputeSummary({order}:{order:any}){
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
 if(!['DISPUTED','RESOLVED'].includes(order.deliveryStatus))return null;
 const links=Array.isArray(order.disputeEvidence)?order.disputeEvidence.map(cleanHttpsEvidenceUrl).filter((v:unknown):v is string=>typeof v==='string').slice(0,20):[];
 return <section className="order-review" aria-label={text('Chi tiết tranh chấp','Dispute details')}><h3>{text('Chi tiết tranh chấp','Dispute details')}</h3><p>{typeof order.disputeReason==='string'&&order.disputeReason?order.disputeReason:text('Chưa có lý do tranh chấp được ghi nhận.','No dispute reason has been recorded.')}</p>{links.length>0&&<ul>{links.map((url:string,i:number)=><li key={url+':'+i}><a href={url} target="_blank" rel="noopener noreferrer">{text('Bằng chứng ','Evidence ')}{i+1}</a></li>)}</ul>}
 {order.deliveryStatus==='RESOLVED'&&<><strong>{text('Ghi chú phân xử','Resolution notes')}</strong><p>{typeof order.disputeResolution?.notes==='string'?order.disputeResolution.notes:text('Chưa có ghi chú phân xử.','No resolution notes are available.')}</p></>}
 <p className="muted">{text('Nội dung hồ sơ không đồng nghĩa tiền đã chuyển về ví. Kiểm tra khoản phân bổ và biên nhận rút tiền của đơn.','Case notes do not mean funds have reached a wallet. Check the order allocations and claim receipts.')}</p></section>;
}
