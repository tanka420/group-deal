import {enrollFixtureOperator} from './helpers/operatorFixture';
import {authRouter} from '../src/routes/authRoutes';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {SessionService,SessionError} from '../src/services/sessionService';
import {operatorRouter} from '../src/routes/operatorRoutes';
import {listOperatorDealDisputes,OperatorDealSectionError} from '../src/services/operatorDealSections';
import {listOperatorAudit,OperatorAuditError} from '../src/services/operatorAuditService';
assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);
const initial=store.snapshot(),sql=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite')),hash=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');
const all=()=>hash(JSON.stringify({rows:sql.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all(),revision:sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get()}));
const get=(collection:string,key:string)=>JSON.parse((sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,key) as {record_json:string}).record_json);
const injected=new Map<string,{collection:string;key:string;json:string}>();let oldRevision:number|undefined;
const put=(collection:string,key:string,value:unknown)=>{const name=collection+':'+key;if(!injected.has(name))injected.set(name,{collection,key,json:JSON.stringify(get(collection,key))});sql.prepare('UPDATE domain_records SET record_json=? WHERE collection=? AND record_key=?').run(JSON.stringify(value),collection,key);};
const wallet='0x'+'1'.repeat(40),txHash='0x'+'2'.repeat(64),privateMarker='LOCAL_DEAL_SECTION_PRIVATE';
async function setup(){
 for(const r of injected.values())sql.prepare('UPDATE domain_records SET record_json=? WHERE collection=? AND record_key=?').run(r.json,r.collection,r.key);injected.clear();if(oldRevision!==undefined){sql.prepare('UPDATE storage_revision SET revision=? WHERE id=1').run(oldRevision);oldRevision=undefined;}
 store.replace(structuredClone(initial));store.transaction(()=>{
  for(const [id,roles] of [['fixture',['buyer','operator']],['other-operator',['buyer','operator']],['buyer',['buyer']]] as const)store.db.users[id]={id,email:id+'@fixture.invalid',roles:[...roles],createdAt:1700000000000,activeWallet:null,loginMethod:'EVM_WALLET'};
  const campaign={title:'Deal sections · LOCAL FIXTURE',description:'Committed read-only deal sections',category:'Documents',thumbnailUrl:'',sellerId:'fixture',onchainCampaignId:1,status:'FINALIZED',visibility:'PUBLIC',metric:'BUYER_COUNT',tiers:[{threshold:1,price:'100000000'}],currentUnlockedTier:0,sellerPayoutWallet:wallet,maxPerAccount:1,inventoryLimit:100,startTime:1700000000,endTime:1700003600,durationSeconds:3600,deliverySlaSeconds:86400,platformFeeBps:0,termsHash:txHash,totalBuyerCount:55,totalUnitsCommitted:55,totalGrossCommitted:'5500000000',finalClearingPrice:'100000000',deliveryMethod:'FILE_LINK',chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion};
  store.db.campaigns.deal={...campaign,id:'deal'} as any;store.db.campaigns.other={...campaign,id:'other',onchainCampaignId:2,title:'Other deal'} as any;store.db.campaigns.draft={...campaign,id:'draft',onchainCampaignId:undefined,status:'DRAFT'} as any;
  for(let i=0;i<55;i++){const id='order_'+String(i).padStart(3,'0');store.db.orders[id]={id,onchainOrderId:i+1,campaignId:'deal',chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,buyerAccountId:'buyer',buyerPrincipal:wallet,campaignIdentity:txHash,quantity:1,lockedUnitPrice:'100000000',committedGross:'100000000',isEarlySupporter:false,earlyRebateValue:'0',rebateAllocated:'0',sellerAllocated:'0',buyerRefundAllocated:'0',buyerClaimedAmount:'0',sellerClaimedAmount:'0',buyerClaimed:false,sellerClaimed:false,deliveryStatus:i%20===0?'RESOLVED':'DISPUTED',disputeReason:'Local issue '+i,disputeEvidence:['https://fixture.invalid/evidence'],disputeResolution:i%20===0?{txHash,notes:'Stored resolution',operatorId:'fixture',privateExtension:privateMarker}:undefined,txHash,createdAt:1700000000000,deliveredEntitlementEncrypted:privateMarker,privateExtension:privateMarker} as any;}
  store.db.orders.other_order={...store.db.orders.order_001,id:'other_order',onchainOrderId:56,campaignId:'other'};store.db.orders.foreign_order={...store.db.orders.order_001,id:'foreign_order',campaignId:'other',chainId:config.arcChainId+1};
  store.db.operations.op_delivery={id:'op_delivery',resourceId:'order_001',action:'DELIVER',chainId:config.arcChainId,hubAddress:config.hubAddress} as any;
  store.db.operations.op_claim={id:'op_claim',resourceId:'deal',action:'SELLER_CLAIM',chainId:config.arcChainId,hubAddress:config.hubAddress} as any;
  store.db.operations.op_other={id:'op_other',resourceId:'other',action:'BUY',chainId:config.arcChainId,hubAddress:config.hubAddress} as any;
  store.db.operations.op_foreign={id:'op_foreign',resourceId:'deal',action:'BUY',chainId:config.arcChainId+1,hubAddress:config.hubAddress} as any;
  store.db.resourceGrants.grant_local={id:'grant_local',orderId:'order_001',keyEncrypted:privateMarker} as any;
  store.db.supportTickets.ticket_local={id:'ticket_local',kind:'ORDER',orderId:'order_001',subject:privateMarker} as any;
  store.db.notifications.notice_local={id:'notice_local',source:{kind:'SUPPORT_TICKET',ticketId:'ticket_local'},message:privateMarker} as any;
  store.db.emailOutbox.mail_local={id:'mail_local',notificationId:'notice_local',payloadEncrypted:privateMarker} as any;
  for(const [action,details] of [['CAMPAIGN_DRAFT_SAVED',{campaignId:'deal'}],['DISPUTE_OPENED',{orderId:'order_001'}],['TRANSACTION_PREPARED',{operationId:'op_delivery',resourceId:'order_001'}],['CLAIM_VERIFIED',{operationId:'op_claim'}],['RESOURCE_LICENSE_REDEEMED',{grantId:'grant_local'}],['SUPPORT_REPLIED',{ticketId:'ticket_local'}],['EMAIL_NOTIFICATION_CANCELLED',{notificationId:'notice_local'}],['EMAIL_NOTIFICATION_DLQ',{outboxId:'mail_local'}],['OTHER_CAMPAIGN',{campaignId:'other'}],['OTHER_ORDER',{orderId:'other_order'}],['OTHER_OPERATION',{operationId:'op_other'}],['FOREIGN_OPERATION',{operationId:'op_foreign'}],['TEXT_MENTION',{message:'deal'}],['PRODUCT_VERSION_CREATED',{productId:'shared-product'}]] as [string,Record<string,unknown>][])store.addAuditLog('fixture','operator',action,{...details,privateExtension:privateMarker});
  for(let i=0;i<23;i++)store.addAuditLog('fixture','operator','DEAL_REVIEWED',{campaignId:'deal',index:i,privateExtension:privateMarker});
 });
 const token=SessionService.issue(store.db.users.fixture,'EVM_WALLET','ADMIN'),other=SessionService.issue(store.db.users['other-operator'],'EVM_WALLET','ADMIN'),buyer=SessionService.issue(store.db.users.buyer);
 const proof=SessionService.authenticate(token),enrollment=await enrollFixtureOperator('fixture',proof,{chainId:config.arcChainId});return{token,buyer,proof,otherProof:SessionService.authenticate(other),enrollment,auditCount:get('auditLogs','state').length};
}
let current:Awaited<ReturnType<typeof setup>>;const app=express();app.use(express.json());app.use('/api/operator',operatorRouter);app.use('/api/auth',authRouter);app.use('/api/admin-auth',authRouter);
const browser=process.argv.includes('--browser-server');
async function boot(){current=await setup();
if(browser){
 app.use((req,res,next)=>{if(req.header('X-Local-Fixture')!=='operator-deal-sections'){res.sendStatus(403);return;}next();});
 app.get('/__session',(_req,res)=>res.json({token:current.token,buyer:current.buyer,authority:current.enrollment.truth.authority,deploymentBlock:config.deploymentBlock,auditCount:current.auditCount}));app.get('/__state',(_req,res)=>res.json({hash:all(),isolated:store.isIsolated}));
 app.post('/__reset',async(_req,res)=>{current=await setup();res.json({ready:true});});app.post('/__revoke',(_req,res)=>{put('users','fixture',{...get('users','fixture'),roles:['buyer']});res.json({revoked:true});});
 app.post('/__append',(_req,res)=>{store.addAuditLog('fixture','operator','DEAL_REVIEWED',{campaignId:'deal'});res.json({appended:true});});
 app.post('/__stop',(_req,res)=>{res.json({stopping:true});setImmediate(stop);});
 const server=app.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({localFixture:'operator-deal-sections',pid:process.pid,port:(server.address() as {port:number}).port,isolated:true})));
 const stop=()=>server.close(()=>{sql.close();store.close();process.exit(0)});process.once('SIGTERM',stop);process.once('SIGINT',stop);
}else await main();
}
void boot().catch(()=>{console.error('Operator fixture bootstrap failed; private values withheld');try{sql.close();store.close();}catch{}process.exitCode=1;});
async function main(){
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 let stage='START',cases=0;const check=async(name:string,run:()=>unknown)=>{stage=name;current=await setup();await run();cases++;console.log(JSON.stringify({case:name,result:'PASS'}));};
 const request=async(url:string,token?:string)=>{const response=await fetch(base+'/api/operator/'+url,{headers:token?{Authorization:'Bearer '+token}:{}});return{response,body:await response.json()};};
 const rejected=(fn:()=>unknown,status:number)=>assert.throws(fn,e=>(e instanceof SessionError||e instanceof OperatorDealSectionError||e instanceof OperatorAuditError)&&e.status===status);
 try{
  await check('deal disputes HTTP authority privacy all-page coverage and filters',async()=>{
   assert.equal((await request('deals/deal/disputes')).response.status,401);assert.equal((await request('deals/deal/disputes',current.buyer)).response.status,403);
   for(const q of ['?limit=0','?limit=51','?status=BAD','?unknown=1','?status=OPEN&status=ALL'])assert.equal((await request('deals/deal/disputes'+q,current.token)).response.status,400);
   for(const id of ['missing','draft'])assert.equal((await request('deals/'+id+'/disputes',current.token)).response.status,404);
   const before=all(),cache=JSON.stringify(store.db),ids:string[]=[];let cursor:string|undefined;
   do{const page=listOperatorDealDisputes(current.proof,'deal',{limit:'20',...(cursor?{cursor}:{})});assert.ok(!JSON.stringify(page).includes(privateMarker));assert.ok(!JSON.stringify(page).includes('@fixture.invalid'));page.disputes.forEach(r=>{assert.equal(r.campaignId,'deal');ids.push(r.id);});cursor=page.pagination.nextCursor??undefined;}while(cursor);
   assert.equal(ids.length,55);assert.equal(new Set(ids).size,55);assert.equal(listOperatorDealDisputes(current.proof,'deal',{status:'RESOLVED'}).disputes.length,3);
   const http=await request('deals/deal/disputes?status=OPEN',current.token);assert.equal(http.response.status,200);assert.equal(http.response.headers.get('cache-control'),'private, no-store');assert.equal(http.response.headers.get('x-content-type-options'),'nosniff');assert.equal(http.body.disputes.length,20);assert.ok(http.body.disputes.every((r:any)=>r.deliveryStatus==='DISPUTED'));assert.equal(all(),before);assert.equal(JSON.stringify(store.db),cache);
  });
  await check('deal audit explicit persisted relations exclude unrelated and wrong deployment',async()=>{
   const before=all(),page=listOperatorAudit(current.proof,{dealId:'deal',limit:'50'}),actions=page.logs.map(r=>r.action);assert.equal(page.logs.length,31);for(const a of ['CAMPAIGN_DRAFT_SAVED','DISPUTE_OPENED','TRANSACTION_PREPARED','CLAIM_VERIFIED','RESOURCE_LICENSE_REDEEMED','SUPPORT_REPLIED','EMAIL_NOTIFICATION_CANCELLED','EMAIL_NOTIFICATION_DLQ'])assert.ok(actions.includes(a));for(const a of ['OTHER_CAMPAIGN','OTHER_ORDER','OTHER_OPERATION','FOREIGN_OPERATION','TEXT_MENTION','PRODUCT_VERSION_CREATED'])assert.ok(!actions.includes(a));assert.ok(!JSON.stringify(page).includes(privateMarker));
   const http=await request('audit-logs?dealId=missing',current.token);assert.equal(http.response.status,404);assert.equal(listOperatorAudit(current.proof,{dealId:'other',limit:'50'}).logs.length,3);assert.equal(all(),before);
  });
  await check('deal cursor binds account session deal filters purpose and committed revision',async()=>{
   let disputes=listOperatorDealDisputes(current.proof,'deal',{limit:'1'}).pagination.nextCursor!,audit=listOperatorAudit(current.proof,{dealId:'deal',limit:'1'}).pagination.nextCursor!;
   rejected(()=>listOperatorDealDisputes(current.proof,'other',{limit:'1',cursor:disputes}),400);rejected(()=>listOperatorDealDisputes(current.otherProof,'deal',{limit:'1',cursor:disputes}),400);rejected(()=>listOperatorDealDisputes(current.proof,'deal',{limit:'1',status:'OPEN',cursor:disputes}),400);
   rejected(()=>listOperatorDealDisputes(current.proof,'deal',{limit:'1',cursor:audit}),400);rejected(()=>listOperatorAudit(current.proof,{dealId:'other',limit:'1',cursor:audit}),400);rejected(()=>listOperatorAudit(current.proof,{limit:'1',cursor:audit}),400);rejected(()=>listOperatorAudit(current.proof,{dealId:'deal',limit:'1',cursor:disputes}),400);
   const second=SessionService.authenticate(SessionService.issue(store.db.users.fixture,'EVM_WALLET','ADMIN'));await current.enrollment.service.authorize(second);rejected(()=>listOperatorDealDisputes(second,'deal',{limit:'1',cursor:disputes}),400);disputes=listOperatorDealDisputes(current.proof,'deal',{limit:'1'}).pagination.nextCursor!;audit=listOperatorAudit(current.proof,{dealId:'deal',limit:'1'}).pagination.nextCursor!;
   oldRevision=(sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as {revision:number}).revision;sql.prepare('UPDATE storage_revision SET revision=revision+1 WHERE id=1').run();
   rejected(()=>listOperatorDealDisputes(current.proof,'deal',{limit:'1',cursor:disputes}),409);rejected(()=>listOperatorAudit(current.proof,{dealId:'deal',limit:'1',cursor:audit}),409);
  });
  await check('deal reads ignore pending cache and reject revoked or malformed committed scope',async()=>{
   const before=all();store.db.orders.order_001.disputeReason=privateMarker;store.db.campaigns.deal.chainId=config.arcChainId+1;store.db.auditLogs.unshift({id:'pending',timestamp:1,actor:'fixture',role:'operator',action:'PENDING',details:{campaignId:'deal'},hash:'1'.repeat(64),prevHash:'0'.repeat(64)});
   const cache=JSON.stringify(store.db);assert.notEqual(listOperatorDealDisputes(current.proof,'deal',{}).disputes.find(r=>r.id==='order_001')?.disputeReason,privateMarker);assert.ok(!listOperatorAudit(current.proof,{dealId:'deal'}).logs.some(r=>r.id==='pending'));assert.equal(all(),before);assert.equal(JSON.stringify(store.db),cache);
   put('campaigns','deal',{...get('campaigns','deal'),chainId:config.arcChainId+1});rejected(()=>listOperatorDealDisputes(current.proof,'deal',{}),409);rejected(()=>listOperatorAudit(current.proof,{dealId:'deal'}),409);
   current=await setup();put('orders','order_001',{...get('orders','order_001'),disputeEvidence:['javascript:alert(1)']});rejected(()=>listOperatorDealDisputes(current.proof,'deal',{}),503);
   current=await setup();put('users','fixture',{...get('users','fixture'),roles:['buyer']});rejected(()=>listOperatorDealDisputes(current.proof,'deal',{}),409);rejected(()=>listOperatorAudit(current.proof,{dealId:'deal'}),409);
   current=await setup();put('authSessions',current.proof.key,{...get('authSessions',current.proof.key),state:'REVOKED',revokedAt:Date.now()});rejected(()=>listOperatorDealDisputes(current.proof,'deal',{}),401);
   current=await setup();let held:any;store.readOperatorAdministration('fixture',current.proof.key,s=>{held=s;return true;});assert.throws(()=>held.deal('deal'));assert.throws(()=>held.disputePage('deal',1,'','ALL'));
  });
  console.log(JSON.stringify({result:'PASS',cases,isolated:true,originalDatabaseSqlOpened:false,networkScope:'LOOPBACK_ONLY'}));
 }catch(e){console.error(JSON.stringify({result:'FAIL',stage,errorCode:e instanceof SessionError||e instanceof OperatorDealSectionError||e instanceof OperatorAuditError?e.code:'LOCAL_ASSERTION_FAILED',stack:e instanceof Error?e.stack?.split('\n').filter(l=>l.includes('operator_deal_sections.test.ts')).slice(0,2):undefined}));process.exitCode=1;}
 finally{await new Promise<void>(r=>server.close(()=>r()));sql.close();store.close();}
}
