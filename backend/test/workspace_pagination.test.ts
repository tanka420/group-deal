import assert from 'node:assert/strict';
import express from 'express';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {SessionService} from '../src/services/sessionService';
import {workspaceList,sellerOverview,buyerSummary} from '../src/services/workspaceView';
import {sellerRouter} from '../src/routes/sellerRoutes';
import {orderRouter} from '../src/routes/orderRoutes';
import {productRouter} from '../src/routes/productRoutes';
import {walletRouter} from '../src/routes/walletRoutes';
import {ProductService} from '../src/services/productService';
import {productInput} from './fixtures/product';
import {SellerIdentityService} from '../src/services/sellerIdentityService';

async function run(){
 assert.ok(store.isIsolated);const wallet='0x'+'1'.repeat(40),otherWallet='0x'+'2'.repeat(40),time=1700000000000;
 store.transaction(()=>{
  for(const [id,roles,address] of [['seller',['buyer','seller'],wallet],['buyer',['buyer'],otherWallet],['other',['buyer','seller'],'0x'+'3'.repeat(40)]] as const)store.db.users[id]={id,email:id+'@fixture.invalid',roles:[...roles],createdAt:time,activeWallet:address};
  for(let i=0;i<25;i++){const id='campaign_'+String(i).padStart(3,'0');store.db.campaigns[id]={id,sellerId:'seller',sellerPayoutWallet:wallet,title:'Campaign '+i,status:i===0?'FINALIZED':'PUBLISHED',startTime:1700000000+i,endTime:1900000000-i,finalizedAt:i===0?1700000000:undefined,deliverySlaSeconds:86400,tiers:[{threshold:1,price:'1000000'}],currentUnlockedTier:0,totalBuyerCount:1,totalUnitsCommitted:3,totalGrossCommitted:'3000000',privateExtension:'workspace-private-marker'} as any;}
  store.db.campaigns.foreign={...store.db.campaigns.campaign_000,id:'foreign',sellerId:'other',title:'Foreign campaign'};
  for(let i=0;i<45;i++){const id='order_'+String(i).padStart(3,'0');store.db.orders[id]={id,campaignId:'campaign_000',buyerAccountId:'buyer',buyerPrincipal:otherWallet,quantity:1,lockedUnitPrice:'1000000',committedGross:'1000000',rebateAllocated:'100000',sellerAllocated:'900000',buyerRefundAllocated:'0',buyerClaimedAmount:'0',sellerClaimedAmount:'300000',protocolVersion:config.protocolVersion,chainId:config.arcChainId,hubAddress:config.hubAddress,deliveryStatus:'CONFIRMED',createdAt:time+Math.floor(i/3),deliveredEntitlementEncrypted:'workspace-private-marker',privateExtension:'workspace-private-marker'} as any;}
  store.db.orders.foreign={...store.db.orders.order_000,id:'foreign',campaignId:'foreign',buyerAccountId:'other'};
 });
 const sellerToken=SessionService.issue(store.db.users.seller),seller=SessionService.authenticate(sellerToken),buyerToken=SessionService.issue(store.db.users.buyer),buyer=SessionService.authenticate(buyerToken);
 const app=express();app.use(express.json());app.use('/api/seller',sellerRouter);app.use('/api/orders',orderRouter);app.use('/api/products',productRouter);app.use('/api/wallet',walletRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 const get=(path:string,token=sellerToken)=>fetch(origin+path,{headers:{Authorization:'Bearer '+token}});
 try{
  const first=workspaceList(seller,{limit:'20'},'seller-orders') as any;assert.equal(first.orders.length,20);assert.equal(first.pagination.total,45);assert.ok(first.pagination.nextCursor);assert.ok(!JSON.stringify(first).includes('workspace-private-marker'));
  const ids=new Set(first.orders.map((o:any)=>o.id));let cursor=first.pagination.nextCursor;
  while(cursor){const next=workspaceList(seller,{limit:'20',cursor},'seller-orders') as any;assert.ok(next.orders.length<=20);for(const o of next.orders){assert.ok(!ids.has(o.id));ids.add(o.id);}cursor=next.pagination.nextCursor;}
  assert.equal(ids.size,45);
  assert.throws(()=>workspaceList(buyer,{limit:'20',cursor:first.pagination.nextCursor},'buyer-orders'));
  assert.throws(()=>workspaceList(seller,{limit:'20',status:'CONFIRMED',cursor:first.pagination.nextCursor},'seller-orders'));
  store.db.campaigns.foreign.sellerId='seller';assert.equal((workspaceList(seller,{limit:'20'},'seller-campaigns') as any).pagination.total,25);store.db.campaigns.foreign.sellerId='other';
  const summary=sellerOverview(seller).summary;assert.equal(summary.sellerAllocated,'40500000');assert.equal(summary.sellerClaimed,'13500000');assert.equal(summary.sellerClaimable,'27000000');assert.equal(buyerSummary(buyer).summary.claimableRebate,'4500000');
  store.transaction(()=>{store.db.orders.order_000.quantity=2;});assert.equal(sellerOverview(seller).summary.sellerAllocated,null);assert.equal(buyerSummary(buyer).summary.buyerClaimable,null);store.transaction(()=>{store.db.orders.order_000.quantity=1;});
  const selected=workspaceList(buyer,{limit:'20',principal:otherWallet,direction:'BUY'},'wallet-trades') as any;assert.equal(selected.pagination.total,45);assert.ok(selected.rows.every((r:any)=>r.direction==='BUY'&&r.wallet===otherWallet));assert.equal((workspaceList(buyer,{limit:'20',principal:wallet},'wallet-trades') as any).rows.length,0);
  assert.equal((workspaceList(seller,{limit:'20',principal:wallet,direction:'SELL'},'wallet-trades') as any).pagination.total,45);
  // Same account on both sides, with different pinned principals. One row/order;
  // filters, mapped side, totals and every cursor must agree, including tied times.
  store.transaction(()=>{
   for(let i=0;i<45;i++){const id='self_scope_'+String(i).padStart(3,'0');store.db.orders[id]={...store.db.orders.order_000,id,buyerAccountId:'seller',buyerPrincipal:otherWallet,createdAt:time+Math.floor(i/3)};}
   store.db.orders.self_scope_foreign={...store.db.orders.order_000,id:'self_scope_foreign',campaignId:'foreign',buyerAccountId:'other',buyerPrincipal:otherWallet};
  });
  for(const principal of [undefined,otherWallet,wallet])for(const direction of [undefined,'BUY','SELL']){
   const empty=principal===otherWallet&&direction==='SELL'||principal===wallet&&direction==='BUY';
   const role=direction??(principal===wallet?'SELL':'BUY'),seen=new Set<string>();let cursor:string|undefined;
   do{
    const result=workspaceList(seller,{limit:'20',q:'self_scope',...(principal?{principal:principal.toUpperCase().replace('0X','0x')}:{}),...(direction?{direction}:{}),...(cursor?{cursor}:{})},'wallet-trades') as any;
    assert.equal(result.pagination.total,empty?0:45);assert.ok(result.rows.length<=20);
    for(const row of result.rows){assert.equal(row.direction,role);assert.equal(row.wallet,role==='BUY'?otherWallet:wallet);assert.equal(row.allocated,role==='BUY'?'100000':'900000');assert.equal(row.claimed,role==='BUY'?'0':'300000');assert.equal(row.claimable,role==='BUY'?'100000':'600000');assert.ok(!seen.has(row.orderId));assert.notEqual(row.orderId,'self_scope_foreign');seen.add(row.orderId);}
    cursor=result.pagination.nextCursor??undefined;
   }while(cursor);
   assert.equal(seen.size,empty?0:45);
  }
  // A buyer-only account cannot obtain the seller side, even for its own address.
  assert.equal((workspaceList(buyer,{limit:'20',principal:otherWallet,direction:'SELL'},'wallet-trades') as any).pagination.total,0);
  for(const [proof,role,address] of [[buyer,'BUY',otherWallet],[seller,'SELL',wallet]] as const)for(const principal of [undefined,otherWallet,wallet])for(const direction of [undefined,'BUY','SELL']){
   const total=(!principal||principal===address)&&(!direction||direction===role)?45:0,result=workspaceList(proof,{limit:'20',q:'order_',...(principal?{principal}:{}),...(direction?{direction}:{})},'wallet-trades') as any;
   assert.equal(result.pagination.total,total);assert.equal(result.rows.length,Math.min(total,20));assert.ok(result.rows.every((r:any)=>r.direction===role&&r.wallet===address));
  }
  const cursorScope=workspaceList(seller,{limit:'20',q:'self_scope',principal:wallet},'wallet-trades') as any;
  assert.throws(()=>workspaceList(seller,{limit:'20',q:'self_scope',principal:otherWallet,cursor:cursorScope.pagination.nextCursor},'wallet-trades'));
  assert.throws(()=>workspaceList(buyer,{limit:'20',q:'self_scope',principal:wallet,cursor:cursorScope.pagination.nextCursor},'wallet-trades'));
  assert.throws(()=>workspaceList(seller,{limit:'20',q:'self_scope',principal:wallet,direction:'SELL',cursor:cursorScope.pagination.nextCursor},'wallet-trades'));
  assert.equal((workspaceList(seller,{limit:'20',orderId:'order_000'},'seller-orders') as any).orders.length,1);
  const sorted=workspaceList(seller,{limit:'20',sort:'END_ASC'},'seller-campaigns') as any;assert.equal(sorted.campaigns[0].id,'campaign_024');
  for(const query of ['limit=0','limit=21','sellerId=other','from=2026-02-30','cursor=invalid'])assert.equal((await get('/api/seller/orders?'+query)).status,400);
  assert.equal((await get('/api/seller/overview')).status,200);assert.equal((await get('/api/orders/buyer?limit=20',buyerToken)).status,200);assert.equal((await get('/api/wallet/activity?limit=20',buyerToken)).status,200);
  for(let i=0;i<23;i++)ProductService.createVersion('seller',{...productInput,title:'Product '+i});
  const products=workspaceList(seller,{limit:'20'},'seller-products') as any;assert.equal(products.products.length,20);assert.equal(products.pagination.total,23);const product=products.products[0];
  assert.equal((await get('/api/products/'+product.id+'/versions/'+product.version.id)).status,200);assert.equal((await get('/api/products/'+product.id+'/versions/'+product.version.id,buyerToken)).status,403);
  const newer=ProductService.createVersion('seller',{...productInput,title:'Updated edition'},product.id,product.latestVersionId);
  const pinned=await (await get('/api/products/'+product.id+'/versions/'+product.version.id)).json() as any;assert.equal(pinned.version.id,product.version.id);assert.equal(pinned.product.latestVersionId,newer.version.id);
  const identity=SellerIdentityService.status(seller);assert.match(identity.suggestedUsername,/^user_[a-f0-9]{16}$/);SellerIdentityService.username(seller,{username:'once_only',expectedRevision:identity.identity.revision});assert.throws(()=>SellerIdentityService.username(seller,{username:'renamed',expectedRevision:identity.identity.revision+1}),/SELLER_USERNAME_ALREADY_SET/);
  store.transaction(()=>{store.db.authSessions[seller.key].state='REVOKED';store.db.authSessions[seller.key].revokedAt=Date.now();store.db.authSessions[seller.key].revokeReason='LOGOUT';});assert.throws(()=>workspaceList(seller,{limit:'20'},'seller-orders'));
  console.log('PASS workspace pagination: bounded SQL pages, tied timestamps, scoped cursors, committed ownership, private field exclusion, all-time totals, wallet scope, historical product versions and one-time usernames. Isolated local fixtures only.');
 }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();}
}
run().catch(error=>{console.error(error);try{store.close();}catch{}process.exitCode=1;});
