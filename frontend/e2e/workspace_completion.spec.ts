import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {waitForOwnedPorts} from './fixtures/owned-port';
const require=createRequire(import.meta.url),root=path.resolve(process.cwd(),'..');
const wallet='0x'+'1'.repeat(40),buyerWallet='0x'+'2'.repeat(40);
let child:ChildProcess,port:number,origin:string,sellerToken:string,buyerToken:string,dualToken:string;
test.beforeAll(async()=>{
 const {localCheckEnvironment}=require(path.join(root,'scripts/local_check_runtime.cjs'));
 child=spawn(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/workspace_browser_server.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),windowsHide:true,stdio:['ignore','pipe','pipe']});
 const ready=await new Promise<any>((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Owned workspace API not ready')),12000);child.once('error',()=>{clearTimeout(timer);reject(Error('Owned workspace API could not start'))});child.once('exit',()=>{clearTimeout(timer);reject(Error('Owned workspace API exited before ready'))});child.stdout!.on('data',b=>{output+=b.toString();const line=output.split(/\r?\n/).find(l=>l.startsWith('{"localFixture"'));if(line){clearTimeout(timer);resolve(JSON.parse(line))}})});
 expect(ready.isolated).toBe(true);expect(ready.runtime).toBe(process.env.GROUPDEAL_BROWSER_MODE==='preview'?'COMPILED_BACKEND':'TSX_BACKEND');port=ready.port;origin='http://127.0.0.1:'+port;sellerToken=ready.sellerToken;buyerToken=ready.buyerToken;dualToken=ready.dualToken;
});
test.afterAll(async()=>{if(child?.exitCode===null&&!child.signalCode)await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM')});if(port)await waitForOwnedPorts([port]);});
async function setup(page:Page,role:'buyer'|'seller'|'dual'='seller',language='vi'){
 const token=role==='dual'?dualToken:role==='seller'?sellerToken:buyerToken,account=role==='dual'?'0x'+'4'.repeat(40):role==='seller'?wallet:buyerWallet;
 await page.addInitScript(({token,language})=>{localStorage.setItem('groupdeal_token',token);localStorage.setItem('groupdeal_lang',language);},{token,language});
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


for(const language of ['vi','en'])for(const width of [375,1440])test('review delta keyboard wallet and one-time handle '+language+' '+width,async({page},info)=>{
 const en=language==='en';await setup(page,'dual',language);await page.setViewportSize({width,height:1000});await page.goto('/wallet');
 // Both roles on one real isolated SQL order; B must map to SELL with default direction.
 const trades=page.locator('.wallet-trades'),rows=trades.locator('.operation-list>li'),filter=trades.getByRole('combobox');
 await expect(rows).toHaveCount(20);await expect(trades.getByRole('alert')).toHaveCount(0);await expect(trades.locator('summary strong').first()).toContainText(en?'Sale':'Đơn bán');
 const seen=new Set(await rows.locator('summary span:nth-child(2)>small').allTextContents());const next=trades.getByRole('button',{name:en?'Next':'Sau',exact:true});
 await next.focus();await page.keyboard.press('Enter');await expect(trades.getByRole('status')).toContainText([en?'Page 2':'Trang 2']);await expect(rows).toHaveCount(20);
 for(const id of await rows.locator('summary span:nth-child(2)>small').allTextContents()){expect(seen.has(id)).toBe(false);seen.add(id);}
 await next.focus();await page.keyboard.press('Enter');await expect(rows).toHaveCount(5);for(const id of await rows.locator('summary span:nth-child(2)>small').allTextContents()){expect(seen.has(id)).toBe(false);seen.add(id);}expect(seen.size).toBe(45);
 await filter.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(rows).toHaveCount(0);await expect(filter).toBeFocused();await expect(trades).toContainText(en?'No orders in this view.':'Chưa có đơn trong phạm vi này.');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(rows).toHaveCount(20);await expect(filter).toBeFocused();
 let release!:()=>void;const hold=new Promise<void>(r=>release=r);await page.route('**/api/wallet/activity?*',async r=>{await hold;await r.fulfill({status:503,json:{error:'SYNTHETIC_FAILURE'}})});
 const reload=trades.getByRole('button',{name:en?'Reload':'Tải lại',exact:true});await reload.focus();await page.keyboard.press('Enter');await expect(trades.getByRole('status').filter({hasText:en?'Loading…':'Đang tải…'})).toBeVisible();release();await expect(trades.getByRole('alert')).toContainText(en?'Activity is unavailable':'Chưa tải được hoạt động');
 await page.unroute('**/api/wallet/activity?*');await reload.focus();await page.keyboard.press('Enter');await expect(rows).toHaveCount(20);await expect(trades.getByRole('alert')).toHaveCount(0);
 const zoom=await page.addStyleTag({content:'html {font-size:200% !important}'});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.screenshot({path:info.outputPath('wallet-text200.png'),fullPage:true});await zoom.evaluate(el=>el.remove());
 // Keyboard confirmation/back, definitive error, success and read-only identity.
 let created=false,attempts=0;const identity=()=>({userId:'dual',...(created?{username:'delta_handle'}:{}),revision:created?1:0,links:{},updatedAt:1});
 await page.route('**/api/seller/identity',r=>r.fulfill({json:{identity:identity(),suggestedUsername:'delta_handle'}}));
 await page.route('**/api/seller/identity/username',r=>{attempts++;if(attempts===1)return r.fulfill({status:409,json:{error:'SELLER_USERNAME_UNAVAILABLE'}});created=true;return r.fulfill({json:{identity:identity()}})});
 await page.goto('/account');const field=page.locator('.seller-identity-form input'),panel=page.locator('.seller-identity-panel');await expect(field).toHaveValue('delta_handle');await field.focus();await page.keyboard.press('Enter');
 const confirm=panel.getByRole('button',{name:en?'Confirm one-time creation':'Xác nhận tạo một lần',exact:true});await expect(confirm).toBeFocused();await page.keyboard.press('Tab');await expect(panel.getByRole('button',{name:en?'Choose again':'Chọn lại',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(field).toBeFocused();expect(attempts).toBe(0);
 await page.keyboard.press('Enter');await expect(confirm).toBeFocused();await page.keyboard.press('Enter');await expect(panel.getByRole('alert')).toContainText(en?'Username is taken':'Username đã được sử dụng');await expect(confirm).toBeFocused();
 await page.keyboard.press('Enter');await expect(field).toHaveAttribute('readonly','');await expect(field).toBeFocused();await expect(panel.getByRole('status')).toContainText(en?'Username created':'Đã tạo username');expect(attempts).toBe(2);
 await page.addStyleTag({content:'html {font-size:200% !important}'});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.screenshot({path:info.outputPath('handle-text200.png'),fullPage:true});
});
for(const language of ['vi','en'])for(const timezoneId of ['UTC','Asia/Ho_Chi_Minh'])test.describe('social display '+language+' '+timezoneId,()=>{
 test.use({timezoneId});test('review delta Vietnam social verified time',async({page})=>{
  await setup(page,'dual',language);await page.route('**/api/seller/identity',r=>r.fulfill({json:{identity:{userId:'dual',username:'delta_handle',revision:1,updatedAt:1,links:{github:{provider:'github',providerUserId:'123',username:'fixture-user',url:'https://github.com/fixture-user',verifiedAt:Date.parse('2026-10-24T01:02:03Z')}}}}}));
  await page.goto('/account');const stamp=page.locator('.seller-social-list small');await expect(stamp).toContainText('24/10/2026');await expect(stamp).toContainText('08:02');
 });
});
