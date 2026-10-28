import {test,expect} from '@playwright/test';
import {emptyCatalog} from './fixtures/catalog';

test.skip(process.env.VITE_APP_ENV!=='arc-mainnet','Mainnet bundle fixture only');
test.beforeEach(async({page})=>{
 await page.route('https://**',route=>route.abort());
 await page.route('**/api/**',route=>route.fulfill({json:{notifications:[],unread:0}}));
 await page.route('**/api/health',route=>route.fulfill({json:{status:'OK',chainId:5042,protocolVersion:0,hubAddress:'',usdcAddress:'0x3600000000000000000000000000000000000000'}}));
 await page.route('**/api/v1/catalog?**',route=>route.fulfill({json:{...emptyCatalog(route.request().url()),chainId:5042}}));
});

test('Mainnet labels and direct receive do not offer faucet or Sepolia bridge',async({page})=>{
 await page.goto('/');await expect(page.locator('footer')).toContainText('Arc Mainnet');await expect(page.locator('footer')).toContainText('USDC thật');
 await page.getByRole('button',{name:'Nạp USDC',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Kết nối ví để nhận USDC trên Arc Mainnet.');
 await expect(dialog.getByText(/Sepolia|Faucet/)).toHaveCount(0);
});

test('Testnet sessions stay in their existing namespace',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('groupdeal_token','testnet-session-fixture'));
 let authCalls=0;await page.route('**/api/auth/me',route=>{authCalls++;return route.fulfill({status:401,json:{error:'AUTH_SESSION_INACTIVE'}})});
 await page.goto('/');await expect(page.locator('footer')).toContainText('Arc Mainnet');
 await expect(page.getByRole('button',{name:'Đăng nhập',exact:true}).first()).toBeVisible();
 expect(authCalls).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('groupdeal_token'))).toBe('testnet-session-fixture');
});

test('Mainnet RPC refuses Testnet replies and mutation methods',async({page})=>{
 let writes=0,reads=0;
 await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.mainnet\.arc\.io\/?/,async route=>{
  const requests=route.request().postDataJSON();reads++;for(const r of requests)if(r.method.startsWith('eth_send'))writes++;
  await route.fulfill({json:requests.map((r:any)=>({jsonrpc:'2.0',id:r.id,result:r.method==='eth_chainId'?'0x4cef52':'0x1'}))});
 });
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const rpc=await import('/src/services/arcRpc.ts');let wrong=false,mutation=false;
  try{await rpc.readArcRpc('eth_blockNumber');}catch{wrong=true;}
  try{await rpc.readArcRpc('eth_sendRawTransaction',['0x00']);}catch{mutation=true;}
  return{chainId:rpc.ARC_CHAIN_ID,endpoints:rpc.ARC_RPC_ENDPOINTS,wrong,mutation};
 });
 expect(result.chainId).toBe(5042);expect(result.endpoints.every((u:string)=>u.includes('.mainnet.arc.io'))).toBe(true);expect(result.wrong&&result.mutation).toBe(true);expect(reads).toBe(4);expect(writes).toBe(0);
});

test('Fallback rejects the Testnet wallet without opening a signing request',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).requests=[];(window as any).ethereum={request:async({method}:any)=>{(window as any).requests.push(method);if(method==='eth_requestAccounts')return['0x1111111111111111111111111111111111111111'];if(method==='eth_chainId')return'0x4cef52';throw Error('Unexpected fixture method');}};
 });
 await page.goto('/fallback.html');await expect(page.getByRole('heading',{level:1})).toContainText('Arc Mainnet');await page.locator('#connect').click();
 await expect(page.locator('#error')).toContainText('Arc Mainnet (5042)');
 expect(await page.evaluate(()=>(window as any).requests.some((m:string)=>/send|sign/i.test(m)))).toBe(false);
});

test('Undeployed Mainnet fallback stops before RPC or a wallet transaction',async({page})=>{
 await page.addInitScript(()=>{(window as any).ethereum={request:async({method}:any)=>method==='eth_requestAccounts'?['0x1111111111111111111111111111111111111111']:method==='eth_chainId'?'0x13b2':Promise.reject(Error('No transaction authorized'))};});
 await page.goto('/fallback.html');await page.locator('#connect').click();await page.locator('#campaign').fill('1');await page.locator('#order').fill('1');await page.locator('#action').selectOption('BUYER_CLAIM');
 await page.locator('#prepare button[type=submit]').click();await expect(page.locator('#error')).toBeVisible();await expect(page.locator('#sign')).not.toBeVisible();
});

test('Undeployed Mainnet transfer cannot open the wallet',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const module=await import('/src/services/walletFlow.ts');let walletCalls=0,message='';
  try{await module.sendExternalWalletStep({} as any,{} as any,{request:async()=>{walletCalls++;}} as any,()=>{},()=>{});}catch(e){message=String(e);}
  return{walletCalls,message};
 });
 expect(result.walletCalls).toBe(0);expect(result.message).toContain('MAINNET_DEPLOYMENT_NOT_CONFIGURED');
});
