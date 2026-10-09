import {installNativeOperatorManifest,installNativeOperatorAuth,type NativeOperatorFixture} from './fixtures/operator-native';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {selectOperatorSection} from './fixtures/operator-navigation';
import {waitForOwnedPorts} from './fixtures/owned-port';
const root=path.resolve('..');let child:ChildProcess,base='',token='',port=0,httpRecord='';let nativeFixture:NativeOperatorFixture;
const control=async(url:string,method='GET')=>{const r=await fetch(base+url,{method,headers:{'X-Local-Fixture':'operator-deal-sections'}});expect(r.ok).toBe(true);return r.json();};
test.beforeAll(async()=>{
 child=spawn(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/operator_deal_sections.test.ts'),'--browser-server'],{cwd:path.join(root,'backend'),env:require(path.join(root,'scripts/local_check_runtime.cjs')).localCheckEnvironment(root),windowsHide:true,stdio:['ignore','pipe','pipe']});
 const ready=await new Promise<any>((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Owned deal fixture startup timeout')),20000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Owned deal fixture exited'));});child.stdout!.on('data',v=>{output+=v.toString();const line=output.split(/\r?\n/).find(l=>l.startsWith('{"localFixture"'));if(line){clearTimeout(timer);resolve(JSON.parse(line));}});});
 expect(ready.isolated).toBe(true);port=ready.port;base='http://127.0.0.1:'+port;httpRecord=path.join(root,'.cache/operator-deep-links-http-'+randomUUID()+'.json');writeFileSync(httpRecord,JSON.stringify({layer:'LOCAL_UI_NATIVE_HTTP_BRIDGE',acceptanceEligible:false,pid:child.pid,fixturePid:ready.pid,port,isolated:true,stopped:false}));
});
test.beforeEach(async()=>{await control('/__reset','POST');nativeFixture=await control('/__session');token=nativeFixture.token;});
test.afterAll(async()=>{
 if(child?.exitCode===null&&!child.signalCode){const exited=new Promise<void>(r=>child.once('exit',()=>r()));await control('/__stop','POST');await exited;}
 if(port)await waitForOwnedPorts([port]);if(httpRecord)writeFileSync(httpRecord,JSON.stringify({layer:'LOCAL_UI_NATIVE_HTTP_BRIDGE',acceptanceEligible:false,pid:child.pid,port,isolated:true,stopped:true,portFree:true}));
});
async function fixture(page:Page,language='en',roles=['buyer','operator']){
 const errors:string[]=[],writes:string[]=[],queries:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET'&&new URL(r.url()).pathname.startsWith('/api/')&&new URL(r.url()).pathname!=='/api/auth/session/activity')writes.push(new URL(r.url()).pathname);});
 await installNativeOperatorManifest(page,nativeFixture);
 await page.addInitScript(({lang,sessionToken})=>{localStorage.setItem('groupdeal_token',sessionToken);localStorage.setItem('groupdeal_lang',lang);},{lang:language,sessionToken:roles.includes('operator')?token:nativeFixture.buyer});
 await page.route('**/api/**',async route=>{
  const r=route.request(),url=new URL(r.url()),p=url.pathname;if(r.method()!=='GET')return route.fulfill({status:405,json:{error:'LOCAL_FIXTURE_READ_ONLY'}});
  if(p.startsWith('/api/operator/deals')||p.startsWith('/api/operator/audit-logs')){queries.push(p+url.search);const response=await fetch(base+p+url.search,{headers:{Authorization:'Bearer '+token}});return route.fulfill({status:response.status,json:await response.json()});}
  let value:any;
  if(p==='/api/auth/me')value={user:{id:'fixture',email:null,roles,activeWallet:null,loginMethod:'EVM_WALLET'}};
  else if(p==='/api/notifications')value={notifications:[],unread:0};
  else if(p==='/api/notifications/preferences')value={userId:'fixture',preferences:{inApp:true,email:false},contactStatus:'MISSING'};
  else if(p==='/api/auth/wallets')value={userId:'fixture',activeWallet:null,serverTime:Date.now(),wallets:[],pagination:{nextCursor:null}};
  else if(p==='/api/transactions')value={operations:[],pagination:{nextCursor:null}};
  else if(p==='/api/operator/disputes')value={disputes:[]};
  else if(p==='/api/operator/reconciliation')value={report:null};
  else if(p==='/api/health')value={status:'ok'};
  else if(p==='/api/products/rights/review')value={rights:[]};
  else if(p==='/api/operator/sellers')value={sellers:[]};
  else return route.fulfill({status:404,json:{error:'LOCAL_FIXTURE_NOT_FOUND'}});
  return route.fulfill({json:value});
 });await installNativeOperatorAuth(page,base);return{errors,writes,queries};
}
async function open(page:Page,language='en',deal='deal'){
 await page.goto('/#operator');await selectOperatorSection(page,{name:language==='en'?'Inspect deals':'Kiểm tra deal',exact:true});
 const panel=page.locator('.operator-deal');await panel.locator('.operator-order-list li').filter({has:page.getByRole('heading',{name:deal==='deal'?'Deal sections · LOCAL FIXTURE':'Other deal',exact:true})}).getByRole('button',{name:language==='en'?'Inspect deal':'Kiểm tra deal',exact:true}).click();await expect(panel.getByRole('navigation',{name:language==='en'?'Deal data sections':'Các phần dữ liệu deal'}).getByRole('button')).toHaveCount(7);
}
async function tab(page:Page,name:string){await page.locator('.operator-deal').getByRole('navigation',{name:/Deal data sections|Các phần dữ liệu deal/}).getByRole('button',{name,exact:true}).click();}
async function capture(page:Page,info:TestInfo,name:string){await page.screenshot({path:info.outputPath(name+'.png'),fullPage:false});}
for(const language of ['en','vi'])test('operator deep links: cold route and reload in '+language,async({page},info)=>{
 const f=await fixture(page,language),before=await control('/__state'),width=language==='en'?1440:375;await page.setViewportSize({width,height:1000});
 await page.goto('/#operator/deals/deal/disputes');const panel=page.locator('.operator-deal');await expect(panel.getByRole('heading',{name:'Deal sections · LOCAL FIXTURE',exact:true})).toBeVisible();await expect(panel.locator('.operator-deal-disputes article')).toHaveCount(20);
 expect(f.queries).not.toContain('/api/operator/deals');const nav=panel.getByRole('navigation',{name:language==='en'?'Deal data sections':'Các phần dữ liệu deal'});await expect(nav.getByRole('button',{name:language==='en'?'Disputes':'Tranh chấp',exact:true})).toHaveAttribute('aria-current','page');
 await tab(page,language==='en'?'Audit':'Nhật ký');await expect(page).toHaveURL(/#operator\/deals\/deal\/audit$/);await expect(panel.locator('.operator-audit article')).toHaveCount(20);await page.reload();await expect(panel.locator('.operator-audit article')).toHaveCount(20);await expect(nav.getByRole('button',{name:language==='en'?'Audit':'Nhật ký',exact:true})).toHaveAttribute('aria-current','page');
 const detailReads=f.queries.filter(q=>q==='/api/operator/deals/deal').length,views=['overview','orders','transactions','settlement','refunds','disputes','audit'];for(let i=0;i<views.length;i++){await page.evaluate(hash=>{location.hash=hash;},'#operator/deals/deal/'+views[i]);await expect(nav.getByRole('button').nth(i)).toHaveAttribute('aria-current','page');}
 expect(f.queries.filter(q=>q==='/api/operator/deals/deal').length).toBe(detailReads);await capture(page,info,'operator-deep-link-audit-'+language+'-'+width);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect((await control('/__state')).hash).toBe(before.hash);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('operator deep links: selection history list and global workspace',async({page},info)=>{
 const f=await fixture(page),before=await control('/__state');await page.setViewportSize({width:1440,height:1000});await open(page);await expect(page).toHaveURL(/#operator\/deals\/deal\/overview$/);await tab(page,'Orders and principals');await expect(page).toHaveURL(/#operator\/deals\/deal\/orders$/);await tab(page,'Transactions');await expect(page).toHaveURL(/#operator\/deals\/deal\/transactions$/);
 const nav=page.locator('.operator-deal').getByRole('navigation',{name:'Deal data sections'});await page.goBack();await expect(nav.getByRole('button',{name:'Orders and principals',exact:true})).toHaveAttribute('aria-current','page');await page.goBack();await expect(nav.getByRole('button',{name:'Overview',exact:true})).toHaveAttribute('aria-current','page');await page.goForward();await expect(nav.getByRole('button',{name:'Orders and principals',exact:true})).toHaveAttribute('aria-current','page');
 await tab(page,'Audit');await expect(page.locator('.operator-deal .operator-audit article')).toHaveCount(20);await page.locator('.operator-deal').getByRole('button',{name:'Audit logs',exact:true}).click();await expect(page).toHaveURL(/#operator$/);await expect(page.locator('.operator-workspace-content')).toHaveAttribute('data-section','LOGS');await page.goBack();await expect(page.locator('.operator-deal .operator-audit article')).toHaveCount(20);
 await page.locator('.operator-deal').getByRole('button',{name:'Back to deal list',exact:true}).click();await expect(page).toHaveURL(/#operator$/);await expect(page.locator('.operator-deal .operator-order-list li')).toHaveCount(2);await page.goBack();await expect(page.locator('.operator-deal .operator-audit article')).toHaveCount(20);await capture(page,info,'operator-deep-link-history-en-1440');expect((await control('/__state')).hash).toBe(before.hash);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('operator deep links: missing role and malformed routes make no deal read',async({page},info)=>{
 const f=await fixture(page,'en',['buyer']);await page.setViewportSize({width:375,height:1000});await page.goto('/#operator/deals/deal/audit');await expect(page.locator('.operator-access')).toBeVisible();await expect(page.locator('.operator-access')).toContainText('active wallet is not the operator wallet');await expect(page.locator('.operator-portal')).toHaveCount(0);expect(f.queries).toEqual([]);await capture(page,info,'operator-deep-link-role-en-375');
 for(const hash of ['#operator/deals/','#operator/deals/deal/unknown','#operator/deals/'+ 'x'.repeat(181)+'/audit','#operator/deals/%2F/audit','#operator/deals/deal/audit/extra']){await page.goto('/'+hash);await expect(page.locator('.route-not-found')).toBeVisible();await expect(page.locator('.operator-portal')).toHaveCount(0);}expect(f.queries).toEqual([]);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('operator deep links: late foreign and missing deal responses stay scoped',async({page},info)=>{
 const f=await fixture(page),before=await control('/__state');await page.setViewportSize({width:375,height:1000});await page.goto('/#operator/deals/deal/overview');const panel=page.locator('.operator-deal');await expect(panel.getByRole('heading',{name:'Deal sections · LOCAL FIXTURE',exact:true})).toBeVisible();
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('**/api/operator/deals/other',async route=>{const response=await fetch(base+'/api/operator/deals/other',{headers:{Authorization:'Bearer '+token}}),body=await response.json();await gate;try{await route.fulfill({status:response.status,json:body});}catch{}});
 await page.evaluate(()=>{location.hash='#operator/deals/other/overview';});await expect(panel.getByRole('heading',{name:'Deal sections · LOCAL FIXTURE',exact:true})).toHaveCount(0);await page.evaluate(()=>{location.hash='#operator/deals/deal/audit';});await expect(panel.locator('.operator-audit article')).toHaveCount(20);release();await expect(panel.getByRole('heading',{name:'Other deal',exact:true})).toHaveCount(0);await expect(panel.locator('.operator-audit')).not.toContainText('OTHER_CAMPAIGN');
 await page.route('**/api/operator/deals/deal',async route=>{const response=await fetch(base+'/api/operator/deals/other',{headers:{Authorization:'Bearer '+token}});return route.fulfill({status:response.status,json:await response.json()});});await panel.getByRole('button',{name:'Refresh deals',exact:true}).click();await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.locator('.operator-audit article')).toHaveCount(0);await expect(panel.getByRole('heading',{name:'Other deal',exact:true})).toHaveCount(0);
 await page.evaluate(()=>{location.hash='#operator/deals/missing/audit';});await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.getByRole('heading',{name:'Published deals',exact:true})).toHaveCount(0);await capture(page,info,'operator-deep-link-missing-en-375');await panel.getByRole('button',{name:'Back to deal list',exact:true}).click();await expect(page).toHaveURL(/#operator$/);await expect(panel.locator('.operator-order-list li')).toHaveCount(2);expect((await control('/__state')).hash).toBe(before.hash);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});