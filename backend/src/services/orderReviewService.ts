import {ethers} from 'ethers';
import {store,OrderRecord} from '../db/store';
import {StorageConflict,OrderReviewState} from '../db/rowPersistence';
import {SessionService,SessionError,SessionProof} from './sessionService';
import {config} from '../config';
import {OrderReviewError,reviewOrderId,reviewInput,replyInput,storedReview,indexedReviewEligible} from '../domain/orderReview';
export {OrderReviewError} from '../domain/orderReview';
export type ReviewOrderResult={order:OrderRecord;hasEntitlement:boolean};
export class OrderReviewService{
 private static selection(proof:SessionProof|undefined,orderId:string,kind:'SUBMIT'|'REPLY'){if(!proof)throw new SessionError('AUTH_SESSION_INACTIVE',401);const parsed=reviewOrderId.safeParse(orderId);if(!parsed.success)throw new OrderReviewError('ORDER_REVIEW_INPUT_INVALID',400);return{actorId:proof.account.id,sessionKey:proof.key,orderId:parsed.data,kind};}
 private static authority(proof:SessionProof,state:OrderReviewState,orderId:string,kind:'SUBMIT'|'REPLY'){
  const user=SessionService.assertCommitted(proof,state.auth),order=state.order;if(!order)throw new OrderReviewError('ORDER_REVIEW_NOT_FOUND',404);
  if(order.id!==orderId)throw new OrderReviewError('ORDER_REVIEW_UNAVAILABLE',503);
  if(kind==='SUBMIT'?order.buyerAccountId!==user.id:state.campaign?.sellerId!==user.id||!user.roles.includes('seller'))throw new OrderReviewError('ORDER_REVIEW_FORBIDDEN',403);
  return order;
 }
 private static failure(e:unknown):never{if(e instanceof SessionError||e instanceof OrderReviewError)throw e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))throw new OrderReviewError('ORDER_REVIEW_CONFLICT',409);throw new OrderReviewError('ORDER_REVIEW_UNAVAILABLE',503);}
 public static submit(proof:SessionProof|undefined,orderId:string,input:unknown):ReviewOrderResult{
  const parsed=reviewInput.safeParse(input);if(!parsed.success)throw new OrderReviewError('ORDER_REVIEW_INPUT_INVALID',400);const selection=this.selection(proof,orderId,'SUBMIT');
  try{return store.mutateOrderReview(selection,state=>{
   const order=this.authority(proof!,state,orderId,'SUBMIT'),previous=order.review;
   if(previous){const old=storedReview.safeParse(previous);if(!old.success)throw new OrderReviewError('ORDER_REVIEW_UNAVAILABLE',503);if(old.data.score!==parsed.data.score||old.data.comment!==parsed.data.comment)throw new OrderReviewError('ORDER_REVIEW_ALREADY_SUBMITTED',409);return{result:{order,hasEntitlement:state.hasEntitlement}};}
   if(!indexedReviewEligible({...state,order},{chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,deploymentBlock:config.deploymentBlock}))throw new OrderReviewError('ORDER_REVIEW_NOT_ELIGIBLE',400);
   const review={...parsed.data,createdAt:Date.now()};return{result:{order:{...order,review},hasEntitlement:state.hasEntitlement},review,commentHash:ethers.keccak256(ethers.toUtf8Bytes(review.comment))};
  })}catch(e){return this.failure(e)}
 }
 public static reply(proof:SessionProof|undefined,orderId:string,input:unknown):ReviewOrderResult{
  const parsed=replyInput.safeParse(input);if(!parsed.success)throw new OrderReviewError('ORDER_REVIEW_INPUT_INVALID',400);const selection=this.selection(proof,orderId,'REPLY');
  try{return store.mutateOrderReview(selection,state=>{const order=this.authority(proof!,state,orderId,'REPLY');if(!order.review)throw new OrderReviewError('ORDER_REVIEW_MISSING',400);const previous=storedReview.safeParse(order.review);if(!previous.success)throw new OrderReviewError('ORDER_REVIEW_UNAVAILABLE',503);const response=parsed.data.sellerResponse;if(previous.data.sellerResponse===response)return{result:{order,hasEntitlement:state.hasEntitlement}};return{result:{order:{...order,review:{...previous.data,sellerResponse:response}},hasEntitlement:state.hasEntitlement},sellerResponse:response,responseHash:ethers.keccak256(ethers.toUtf8Bytes(response))};})}catch(e){return this.failure(e)}
 }
}
