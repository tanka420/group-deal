import {test, expect, Page, BrowserContext} from '@playwright/test';
import {masterFixture} from './fixtures/master-deal.mjs';
import {emptyCatalog} from './fixtures/catalog';

// Real app contexts and emitted components; HTTP/session-state fixtures only.
// No provider OTP, wallet signatures, financial broadcast or live proof.
const wallet='0x73307bdd39d875f98857ffce0fed1cdc62f50b6d';
const pendingKey='groupdeal_checkout:v1:'+wallet+':master';
async function fixture(page:Page,language='vi',legacy?:string,login?:'CIRCLE'|'EXTERNAL'){
 const data=masterFixture(),state={reads:0,writes:[] as string[],errors:[] as string[],user:{id:'handoff-fixture',email:null,roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:wallet},offline:false};
 if(login==='CIRCLE')Object.assign(state.user,{loginMethod:'CIRCLE_EMAIL',circleWallet:{walletId:'fixture-circle-wallet',address:wallet,blockchain:'ARC-TESTNET'}});
 await page.addInitScript(({language,legacy,pendingKey,login})=>{if(window.top!==window.self)return;localStorage.setItem('groupdeal_lang',language);if(legacy||login)localStorage.setItem('groupdeal_token','legacy-session-fixture');if(legacy)localStorage.setItem(pendingKey,legacy);}, {language,legacy,pendingKey,login});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?$/,route=>{
  const payload=route.request().postDataJSON();const reply=(req:any)=>({jsonrpc:'2.0',id:req.id,result:req.method==='eth_chainId'?'0x4cef52':req.method==='eth_getBalance'?('0x'+(login?300n*10n**18n:2n*10n**18n).toString(16)):req.method==='eth_gasPrice'?'0x4a817c800':'0x'+'0'.repeat(64)});
  return route.fulfill({json:Array.isArray(payload)?payload.map(reply):reply(payload)});
 });
 await page.route('**/api/**',route=>{
  const req=route.request(),url=new URL(req.url());if(req.method()!=='GET'){state.writes.push(url.pathname);return route.fulfill({status:409,json:{error:'LOCAL_FIXTURE: financial writes disabled'}});}
  if(url.pathname==='/api/v1/catalog')return route.fulfill({json:emptyCatalog(req.url())});
  if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:state.user}});
  if(url.pathname==='/api/health')return route.fulfill({json:{chainId:5042002,hubAddress:'0x1111111111111111111111111111111111111111',usdcAddress:'0x3600000000000000000000000000000000000000'}});
  if(url.pathname==='/api/campaigns/master'){state.reads++;return route.fulfill(state.offline?{status:503,json:{error:'Local fixture outage'}}:{json:data});}
  return route.fulfill({json:{notifications:[],unread:0,operations:[],orders:[],pagination:{nextCursor:null}}});
 });
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.goto('/#campaign-master');await expect(page.getByRole('heading',{name:data.campaign.title,exact:true})).toBeVisible();
 return{data,state};
}
async function session(context:BrowserContext, page:Page, token='signed-in-session-fixture'){
 const writer=await context.newPage();await writer.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local session fixture</title>'}));
 await writer.goto(new URL('/local-session-fixture',page.url()).href);await writer.evaluate(token=>localStorage.setItem('groupdeal_token',token),token);await writer.close();
}
async function review(page:Page){await page.locator('.deal-join-cta').click();return page.locator('dialog.join-dialog');}
async function requestSignIn(page:Page,dialog:ReturnType<Page['locator']>,en=false){
 await dialog.locator('.join-agreement input').check();await dialog.getByRole('button',{name:en?'Sign in to continue':'Đăng nhập để tiếp tục',exact:true}).click();
 await expect(page.getByRole('dialog',{name:en?'Choose a sign-in method':'Chọn phương thức đăng nhập',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);
}

test('direct deal reload keeps the filtered catalog return context',async({page})=>{
 const {state}=await fixture(page,'en');await page.goto('/deals/master?returnTo=%2Fexplore%3Fq%3Dtoolkit%26sort%3Doldest');await page.reload();
 await page.getByRole('button',{name:'Back to deals',exact:true}).click();await expect(page).toHaveURL(/\/explore\?q=toolkit&sort=oldest$/);await expect(page.locator('#catalog-search')).toHaveValue('toolkit');expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

for(const language of ['vi','en'])for(const width of [320,1440])test(`guest handoff ${language} ${width}: fresh deal, bounded choices and new consent without signing`,async({page,context},info)=>{
 await page.setViewportSize({width,height:850});const {data,state}=await fixture(page,language),dialog=await review(page),en=language==='en';
 await dialog.getByRole('button',{name:en?'Increase quantity':'Tăng số lượng',exact:true}).click();
 await dialog.getByLabel(en?'Payment source':'Nguồn thanh toán',{exact:true}).selectOption('OTHER_USDC');
 await dialog.getByRole('checkbox',{name:en?'Continue only if an early supporter slot is available':'Chỉ tiếp tục nếu còn suất early supporter',exact:true}).check();
 await requestSignIn(page,dialog,en);expect(state.writes).toEqual([]);
 data.campaign.tiers[1].price='99000000';data.campaign.maxPerAccount=1;data.campaign.earlyRebateEnabled=false;data.campaign.termsHash='0x'+'78'.repeat(32);data.campaign.product.license.edition='Refreshed fixture license';
 await session(context,page);await expect(dialog).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);expect(state.reads).toBeGreaterThan(1);
 await expect(dialog.getByLabel(en?'Quantity':'Số lượng',{exact:true})).toHaveValue('1');await expect(dialog.getByLabel(en?'Payment source':'Nguồn thanh toán',{exact:true})).toHaveValue('OTHER_USDC');
 await expect(dialog).toContainText('Refreshed fixture license');await expect(dialog.locator('.commitment-total')).toContainText('99 USDC');await expect(dialog.locator('.join-agreement input')).not.toBeChecked();await expect(dialog.locator('.join-submit')).toBeDisabled();
 await expect(dialog.getByRole('status')).toContainText(en?'refreshed after sign-in':'tải lại deal sau đăng nhập');expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
 await expect.poll(()=>dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`guest-handoff-${language}-${width}.png`)});
});

test('guest cancellation and reload preserve choices without storing consent or starting authentication',async({page})=>{
 const {state}=await fixture(page),dialog=await review(page);await dialog.getByRole('button',{name:'Tăng số lượng',exact:true}).click();await requestSignIn(page,dialog);
 await page.getByRole('button',{name:'Đóng đăng nhập',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.deal-join-cta')).toBeFocused();
 await page.reload();await expect(page.getByRole('dialog')).toHaveCount(0);await review(page);await expect(dialog.getByLabel('Số lượng',{exact:true})).toHaveValue('2');await expect(dialog.locator('.join-agreement input')).not.toBeChecked();
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('groupdeal_join_review:v1:master')!));expect(draft).not.toHaveProperty('agreed');expect(draft).not.toHaveProperty('token');
});
test('failed post-auth refresh cannot show a stale purchase review or send an authorization',async({page,context})=>{
 const {state}=await fixture(page),dialog=await review(page);await requestSignIn(page,dialog);state.offline=true;await session(context,page);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('Không tải được dữ liệu');expect(state.writes).toEqual([]);
 state.offline=false;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await review(page);await expect(dialog.locator('.join-agreement input')).not.toBeChecked();expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('unavailable review storage keeps in-memory choices through sign-in without financial writes',async({page,context})=>{
 const {state}=await fixture(page);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('groupdeal_join_review:'))throw new Error('Fixture review storage unavailable');return original.call(this,key,value);};});
 const dialog=await review(page);await dialog.getByRole('button',{name:'Tăng số lượng',exact:true}).click();await requestSignIn(page,dialog);await session(context,page);
 await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Số lượng',{exact:true})).toHaveValue('2');await expect(dialog.locator('.join-agreement input')).not.toBeChecked();expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('expired or injected review draft cannot restore consent, privileged fields or quantity',async({page})=>{
 await page.addInitScript(()=>{if(window.top===window.self)sessionStorage.setItem('groupdeal_join_review:v1:master',JSON.stringify({version:1,campaignId:'master',termsHash:'0x'+'34'.repeat(32),savedAt:Date.now()-31*60*1000,quantity:999,requireEarlySlot:true,paymentSource:'OTHER_USDC',agreed:true}));});
 const {state}=await fixture(page),dialog=await review(page);await expect(dialog.getByLabel('Số lượng',{exact:true})).toHaveValue('1');await expect(dialog.getByLabel('Nguồn thanh toán',{exact:true})).toHaveValue('ARC_USDC');await expect(dialog.locator('.join-agreement input')).not.toBeChecked();expect(state.writes).toEqual([]);
});
test('legacy ambiguous checkout stays intact across checks, reload and another purchase attempt',async({page})=>{
 const legacy=JSON.stringify({quantity:1,requireEarlySlot:false,maxGrossUsdc:'105000000',phase:'BUY_PENDING',createdAt:Date.now()}),{state}=await fixture(page,'vi',legacy);let confirmations=0;
 page.on('dialog',async dialog=>{confirmations++;await dialog.accept();});
 await page.getByRole('button',{name:'Kiểm tra lại giao dịch / đơn cũ',exact:true}).click();await expect(page.locator('dialog.transaction-dialog')).toContainText('Trạng thái được giữ nguyên');
 expect(await page.evaluate(key=>localStorage.getItem(key),pendingKey)).toBe(legacy);expect(confirmations).toBe(0);
 await page.reload();await page.getByRole('button',{name:'Kiểm tra lại giao dịch / đơn cũ',exact:true}).click();await expect(page.locator('dialog.transaction-dialog')).toContainText('Trạng thái được giữ nguyên');
 await page.getByRole('button',{name:'Đóng',exact:true}).click();const dialog=await review(page);await dialog.locator('.join-agreement input').check();await dialog.locator('.join-submit').click();await expect(page.locator('dialog.transaction-dialog')).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),pendingKey)).toBe(legacy);expect(confirmations).toBe(0);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('changing authenticated principal invalidates an open review consent',async({page,context})=>{
 const {state}=await fixture(page);await session(context,page);await expect(page.locator('.account-pill-btn')).toBeVisible();const dialog=await review(page);await dialog.locator('.join-agreement input').check();await expect(dialog.locator('.join-submit')).toBeEnabled();
 state.user={...state.user,id:'different-handoff-account',activeWallet:'0x1111111111111111111111111111111111111111'};await session(context,page,'different-session-fixture');await expect(page.locator('.account-pill-btn')).toBeVisible();await expect(dialog.locator('.join-agreement input')).not.toBeChecked();await expect(dialog.locator('.join-submit')).toBeDisabled();expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('a deal closed during sign-in returns a blocked review without any financial request',async({page,context})=>{
 const {data,state}=await fixture(page),dialog=await review(page);await requestSignIn(page,dialog);
 data.campaign.endTime=Math.floor(Date.now()/1000)-1;await session(context,page);await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.locator('.join-agreement input')).toBeDisabled();await expect(dialog.locator('.join-submit')).toBeDisabled();expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('navigating away during sign-in cannot reopen or purchase the previous deal',async({page,context})=>{
 const {state}=await fixture(page),dialog=await review(page);await requestSignIn(page,dialog);
 const initialReads=state.reads; // StrictMode can make two initial reads in dev.
 await page.evaluate(()=>location.hash='#docs');await session(context,page);await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.developer-docs')).toBeVisible();expect(new URL(page.url()).pathname).toBe('/docs');expect(state.reads).toBe(initialReads);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});


for(const language of ['vi','en'])test('Circle signing preflight '+language+': restored account without signing session creates no purchase intent',async({page})=>{
 const {state}=await fixture(page,language,undefined,'CIRCLE'),dialog=await review(page);await dialog.locator('.join-agreement input').check();await dialog.locator('.join-submit').click();
 const transaction=page.locator('dialog.transaction-dialog');await expect(transaction).toContainText(language==='vi'?'Giao dịch thất bại':'Transaction failed');expect(state.writes).toEqual([]);await expect(transaction).toContainText(language==='vi'?'Phiên ký Circle chưa có trong tab này.':'Circle signing is unavailable in this tab.');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
 expect(await page.evaluate(pendingKey=>localStorage.getItem(pendingKey),pendingKey)).toBeNull();
 expect(await page.evaluate(()=>localStorage.getItem('groupdeal_buy_retry:handoff-fixture:master'))).toBeNull();
});
test('Circle signing preflight preserves an existing pending purchase checkpoint',async({page})=>{
 const retained=JSON.stringify({quantity:1,requireEarlySlot:false,maxGrossUsdc:'105000000',operationId:'retained-circle-intent',phase:'BUY_PENDING',createdAt:1});
 const {state}=await fixture(page,'vi',retained,'CIRCLE');await page.getByRole('button',{name:'Đóng',exact:true}).click();const dialog=await review(page);await dialog.locator('.join-agreement input').check();await dialog.locator('.join-submit').click();
 await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Kiểm tra lại giao dịch / đơn cũ',exact:true})).toBeVisible();
 expect(await page.evaluate(pendingKey=>localStorage.getItem(pendingKey),pendingKey)).toBe(retained);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('Circle signing preflight does not prevent an external account from requesting authorization',async({page})=>{
 const {state}=await fixture(page,'en',undefined,'EXTERNAL'),dialog=await review(page);await dialog.locator('.join-agreement input').check();await dialog.locator('.join-submit').click();
 await expect.poll(()=>state.writes).toEqual(['/api/orders/authorize']);expect(state.errors).toEqual([]);
});
