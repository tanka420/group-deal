import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac,createHash} from 'node:crypto';
import {readFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {providerRequest,providerSignature,providerDigest,verifyProviderReply,assertProviderRequestTime} from '../src/domain/providerContract';

const project=path.resolve('../integrations/cloudflare-receiver'),{Miniflare}=createRequire(project+'/package.json')('miniflare');
const secret='fixture-provider-control-public-secret-only';
const scope={subscriptionId:'wh_provider_contract_fixture',campaignId:'draft_new_provider_fixture',productVersionId:'pv_fixture',licenseVersionId:'lv_fixture',chainId:5042002 as const,hubAddress:'0x'+'1'.repeat(40)};
const origin='https://provider.example.test',target=origin+'/webhooks/groupdeal';
async function main(){
 const config={name:'provider-contract-test',compatibilityDate:'2026-10-21',compatibilityFlags:['nodejs_compat'],manifest:{mainModule:'worker.js',modulesRoot:project+'/.cache/bundle',modules:{'worker.js':{type:'esm',contents:await readFile(project+'/.cache/bundle/worker.js','utf8')}}},env:{DB:{type:'d1',id:'00000000-0000-0000-0000-000000000003'},...Object.fromEntries(Object.entries({GROUPDEAL_API_URL:'https://groupdeal.tech',GROUPDEAL_WEBHOOK_SECRET:secret,GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID:scope.subscriptionId,CSV_STUDIO_CAMPAIGN_ID:scope.campaignId,CSV_STUDIO_PRODUCT_VERSION_ID:scope.productVersionId,CSV_STUDIO_LICENSE_VERSION_ID:scope.licenseVersionId,CSV_STUDIO_HUB_ADDRESS:scope.hubAddress}).map(([key,value])=>[key,{type:'text',value}]))}};
 const mf=new Miniflare({host:'127.0.0.1',telemetry:{enabled:false},workers:[{config}],resourcePersistencePath:await mkdtemp(project+'/.cache/control-test-')});
 try{
  const db=await mf.getD1Database('DB');for(const name of ['0001_inbox.sql','0002_csv_studio.sql'])await db.batch((await readFile(project+'/migrations/'+name,'utf8')).split(';').map(x=>x.trim()).filter(Boolean).map(x=>db.prepare(x)));
  const send=(raw:string,signature=providerSignature(secret,'request',raw))=>mf.dispatchFetch(target,{method:'POST',body:raw,headers:{'Content-Type':'application/json','X-GroupDeal-Provider-Signature':signature}});
  const probe=providerRequest(scope),raw=JSON.stringify(probe),response=await send(raw);assert.equal(response.status,200);const replyRaw=await response.text(),signature=response.headers.get('x-groupdeal-provider-signature')!;
  const reply=verifyProviderReply(probe,secret,target,replyRaw,signature);assert.equal(reply.action,'PROBE');assert.equal(reply.byteLength,6594);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM csv_studio_grants').first()).n,0);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal((await send(raw+' ',providerSignature(secret,'request',raw))).status,401);
  assert.throws(()=>verifyProviderReply({...probe,nonce:'f'.repeat(64)},secret,target,replyRaw,signature));
  assert.throws(()=>verifyProviderReply(probe,secret,target,replyRaw+' ',signature));
  assert.throws(()=>verifyProviderReply(probe,secret,target,replyRaw,'sha256='+'0'.repeat(64)));
  const stale={...probe,issuedAt:Date.now()-120000,expiresAt:Date.now()-60000};assert.equal((await send(JSON.stringify(stale))).status,401);assert.throws(()=>assertProviderRequestTime(stale));
  for(const field of ['subscriptionId','campaignId','productVersionId','licenseVersionId','hubAddress'])assert.equal((await send(JSON.stringify({...probe,[field]:field==='hubAddress'?'0x'+'9'.repeat(40):'foreign_value'}))).status,401);
  assert.equal((await send(JSON.stringify({...probe,extra:'unexpected'}))).status,401);
  assert.equal((await send(JSON.stringify({...probe,expiresAt:probe.expiresAt+1}))).status,401);
  const order={orderId:'order_control_fixture',buyerPrincipal:'0x'+'2'.repeat(40),quantity:1,commitmentTxHash:'0x'+'3'.repeat(64)},resolve=providerRequest(scope,order);
  assert.equal((await send(JSON.stringify(resolve))).status,409);
  const event={id:'evt_control_grant_fixture',event:'order.committed',timestamp:Math.floor(Date.now()/1000),createdAt:Date.now(),data:{id:order.orderId,campaignId:scope.campaignId,chainId:scope.chainId,hubAddress:scope.hubAddress,buyerPrincipal:order.buyerPrincipal,quantity:order.quantity,commitmentTxHash:order.commitmentTxHash,deliveryStatus:'PENDING'}};
  const eventRaw=JSON.stringify(event);assert.equal((await mf.dispatchFetch(target,{method:'POST',body:eventRaw,headers:{'Content-Type':'application/json','X-GroupDeal-Signature':'sha256='+createHmac('sha256',secret).update(event.timestamp+'.'+eventRaw).digest('hex'),'X-GroupDeal-Event':event.event,'X-GroupDeal-Event-Id':event.id,'X-GroupDeal-Timestamp':String(event.timestamp)}})).status,202);
  const resolved=await send(JSON.stringify(resolve));assert.equal(resolved.status,200);const resolvedRaw=await resolved.text(),resolvedSignature=resolved.headers.get('x-groupdeal-provider-signature')!;
  const verified=verifyProviderReply(resolve,secret,target,resolvedRaw,resolvedSignature);assert.equal(verified.action,'RESOLVE');if(verified.action!=='RESOLVE')throw Error();
  const zip=await mf.dispatchFetch(verified.grant.downloadUrl);assert.equal(zip.status,200);const bytes=Buffer.from(await zip.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),verified.packageSha256);
  const redirected={...verified,grant:{...verified.grant,downloadUrl:verified.grant.downloadUrl.replace('provider.example.test','foreign.example.test')}},redirectedRaw=JSON.stringify(redirected);assert.throws(()=>verifyProviderReply(resolve,secret,target,redirectedRaw,providerSignature(secret,'response',redirectedRaw)));
  for(const changed of [{quantity:2},{buyerPrincipal:'0x'+'4'.repeat(40)},{orderId:'order_foreign'},{commitmentTxHash:'0x'+'5'.repeat(64)}])assert.equal((await send(JSON.stringify(providerRequest(scope,{...order,...changed})))).status,409);
  await db.prepare("UPDATE csv_studio_grants SET state='REVOKED'").run();assert.equal((await send(JSON.stringify(resolve))).status,409);
  await db.prepare('DROP TABLE csv_studio_grants').run();assert.equal((await send(raw)).status,503);
  assert.equal(providerDigest(raw).length,64);
  console.log('PASS provider contract: real bundled Worker conformance, nonce/body/signature/expiry/scope isolation, no-effect probe, actual protected ZIP resolve, foreign-order denial, revocation and schema failure; synthetic local only.');
 }finally{await mf.dispose();}
}
main().catch(()=>{console.error('FAIL provider contract; no payloads or capabilities printed');process.exitCode=1;});
