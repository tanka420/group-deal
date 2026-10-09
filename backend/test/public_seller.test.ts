import assert from 'node:assert/strict';
import express from 'express';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {publicRouter} from '../src/routes/publicRoutes';
import {reviewedProductVerified} from './fixtures/product';
import {CampaignEditorService} from '../src/services/campaignEditorService';
import {readPublicSeller} from '../../shared/publicSeller.mjs';
async function main(){
 assert.ok(store.isIsolated);const wallet=ethers.Wallet.createRandom().address,product=await reviewedProductVerified('public-seller',wallet),other=await reviewedProductVerified('other-seller',ethers.Wallet.createRandom().address);
 const make=(id:string,seller:string,index:number,overrides:Record<string,unknown>={})=>{
  const p=seller==='public-seller'?product:other,c=CampaignEditorService.saveDraft(seller,{title:'Public seller LOCAL FIXTURE '+id,description:'Privacy boundary fixture',thumbnailUrl:p.version.thumbnailUrl,productVersionId:p.version.id,metric:'BUYER_COUNT',tiers:[{threshold:1,priceUSDC:'105'},{threshold:10,priceUSDC:'89'}],maxPerAccount:3,inventoryLimit:20,durationDays:7,deliverySlaHours:24,deliveryMethod:'FILE_LINK'});
  delete store.db.campaigns[c.id];Object.assign(c,{id,status:'ACTIVE',visibility:'PUBLIC',projectionOrigin:'VERIFIED_PUBLISH',chainId:config.arcChainId,hubAddress:config.hubAddress,onchainCampaignId:index,startTime:Math.floor(Date.now()/1000)-index,endTime:Math.floor(Date.now()/1000)+3600,productSnapshot:p.snapshot},overrides);store.db.campaigns[id]=c;return c;
 };
 const active=make('active','public-seller',1),final=make('final','public-seller',2,{status:'FINALIZED',finalizedAt:Date.now(),finalClearingPrice:'89000000'}),cancel=make('cancel','public-seller',3,{status:'CANCELLED'});make('future','public-seller',4,{startTime:Math.floor(Date.now()/1000)+60});make('sold','public-seller',5,{totalUnitsCommitted:20});make('private','public-seller',6,{visibility:'PRIVATE'});const unlisted=make('unlisted','public-seller',7,{visibility:'UNLISTED'});make('mixed','public-seller',8,{chainId:config.arcChainId+1});make('unbound','public-seller',9,{projectionOrigin:'CHAIN_UNBOUND'});make('draft','public-seller',10,{status:'DRAFT'});make('other-one','other-seller',11);make('other-two','other-seller',12);
 store.db.users['public-seller'].sellerProfile!.bio='<script>private fixture marker</script>';store.db.users['public-seller'].sellerProfile!.verifiedRightsBadge=true;store.save();
 const app=express();app.use('/api/v1',publicRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 // Publish intended fixture states before each public HTTP observation.
 const get=async(path:string)=>{store.save();const r=await fetch(base+'/api/v1'+path);return {status:r.status,headers:r.headers,body:await r.json() as any};},scope={chainId:config.arcChainId,hubAddress:config.hubAddress};let cases=0;
 const check=(fn:()=>void)=>{fn();cases++;};
 try{
 const response=await get('/sellers/public-seller'),seller=response.body.seller;
 check(()=>assert.equal(response.status,200));check(()=>assert.equal(response.headers.get('cache-control'),'no-store'));
 check(()=>assert.deepEqual(seller.metrics,{scope:'PUBLIC_CURRENT_DEPLOYMENT',publicCampaignCount:5,openCampaignCount:1,finalizedCampaignCount:1,cancelledCampaignCount:1,productCount:1}));
 check(()=>assert.equal(seller.payoutWalletStatus,'UNVERIFIED'));
 check(()=>assert.equal(seller.projection.financialStateChainVerified,false));
 check(()=>{for(const name of ['email','roles','activeWallet','payoutProofSignature','verifiedRightsBadge','reviewCount','revenue','followerCount'])assert.ok(!Object.hasOwn(seller,name));});
 check(()=>assert.equal(readPublicSeller({...seller,secret:'fixture-only',metrics:{...seller.metrics,revenue:'fixture-only'}},seller.id,scope).displayName,seller.displayName));
 check(()=>assert.equal(Object.hasOwn(readPublicSeller({...seller,secret:'fixture-only'},seller.id,scope),'secret'),false));
 store.db.userByWallet[wallet.toLowerCase()]='public-seller';store.save();
 const linked=await get('/sellers/public-seller');check(()=>assert.equal(linked.body.seller.payoutWalletStatus,'ACCOUNT_CREDENTIAL_LINKED'));
 const first=await get('/sellers/public-seller/campaigns?limit=2&sort=oldest');check(()=>assert.equal(first.status,200));check(()=>assert.equal(first.body.campaigns.length,2));check(()=>assert.equal(first.body.pagination.hasMore,true));
 check(()=>assert.ok(first.body.campaigns.every((c:any)=>c.seller.id==='public-seller'&&c.visibility==='PUBLIC'&&c.card.id===c.id)));
 const cursor=encodeURIComponent(first.body.pagination.nextCursor),second=await get('/sellers/public-seller/campaigns?limit=2&sort=oldest&cursor='+cursor);check(()=>assert.ok(second.body.campaigns.every((c:any)=>!first.body.campaigns.some((v:any)=>v.id===c.id))));
 const cross=await get('/sellers/other-seller/campaigns?limit=2&sort=oldest&cursor='+cursor),global=await get('/campaigns?limit=2&sort=oldest&cursor='+cursor);check(()=>assert.equal(cross.status,400));check(()=>assert.equal(global.status,400));
 const list=await get('/sellers/public-seller/campaigns?limit=100');check(()=>assert.equal(list.body.campaigns.length,5));check(()=>assert.equal(list.body.pagination.nextCursor,null));
 check(()=>assert.equal(list.body.campaigns.find((c:any)=>c.id===final.id).card.currentPriceBaseUnits,'89000000'));
 check(()=>assert.ok(list.body.campaigns.filter((c:any)=>c.id!==active.id).every((c:any)=>c.card.purchaseHeld&&c.card.nextThreshold===null)));
 const direct=await get('/campaigns/'+unlisted.id);check(()=>assert.equal(direct.status,200));check(()=>assert.ok(!Object.hasOwn(direct.body.campaign.seller,'id')));
 const badQuery=await get('/sellers/public-seller?role=operator');check(()=>assert.equal(badQuery.status,400));const invalid=await get('/sellers/__proto__');check(()=>assert.equal(invalid.status,404));
 const wrong=await get('/sellers/missing');check(()=>assert.equal(wrong.status,404));
 for(const mutation of [{chainId:config.arcChainId+1},{metrics:{...seller.metrics,openCampaignCount:6}},{profileUrl:'https://fixture.invalid/?secret=x'+seller.profilePath},{profilePath:'#seller'},{payoutWalletStatus:'ONCHAIN_VERIFIED'}])check(()=>assert.throws(()=>readPublicSeller({...seller,...mutation},seller.id,scope)));
 const oldOrigin=config.publicAppUrl;try{config.publicAppUrl='';const absent=await get('/sellers/public-seller');check(()=>assert.equal(absent.body.seller.profileUrl,null));config.publicAppUrl='https://fixture.invalid/private';const malformed=await get('/sellers/public-seller');check(()=>assert.equal(malformed.status,503));check(()=>assert.equal(malformed.body.error,'Public campaign projection unavailable'));}finally{config.publicAppUrl=oldOrigin;}
 const oldProfile=store.db.users['public-seller'].sellerProfile!.displayName;store.db.users['public-seller'].sellerProfile!.displayName='x';const corrupt=await get('/sellers/public-seller');check(()=>assert.equal(corrupt.status,503));store.db.users['public-seller'].sellerProfile!.displayName=oldProfile;
 store.db.products[product.product.id].status='ARCHIVED';const hidden=await get('/sellers/public-seller'),hiddenList=await get('/sellers/public-seller/campaigns');check(()=>assert.equal(hidden.status,404));check(()=>assert.equal(hiddenList.status,404));
 console.log(JSON.stringify({layer:'LOCAL_HTTP_FIXTURE',result:'PASS',cases,acceptanceEligible:false}));
 }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();}
}
main().catch(e=>{console.error('Public seller verification failed: '+e.name);process.exitCode=1;});
