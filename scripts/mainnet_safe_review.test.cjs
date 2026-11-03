'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),assert=require('node:assert/strict');
const {ethers}=require('../backend/node_modules/ethers'),esbuild=require('../backend/node_modules/esbuild');
const {chromium}=require('../frontend/node_modules/@playwright/test');
const {createReviewServer}=require('./serve_mainnet_safe_review.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.cache/mainnet-safe-page-tests',crypto.randomUUID());fs.mkdirSync(output,{recursive:true});
const addr=()=>ethers.Wallet.createRandom().address,data='0x12345678';
const base={scope:'SAFE_CREATION_ONLY',budgetApproved:true,from:addr(),factory:addr(),owners:[addr(),addr()],threshold:2,predictedSafeAddress:addr(),dataHash:ethers.keccak256(data),sourceFingerprint:'a'.repeat(64),maximumGasCostNative:'20000000000000000',maximumGasCostUsdc:'0.02'};
const txHash=ethers.id('simulated-safe-creation-not-broadcast');
const results=[];
async function run(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function setup(browser,{authorized=false,mode='normal',patch={},hub=false}={}){
 const packet={...base,...(hub?{scope:'PRODUCTION_HUB_V2_DEPLOYMENT',maximumGasCostNative:'250000000000000000',maximumGasCostUsdc:'0.25',nonce:'0x1',expectedContractAddress:ethers.getCreateAddress({from:base.from,nonce:1}),securityAuthority:addr(),constructorArguments:[]}:{}),signingAuthorized:authorized,broadcastAuthorized:authorized},attemptDirectory=path.join(output,crypto.randomUUID());if(hub)packet.constructorArguments=[addr(),addr(),addr(),packet.securityAuthority];
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'mainnet-safe-page/client.mjs')],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',nodePaths:[path.join(root,'backend/node_modules')],define:{__SAFE_REVIEW_PACKET__:JSON.stringify(packet)}});
 const files={'/':{bytes:fs.readFileSync(path.join(__dirname,hub?'mainnet-hub-page/index.html':'mainnet-safe-page/index.html')),type:'text/html'},'/client.js':{bytes:built.outputFiles[0].contents,type:'text/javascript'},'/style.css':{bytes:fs.readFileSync(path.join(__dirname,'mainnet-safe-page/style.css')),type:'text/css'}};
 const quoteLoader=async()=>{const now=Date.now();return {report:{schemaVersion:1,sourceFingerprint:packet.sourceFingerprint,signingAuthorized:authorized,broadcastAuthorized:authorized,budgetApproved:true,predictedSafeAddress:packet.predictedSafeAddress,dataHash:packet.dataHash,owners:packet.owners,threshold:2,...(hub?{contract:'GroupDealHubV2',expectedContractAddress:packet.expectedContractAddress,deploymentDataHash:packet.dataHash,constructor:{owner:packet.from,arguments:packet.constructorArguments},securityAuthority:{address:packet.securityAuthority,safeVerified:true}}:{}),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),unsignedTransaction:{type:'0x2',chainId:'0x13b2',from:packet.from,...(hub&&mode!=='creation-target'?{}:{to:packet.factory}),data,value:'0x0',nonce:hub?'0x1':'0x0',gas:mode==='over-budget'?'0x1c9c380':hub?'0x2625a0':'0x51e2b',maxFeePerGas:'0x98bca5a00',maxPriorityFeePerGas:'0x3b9aca00'},...patch}};};
 const server=createReviewServer({packet,files,quoteLoader,attemptDirectory});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width:1000,height:900}}),page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.exposeFunction('assertAttemptRecorded',()=>{assert.equal(JSON.parse(fs.readFileSync(path.join(attemptDirectory,'ATTEMPT.json'))).status,'ATTEMPTING');return true;});
 await page.addInitScript(({from,mode,txHash})=>{
  window.__calls=[];window.__handlers={};
  const switchMode=['okx-switch','missing-chain','reject-switch','switch-stuck'].includes(mode);
  function provider(name,initialChain){let accountReads=0,activeChain=initialChain,known=mode!=='missing-chain';return {isRabby:name==='Rabby',isOkxWallet:name==='OKX Wallet',on:(event,fn)=>{window.__handlers[event]=fn;},request:async input=>{
   window.__calls.push({...input,wallet:name});
   if(input.method==='eth_requestAccounts')return[from];
   if(input.method==='eth_accounts'){accountReads++;return[mode==='account-change'&&accountReads>1?'0x0000000000000000000000000000000000000011':from];}
   if(input.method==='eth_chainId')return activeChain;
   if(input.method==='wallet_switchEthereumChain'){if(mode==='reject-switch')throw {code:4001};if(!known)throw {code:4902};if(mode!=='switch-stuck'){activeChain='0x13b2';window.__handlers.chainChanged?.(activeChain);}return null;}
   if(input.method==='wallet_addEthereumChain'){known=true;return null;}
   if(input.method!=='eth_sendTransaction')throw Error('Unexpected wallet method');
   await window.assertAttemptRecorded();
   if(mode==='reject')throw {code:4001};if(mode==='unknown')throw Error('Unknown submission state');
   if(mode==='deferred')await new Promise(r=>{window.__resolveWallet=r;});return txHash;
  }};}
  window.ethereum=provider(switchMode?'OKX Wallet':'Rabby',mode==='wrong-chain'?'0x4cef52':switchMode||mode==='multi-wallet'?'0x1':'0x13b2');
  if(switchMode)window.okxwallet=window.ethereum;if(mode==='multi-wallet')window.okxwallet=provider('OKX Wallet','0x13b2');
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
  await run('OKX chain ID is visible; explicit switch to Arc reconnects without a signature or transaction',async()=>{
   const f=await setup(browser,{authorized:true,mode:'okx-switch'});try{
    await connect(f.page);assert((await f.page.locator('#network').textContent()).includes('OKX Wallet đang trả chain ID 1'));assert(await f.page.locator('#send').isDisabled());
    assert(!(await f.page.evaluate(()=>window.__calls)).some(c=>c.method==='wallet_switchEthereumChain'||c.method==='eth_requestAccounts'));
    await f.page.locator('#switch-network').click();await f.page.getByRole('status').filter({hasText:'Ví đã trả đúng Arc Mainnet 5042'}).waitFor();
    await connect(f.page);await f.page.locator('#consent').check();assert(await f.page.locator('#send').isEnabled());assert((await f.page.locator('#network').textContent()).includes('chain ID 5042'));
    const calls=await f.page.evaluate(()=>window.__calls);assert.deepEqual(calls.find(c=>c.method==='wallet_switchEthereumChain').params,[{chainId:'0x13b2'}]);assert(!calls.some(c=>c.method.includes('sign')||c.method==='eth_sendTransaction'));assert(!fs.existsSync(path.join(f.attemptDirectory,'ATTEMPT.json')));
   }finally{await f.close();}
  });
  await run('unknown chain adds only official Arc parameters, then explicitly switches and rechecks',async()=>{
   const f=await setup(browser,{authorized:true,mode:'missing-chain'});try{
    await f.page.locator('#switch-network').click();await f.page.getByRole('status').filter({hasText:'Ví đã trả đúng Arc Mainnet 5042'}).waitFor();
    const calls=await f.page.evaluate(()=>window.__calls),network=calls.filter(c=>c.method.startsWith('wallet_'));assert.deepEqual(network.map(c=>c.method),['wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain']);
    assert.deepEqual(network[1].params,[{chainId:'0x13b2',chainName:'Arc Mainnet',rpcUrls:['https://rpc.mainnet.arc.io'],nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},blockExplorerUrls:['https://explorer.arc.io']}]);assert(!calls.some(c=>c.method==='eth_requestAccounts'||c.method==='eth_sendTransaction'));assert(await f.page.locator('#send').isDisabled());
   }finally{await f.close();}
  });
  await run('rejected or ineffective network switch stays blocked without add/send or an attempt',async()=>{
   for(const mode of ['reject-switch','switch-stuck']){const f=await setup(browser,{authorized:true,mode});try{
    await f.page.locator('#switch-network').click();await f.page.getByRole('status').filter({hasText:mode==='reject-switch'?'Anh đã hủy':'Mạng của ví đang kết nối'}).waitFor();assert(await f.page.locator('#send').isDisabled());assert(!(await f.page.evaluate(()=>window.__calls)).some(c=>c.method==='wallet_addEthereumChain'||c.method==='eth_sendTransaction'));assert(!fs.existsSync(path.join(f.attemptDirectory,'ATTEMPT.json')));
   }finally{await f.close();}}
  });
  await run('two extensions keep separate accounts/chains; selecting OKX never switches Rabby',async()=>{
   const f=await setup(browser,{authorized:true,mode:'multi-wallet'});try{
    await f.page.getByRole('button',{name:'Rabby',exact:true}).click();await connect(f.page);assert((await f.page.locator('#network').textContent()).includes('Rabby đang trả chain ID 1'));assert(await f.page.locator('#send').isDisabled());
    await f.page.getByRole('button',{name:'OKX Wallet',exact:true}).click();await connect(f.page);assert((await f.page.locator('#network').textContent()).includes('OKX Wallet đang trả chain ID 5042'));await f.page.locator('#consent').check();assert(await f.page.locator('#send').isEnabled());assert(!(await f.page.evaluate(()=>window.__calls)).some(c=>c.method.startsWith('wallet_')||c.method==='eth_sendTransaction'));
   }finally{await f.close();}
  });
  await run('Hub V2 budget-only review shows four constructor roles and 0.25 cap but cannot request a transaction',async()=>{
   const f=await setup(browser,{hub:true});try{
    await connect(f.page);await f.page.locator('#consent').check();assert(await f.page.locator('#send').isDisabled());assert((await f.page.locator('#authority').textContent()).includes('0,25 USDC'));assert.equal(await f.page.locator('#signer').textContent(),f.packet.constructorArguments[1]);assert((await f.page.locator('#safe').textContent()).includes(f.packet.securityAuthority));assert(!(await f.page.evaluate(()=>window.__calls)).some(c=>c.method==='eth_sendTransaction'));assert(!fs.existsSync(path.join(f.attemptDirectory,'ATTEMPT.json')));
   }finally{await f.close();}
  });
  await run('authorized Hub fixture requests one zero-value contract creation with no recipient and pinned nonce',async()=>{
   const f=await setup(browser,{hub:true,authorized:true});try{
    await connect(f.page);await f.page.locator('#consent').check();await f.page.locator('#send').click();await f.page.getByRole('status').filter({hasText:'Chưa kết luận Hub V2 đã deploy'}).waitFor();const calls=await f.page.evaluate(()=>window.__calls.filter(c=>c.method==='eth_sendTransaction'));assert.equal(calls.length,1);assert.equal(calls[0].params[0].to,undefined);assert.equal(calls[0].params[0].value,'0x0');assert.equal(calls[0].params[0].nonce,'0x1');assert.equal(calls[0].params[0].data,data);assert.equal(JSON.parse(fs.readFileSync(path.join(f.attemptDirectory,'ATTEMPT.json'))).actualDeployment,false);
   }finally{await f.close();}
  });
  await run('Hub constructor, recipient, predicted address, Safe proof or over-budget changes block signing',async()=>{
   for(const change of [{patch:{constructor:{owner:base.from,arguments:[addr()]}}},{mode:'creation-target'},{patch:{expectedContractAddress:addr()}},{patch:{securityAuthority:{address:addr(),safeVerified:false}}},{mode:'over-budget'}]){const f=await setup(browser,{hub:true,authorized:true,...change});try{await connect(f.page);await f.page.locator('#consent').check();assert(await f.page.locator('#send').isDisabled());assert(!(await f.page.evaluate(()=>window.__calls)).some(c=>c.method==='eth_sendTransaction'));assert(!fs.existsSync(path.join(f.attemptDirectory,'ATTEMPT.json')));}finally{await f.close();}}
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
