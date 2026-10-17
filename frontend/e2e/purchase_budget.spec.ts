import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {masterFixture} from './fixtures/master-deal.mjs';
import {emptyCatalog} from './fixtures/catalog';
const wallet='0x73307bdd39d875f98857ffce0fed1cdc62f50b6d',other='0x1111111111111111111111111111111111111111';
async function fixture(page:Page,language='vi'){
 const data=masterFixture(),state={balance:300n*10n**18n,invalid:false,hold:false,releases:[] as (()=>void)[],held:0,writes:[] as string[],rpc:[] as string[],errors:[] as string[],user:{id:'budget-fixture',email:null,roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:wallet}};
 await page.addInitScript(language=>{if(window.top!==window.self)return;localStorage.setItem('groupdeal_token','budget-session-fixture');localStorage.setItem('groupdeal_lang',language);},language);
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?$/,async route=>{
  const payload=route.request().postDataJSON(),list=Array.isArray(payload)?payload:[payload];
  list.forEach((r:any)=>{state.rpc.push(r.method);expect(['eth_chainId','eth_getBalance','eth_gasPrice','eth_call','eth_getCode']).toContain(r.method);});
  const old=state.balance,invalid=state.invalid;
  if(state.hold&&list.some((r:any)=>r.method==='eth_getBalance'&&r.params[0].toLowerCase()===wallet)){state.held++;await new Promise<void>(done=>state.releases.push(done));}
  const reply=(r:any)=>({jsonrpc:'2.0',id:r.id,result:r.method==='eth_chainId'?'0x4cef52':r.method==='eth_getBalance'?(invalid?'-1':'0x'+old.toString(16)):r.method==='eth_gasPrice'?'0x4a817c800':'0x'+'0'.repeat(64)});
  await route.fulfill({json:Array.isArray(payload)?list.map(reply):reply(payload)});
 });
 await page.route('**/api/**',route=>{const req=route.request(),url=new URL(req.url());if(req.method()!=='GET'){state.writes.push(url.pathname);return route.fulfill({status:409,json:{error:'LOCAL_FIXTURE: financial writes disabled'}});}
  if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:state.user}});
  if(url.pathname==='/api/v1/catalog')return route.fulfill({json:emptyCatalog(req.url())});
  if(url.pathname==='/api/campaigns/master')return route.fulfill({json:data});
  if(url.pathname==='/api/health')return route.fulfill({json:{chainId:5042002,hubAddress:other,usdcAddress:'0x3600000000000000000000000000000000000000'}});
  if(url.pathname==='/api/notifications/preferences')return route.fulfill({json:{userId:state.user.id,preference:{emailEnabled:false}}});
  return route.fulfill({json:{notifications:[],unread:0,operations:[],orders:[],pagination:{nextCursor:null}}});
 });
 page.on('pageerror',e=>state.errors.push(e.message));await page.goto('/#campaign-master');await expect(page.getByRole('heading',{name:data.campaign.title,exact:true})).toBeVisible();await expect(page.locator('.account-pill-btn')).toBeVisible();
 const checkpoint=JSON.stringify({phase:'UNKNOWN',fixture:'financial-checkpoint'});await page.evaluate(checkpoint=>localStorage.setItem('groupdeal_bridge_v2:retained-budget-fixture',checkpoint),checkpoint);
 const open=async()=>{await page.locator('.deal-join-cta').click();const dialog=page.locator('dialog.join-dialog');await expect(dialog).toBeVisible();return dialog;};
 const safe=async()=>{expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_bridge_v2:retained-budget-fixture'))).toBe(checkpoint);};
 return {state,data,open,safe};
}
async function session(context:BrowserContext,page:Page){const tab=await context.newPage();await tab.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local session fixture</title>'}));await tab.goto(new URL('/budget-session-fixture',page.url()).href);await tab.evaluate(()=>localStorage.setItem('groupdeal_token','different-budget-session-fixture'));await tab.close();}
test('purchase review shows one USDC balance and combined goods plus both gas reserves',async({page})=>{
 await page.clock.install();await page.clock.setFixedTime(new Date());
 const f=await fixture(page),d=await f.open();await expect(d.locator('[data-budget=balance]')).toHaveText('300.0 USDC');await expect(d.locator('[data-budget=approve]')).toHaveText('0.028 USDC');await expect(d.locator('[data-budget=commit]')).toHaveText('0.028 USDC');await expect(d.locator('[data-budget=required]')).toHaveText('105.056 USDC');await expect(d.locator('.join-agreement input')).not.toBeChecked();await d.locator('.join-agreement input').check();await expect(d.locator('.join-submit')).toBeEnabled();expect(f.state.rpc).not.toContain('eth_sendTransaction');await d.getByRole('button',{name:'Đọc lại số dư và ngân sách',exact:true}).click();await expect(d.locator('[data-budget=required]')).toHaveText('105.056 USDC');await expect(d.locator('.join-agreement input')).not.toBeChecked();await expect(d.locator('.join-submit')).toBeDisabled();await f.safe();
});
test('goods and only one gas reserve show the exact shortfall and continue into funding without authorization',async({page})=>{
 const f=await fixture(page);f.state.balance=105_028_000_000_000_000_000n;const d=await f.open();await expect(d.locator('[data-budget=shortfall]')).toContainText('0.028 USDC');await d.locator('.join-agreement input').check();await expect(d.locator('.join-submit')).toHaveText('Tiếp tục: báo giá và nạp USDC');await d.locator('.join-submit').click();await expect(page.getByRole('button',{name:'Kiểm tra số dư và tiếp tục mua',exact:true})).toBeVisible();await f.safe();
});
test('invalid budget input disables consent and explicit refresh restores a readable review',async({page})=>{
 const f=await fixture(page);f.state.invalid=true;const d=await f.open();await expect(d.locator('.purchase-budget')).toContainText('Chưa đọc được ngân sách');await expect(d.locator('.join-agreement input')).toBeDisabled();await expect(d.locator('.join-submit')).toBeDisabled();await expect(d.locator('[data-budget=balance]')).toHaveCount(0);f.state.invalid=false;await d.getByRole('button',{name:'Đọc lại số dư và ngân sách',exact:true}).click();await expect(d.locator('[data-budget=required]')).toHaveText('105.056 USDC');await expect(d.locator('.join-agreement input')).not.toBeChecked();await f.safe();
});
test('quantity changes invalidate consent and recompute goods without doubling the USDC balance',async({page})=>{
 const f=await fixture(page),d=await f.open();await expect(d.locator('[data-budget=required]')).toBeVisible();await d.locator('.join-agreement input').check();await d.getByRole('button',{name:'Tăng số lượng',exact:true}).click();await expect(d.locator('[data-budget=required]')).toHaveText('210.056 USDC');await expect(d.locator('[data-budget=balance]')).toHaveText('300.0 USDC');await expect(d.locator('.join-agreement input')).not.toBeChecked();await expect(d.locator('.join-submit')).toBeDisabled();await f.safe();
});
test('a late budget response cannot replace the review for another authenticated principal',async({page,context})=>{
 const f=await fixture(page),d=await f.open();await expect(d.locator('[data-budget=balance]')).toBeVisible();f.state.hold=true;await d.getByRole('button',{name:'Đọc lại số dư và ngân sách',exact:true}).click();await expect.poll(()=>f.state.held).toBeGreaterThan(0);f.state.user={...f.state.user,id:'different-budget-owner',activeWallet:other};f.state.balance=400n*10n**18n;await session(context,page);await expect(d.locator('[data-budget=balance]')).toHaveText('400.0 USDC');f.state.hold=false;f.state.releases.forEach(done=>done());await expect(d.locator('[data-budget=balance]')).toHaveText('400.0 USDC');await expect(d.locator('.join-agreement input')).not.toBeChecked();await f.safe();
});
test('expired budget blocks signing until an explicit refresh and new consent',async({page})=>{
 await page.clock.install();const f=await fixture(page),d=await f.open();await expect(d.locator('[data-budget=required]')).toBeVisible();await d.locator('.join-agreement input').check();await page.clock.fastForward(60_001);await expect(d.locator('.purchase-budget')).toContainText('Ngân sách đã hết hạn');await expect(d.locator('.join-submit')).toBeDisabled();await d.getByRole('button',{name:'Đọc lại số dư và ngân sách',exact:true}).click();await expect(d.locator('[data-budget=required]')).toHaveText('105.056 USDC');await expect(d.locator('.join-agreement input')).not.toBeChecked();await f.safe();
});
for(const language of ['vi','en'])test(`purchase budget ${language} seven widths and keyboard consent text200`,async({page},info)=>{
 const f=await fixture(page,language),d=await f.open();await page.evaluate(()=>document.documentElement.style.fontSize="200%");await expect(d.locator('[data-budget=required]')).toBeVisible();for(const width of [320,375,430,768,1024,1280,1440]){await page.setViewportSize({width,height:900});await d.locator('.purchase-budget').scrollIntoViewIfNeeded();const layout=await d.evaluate(el=>({fits:el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1,width:el.clientWidth,scroll:el.scrollWidth,document:document.documentElement.scrollWidth,overflow:[...el.querySelectorAll("*")].filter(e=>e.getBoundingClientRect().right>el.getBoundingClientRect().right).slice(0,5).map(e=>({text:e.textContent?.slice(0,40),class:e.className}))}));expect(layout,JSON.stringify(layout)).toMatchObject({fits:true});await page.screenshot({path:info.outputPath(`budget-${width}.png`)});}await d.locator('.join-agreement input').focus();await page.keyboard.press('Space');await expect(d.locator('.join-agreement input')).toBeChecked();await expect(d.locator('.join-submit')).toBeEnabled();await f.safe();
});
