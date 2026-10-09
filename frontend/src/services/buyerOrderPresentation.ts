import {displayUSDC} from './orderAccounting';
const max=(1n<<256n)-1n;
export function orderAmount(value:unknown):bigint|null{if(typeof value!=='string'||!/^\d{1,78}$/.test(value))return null;const amount=BigInt(value);return amount<=max?amount:null;}
export function orderMoney(value:unknown):string|null{const amount=orderAmount(value);return amount===null?null:displayUSDC(amount);}
export function buyerOrderAmounts(order:any){
 const rebate=orderAmount(order.rebateAllocated),refund=orderAmount(order.buyerRefundAllocated),claimed=orderAmount(order.buyerClaimedAmount),remaining=orderAmount(order.buyerClaimable);
 const gross=orderAmount(order.committedGross),unitPrice=orderAmount(order.lockedUnitPrice),quantity=order.quantity;
 const known=order.accountingVerified===true&&gross!==null&&unitPrice!==null&&Number.isSafeInteger(quantity)&&quantity>0&&unitPrice*BigInt(quantity)===gross&&rebate!==null&&refund!==null&&claimed!==null&&remaining!==null&&rebate+refund<=gross&&rebate+refund>=claimed&&rebate+refund-claimed===remaining;
 const unpaidRebate=known&&rebate!>claimed!?rebate!-claimed!:0n;
 return {rebate,refund,remaining:known?remaining:null,unpaidRebate,unpaidRefund:known?remaining!-unpaidRebate:0n};
}
export function recordedDeadline(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=8640000000000?value:null;}
export function deliveryStatusText(status:unknown,language:string){const en=language==='en',labels:Record<string,[string,string]>={PENDING:['Chờ người bán giao sản phẩm','Awaiting seller delivery'],DELIVERED:['Đã ghi nhận giao hàng','Delivery recorded'],CONFIRMED:['Đã xác nhận hoàn tất','Receipt confirmed'],DISPUTED:['Đang trong diện tranh chấp','Dispute recorded'],BREACHED_REFUNDED:['Vi phạm SLA • Đã phân bổ quyền hoàn tiền','SLA breached • Refund rights allocated'],RESOLVED:['Đã trọng tài phán quyết','Arbitration recorded']};return typeof status==='string'&&Object.prototype.hasOwnProperty.call(labels,status)?labels[status][en?1:0]:en?'Delivery state unverified':'Chưa xác minh trạng thái giao hàng';}
export function canCheckDeliverySla(order:any,nowSeconds:number){return order.deliveryStatus==='PENDING'&&typeof order.finalizedAt==='number'&&Number.isSafeInteger(order.finalizedAt)&&order.finalizedAt>0&&typeof order.deliverySlaSeconds==='number'&&Number.isSafeInteger(order.deliverySlaSeconds)&&order.deliverySlaSeconds>0&&nowSeconds>order.finalizedAt+order.deliverySlaSeconds;}
