import {test,expect,type Page} from '@playwright/test';

const principal='0x1111111111111111111111111111111111111111';
async function fixture(page:Page,language='en'){
 const writes:string[]=[],errors:string[]=[],state={orderDelay:0};
 await page.addInitScript(lang=>{localStorage.setItem('groupdeal_token','local-scroll-fixture');localStorage.setItem('groupdeal_lang',lang);},language);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/*circle-fin_w3s-pw-web-sdk.js*',r=>r.fulfill({contentType:'application/javascript',body:'export class W3SSdk{updateConfigs(){}};'}));
 await page.route('**/src/context/Web3Context.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:"'+principal+'",hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",usdcBalance:null,walletMode:"EXTERNAL_REOWN"});'}));
 await page.route('**/api/**',async r=>{
  const request=r.request(),url=new URL(request.url()),p=url.pathname;
  if(request.method()!=='GET'){writes.push(p);return r.fulfill({status:405,json:{}});}
  if(p==='/api/auth/me')return r.fulfill({json:{user:{id:'scroll-buyer',email:null,roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:principal}}});
  if(p==='/api/orders/buyer'){
   if(state.orderDelay)await new Promise(resolve=>setTimeout(resolve,state.orderDelay));
   const id=url.searchParams.get('orderId'),offset=id?Number(id.replace('scroll-','')):url.searchParams.has('cursor')?20:0,orders=Array.from({length:id?1:20},(_,n)=>{const i=n+offset;return {id:id||'scroll-'+i,campaignId:'campaign',campaignTitle:'Scroll fixture '+i,buyerAccountId:'scroll-buyer',buyerPrincipal:principal,quantity:1,lockedUnitPrice:'1000000',committedGross:'1000000',rebateAllocated:'0',buyerRefundAllocated:'0',buyerClaimedAmount:'0',buyerClaimable:'0',accountingVerified:true,deliveryStatus:'DELIVERED',createdAt:1760000000000+i*1000};});
   return r.fulfill({json:{buyerAccountId:'scroll-buyer',orders,pagination:{limit:20,nextCursor:id||offset?null:'scroll-page-2'}}});
  }
  if(p==='/api/wallet/flows/balances')return r.fulfill({status:503,json:{code:'WALLET_BALANCE_UNAVAILABLE'}});
  if(p==='/api/wallet/flows/')return r.fulfill({json:{operations:[],pagination:{nextCursor:null}}});
  if(p==='/api/wallet/activity')return r.fulfill({json:{accountId:'scroll-buyer',rows:[],pagination:{limit:20,nextCursor:null}}});
  return r.fulfill({json:{notifications:[],unread:0,orders:[],operations:[],wallets:[],pagination:{nextCursor:null}}});
 });
 return {writes,errors,state};
}
async function frames(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
for(const path of ['/orders','/orders/scroll-0'])test('touch scrolling survives viewport height changes on '+path,async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto(path);
 await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();
 await page.evaluate(()=>{const el=document.querySelector<HTMLElement>('.buyer-dashboard a.btn')!;el.focus({preventScroll:true});document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));window.scrollTo({top:1000,behavior:'instant'});});
 await frames(page);const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(500);
 await page.setViewportSize({width:390,height:780});await frames(page);
 expect(await page.evaluate(()=>scrollY)).toBeCloseTo(before,0);await expect(page).toHaveURL(new RegExp(path+'$'));expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('touch input cancels a queued keyboard focus reveal',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/orders');await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();
 await page.evaluate(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));document.querySelector<HTMLElement>('.buyer-dashboard a.btn')!.focus({preventScroll:true});document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));window.scrollTo({top:1000,behavior:'instant'});});
 await frames(page);expect(await page.evaluate(()=>scrollY)).toBeCloseTo(1000,0);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('keyboard focus remains visible after viewport changes',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/orders');await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();
 await page.locator('#order-search').focus();await page.keyboard.press('Tab');await expect(page.locator('#order-state')).toBeFocused();
 await page.evaluate(()=>window.scrollTo({top:1500,behavior:'instant'}));await page.setViewportSize({width:390,height:780});await frames(page);
 const rect=await page.locator('#order-state').boundingBox();expect(rect!.y).toBeGreaterThanOrEqual(0);expect(rect!.y+rect!.height).toBeLessThanOrEqual(780);expect(f.errors).toEqual([]);
});
for(const language of ['en','vi'])for(const kind of ['send','receive'] as const)for(const size of [{width:375,height:844},{width:375,height:480},{width:1440,height:900}])test(`wallet ${kind} keeps scroll and sticky close at ${size.width}x${size.height} ${language}`,async({page},info)=>{
 const f=await fixture(page,language),en=language==='en';await page.setViewportSize(size);await page.goto('/wallet');
 const trigger=page.getByRole('button',{name:kind==='send'?(en?'Send':'Gửi'):(en?'Receive':'Nhận'),exact:true});await expect(trigger).toBeEnabled();
 await page.evaluate(()=>document.fonts.ready);await trigger.evaluate(el=>{const target=el.getBoundingClientRect().top+scrollY-innerHeight*.45;window.scrollTo({top:Math.max(0,target),behavior:'instant'});});
 await frames(page);const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(0);await trigger.click();
 const d=page.getByRole('dialog',{name:kind==='send'?(en?'Send USDC':'Gửi USDC'):(en?'Receive USDC':'Nhận USDC'),exact:true});await expect(d).toBeVisible();
 if(kind==='receive')await expect(d.locator('.wallet-qr')).toBeVisible();
 await frames(page);expect(await page.evaluate(()=>scrollY)).toBeCloseTo(before,0);
 const box=await d.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height+1);
 await d.evaluate(el=>{el.scrollTop=el.scrollHeight;});const close=d.getByRole('button',{name:en?'Close dialog':'Đóng hộp thoại',exact:true});
 expect(await close.evaluate(e=>getComputedStyle(e).position)).toBe('sticky');await expect(close).toBeInViewport();
 expect(await close.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 if(size.height===480)await page.screenshot({path:info.outputPath(`wallet-${kind}-sticky-${language}.png`),animations:'disabled'});
 await close.click();await expect(d).toHaveCount(0);expect(await page.evaluate(()=>scrollY)).toBeCloseTo(before,0);await expect(trigger).toBeFocused();expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});

for(const back of ['browser','link'] as const)test('order '+back+' return restores filters pagination and scroll after loading',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/orders?status=DELIVERED&q=Scroll');
 await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();await page.locator('.order-list-section').getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('Scroll fixture 20',{exact:true})).toBeVisible();
 await page.evaluate(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));window.scrollTo({top:1400,behavior:'instant'});});
 const href=await page.locator('.order-row a[href^="/orders/"]').evaluateAll(links=>{const el=links.find(e=>{const r=e.getBoundingClientRect();return r.top>130&&r.bottom<innerHeight-40;});return el?.getAttribute('href');});expect(href).toBeTruthy();
 const saved=await page.evaluate(()=>scrollY),historySize=await page.evaluate(()=>history.length);await page.locator('a[href="'+href+'"]').first().click();
 await expect(page.getByRole('heading',{name:'Order details',exact:true})).toBeVisible();await expect(page.locator('.buyer-dashboard')).toHaveAttribute('data-scroll-ready','true');expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.evaluate(()=>window.scrollTo({top:350,behavior:'instant'}));const detailSaved=await page.evaluate(()=>scrollY);f.state.orderDelay=500;
 if(back==='browser')await page.goBack();else await page.getByRole('link',{name:'Back to orders',exact:true}).click();
 await expect(page).toHaveURL(/\/orders\?status=DELIVERED&q=Scroll$/);await expect(page.getByText('Scroll fixture 20',{exact:true})).toBeVisible();await expect(page.locator('#order-search')).toHaveValue('Scroll');await expect(page.locator('#order-state')).toHaveValue('DELIVERED');
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeCloseTo(saved,0);expect(await page.evaluate(()=>history.length)).toBe(historySize+1);
 if(back==='browser'){await page.goForward();await expect(page.getByRole('heading',{name:'Order details',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>scrollY)).toBeCloseTo(detailSaved,0);}
 expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('orders retain the loaded page when another app page is visited and Back is used',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/orders');await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();await page.locator('.order-list-section').getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('Scroll fixture 20',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.scrollTo({top:1300,behavior:'instant'}));const saved=await page.evaluate(()=>scrollY);
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('region',{name:'Navigation',exact:true}).getByRole('link',{name:'Wallet',exact:true}).click();await expect(page.getByRole('heading',{name:'My wallet',exact:true})).toBeVisible();expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.goBack();await expect(page.getByText('Scroll fixture 20',{exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>scrollY)).toBeCloseTo(saved,0);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('touch during a delayed Back restoration cancels the pending scroll',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/orders');await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();await page.evaluate(()=>window.scrollTo({top:1200,behavior:'instant'}));
 await page.locator('.order-row a[href^="/orders/"]').first().evaluate((e:HTMLElement)=>e.click());await expect(page.getByRole('heading',{name:'Order details',exact:true})).toBeVisible();await expect(page.locator('.buyer-dashboard')).toHaveAttribute('data-scroll-ready','true');
 f.state.orderDelay=900;await page.goBack();await expect(page.locator('.buyer-dashboard')).toHaveAttribute('data-scroll-ready','false');await page.evaluate(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));window.scrollTo({top:150,behavior:'instant'});});
 const chosen=await page.evaluate(()=>scrollY);await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();await frames(page);expect(await page.evaluate(()=>scrollY)).toBeCloseTo(chosen,0);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('order query updates keep the current layout height while data reloads',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/orders');await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();await page.evaluate(()=>window.scrollTo({top:1200,behavior:'instant'}));const saved=await page.evaluate(()=>scrollY);f.state.orderDelay=800;
 await page.evaluate(async()=>{const {navigateApp}=await import('/src/utils/appRoute.ts');navigateApp('/orders?q=Scroll');});await expect(page.locator('.buyer-dashboard')).toHaveAttribute('data-scroll-ready','false');expect(await page.evaluate(()=>scrollY)).toBeCloseTo(saved,0);
 await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();expect(await page.evaluate(()=>scrollY)).toBeCloseTo(saved,0);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});


test('order column headings cover the top of their scrolled list',async({page},info)=>{
 const f=await fixture(page);await page.setViewportSize({width:1440,height:900});await page.goto('/orders');await expect(page.getByText('Scroll fixture 0',{exact:true})).toBeVisible();
 const list=page.locator('.order-list'),head=page.locator('.order-column-head');await list.scrollIntoViewIfNeeded();await list.evaluate(el=>{el.scrollTop=250;});await frames(page);
 const bounds=await head.evaluate(el=>{const h=el.getBoundingClientRect(),list=el.parentElement!,r=list.getBoundingClientRect(),border=parseFloat(getComputedStyle(list).borderTopWidth);return{gap:h.top-r.top-border,covered:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+border+2)),scrollTop:list.scrollTop};});
 expect(bounds.scrollTop).toBeGreaterThan(0);expect(Math.abs(bounds.gap)).toBeLessThanOrEqual(1);expect(bounds.covered).toBe(true);
 await list.screenshot({path:info.outputPath('order-sticky-heading.png')});expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
