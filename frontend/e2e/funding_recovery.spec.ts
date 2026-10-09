import {test,expect,Page} from '@playwright/test';
import {installEmptyCatalog} from './fixtures/catalog';
import {installBridgeServerFixture,confirmSourceWallet} from './fixtures/bridgeServer';
import {bridgeFixture,operation,hashes} from '../test/fixtures/bridge';
import {ethers} from 'ethers';

async function prepare(page:Page,{steps=[],version=1,language='vi',delay=0,missingTransfer=false,approveReverted=false}:{steps?:unknown[];version?:number;language?:'vi'|'en';delay?:number;missingTransfer?:boolean;approveReverted?:boolean}={}){
 const f=bridgeFixture();if(approveReverted)f.records.approve.receipt.status='0x0';if(missingTransfer)f.records.mint.receipt.logs.pop();
 const raw=version===1?JSON.stringify({version:1,operation,result:steps.length?{state:'success',steps,errorMessage:'PRIVATE_DIAGNOSTIC_SENTINEL'}:null}):JSON.stringify({version:2,id:'11111111-1111-4111-8111-111111111111',createdAt:Date.now(),settled:true,operation,writes:[{id:'22222222-2222-4222-8222-222222222222',kind:'burn',chainId:11155111,state:'REQUESTED',dataHash:ethers.keccak256(f.calls.burn),nonce:'16',afterBlock:'10'}]});
 await page.addInitScript(({raw,version,language,recipient})=>{if(!localStorage.getItem('groupdeal_token'))localStorage.setItem('groupdeal_token','funding-local-fixture');if(!localStorage.getItem('groupdeal_lang'))localStorage.setItem('groupdeal_lang',language);const key='groupdeal_bridge:'+(version===2?'v2:':'')+recipient;if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{raw,version,language,recipient:operation.recipient});
 await installEmptyCatalog(page);await installBridgeServerFixture(page,'funding-local',operation.recipient);
 await page.route('**/api/health',route=>route.fulfill({json:{chainId:5042002,hubAddress:'0x1111111111111111111111111111111111111111',usdcAddress:'0x3600000000000000000000000000000000000000'}}));
 await page.route('**/api/auth/me',route=>route.fulfill({json:{user:{id:'funding-local',email:null,loginMethod:'EVM_WALLET',roles:['buyer'],activeWallet:operation.recipient}}}));
 await page.route('**/api/notifications**',route=>route.fulfill({json:{notifications:[],unread:0}}));
 const reads:string[]=[],writes:string[]=[],errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://iris-api-sandbox.circle.com/v2/messages/0?transactionHash=*',route=>{reads.push('CCTP_ATTESTATION');return route.fulfill({json:{messages:[{status:'complete',message:f.attested,eventNonce:'0x'+'7'.repeat(64)}]}});});
 await page.route(/https:\/\/(?:rpc(?:\.[a-z]+)?\.testnet\.arc\.io|ethereum-sepolia-rpc\.publicnode\.com)\/?$/,async route=>{
  const payload=route.request().postDataJSON(),chain=route.request().url().includes('publicnode')?'Ethereum_Sepolia':'Arc_Testnet';
  const reply=(request:any)=>{
   reads.push(request.method);if(!['eth_chainId','eth_getBalance','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber'].includes(request.method))writes.push(request.method);
   let result:any=null;
   if(request.method==='eth_chainId')result=chain==='Arc_Testnet'?'0x4cef52':'0xaa36a7';
   else if(request.method==='eth_getBalance')result='0x1bc16d674ec80000';
   else if(request.method==='eth_getBlockByNumber')result=Object.values(f.records).find((r:any)=>r.chain===chain&&r.block.number===request.params[0])?.block??null;
   else {const row=Object.values(f.records).find((r:any)=>r.chain===chain&&r.tx.hash===request.params[0]) as any;result=request.method==='eth_getTransactionReceipt'?row?.receipt??null:row?.tx??null;}
   return{jsonrpc:'2.0',id:request.id,result};
  };
  const result=Array.isArray(payload)?payload.map(reply):reply(payload);
  if(delay&&reads.includes('eth_getTransactionReceipt'))await new Promise(done=>setTimeout(done,delay));
  await route.fulfill({json:result});
 });
 await page.goto('/');await expect(page.getByRole('button',{name:language==='vi'?/nạp usdc/i:/fund usdc/i})).toBeVisible();
 await page.getByRole('button',{name:language==='vi'?/nạp usdc/i:/fund usdc/i}).click();
 await page.getByRole('button',{name:'CCTP Bridge',exact:true}).click();
 return{raw,reads,writes,errors,dialog:page.getByRole('dialog')};
}
test('legacy unknown result stays reserved across reload and has no manual reset',async({page})=>{
 const f=await prepare(page);await expect(page.getByRole('button',{name:'Lấy báo giá bridge USDC vào Arc'})).toBeDisabled();
 await f.dialog.click({position:{x:2,y:2}});await expect(f.dialog).toBeVisible();
 await expect(page.getByRole('button',{name:'Tôi đã kiểm tra: chưa gửi burn'})).toHaveCount(0);
 await page.getByRole('button',{name:'Kiểm tra trạng thái trên chain'}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Kết quả còn chưa rõ');
 await page.reload();await page.getByRole('button',{name:/nạp usdc/i}).click();await page.getByRole('button',{name:'CCTP Bridge',exact:true}).click();await expect(page.getByRole('button',{name:'Lấy báo giá bridge USDC vào Arc'})).toBeDisabled();
 expect(await page.evaluate(recipient=>localStorage.getItem('groupdeal_bridge:'+recipient),operation.recipient)).toBe(f.raw);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('only verified burn exposes mint recovery and keeps source terms pinned',async({page})=>{
 const f=await prepare(page,{steps:[{name:'burn',state:'success',txHash:hashes.burn}]});
 await page.getByRole('button',{name:'Kiểm tra trạng thái trên chain'}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Chain nguồn xác nhận burn');await expect(page.locator('[data-bridge-write-kind=burn]')).toHaveAttribute('data-bridge-receipt','confirmed');
 await expect(page.getByRole('button',{name:'Tiếp tục attestation / mint'})).toBeVisible();await expect(page.getByRole('button',{name:'Tiếp tục attestation / mint'})).toBeDisabled();await expect(page.getByLabel('Số USDC cần bridge',{exact:true})).toBeDisabled();
 await expect(page.getByText(/PRIVATE_DIAGNOSTIC_SENTINEL/)).toHaveCount(0);expect(f.reads).toContain('eth_getBlockByNumber');expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('SDK success cannot pass without the exact Arc USDC transfer event',async({page})=>{
 const f=await prepare(page,{steps:[{name:'burn',state:'success',txHash:hashes.burn},{name:'mint',state:'success',txHash:hashes.mint}],missingTransfer:true});
 await page.getByRole('button',{name:'Kiểm tra trạng thái trên chain'}).click();await expect(page.getByRole('alert')).toContainText('bằng chứng chain chưa khớp');await expect(page.locator('[data-bridge-receipt=confirmed]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Lấy báo giá bridge USDC vào Arc'})).toBeDisabled();await expect(page.getByText(/Receipt Arc xác nhận đã mint/)).toHaveCount(0);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('canonical receipts retain legacy history and require server admission before new signing',async({page})=>{
 const f=await prepare(page,{approveReverted:true,steps:[{name:'approve',state:'success',txHash:hashes.approve},{name:'burn',state:'success',txHash:hashes.burn},{name:'mint',state:'success',txHash:hashes.mint}]});
 await page.getByRole('button',{name:'Kiểm tra trạng thái trên chain'}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Receipt Arc xác nhận đã mint đúng USDC');await expect(page.locator('[data-bridge-receipt=confirmed]')).toHaveCount(2);await expect(page.locator('[data-bridge-write-kind=approve]')).toHaveAttribute('data-bridge-receipt','reverted');await expect(page.locator('[data-bridge-write-kind=approve]')).toContainText('receipt xác nhận giao dịch revert');
 await expect(page.getByRole('button',{name:'Lấy báo giá bridge USDC vào Arc'})).toBeDisabled();await expect(page.getByText('Hồ sơ trình duyệt cũ chưa được tiếp nhận trên server.',{exact:false})).toBeVisible();expect(await page.evaluate(recipient=>localStorage.getItem('groupdeal_bridge:'+recipient),operation.recipient)).toBe(f.raw);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('a wallet-history hash recovers unknown broadcast without a replacement burn',async({page})=>{
 const f=await prepare(page,{version:2});await page.getByLabel('Hash giao dịch cần đối chiếu',{exact:true}).fill(hashes.burn);await page.getByRole('button',{name:'Đối chiếu hash và phục hồi'}).click();
 await expect(page.getByRole('dialog').getByRole('status')).toContainText('Chain nguồn xác nhận burn');await page.reload();await page.getByRole('button',{name:/nạp usdc/i}).click();await page.getByRole('button',{name:'CCTP Bridge',exact:true}).click();
 await expect(page.getByRole('button',{name:'Lấy báo giá bridge USDC vào Arc'})).toBeDisabled();await page.getByRole('button',{name:'Kiểm tra trạng thái trên chain'}).click();await expect(page.getByRole('button',{name:'Tiếp tục attestation / mint'})).toBeVisible();await expect(page.getByRole('button',{name:'Tiếp tục attestation / mint'})).toBeDisabled();
 const record=await page.evaluate(recipient=>JSON.parse(localStorage.getItem('groupdeal_bridge:v2:'+recipient)!),operation.recipient);expect(record.writes).toHaveLength(1);expect(record.writes[0].hash).toBe(hashes.burn);expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
test('closing and reopening cannot display a late result from the earlier modal generation',async({page})=>{
 const f=await prepare(page,{steps:[{name:'burn',state:'success',txHash:hashes.burn},{name:'mint',state:'success',txHash:hashes.mint}],delay:800});
 await page.getByRole('button',{name:'Kiểm tra trạng thái trên chain'}).click();await expect.poll(()=>f.reads.includes('eth_getTransactionReceipt')).toBe(true);
 await page.getByRole('button',{name:'Đóng nạp USDC'}).click();await page.getByRole('button',{name:/nạp usdc/i}).click();await page.getByRole('button',{name:'CCTP Bridge',exact:true}).click();
 await expect(page.getByRole('button',{name:'Kiểm tra trạng thái trên chain'})).toBeEnabled({timeout:8000});await expect(page.getByText(/Receipt Arc xác nhận đã mint/)).toHaveCount(0);await expect(page.getByRole('button',{name:'Lấy báo giá bridge USDC vào Arc'})).toBeDisabled();expect(f.writes).toEqual([]);expect(f.errors).toEqual([]);
});
for(const language of ['vi','en'] as const)test('funding dialog keyboard, responsive and '+language,async({page},info)=>{
 const f=await prepare(page,{language});const close=f.dialog.getByRole('button',{name:language==='vi'?'Đóng nạp USDC':'Close funding'});
 for(const width of [320,360,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});await expect.poll(async()=>f.dialog.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.height<=innerHeight+1&&node.scrollWidth<=node.clientWidth+1;})).toBe(true);
  await page.screenshot({path:info.outputPath('funding-'+language+'-'+width+'.png')});
  if(width===320||width===1440){await f.dialog.evaluate(node=>node.scrollTop=node.scrollHeight);await page.screenshot({path:info.outputPath('funding-recovery-'+language+'-'+width+'.png')});await f.dialog.evaluate(node=>node.scrollTop=0);}
 }
 await close.focus();await page.keyboard.press('Shift+Tab');await expect(f.dialog.getByRole('button',{name:language==='vi'?'Đối chiếu hash và phục hồi':'Verify hash and recover'})).not.toBeFocused();
 // Last enabled focus target is the chain-status button because an empty hash
 // cannot be submitted. Native dialog and explicit boundary retain focus.
 await expect(f.dialog.getByLabel(language==='vi'?'Hash giao dịch cần đối chiếu':'Transaction hash to verify',{exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Escape');await expect(f.dialog).toHaveCount(0);await expect(page.getByRole('button',{name:language==='vi'?/nạp usdc/i:/fund usdc/i})).toBeFocused();expect(f.errors).toEqual([]);expect(f.writes).toEqual([]);
});
