const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const crypto=require("node:crypto");
const {spawnSync,fork}=require("node:child_process");
const {DatabaseSync}=require("node:sqlite");

async function run(){
  const root=path.resolve(__dirname,"../.."),sdkRoot=path.join(root,"sdk");
  const consumer=fs.mkdtempSync(path.join(root,".cache","sdk-consumer-"));
  const npm=process.env.npm_execpath;
  assert.ok(npm,"Run through npm test so the npm executable is explicit");
  const command=(args,cwd)=>{
    const result=spawnSync(process.execPath,[npm,...args],{cwd,encoding:"utf8",windowsHide:true});
    assert.equal(result.status,0,"Isolated package command failed");return result.stdout;
  };
  const packed=JSON.parse(command(["pack","--json","--ignore-scripts","--pack-destination="+consumer,"--cache="+path.join(root,".cache","npm")],sdkRoot))[0];
  assert.ok(packed.files.every(({path:p})=>p==="package.json"||p==="README.md"||p==="examples/receiver.cjs"||p.startsWith("dist/")),"Package includes an unexpected source/private file");
  assert.ok(packed.files.some(({path:p})=>p==="dist/index.d.ts"));
  fs.writeFileSync(path.join(consumer,"package.json"),JSON.stringify({name:"local-sdk-consumer",private:true,version:"1.0.0"}));
  command(["install",path.join(consumer,packed.filename),"--ignore-scripts","--no-audit","--no-fund","--offline","--cache="+path.join(root,".cache","npm")],consumer);
  fs.writeFileSync(path.join(consumer,"consumer.ts"),`import {GroupDealSDK,WebhookInbox,DeliveryOperation,BuyOperation,PublicWidgetData,PublicSeller,PublicSellerCampaign,SellerFollow,SellerFollowResult,SupportTicket,SupportCommandResult} from '@groupdeal/sdk';
const sdk=new GroupDealSDK({baseUrl:'https://api.example.test'});
const resources:Promise<{grants:import('@groupdeal/sdk').BuyerResourceGrant[]}>=sdk.getResourceGrants('fixture','order_fixture');void resources;
const downloaded:Promise<Uint8Array>=sdk.downloadResourceGrant('fixture',{} as import('@groupdeal/sdk').BuyerResourceGrant);void downloaded;
const activated:Promise<{success:true}>=sdk.redeemResourceGrant('fixture','grant_fixture','local-fixture-key');void activated;
// @ts-expect-error Resource download requires verified grant metadata.
sdk.downloadResourceGrant('fixture','grant_fixture');
const catalog:Promise<import('@groupdeal/sdk').PublicCatalog>=sdk.getCatalog({q:'studio',category:'Software',limit:12});void catalog;
// @ts-expect-error Search is text, not a number.
sdk.getCatalog({q:123});
const inbox:WebhookInbox={persist:async(subscription,event)=>!!subscription&&!!event.id};
const review:Promise<{review:import('@groupdeal/sdk').WebhookRecoveryReview}>=sdk.prepareWebhookRecoveryReview('fixture','aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');void review;
const verifiedReview:Promise<{review:import('@groupdeal/sdk').WebhookRecoveryReview}>=sdk.verifyWebhookRecoveryReview('fixture','whr_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');void verifiedReview;
const result:Promise<{operation:DeliveryOperation}>=sdk.prepareDelivery('fixture','order_1','fixture-retry_1');
void inbox;void result;
const phase:DeliveryOperation['phase']='SUPERSEDED';void phase;
const expired:Promise<{operation:BuyOperation}>=sdk.expireBuyOperation('fixture','op_buy');void expired;
const expiryPhase:BuyOperation['phase']='EXPIRED';void expiryPhase;
const retried:Promise<{operation:DeliveryOperation}>=sdk.retryDelivery('fixture','op_delivery','delivery-retry:fixture');void retried;
const widget:Promise<PublicWidgetData>=sdk.getWidgetData('deal_1');void widget;
const seller:Promise<{seller:PublicSeller}>=sdk.getSeller('seller_1');void seller;
const sellerDeals:Promise<{campaigns:PublicSellerCampaign[]}>=sdk.listSellerCampaigns('seller_1');void sellerDeals;
const follows:Promise<{follows:SellerFollow[]}>=sdk.listSellerFollows('fixture',{limit:20});void follows;
const follow:Promise<SellerFollowResult>=sdk.updateSellerFollow('fixture','seller_1',{idempotencyKey:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',expectedRevision:0,following:true,notifyNewDeals:true,notifyDealUpdates:false});void follow;
const support:Promise<SupportCommandResult>=sdk.createSupportTicket('fixture',{idempotencyKey:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',kind:'ACCOUNT',orderId:null,subject:'Fixture support',message:'Fixture message'});void support;
const supportRead:Promise<{ticket:SupportTicket}>=sdk.getSupportTicket('fixture','tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');void supportRead;
// @ts-expect-error Support replies require an expected revision.
sdk.replySupportTicket('fixture','tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',{idempotencyKey:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',message:'Fixture reply'});
const observed:Promise<{operation:DeliveryOperation}>=sdk.observeOperation('fixture','op_1','0x'+'a'.repeat(64));void observed;
// @ts-expect-error A fulfillment without receipt hash must not compile.
sdk.fulfillOrder('fixture','order_1','fixture-content');`);
  const typed=spawnSync(process.execPath,[path.join(sdkRoot,"node_modules/typescript/bin/tsc"),"--noEmit","--strict","--skipLibCheck","--target","ES2022","--module","Node16","--moduleResolution","Node16","--typeRoots",path.join(sdkRoot,"node_modules/@types"),"consumer.ts"],{cwd:consumer,encoding:"utf8",windowsHide:true});
  assert.equal(typed.status,0,"Packed declaration consumer failed");
  const {GroupDealSDK,GroupDealApiError}=require(path.join(consumer,"node_modules/@groupdeal/sdk"));
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    requests.push({url:req.url,method:req.method,auth:req.headers.authorization,body:chunks.length?JSON.parse(Buffer.concat(chunks)):undefined});
    if(req.url.endsWith("/denied")){res.writeHead(401).end(JSON.stringify({code:"FORBIDDEN",error:"fixture-sensitive-server-message"}));return;}
    if(req.url.endsWith("/limited")){res.writeHead(429,{"Retry-After":"12"}).end(JSON.stringify({code:"RATE_LIMITED",error:"fixture-sensitive-server-message"}));return;}
    res.setHeader("Content-Type","application/json");res.end(JSON.stringify({success:true,operation:{id:"op_fixture",action:"DELIVER"},campaign:{id:"deal_1"},campaigns:[]}));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const sdk=new GroupDealSDK({baseUrl:"http://127.0.0.1:"+server.address().port,webhookSecret:"local-fixture-only",webhookSubscriptionId:"wh_fixture"});
    const hash="0x"+"a".repeat(64);
    await sdk.listCampaigns();await sdk.getCampaign("deal_1");
    await sdk.prepareDelivery("fixture-session","order_1","fixture-retry_1");
    await sdk.readyOperation("fixture-session","op_fixture");
    await sdk.submitOperation("fixture-session","op_fixture",hash);
    await sdk.recoverOperation("fixture-session","op_fixture",hash);
    await sdk.finishDelivery("fixture-session","op_fixture",hash);
    await sdk.fulfillOrder("fixture-session","order_1","fixture-content",hash);
    assert.deepEqual(requests.map(r=>r.url),["/api/v1/campaigns","/api/v1/campaigns/deal_1","/api/delivery/orders/order_1/prepare","/api/transactions/op_fixture/ready","/api/transactions/op_fixture/submit","/api/transactions/op_fixture/recover","/api/delivery/operations/op_fixture/finish","/api/seller/orders/order_1/deliver"]);
    assert.ok(requests.slice(2).every(r=>r.auth==="Bearer fixture-session"&&r.method==="POST"));
    assert.equal(requests[2].body.idempotencyKey,"fixture-retry_1");
    assert.ok(requests.slice(4).every(r=>r.body.txHash===hash));
    assert.ok(requests[7].body.secretContent==="fixture-content");
    await assert.rejects(async()=>sdk.fulfillOrder("fixture-session","order_1","fixture-content"),/transaction hash/);
    await assert.rejects(sdk.prepareDelivery(undefined,"order_1","fixture-retry_1"),/session/);
    await assert.rejects(async()=>sdk.getCampaign(undefined),/identifier/);
    await assert.rejects(async()=>sdk.getCampaign("../private"),/identifier/);
    assert.equal(requests.length,8,"Invalid requests reached the transport");
    await sdk.observeOperation("fixture-session","op_fixture",hash);
    const replacement="0x"+"b".repeat(64);await sdk.replaceOperation("fixture-session","op_fixture",hash,replacement,"0x1234");
    assert.equal(requests[8].url,"/api/transactions/op_fixture/observe");assert.deepEqual(requests[8].body,{txHash:hash});
    assert.equal(requests[9].url,"/api/transactions/op_fixture/replace");assert.deepEqual(requests[9].body,{previousTxHash:hash,txHash:replacement,rawOriginalTransaction:"0x1234"});
    await assert.rejects(async()=>sdk.replaceOperation("fixture-session","op_fixture",hash,hash),/Distinct/);
    await assert.rejects(async()=>sdk.observeOperation("fixture-session","op_fixture",hash,"not-serialized"),/envelope/);assert.equal(requests.length,10);
    await sdk.expireBuyOperation("fixture-session","op_buy");assert.equal(requests[10].url,"/api/transactions/op_buy/expire");assert.deepEqual(requests[10].body,{});assert.equal(requests[10].auth,"Bearer fixture-session");
    await assert.rejects(async()=>sdk.expireBuyOperation("fixture-session","../foreign"),/identifier/);await assert.rejects(sdk.expireBuyOperation(undefined,"op_buy"),/session/);assert.equal(requests.length,11,"Invalid expiry inputs reached the transport");
    await sdk.retryDelivery("fixture-session","op_delivery","delivery-retry:fixture");assert.equal(requests[11].url,"/api/delivery/operations/op_delivery/retry");assert.deepEqual(requests[11].body,{idempotencyKey:"delivery-retry:fixture"});assert.equal(requests[11].auth,"Bearer fixture-session");
    await assert.rejects(async()=>sdk.retryDelivery("fixture-session","op_delivery","bad"),/retry key/);await assert.rejects(sdk.retryDelivery(undefined,"op_delivery","delivery-retry:fixture"),/session/);assert.equal(requests.length,12,"Invalid delivery retry reached the transport");
    await sdk.getWidgetData("deal_1");assert.deepEqual(requests[12],{url:"/api/v1/campaigns/deal_1/widget-data",method:"GET",auth:undefined,body:undefined});
    await assert.rejects(async()=>sdk.getWidgetData("../private"),/identifier/);assert.equal(requests.length,13,"Invalid widget ID reached the transport");
    await sdk.getSeller('seller_1');assert.deepEqual(requests[13],{url:'/api/v1/sellers/seller_1',method:'GET',auth:undefined,body:undefined});
    await sdk.listSellerCampaigns('seller_1',{limit:2,sort:'oldest',cursor:'fixtureCursor'});assert.deepEqual(requests[14],{url:'/api/v1/sellers/seller_1/campaigns?limit=2&cursor=fixtureCursor&sort=oldest',method:'GET',auth:undefined,body:undefined});
    await assert.rejects(async()=>sdk.getSeller('../private'),/identifier/);assert.throws(()=>sdk.listSellerCampaigns('seller_1',{limit:0}),/limit/);assert.throws(()=>sdk.listSellerCampaigns('seller_1',{status:'DRAFT'}),/filter/);assert.equal(requests.length,15,'Invalid seller inputs reached the transport');
    await assert.rejects(sdk.getCampaign("denied"),e=>e instanceof GroupDealApiError&&e.status===401&&e.code==="FORBIDDEN"&&!e.message.includes("sensitive"));
    await assert.rejects(sdk.getCampaign("limited"),e=>e instanceof GroupDealApiError&&e.code==="RATE_LIMITED"&&e.retryAfterSeconds===12);
    await sdk.listCampaigns({limit:2,cursor:"fixtureCursor",status:"ACTIVE",metric:"UNITS_COUNT",sort:"oldest"});
    assert.equal(requests.at(-1).url,"/api/v1/campaigns?limit=2&cursor=fixtureCursor&status=ACTIVE&metric=UNITS_COUNT&sort=oldest");
    assert.throws(()=>sdk.listCampaigns({limit:101}),/limit/);
    await sdk.getCatalog({limit:12,q:'Studio & Pro',category:'Phần mềm',sort:'newest'});
    assert.deepEqual(requests.at(-1),{url:'/api/v1/catalog?limit=12&sort=newest&q=Studio+%26+Pro&category=Ph%E1%BA%A7n+m%E1%BB%81m',method:'GET',auth:undefined,body:undefined});
    const catalogueReadCount=requests.length;
    for(const bad of [{q:'x'.repeat(121)},{category:'x'.repeat(81)},{q:'x\u0000'},{category:['Software']},{q:123}])assert.throws(()=>sdk.getCatalog(bad),/catalog filter/);
    assert.equal(requests.length,catalogueReadCount,'Invalid catalogue input reached the anonymous transport');
    console.log('PASS LOCAL_PACKED_SDK_CATALOG: public catalogue type import, anonymous escaped query and five invalid filter inputs blocked before transport.');
    const followInput={idempotencyKey:crypto.randomUUID(),expectedRevision:0,following:true,notifyNewDeals:true,notifyDealUpdates:false};
    await sdk.updateSellerFollow('fixture-session','seller_1',followInput);assert.equal(requests.at(-1).url,'/api/follows/sellers/seller_1');assert.equal(requests.at(-1).method,'POST');assert.equal(requests.at(-1).auth,'Bearer fixture-session');assert.deepEqual(requests.at(-1).body,followInput);
    await sdk.getSellerFollowCommand('fixture-session','seller_1',followInput.idempotencyKey);assert.equal(requests.at(-1).method,'GET');assert.equal(requests.at(-1).url,'/api/follows/sellers/seller_1/commands/'+followInput.idempotencyKey);
    await sdk.getSellerFollow('fixture-session','seller_1');assert.equal(requests.at(-1).url,'/api/follows/sellers/seller_1');
    await sdk.listSellerFollows('fixture-session',{limit:20,cursor:'fixture.'+'a'.repeat(64)});assert.equal(requests.at(-1).url,'/api/follows/sellers?limit=20&cursor=fixture.'+'a'.repeat(64));
    const beforeBad=requests.length;assert.throws(()=>sdk.getSellerFollow('','seller_1'),/session/);assert.throws(()=>sdk.getSellerFollow('fixture','bad/id'),/seller/);assert.throws(()=>sdk.updateSellerFollow('fixture','seller_1',{...followInput,following:false}),/preferences/);assert.throws(()=>sdk.listSellerFollows('fixture',{cursor:'bad'}),/cursor/);assert.throws(()=>sdk.getSellerFollowCommand('fixture','seller_1','bad'),/command/);assert.equal(requests.length,beforeBad);
    assert.throws(()=>new GroupDealSDK({baseUrl:"http://public.example.test"}),/HTTPS/);
    assert.throws(()=>new GroupDealSDK({baseUrl:"https://account:credential@example.test"}),/HTTPS/);

    const timestamp=Math.floor(Date.now()/1000),event={id:"evt_fixture",event:"order.delivered",createdAt:Date.now(),timestamp,data:{onchainOrderId:1,deliveryStatus:"DELIVERED"}};
    const raw=JSON.stringify(event);
    const sign=(body,ts)=>"sha256="+crypto.createHmac("sha256","local-fixture-only").update(String(ts)+"."+body).digest("hex");
    const headers={signature:sign(raw,timestamp),timestamp:String(timestamp),eventId:event.id,event:event.event};
    assert.equal(sdk.verifyWebhookSignature(raw,headers.signature,headers.timestamp),true);
    for(const [body,sig,ts] of [[raw+" ",headers.signature,headers.timestamp],[raw,"sha256=ff",headers.timestamp],[raw,headers.signature,headers.timestamp+"junk"],[raw,sign(raw,timestamp-301),String(timestamp-301)]])assert.equal(sdk.verifyWebhookSignature(body,sig,ts),false);
    const dbPath=path.join(consumer,"inbox.sqlite");let database=new DatabaseSync(dbPath);
    database.exec("PRAGMA journal_mode=WAL;CREATE TABLE inbox(subscription TEXT,event TEXT,payload TEXT,PRIMARY KEY(subscription,event));");
    const inbox={persist:async(subscription,envelope)=>database.prepare("INSERT OR IGNORE INTO inbox VALUES(?,?,?)").run(subscription,envelope.id,JSON.stringify(envelope)).changes===1};
    const first=await sdk.receiveWebhook(raw,headers,inbox);assert.equal(first.accepted,true);assert.equal(first.duplicate,false);
    const duplicates=await Promise.all(Array.from({length:8},()=>sdk.receiveWebhook(raw,headers,inbox)));
    assert.ok(duplicates.every(r=>r.accepted&&r.duplicate&&!r.event));
    database.close();database=new DatabaseSync(dbPath);
    assert.equal((await sdk.receiveWebhook(raw,headers,inbox)).duplicate,true,"Restart lost the inbox deduplication");
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM inbox").get().n,1);
    assert.equal((await sdk.receiveWebhook(raw,{...headers,eventId:"evt_wrong"},inbox)).accepted,false);
    const invalid=JSON.stringify({...event,data:{secret:{nested:true}}});
    assert.equal((await sdk.receiveWebhook(invalid,{...headers,signature:sign(invalid,timestamp)},inbox)).accepted,false);
    await assert.rejects(sdk.receiveWebhook(raw,headers,{persist:async()=>{throw new Error("fixture unavailable");}}),/unavailable/);
    database.close();
    const reviewChallenge=await require('./webhookRecovery.cjs').verifyWebhookRecovery(GroupDealSDK,requests);
    const beforeReviewRequests=requests.length,key='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',reviewId='whr_'+key;
    await sdk.prepareWebhookRecoveryReview('fixture-session',key);await sdk.getWebhookRecoveryReview('fixture-session',reviewId);await sdk.verifyWebhookRecoveryReview('fixture-session',reviewId);
    assert.deepEqual(requests.slice(beforeReviewRequests),[{url:'/api/seller/webhooks/recovery-reviews',method:'POST',auth:'Bearer fixture-session',body:{idempotencyKey:key}},{url:'/api/seller/webhooks/recovery-reviews/'+reviewId,method:'GET',auth:'Bearer fixture-session',body:undefined},{url:'/api/seller/webhooks/recovery-reviews/'+reviewId+'/verify',method:'POST',auth:'Bearer fixture-session',body:{}}]);
    const receiverDb=path.join(consumer,"receiver.sqlite");
    let child;
    const launch=()=>new Promise((resolve,reject)=>{
      child=fork(path.join(consumer,"node_modules/@groupdeal/sdk/examples/receiver.cjs"),[],{cwd:consumer,execArgv:[],silent:true,windowsHide:true,env:{...process.env,PORT:"0",GROUPDEAL_API_URL:"https://api.example.test",GROUPDEAL_WEBHOOK_SECRET:"local-fixture-only",GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID:"wh_fixture",GROUPDEAL_INBOX_DB:receiverDb}});
      const timer=setTimeout(()=>{child.kill();reject(new Error("Packed receiver did not start"));},10000);
      child.once("message",message=>{clearTimeout(timer);resolve(message.port);});child.once("exit",()=>{clearTimeout(timer);reject(new Error("Packed receiver exited before ready"));});
    });
    const stop=()=>new Promise(resolve=>{child.once("exit",resolve);child.kill();});
    try {
      let port=await launch();
      const proof=await fetch('http://127.0.0.1:'+port+'/webhooks/groupdeal',{method:'POST',headers:{'Content-Type':'application/json','X-GroupDeal-Signature':reviewChallenge.headers.signature,'X-GroupDeal-Timestamp':reviewChallenge.headers.timestamp,'X-GroupDeal-Event-Id':reviewChallenge.headers.eventId,'X-GroupDeal-Event':reviewChallenge.headers.event},body:reviewChallenge.raw});
      assert.equal(proof.status,200);assert.deepEqual(await proof.json(),reviewChallenge.answer);
      const receive=async(body=raw,signature=headers.signature)=>fetch("http://127.0.0.1:"+port+"/webhooks/groupdeal",{method:"POST",headers:{"Content-Type":"application/json","X-GroupDeal-Signature":signature,"X-GroupDeal-Timestamp":headers.timestamp,"X-GroupDeal-Event-Id":headers.eventId,"X-GroupDeal-Event":headers.event},body});
      const accepted=await Promise.all(Array.from({length:6},()=>receive()));assert.ok(accepted.every(response=>response.status===202));
      const acknowledgements=await Promise.all(accepted.map(response=>response.json()));assert.equal(acknowledgements.filter(result=>!result.duplicate).length,1);
      assert.equal((await receive(raw+"tamper")).status,401);
      await stop();port=await launch();const afterRestart=await receive();assert.equal(afterRestart.status,202);assert.equal((await afterRestart.json()).duplicate,true);
      const inspection=new DatabaseSync(receiverDb,{readOnly:true});assert.equal(inspection.prepare("SELECT COUNT(*) AS n FROM webhook_inbox WHERE state='QUEUED'").get().n,1);inspection.close();
    }finally{if(child&&child.exitCode===null)await stop();}
    await require('./support.cjs').verifySupportSdk(GroupDealSDK,root);
    await require('./buyerResources.cjs').verifyBuyerResources(GroupDealSDK);
    console.log("PASS LOCAL_FIXTURE: packed install/types/API receipt contract, raw HMAC, durable concurrent inbox, executable HTTP receiver and process restart. No registry publication or live delivery proof.");
  }finally{await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error("SDK local consumer verification failed:",error.message);process.exitCode=1;});
