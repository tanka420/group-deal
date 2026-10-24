import {test,expect,type Page} from '@playwright/test';
import {emptyCatalog} from './fixtures/catalog';

async function fixture(page:Page,signedIn=false,language='en'){
 const errors:string[]=[],writes:string[]=[];
 await page.addInitScript(({signedIn,language})=>{if(!localStorage.getItem('groupdeal_lang'))localStorage.setItem('groupdeal_lang',language);if(signedIn)localStorage.setItem('groupdeal_token','navigation-fixture');},{signedIn,language});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',r=>{
  const req=r.request(),url=new URL(req.url());if(req.method()!=='GET'){writes.push(url.pathname);return r.fulfill({status:405,json:{}});}
  if(url.pathname==='/api/auth/me')return r.fulfill({json:{user:{id:'nav-fixture',roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:null,email:null}}});
  if(url.pathname==='/api/v1/catalog')return r.fulfill({json:emptyCatalog(url.href)});
  if(url.pathname==='/api/health')return r.fulfill({json:{hubAddress:'0x1111111111111111111111111111111111111111',usdcAddress:'0x3600000000000000000000000000000000000000'}});
  if(url.pathname==='/api/notifications')return r.fulfill({json:{notifications:[],unread:0}});
  if(url.pathname==='/api/notifications/preferences')return r.fulfill({json:{userId:'nav-fixture',preferences:{inApp:true,email:false},contactStatus:'MISSING'}});
  return r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[],operations:[],tickets:[],wallets:[],sessions:[],follows:[],pagination:{nextCursor:null}}});
 });return {errors,writes};
}
for(const width of [375,768,1440])test(`buyer navigation remains reachable at ${width}px`,async({page},info)=>{
 const f=await fixture(page,true);await page.setViewportSize({width,height:850});await page.goto('/explore');
 const account=page.locator('.account-pill-btn');
 for(const [label,path] of [['Wallet','/wallet'],['Account settings','/account'],['Support','/support']]){
  await account.click();await page.locator('#header-account').getByRole('button',{name:label,exact:true}).click();
  await expect(page).toHaveURL(new RegExp(path+'$'));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const mobile=width<1200;
 for(const [label,path] of [['Home','/'],['Explore','/explore'],['Orders','/orders'],['Wallet','/wallet'],['Account','/account']]){
  if(mobile)await page.getByRole('button',{name:'Open navigation'}).click();
  const navigation=mobile?page.getByRole('region',{name:'Navigation',exact:true}):page.locator('.desktop-navigation');
  await navigation.getByRole('link',{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(path+'$'));
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

for(const signedIn of [false,true])for(const language of ['vi','en'])test(`header language is public and persists for ${signedIn?'account':'guest'} in ${language}`,async({page})=>{
 const f=await fixture(page,signedIn,language);await page.goto('/explore');
 const toggle=page.locator('.header-language');await expect(toggle).toBeVisible();
 if(signedIn){const position=await page.locator('.header-actions').evaluate(e=>{
  const language=e.querySelector('.header-language')!.getBoundingClientRect(),bell=e.querySelector('[aria-controls="header-notifications"]')!.getBoundingClientRect();
  return language.right<=bell.left;
 });expect(position).toBe(true);}
 await toggle.click();const next=language==='vi'?'en':'vi';await expect(page.locator('html')).toHaveAttribute('lang',next);
 await expect(page.getByRole('button',{name:next==='en'?'Language: English':'Ngôn ngữ: Tiếng Việt',exact:true})).toBeVisible();
 // The app must restore the selected language on a fresh page load.
 await page.goto('/account');await expect(page.locator('html')).toHaveAttribute('lang',next);
 expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});

for(const width of [1200,1280,1440,1920])for(const signedIn of [false,true])test(`desktop navigation is centered at ${width}px for ${signedIn?'account':'guest'}`,async({page})=>{
 const f=await fixture(page,signedIn,'vi');await page.setViewportSize({width,height:900});await page.goto('/explore');
 await expect(page.locator('.desktop-navigation')).toBeVisible();
 const layout=await page.locator('.header-inner').evaluate(e=>{
  const box=e.getBoundingClientRect(),nav=e.querySelector('.desktop-navigation')!.getBoundingClientRect(),brand=e.querySelector('.header-brand')!.getBoundingClientRect(),actions=e.querySelector('.header-actions')!.getBoundingClientRect();
  return {offset:Math.abs((nav.left+nav.right-box.left-box.right)/2),leftGap:nav.left-brand.right,rightGap:actions.left-nav.right,overflow:document.documentElement.scrollWidth>innerWidth};
 });expect(layout.offset).toBeLessThan(1);expect(layout.leftGap).toBeGreaterThanOrEqual(16);expect(layout.rightGap).toBeGreaterThanOrEqual(16);expect(layout.overflow).toBe(false);
 expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});

for(const viewport of [{width:320,height:225},{width:375,height:812},{width:768,height:900},{width:1024,height:768}])test(`navigation dropdown stays attached while scrolling at ${viewport.width}x${viewport.height}`,async({page},info)=>{
 const f=await fixture(page,true);await page.setViewportSize(viewport);await page.goto('/explore');
 const trigger=page.getByRole('button',{name:'Open navigation'}),menu=page.getByRole('region',{name:'Navigation',exact:true});
 await trigger.click();await expect(menu).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
 const bounds=await menu.evaluate(e=>{const menu=e.getBoundingClientRect(),header=document.querySelector('.header')!.getBoundingClientRect();return{gap:menu.top-header.bottom,bottom:menu.bottom,top:header.top,overflow:e.scrollWidth>e.clientWidth};});
 expect(Math.abs(bounds.gap-8)).toBeLessThanOrEqual(1);expect(bounds.top).toBe(0);expect(bounds.bottom).toBeLessThanOrEqual(viewport.height-8);expect(bounds.overflow).toBe(false);
 await menu.getByRole('link',{name:'Account',exact:true}).focus();await expect(menu.getByRole('link',{name:'Account',exact:true})).toBeFocused();
 await page.screenshot({path:info.outputPath('header-dropdown-'+viewport.width+'.png'),animations:'disabled'});
 await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await trigger.click();await expect(menu).toHaveCount(0);
 await trigger.click();await page.mouse.click(2,viewport.height-2);await expect(menu).toHaveCount(0);
 await trigger.click();await page.locator('.header-language').click();await expect(menu).toHaveCount(0);await expect(page.locator('.mobile-menu-button')).toHaveAttribute('aria-expanded','false');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});

test('enlarged desktop text uses reachable navigation without overlapping header controls',async({page},info)=>{
 const f=await fixture(page,true);await page.setViewportSize({width:1440,height:900});await page.goto('/explore');
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 await expect(page.locator('.desktop-navigation')).toBeHidden();const trigger=page.getByRole('button',{name:'Open navigation'});await expect(trigger).toBeVisible();
 await trigger.click();await expect(page.locator('#mobile-navigation').getByRole('link',{name:'Wallet',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('header-text200.png'),animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
