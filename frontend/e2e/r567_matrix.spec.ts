import {test,expect,type Page} from '@playwright/test';
import {r567Fixture} from './fixtures/r567-matrix';
import {writeFileSync} from 'node:fs';

// Route families, not a claim that every business branch was executed live.
const groups:Record<string,[string,string][]>={
 public:[['/','.home-page'],['/explore','.catalog-deal'],['/deals/master?returnTo=%2Fexplore%3Fq%3Dtoolkit','.buyer-deal-detail'],['/sellers/studio','.public-seller-deal'],['/docs','.developer-docs'],['/not-found','.route-not-found']],
 buyer:[['/orders','.order-row'],['/orders/master-order-01?returnTo=%2Forders','.buyer-dashboard .ui-record-card'],['/account','.account-page'],['/wallet','.wallet-page'],['/notifications','.account-page'],['/support','.support-list'],['/support/tickets/tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','.support-thread']],
 seller:[['/seller','.seller-dashboard'],['/seller/orders','.seller-dashboard .ui-record-card'],['/seller/revenue','.seller-dashboard'],['/seller/disputes','.seller-dashboard'],['/seller/products','.product-studio'],['/seller/profile','.seller-profile-editor'],['/seller/integrations','#seller-webhook-url'],['/seller/create','.seller-dashboard']],
 admin:[['/admin/disputes','.operator-portal'],['/admin/deals','.operator-deal'],['/admin/deals/master/overview','.operator-portal'],['/admin/verifications','.operator-portal'],['/admin/reconciliation','.reconciliation-panel'],['/admin/audit','.operator-portal'],['/admin/outbox','.operator-outbox'],['/admin/operations','.operator-portal'],['/admin/recovery','.operator-portal'],['/admin/users','.operator-portal'],['/admin/permissions','.operator-portal'],['/admin/settings','.operator-portal'],['/admin/support','.operator-portal']],
};

async function inspect(page:Page){
 await page.evaluate(()=>document.fonts.ready);
 const bounds=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.main-content *')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').slice(0,8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,80),parent:e.parentElement?.className,parentWidth:e.parentElement?.clientWidth,right:Math.round(e.getBoundingClientRect().right),width:e.clientWidth,style:getComputedStyle(e).whiteSpace}))}));
 expect(bounds.scrollWidth,JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.width+1);
 const control=page.locator('.main-content button:visible:not(:disabled),.main-content a[href]:visible,.main-content input:visible:not(:disabled),.main-content textarea:visible:not(:disabled)').first();
 if(await control.count()){
  await control.focus();await page.keyboard.press('Tab');
  // WebKit can move from the last tabbable control to browser chrome.
  // Reverse Tab must return to a visible control; do not require a page focus trap.
  if(await page.evaluate(()=>document.activeElement===document.body))await page.keyboard.press('Shift+Tab');
  await expect.poll(async()=>page.evaluate(()=>{const e=document.activeElement as HTMLElement;if(!e||e===document.body)return {visible:false};const r=e.getBoundingClientRect(),h=document.querySelector('.header')?.getBoundingClientRect();return {visible:r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&(!e.closest('.main-content')||r.top+1>=(h?.bottom||0)),tag:e.tagName,top:r.top,bottom:r.bottom,headerBottom:h?.bottom};})).toMatchObject({visible:true});
  const focused=await page.evaluate(()=>{const e=document.activeElement as HTMLElement;if(!e||e===document.body)return null;const r=e.getBoundingClientRect();return{tag:e.tagName,visible:r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};});
  expect(focused).toMatchObject({visible:true});
 }
}

for(const language of ['vi','en'])test(`R567 unavailable reads ${language} text200 preserve routes and retry`,async({page},info)=>{
 test.setTimeout(90000);const f=await r567Fixture(page,language);await page.setViewportSize({width:375,height:1000});
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize='200%'));
 const cases=[['/explore','/api/v1/catalog','.catalog-page'],['/deals/master?returnTo=%2Fexplore','/api/campaigns/master','.main-content'],['/orders?q=master','/api/orders/buyer','.buyer-dashboard'],['/seller/orders?q=master','/api/seller/orders','.seller-dashboard'],['/support','/api/support/tickets','.support-page']];
 for(const [route,endpoint,selector]of cases){
  await page.route('**'+endpoint+'*',r=>r.fulfill({status:503,json:{error:'PRIVATE_PROVIDER_DIAGNOSTIC_MUST_NOT_LEAK'}}));
  await page.goto(route);await expect(page.locator(selector)).toBeVisible();await page.waitForLoadState('networkidle');
  await expect(page.locator('.main-content')).not.toContainText('PRIVATE_PROVIDER_DIAGNOSTIC');
  const retry=page.locator('.main-content').getByRole('button',{name:/^(Retry|Reload|Refresh|Thử lại|Tải lại|Làm mới)/}).first();await expect(retry).toBeVisible();
  await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===endpoint),retry.click()]);await page.waitForLoadState('networkidle');await inspect(page);
  expect(new URL(page.url()).pathname+new URL(page.url()).search).toBe(route);
  await page.screenshot({path:info.outputPath('unavailable-'+endpoint.replaceAll('/','_')+'.png'),fullPage:true,animations:'disabled'});
 }
 expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});

for(const language of ['vi','en'])for(const width of [375,1280])for(const [group,routes]of Object.entries(groups)){
 test(`R567 matrix ${group} ${language} ${width} text200`,async({page,browser},info)=>{
  test.setTimeout(150000);const f=await r567Fixture(page,language);await page.setViewportSize({width,height:1000});
  await page.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize='200%');});
  const observations=[];
  for(const [route,selector]of routes){
   await page.goto(route);await expect(page.locator(selector).first()).toBeVisible();await page.waitForLoadState('networkidle');
   await inspect(page);expect(new URL(page.url()).pathname).toBe(new URL(route,'http://fixture.test').pathname);
   if(route==='/docs'&&language==='en')expect(await page.locator('.developer-docs').innerText()).not.toMatch(/[đĐăĂơƠưƯấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/);
   expect(await page.evaluate(()=>localStorage.getItem('groupdeal_lang'))).toBe(language);
   if(width===375)await page.screenshot({path:info.outputPath(route.split('?')[0].replaceAll('/','_')+'-'+language+'.png'),fullPage:true,animations:'disabled'});
   observations.push({route,selector,textPercent:200,keyboardFocusVisible:true,documentFits:true,alerts:await page.locator('.main-content [role="alert"]').allTextContents()});
  }
  expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
  const coverage=info.outputPath('coverage.json');writeFileSync(coverage,JSON.stringify({language,width,group,project:info.project.name,browserVersion:browser.version(),observations,apiResponses:f.reads,externalTrafficBlocked:true,writes:0,liveAcceptance:false},null,2));
  await info.attach('coverage',{path:coverage,contentType:'application/json'});
 });
}
