import {test,expect,type Page} from '@playwright/test';
import {emptyCatalog} from './fixtures/catalog';
import {Wallet,ethers} from 'ethers';
import {masterFixture} from './fixtures/master-deal.mjs';
import {HUB_ABI} from '../src/contracts/hubAbi';

// Actual installed/emitted AppKit and ethers. HTTP, websocket and injected-wallet
// boundaries are isolated fixtures; this does not prove a principal's live journey.
test.skip(process.env.GROUPDEAL_REOWN_CONFIGURED_FIXTURE!=='1','Requires the explicit, synthetic Reown project configuration profile.');

async function fixture(page:Page,{holdAccounts=false,holdSignature=false,csp=false,zeroSourceGas=false,cloudAuth=false}={}){
 const wallet=Wallet.createRandom(),counts={challenge:0,verify:0,sign:0,device:0,reown:0,projectConfig:0,remoteFont:0},errors:string[]=[],blocked:string[]=[];
 const account={id:'fixture-reown-user',email:null,roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:wallet.address};
 const other={...account,id:'fixture-other-user',email:'other@example.test',loginMethod:'CIRCLE_EMAIL',activeWallet:null};
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/ReownEnabledProvider|appkit-adapter-ethers|\/deps\/@reown_appkit/.test(r.url()))counts.reown++;});
 page.on('request',r=>{if(new URL(r.url()).hostname==='fonts.reown.com')counts.remoteFont++;});
 await page.exposeFunction('fixtureSignMessage',async(message:string,address:string)=>{if(address.toLowerCase()!==wallet.address.toLowerCase())throw Error('Fixture signing account mismatch');counts.sign++;return wallet.signMessage(ethers.getBytes(message));});
 await page.addInitScript(({address,holdAccounts,holdSignature,zeroSourceGas})=>{
  if(top!==self)return;localStorage.setItem('groupdeal_lang','en');localStorage.setItem('groupdeal_operation_checkpoints','fixture-preserved-reown-checkpoint');
  (window as any).fixtureWalletRequests=[];
  addEventListener('securitypolicyviolation',event=>{((window as any).fixtureCspViolations??=[]).push(event.violatedDirective);});
  const listeners=new Map<string,Set<(...args:unknown[])=>void>>();let connected=false,chain='0x4cef52',accountsRelease:()=>void=()=>{},signatureRelease:()=>void=()=>{};
  const accountsGate=holdAccounts?new Promise<void>(resolve=>accountsRelease=resolve):Promise.resolve(),signatureGate=holdSignature?new Promise<void>(resolve=>signatureRelease=resolve):Promise.resolve();
  const emit=(name:string,value:unknown)=>listeners.get(name)?.forEach(listener=>listener(value));
  const provider={isMetaMask:true,on:(name:string,listener:(...args:unknown[])=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(listener);},removeListener:(name:string,listener:(...args:unknown[])=>void)=>listeners.get(name)?.delete(listener),
   request:async({method,params=[]}:{method:string;params?:any[]})=>{
    ((window as any).fixtureWalletRequests??=[]).push(method);
    if(method==='eth_requestAccounts'){await accountsGate;connected=true;emit('accountsChanged',[address]);return [address];}
    if(method==='eth_accounts')return connected?[address]:[];
    if(method==='eth_chainId')return chain;
    if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain'){chain=params[0].chainId;emit('chainChanged',chain);return null;}
    if(method==='personal_sign'){await signatureGate;return (window as any).fixtureSignMessage(params[0],params[1]);}
    if(method==='wallet_getPermissions')return [];
    if(method==='eth_getBalance')return zeroSourceGas&&chain!=='0x4cef52'?'0x0':'0xde0b6b3a7640000';
    if(method==='eth_call')return '0x'+BigInt(100_000_000).toString(16).padStart(64,'0');
    throw Error('Unsupported fixture wallet method: '+method);
   }};
  (window as any).ethereum=provider;
  (window as any).fixtureWallet={releaseAccounts:()=>accountsRelease(),releaseSignature:()=>signatureRelease(),emit};
  const announce=()=>dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'d24ea0cd-43ef-4602-93f4-c72c0630503a',name:'Fixture Wallet',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',rdns:'test.groupdeal.fixture'},provider}}));
  addEventListener('eip6963:requestProvider',announce);
 },{address:wallet.address,holdAccounts,holdSignature,zeroSourceGas});
 await page.routeWebSocket('**/*',ws=>{if(new URL(ws.url()).hostname==='127.0.0.1')ws.connectToServer();else ws.close();});
 await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();blocked.push(new URL(r.request().url()).pathname);return r.abort();});
 await page.route('https://api.web3modal.org/**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(path.endsWith('/config')){counts.projectConfig++;return r.fulfill({json:{features:cloudAuth?[{id:'reown_authentication',isEnabled:true,config:['enabled']},{id:'social_login',isEnabled:true,config:['email','google']}]:[]}});}
  if(path.endsWith('/origins'))return r.fulfill({json:{allowedOrigins:['http://127.0.0.1:'+process.env.GROUPDEAL_BROWSER_PORT]}});
  if(path.endsWith('/project-limits'))return r.fulfill({json:{planLimits:{tier:'unlimited',isAboveMauLimit:false,isAboveRpcLimit:false}}});
  if(path==='/getWallets')return r.fulfill({json:{data:[],count:0}});
  if(/getAssetImage|getWalletImage/.test(path))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
  blocked.push(path);return r.abort();
 });
 await page.route('https://pw-auth.circle.com/**',r=>{counts.device++;return r.fulfill({contentType:'text/html',body:`<script>addEventListener('message',e=>{if(e.source===parent&&e.data.w3s)parent.postMessage({deviceId:'fixture-device'},'*')});parent.postMessage({onFrameReady:true},'*');</script>`});});
 const rpc=async(r:any)=>{const call=r.request().postDataJSON(),chain=String(new URL(r.request().url()).searchParams.get('chainId')||'5042002').split(':').pop();const reply=(value:any)=>({jsonrpc:'2.0',id:value.id,result:value.method==='eth_chainId'?ethers.toBeHex(Number(chain)):value.method==='eth_call'?ethers.zeroPadValue('0x0f4240',32):value.method==='eth_blockNumber'?'0x1':'0xde0b6b3a7640000'});return r.fulfill({json:Array.isArray(call)?call.map(reply):reply(call)});};
 for(const origin of ['https://rpc.testnet.arc.io/**','https://rpc.drpc.testnet.arc.io/**','https://rpc.walletconnect.org/**'])await page.route(origin,rpc);
 await page.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname==='/api/v1/catalog'?emptyCatalog(r.request().url()):{campaigns:[],notifications:[],unread:0}}));
 await page.route('**/api/health',r=>r.fulfill({json:{hubAddress:'0x1111111111111111111111111111111111111111',usdcAddress:'0x3600000000000000000000000000000000000000'}}));
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:r.request().headers().authorization?.endsWith('fixture-other-session')?other:account}}));
 await page.route('**/api/auth/wallets?**',r=>r.fulfill({json:{userId:account.id,activeWallet:account.activeWallet,wallets:[],pagination:{nextCursor:null},serverTime:Date.now()}}));
 const nonce='fixture-nonce-reown',message='GroupDeal isolated wallet sign-in\nNonce: '+nonce;
 await page.route('**/api/auth/wallet/login/challenge',r=>{counts.challenge++;expect(r.request().postDataJSON().walletAddress).toBe(wallet.address);return r.fulfill({json:{challengeMessage:message,nonce}});});
 await page.route('**/api/auth/wallet/login/verify',r=>{counts.verify++;const body=r.request().postDataJSON();expect(body.message).toBe(message);expect(body.nonce).toBe(nonce);expect(ethers.verifyMessage(message,body.signature)).toBe(wallet.address);return r.fulfill({json:{user:account,token:'fixture-reown-session'}});});
 if(csp)await page.route('**/',async r=>{if(r.request().resourceType()!=='document')return r.continue();const response=await r.fetch();return r.fulfill({response,headers:{...response.headers(),'Content-Security-Policy':`default-src 'self'; script-src 'self'${process.env.GROUPDEAL_BROWSER_MODE==='preview'?'':" 'unsafe-inline'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.web3modal.org; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* https://api.web3modal.org https://rpc.walletconnect.org https://rpc.testnet.arc.io https://rpc.drpc.testnet.arc.io wss://relay.walletconnect.org wss://relay.walletconnect.com; frame-src https://pw-auth.circle.com; object-src 'none'; base-uri 'none';`}});});
 return {counts,errors,blocked,account};
}
async function open(page:Page){await page.getByRole('button',{name:'Log In',exact:true}).click();return page.getByRole('dialog',{name:'Sign in to GroupDeal',exact:true});}
async function untouched(page:Page){expect(await page.evaluate(()=>localStorage.getItem('groupdeal_operation_checkpoints'))).toBe('fixture-preserved-reown-checkpoint');}
async function chooseWallet(page:Page){const modal=page.locator('w3m-modal');await expect(modal).toBeVisible();await modal.getByText('Fixture Wallet',{exact:true}).click();}
async function closedWallet(page:Page){await expect.poll(()=>page.evaluate(()=>Boolean((document.querySelector('w3m-modal') as any)?.open))).toBe(false);await expect(page.locator('w3m-modal').getByRole('alertdialog')).not.toBeVisible();}
const modalResource=/(?:\/w3m-modal-[^/]+\.js|\/@reown_appkit-scaffold-ui_w3m-modal\.js)(?:\?|$)/;

for(const width of [320,1440])test(`stored account purchase ${width} yields to actual AppKit and preserves its pending intent after cancellation`,async({page},info)=>{
 const f=await fixture(page),data=masterFixture(),hub='0x1111111111111111111111111111111111111111',identity='0x'+'72'.repeat(32),deadline=Math.floor(Date.now()/1000)+900;let authorizations=0,submits=0;
 data.campaign.earlyRebateEnabled=false;data.campaign.tiers=[{threshold:1,price:'1000000'}];data.campaign.currentUnlockedTier=0;
 const operation={id:'fixture-reconnect-buy',action:'BUY',resourceId:'master',chainId:5042002,hubAddress:hub,principal:f.account.activeWallet,phase:'PREPARED',createdAt:Date.now(),updatedAt:Date.now(),calldata:new ethers.Interface(HUB_ABI).encodeFunctionData('commitToBuy',[1,identity,1,false,1,deadline,'0x1234']),purchaseQuote:{blockNumber:125,blockHash:'0x'+'56'.repeat(32),lockedUnitPrice:'1000000',commitmentAmount:'1000000',termsHash:data.campaign.termsHash}};
 await page.addInitScript(()=>{if(top===self)localStorage.setItem('groupdeal_token','fixture-stored-account');});
 await page.route('https://rpc.testnet.arc.io/**',r=>{const req=r.request().postDataJSON(),reply=(p:any)=>({id:p.id,jsonrpc:'2.0',result:p.method==='eth_chainId'?'0x4cef52':p.method==='eth_getBalance'?ethers.toBeHex(10n**19n):p.method==='eth_gasPrice'?'0x3b9aca00':p.method==='eth_estimateGas'?'0x186a0':'0x'+'0'.repeat(64)});return r.fulfill({json:Array.isArray(req)?req.map(reply):reply(req)});});
 await page.route('**/api/campaigns/master',r=>r.fulfill({json:data}));
 await page.route(/\/api\/transactions(?:\?.*)?$/,r=>r.fulfill({json:{operations:[],pagination:{nextCursor:null}}}));
 await page.route('**/api/orders/authorize',r=>{authorizations++;expect(r.request().postDataJSON()).toMatchObject({walletAddress:f.account.activeWallet,quantity:1,requireEarlySlot:false,maxGrossAmount:'1000000'});return r.fulfill({json:{buyerWallet:f.account.activeWallet,campaignId:'1',campaignIdentity:identity,maxQuantity:1,deadline,termsHash:data.campaign.termsHash,signature:'0x1234',quote:operation.purchaseQuote,operation}});});
 await page.route('**/api/transactions/fixture-reconnect-buy',r=>r.fulfill({json:{operation}}));
 await page.route('**/api/transactions/fixture-reconnect-buy/ready',r=>r.fulfill({json:{operation}}));
 await page.route('**/api/transactions/fixture-reconnect-buy/submit',r=>{submits++;return r.fulfill({status:409,json:{error:'Local fixture has no financial broadcast'}});});
 await page.setViewportSize({width,height:850});await page.goto('/#campaign-master');await expect(page.locator('.account-pill-btn')).toBeVisible();await page.locator('.deal-join-cta').click();
 const review=page.locator('dialog.join-dialog');await review.locator('.join-agreement input').check();await review.getByRole('button',{name:'Approve USDC & commit',exact:true}).click();
 const modal=page.locator('w3m-modal');await expect(modal).toHaveJSProperty('open',true,{timeout:20_000});
 await modal.getByText('Fixture Wallet',{exact:true}).click({trial:true,timeout:2500});
 await expect(page.locator('#root')).toHaveJSProperty('inert',true);
 await expect(page.locator('.transaction-overlay')).toBeHidden();
 await page.screenshot({path:info.outputPath(`purchase-wallet-handoff-${width}.png`)});
 await page.keyboard.press('Escape');await closedWallet(page);const tracker=page.locator('.transaction-dialog');await expect(tracker).toContainText('Previous transaction needs review');
 const key='groupdeal_checkout:v1:'+f.account.activeWallet.toLowerCase()+':master',stored=await page.evaluate(k=>localStorage.getItem(k),key);expect(JSON.parse(stored!)).toMatchObject({operationId:operation.id,phase:'BUY_PENDING'});
 await expect(tracker).toHaveAttribute('aria-modal','true');await expect(tracker.locator('h2')).toBeFocused();
 await tracker.getByRole('button',{name:'Close',exact:true}).focus();await page.keyboard.press('Tab');await expect(tracker.getByRole('button',{name:'Check previous transaction / order',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(tracker.getByRole('button',{name:'Close',exact:true})).toBeFocused();
 await tracker.getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('.deal-join-cta')).toBeFocused();await page.locator('.deal-join-cta').click();const next=page.locator('dialog.join-dialog');await next.locator('.join-agreement input').check();await next.getByRole('button',{name:'Approve USDC & commit',exact:true}).click();await expect(tracker).toContainText('Previous transaction needs review');
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(stored);expect(authorizations).toBe(1);expect(submits).toBe(0);expect(f.counts.sign).toBe(0);expect(f.counts.challenge).toBe(0);expect(f.counts.verify).toBe(0);expect(f.errors).toEqual([]);expect(await page.evaluate(()=>(window as any).fixtureWalletRequests.filter((m:string)=>/sendTransaction|signTypedData|personal_sign/.test(m)))).toEqual([]);await untouched(page);
});

test('configured public page and email intent defer AppKit until an explicit wallet action',async({page})=>{
 const f=await fixture(page);await page.goto('/');await expect(page.getByRole('button',{name:'Log In',exact:true})).toBeVisible();expect(f.counts.reown).toBe(0);await expect(page.locator('w3m-modal')).toHaveCount(0);
 const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();expect(f.counts.reown).toBe(0);expect(f.counts.device).toBe(1);expect(f.counts.challenge).toBe(0);expect(await page.evaluate(()=>(window as any).fixtureWalletRequests||[])).toEqual([]);expect(f.errors).toEqual([]);await untouched(page);
});
test('actual AppKit injected connection signs one verified login and preserves the application',async({page})=>{
 const f=await fixture(page);await page.goto('/');const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);
 await expect(page.locator('.account-pill-btn')).toBeVisible();expect(f.counts.challenge).toBe(1);expect(f.counts.verify).toBe(1);expect(f.counts.sign).toBe(1);expect(f.counts.device).toBe(1);expect(f.counts.reown).toBeGreaterThan(0);expect(f.counts.projectConfig).toBe(1);expect(f.counts.remoteFont).toBe(0);expect(f.errors).toEqual([]);await closedWallet(page);await untouched(page);
 expect(await page.evaluate(()=>(window as any).fixtureWalletRequests.filter((m:string)=>/sendTransaction|signTypedData/.test(m)))).toEqual([]);
});
test('changing the account while the wallet is approving connection prevents the old login signature',async({page})=>{
 const f=await fixture(page,{holdAccounts:true});await page.goto('/');const dialog=await open(page);await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);await expect.poll(()=>page.evaluate(()=>(window as any).fixtureWalletRequests.includes('eth_requestAccounts'))).toBe(true);
 await page.evaluate(()=>{localStorage.setItem('groupdeal_token','fixture-other-session');dispatchEvent(new StorageEvent('storage',{key:'groupdeal_token',newValue:'fixture-other-session',storageArea:localStorage}));});await expect(page.locator('.account-pill-btn')).toContainText('other');await page.evaluate(()=>(window as any).fixtureWallet.releaseAccounts());
 await closedWallet(page);await expect(page.getByRole('dialog',{name:'Your account',exact:true})).toBeVisible();expect(f.counts.challenge).toBe(0);expect(f.counts.verify).toBe(0);expect(f.counts.sign).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBe('fixture-other-session');expect(f.errors).toEqual([]);await untouched(page);
});
test('closing actual AppKit permits retry without discarding the email form or loading the SDK twice',async({page})=>{
 const f=await fixture(page);await page.goto('/');const dialog=await open(page);const email=dialog.getByLabel('Email address',{exact:true});await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await email.fill('kept@example.test');
 await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await expect(page.locator('w3m-modal').getByRole('alertdialog')).toBeVisible();const sdkLoads=f.counts.reown;await page.keyboard.press('Escape');await closedWallet(page);
 await expect(dialog.getByRole('alert')).toContainText('You declined or closed authentication');await expect(email).toHaveValue('kept@example.test');expect(f.counts.device).toBe(1);expect(f.counts.challenge).toBe(0);
 await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);await expect(page.locator('.account-pill-btn')).toBeVisible();expect(f.counts.reown).toBe(sdkLoads);expect(f.counts.sign).toBe(1);expect(f.errors).toEqual([]);await untouched(page);
});
test('a late signature from a previous account cannot verify or replace the current session',async({page})=>{
 const f=await fixture(page,{holdSignature:true});await page.goto('/');const dialog=await open(page);await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);await expect.poll(()=>page.evaluate(()=>(window as any).fixtureWalletRequests.includes('personal_sign'))).toBe(true);expect(f.counts.challenge).toBe(1);
 await page.evaluate(()=>{localStorage.setItem('groupdeal_token','fixture-other-session');dispatchEvent(new StorageEvent('storage',{key:'groupdeal_token',newValue:'fixture-other-session',storageArea:localStorage}));});await expect(page.locator('.account-pill-btn')).toContainText('other');await page.evaluate(()=>(window as any).fixtureWallet.releaseSignature());await expect.poll(()=>f.counts.sign).toBe(1);
 await expect(page.getByRole('dialog',{name:'Your account',exact:true})).toBeVisible();expect(f.counts.verify).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBe('fixture-other-session');expect(f.errors).toEqual([]);await untouched(page);
});
test('actual AppKit and ethers sign the isolated challenge under a script policy without eval',async({page})=>{
 const f=await fixture(page,{csp:true});await page.goto('/');const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);await expect(page.locator('.account-pill-btn')).toBeVisible();expect(f.counts.sign).toBe(1);expect(f.counts.verify).toBe(1);expect(f.errors).toEqual([]);expect(await page.evaluate(()=>(window as any).fixtureCspViolations||[])).toEqual([]);await untouched(page);
});
test('installed wallet and bridge SDKs block a source with USDC but zero native gas before signing or checkpointing',async({page})=>{
 const f=await fixture(page,{zeroSourceGas:true});await page.goto('/');const dialog=await open(page);await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);await expect(page.locator('.account-pill-btn')).toBeVisible();await closedWallet(page);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Fund USDC',exact:true}).click();await page.getByRole('button',{name:'CCTP Bridge',exact:true}).click();await page.getByRole('button',{name:'Lấy báo giá bridge USDC vào Arc',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Ví nguồn không có ETH');
 const methods=await page.evaluate(()=>(window as any).fixtureWalletRequests as string[]);expect(methods).toContain('eth_call');expect(methods).toContain('eth_getBalance');expect(methods.filter(method=>/sendTransaction|signTypedData|sendCalls/.test(method))).toEqual([]);expect(f.counts.sign).toBe(1);expect(f.counts.verify).toBe(1);expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('groupdeal_bridge:')))).toBe(false);expect(f.errors).toEqual([]);await untouched(page);
});
test('closing AppKit while provider approval is pending never turns a late connection into login',async({page})=>{
 const f=await fixture(page,{holdAccounts:true});await page.goto('/');const dialog=await open(page);await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);await expect.poll(()=>page.evaluate(()=>(window as any).fixtureWalletRequests.includes('eth_requestAccounts'))).toBe(true);await page.keyboard.press('Escape');await closedWallet(page);await page.evaluate(()=>(window as any).fixtureWallet.releaseAccounts());await expect(dialog.getByRole('alert')).toContainText('You declined or closed authentication');
 expect(f.counts.challenge).toBe(0);expect(f.counts.verify).toBe(0);expect(f.counts.sign).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBeNull();expect(f.errors).toEqual([]);await untouched(page);
});
test('cloud authentication overrides are refused before opening the wallet or requesting a signature',async({page})=>{
 const f=await fixture(page,{cloudAuth:true});await page.goto('/');const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Wallet connection settings need an update');expect(f.counts.projectConfig).toBe(1);await expect(page.locator('w3m-modal').getByRole('alertdialog')).not.toBeVisible();expect(f.counts.challenge).toBe(0);expect(f.counts.sign).toBe(0);expect(await page.evaluate(()=>(window as any).fixtureWalletRequests.includes('eth_requestAccounts'))).toBe(false);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();expect(f.errors).toEqual([]);await untouched(page);
});

test('a failed actual modal resource offers explicit reload and keeps Circle and checkpoints available',async({page})=>{
 const f=await fixture(page);let failures=0;
 await page.route(modalResource,r=>{failures++;return r.fulfill({status:404,contentType:'text/plain',body:'Fixture missing SDK UI resource'});});
 await page.goto('/');const dialog=await open(page),email=dialog.getByLabel('Email address',{exact:true});
 await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await email.fill('kept@example.test');
 await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Reload the page to retry');expect(failures).toBeGreaterThan(0);
 const reload=dialog.getByRole('button',{name:'Reload page to connect wallet',exact:true});await expect(reload).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true})).toBeDisabled();
 await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await expect(email).toHaveValue('kept@example.test');
 expect(f.counts.challenge).toBe(0);expect(f.counts.sign).toBe(0);expect(f.counts.verify).toBe(0);await untouched(page);
 // Reload is a user action. Restore the real resource and verify a fresh,
 // usable SDK without deleting wallet storage or the financial checkpoint.
 await page.unroute(modalResource);await reload.click();await expect(page.getByRole('button',{name:'Log In',exact:true})).toBeVisible();
 expect(f.counts.challenge).toBe(0);expect(f.counts.sign).toBe(0);await untouched(page);
 const fresh=await open(page);await fresh.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);
 await expect(page.locator('.account-pill-btn')).toBeVisible();expect(f.counts.sign).toBe(1);expect(f.counts.verify).toBe(1);expect(f.errors).toEqual([]);await untouched(page);
});

test('delayed modal resources during readiness cannot open or approve the expired request',async({page})=>{
 const f=await fixture(page);let requested=0,release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 await page.route(modalResource,async r=>{requested++;await gate;await r.continue();});
 await page.goto('/');const dialog=await open(page),email=dialog.getByLabel('Email address',{exact:true});
 await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await email.fill('kept@example.test');
 await page.clock.install();await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();
 await expect.poll(()=>requested).toBeGreaterThan(0);await page.clock.fastForward(20_050);
 await expect(dialog.getByRole('alert')).toContainText('Authentication did not complete before the timeout');
 await expect(dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true})).toBeEnabled();release();
 await expect(page.locator('w3m-modal')).toHaveCount(1);await closedWallet(page);
 await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();await expect(email).toHaveValue('kept@example.test');
 expect(f.counts.challenge).toBe(0);expect(f.counts.sign).toBe(0);expect(f.counts.verify).toBe(0);
 expect(await page.evaluate(()=>(window as any).fixtureWalletRequests.includes('eth_requestAccounts'))).toBe(false);expect(f.errors).toEqual([]);await untouched(page);
 await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);
 await expect(page.locator('.account-pill-btn')).toBeVisible();expect(requested).toBe(1);expect(f.counts.sign).toBe(1);expect(f.counts.verify).toBe(1);await untouched(page);
});

test('a slow readiness response can be adopted only by another explicit wallet request',async({page})=>{
 const f=await fixture(page);let requested=0,release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 await page.route(/^https:\/\/api\.web3modal\.org\/appkit\/v1\/config(?:\?|$)/,async r=>{requested++;await gate;await r.fulfill({json:{features:[]}});});
 await page.goto('/');const dialog=await open(page);await expect(dialog.getByRole('button',{name:'Send OTP with Circle',exact:true})).toBeEnabled();
 await page.clock.install();await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();
 await expect.poll(()=>requested).toBe(1);await page.clock.fastForward(20_050);
 await expect(dialog.getByRole('alert')).toContainText('Authentication did not complete before the timeout');
 await expect(dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true})).toBeEnabled();
 release();expect(f.counts.sign).toBe(0);expect(f.counts.challenge).toBe(0);await untouched(page);
 await dialog.getByRole('button',{name:'Connect wallet and sign in',exact:true}).click();await chooseWallet(page);
 await expect(page.locator('.account-pill-btn')).toBeVisible();expect(requested).toBe(1);expect(f.counts.sign).toBe(1);expect(f.counts.verify).toBe(1);expect(f.errors).toEqual([]);await untouched(page);
});

test('a failed wallet entry resource has a reload path in Vietnamese without leaking provider diagnostics',async({page})=>{
 const f=await fixture(page);let failures=0;
 const resource=/(?:\/src\/context\/ReownEnabledProvider\.tsx|\/assets\/ReownEnabledProvider-[^/]+\.js)(?:\?|$)/;
 await page.addInitScript(()=>{if(top===self)localStorage.setItem('groupdeal_lang','vi');});
 await page.route(resource,r=>{failures++;return r.fulfill({status:404,contentType:'text/plain',body:'Fixture missing wallet entry resource'});});
 await page.goto('/');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Đăng nhập GroupDeal',exact:true});
 await expect(dialog.getByRole('button',{name:'Gửi mã OTP qua Circle',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Kết nối và đăng nhập bằng ví',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Tải lại trang để thử lại');expect(failures).toBeGreaterThan(0);
 await expect(dialog.getByRole('button',{name:'Kết nối và đăng nhập bằng ví',exact:true})).toBeDisabled();
 const reload=dialog.getByRole('button',{name:'Tải lại trang để kết nối ví',exact:true});await expect(reload).toBeVisible();
 await expect(dialog.getByRole('alert')).toBeFocused();await page.keyboard.press('Tab');await expect(reload).toBeFocused();
 await expect(dialog.getByRole('alert')).not.toContainText('WALLET_RELOAD_REQUIRED');await expect(dialog.getByRole('alert')).not.toContainText('Fixture missing');
 await expect(dialog.getByRole('button',{name:'Gửi mã OTP qua Circle',exact:true})).toBeEnabled();
 expect(f.counts.challenge).toBe(0);expect(f.counts.sign).toBe(0);expect(f.errors).toEqual([]);await untouched(page);
});
