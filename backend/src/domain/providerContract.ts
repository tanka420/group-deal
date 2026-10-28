import {ARC_CHAIN_ID} from '../../../shared/network.mjs';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),wallet=z.string().regex(/^0x[0-9a-fA-F]{40}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
const time=z.number().int().nonnegative().safe();
const scope={subscriptionId:id,campaignId:id,productVersionId:id,licenseVersionId:id,chainId:z.literal(ARC_CHAIN_ID),hubAddress:wallet};
export const providerScopeSchema=z.object(scope).strict();
export type ProviderScope=z.infer<typeof providerScopeSchema>;
const base={schema:z.literal('GroupDealProviderRequestV1'),nonce:hash,issuedAt:time,expiresAt:time,...scope};
export const providerRequestSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('PROBE')}).strict(),
 z.object({...base,action:z.literal('RESOLVE'),orderId:id,buyerPrincipal:wallet,quantity:z.number().int().min(1).max(10),commitmentTxHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict(),
]);
export type ProviderRequest=z.infer<typeof providerRequestSchema>;
const replyBase={schema:z.literal('GroupDealProviderResponseV1'),requestSha256:hash,packageSha256:hash,byteLength:z.number().int().positive().max(16*1024*1024)};
export const providerReplySchema=z.discriminatedUnion('action',[
 z.object({...replyBase,action:z.literal('PROBE')}).strict(),
 z.object({...replyBase,action:z.literal('RESOLVE'),grant:z.object({orderId:id,buyerPrincipal:wallet,quantity:z.number().int().min(1).max(10),expiresAt:time,downloadUrl:z.string().url().max(2000)}).strict()}).strict(),
]);
export type ProviderReply=z.infer<typeof providerReplySchema>;
export const providerDigest=(raw:string)=>createHash('sha256').update(raw).digest('hex');
export const providerSignature=(secret:string,direction:'request'|'response',raw:string)=>'sha256='+createHmac('sha256',secret).update('groupdeal:provider:'+direction+':v1:'+raw).digest('hex');
export function providerSignatureValid(secret:string,direction:'request'|'response',raw:string,signature:string){
 if(!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 return timingSafeEqual(Buffer.from(providerSignature(secret,direction,raw)),Buffer.from(signature));
}
export function providerRequest(scope:ProviderScope,order?:{orderId:string;buyerPrincipal:string;quantity:number;commitmentTxHash:string}):ProviderRequest {
 const issuedAt=Date.now();return providerRequestSchema.parse({schema:'GroupDealProviderRequestV1',action:order?'RESOLVE':'PROBE',...scope,...order,nonce:randomBytes(32).toString('hex'),issuedAt,expiresAt:issuedAt+60000});
}
export function assertProviderRequestTime(request:ProviderRequest,now=Date.now()){
 if(request.issuedAt>now+30000||request.expiresAt<=now||request.expiresAt-request.issuedAt!==60000)throw Error('PROVIDER_REQUEST_EXPIRED');
}
export function verifyProviderReply(request:ProviderRequest,secret:string,target:string,raw:string,signature:string):ProviderReply{
 assertProviderRequestTime(request);
 if(Buffer.byteLength(raw)>8192||!providerSignatureValid(secret,'response',raw,signature))throw Error('PROVIDER_REPLY_INVALID');
 const reply=providerReplySchema.parse(JSON.parse(raw));
 if(reply.action!==request.action||reply.requestSha256!==providerDigest(JSON.stringify(request)))throw Error('PROVIDER_REPLY_CONTEXT');
 if(reply.action==='RESOLVE'&&request.action==='RESOLVE'){
  const grant=reply.grant,url=new URL(grant.downloadUrl),endpoint=new URL(target);
  if(grant.orderId!==request.orderId||grant.buyerPrincipal.toLowerCase()!==request.buyerPrincipal.toLowerCase()||grant.quantity!==request.quantity
   ||grant.expiresAt<=Date.now()||grant.expiresAt>Date.now()+31*86400000||url.origin!==endpoint.origin||url.protocol!=='https:'||url.username||url.password||url.search||url.hash
   ||!/^\/entitlements\/[a-f0-9]{64}\/csv-studio\.zip$/.test(url.pathname))throw Error('PROVIDER_GRANT_CONTEXT');
 }
 return reply;
}
