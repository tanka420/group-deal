import {test,expect,type Page} from '@playwright/test';

const principal='0x1111111111111111111111111111111111111111';
async function fixture(page:Page,language='en'){
 const writes:string[]=[],errors:string[]=[];
 await page.addInitScript(lang=>{localStorage.setItem('groupdeal_token','local-scroll-fixture');localStorage.setItem('groupdeal_lang',lang);},language);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/*circle-fin_w3s-pw-web-sdk.js*',r=>r.fulfill({contentType:'application/javascript',body:'export class W3SSdk{updateConfigs(){}};'}));
 await page.route('**/src/context/Web3Context.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:"'+principal+'",hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",usdcBalance:null,walletMode:"EXTERNAL_REOWN"});'}));
 await page.route('**/api/**',r=>{
  const request=r.request(),url=new URL(request.url()),p=url.pathname;
  if(request.method()!=='GET'){writes.push(p);return r.fulfill({status:405,json:{}});}
  if(p==='/api/auth/me')return r.fulfill({json:{user:{id:'scroll-buyer',email:null,roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:principal}}});
  if(p==='/api/orders/buyer'){
   const id=url.searchParams.get('orderId'),orders=Array.from({length:id?1:20},(_,i)=>({id:id||'scroll-'+i,campaignId:'campaign',campaignTitle:'Scroll fixture '+i,buyerAccountId:'scroll-buyer',buyerPrincipal:principal,quantity:1,lockedUnitPrice:'1000000',committedGross:'1000000',rebateAllocated:'0',buyerRefundAllocated:'0',buyerClaimedAmount:'0',buyerClaimable:'0',accountingVerified:true,deliveryStatus:'DELIVERED',createdAt:1760000000000+i*1000}));
   return r.fulfill({json:{buyerAccountId:'scroll-buyer',orders,pagination:{limit:20,nextCursor:null}}});
  }
  if(p==='/api/wallet/flows/balances')return r.fulfill({status:503,json:{code:'WALLET_BALANCE_UNAVAILABLE'}});
  if(p==='/api/wallet/flows/')return r.fulfill({json:{operations:[],pagination:{nextCursor:null}}});
  if(p==='/api/wallet/activity')return r.fulfill({json:{accountId:'scroll-buyer',rows:[],pagination:{limit:20,nextCursor:null}}});
  return r.fulfill({json:{notifications:[],unread:0,orders:[],operations:[],wallets:[],pagination:{nextCursor:null}}});
 });
 return {writes,errors};
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
