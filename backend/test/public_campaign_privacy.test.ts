import assert from 'node:assert/strict';
import express from 'express';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {campaignRouter} from '../src/routes/campaignRoutes';
import {publicRouter} from '../src/routes/publicRoutes';
import {reviewedProductVerified} from './fixtures/product';
import {CampaignEditorService} from '../src/services/campaignEditorService';
import {ProductService} from '../src/services/productService';
async function main(){
 assert.ok(store.isIsolated);const product=await reviewedProductVerified('seller',ethers.Wallet.createRandom().address),c=CampaignEditorService.saveDraft('seller',{title:'Public scope LOCAL FIXTURE',description:'Privacy boundary fixture',thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:'BUYER_COUNT',tiers:[{threshold:1,priceUSDC:'105'},{threshold:10,priceUSDC:'89'}],maxPerAccount:3,inventoryLimit:20,durationDays:7,deliverySlaHours:24,deliveryMethod:'FILE_LINK'});
 Object.assign(c,{status:'ACTIVE',visibility:'PUBLIC',projectionOrigin:'VERIFIED_PUBLISH',chainId:config.arcChainId,hubAddress:config.hubAddress,onchainCampaignId:1,endTime:Math.floor(Date.now()/1000)+3600,productSnapshot:ProductService.snapshot('seller',product.version.id,Math.floor(Date.now()/1000)+8*86400)});store.save();
 const baseState=structuredClone(c),app=express();app.use('/api/campaigns',campaignRouter);app.use('/api/v1',publicRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port,results:{name:string;pass:boolean}[]=[];
 // Publish intended fixture states before each public HTTP observation.
 const request=(url:string)=>{store.save();return fetch(url)};
 const check=(name:string,test:()=>void)=>{try{test();results.push({name,pass:true});}catch{results.push({name,pass:false});}};
 try{
 for(const [name,override]of [['private',{visibility:'PRIVATE'}],['mixed-chain',{chainId:config.arcChainId+1}],['mixed-hub',{hubAddress:ethers.Wallet.createRandom().address}],['draft',{status:'DRAFT'}],['unbound',{projectionOrigin:'CHAIN_UNBOUND'}]] as const){Object.assign(c,baseState,override);const detail=await request(base+'/api/campaigns/'+c.id),list=await request(base+'/api/campaigns').then(r=>r.json()) as any;check(name+' detail inaccessible',()=>assert.equal(detail.status,404));check(name+' absent from discovery',()=>assert.ok(!list.campaigns.some((v:any)=>v.id===c.id)));}
 Object.assign(c,baseState);store.db.products[product.product.id].status='ARCHIVED';const archived=await request(base+'/api/campaigns/'+c.id);check('archived detail inaccessible',()=>assert.equal(archived.status,404));store.db.products[product.product.id].status='DRAFT';
 c.visibility='UNLISTED';const unlisted=await request(base+'/api/campaigns/'+c.id),unlistedList=await request(base+'/api/campaigns').then(r=>r.json()) as any;check('unlisted direct link available',()=>assert.equal(unlisted.status,200));check('unlisted excluded from discovery',()=>assert.ok(!unlistedList.campaigns.some((v:any)=>v.id===c.id)));
 Object.assign(c,baseState);c.startTime=Math.floor(Date.now()/1000)+60;const early=await request(base+'/api/v1/campaigns/'+c.id+'/widget-data').then(r=>r.json()) as any;check('before start held',()=>assert.equal(early.purchaseHeld,true));check('before start no next tier',()=>assert.equal(early.nextThreshold,null));
 Object.assign(c,baseState);c.totalUnitsCommitted=c.inventoryLimit;const full=await request(base+'/api/v1/campaigns/'+c.id+'/widget-data').then(r=>r.json()) as any;check('inventory reached held',()=>assert.equal(full.purchaseHeld,true));check('inventory reached no next tier',()=>assert.equal(full.nextThreshold,null));
 Object.assign(c,baseState);c.inventoryLimit=0;c.totalUnitsCommitted=123;const unlimited=await request(base+'/api/v1/campaigns/'+c.id+'/widget-data').then(r=>r.json()) as any;check('zero inventory means unlimited',()=>assert.equal(unlimited.purchaseHeld,false));
 Object.assign(c,baseState);store.db.rights[product.rights.id].validUntil=Math.floor(Date.now()/1000)+60;const rights=await request(base+'/api/v1/campaigns/'+c.id+'/widget-data').then(r=>r.json()) as any;check('rights must cover delivery SLA',()=>assert.equal(rights.purchaseHeld,true));check('short rights no next tier',()=>assert.equal(rights.nextThreshold,null));
 const failed=results.filter(r=>!r.pass);console.log(JSON.stringify({layer:'LOCAL_HTTP_FIXTURE',result:failed.length?'FAIL':'PASS',cases:results.length,failed:failed.map(r=>r.name),acceptanceEligible:false}));if(failed.length)process.exitCode=1;
 }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();}
}
main().catch(e=>{console.error('Public privacy verification failed: '+e.name);process.exitCode=1;});
