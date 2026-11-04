import {test,expect,type Page} from '@playwright/test';
import {emptyCatalog} from './fixtures/catalog';

async function fixture(page:Page,language='en'){
 const errors:string[]=[],writes:string[]=[];
 await page.addInitScript(lang=>{localStorage.setItem('groupdeal_lang',lang);localStorage.removeItem('groupdeal_token');localStorage.removeItem('groupdeal_admin_token');},language);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',r=>{
  const req=r.request(),url=new URL(req.url());if(req.method()!=='GET'){writes.push(url.pathname);return r.fulfill({status:405,json:{}});}
  if(url.pathname==='/api/v1/catalog')return r.fulfill({json:emptyCatalog(url.href)});
  if(url.pathname==='/api/health')return r.fulfill({json:{chainId:5042002,hubAddress:'0x1111111111111111111111111111111111111111',usdcAddress:'0x3600000000000000000000000000000000000000'}});
  return r.fulfill({status:503,json:{code:'READ_ONLY_INFORMATION_FIXTURE'}});
 });return {errors,writes};
}
const pages=[
 ['how','How GroupDeal works','Cách GroupDeal hoạt động'],
 ['terms','Terms of use','Điều khoản sử dụng'],
 ['privacy','Privacy','Quyền riêng tư'],
 ['delivery','Digital delivery','Giao sản phẩm số'],
 ['refunds','Rebates, refunds & disputes','Rebate, hoàn tiền & tranh chấp'],
 ['help','GroupDeal user guide','Hướng dẫn sử dụng GroupDeal']
];
for(const language of ['en','vi'])for(const width of [375,1440])test(`footer reading pages and guide stay full width and usable at ${width}px ${language}`,async({page},info)=>{
 const f=await fixture(page,language);await page.setViewportSize({width,height:900});await page.goto('/');
 for(const [section,enTitle,viTitle] of pages){
  await page.locator('.site-footer a[href="/policies/'+section+'"]').click();await expect(page.getByRole('heading',{level:1,name:language==='en'?enTitle:viTitle,exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);await page.evaluate(()=>document.fonts.ready);
  const layout=await page.locator('.information-page').evaluate(e=>{
   const a=e.getBoundingClientRect(),h=document.querySelector('.header-inner')!.getBoundingClientRect(),f=document.querySelector('.footer-content')!.getBoundingClientRect();
   return {left:Math.abs(a.left-h.left),width:Math.abs(a.width-h.width),footer:Math.abs(a.width-f.width),overflow:document.documentElement.scrollWidth>innerWidth};
  });expect(layout.left).toBeLessThanOrEqual(1);expect(layout.width).toBeLessThanOrEqual(1);expect(layout.footer).toBeLessThanOrEqual(1);expect(layout.overflow).toBe(false);
  if(section==='help')await page.screenshot({path:info.outputPath('guide-start-'+language+'-'+width+'.png'),animations:'disabled'});
  await page.locator('.information-contents > summary').click();await page.locator('.information-contents button').last().click();
  const heading=page.locator('.information-section h2').last();await expect(heading).toBeFocused();await expect(heading).toBeInViewport();await expect(page.locator('.information-section-content').last().locator('p,li').first()).toBeInViewport();
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('.header').boundingBox())!.height);
  expect(await page.evaluate(()=>location.hash)).toBe('');await expect(page).toHaveURL(new RegExp('/policies/'+section+'$'));
  if(section==='help')await page.screenshot({path:info.outputPath('guide-support-'+language+'-'+width+'.png'),animations:'disabled'});
 }
 expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
for(const width of [375,1440])test('shared page padding is symmetric across buyer reading and workspaces at '+width,async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width,height:900});
 for(const route of ['/','/explore','/orders','/wallet','/account','/notifications','/support','/docs','/policies/terms','/seller','/admin']){
  await page.goto(route);await expect(page.locator('.main-content')).toBeVisible();
  const spacing=await page.locator('.main-content').evaluate(e=>{const s=getComputedStyle(e);return {top:parseFloat(s.paddingTop),bottom:parseFloat(s.paddingBottom)};});
  expect(spacing,route).toEqual({top:width<768?24:32,bottom:width<768?24:32});
 }
 expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
