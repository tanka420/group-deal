/** Isolated SQL fixture owned by the workspace browser tests; no live workers. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const wallet='0x'+'1'.repeat(40),buyerWallet='0x'+'2'.repeat(40);
async function main(){
 assert.equal(process.env.NODE_ENV,'test');
 process.env.GROUPDEAL_RECOVERY_MODE='1';
 const runtime=process.env.GROUPDEAL_BROWSER_MODE==='preview'?'COMPILED_BACKEND':'TSX_BACKEND',base=runtime==='COMPILED_BACKEND'?'../dist':'../src';
 const {store,TransactionalStore,admitDefaultRecoveryStore}=require(base+'/db/store');
 admitDefaultRecoveryStore(new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-test-browser-workspace-'))));
 const {config}=require(base+'/config'),{SessionService}=require(base+'/services/sessionService');
 const {ProductService}=require(base+'/services/productService'),{productInput}=require('./fixtures/product');
 const {OperationService}=require(base+'/services/operationService');
 const {ethers}=require('ethers'),{HUB_ABI}=require(base+'/contracts/hubAbi');
 const time=Date.parse('2026-10-22T01:00:00Z');
 store.transaction(()=>{
  store.db.users.seller={id:'seller',email:'seller@fixture.invalid',roles:['buyer','seller'],createdAt:time,loginMethod:'EVM_WALLET',activeWallet:wallet};
  store.db.users.buyer={id:'buyer',email:'buyer@fixture.invalid',roles:['buyer'],createdAt:time,loginMethod:'EVM_WALLET',activeWallet:buyerWallet};
  store.db.users.dual={id:'dual',email:'dual@fixture.invalid',roles:['buyer','seller'],createdAt:time,loginMethod:'EVM_WALLET',activeWallet:'0x'+'4'.repeat(40)};
  for(let i=0;i<24;i++){const id='campaign_'+String(i).padStart(3,'0');store.db.campaigns[id]={id,sellerId:'seller',sellerPayoutWallet:wallet,title:'Chiến dịch kiểm thử '+i,status:'FINALIZED',visibility:'UNLISTED',metric:'UNITS_COUNT',tiers:[{threshold:1,price:'1000000'}],currentUnlockedTier:0,createdAt:time,startTime:1700000000,endTime:1700100000,finalizedAt:1700100000,deliverySlaSeconds:86400,totalBuyerCount:8,totalUnitsCommitted:26,totalGrossCommitted:'1000000'} as any;}
  for(let i=0;i<24;i++){const id='order_'+String(i).padStart(3,'0');store.db.orders[id]={id,campaignId:'campaign_000',buyerAccountId:'buyer',buyerPrincipal:buyerWallet,quantity:1,lockedUnitPrice:'1000000',committedGross:'1000000',rebateAllocated:'100000',buyerRefundAllocated:'0',sellerAllocated:'900000',sellerClaimedAmount:'300000',buyerClaimedAmount:'0',chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,deliveryStatus:'CONFIRMED',createdAt:time+i} as any;}
  store.db.campaigns.dual_campaign={...store.db.campaigns.campaign_000,id:'dual_campaign',sellerId:'dual',sellerPayoutWallet:store.db.users.dual.activeWallet};
  for(let i=0;i<45;i++){const id='dual_order_'+String(i).padStart(3,'0');store.db.orders[id]={...store.db.orders.order_000,id,campaignId:'dual_campaign',buyerAccountId:'dual',buyerPrincipal:buyerWallet,createdAt:time+Math.floor(i/3)};}
 });
 const sellerToken=SessionService.issue(store.db.users.seller),buyerToken=SessionService.issue(store.db.users.buyer),dualToken=SessionService.issue(store.db.users.dual);
 for(let i=0;i<23;i++)ProductService.createVersion('seller',{...productInput,title:'Sản phẩm kiểm thử '+i});
 const iface=new ethers.Interface(HUB_ABI);
 for(let i=0;i<24;i++){const op=OperationService.prepare({userId:'buyer',action:'BUYER_CLAIM',resourceId:'campaign_000',principal:buyerWallet,idempotencyKey:'history:'+i,intentId:'history:'+i,calldata:iface.encodeFunctionData('claimBuyerFunds',[1,[1]]),expectedFunction:'claimBuyerFunds',expectedEvent:'FundsClaimed',expectedEventArgs:{claimType:0}});op.createdAt=time+i;}
 store.save();
 const express=require('express');
 const app=express();app.use(express.json());
 const routes=[['/api/auth','authRoutes','authRouter'],['/api/seller','sellerRoutes','sellerRouter'],['/api/seller/identity','sellerIdentityRoutes','sellerIdentityRouter'],['/api/orders','orderRoutes','orderRouter'],['/api/products','productRoutes','productRouter'],['/api/transactions','operationRoutes','operationRouter'],['/api/wallet','walletRoutes','walletRouter'],['/api/notifications','notificationRoutes','notificationRouter']] as const;
 for(const [mount,file,name]of routes){const module=require(base+'/routes/'+file);app.use(mount,(module as any)[name]);}
 app.use((_req:any,res:any)=>res.status(404).json({error:'LOCAL_FIXTURE_ROUTE_UNAVAILABLE'}));
 const server=app.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({localFixture:true,port:(server.address() as any).port,isolated:store.isIsolated,runtime,sellerToken,buyerToken,dualToken})));
 const stop=()=>server.close(()=>{store.close();process.exit(0)});process.once('SIGTERM',stop);process.once('SIGINT',stop);process.on('message',message=>{if(message==='STOP_LOCAL_FIXTURE')stop()});
}
void main().catch(()=>{console.error('WORKSPACE_FIXTURE_BOOTSTRAP_FAILED');process.exitCode=1});
