import {createHash} from 'node:crypto';
import {store} from '../db/store';
import {SessionService,SessionError,SessionProof} from './sessionService';
import {assertNewBusinessAction} from '../domain/accountAccess';
import {inspectProductImage,productImageId,ProductImage} from '../domain/productMedia';
import {config} from '../config';

export function publicProductImageUrl(id:string){
 const origin=new URL(config.publicAppUrl);if(origin.protocol!=='https:')throw Error('MEDIA_UNAVAILABLE');
 return origin.origin+'/api/product-images/'+id;
}
export function uploadProductImage(proof:SessionProof,bytes:Buffer){
 const mimeType=inspectProductImage(bytes),sha256=createHash('sha256').update(bytes).digest('hex'),id=productImageId(proof.account.id,sha256);
 return store.mutateProduct({actorId:proof.account.id,sessionKey:proof.key,mediaKey:id},state=>{
  const user=SessionService.assertCommitted(proof,state.auth);if(!user.roles.includes('seller')||proof.record.realm==='ADMIN')throw new SessionError('SELLER_ROLE_REQUIRED',403);assertNewBusinessAction(user,'SELLER');
  const response={id,sha256,mimeType,byteLength:bytes.length,url:publicProductImageUrl(id)};
  if(state.image){if(state.image.sellerId!==user.id||state.image.sha256!==sha256||state.image.byteLength!==bytes.length||state.image.mimeType!==mimeType||state.image.dataBase64!==bytes.toString('base64'))throw Error('MEDIA_UNAVAILABLE');return {result:response,writes:[],audit:[],mediaReplay:true};}
  if(!state.imageQuota||state.imageQuota.sellerBytes+bytes.length>12*1024*1024||state.imageQuota.totalBytes+bytes.length>32*1024*1024)throw Error('MEDIA_QUOTA_EXCEEDED');
  const value:ProductImage={id,sellerId:user.id,sha256,mimeType,byteLength:bytes.length,dataBase64:bytes.toString('base64'),createdAt:Date.now()};
  return {result:response,writes:[{kind:'INSERT',collection:'productImages',key:id,value}],audit:[{role:'seller',action:'PRODUCT_IMAGE_UPLOADED',details:{imageId:id,sha256,byteLength:bytes.length,mimeType}}]};
 });
}
export function readPublicProductImage(id:string){
 if(!/^img_[a-f0-9]{64}$/.test(id))return null;
 const image=store.readProductImage(id);if(!image)return null;
 const bytes=Buffer.from(image.dataBase64,'base64');if(bytes.length!==image.byteLength||createHash('sha256').update(bytes).digest('hex')!==image.sha256||productImageId(image.sellerId,image.sha256)!==id||inspectProductImage(bytes)!==image.mimeType)throw Error('MEDIA_UNAVAILABLE');
 return {bytes,mimeType:image.mimeType,sha256:image.sha256};
}
