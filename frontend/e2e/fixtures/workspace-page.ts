import {filterOrders,type OrderFilters} from '../../src/services/orderList';
/** A finite API page for legacy UI fixtures; real SQL/cursor behavior is exercised separately. */
export function workspaceOrderPage(url:string,rows:any[]){
 const p=new URL(url).searchParams,filters={q:p.get('q')||'',status:p.get('status')||'',from:p.get('from')||'',to:p.get('to')||''} as OrderFilters;
 const matching=filterOrders(rows,filters).filter(o=>['campaignId','productId','orderId'].every(k=>!p.get(k)||(k==='orderId'?o.id:k==='productId'?o.productSnapshot?.productId:o.campaignId)===p.get(k)));
 const offset=p.get('cursor')==='fixture_page_2'?20:0;
 return {orders:matching.slice(offset,offset+20),pagination:{limit:20,total:matching.length,nextCursor:offset+20<matching.length?'fixture_page_2':null}};
}
