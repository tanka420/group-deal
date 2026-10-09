import {test,expect,Page} from "@playwright/test";
import {ethers} from "ethers";
import {readFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync(new URL("../../shared/manifests/arc-testnet.json",import.meta.url),"utf8"));
import {HUB_ABI} from "../src/contracts/hubAbi";

const iface=new ethers.Interface(HUB_ABI),buyer="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",other="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",hash=ethers.id("fallback-receipt"),block=manifest.contracts.GroupDealHub.deploymentBlock+10,tag=ethers.toQuantity(block),blockHash=ethers.id("fallback-block"),code=JSON.parse(readFileSync(new URL("./fixtures/arc-runtime-public.json",import.meta.url),"utf8")).bytecode,reason="Private fallback issue",reasonHash=ethers.keccak256(ethers.toUtf8Bytes(reason));
async function fixture(page:Page,options:{language?:'vi'|'en';badCode?:boolean;wrongPrincipal?:boolean;pending?:boolean;reverted?:boolean;wrongReceipt?:boolean;switchAtReady?:boolean;receiptFault?:"NONCANONICAL_NONCE"|"MISSING_LOG_INDEX"|"WRONG_CLAIM_TYPE"|"NONCANONICAL_BLOCK";action?:"DISPUTE"|"BREACH"|"BUYER_CLAIM"|"SELLER_CLAIM"}={}){
  let pending=!!options.pending,apiCalls=0,simulations=0;const values={price:1_000_000_000n,balance:100n*10n**18n,invalidGas:false,diagnostic:false};await page.addInitScript(language=>localStorage.setItem('groupdeal_lang',language),options.language||'vi');
  const action=options.action||"DISPUTE",caller=action==="SELLER_CLAIM"?other:buyer,fn={DISPUTE:"openDispute",BREACH:"claimDeliveryBreach",BUYER_CLAIM:"claimBuyerFunds",SELLER_CLAIM:"claimSellerProceeds"}[action];
  const calldata=iface.encodeFunctionData(fn,action.includes("CLAIM")?[42,[77]]:action==="DISPUTE"?[42,77,reasonHash]:[42,77]);
  const event=action.includes("CLAIM")?iface.encodeEventLog(iface.getEvent("FundsClaimed")!,[42,caller,action==="BUYER_CLAIM"?90000000:10000000,options.receiptFault==="WRONG_CLAIM_TYPE"?2:action==="BUYER_CLAIM"?0:2]):action==="BREACH"?iface.encodeEventLog(iface.getEvent("DeliveryBreached")!,[42,77,90000000]):iface.encodeEventLog(iface.getEvent("OrderDisputed")!,[42,77,buyer,reasonHash]);
  await page.route("**/api/**",r=>{apiCalls++;return r.abort();});
  await page.route("**/src/App.tsx*",r=>r.abort());await page.route("**/src/main.tsx*",r=>r.abort());
  await page.addInitScript(({buyer,hash})=>{(window as any).ethereum={request:async({method,params}:any)=>{
    if(method==="eth_chainId")return "0x4cef52";if(["eth_accounts","eth_requestAccounts"].includes(method))return [localStorage.getItem("fixture-fallback-switched-wallet")||buyer];
    if(method==="eth_sendTransaction"){localStorage.setItem("fixture-fallback-broadcasts",String(Number(localStorage.getItem("fixture-fallback-broadcasts")||0)+1));(window as any).fixtureFallbackTx=params[0];return hash;}
    throw new Error("Unexpected wallet method");
  }};},{buyer:caller,hash});
  await page.route("https://rpc*.testnet.arc.io/**",async r=>{
    const requests=r.request().postDataJSON(),items=await Promise.all(requests.map(async(request:any)=>{
      let result:any;if(request.method==='eth_estimateGas'&&values.diagnostic)return{jsonrpc:'2.0',id:request.id,error:{code:3,message:'PRIVATE_RPC_DIAGNOSTIC fixture-signature=hidden'}};
      switch(request.method){
        case "eth_chainId":result="0x4cef52";break;
        case "eth_blockNumber":result=tag;break;
        case "eth_getBlockByNumber":result={number:tag,hash:blockHash,timestamp:ethers.toQuantity(Math.floor(Date.now()/1000))};break;
        case "eth_getCode":result=options.badCode?"0x6002":code;break;
        case "eth_getBalance":result=ethers.toQuantity(values.balance);break;
        case "eth_estimateGas":result=values.invalidGas?"0x00":"0x5208";break;
        case "eth_gasPrice":result=ethers.toQuantity(values.price);break;
        case "eth_call":{
          expect(request.params[1]).toBe(tag);const parsed=iface.parseTransaction({data:request.params[0].data})!;
          if(parsed.name==="getOrderDetails"){const record={orderId:77,campaignId:42,buyerPrincipal:options.wrongPrincipal?other:buyer,quantity:1,lockedUnitPrice:100000000,committedGross:100000000,deliveryStatus:action==="BREACH"?0:action.includes("CLAIM")?4:1,rebateAllocated:10000000,buyerRefundAllocated:action.includes("CLAIM")?80000000:0,sellerAllocated:action.includes("CLAIM")?10000000:0,deliveryTimestamp:Math.floor(Date.now()/1000)-60};const tuple=iface.getFunction(parsed.name)!.outputs[0].components!.map(c=>(record as any)[c.name]??(c.type==="address"?ethers.ZeroAddress:c.type==="bytes32"?ethers.ZeroHash:c.type==="bool"?false:0));result=iface.encodeFunctionResult(parsed.name,[tuple]);}
          else if(parsed.name==="campaignTerms"){const record={sellerPayoutWallet:other,termsHash:ethers.id("fixture-terms")};result=iface.encodeFunctionResult(parsed.name,iface.getFunction(parsed.name)!.outputs.map(c=>(record as any)[c.name]??(c.type==="address"?ethers.ZeroAddress:c.type==="bytes32"?ethers.ZeroHash:c.type==="bool"?false:0)));}
          else if(parsed.name==="openDispute"){expect(String(parsed.args[0])).toBe("42");expect(String(parsed.args[1])).toBe("77");expect(parsed.args[2]).toBe(reasonHash);expect(request.params[0].from.toLowerCase()).toBe(buyer.toLowerCase());result="0x";simulations++;if(options.switchAtReady&&simulations===2)await page.evaluate(address=>localStorage.setItem("fixture-fallback-switched-wallet",address),other);}
          else if(parsed.name==="claimBuyerFunds"||parsed.name==="claimSellerProceeds"){expect(String(parsed.args[0])).toBe("42");expect(parsed.args[1].map(String)).toEqual(["77"]);expect(request.params[0].from.toLowerCase()).toBe(caller.toLowerCase());result=iface.encodeFunctionResult(parsed.name,[parsed.name==="claimBuyerFunds"?90000000:10000000]);}
          else if(parsed.name==="claimDeliveryBreach"){expect(parsed.args.map(String)).toEqual(["42","77"]);expect(request.params[0].from.toLowerCase()).toBe(buyer.toLowerCase());result="0x";}
          else throw new Error("Unexpected fallback call "+parsed.name);
          break;
        }
        case "eth_getTransactionByHash":result=pending?null:{hash,from:options.wrongReceipt?other:caller,to:manifest.contracts.GroupDealHub.address,chainId:"0x4cef52",nonce:options.receiptFault==="NONCANONICAL_NONCE"?"0x01":"0x1",value:"0x0",input:calldata,blockNumber:tag,blockHash:options.receiptFault==="NONCANONICAL_BLOCK"?ethers.id("another-fallback-block"):blockHash,transactionIndex:"0x0"};break;
        case "eth_getTransactionReceipt":result=pending?null:{transactionHash:hash,from:caller,to:manifest.contracts.GroupDealHub.address,blockNumber:tag,blockHash:options.receiptFault==="NONCANONICAL_BLOCK"?ethers.id("another-fallback-block"):blockHash,transactionIndex:"0x0",status:options.reverted?"0x0":"0x1",logs:options.reverted?[]:[{...event,address:manifest.contracts.GroupDealHub.address,transactionHash:hash,blockNumber:tag,blockHash,transactionIndex:"0x0",logIndex:options.receiptFault==="MISSING_LOG_INDEX"?undefined:"0x0",removed:false}]};break;
        default:throw new Error("Unexpected RPC method "+request.method);
      }return {jsonrpc:"2.0",id:request.id,result};
    }));await r.fulfill({json:items});
  });
  await page.goto(process.env.GROUPDEAL_FALLBACK_BASE_URL?process.env.GROUPDEAL_FALLBACK_BASE_URL+"/fallback.html":"/fallback.html");await expect(page.getByRole("heading",{name:options.language==='en'?"Direct actions on Arc Testnet":"Thao tác trực tiếp trên Arc Testnet"})).toBeVisible();
  await page.getByLabel(options.language==='en'?"Action":"Thao tác",{exact:true}).selectOption(action);
  await page.getByLabel(options.language==='en'?"Onchain campaign ID":"ID campaign trên chain").fill("42");await page.getByLabel(options.language==='en'?"Onchain order ID":"ID order trên chain").fill("77");
  return {unpend:()=>{pending=false;},apiCalls:()=>apiCalls,values};
}
async function prepare(page:Page){await page.getByRole("button",{name:"Kết nối ví external"}).click();await page.getByLabel("Lý do dispute",{exact:false}).fill(reason);await page.getByRole("button",{name:"Kiểm tra chain, quyền và gas"}).click();}

async function signIntent(page:Page){await page.getByRole('checkbox',{name:'Tôi đã xem phí và dự phòng gas cho đúng intent này.',exact:true}).check();await page.getByRole('button',{name:'Ký intent đã kiểm tra',exact:true}).click();}

test("independent external fallback sends with the real module, blocked app/API and no private reason in browser storage",async({page},testInfo)=>{
  const state=await fixture(page);await prepare(page);await expect(page.getByRole("heading",{name:"Intent và phục hồi"})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBeNull();
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(reason);
  for(const width of [320,375,430,768,1024,1280,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  await page.screenshot({path:testInfo.outputPath("fallback-independent-local.png"),fullPage:true});
  await signIntent(page);await expect(page.getByRole("status")).toContainText("chưa báo hoàn tất chỉ từ hash");await page.getByRole("button",{name:"Kiểm tra receipt",exact:true}).click();await expect(page.getByRole("status")).toContainText("Đã xác minh receipt và event trên chain");
  expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBe("1");expect(state.apiCalls()).toBe(0);
});
test("pending fallback survives reload, retains the same hash and never signs another transaction",async({page})=>{
  const state=await fixture(page,{pending:true});await prepare(page);await expect(page.getByRole("heading",{name:"Intent và phục hồi"})).toBeVisible();await signIntent(page);await page.getByRole("button",{name:"Kiểm tra receipt",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Receipt chưa có");
  await page.reload();await expect(page.getByRole("button",{name:"Ký intent đã kiểm tra"})).toBeDisabled();await expect(page.getByRole("button",{name:"Chuẩn bị thao tác khác"})).toBeDisabled();await expect(page.getByLabel("Hash đã gửi từ ví",{exact:true})).toHaveValue(hash);state.unpend();await page.getByRole("button",{name:"Kiểm tra receipt",exact:true}).click();await expect(page.getByRole("status")).toContainText("Đã xác minh receipt");expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBe("1");
});
for(const [name,options,message] of [["wrong Hub bytecode",{badCode:true},"Bytecode Hub không khớp"],["wrong buyer principal",{wrongPrincipal:true},"Kết nối đúng principal"]] as const)test(`fallback fails closed before signing for ${name}`,async({page})=>{
  await fixture(page,options);await prepare(page);await expect(page.getByRole("alert")).toContainText(message);expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBeNull();
});
test("already-sent fallback imports an exact public transaction without a new wallet call and validates canonical revert",async({page})=>{
  const state=await fixture(page,{reverted:true});await page.getByLabel("Hash đã gửi từ app/ví",{exact:false}).fill(hash);await page.getByRole("button",{name:"Tra giao dịch đã gửi"}).click();await expect(page.getByRole("status")).toContainText("Đã tìm thấy đúng transaction/caller");await page.getByRole("button",{name:"Kiểm tra receipt",exact:true}).click();await expect(page.getByRole("status")).toContainText("exact receipt revert");expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBeNull();expect(state.apiCalls()).toBe(0);
});
test("fallback cannot declare success for another sender's receipt",async({page})=>{
  await fixture(page,{wrongReceipt:true});await prepare(page);await expect(page.getByRole("heading",{name:"Intent và phục hồi"})).toBeVisible();await signIntent(page);await page.getByRole("button",{name:"Kiểm tra receipt",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Receipt không khớp exact intent");await expect(page.getByRole("button",{name:"Chuẩn bị thao tác khác"})).toBeDisabled();
});

for(const action of ["BREACH","BUYER_CLAIM","SELLER_CLAIM"] as const)test(`independent fallback verifies exact ${action} action and recipient under API outage`,async({page})=>{
  const state=await fixture(page,{action});await prepare(page);await expect(page.getByRole("heading",{name:"Intent và phục hồi"})).toBeVisible();
  await signIntent(page);await page.getByRole("button",{name:"Kiểm tra receipt",exact:true}).click();await expect(page.getByRole("status")).toContainText("Đã xác minh receipt và event trên chain");expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBe("1");expect(state.apiCalls()).toBe(0);
});
test("fallback rechecks the active wallet after asynchronous chain reads before reserving a signature",async({page})=>{
  await fixture(page,{switchAtReady:true});await prepare(page);await expect(page.getByRole("heading",{name:"Intent và phục hồi"})).toBeVisible();await signIntent(page);await expect(page.getByRole("alert")).toContainText("Kết nối đúng principal của intent");expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBeNull();
});

for(const [receiptFault,message] of [["NONCANONICAL_NONCE","canonical quantity"],["MISSING_LOG_INDEX","Log receipt thiếu exact identity"],["WRONG_CLAIM_TYPE","Claim event không khớp"],["NONCANONICAL_BLOCK","Receipt chưa thuộc block canonical"]] as const)test(`fallback rejects ${receiptFault} evidence and keeps the submitted intent`,async({page})=>{
  await fixture(page,{action:"BUYER_CLAIM",receiptFault});await prepare(page);await expect(page.getByRole("heading",{name:"Intent và phục hồi"})).toBeVisible();await signIntent(page);await page.getByRole("button",{name:"Kiểm tra receipt",exact:true}).click();await expect(page.getByRole("alert")).toContainText(message);await expect(page.getByRole("button",{name:"Chuẩn bị thao tác khác"})).toBeDisabled();expect(await page.evaluate(()=>localStorage.getItem("fixture-fallback-broadcasts"))).toBe("1");
});

test('fallback fee consent is absent initially and cannot survive refresh or reload',async({page})=>{
 const state=await fixture(page);await prepare(page);await expect(page.locator('#fee-network')).toHaveText('0.000021 USDC');await expect(page.locator('#fee-reserve')).toHaveText('0.0000252 USDC');await expect(page.locator('#sign')).toBeDisabled();await page.locator('#fee-consent').check();await expect(page.locator('#sign')).toBeEnabled();await page.locator('#refresh-fee').click();await expect(page.getByRole('status').last()).toContainText('Cần đồng ý mới');await expect(page.locator('#fee-consent')).not.toBeChecked();await page.locator('#fee-consent').check();await page.reload();await expect(page.locator('#fee-consent')).not.toBeChecked();await expect(page.locator('#sign')).toBeDisabled();expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBeNull();expect(state.apiCalls()).toBe(0);
});
test('expired fallback fees need refresh and fresh consent',async({page})=>{
 await page.clock.install();await fixture(page);await prepare(page);await expect(page.locator('#fee-reserve')).toBeVisible();await page.locator('#fee-consent').check();await page.clock.fastForward(60_001);await expect(page.locator('#fee-notice')).toContainText('đã hết hạn');await expect(page.locator('#fee-consent')).not.toBeChecked();await expect(page.locator('#sign')).toBeDisabled();await page.locator('#refresh-fee').click();await expect(page.getByRole('status').last()).toContainText('Cần đồng ý mới');await expect(page.locator('#fee-consent')).not.toBeChecked();expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBeNull();
});
test('a higher fallback gas reserve is shown for new consent before any signature',async({page})=>{
 const state=await fixture(page);await prepare(page);await expect(page.locator('#fee-reserve')).toBeVisible();await page.locator('#fee-consent').check();state.values.price*=2n;await page.locator('#sign').click();await expect(page.getByRole('status').last()).toContainText('Phí, khoản rút hoặc thời hạn quote đã đổi');await expect(page.locator('#fee-reserve')).toHaveText('0.0000504 USDC');await expect(page.locator('#fee-consent')).not.toBeChecked();expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBeNull();await signIntent(page);await expect(page.locator('#status')).toContainText('Đã giữ hash');expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBe('1');
});
test('depleted native USDC after fallback consent keeps an unsigned intent',async({page})=>{
 const state=await fixture(page);await prepare(page);await expect(page.locator('#fee-reserve')).toBeVisible();await page.locator('#fee-consent').check();state.values.balance=0n;await page.locator('#sign').click();await expect(page.getByRole('alert')).toContainText('Chưa đủ USDC native');await expect(page.locator('#fee-consent')).not.toBeChecked();expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBeNull();expect(await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('groupdeal_fallback:'))!;return JSON.parse(localStorage.getItem(key)!).phase;})).toBe('PREPARED');
});
test('legacy prepared fallback checkpoint requests a new fee read without losing its intent',async({page})=>{
 await fixture(page);await prepare(page);await expect(page.locator('#fee-reserve')).toBeVisible();const calldata=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('groupdeal_fallback:'))!;const saved=JSON.parse(localStorage.getItem(key)!);delete saved.intent.feeReview;localStorage.setItem(key,JSON.stringify(saved));return saved.intent.calldata;});await page.reload();await expect(page.locator('#fee-notice')).toContainText('Chưa có phí hợp lệ');await expect(page.locator('#sign')).toBeDisabled();await page.locator('#refresh-fee').click();await expect(page.locator('#fee-network')).toHaveText('0.000021 USDC');await expect(page.locator('#fee-consent')).not.toBeChecked();expect(await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('groupdeal_fallback:'))!;return JSON.parse(localStorage.getItem(key)!).intent.calldata;})).toBe(calldata);expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBeNull();
});
for(const language of ['vi','en'] as const)test('static fallback '+language+' fee widths and keyboard signing',async({page},info)=>{
 const state=await fixture(page,{language});await page.locator('#connect').click();await page.locator('#reason').fill(reason);await page.locator('#prepare button').click();await expect(page.locator('#fee-network')).toHaveText('0.000021 USDC');await expect(page.locator('html')).toHaveAttribute('lang',language);
 for(const width of [320,375,430,768,1024,1280,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);for(const id of ['sign','refresh-fee'])expect(await page.locator('#'+id).evaluate(el=>el.getBoundingClientRect().height>=44)).toBe(true);await page.screenshot({path:info.outputPath('fallback-fee-'+language+'-'+width+'.png'),fullPage:true});}
 await page.locator('#fee-consent').focus();await page.keyboard.press('Space');await expect(page.locator('#fee-consent')).toBeChecked();await page.keyboard.press('Tab');await page.keyboard.press('Tab');await expect(page.locator('#sign')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#status')).toContainText(language==='en'?'Hash retained':'Đã giữ hash');await page.locator('#recover').click();await expect(page.locator('#status')).toContainText(language==='en'?'Receipt and event verified':'Đã xác minh receipt');expect(state.apiCalls()).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBe('1');
});
test('static English fallback retains a pending hash across reload and never signs again',async({page})=>{
 const state=await fixture(page,{language:'en',pending:true});await page.locator('#connect').click();await page.locator('#reason').fill(reason);await page.locator('#prepare button').click();await expect(page.locator('#fee-network')).toBeVisible();await page.locator('#fee-consent').check();await page.locator('#sign').click();await page.locator('#recover').click();await expect(page.getByRole('alert')).toContainText('receipt is pending');await page.reload();await expect(page.locator('#sign')).toBeDisabled();await expect(page.locator('#hash')).toHaveValue(hash);state.unpend();await page.locator('#recover').click();await expect(page.locator('#status')).toContainText('Receipt and event verified');expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBe('1');expect(state.apiCalls()).toBe(0);
});
for(const failure of ['noncanonical','diagnostic'] as const)test('fallback rejects '+failure+' gas responses without showing raw provider details',async({page})=>{
 const state=await fixture(page);if(failure==='noncanonical')state.values.invalidGas=true;else state.values.diagnostic=true;await prepare(page);await expect(page.getByRole('alert')).toContainText(failure==='noncanonical'?'Ngân sách gas chưa hợp lệ':'Chưa hoàn tất thao tác');await expect(page.getByRole('alert')).not.toContainText('PRIVATE_RPC_DIAGNOSTIC');await expect(page.locator('#sign')).toBeDisabled();expect(await page.evaluate(()=>localStorage.getItem('fixture-fallback-broadcasts'))).toBeNull();
});
