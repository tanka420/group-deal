import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {waitForOwnedPorts} from './fixtures/owned-port';
import {textGeometry} from './fixtures/text-geometry';
const require=createRequire(import.meta.url),root=path.resolve(process.cwd(),'..'),hub='0x1111111111111111111111111111111111111111';
let child:ChildProcess,base:string,port:number,report:string,runtime:string;
test.beforeAll(async()=>{
 const {localCheckEnvironment}=require(path.join(root,'scripts/local_check_runtime.cjs'));
 child=spawn(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/catalog_browser_server.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),windowsHide:true,stdio:['ignore','pipe','pipe']});
 const ready=await new Promise<any>((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Owned catalogue API not ready')),12000);child.once('error',()=>{clearTimeout(timer);reject(Error('Owned catalogue API could not start'));});child.once('exit',()=>{clearTimeout(timer);reject(Error('Owned catalogue API exited before ready'));});child.stdout!.on('data',b=>{output+=b.toString();const line=output.split(/\r?\n/).find(l=>l.startsWith('{"localFixture"'));if(line){clearTimeout(timer);resolve(JSON.parse(line));}});});
 expect(ready.isolated).toBe(true);port=ready.port;runtime=ready.runtime;expect(runtime).toBe(process.env.GROUPDEAL_BROWSER_MODE==='preview'?'COMPILED_BACKEND':'TSX_BACKEND');base='http://127.0.0.1:'+port;report=path.join(root,'.cache/catalog-browser-'+randomUUID()+'.json');writeFileSync(report,JSON.stringify({layer:'LOCAL_BROWSER_SOURCE_API',acceptanceEligible:false,port,pid:child.pid,runtime,isolated:true,stopped:false}));
});
test.afterAll(async()=>{if(child?.exitCode===null&&!child.signalCode){await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');});}if(report){await waitForOwnedPorts([port]);writeFileSync(report,JSON.stringify({layer:'LOCAL_BROWSER_SOURCE_API',acceptanceEligible:false,port,pid:child.pid,runtime,isolated:true,portFree:true,stopped:child.exitCode!==null||!!child.signalCode}));}});
async function mode(value:string){const response=await fetch(base+'/__catalog_fixture',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Fixture':'catalog-browser'},body:JSON.stringify({mode:value})});expect(response.status).toBe(200);}
async function fixture(page:Page,language='en',sort='newest'){
 await mode('RESET');const errors:string[]=[],reads:{query:string;auth?:string;cookie?:string}[]=[],writes:string[]=[],sdkLoads:string[]=[];
 const state:{moreFail:boolean;mixed:boolean;hold:string|null;release:()=>void;held:boolean}={moreFail:false,mixed:false,hold:null,release:()=>{},held:false};
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/circle-fin|ReownEnabledProvider|@reown_appkit/.test(r.url()))sdkLoads.push(r.url());});
 await page.addInitScript(({language,sort})=>{if(top!==self)return;localStorage.setItem('groupdeal_lang',language);localStorage.setItem('groupdeal_operation_checkpoints','fixture-preserved-catalog-checkpoint');if(!sessionStorage.getItem('groupdeal_catalog_filters_v1'))sessionStorage.setItem('groupdeal_catalog_filters_v1',JSON.stringify({q:'',category:'',status:'',metric:'',sort}));},{language,sort});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());if(request.method()!=='GET'){writes.push(url.pathname);return route.fulfill({status:405,json:{}});}
  if(url.pathname==='/api/v1/catalog'){
   reads.push({query:url.search,auth:request.headers().authorization,cookie:request.headers().cookie});
   if(state.moreFail&&url.searchParams.has('cursor')){state.moreFail=false;return route.fulfill({status:503,json:{error:'fixture-private-provider-detail'}});}
   // Read the actual source/emitted publicRouter over the owned isolated loopback API.
   const response=await page.request.get(base+url.pathname+url.search,{headers:{Accept:'application/json'}});
   if(state.hold!==null&&state.hold===url.searchParams.get('q')){state.held=true;await new Promise<void>(resolve=>{state.release=resolve;});}
   if(state.mixed){const json=await response.json();json.chainId=5042003;return route.fulfill({status:200,json});}
   try{return await route.fulfill({response});}catch(error){if(request.failure())return;throw error;}
  }
  if(url.pathname==='/api/health')return route.fulfill({json:{hubAddress:hub,usdcAddress:'0x3600000000000000000000000000000000000000'}});
  return route.fulfill({json:{campaigns:[],notifications:[],unread:0}});
 });return {state,errors,reads,writes,sdkLoads};
}
async function loaded(page:Page,count=12,total=15){await expect(page.locator('.catalog-page').getByRole('status')).toHaveText(`Loaded ${count} / ${total} matching campaigns.`);}
async function clean(page:Page,f:Awaited<ReturnType<typeof fixture>>){expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);expect(f.sdkLoads).toEqual([]);expect(f.reads.every(r=>!r.auth&&!r.cookie)).toBe(true);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_operation_checkpoints'))).toBe('fixture-preserved-catalog-checkpoint');}
test('default availability, price validation, draft reset/cancel and applied URL remain consistent',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:375,height:812});await page.goto('/explore');await loaded(page,12,13);
 const filters=page.getByRole('button',{name:/^Filters/}),dialog=page.getByRole('dialog',{name:'Filters and sorting'});
 await filters.click();await dialog.getByLabel('Minimum price (USDC / unit)',{exact:true}).fill('-1');const reads=f.reads.length;
 await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('non-negative');expect(f.reads.length).toBe(reads);
 await dialog.getByLabel('Minimum price (USDC / unit)',{exact:true}).fill('106');await dialog.getByLabel('Maximum price (USDC / unit)',{exact:true}).fill('105');await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('must not exceed');
 await dialog.getByRole('button',{name:'Reset',exact:true}).click();await expect(dialog.getByLabel('Only deals accepting purchases')).not.toBeChecked();expect(f.reads.length).toBe(reads);await page.keyboard.press('Escape');await filters.click();await expect(dialog.getByLabel('Only deals accepting purchases')).toBeChecked();await expect(dialog.getByLabel('Minimum price (USDC / unit)',{exact:true})).toHaveValue('');
 await dialog.getByLabel('Minimum price (USDC / unit)',{exact:true}).fill('105');await dialog.getByLabel('Maximum price (USDC / unit)',{exact:true}).fill('105');await dialog.getByLabel('Sort',{exact:true}).selectOption('price-asc');await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();await loaded(page,12,13);await expect(page).toHaveURL(/minPrice=105/);await page.reload();await loaded(page,12,13);await expect(page.getByRole('button',{name:'Remove: From 105 USDC',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Remove: From 105 USDC',exact:true}).click();await expect(page).not.toHaveURL(/minPrice=/);await page.getByRole('button',{name:'Clear filters',exact:true}).click();await loaded(page);await expect(page).toHaveURL(/purchasable=0/);await page.getByRole('button',{name:'Load more campaigns',exact:true}).click();await loaded(page,15,15);await expect(page.getByText('You have reached the end of the matching results.',{exact:true})).toBeVisible();await clean(page,f);
});
test('Home is distinct from Explore and displays only real unique deals',async({page},info)=>{
 const f=await fixture(page);await page.goto('/');await expect(page.getByRole('heading',{name:'Buy together. Unlock better prices.'})).toBeVisible();await expect(page.locator('.home-page .catalog-grid article')).toHaveCount(3);expect(await page.locator('.home-page .catalog-grid h3').allTextContents()).toEqual(['Template toolkit 14','Template toolkit 13','Template toolkit 12']);await expect(page.locator('#catalog-search')).toHaveCount(0);
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('home-'+width+'.png')});}
 await page.locator('.home-hero').getByRole('link',{name:'Explore deals'}).click();await expect(page).toHaveURL(/\/explore$/);await loaded(page,12,13);await clean(page,f);
});
test('real API search, category, metric, stable pagination and all-page summary drive Explore',async({page})=>{
 const f=await fixture(page);await page.goto('/explore?purchasable=0');await loaded(page);await expect(page.locator('.catalog-grid article')).toHaveCount(12);await page.getByRole('button',{name:'Load more campaigns',exact:true}).click();await loaded(page,15,15);await expect(page.locator('.catalog-grid article')).toHaveCount(15);
 const final=page.getByRole('article',{name:'Huge finalized toolkit',exact:true});await expect(final).toContainText('900,719,925,474,099,312.345678');await expect(final).toContainText('Final price per unit');await expect(final.getByRole('progressbar')).toHaveCount(0);await expect(final.locator('.catalog-deal-action')).toHaveAttribute('href',/\/deals\/catalog_00\?returnTo=/);
 await page.getByLabel('Search campaigns, products or vendors',{exact:true}).fill('ＡＣＭＥ   Studio Pro');await page.getByRole('button',{name:'Search',exact:true}).click();await loaded(page,12,15);expect(f.reads.at(-1)!.query).toContain('q=');await page.getByLabel('Category',{exact:true}).selectOption('Software');await page.getByLabel('Sort',{exact:true}).selectOption('price-desc');await page.getByRole('button',{name:'Search',exact:true}).click();await loaded(page,12,14);await expect(page.locator('.catalog-grid article').first()).toContainText('Huge finalized toolkit');
 await page.getByLabel('Category',{exact:true}).selectOption('Courses');await page.getByRole('button',{name:'Search',exact:true}).click();await loaded(page,1,1);await expect(page.locator('.catalog-grid article')).toContainText('Template toolkit 14');await expect(page.getByRole('button',{name:'Load more campaigns',exact:true})).toHaveCount(0);
 await page.getByLabel('Search campaigns, products or vendors',{exact:true}).fill('absent');await page.getByRole('button',{name:'Search',exact:true}).click();await loaded(page,0,0);await expect(page.getByRole('heading',{name:'No matching campaigns',exact:true})).toBeVisible();await page.reload();await loaded(page,0,0);await expect(page.getByLabel('Category',{exact:true})).toHaveValue('Courses');await expect(page.getByLabel('Search campaigns, products or vendors',{exact:true})).toHaveValue('absent');await clean(page,f);
});
test('API unavailability removes stale totals, next-page errors retain valid rows and allow explicit retry',async({page})=>{
 const f=await fixture(page);await page.goto('/explore?purchasable=0');await loaded(page);f.state.moreFail=true;await page.getByRole('button',{name:'Load more campaigns',exact:true}).click();await expect(page.locator('.catalog-page').getByRole('alert')).toContainText('Previously loaded results are kept');await expect(page.locator('.catalog-grid article')).toHaveCount(12);await expect(page.locator('.catalog-page')).not.toContainText('fixture-private-provider-detail');await page.getByRole('button',{name:'Retry loading more',exact:true}).click();await loaded(page,15,15);
 await mode('BROKEN');await page.getByRole('button',{name:'Refresh results',exact:true}).click();await expect(page.locator('.catalog-page').getByRole('alert')).toContainText('connection error does not mean');await expect(page.locator('.catalog-grid article')).toHaveCount(0);await mode('RESET');await page.getByRole('button',{name:'Retry',exact:true}).click();await loaded(page);
 f.state.mixed=true;await page.getByRole('button',{name:'Refresh results',exact:true}).click();await expect(page.locator('.catalog-page').getByRole('alert')).toBeVisible();await expect(page.locator('.catalog-grid article')).toHaveCount(0);f.state.mixed=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await loaded(page);
 await mode('PRIVATE');await page.getByRole('button',{name:'Refresh results',exact:true}).click();await loaded(page,0,0);await expect(page.getByLabel('Category',{exact:true}).getByRole('option')).toHaveCount(1);await clean(page,f);
});
test('a late search reply cannot replace the current filter result or cause financial writes',async({page})=>{
 const f=await fixture(page);await page.goto('/explore?purchasable=0');await loaded(page);f.state.hold='toolkit';await page.getByLabel('Search campaigns, products or vendors',{exact:true}).fill('toolkit');await page.getByRole('button',{name:'Search',exact:true}).click();await expect.poll(()=>f.state.held).toBe(true);await page.getByLabel('Search campaigns, products or vendors',{exact:true}).fill('absent');await page.getByRole('button',{name:'Search',exact:true}).click();await loaded(page,0,0);f.state.release();await page.waitForTimeout(300);await loaded(page,0,0);await expect(page.locator('.catalog-grid article')).toHaveCount(0);await clean(page,f);
});
for(const language of ['vi','en'])test(`catalog ${language} exact prices, filters and keyboard fit seven widths`,async({page},info)=>{
 const f=await fixture(page,language,'oldest');await page.goto('/explore?purchasable=0&sort=oldest');await expect(page.locator('.catalog-grid article')).toHaveCount(12);
 const en=language==='en',final=page.getByRole('article',{name:'Huge finalized toolkit',exact:true});await expect(final).toContainText(en?'900,719,925,474,099,312.345678':'900.719.925.474.099.312,345678');await expect(page.getByRole('article',{name:'Held template toolkit',exact:true}).getByRole('progressbar')).toHaveCount(0);
 for(const width of [320,375,390,768,1024,1280,1440]){
  await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await final.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`catalog-${language}-${width}.png`)});
  const geometry=await textGeometry(final.locator('.amount-value'));writeFileSync(info.outputPath(`catalog-amount-${language}-${width}.json`),JSON.stringify(geometry,null,2)+'\n');expect(geometry.chars.filter(c=>!c.withinElement||!c.withinViewport||!c.unoccluded||c.clipped),'All exact amount characters must be visible and contained').toEqual([]);
  if(width<=768){const button=page.getByRole('button',{name:en?/^Filters/:/^Bộ lọc/});await button.click();const dialog=page.getByRole('dialog',{name:en?'Filters and sorting':'Bộ lọc và sắp xếp',exact:true});await expect(dialog.getByRole('heading')).toBeFocused();await expect(page.locator('body')).toHaveCSS('overflow','hidden');expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);await dialog.getByLabel(en?'Category':'Danh mục',{exact:true}).selectOption('Courses');const last=dialog.getByRole('button',{name:en?'Apply filters':'Áp dụng bộ lọc',exact:true});await last.focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:en?'Close filters':'Đóng bộ lọc',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(button).toBeFocused();await button.click();await expect(dialog.getByLabel(en?'Category':'Danh mục',{exact:true})).toHaveValue('');await page.screenshot({path:info.outputPath(`catalog-filters-${language}-${width}.png`)});await page.keyboard.press('Escape');}
 }
 await clean(page,f);
});
