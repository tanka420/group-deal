const assert=require('node:assert/strict'),crypto=require('node:crypto');
exports.verifyWebhookRecovery=async(GroupDealSDK,requests)=>{
 const secret='local-fixture-only',sdk=new GroupDealSDK({baseUrl:'https://api.example.test',webhookSecret:secret,webhookSubscriptionId:'wh_fixture'}),reviewId='whr_'+crypto.randomUUID();
 const event={version:1,id:'evt_review_fixture',event:'subscription.review',timestamp:Math.floor(Date.now()/1000),createdAt:Date.now(),data:{reviewId,subscriptionId:'wh_fixture',nonce:crypto.randomBytes(32).toString('base64url'),expiresAt:Date.now()+25000,scope:'NEW_EVENTS_ONLY',chainId:5042002,hubAddress:'0x'+'1'.repeat(40)}};
 const headers=raw=>({event:event.event,eventId:event.id,timestamp:String(event.timestamp),signature:'sha256='+crypto.createHmac('sha256',secret).update(event.timestamp+'.'+raw).digest('hex')});
 const raw=JSON.stringify(event),answer=sdk.answerWebhookRecoveryChallenge(raw,headers(raw));
 assert.deepEqual(answer,{response:crypto.createHmac('sha256',secret).update('groupdeal:webhook-recovery-response:v1:'+crypto.createHash('sha256').update(raw).digest('hex')).digest('hex')});
 assert.equal(sdk.answerWebhookRecoveryChallenge(raw+' ',headers(raw)),null);
 for(const change of [{subscriptionId:'wh_other'},{expiresAt:Date.now()-1},{expiresAt:Date.now()+60000},{nonce:'bad'},{scope:'ALL_HISTORY'},{reviewId:'bad'},{privateField:'fixture'}]){const body=JSON.stringify({...event,data:{...event.data,...change}});assert.equal(sdk.answerWebhookRecoveryChallenge(body,headers(body)),null);}
 assert.equal(sdk.answerWebhookRecoveryChallenge(raw,{...headers(raw),event:'order.committed'}),null);
 assert.equal(sdk.answerWebhookRecoveryChallenge(raw+' '.repeat(4096),headers(raw+' '.repeat(4096))),null);
 let inboxCalls=0;assert.equal((await sdk.receiveWebhook(raw,headers(raw),{persist:async()=>{inboxCalls++;return true;}})).accepted,false);assert.equal(inboxCalls,0);
 await assert.rejects(async()=>sdk.prepareWebhookRecoveryReview('fixture','bad'),/command key/);
 await assert.rejects(async()=>sdk.getWebhookRecoveryReview(undefined),/session/);
 await assert.rejects(async()=>sdk.verifyWebhookRecoveryReview('fixture','../other'),/identifier/);
 console.log('PASS LOCAL_PACKED_WEBHOOK_REVIEW: exact-body proof, stale/mismatched/oversize challenge rejection and separate inbox semantics.');
 return {raw,headers:headers(raw),answer};
};
