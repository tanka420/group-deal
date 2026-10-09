import {UiError,uiMessage} from '../utils/uiMessage';
export type CanceledResourceReceipt={schema:'GroupDealResourceCommandV1';commandId:string;sellerAccountId:string;kind:'CANCEL';status:'CANCELED';committedAt:number};
/** Cancellation reserves an actor/command namespace; it contains no resource or publication outcome. */
export function readCanceledResourceReceipt(value:unknown,actorId:string,commandId:string):CanceledResourceReceipt|null {
 const receipt=value&&typeof value==='object'&&!Array.isArray(value)?(value as Record<string,unknown>).receipt:null;
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||(receipt as Record<string,unknown>).status!=='CANCELED')return null;
 const r=receipt as Record<string,unknown>;
 if(Object.keys(r).sort().join(',')!=='commandId,committedAt,kind,schema,sellerAccountId,status'||r.schema!=='GroupDealResourceCommandV1'||r.kind!=='CANCEL'||r.commandId!==commandId||r.sellerAccountId!==actorId||typeof r.committedAt!=='number'||!Number.isSafeInteger(r.committedAt)||r.committedAt<0||r.committedAt>8640000000000000)throw new UiError(uiMessage('Chưa xác nhận kết quả hủy. Giữ checkpoint và kiểm tra lại.','The cancellation result is unconfirmed. Keep the checkpoint and check again.'));
 return{schema:'GroupDealResourceCommandV1',commandId,sellerAccountId:actorId,kind:'CANCEL',status:'CANCELED',committedAt:r.committedAt};
}
