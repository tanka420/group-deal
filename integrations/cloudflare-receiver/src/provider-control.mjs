import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {packageSha256,packageBase64} from '../.cache/csv-studio-package.mjs';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(x);
const wallet=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x);
const digest=raw=>createHash('sha256').update(raw).digest('hex');
const sign=(env,direction,raw)=>'sha256='+createHmac('sha256',env.GROUPDEAL_WEBHOOK_SECRET).update('groupdeal:provider:'+direction+':v1:'+raw).digest('hex');
const privateHeaders={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const fail=status=>new Response(JSON.stringify({error:'PROVIDER_REQUEST_NOT_ACCEPTED'}),{status,headers:privateHeaders});

export async function providerControl(request,env,raw){
 try{
  const signature=request.headers.get('x-groupdeal-provider-signature')||'';
  if(Buffer.byteLength(raw)>8192||!/^sha256=[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(env,'request',raw))))return fail(401);
  const e=JSON.parse(raw),fields=['schema','action','nonce','issuedAt','expiresAt','subscriptionId','campaignId','productVersionId','licenseVersionId','chainId','hubAddress'];
  if(e?.action==='RESOLVE')fields.push('orderId','buyerPrincipal','quantity','commitmentTxHash');
  if(!e||Array.isArray(e)||Object.keys(e).sort().join(',')!==fields.sort().join(',')||e.schema!=='GroupDealProviderRequestV1'||!['PROBE','RESOLVE'].includes(e.action)
   ||typeof e.nonce!=='string'||!/^[a-f0-9]{64}$/.test(e.nonce)||!Number.isSafeInteger(e.issuedAt)||!Number.isSafeInteger(e.expiresAt)
   ||e.issuedAt>Date.now()+30000||e.expiresAt<=Date.now()||e.expiresAt-e.issuedAt!==60000
   ||!['subscriptionId','campaignId','productVersionId','licenseVersionId'].every(k=>id(e[k]))
   ||e.subscriptionId!==env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID||e.campaignId!==env.CSV_STUDIO_CAMPAIGN_ID
   ||e.productVersionId!==env.CSV_STUDIO_PRODUCT_VERSION_ID||e.licenseVersionId!==env.CSV_STUDIO_LICENSE_VERSION_ID
   ||e.chainId!==5042002||!wallet(e.hubAddress)||!wallet(env.CSV_STUDIO_HUB_ADDRESS)||e.hubAddress.toLowerCase()!==env.CSV_STUDIO_HUB_ADDRESS.toLowerCase())return fail(401);
  await env.DB.prepare('SELECT order_id FROM csv_studio_grants LIMIT 1').all();
  const reply={schema:'GroupDealProviderResponseV1',action:e.action,requestSha256:digest(raw),packageSha256,byteLength:Buffer.from(packageBase64,'base64').length};
  if(e.action==='RESOLVE'){
   if(!id(e.orderId)||!wallet(e.buyerPrincipal)||!Number.isSafeInteger(e.quantity)||e.quantity<1||e.quantity>10||typeof e.commitmentTxHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(e.commitmentTxHash))return fail(401);
   const grant=await env.DB.prepare('SELECT * FROM csv_studio_grants WHERE subscription_id=? AND order_id=?').bind(e.subscriptionId,e.orderId).first();
   const fingerprint=digest(JSON.stringify([e.orderId,e.campaignId,e.chainId,e.hubAddress.toLowerCase(),e.buyerPrincipal.toLowerCase(),e.quantity,e.commitmentTxHash.toLowerCase()]));
   if(!grant||grant.context_sha256!==fingerprint||grant.state!=='ACTIVE'||grant.expires_at<=Date.now())return fail(409);
   reply.grant={orderId:e.orderId,buyerPrincipal:grant.buyer_principal,quantity:grant.quantity,expiresAt:grant.expires_at,
    downloadUrl:new URL('/entitlements/'+grant.download_token+'/csv-studio.zip',request.url).href};
  }
  const body=JSON.stringify(reply);return new Response(body,{headers:{...privateHeaders,'X-GroupDeal-Provider-Signature':sign(env,'response',body)}});
 }catch{return fail(503);}
}
