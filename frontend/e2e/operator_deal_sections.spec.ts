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
 expect(ready.isolated).toBe(true);port=ready.port;base='http://127.0.0.1:'+port;httpRecord=path.join(root,'.cache/operator-deal-sections-http-'+randomUUID()+'.json');writeFileSync(httpRecord,JSON.stringify({layer:'LOCAL_UI_NATIVE_HTTP_BRIDGE',acceptanceEligible:false,pid:child.pid,fixturePid:ready.pid,port,isolated:true,stopped:false}));
});
test.beforeEach(async()=>{await control('/__reset','POST');nativeFixture=await control('/__session');token=nativeFixture.token;});
test.afterAll(async()=>{
 if(child?.exitCode===null&&!child.signalCode){const exited=new Promise<void>(r=>child.once('exit',()=>r()));await control('/__stop','POST');await exited;}
 if(port)await waitForOwnedPorts([port]);if(httpRecord)writeFileSync(httpRecord,JSON.stringify({layer:'LOCAL_UI_NATIVE_HTTP_BRIDGE',acceptanceEligible:false,pid:child.pid,port,isolated:true,stopped:true,portFree:true}));
});
async function fixture(page:Page,language='en'){
 const errors:string[]=[],writes:string[]=[],queries:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET'&&new URL(r.url()).pathname.startsWith('/api/')&&new URL(r.url()).pathname!=='/api/auth/session/activity')writes.push(new URL(r.url()).pathname);});
 await installNativeOperatorManifest(page,nativeFixture);
 await page.addInitScript(({lang,sessionToken})=>{localStorage.setItem('groupdeal_token',sessionToken);localStorage.setItem('groupdeal_lang',lang);},{lang:language,sessionToken:token});
 await page.route('**/api/**',async route=>{
  const r=route.request(),url=new URL(r.url()),p=url.pathname;if(r.method()!=='GET')return route.fulfill({status:405,json:{error:'LOCAL_FIXTURE_READ_ONLY'}});
  if(p.startsWith('/api/operator/deals')||p.startsWith('/api/operator/audit-logs')){queries.push(p+url.search);const response=await fetch(base+p+url.search,{headers:{Authorization:'Bearer '+token}});return route.fulfill({status:response.status,json:await response.json()});}
  let value:any;
  if(p==='/api/auth/me')value={user:{id:'fixture',email:null,roles:['buyer','operator'],activeWallet:null,loginMethod:'EVM_WALLET'}};
  else if(p==='/api/notifications')value={notifications:[],unread:0};
  else if(p==='/api/notifications/preferences')value={userId:'fixture',preferences:{inApp:true,email:false},contactStatus:'MISSING'};
  else if(p==='/api/auth/wallets')value={userId:'fixture',activeWallet:null,serverTime:Date.now(),wallets:[],pagination:{nextCursor:null}};
  else if(p==='/api/transactions')value={operations:[],pagination:{nextCursor:null}};
  else if(p==='/api/operator/disputes')value={disputes:[]};
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
for(const language of ['vi','en'])test('deal sections: native scope and responsive tabs in '+language,async({page},info)=>{
 const f=await fixture(page,language),before=await control('/__state');await page.setViewportSize({width:1440,height:1000});await open(page,language);
 await tab(page,language==='en'?'Disputes':'Tranh chấp');const disputes=page.locator('.operator-deal-disputes');await expect(disputes.locator('article')).toHaveCount(20);
 for(const width of [320,375,430,768,1024,1280,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(await disputes.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);if([375,768,1440].includes(width))await capture(page,info,'deal-disputes-'+language+'-'+width);}
 await disputes.getByRole('button',{name:language==='en'?'Next page':'Trang sau',exact:true}).click();await expect(disputes.locator('article')).toHaveCount(20);await disputes.getByRole('button',{name:language==='en'?'Next page':'Trang sau',exact:true}).click();await expect(disputes.locator('article')).toHaveCount(15);await expect(disputes.getByRole('heading',{name:'Order #55',exact:true})).toBeVisible();
 await tab(page,language==='en'?'Audit':'Nhật ký');const audit=page.locator('.operator-deal .operator-audit');await expect(audit.locator('article')).toHaveCount(20);
 for(const width of [320,375,430,768,1024,1280,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(await audit.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);if([375,768,1440].includes(width))await capture(page,info,'deal-audit-'+language+'-'+width);}
 await audit.getByRole('button',{name:language==='en'?'Next page':'Trang sau',exact:true}).click();await expect(audit.locator('article')).toHaveCount(11);await expect(audit).not.toContainText('OTHER_CAMPAIGN');await expect(audit).not.toContainText('LOCAL_DEAL_SECTION_PRIVATE');
 expect(f.queries.some(q=>q.includes('/api/operator/audit-logs?')&&q.includes('dealId=deal'))).toBe(true);expect((await control('/__state')).hash).toBe(before.hash);expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('deal sections: keyboard arbitration stale cursor and revoked access',async({page},info)=>{
 const f=await fixture(page);await page.setViewportSize({width:375,height:1000});await open(page);await tab(page,'Disputes');const panel=page.locator('.operator-deal-disputes');await expect(panel.locator('article')).toHaveCount(20);
 const review=panel.getByRole('button',{name:'Review this dispute',exact:true}).first();await review.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'Review dispute allocation'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('order #order_001');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(review).toBeFocused();
 await control('/__append','POST');await panel.getByRole('button',{name:'Next page',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('changed');await expect(panel.locator('article')).toHaveCount(0);await panel.getByRole('button',{name:'Reload disputes',exact:true}).click();await expect(panel.locator('article')).toHaveCount(20);
 await expect(panel.getByRole('combobox')).toHaveAccessibleName(/Dispute status/);await panel.getByRole('combobox').selectOption('RESOLVED');await expect(panel.locator('article')).toHaveCount(3);await expect(panel.getByRole('button',{name:'Review this dispute',exact:true})).toHaveCount(0);await capture(page,info,'deal-resolved-en-375');
 await tab(page,'Audit');const audit=page.locator('.operator-deal .operator-audit');await expect(audit.locator('article')).toHaveCount(20);await audit.getByRole('button',{name:'Check stored audit integrity',exact:true}).click();await expect(audit.getByRole('status')).toContainText('Hashes and links match');await expect(audit).toContainText('entire stored system audit chain');
 await control('/__revoke','POST');await audit.getByRole('button',{name:'Reload',exact:true}).click();await expect(audit.getByRole('alert')).toContainText('no longer has access');await expect(audit.locator('article')).toHaveCount(0);await capture(page,info,'deal-audit-revoked-en-375');expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
test('deal sections: empty error wrong-scope responses clear previous records',async({page},info)=>{
 const f=await fixture(page);await page.setViewportSize({width:375,height:1000});await open(page,'en','other');await tab(page,'Audit');const audit=page.locator('.operator-deal .operator-audit');await expect(audit.locator('article')).toHaveCount(3);await expect(audit).toContainText('OTHER_CAMPAIGN');await expect(audit).not.toContainText('DEAL_REVIEWED');
 let mode='empty';await page.route('**/api/operator/audit-logs**',async route=>{const url=new URL(route.request().url()),r=await fetch(base+url.pathname+url.search,{headers:{Authorization:'Bearer '+token}}),body=await r.json();if(mode==='empty'){body.logs=[];body.pagination.nextCursor=null;}if(mode==='wrong')body.filters.dealId='deal';return route.fulfill({status:mode==='unavailable'?503:r.status,json:body});});
 await audit.getByRole('button',{name:'Reload',exact:true}).click();await expect(audit).toContainText('No audit events match');await capture(page,info,'deal-audit-empty-en-375');mode='wrong';await audit.getByRole('button',{name:'Reload',exact:true}).click();await expect(audit.getByRole('alert')).toBeVisible();await expect(audit.locator('article')).toHaveCount(0);mode='unavailable';await audit.getByRole('button',{name:'Reload',exact:true}).click();await expect(audit.getByRole('alert')).toBeVisible();await capture(page,info,'deal-audit-unavailable-en-375');
 await tab(page,'Disputes');const disputes=page.locator('.operator-deal-disputes');await expect(disputes.getByRole('alert')).toContainText('scope changed');await expect(disputes.locator('article')).toHaveCount(0);await disputes.getByRole('combobox').selectOption('RESOLVED');await expect(disputes).toContainText('No disputes match');await capture(page,info,'deal-disputes-empty-en-375');expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
