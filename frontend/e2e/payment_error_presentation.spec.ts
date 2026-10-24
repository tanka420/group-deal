import {test,expect,type Page} from '@playwright/test';
import {ethers} from 'ethers';
import {masterFixture} from './fixtures/master-deal.mjs';
import {emptyCatalog} from './fixtures/catalog';
import {paymentError} from '../src/services/paymentSafety';
import {operationRequest} from '../src/services/transactionOperations';
import {signerHoldMessage} from '../src/services/signerHoldMessage';
import {readFileSync} from 'node:fs';
import {checkoutKey,PurchaseBudgetError} from '../src/services/checkout';
import {checkpointKey,type TransactionOperation} from '../src/services/transactionOperations';
import {UiError,uiMessage,messageText} from '../src/utils/uiMessage';
import {HUB_ABI} from '../src/contracts/hubAbi';

test('checkout preserves a trusted bilingual recovery message',()=>{
  const error=new UiError(uiMessage('Giữ intent và checkpoint để phục hồi.','Keep the intent and checkpoint for recovery.'));
  expect(messageText(paymentError(error),'vi')).toBe('Giữ intent và checkpoint để phục hồi.');
  expect(messageText(paymentError(error),'en')).toBe('Keep the intent and checkpoint for recovery.');
  expect(messageText(paymentError({cause:error}),'vi')).toBe('Giữ intent và checkpoint để phục hồi.');
});

test('wallet rejection is bilingual and keeps security warnings and uncertain payment review',()=>{
  for(const error of [{cause:{code:4001}},{error:{code:'ACTION_REJECTED'}},{name:'UserRejectedRequestError'},'Request Signature: User denied request signature.']){
    const vi=messageText(paymentError(error),'vi'),en=messageText(paymentError(error),'en');
    expect(vi).toContain('Ví đã từ chối');expect(en).toContain('wallet rejected');
    expect(vi).toContain('Không tắt cảnh báo bảo mật');expect(en).toContain('Do not disable security warnings');
    expect(vi).toContain('kiểm tra');expect(en).toContain('check');
  }
});

test('checkout budget codes keep actionable messages in both languages',()=>{
  for(const [code,vi,en] of [
    ['PURCHASE_BUDGET_INSUFFICIENT','Không đủ USDC','insufficient'],
    ['PURCHASE_BUDGET_STALE','hết hạn','expired'],
    ['PURCHASE_BUDGET_INVALID','ngân sách USDC hợp lệ','valid USDC budget'],
    ['PURCHASE_BUDGET_UNAVAILABLE','ngân sách USDC hợp lệ','valid USDC budget'],
  ] as const){
    const error=new PurchaseBudgetError(code);
    expect(messageText(paymentError(error),'vi')).toContain(vi);expect(messageText(paymentError(error),'en')).toContain(en);
  }
});

test('unknown diagnostics and connection failures use bounded bilingual guidance',()=>{
  const timeout=Object.assign(new Error('PRIVATE_CHECKOUT_DIAGNOSTIC'),{name:'TimeoutError'});
  expect(messageText(paymentError(timeout),'vi')).toContain('hết thời gian');
  expect(messageText(paymentError(timeout),'en')).toContain('timed out');
  const cycle:any={message:'PRIVATE_CHECKOUT_DIAGNOSTIC'};cycle.cause=cycle;
  for(const error of [cycle,new Error('PRIVATE_CHECKOUT_DIAGNOSTIC'),null,{error:{message:'PRIVATE_CHECKOUT_DIAGNOSTIC'}},new TypeError('Failed to fetch')]){
    for(const language of ['vi','en'] as const){const text=messageText(paymentError(error),language);expect(text).not.toContain('PRIVATE_CHECKOUT_DIAGNOSTIC');expect(text.length).toBeLessThan(500);expect(text).toContain(language==='vi'?'Kiểm tra':'Check');}
  }
});

const principal='0x73307bdd39d875f98857ffce0fed1cdc62f50b6d',hub='0x1111111111111111111111111111111111111111',hash='0x'+'3'.repeat(64),owner='checkout-error-owner';
async function fixture(page:Page,language:'vi'|'en',rawDiagnostic=false,holdCode?:string){
  const data=masterFixture(),identity=ethers.id('checkout-error-campaign');
  const operation:TransactionOperation={id:'checkout-error-operation',action:'BUY',resourceId:'master',chainId:5042002,hubAddress:hub,principal,calldata:new ethers.Interface(HUB_ABI).encodeFunctionData('commitToBuy',[1,identity,1,false,3,Math.floor(Date.now()/1000)+1800,'0x1234']),phase:'SUBMITTED',txHash:hash,createdAt:1,updatedAt:1,expectedEventArgs:{},purchaseQuote:{blockNumber:125,blockHash:ethers.id('checkout-error-block'),lockedUnitPrice:'105000000',commitmentAmount:'105000000',maxGrossAmount:'105000000',authorizationNonce:0,termsHash:data.campaign.termsHash}};
  const intent={operationId:operation.id,quantity:1,requireEarlySlot:false,maxGrossUsdc:'105000000',campaignIdentity:identity,onchainCampaignId:1,phase:'BUY_BROADCAST',txHash:hash,createdAt:1};
  const keys=[checkoutKey(principal,'master'),checkpointKey(owner,operation.id),'groupdeal_buy_retry:'+owner+':master','groupdeal_bridge_v2:checkout-error-retained'];
  const state={posts:[] as string[],errors:[] as string[]};
  await page.addInitScript(({language,keys,intent,operation,hash,owner})=>{
    localStorage.setItem('groupdeal_lang',language);localStorage.setItem('groupdeal_token','checkout-error-fixture-session');
    localStorage.setItem(keys[0],JSON.stringify(intent));localStorage.setItem(keys[1],JSON.stringify({id:operation.id,txHash:hash,phase:'SUBMITTED'}));
    localStorage.setItem(keys[2],'retained-checkout-retry');localStorage.setItem(keys[3],'retained-bridge-request');
  },{language,keys,intent,operation,hash,owner});
  page.on('pageerror',error=>state.errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?$/,route=>{
    const body=route.request().postDataJSON(),items=Array.isArray(body)?body:[body];
    items.forEach((r:any)=>expect(['eth_chainId','eth_getBalance','eth_gasPrice','eth_call','eth_getCode']).toContain(r.method));
    const replies=items.map((r:any)=>({jsonrpc:'2.0',id:r.id,result:r.method==='eth_chainId'?'0x4cef52':r.method==='eth_getBalance'?'0x'+(300n*10n**18n).toString(16):r.method==='eth_gasPrice'?'0x4a817c800':'0x'+'0'.repeat(64)}));
    return route.fulfill({json:Array.isArray(body)?replies:replies[0]});
  });
  await page.route('**/api/**',route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()!=='GET'){
      state.posts.push(url.pathname);
      if(url.pathname===`/api/transactions/${operation.id}/recover`)return route.fulfill(holdCode?{status:409,json:{error:'PRIVATE_CHECKOUT_DIAGNOSTIC',code:holdCode}}:rawDiagnostic?{status:503,json:{error:'PRIVATE_CHECKOUT_DIAGNOSTIC'}}:{json:{operation}});
      return route.fulfill({status:409,json:{error:'LOCAL_FIXTURE: financial signing disabled'}});
    }
    if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:owner,email:'checkout@example.test',roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:principal}}});
    if(url.pathname==='/api/health')return route.fulfill({json:{chainId:5042002,hubAddress:hub,usdcAddress:'0x3600000000000000000000000000000000000000'}});
    if(url.pathname==='/api/v1/catalog')return route.fulfill({json:emptyCatalog(req.url())});
    if(url.pathname==='/api/campaigns/master')return route.fulfill({json:data});
    if(url.pathname===`/api/transactions/${operation.id}`)return route.fulfill({json:{operation}});
    return route.fulfill({json:{operations:[operation],orders:[],notifications:[],unread:0,pagination:{nextCursor:null}}});
  });
  await page.goto('/#campaign-master');
  const dialog=page.locator('dialog.transaction-dialog');
  await expect(page.getByRole('heading',{name:language==='vi'?'Cần kiểm tra giao dịch cũ':'Previous transaction needs review',exact:true})).toBeVisible();
  const before=await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),keys);
  const retained=async()=>{expect(state.errors).toEqual([]);expect(state.posts).toEqual([`/api/transactions/${operation.id}/recover`]);expect(await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),keys)).toEqual(before);};
  return {dialog,state,retained,keys};
}

for(const language of ['vi','en'] as const)test(`checkout ${language} preserves an unprojected purchase and readable recovery guidance`,async({page},info)=>{
  const f=await fixture(page,language);
  const check=f.dialog.getByRole('button',{name:language==='vi'?'Kiểm tra lại giao dịch / đơn cũ':'Check previous transaction / order',exact:true});
  await check.focus();await page.keyboard.press('Enter');
  await expect(f.dialog.locator('.notice-warning')).toHaveText(language==='vi'?'Chưa có projection đã xác minh cho giao dịch này; giữ checkpoint và intent để phục hồi.':'This transaction has no verified projection yet. Keep its checkpoint and intent for recovery.');
  for(const width of [320,375,430,768,1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    expect(await f.dialog.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})).toBe(true);
    if(width===375||width===1440)await page.screenshot({path:info.outputPath(`checkout-error-${language}-${width}.png`)});
  }
  await f.retained();
});

test('checkout hides provider diagnostics and stored messages follow the selected language',async({page})=>{
  const f=await fixture(page,'vi',true);
  await f.dialog.getByRole('button',{name:'Kiểm tra lại giao dịch / đơn cũ',exact:true}).click();
  await expect(f.dialog.locator('.notice-warning')).toHaveText('Chưa xác nhận thanh toán. Kiểm tra trạng thái giao dịch và lịch sử ví trước khi thử lại.');
  await expect(f.dialog).not.toContainText('PRIVATE_CHECKOUT_DIAGNOSTIC');
  await f.dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await page.getByRole('button',{name:/Ngôn ngữ: Tiếng Việt/}).click();
  await page.locator('.deal-join-cta').click();
  const join=page.locator('dialog.join-dialog');await expect(join.locator('[data-budget=required]')).toBeVisible();await join.locator('.join-agreement input').check();await join.locator('.join-submit').click();
  await expect(f.dialog.locator('.notice-warning')).toHaveText('Payment is unconfirmed. Check the transaction status and wallet history before retrying.');
  await f.retained();
});

test('signer hold codes have bounded bilingual app copy and unknown diagnostics are hidden',()=>{
 const domain=readFileSync(new URL('../../backend/src/domain/signerReservation.ts',import.meta.url),'utf8'),rows=readFileSync(new URL('../../backend/src/db/rowPersistence.ts',import.meta.url),'utf8');
 const literals=[...domain.matchAll(/['"](SIGNER_[A-Z_]+)['"]/g),...rows.matchAll(/['"](SIGNER_[A-Z_]+)['"]/g)].map(m=>m[1]);
 const expiryStages=[...new Set([...domain.matchAll(/\bproofStage\s*=\s*['"]([A-Z_]+)['"]/g)].map(m=>m[1]))];expect(expiryStages.length).toBeGreaterThan(0);
 const codes=[...new Set(literals.flatMap(code=>code==='SIGNER_EXPIRY_'?expiryStages.map(stage=>'SIGNER_EXPIRY_'+stage+'_UNAVAILABLE'):[code]))];expect(codes.length).toBeGreaterThan(20);
 for(const code of codes){const message=signerHoldMessage(code);expect(message,code).toBeDefined();for(const language of ['vi','en'] as const){const text=messageText(message!,language);expect(text.length).toBeLessThan(500);expect(text).not.toContain(code);expect(text).not.toContain('PRIVATE_CHECKOUT_DIAGNOSTIC')}}
 expect(signerHoldMessage('SIGNER_EXPIRY_')).toBeUndefined();expect(signerHoldMessage('SIGNER_EXPIRY_PRIVATE_CHECKOUT_DIAGNOSTIC_UNAVAILABLE')).toBeUndefined(); expect(signerHoldMessage('SIGNER_UNKNOWN_PRIVATE_DIAGNOSTIC')).toBeUndefined();expect(signerHoldMessage({code:'SIGNER_RECEIPT_PENDING'})).toBeUndefined();expect(signerHoldMessage(null)).toBeUndefined();
 const nested={cause:{code:'SIGNER_RECEIPT_PENDING',message:'PRIVATE_CHECKOUT_DIAGNOSTIC'}};expect(messageText(paymentError(nested),'en')).toContain('earlier transaction');expect(messageText(paymentError({code:'SIGNER_RECEIPT_PENDING',cause:{code:4001}}),'en')).toContain('wallet rejected');
});
test('operation API preserves signer hold guidance without granting a signature phase',async()=>{
 const original=globalThis.fetch;globalThis.fetch=(async()=>new Response(JSON.stringify({code:'SIGNER_ORIGINAL_WITNESS_REQUIRED',error:'PRIVATE_CHECKOUT_DIAGNOSTIC'}),{status:409,headers:{'Content-Type':'application/json'}})) as typeof fetch;
 try{let error:unknown;try{await operationRequest('fixture-session','/api/transactions/fixture/ready',{})}catch(e){error=e}expect(error).toBeInstanceOf(UiError);expect(messageText(paymentError(error),'en')).toContain('original and replacement hashes');expect(messageText(paymentError(error),'en')).not.toContain('PRIVATE_CHECKOUT_DIAGNOSTIC');globalThis.fetch=(async()=>new Response(JSON.stringify({operation:{phase:'PREPARED'}}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;expect(await operationRequest('fixture-session','/api/transactions/fixture/ready',{})).toEqual({operation:{phase:'PREPARED'}})}finally{globalThis.fetch=original}
});
for(const language of ['vi','en'] as const)test('signer hold checkout '+language+' keeps transaction evidence and keyboard recovery',async({page},info)=>{
 const f=await fixture(page,language,false,'SIGNER_RECEIPT_PENDING'),check=f.dialog.getByRole('button',{name:language==='vi'?'Kiểm tra lại giao dịch / đơn cũ':'Check previous transaction / order',exact:true});await check.focus();await page.keyboard.press('Enter');await expect(f.dialog.locator('.notice-warning')).toHaveText(messageText(signerHoldMessage('SIGNER_RECEIPT_PENDING')!,language));await expect(f.dialog).not.toContainText('PRIVATE_CHECKOUT_DIAGNOSTIC');await expect(f.dialog).not.toContainText('SIGNER_RECEIPT_PENDING');for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});await expect(f.dialog).toBeVisible();await expect(f.dialog.locator('.notice-warning')).toBeVisible();await expect(f.dialog).toBeInViewport({ratio:0.99});await expect(f.dialog.locator('.notice-warning')).toBeInViewport({ratio:0.99});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));expect(await f.dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})).toBe(true);if(width===375||width===1440)await page.screenshot({animations:'disabled',path:info.outputPath('signer-hold-checkout-'+language+'-'+width+'.png')})}await f.retained();
});
