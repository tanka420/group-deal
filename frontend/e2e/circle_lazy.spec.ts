import {installHandleFixture} from './fixtures/account-handle';
import {test,expect,type Page} from '@playwright/test';
import {emptyCatalog} from './fixtures/catalog';
import {readFileSync} from 'node:fs';

// Actual installed/emitted SDK; only Circle's remote iframe and HTTP API are local fixtures.
const built=process.env.GROUPDEAL_BROWSER_MODE==='preview';
const provider='https://pw-auth.circle.com';
const user={id:'fixture-circle-lazy',email:'fixture-circle@example.test',roles:['buyer'],loginMethod:'CIRCLE_EMAIL',activeWallet:null};
const evm={...user,email:null,loginMethod:'EVM_WALLET'};
type ProviderMode='ready'|'stall'|'reject';

async function fixture(page:Page,{owned=false,mode='ready' as ProviderMode,csp=false}={}){
 const counts={device:0,otp:0,login:0,initialize:0,sdk:0},errors:string[]=[],sdkUrls:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/circle-fin_w3s-pw-web-sdk|\/assets\/src-[^/]+\.js/.test(r.url())){counts.sdk++;sdkUrls.push(r.url());}});
 await page.addInitScript(({owned})=>{if(top!==self)return;localStorage.setItem('groupdeal_lang','en');localStorage.setItem('groupdeal_operation_checkpoints','fixture-preserved-lazy-checkpoint');if(owned)localStorage.setItem('groupdeal_token','fixture-lazy-evm-session');window.addEventListener('securitypolicyviolation',e=>{(window as any).fixtureCspViolations??=[];(window as any).fixtureCspViolations.push(e.violatedDirective);});},{owned});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname==='/api/v1/catalog'?emptyCatalog(r.request().url()):{campaigns:[],notifications:[],unread:0}}));
 await installHandleFixture(page,request=>user);await page.route('**/api/auth/me',r=>r.fulfill({json:{user:owned?evm:user}}));
 await page.route('**/api/auth/wallets?**',r=>r.fulfill({json:{userId:evm.id,activeWallet:null,wallets:[],pagination:{nextCursor:null},serverTime:Date.now()}}));
 await page.route('**/api/notifications/preferences',r=>r.fulfill({json:{preferences:{inApp:true,email:false},contactStatus:'MISSING'}}));
 await page.route('**/api/circle/email/token',r=>{counts.otp++;return r.fulfill({json:{deviceToken:'fixture-device-token',deviceEncryptionKey:'fixture-device-encryption',otpToken:'fixture-otp-token',loginAttemptId:'11111111-2222-4333-8444-555555555555'}});});
 await page.route('**/api/circle/session',r=>{counts.login++;return r.fulfill({json:{user,token:'fixture-lazy-circle-session'}});});
 await page.route('**/api/circle/wallet/initialize',r=>{counts.initialize++;return r.fulfill({json:{alreadyInitialized:true}});});
 await page.route('**/api/circle/wallets',r=>r.fulfill({json:{wallets:[{id:'fixture-circle-wallet',address:'0x1111111111111111111111111111111111111111',blockchain:'ARC-TESTNET'}],user}}));
 await page.route(provider+'/**',r=>{
  const path=new URL(r.request().url()).pathname;if(path==='/device-id')counts.device++;
  if(path==='/device-id'&&mode==='reject')return r.abort('failed');
  // Provider origin and actual iframe source are preserved by Playwright route fulfillment.
  return r.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'nonce-fixture';"},body:`<!doctype html><script nonce="fixture">
    addEventListener('message',event=>{if(event.source!==parent||!event.data.w3s)return;
      if(${JSON.stringify(path)}==='/device-id'){${mode==='ready'?"parent.postMessage({deviceId:'fixture-device-id'},'*');":''}}
      else if(${JSON.stringify(path)}==='/social/verify-email'){parent.postMessage({onEmailLoginVerified:{result:{userToken:'fixture-circle-user-token',encryptionKey:'fixture-encryption',refreshToken:'fixture-refresh'}}},'*');}
    });parent.postMessage({onFrameReady:true},'*');</script>`});
 });
 if(csp)await page.route('**/',async r=>{if(r.request().resourceType()!=='document')return r.continue();const response=await r.fetch();return r.fulfill({response,headers:{...response.headers(),'Content-Security-Policy':`default-src 'self'; script-src 'self'${built?'':" 'unsafe-inline'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; frame-src ${provider}; object-src 'none'; base-uri 'none';`}});});
 return {counts,errors,sdkUrls,violations:async()=>await page.evaluate(()=>(window as any).fixtureCspViolations||[]) as string[]};
}
async function open(page:Page){await page.getByRole('button',{name:'Log In',exact:true}).click();return page.getByRole('dialog',{name:'Sign in to GroupDeal',exact:true});}
async function untouched(page:Page){expect(await page.evaluate(()=>localStorage.getItem('groupdeal_operation_checkpoints'))).toBe('fixture-preserved-lazy-checkpoint');}

test('public page and EVM account information defer all Circle initialization',async({page})=>{
 const f=await fixture(page,{owned:true});await page.goto('/');await expect(page.locator('.account-pill-btn')).toBeVisible();
 await page.locator('.account-pill-btn').click();await page.getByRole('button',{name:'Account details',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Your account',exact:true})).toBeVisible();expect(f.counts.device).toBe(0);expect(f.counts.sdk).toBe(0);await expect(page.locator('#sdkIframe')).toHaveCount(0);expect(f.counts.otp).toBe(0);expect(f.errors).toEqual([]);await untouched(page);
});
test('actual SDK is initialized once on dialog intent and reused after reopening',async({page})=>{
 const f=await fixture(page);await page.goto('/');await expect(page.getByRole('button',{name:'Log In',exact:true})).toBeVisible();expect(f.counts.device).toBe(0);expect(f.counts.sdk).toBe(0);
 const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();expect(f.counts.device).toBe(1);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();expect(f.counts.device).toBe(1);expect(f.counts.otp).toBe(0);expect(f.errors).toEqual([]);await untouched(page);
});
test('installed SDK completes local OTP callback under a CSP that blocks eval',async({page})=>{
 const f=await fixture(page,{csp:true});await page.goto('/');const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await dialog.getByLabel('Email address',{exact:true}).fill(user.email);await dialog.getByRole('button',{name:'Send OTP with Circle',exact:true}).click();await dialog.getByRole('button',{name:'Open Circle authentication',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(page.locator('.account-pill-btn')).toContainText('@fixture_circle');expect(f.counts.device).toBe(1);expect(f.counts.otp).toBe(1);expect(f.counts.login).toBe(1);expect(f.errors).toEqual([]);expect(await f.violations()).toEqual([]);await untouched(page);
});
test('provider readiness without device result reaches a bounded timeout and permits explicit retry',async({page})=>{
 await page.clock.install();const f=await fixture(page,{mode:'stall'});await page.goto('/');const dialog=await open(page);await expect(dialog.getByRole('status')).toContainText('Initializing the Circle connection');await expect.poll(()=>f.counts.device).toBe(1);await page.clock.fastForward(15_001);
 const retry=dialog.getByRole('button',{name:'Retry Circle connection',exact:true});await expect(retry).toBeEnabled();await expect(dialog.getByRole('button',{name:'Email sign-in is currently unavailable',exact:true})).toBeDisabled();expect(f.counts.otp).toBe(0);await expect(page.locator('#sdkIframe')).toHaveCount(0);
 // Explicit retry reuses the actual SDK singleton and starts one new device request.
 await retry.click();await expect(dialog.getByLabel("Email address",{exact:true})).toBeFocused();await expect.poll(()=>f.counts.device).toBe(2);await page.clock.fastForward(15_001);await expect(retry).toBeEnabled();expect(f.errors).toEqual([]);await untouched(page);
});


test('actual browser SDK nonce decoder and singleton callback rebinding work without eval',async({page})=>{
 const f=await fixture(page,{csp:true});await page.goto('/');const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();
 let sdkUrl=f.sdkUrls.find(url=>url.includes('circle-fin_w3s-pw-web-sdk'));
 if(built){const manifest=JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));const entry=Object.entries(manifest).find(([key])=>key==='node_modules/@circle-fin/w3s-pw-web-sdk/dist/src/index.js');if(!entry)throw Error('Built SDK entry missing');sdkUrl='/'+(entry[1] as any).file;}
 expect(sdkUrl).toBeTruthy();
 const result=await page.evaluate(async url=>{
  const namespace=await import(url!);const Circle=namespace.W3SSdk||namespace.default?.W3SSdk;if(!Circle)throw Error('Actual SDK export missing');let callbacks=0;
  const sdk=new Circle({appSettings:{appId:'fixture-nonce-app'}},()=>{});sdk.updateConfigs({appSettings:{appId:'fixture-nonce-app'}},()=>callbacks++);
  const nonce='fixture-nonce-Tiếng-Việt-🙂';localStorage.setItem('nonce',nonce);
  const enc=(v:unknown)=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(v)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const token=enc({alg:'none',typ:'JWT'})+'.'+enc({nonce})+'.';
  const valid=sdk.checkSocialLoginNonce(new URLSearchParams({id_token:token}));localStorage.setItem('nonce','fixture-wrong');const mismatch=sdk.checkSocialLoginNonce(new URLSearchParams({id_token:token}));localStorage.removeItem('nonce');const absent=sdk.checkSocialLoginNonce(new URLSearchParams());
  return {valid,mismatch,absent,callbacks};
 },sdkUrl);
 expect(result).toEqual({valid:true,mismatch:false,absent:false,callbacks:2});expect(f.counts.otp).toBe(0);expect(f.errors).toEqual([]);expect(await f.violations()).toEqual([]);await untouched(page);
});


test('provider remount shares the pending device request and binds OTP to the current provider',async({page})=>{
 test.skip(built,'Dev-only lifecycle harness is not part of the deployed application; built OTP and nonce tests use the real emitted entry.');
 const f=await fixture(page,{mode:'stall'});
 await page.route('**/',async r=>{const response=await r.fetch();const html=await response.text();if(!html.includes('/src/main.tsx'))throw Error('Fixture entry anchor changed');return r.fulfill({response,body:html.replace('/src/main.tsx','/e2e/fixtures/circleLifecycle.tsx')});});
 await page.goto('/');await page.getByRole('button',{name:'Prepare Circle twice',exact:true}).click();await expect.poll(()=>f.counts.device).toBe(1);await page.getByRole('button',{name:'Remount auth provider',exact:true}).click();await page.getByRole('button',{name:'Prepare Circle twice',exact:true}).click();
 // Request observation precedes iframe navigation, especially under parallel
 // browser load. Wait for the real provider frame before delivering its result.
 await expect.poll(()=>page.frames().some(frame=>frame.url().startsWith(provider+'/device-id'))).toBe(true);
 const frame=page.frames().find(frame=>frame.url().startsWith(provider+'/device-id'));expect(frame).toBeTruthy();await frame!.evaluate(()=>parent.postMessage({deviceId:'fixture-remounted-device'},'*'));
 await expect(page.getByRole('status',{name:'Circle initialization',exact:true})).toHaveText('READY');await expect(page.getByRole('status',{name:'Current lifecycle result',exact:true})).toHaveText('READY');expect(f.counts.device).toBe(1);
 expect(await page.evaluate(()=>(window as any).fixtureLifecycleResults.slice().sort())).toEqual(['0:FAILED','0:FAILED','1:READY','1:READY']);
 await page.getByRole('button',{name:'Request fixture OTP',exact:true}).click();await expect(page.getByRole('status',{name:'Current lifecycle result',exact:true})).toHaveText('OTP_REQUESTED');await page.getByRole('button',{name:'Verify fixture OTP',exact:true}).click();await expect(page.getByRole('status',{name:'Current identity',exact:true})).toHaveText(user.id);expect(f.counts.otp).toBe(1);expect(f.counts.login).toBe(1);expect(f.errors).toEqual([]);await untouched(page);
});
