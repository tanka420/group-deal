import assert from "node:assert/strict";
import crypto from "node:crypto";
import dns from "node:dns";
import path from "node:path";
import {EventEmitter} from "node:events";
import {store,TransactionalStore} from "../src/db/store";
import {WebhookService} from "../src/services/webhookService";
import {assertPublicWebhookAddress,postWebhook,resolveWebhookTarget} from "../src/services/webhookTransport";
import {encryptWebhookSecret,decryptWebhookSecret} from "../src/services/webhookSecret";
import {config} from "../src/config";

async function run(){
  const lookup=dns.promises.lookup,transport=(WebhookService as any).sendWebhook;
  const https=require("node:https"),request=https.request;
  try {
    for(const address of ["127.0.0.2","169.254.169.254","192.0.0.1","100.64.0.1","198.18.0.1","224.0.0.1","::1","::ffff:127.0.0.1","::ffff:7f00:1","fe90::1","fc01::1","fd12::1","2001:db8::1","2002:7f00:1::1"])assert.throws(()=>assertPublicWebhookAddress(address),/SSRF/);
    assert.doesNotThrow(()=>assertPublicWebhookAddress("8.8.8.8"));assert.doesNotThrow(()=>assertPublicWebhookAddress("2606:4700:4700::1111"));
    for(const url of ["https://user:credential@public.example.test/hook","https://public.example.test:8443/hook","https://[::ffff:7f00:1]/hook","https://127.1/hook","ftp://public.example.test/hook"])await assert.rejects(resolveWebhookTarget(url),/SSRF/);
    (dns.promises as any).lookup=async()=>[{address:"8.8.8.8",family:4},{address:"10.0.0.2",family:4}];
    await assert.rejects(resolveWebhookTarget("https://public.example.test/hook"),/SSRF/);
    (dns.promises as any).lookup=async()=>{throw new Error("fixture DNS unavailable");};
    await assert.rejects(resolveWebhookTarget("https://public.example.test/hook"),/SSRF/);
    let dnsCalls=0,socketCalls=0;
    (dns.promises as any).lookup=async()=>{dnsCalls++;return [{address:"8.8.8.8",family:4}];};
    https.request=(url:any,options:any,callback:any)=>{
      socketCalls++;assert.equal(url.hostname,"public.example.test");assert.equal(options.agent,false);
      options.lookup(url.hostname,{all:true},(error:any,addresses:any)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:"8.8.8.8",family:4}]);});
      // A rebinding DNS result must never reach socket lookup, nor may a signed body follow a redirect.
      (dns.promises as any).lookup=async()=>[{address:"127.0.0.1",family:4}];
      const req:any=new EventEmitter();req.destroy=(error:Error)=>req.emit("error",error);
      req.end=()=>queueMicrotask(()=>{const res:any=new EventEmitter();res.statusCode=302;res.headers={location:"https://another.example.test/hook"};res.destroy=()=>{};callback(res);});return req;
    };
    assert.equal(await postWebhook("https://public.example.test/hook","fixture-body",{}),302);
    assert.equal(dnsCalls,1);assert.equal(socketCalls,1);
    https.request=request;
    const encrypted=encryptWebhookSecret("local-fixture-only","wh_fixture");
    assert.equal(decryptWebhookSecret(encrypted,"wh_fixture"),"local-fixture-only");
    assert.throws(()=>decryptWebhookSecret(encrypted,"job_fixture"),/authentication/);
    const prior={id:config.masterEncryptionKeyId,key:config.masterEncryptionKey,keys:config.previousEncryptionKeys};
    try {config.previousEncryptionKeys={...prior.keys,[prior.id]:prior.key};config.masterEncryptionKeyId="rotated-fixture";config.masterEncryptionKey="rotated-fixture-key-32-characters";assert.equal(decryptWebhookSecret(encrypted,"wh_fixture"),"local-fixture-only");}
    finally{config.masterEncryptionKeyId=prior.id;config.masterEncryptionKey=prior.key;config.previousEncryptionKeys=prior.keys;}

    store.db.webhooks.seller={id:"wh_fixture",sellerId:"seller",targetUrl:"https://public.example.test/hook",secret:"local-fixture-only",events:["*"],logs:[]};store.save();
    const source:any={id:"order_fixture",campaignId:"deal_fixture",quantity:2,deliveryStatus:"PENDING",entitlementEncrypted:"fixture-private",secretContent:"fixture-private",email:"private@example.test",disputeEvidence:"fixture-private"};
    const job=WebhookService.enqueueEvent("seller","order.committed",source,{eventId:"evt_stable",eventCreatedAt:123})!;
    assert.equal(job.secret,"");assert.ok(job.secretEncrypted);assert.ok(!JSON.stringify(job).includes("local-fixture-only"));
    source.deliveryStatus="DELIVERED";source.quantity=9;
    assert.deepEqual(job.payload,{id:"order_fixture",campaignId:"deal_fixture",quantity:2,deliveryStatus:"PENDING"});
    assert.equal(WebhookService.enqueueEvent("seller","order.committed",source,{eventId:"evt_stable",eventCreatedAt:124})?.id,job.id);
    const bodies:any[]=[];
    (WebhookService as any).sendWebhook=async(_url:string,body:string,headers:Record<string,string>)=>{
      const parsed=JSON.parse(body);bodies.push(parsed);
      assert.equal(headers["X-GroupDeal-Event-Id"],"evt_stable");
      const signature="sha256="+crypto.createHmac("sha256","local-fixture-only").update(headers["X-GroupDeal-Timestamp"]+"."+body).digest("hex");
      assert.ok(headers["X-GroupDeal-Signature"]===signature);return 503;
    };
    for(let attempt=0;attempt<3;attempt++){store.db.webhookQueue[job.id].nextAttemptAt=0;store.save();await WebhookService.processQueue();}
    assert.equal(store.db.webhookQueue[job.id].status,"DLQ");
    const dlqId="dlq_"+job.id;assert.equal(store.db.webhookDLQ[dlqId].eventId,"evt_stable");
    (WebhookService as any).sendWebhook=async(_url:string,body:string)=>{bodies.push(JSON.parse(body));return 202;};
    assert.equal(await WebhookService.replayDLQ(dlqId),true);assert.equal(await WebhookService.replayDLQ(dlqId),false);
    assert.ok(bodies.every(body=>body.id==="evt_stable"&&body.createdAt===123&&body.data.quantity===2&&!JSON.stringify(body).includes("fixture-private")));
    assert.equal(Object.values(store.db.webhookQueue).filter(j=>j.eventId==="evt_stable"&&j.status==="COMPLETED").length,1);

    const concurrent=WebhookService.enqueueEvent("seller","order.delivered",source,{eventId:"evt_concurrent",eventCreatedAt:124})!;
    let release!:()=>void,entered!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});let calls=0;
    (WebhookService as any).sendWebhook=async()=>{calls++;entered();await barrier;return 202;};
    const first=WebhookService.processQueue();await started;
    const second=await WebhookService.processQueue();assert.equal(second.processed,0);assert.equal(calls,1);
    const peer=new TransactionalStore(path.dirname(store.filePath));
    assert.equal(peer.db.webhookQueue[concurrent.id].status,"PROCESSING");assert.ok(peer.db.webhookQueue[concurrent.id].leaseToken);
    peer.db.syncState.lastSyncTimestamp++;peer.save();peer.close(); // Force completion CAS to reload a concurrent committed update.
    release();await first;assert.equal(store.db.webhookQueue[concurrent.id].status,"COMPLETED");assert.equal(calls,1);

    const interrupted=WebhookService.enqueueEvent("seller","order.delivered",source,{eventId:"evt_restart",eventCreatedAt:125})!;
    interrupted.status="PROCESSING";interrupted.attempts=1;interrupted.leaseExpiresAt=0;interrupted.leaseToken="fixture-crashed-worker";store.save();
    const reopened=new TransactionalStore(path.dirname(store.filePath));assert.equal(reopened.db.webhookQueue[interrupted.id].eventId,"evt_restart");reopened.close();
    (WebhookService as any).sendWebhook=async(_url:string,body:string)=>{assert.equal(JSON.parse(body).id,"evt_restart");return 202;};
    await WebhookService.processQueue();assert.equal(store.db.webhookQueue[interrupted.id].status,"COMPLETED");assert.equal(store.db.webhookQueue[interrupted.id].attempts,2);
    const old=WebhookService.enqueueEvent("seller","order.delivered",source)!;delete old.eventId;delete old.eventCreatedAt;old.status="PROCESSING";old.attempts=3;store.save();
    await WebhookService.processQueue();assert.equal(store.db.webhookQueue[old.id].status,"DLQ");assert.equal(store.db.webhookQueue[old.id].eventId,"evt_"+old.id);
    const completed=store.db.webhookQueue[concurrent.id];
    assert.throws(()=>store.transaction(()=>{store.db.webhookQueue.duplicate={...completed,id:"duplicate"};}),/UNIQUE/);
    assert.equal(store.db.webhookQueue.duplicate,undefined);
    console.log("PASS LOCAL_FIXTURE: stable/frozen private-safe webhook payload, retry/DLQ, durable lease/concurrent CAS/restart and pinned DNS/no redirect. No external callback or live delivery proof.");
  }finally{(dns.promises as any).lookup=lookup;https.request=request;(WebhookService as any).sendWebhook=transport;store.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
