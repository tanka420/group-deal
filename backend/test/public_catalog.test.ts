import assert from 'node:assert/strict';
import express from 'express';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {CampaignEditorService} from '../src/services/campaignEditorService';
import {ProductService} from '../src/services/productService';
import {publicRouter} from '../src/routes/publicRoutes';
import {seedCatalog} from './fixtures/catalog';
async function run(){
 assert.ok(store.isIsolated);const fixture=await seedCatalog({store,config,CampaignEditorService,ProductService}),app=express();app.use('/api/v1',publicRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 // Intended fixture mutations are committed before requests; pending-row isolation has separate cases.
 const get=(query='')=>{store.save();return fetch('http://127.0.0.1:'+(server.address() as any).port+'/api/v1/catalog'+query)},body=async(query='')=>(await get(query)).json() as Promise<any>;
 try{
  const first=await body('?limit=12&sort=oldest');assert.equal(first.campaigns.length,12);assert.equal(first.summary.campaignCount,15);assert.equal(first.summary.openCampaignCount,13);assert.equal(first.summary.totalGrossCommitted,'900719925474099326345678');assert.equal(first.summary.projection.financialStateChainVerified,false);
  assert.deepEqual(first.categories,[{value:'Courses',label:'Courses',campaignCount:1},{value:'Software',label:'Software',campaignCount:14}]);assert.ok(!JSON.stringify(first).includes('Hidden'));assert.ok(!JSON.stringify(first).includes('fixture-private-template'));assert.ok(!JSON.stringify(first).includes('private-evidence'));assert.equal(first.campaigns[0].card.currentPriceBaseUnits,'900719925474099312345678');assert.equal(first.campaigns[0].card.priceKind,'FINAL_CLEARING_PRICE');assert.equal(first.campaigns[1].card.purchaseHeld,true);assert.equal(first.campaigns[1].card.nextPriceBaseUnits,null);
  const next=await body('?limit=12&sort=oldest&cursor='+first.pagination.nextCursor);assert.deepEqual(next.campaigns.map((c:any)=>c.id),fixture.publicIds.slice(12));assert.deepEqual(next.summary.campaignCount,first.summary.campaignCount);assert.equal(next.pagination.hasMore,false);
  const search=await body('?limit=2&q='+encodeURIComponent('  ＡＣＭＥ   studio pro  ')+'&category='+encodeURIComponent(' Ｓｏｆｔｗａｒｅ '));assert.equal(search.summary.campaignCount,14);assert.equal(search.filters.q,'ＡＣＭＥ   studio pro');assert.equal(search.filters.category,'Ｓｏｆｔｗａｒｅ');
  const equivalent=await body('?limit=2&q=acme+studio+pro&category=software&cursor='+search.pagination.nextCursor);assert.equal(equivalent.campaigns.length,2);
  for(const suffix of ['?q=other&category=software','?q=acme+studio+pro&category=courses','?q=acme+studio+pro&category=software&status=ACTIVE'])assert.equal((await get(suffix+'&cursor='+search.pagination.nextCursor)).status,400);
  const filtered=await body('?category=Courses&metric=UNITS_COUNT&status=ACTIVE');assert.equal(filtered.summary.campaignCount,1);assert.equal(filtered.campaigns[0].id,'catalog_14');assert.equal(filtered.categories.length,2);
  const empty=await body('?q=absent');assert.equal(empty.summary.campaignCount,0);assert.equal(empty.summary.totalGrossCommitted,'0');assert.equal(empty.pagination.hasMore,false);
  const expansion=await get('?q='+encodeURIComponent('ﬃ'.repeat(100)));assert.equal(expansion.status,200,'Valid raw Unicode input was rejected after normalization');
  for(const query of ['?q='+('x'.repeat(121)),'?category='+('x'.repeat(81)),'?q=x&q=y','?category[x]=y','?q=%00','?category=%7f','?unknown=x'])assert.equal((await get(query)).status,400);
  store.db.campaigns.catalog_01.totalGrossCommitted='-1';const corrupt=await get();assert.equal(corrupt.status,503);assert.equal((await corrupt.json() as any).code,'SERVICE_UNAVAILABLE');store.db.campaigns.catalog_01.totalGrossCommitted='1000000';
  store.db.products[fixture.productId].status='ARCHIVED';const archived=await body();assert.equal(archived.summary.campaignCount,0);assert.deepEqual(archived.categories,[]);
  console.log('PASS LOCAL_ISOLATED_HTTP: public catalogue facets/privacy/deployment, normalized scoped search/cursors, all-page exact gross/final prices/held state, strict queries and unavailable projection. No chain or delivery proof.');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
