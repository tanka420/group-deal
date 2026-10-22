import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const wallet='0x'+'1'.repeat(40),buyerWallet='0x'+'2'.repeat(40);
let server:any,origin:string,sellerToken:string,buyerToken:string;

test.beforeAll(async()=>{
 process.env.GROUPDEAL_RECOVERY_MODE='1';
 const {store,TransactionalStore,admitDefaultRecoveryStore}=await import('../../backend/src/db/store');
 admitDefaultRecoveryStore(new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-test-browser-workspace-'))));
 const {config}=await import('../../backend/src/config'),{SessionService}=await import('../../backend/src/services/sessionService');
 const {ProductService}=await import('../../backend/src/services/productService'),{productInput}=await import('../../backend/test/fixtures/product');
 const {OperationService}=await import('../../backend/src/services/operationService');
 const {ethers}=await import('../../backend/node_modules/ethers/lib.esm/index.js'),{HUB_ABI}=await import('../../backend/src/contracts/hubAbi');
 const time=Date.parse('2026-10-22T01:00:00Z');
 store.transaction(()=>{
  store.db.users.seller={id:'seller',email:'seller@fixture.invalid',roles:['buyer','seller'],createdAt:time,loginMethod:'EVM_WALLET',activeWallet:wallet};
  store.db.users.buyer={id:'buyer',email:'buyer@fixture.invalid',roles:['buyer'],createdAt:time,loginMethod:'EVM_WALLET',activeWallet:buyerWallet};
  for(let i=0;i<24;i++){const id='campaign_'+String(i).padStart(3,'0');store.db.campaigns[id]={id,sellerId:'seller',sellerPayoutWallet:wallet,title:'Chiến dịch kiểm thử '+i,status:'FINALIZED',visibility:'UNLISTED',metric:'UNITS_COUNT',tiers:[{threshold:1,price:'1000000'}],currentUnlockedTier:0,createdAt:time,startTime:1700000000,endTime:1700100000,finalizedAt:1700100000,deliverySlaSeconds:86400,totalBuyerCount:8,totalUnitsCommitted:26,totalGrossCommitted:'1000000'} as any;}
  for(let i=0;i<24;i++){const id='order_'+String(i).padStart(3,'0');store.db.orders[id]={id,campaignId:'campaign_000',buyerAccountId:'buyer',buyerPrincipal:buyerWallet,quantity:1,lockedUnitPrice:'1000000',committedGross:'1000000',rebateAllocated:'100000',buyerRefundAllocated:'0',sellerAllocated:'900000',sellerClaimedAmount:'300000',buyerClaimedAmount:'0',chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,deliveryStatus:'CONFIRMED',createdAt:time+i} as any;}
 });
 sellerToken=SessionService.issue(store.db.users.seller);buyerToken=SessionService.issue(store.db.users.buyer);
 for(let i=0;i<23;i++)ProductService.createVersion('seller',{...productInput,title:'Sản phẩm kiểm thử '+i});
 const iface=new ethers.Interface(HUB_ABI);
 for(let i=0;i<24;i++){const op=OperationService.prepare({userId:'buyer',action:'BUYER_CLAIM',resourceId:'campaign_000',principal:buyerWallet,idempotencyKey:'history:'+i,intentId:'history:'+i,calldata:iface.encodeFunctionData('claimBuyerFunds',[1,[1]]),expectedFunction:'claimBuyerFunds',expectedEvent:'FundsClaimed',expectedEventArgs:{claimType:0}});op.createdAt=time+i;}
 store.save();
 const {default:express}=await import('../../backend/node_modules/express/index.js');
 const app=express();app.use(express.json());
 const routes=[['/api/auth','authRoutes','authRouter'],['/api/seller','sellerRoutes','sellerRouter'],['/api/seller/identity','sellerIdentityRoutes','sellerIdentityRouter'],['/api/orders','orderRoutes','orderRouter'],['/api/products','productRoutes','productRouter'],['/api/transactions','operationRoutes','operationRouter'],['/api/wallet','walletRoutes','walletRouter'],['/api/notifications','notificationRoutes','notificationRouter']] as const;
 for(const [mount,file,name]of routes){const module=await import('../../backend/src/routes/'+file);app.use(mount,(module as any)[name]);}
 app.use((_req:any,res:any)=>res.status(404).json({error:'LOCAL_FIXTURE_ROUTE_UNAVAILABLE'}));
 server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));const {store}=await import('../../backend/src/db/store');store.close();});
async function setup(page:Page,role:'buyer'|'seller'='seller'){
 const token=role==='seller'?sellerToken:buyerToken,account=role==='seller'?wallet:buyerWallet;
 await page.addInitScript(token=>{localStorage.setItem('groupdeal_token',token);localStorage.setItem('groupdeal_lang','vi');},token);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/src/context/Web3Context.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:"${account}",walletMode:"EXTERNAL_REOWN",externalSignerReady:true,usdcBalance:null,hubAddress:"0x1111111111111111111111111111111111111111"});`}));
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url());try{const response=await r.fetch({url:origin+u.pathname+u.search});await r.fulfill({response});}catch{await r.fulfill({status:503,json:{error:'LOCAL_FIXTURE_API_UNAVAILABLE'}});}});
}
async function widths(page:Page){for(const width of [375,768,1024,1440,1920]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}}

test('seller overview, complete SQL pagination and related order navigation',async({page},info)=>{
 await setup(page);await page.goto('/seller');await expect(page.getByRole('heading',{name:'Tổng quan',exact:true})).toBeVisible();await expect(page.locator('.overview-metrics')).toContainText('21.6 USDC');await widths(page);
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.main-content')).toHaveCSS('max-width','none');await page.screenshot({path:info.outputPath('seller-overview-1440.png'),fullPage:true});
 await page.goto('/seller/campaigns');await expect(page.locator('.campaign-table tbody tr')).toHaveCount(20);await page.getByRole('button',{name:'Sau',exact:true}).click();await expect(page.locator('.campaign-table tbody tr')).toHaveCount(4);await page.getByRole('button',{name:'Trước',exact:true}).click();await expect(page.locator('.campaign-table tbody tr')).toHaveCount(20);
 await page.goto('/seller/campaigns?q=campaign_000');await expect(page.locator('.campaign-table tbody tr')).toHaveCount(1);await page.locator('.campaign-table .related-links').getByRole('link',{name:'Xem đơn',exact:true}).last().click();await expect(page).toHaveURL(/\/seller\/orders\?campaignId=/);await expect(page.locator('.ui-record-card')).toHaveCount(20);await page.getByRole('button',{name:'Sau',exact:true}).click();await expect(page.locator('.ui-record-card')).toHaveCount(4);await widths(page);await page.goto('/seller/products');await expect(page.locator('.product-record-list>article')).toHaveCount(20);await page.getByRole('button',{name:'Sau',exact:true}).click();await expect(page.locator('.product-record-list>article')).toHaveCount(3);await widths(page);
});
test('buyer history is 20 per page, timestamps have no zone label and details preserve recovery',async({page},info)=>{
 await setup(page,'buyer');await page.goto('/orders');await expect(page.locator('.order-row')).toHaveCount(20);await page.locator('.order-list-section').getByRole('button',{name:'Sau',exact:true}).click();await expect(page.locator('.order-row')).toHaveCount(4);await expect(page.locator('.order-recorded').first()).not.toContainText('UTC');
 const history=page.locator('.transaction-history');await expect(history.locator('.operation-list>li')).toHaveCount(20);await history.getByRole('button',{name:'Sau',exact:true}).click();await expect(history.locator('.operation-list>li')).toHaveCount(4);await history.locator('.transaction-row>summary').first().click();await expect(history.getByRole('button',{name:'Ký intent đã chuẩn bị',exact:true}).first()).toBeVisible();await expect(history.locator('time').first()).toContainText('22/10/2026');await widths(page);await page.setViewportSize({width:375,height:1000});await page.screenshot({path:info.outputPath('buyer-history-375.png'),fullPage:true});
});
test('wallet purchase and sale scope, five header destinations, footer and one-time username',async({page},info)=>{
 await setup(page);await page.goto('/wallet');await expect(page.locator('.wallet-trades')).toBeVisible();await expect(page.locator('.wallet-trades .operation-list>li')).toHaveCount(20);await expect(page.locator('.wallet-trades .transaction-row summary strong').first()).toBeVisible();await widths(page);await expect.poll(()=>page.evaluate(()=>document.querySelector('.wallet-history')!.getBoundingClientRect().bottom<=document.querySelector('.site-footer')!.getBoundingClientRect().top)).toBe(true);await page.setViewportSize({width:375,height:1000});await page.screenshot({path:info.outputPath('wallet-375.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.desktop-navigation .primary-navigation a')).toHaveCount(5);await page.locator('.account-pill-btn').click();await expect(page.locator('#header-account')).not.toContainText('Quyền operator');await page.locator('.account-pill-btn').click();
 await page.goto('/account');const field=page.locator('.seller-identity-form input');await expect(field).toHaveValue(/^user_[a-f0-9]{16}$/);await field.fill('created_once');await page.getByRole('button',{name:'Tạo username',exact:true}).click();await page.getByRole('button',{name:'Xác nhận tạo một lần',exact:true}).click();await expect(field).toHaveAttribute('readonly','');await page.reload();await expect(field).toHaveValue('created_once');await expect(page.getByRole('button',{name:'Tạo username',exact:true})).toHaveCount(0);
 await page.locator('.site-footer').getByRole('link',{name:'Rebate, hoàn tiền & tranh chấp',exact:true}).click();await expect(page.getByRole('heading',{name:'Rebate, hoàn tiền & tranh chấp',exact:true})).toBeVisible();await expect(page.locator('.site-footer a[href^="mailto:"]')).toHaveCount(0);await widths(page);await page.setViewportSize({width:375,height:1000});await page.screenshot({path:info.outputPath('policy-375.png'),fullPage:true});
});
