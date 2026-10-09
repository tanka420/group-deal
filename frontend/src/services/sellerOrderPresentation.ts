import {orderAmount,recordedDeadline} from './buyerOrderPresentation';
export function sellerOrderAmounts(order:any){
 const gross=orderAmount(order.committedGross),unit=orderAmount(order.lockedUnitPrice),allocated=orderAmount(order.sellerAllocated),claimed=orderAmount(order.sellerClaimedAmount),remaining=orderAmount(order.sellerClaimable),rebate=orderAmount(order.rebateAllocated),refund=orderAmount(order.buyerRefundAllocated);
 const known=order.accountingVerified===true&&gross!==null&&unit!==null&&Number.isSafeInteger(order.quantity)&&order.quantity>0&&unit*BigInt(order.quantity)===gross&&allocated!==null&&claimed!==null&&remaining!==null&&rebate!==null&&refund!==null&&allocated+rebate+refund<=gross&&claimed<=allocated&&allocated-claimed===remaining;
 return {allocated,claimed:known?claimed:null,remaining:known?remaining:null};
}
export function canCheckSettlement(order:any,nowSeconds:number){const deadline=recordedDeadline(order.disputeDeadline);return order.deliveryStatus==='DELIVERED'&&deadline!==null&&nowSeconds>deadline;}
export function sellerCampaignStatus(status:unknown,language:string){const en=language==='en',labels:Record<string,[string,string]>={DRAFT:['Bản nháp','Draft'],PUBLISHED:['Đã xuất bản','Published'],ACTIVE:['Đang mở','Open'],FINALIZED:['Đã chốt','Finalized'],CANCELLED:['Đã hủy','Cancelled']};return typeof status==='string'&&Object.prototype.hasOwnProperty.call(labels,status)?labels[status][en?1:0]:en?'Campaign state unverified':'Chưa xác minh trạng thái campaign';}
const object=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v),id=(v:any)=>typeof v==='string'&&/^[-A-Za-z0-9:_]{1,180}$/.test(v)&&!['constructor','__proto__','prototype'].includes(v),wallet=(v:any)=>typeof v==='string'&&/^0x[a-fA-F0-9]{40}$/.test(v);
/** Legacy DTOs may lack owner metadata; an explicit mismatch always rejects the complete response. */
export function validateSellerData(c:any,o:any,w:any,ownerId:string){
 if(!object(c)||!object(o)||!object(w)||!Array.isArray(c.campaigns)||!Array.isArray(o.orders)||c.sellerAccountId!==undefined&&c.sellerAccountId!==ownerId||o.sellerAccountId!==undefined&&o.sellerAccountId!==ownerId)throw Error('SELLER_DATA_INVALID');
 for(const [rows,ownerField] of [[c.campaigns,'sellerId'],[o.orders,'sellerAccountId']] as const){if(rows.some((r:any)=>!object(r)||!id(r.id)||r[ownerField]!==undefined&&r[ownerField]!==ownerId)||new Set(rows.map((r:any)=>r.id)).size!==rows.length)throw Error('SELLER_DATA_INVALID');}
 if(o.orders.some((r:any)=>!id(r.campaignId)))throw Error('SELLER_DATA_INVALID');
 if(c.campaigns.some((r:any)=>r.title!==undefined&&typeof r.title!=='string'||r.sellerPayoutWallet!==undefined&&!wallet(r.sellerPayoutWallet))||o.orders.some((r:any)=>r.buyerPrincipal!==undefined&&!wallet(r.buyerPrincipal)||r.sellerPayoutWallet!==undefined&&!wallet(r.sellerPayoutWallet)))throw Error('SELLER_DATA_INVALID');
 if(w.webhook!==undefined&&w.webhook!==null&&(!object(w.webhook)||!id(w.webhook.id)||w.webhook.sellerId!==undefined&&w.webhook.sellerId!==ownerId||typeof w.webhook.targetUrl!=='string'||w.webhook.secret!==undefined&&w.webhook.secret!==null&&typeof w.webhook.secret!=='string'||w.webhook.logs!==undefined&&!Array.isArray(w.webhook.logs)))throw Error('SELLER_DATA_INVALID');
 if(w.webhook?.logs?.some((l:any)=>!object(l)||!id(l.id)||typeof l.event!=='string'||!['SUCCESS','FAILED'].includes(l.status)||l.statusCode!==undefined&&l.statusCode!==null&&(!Number.isSafeInteger(l.statusCode)||l.statusCode<100||l.statusCode>599)))throw Error('SELLER_DATA_INVALID');
 return {campaigns:c.campaigns,orders:o.orders,webhook:w.webhook??null};
}
