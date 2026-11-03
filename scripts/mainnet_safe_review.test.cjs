'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),assert=require('node:assert/strict');
const {ethers}=require('../backend/node_modules/ethers'),esbuild=require('../backend/node_modules/esbuild');
const {chromium}=require('../frontend/node_modules/@playwright/test');
const {createReviewServer}=require('./serve_mainnet_safe_review.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.cache/mainnet-safe-page-tests',crypto.randomUUID());fs.mkdirSync(output,{recursive:true});
const addr=()=>ethers.Wallet.createRandom().address,data='0x12345678';
const base={from:addr(),factory:addr(),owners:[addr(),addr()],threshold:2,predictedSafeAddress:addr(),dataHash:ethers.keccak256(data),sourceFingerprint:'a'.repeat(64),maximumGasCostNative:'20000000000000000'};
const txHash=ethers.id('simulated-safe-creation-not-broadcast');
const results=[];
async function run(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function setup(browser,{authorized=false,mode='normal',patch={}}={}){
 const packet={...base,signingAuthorized:authorized,broadcastAuthorized:authorized},attemptDirectory=path.join(output,crypto.randomUUID());
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'mainnet-safe-page/client.mjs')],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',nodePaths:[path.join(root,'backend/node_modules')],define:{__SAFE_REVIEW_PACKET__:JSON.stringify(packet)}});
 const files={'/':{bytes:fs.readFileSync(path.join(__dirname,'mainnet-safe-page/index.html')),type:'text/html'},'/client.js':{bytes:built.outputFiles[0].contents,type:'text/javascript'},'/style.css':{bytes:fs.readFileSync(path.join(__dirname,'mainnet-safe-page/style.css')),type:'text/css'}};
 const quoteLoader=async()=>{const now=Date.now();return {report:{schemaVersion:1,sourceFingerprint:packet.sourceFingerprint,signingAuthorized:authorized,broadcastAuthorized:authorized,budgetApproved:true,predictedSafeAddress:packet.predictedSafeAddress,dataHash:packet.dataHash,owners:packet.owners,threshold:2,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),unsignedTransaction:{type:'0x2',chainId:'0x13b2',from:packet.from,to:packet.factory,data,value:'0x0',nonce:'0x0',gas:mode==='over-budget'?'0x1c9c380':'0x51e2b',maxFeePerGas:'0x98bca5a00',maxPriorityFeePerGas:'0x3b9aca00'},...patch}};};
 const server=createReviewServer({packet,files,quoteLoader,attemptDirectory});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width:1000,height:900}}),page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.exposeFunction('assertAttemptRecorded',()=>{assert.equal(JSON.parse(fs.readFileSync(path.join(attemptDirectory,'ATTEMPT.json'))).status,'ATTEMPTING');return true;});
 await page.addInitScript(({from,mode,txHash})=>{
  window.__calls=[];window.__handlers={};let accountReads=0;
  window.ethereum={isRabby:true,on:(event,fn)=>{window.__handlers[event]=fn;},request:async input=>{
   window.__calls.push(input);
   if(input.method==='eth_requestAccounts')return[from];
   if(input.method==='eth_accounts'){accountReads++;return[mode==='account-change'&&accountReads>1?'0x0000000000000000000000000000000000000011':from];}
   if(input.method==='eth_chainId')return mode==='wrong-chain'?'0x4cef52':'0x13b2';
   if(input.method!=='eth_sendTransaction')throw Error('Unexpected wallet method');
   await window.assertAttemptRecorded();
   if(mode==='reject')throw {code:4001};if(mode==='unknown')throw Error('Unknown submission state');
   if(mode==='deferred')await new Promise(r=>{window.__resolveWallet=r;});return txHash;
  }};
 },{from:packet.from,mode,txHash});
 await page.goto(origin);await page.waitForFunction(()=>!document.getElementById('quote-summary').textContent.includes('Đang đọc'));
 return {packet,page,origin,attemptDirectory,close:async()=>{await context.close();await new Promise(r=>server.close(r));}};
}
async function connect(page){await page.locator('#connect').click();await page.waitForFunction(()=>!document.getElementById('connect').disabled);}
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  await run('budget-only page never requests signing/send, even after wallet connection and consent',async()=>{
   const f=await setup(browser);try{
    assert.deepEqual(await f.page.evaluate(()=>window.__calls),[]);await connect(f.page);await f.page.locator('#consent').check();assert(await f.page.locator('#send').isDisabled());
    assert((await f.page.locator('#authority').textContent()).includes('chưa được duyệt'));
    assert(!(await f.page.evaluate(()=>window.__calls)).some(c=>c.method.includes('send')||c.method.includes('sign')));
    const quote=await (await fetch(f.origin+'/quote')).json();const response=await fetch(f.origin+'/attempt',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify({quoteId:quote.quoteId})});assert.equal(response.status,403);assert(!fs.existsSync(path.join(f.attemptDirectory,'ATTEMPT.json')));
    await f.page.setViewportSize({width:390,height:844});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await f.page.screenshot({path:path.join(output,'REVIEW_MOBILE.png'),fullPage:true});
   }finally{await f.close();}
  });
  await run('Host/origin and method checks reject cross-site requests and arbitrary RPC paths',async()=>{
   const f=await setup(browser);try{
    const response=await fetch(f.origin);assert.equal(response.headers.get('x-frame-options'),'DENY');assert(response.headers.get('content-security-policy').includes("connect-src 'self'"));assert.equal(response.headers.get('access-control-allow-origin'),null);
    assert.equal((await fetch(f.origin+'/quote',{headers:{Origin:'https://untrusted.invalid'}})).status,403);
    assert.equal((await fetch(f.origin+'/rpc',{method:'POST',body:'{}'})).status,405);
    const badHostStatus=await new Promise((resolve,reject)=>{http.get(f.origin+'/quote',{headers:{Host:'untrusted.invalid'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});assert.equal(badHostStatus,403);
   }finally{await f.close();}
  });
  await run('authorized fixture writes a durable attempt before exactly one explicit wallet send',async()=>{
   const f=await setup(browser,{authorized:true,mode:'deferred'});try{
    await connect(f.page);await f.page.locator('#consent').check();await f.page.locator('#send').click();await f.page.waitForFunction(()=>typeof window.__resolveWallet==='function');
    assert(await f.page.locator('#send').isDisabled());assert(await f.page.locator('#refresh').isDisabled());await f.page.evaluate(()=>document.getElementById('send').click());
    const calls=await f.page.evaluate(()=>window.__calls.filter(c=>c.method==='eth_sendTransaction'));assert.equal(calls.length,1);assert.equal(calls[0].params[0].data,data);assert.equal(calls[0].params[0].from,packetFrom(f));assert.equal(calls[0].params[0].value,'0x0');assert.equal(calls[0].params[0].chainId,'0x13b2');
    await f.page.evaluate(()=>window.__resolveWallet());await f.page.getByRole('status').filter({hasText:'Chưa kết luận Safe đã deploy'}).waitFor();
    const journal=JSON.parse(fs.readFileSync(path.join(f.attemptDirectory,'ATTEMPT.json')));assert.equal(journal.status,'HASH_RETURNED');assert.equal(journal.hash,txHash);assert.equal(journal.actualDeployment,false);
   }finally{await f.close();}
  });
  await run('wrong chain/account and an altered or over-budget quote stop before a wallet send',async()=>{
   for(const options of [{authorized:true,mode:'wrong-chain'},{authorized:true,mode:'account-change'},{authorized:true,mode:'over-budget'},{authorized:true,patch:{dataHash:ethers.id('wrong')}}]){
    const f=await setup(browser,options);try{await connect(f.page);await f.page.locator('#consent').check();if(await f.page.locator('#send').isEnabled()){await f.page.locator('#send').click();await f.page.getByRole('status').filter({hasText:'Chọn đúng ví'}).waitFor();}assert(!(await f.page.evaluate(()=>window.__calls)).some(c=>c.method==='eth_sendTransaction'));assert(!fs.existsSync(path.join(f.attemptDirectory,'ATTEMPT.json')));}finally{await f.close();}
   }
  });
  await run('wallet rejection or unknown outcome remains locked across reload, with no automatic send retry',async()=>{
   for(const mode of ['reject','unknown']){const f=await setup(browser,{authorized:true,mode});try{
    await connect(f.page);await f.page.locator('#consent').check();await f.page.locator('#send').click();await f.page.waitForFunction(mode=>document.getElementById('refresh').disabled&&document.getElementById('status').textContent.includes(mode==='reject'?'đã hủy':'chưa hoàn tất'),mode);
    assert.equal((await f.page.evaluate(()=>window.__calls.filter(c=>c.method==='eth_sendTransaction'))).length,1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.attemptDirectory,'ATTEMPT.json'))).status,mode==='reject'?'REJECTED':'UNKNOWN');await f.page.reload();await f.page.getByRole('status').filter({hasText:'Đã có một lần'}).waitFor();assert(await f.page.locator('#connect').isDisabled());assert(await f.page.locator('#send').isDisabled());
   }finally{await f.close();}}
  });
 }finally{await browser.close();}
 const record={result:'PASS',cases:results,publicRpcMocked:true,actualUserWalletAccessed:false,actualTransactionSubmitted:false,fullCi:false,outputDirectory:output};fs.writeFileSync(path.join(output,'CHECKS.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
}
function packetFrom(f){return f.packet.from;}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
