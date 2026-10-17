import {test,expect,type Page} from '@playwright/test';
import {emptyCatalog} from './fixtures/catalog';

async function fixture(page:Page,signedIn=false,language='en'){
 const errors:string[]=[],writes:string[]=[];
 await page.addInitScript(({signedIn,language})=>{localStorage.setItem('groupdeal_lang',language);if(signedIn)localStorage.setItem('groupdeal_token','navigation-fixture');},{signedIn,language});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',r=>{
  const req=r.request(),url=new URL(req.url());if(req.method()!=='GET'){writes.push(url.pathname);return r.fulfill({status:405,json:{}});}
  if(url.pathname==='/api/auth/me')return r.fulfill({json:{user:{id:'nav-fixture',roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:null,email:null}}});
  if(url.pathname==='/api/v1/catalog')return r.fulfill({json:emptyCatalog(url.href)});
  if(url.pathname==='/api/health')return r.fulfill({json:{hubAddress:'0x1111111111111111111111111111111111111111',usdcAddress:'0x3600000000000000000000000000000000000000'}});
  if(url.pathname==='/api/notifications')return r.fulfill({json:{notifications:[],unread:0}});
  if(url.pathname==='/api/notifications/preferences')return r.fulfill({json:{userId:'nav-fixture',preferences:{inApp:true,email:false},contactStatus:'MISSING'}});
  return r.fulfill({json:{orders:[],operations:[],tickets:[],wallets:[],sessions:[],follows:[],pagination:{nextCursor:null}}});
 });return {errors,writes};
}
for(const width of [375,768,1440])test(`buyer navigation remains reachable at ${width}px`,async({page},info)=>{
 test.setTimeout(90_000);
 const f=await fixture(page);await page.setViewportSize({width,height:850});await page.goto('/explore');
 const mobile=width<1200;
 for(const [label,path] of [['Orders','/orders'],['Wallet','/wallet'],['Account','/account'],['Support','/support'],['Explore','/explore']]){
  if(mobile)await page.getByRole('button',{name:'Open navigation'}).click();
  const nav=mobile?page.getByRole('dialog',{name:'Navigation'}):page.locator('.desktop-navigation');
  await nav.getByRole('link',{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(path+'$'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 if(mobile){const trigger=page.getByRole('button',{name:'Open navigation'});await trigger.click();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await trigger.click();await page.screenshot({path:info.outputPath('menu.png')});}
 expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('catalog query is the source for reload, Back and Forward',async({page})=>{
 const f=await fixture(page);await page.goto('/explore?q=first&sort=oldest');await expect(page.locator('#catalog-search')).toHaveValue('first');
 await page.locator('#catalog-search').fill('second');await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page).toHaveURL(/q=second/);
 await page.goBack();await expect(page.locator('#catalog-search')).toHaveValue('first');await page.goForward();await expect(page.locator('#catalog-search')).toHaveValue('second');await page.reload();await expect(page.locator('#catalog-search')).toHaveValue('second');expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('legacy routes migrate and direct routes reload',async({page})=>{
 const f=await fixture(page);for(const [hash,path] of [['#orders','/orders'],['#support','/support'],['#operator','/admin'],['#docs','/docs']]){await page.goto('/'+hash);await expect(page).toHaveURL(new RegExp(path+'$'));await page.reload();await expect(page).toHaveURL(new RegExp(path+'$'));await expect(page.locator('main')).not.toBeEmpty();}
 await page.goto('/not-a-page');await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('notification and account popovers are independent and restore focus',async({page},info)=>{
 const f=await fixture(page,true);await page.setViewportSize({width:375,height:812});await page.goto('/orders');
 const bell=page.getByRole('button',{name:'Notifications',exact:true}),account=page.locator('.account-pill-btn');
 await bell.click();await expect(page.locator('#header-notifications')).toBeVisible();await expect(page.locator('#header-account')).toHaveCount(0);
 await account.click();await expect(page.locator('#header-account')).toBeVisible();await expect(page.locator('#header-notifications')).toHaveCount(0);await page.keyboard.press('Escape');await expect(account).toBeFocused();
 await bell.click();await page.screenshot({path:info.outputPath('notifications.png')});await page.keyboard.press('Escape');await expect(bell).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});

for(const language of ['vi','en'])test('seller entry copy and focus '+language,async({page},info)=>{
 const f=await fixture(page,true,language),en=language==='en';await page.setViewportSize({width:375,height:1000});await page.goto('/account');
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');const account=page.locator('.account-pill-btn');await account.click();
 const entry=page.getByRole('button',{name:en?'Set up seller profile':'Đăng ký mở Kênh Người Bán',exact:true});await expect(entry).toBeVisible();
 expect(await page.locator('#header-account').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await entry.click();const dialog=page.getByRole('dialog',{name:en?'Seller profile and payout':'Hồ sơ người bán và ví nhận tiền',exact:true});await expect(dialog).toBeVisible();
 await page.screenshot({path:info.outputPath('seller-entry-'+language+'-text200.png'),animations:'disabled'});
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(account).toBeFocused();expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
