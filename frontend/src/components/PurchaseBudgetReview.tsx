import React,{useEffect,useState} from 'react';
import {ethers} from 'ethers';
import {purchaseBudget,purchaseBudgetIsFresh,type PurchaseBudget} from '../services/checkout';
import {useDealLanguage} from './DealPresentation';
type View={key:string;phase:'idle'|'loading'|'ready'|'unavailable';budget?:PurchaseBudget};
export function usePurchaseBudgetReview(open:boolean,account:string|undefined,gross:bigint,key:string,enabled:boolean){
 const [state,setState]=useState<View>({key:'',phase:'idle'}),[version,setVersion]=useState(0);
 useEffect(()=>{
  if(!open||!enabled){setState({key,phase:'idle'});return;}
  if(!account){setState({key,phase:'unavailable'});return;}
  let current=true;setState({key,phase:'loading'});
  void purchaseBudget(account,gross).then(budget=>{if(current)setState({key,phase:'ready',budget});},()=>{if(current)setState({key,phase:'unavailable'});});
  return()=>{current=false;};
 },[open,enabled,account,gross,key,version]);
 const refresh=()=>{setState({key,phase:'loading'});setVersion(v=>v+1);};
 return {view:state.key===key?state:{key,phase:'loading' as const},refresh};
}
export function PurchaseBudgetReview({view,refresh,busy,now}:{view:View;refresh:()=>void;busy:boolean;now:number}){
 const {text}=useDealLanguage(),budget=view.phase==='ready'?view.budget:undefined,fresh=budget&&purchaseBudgetIsFresh(budget,now),format=(n:bigint)=>ethers.formatUnits(n,18)+' USDC';
 if(view.phase==='idle')return null;
 return <section className="purchase-budget" aria-label={text('Ngân sách mua trên Arc','Arc purchase budget')} aria-live="polite" aria-busy={view.phase==='loading'}>
  <h4>{text('Số dư và ngân sách USDC','USDC balance and budget')}</h4>
  {budget&&fresh?<><dl className="summary-list"><dt>{text('Số dư USDC trên Arc','USDC balance on Arc')}</dt><dd data-budget="balance">{format(budget.balance)}</dd><dt>{text('Dự phòng gas approve','Approval gas reserve')}</dt><dd data-budget="approve">{format(budget.approveGasReserve)}</dd><dt>{text('Dự phòng gas cam kết','Commitment gas reserve')}</dt><dd data-budget="commit">{format(budget.commitGasReserve)}</dd><dt>{text('Tổng cần có: tiền hàng + gas','Required: goods + gas')}</dt><dd data-budget="required">{format(budget.required)}</dd></dl>{budget.shortfall>0n&&<p className="notice" data-budget="shortfall">{text('Cần nạp thêm ít nhất','Fund at least another')} {format(budget.shortfall)}. {text('Tiếp tục để xem báo giá nạp tiền; chưa ký mua.','Continue to review funding; purchase signing has not started.')}</p>}<p className="muted">{text('Đây là ngân sách dự phòng cho hai bước, gồm margin 100%; không phải phí thực tế. Mỗi giao dịch được ước tính lại trước ký.','This reserve covers both steps with a 100% margin; it is not the actual fee. Each call is estimated again before signing.')}</p><p className="muted">{text('Có hiệu lực tối đa 60 giây. USDC trả tiền hàng và gas dùng cùng một số dư.','Valid for at most 60 seconds. Goods and gas use the same USDC balance.')}</p></>:<p className="notice">{view.phase==='loading'?text('Đang đọc số dư và ngân sách gas…','Reading the balance and gas budget…'):budget?text('Ngân sách đã hết hạn. Đọc lại trước khi đồng ý.','This budget expired. Refresh it before agreeing.'):text('Chưa đọc được ngân sách. Chọn đúng ví và thử lại trước khi tiếp tục.','The budget is unavailable. Select the correct wallet and retry before continuing.')}</p>}
  <button type="button" className="btn btn-secondary" disabled={busy||view.phase==='loading'} onClick={refresh}>{text('Đọc lại số dư và ngân sách','Refresh balance and budget')}</button>
 </section>;
}
