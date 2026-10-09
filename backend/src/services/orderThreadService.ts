import {hasOperatorCapability} from '../domain/operatorCapability';
import crypto from 'node:crypto';
import {z} from 'zod';
import {store,SupportMessageRecord,NotificationRecord,EmailOutboxRecord} from '../db/store';
import {StorageConflict,OrderThreadState,OrderThreadPlan} from '../db/rowPersistence';
import {SessionService,SessionError,SessionProof} from './sessionService';
import {verifiedContactEmailFor} from './contactIdentity';
import {encryptEntitlement} from '../utils/crypto';
export class OrderThreadError extends Error{constructor(public code:string,public status:number){super(code)}}
const id=z.string().regex(/^[A-Za-z0-9:_-]{1,180}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const text=z.string().max(4000).transform(v=>v.trim()).refine(v=>v.length>0);
const message=z.object({id:z.string().min(1).max(80),orderId:id,senderRole:z.enum(['buyer','seller','operator']),senderWallet:z.string().min(1).max(320),text:z.string().min(1).max(4500),timestamp:z.number().int().nonnegative().max(8640000000000000)});
const preferences=z.object({inApp:z.boolean(),email:z.boolean()});
export class OrderThreadService{
 private static selection(proof:SessionProof|undefined,orderId:string){if(!proof)throw new SessionError('AUTH_SESSION_INACTIVE',401);const parsed=id.safeParse(orderId);if(!parsed.success)throw new OrderThreadError('ORDER_THREAD_INPUT_INVALID',400);return{actorId:proof.account.id,sessionKey:proof.key,operatorProof:proof,orderId:parsed.data};}
 private static authority(proof:SessionProof,state:OrderThreadState,orderId:string){
  const user=SessionService.assertCommitted(proof,state.auth),order=state.order;
  if(!order)throw new OrderThreadError('ORDER_THREAD_NOT_FOUND',404);
  if(order.id!==orderId||typeof order.buyerAccountId!=='string'||typeof order.campaignId!=='string'||state.campaign&&state.campaign.id!==order.campaignId)throw new OrderThreadError('ORDER_THREAD_UNAVAILABLE',503);
  const role:'buyer'|'seller'|'operator'|undefined=hasOperatorCapability(proof,state.auth)?'operator':state.campaign?.sellerId===user.id?'seller':order.buyerAccountId===user.id?'buyer':undefined;
  if(!role)throw new OrderThreadError('ORDER_THREAD_FORBIDDEN',403);
  return{user,role};
 }
 private static failure(error:unknown):never{if(error instanceof SessionError||error instanceof OrderThreadError)throw error;if(error instanceof StorageConflict||error instanceof Error&&error.message.startsWith('CONFLICT:'))throw new OrderThreadError('ORDER_THREAD_CONFLICT',409);throw new OrderThreadError('ORDER_THREAD_UNAVAILABLE',503);}
 public static list(proof:SessionProof|undefined,orderId:string):SupportMessageRecord[]{
  const selection=this.selection(proof,orderId);try{const state=store.readOrderThreadState(selection);this.authority(proof!,state,orderId);return state.messages.map(m=>{const p=message.safeParse(m);if(!p.success||p.data.orderId!==orderId)throw new OrderThreadError('ORDER_THREAD_UNAVAILABLE',503);return p.data});}catch(e){return this.failure(e)}
 }
 public static send(proof:SessionProof|undefined,orderId:string,input:unknown):SupportMessageRecord{
  const selection=this.selection(proof,orderId),parsed=z.object({text}).safeParse(input);if(!parsed.success)throw new OrderThreadError('ORDER_THREAD_INPUT_INVALID',400);
  try{return store.mutateOrderThread(selection,state=>{
   const {user,role}=this.authority(proof!,state,orderId);if(state.messages.some(m=>!message.safeParse(m).success||m.orderId!==orderId))throw new OrderThreadError('ORDER_THREAD_UNAVAILABLE',503);
   const timestamp=Date.now(),m:SupportMessageRecord={id:'msg_'+crypto.randomUUID(),orderId,senderRole:role,senderWallet:user.activeWallet||user.email,text:parsed.data.text,timestamp};
   if(!message.safeParse(m).success)throw new OrderThreadError('ORDER_THREAD_UNAVAILABLE',503);
   const notices:OrderThreadPlan<SupportMessageRecord>['notices']=[];
   for(const r of state.recipients){
    const userId=r.user.id,targets=[...(role!=='buyer'?[state.order!.buyerAccountId]:[]),...(role!=='seller'&&state.campaign?[state.campaign.sellerId]:[])];if(!targets.includes(userId))continue;
    const prefs=preferences.safeParse(r.preferences??{inApp:true,email:true});if(!prefs.success)throw new OrderThreadError('ORDER_THREAD_UNAVAILABLE',503);
    const id='ntf_'+crypto.createHash('sha256').update(userId+':'+m.id).digest('hex'),n:NotificationRecord={id,userId,type:'SUPPORT_MESSAGE',title:'Có tin nhắn mới về order',message:'Order #'+orderId+' có phản hồi mới từ '+role+'.',link:userId===state.order!.buyerAccountId?'#orders':'#seller',createdAt:timestamp,inAppEnabled:prefs.data.inApp,translations:{en:{title:'New order support message',message:'Order #'+orderId+' has a new '+role+' response.'}},source:{kind:'SUPPORT_MESSAGE',eventId:m.id,orderId,occurredAt:timestamp}};
    const to=prefs.data.email?verifiedContactEmailFor(userId,r.user):null;
    const mail:EmailOutboxRecord|undefined=to?{id:'mail_'+id,notificationId:id,userId,status:'QUEUED',attempts:0,nextAttemptAt:timestamp,createdAt:timestamp,payloadEncrypted:encryptEntitlement(JSON.stringify({version:1,outboxId:'mail_'+id,userId,notificationId:id,to,subject:n.title,text:n.message}))}:undefined;
    notices.push({notification:n,...(mail?{mail}:{})});
   }
   return{result:m,message:m,notices};
  })}catch(e){return this.failure(e)}
 }
}
