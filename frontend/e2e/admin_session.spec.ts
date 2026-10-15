import {test,expect,type Page} from '@playwright/test';
import {ethers} from 'ethers';
import {walletAuthMessage} from '../../backend/src/domain/walletAuthentication';

async function fixture(page:Page){
 const wallet=ethers.Wallet.createRandom(),publicToken='isolated-public-session',adminToken='isolated-admin-session';
 const state={signs:0,verifies:0,cancel:false,badPurpose:false,hold:undefined as Promise<void>|undefined,active:false,errors:[] as string[],writes:[] as string[]};
 await page.exposeFunction('fixtureAdminSign',async(message:string)=>{state.signs++;if(state.cancel)throw Error('User rejected');await state.hold;return wallet.signMessage(message);});
 await page.addInitScript(({address,token})=>{if(!sessionStorage.getItem('fixture-initialized')){localStorage.setItem('groupdeal_token',token);localStorage.removeItem('groupdeal_admin_token');sessionStorage.setItem('fixture-initialized','1');}localStorage.setItem('groupdeal_lang','en');(window as any).fixtureAdminWallet=address;},{address:wallet.address,token:publicToken});
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 await page.route('**/src/context/Web3Context.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,usdcBalance:null,walletMode:"DISCONNECTED"});'}));
 await page.route('**/src/context/ExternalWalletContext.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const ExternalWalletContext={};export const disabledExternalWallet={};export const ExternalWalletProvider=({children})=>children;export const useExternalWallet=()=>({configured:true,connected:true,address:window.fixtureAdminWallet,chainId:5042002,connect:async()=>window.fixtureAdminWallet,getSigner:async()=>({getAddress:async()=>window.fixtureAdminWallet,provider:{getNetwork:async()=>({chainId:5042002})},signMessage:message=>window.fixtureAdminSign(message)})});'}));
 const user=(admin:boolean)=>({id:admin?'admin-account':'buyer-account',email:null,roles:['buyer'],activeWallet:admin?wallet.address:null,loginMethod:'EVM_WALLET'});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname,admin=p.startsWith('/api/admin-auth/');if(request.method()!=='GET')state.writes.push(p);
  if(p==='/api/admin-auth/wallet/login/challenge'){
   expect(request.postDataJSON().walletAddress).toBe(wallet.address);const timestamp=Math.floor(Date.now()/1000),nonce='ab'.repeat(16),expiresAt=timestamp+300;
   let challengeMessage=walletAuthMessage({userId:'wallet-login:'+wallet.address.toLowerCase(),action:'WALLET_LOGIN',walletAddress:wallet.address,chainId:5042002,origin:url.origin,realm:'ADMIN',nonce,expiresAt,message:''},timestamp);if(state.badPurpose)challengeMessage+='\nApprove a transfer';
   return route.fulfill({json:{challengeMessage,nonce,expiresAt}});
  }
  if(p==='/api/admin-auth/wallet/login/verify'){state.verifies++;const v=request.postDataJSON();expect(ethers.verifyMessage(v.message,v.signature)).toBe(wallet.address);state.active=true;return route.fulfill({json:{token:adminToken,user:user(true)}});}
  if(p==='/api/auth/me'||p==='/api/admin-auth/me'){expect(request.headers().authorization).toBe('Bearer '+(admin?adminToken:publicToken));return route.fulfill(admin&&!state.active?{status:401,json:{error:'AUTH_SESSION_INACTIVE'}}:{json:{user:user(admin)}});}
  if(p==='/api/admin-auth/logout'){expect(request.headers().authorization).toBe('Bearer '+adminToken);state.active=false;return route.fulfill({json:{userId:'admin-account',scope:'CURRENT',revoked:true,requestId:request.postDataJSON().idempotencyKey}});}
  if(p==='/api/admin-auth/operator/enrollment')return route.fulfill({status:503,json:{error:'FIXTURE_AUTHORITY_UNAVAILABLE'}});
  return route.fulfill({json:{notifications:[],unread:0,campaigns:[],categories:[],wallets:[],preferences:{inApp:true,email:false},contactStatus:'MISSING'}});
 });
 return {state,publicToken,adminToken};
}
const login=(page:Page)=>page.getByRole('button',{name:'Connect and sign in with admin wallet',exact:true});
test('admin login uses a separate bearer and logout preserves the buyer session',async({page},info)=>{
 const f=await fixture(page);await page.setViewportSize({width:375,height:900});await page.goto('/admin/users?q=studio');await expect(login(page)).toBeEnabled();await expect(page.locator('.account-pill-btn')).toHaveCount(0);await login(page).click();await expect(page.getByRole('button',{name:'Sign out of admin',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBe(f.publicToken);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_admin_token'))).toBe(f.adminToken);expect(f.state.signs).toBe(1);expect(f.state.verifies).toBe(1);
 await page.reload();await expect(page.getByRole('button',{name:'Sign out of admin',exact:true})).toBeVisible();await page.getByRole('button',{name:'Sign out of admin',exact:true}).click();await expect(login(page)).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBe(f.publicToken);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_admin_token'))).toBeNull();
 expect(f.state.writes.every(p=>p.startsWith('/api/admin-auth/'))).toBe(true);expect(f.state.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);await page.screenshot({path:info.outputPath('admin-login-375.png'),fullPage:true});
});
test('admin login rejects substituted purpose before signing and wallet cancellation before verification',async({page})=>{
 const f=await fixture(page);f.state.badPurpose=true;await page.goto('/admin');await login(page).click();await expect(page.getByRole('alert')).toContainText('Admin sign-in was not confirmed');expect(f.state.signs).toBe(0);f.state.badPurpose=false;f.state.cancel=true;await login(page).click();await expect(login(page)).toBeEnabled();expect(f.state.signs).toBe(1);expect(f.state.verifies).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBe(f.publicToken);
});
test('admin login fences a changed signer while the signature is pending',async({page})=>{
 const f=await fixture(page);let release!:()=>void;f.state.hold=new Promise(r=>release=r);await page.goto('/admin');await login(page).click();await expect.poll(()=>f.state.signs).toBe(1);await page.evaluate(address=>(window as any).fixtureAdminWallet=address,ethers.Wallet.createRandom().address);release();await expect(page.getByRole('alert')).toContainText('Admin sign-in was not confirmed');expect(f.state.verifies).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_admin_token'))).toBeNull();expect(f.state.errors).toEqual([]);
});
test('admin login does not exchange a late signature after leaving administration',async({page})=>{
 const f=await fixture(page);let release!:()=>void;f.state.hold=new Promise(r=>release=r);await page.goto('/admin');await login(page).click();await expect.poll(()=>f.state.signs).toBe(1);await page.getByRole('link',{name:'Back to app',exact:true}).click();await expect(page).toHaveURL(/\/$/);release();await page.waitForTimeout(250);expect(f.state.verifies).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_admin_token'))).toBeNull();expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBe(f.publicToken);
});
