import {installBridgeServerFixture} from './fixtures/bridgeServer';
import { expect, test, Page } from "@playwright/test";
import {ethers} from "ethers";
import {HUB_ABI} from "../src/contracts/hubAbi";
import {emptyCatalog} from "./fixtures/catalog";
import {installCheckoutWallet,chooseCheckoutWallet,type CheckoutRpcRequest} from "./fixtures/checkout-wallet";

// Explicit synthetic configuration; default browser profile delegates these cases
// to the configured checkout steps instead of replacing application modules.
test.skip(process.env.GROUPDEAL_REOWN_CONFIGURED_FIXTURE!=="1","Requires the configured injected-wallet checkout profile.");

const buyer = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
const hash = `0x${"2".repeat(64)}`;
const identity = `0x${"3".repeat(64)}`;
const termsHash = `0x${"4".repeat(64)}`;
const campaign = {
  id: "fixture", onchainCampaignId: 1, title: "Checkout fixture", category: "Software", metric: "UNITS_COUNT",
  tiers: [{ threshold: 0, price: "1000000" }], currentUnlockedTier: 0, status: "ACTIVE", termsHash,
  maxPerAccount: 10, inventoryLimit: 100, totalUnitsCommitted: 0, totalBuyerCount: 0, totalGrossCommitted: "0",
  endTime: Math.floor(Date.now() / 1000) + 3600, deliverySlaSeconds: 86400, earlyRebateEnabled: false,
  description: "Fixture only", thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
  platformFeeBps:0,deliveryMethod:"FILE_LINK",product:{vendor:"Fixture",requirements:[],supportPolicy:"Fixture support",license:{edition:"Fixture license",seatsPerUnit:1,usageScope:"PERSONAL",durationDays:null,activationWindowDays:30,regions:["Worldwide"],transferable:false,usageTerms:"Fixture personal license"}},rights:{status:"APPROVED",validUntil:Math.floor(Date.now()/1000)+90*86400},
};

async function fixture(page: Page, options: { funded?: boolean; indexerOffline?: boolean;walletReverted?:boolean;verifiedRevert?:boolean;partialProjection?:boolean;approveFirst?:boolean } = {}) {
  const state = { funded: options.funded ?? true, campaignOpen: true, authorizations: 0, indexedReads: 0,indexerOffline:options.indexerOffline??false,partialProjection:options.partialProjection??false,phase:"PREPARED",prepared:false,recoveries:0 };
  const deadline=Math.floor(Date.now()/1000)+900;
  const operation={id:"durable-buy-fixture",action:"BUY",resourceId:"fixture",chainId:5042002,hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",principal:buyer,calldata:new ethers.Interface(HUB_ABI).encodeFunctionData("commitToBuy",[1,identity,1,false,1,deadline,"0x1234"]),phase:"PREPARED",createdAt:Date.now(),updatedAt:Date.now(),expectedEventArgs:{campaignId:1,campaignIdentity:identity,buyerPrincipal:buyer,quantity:1},purchaseQuote:{blockNumber:125,blockHash:"0x"+"12".repeat(32),lockedUnitPrice:"1000000",commitmentAmount:"1000000",maxGrossAmount:"1000000",authorizationNonce:0,termsHash}};
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "fixture-session"));
  const hubAddress=operation.hubAddress,usdcAddress="0x3600000000000000000000000000000000000000",blockHash=operation.purchaseQuote.blockHash;
  const event=new ethers.Interface(HUB_ABI).encodeEventLog(new ethers.Interface(HUB_ABI).getEvent("CommitmentMade")!,[1,2,identity,buyer,1,1000000,1000000,false,0]);
  let submitted:any,approvalTransaction:any;const approvalHash='0x'+'5'.repeat(64),approveData=new ethers.Interface(['function approve(address,uint256)']).encodeFunctionData('approve',[hubAddress,1000000]);
  const rpc=(request:CheckoutRpcRequest):unknown=>{
    const params=request.params??[];
    if(request.method==="eth_chainId")return "0x4cef52";
    if(request.method==="eth_getBalance")return "0x"+(state.funded?10n**19n:0n).toString(16);
    if(request.method==="eth_gasPrice"||request.method==="eth_maxPriorityFeePerGas")return "0x3b9aca00";
    if(request.method==="eth_blockNumber")return "0x7d";
    if(request.method==="eth_getTransactionCount")return "0x0";
    if(request.method==="eth_getCode")return "0x60006000";
    if(request.method==="eth_call"){
      expect(params[0].to.toLowerCase()).toBe(usdcAddress.toLowerCase());
      expect(params[0].data.slice(0,10)).toBe("0xdd62ed3e");
      return ethers.zeroPadValue(ethers.toBeHex(options.approveFirst&&!approvalTransaction?0:1000000),32);
    }
    if(request.method==="eth_estimateGas"){
      if(params[0].to.toLowerCase()===usdcAddress.toLowerCase()){expect(options.approveFirst).toBe(true);expect(params[0].data).toBe(approveData);}else{expect(params[0].to.toLowerCase()).toBe(hubAddress.toLowerCase());expect(params[0].data).toBe(operation.calldata);}return "0x186a0";
    }
    if(request.method==="eth_sendTransaction"){
      expect(state.phase).toBe("AWAITING_SIGNATURE");
      expect(params[0].from.toLowerCase()).toBe(buyer);
      if(params[0].to.toLowerCase()===usdcAddress.toLowerCase()){expect(options.approveFirst).toBe(true);expect(params[0].data).toBe(approveData);approvalTransaction=params[0];return approvalHash;}
      expect(params[0].to.toLowerCase()).toBe(hubAddress.toLowerCase());
      expect(params[0].data).toBe(operation.calldata);
      submitted=params[0];return hash;
    }
    if(request.method==="eth_getTransactionByHash"){
      const approval=params[0]===approvalHash,record=approval?approvalTransaction:submitted;expect(params[0]).toBe(approval?approvalHash:hash);expect(record).toBeTruthy();
      return{hash:params[0],from:buyer,to:approval?usdcAddress:hubAddress,input:record.data,nonce:"0x0",gas:"0x186a0",gasPrice:"0x3b9aca00",value:"0x0",blockNumber:"0x7d",blockHash,transactionIndex:"0x0",chainId:"0x4cef52",type:"0x0",v:ethers.toBeHex(5042002*2+35),r:ethers.zeroPadValue("0x01",32),s:ethers.zeroPadValue("0x02",32)};
    }
    if(request.method==="eth_getTransactionReceipt"){
      const approval=params[0]===approvalHash;expect(params[0]).toBe(approval?approvalHash:hash);expect(approval?approvalTransaction:submitted).toBeTruthy();
      return{transactionHash:params[0],from:buyer,to:approval?usdcAddress:hubAddress,status:!approval&&options.walletReverted?"0x0":"0x1",blockNumber:"0x7d",blockHash,transactionIndex:"0x0",gasUsed:"0x186a0",cumulativeGasUsed:"0x186a0",effectiveGasPrice:"0x3b9aca00",type:"0x0",logs:approval||options.walletReverted?[]:[{address:hubAddress,...event,blockNumber:"0x7d",blockHash,transactionHash:hash,transactionIndex:"0x0",logIndex:"0x0",removed:false}]};
    }
    throw Error("Unsupported checkout fixture RPC: "+request.method);
  };
  const wallet=await installCheckoutWallet(page,buyer,rpc);
  await page.route("**/api/**",route=>route.fulfill({json:new URL(route.request().url()).pathname==="/api/v1/catalog"?emptyCatalog(route.request().url()):{notifications:[],unread:0,operations:[],pagination:{nextCursor:null}}}));
  await page.route("**/api/health",route=>route.fulfill({json:{chainId:5042002,hubAddress,usdcAddress}}));
  await page.route("**/api/auth/me", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: {
    id: "fixture-buyer", email: null, roles: ["buyer"], loginMethod: "EVM_WALLET", activeWallet: buyer,
  } }) }));
  await page.route("**/api/notifications", route => route.fulfill({ contentType: "application/json", body: '{"notifications":[],"unread":0}' }));
  await page.route("**/api/campaigns/fixture", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    campaign: { ...campaign, status: state.campaignOpen ? "ACTIVE" : "FINALIZED" }, seller: { displayName: "Fixture seller" },
  }) }));
  await page.route("**/api/orders/authorize", route => {
    expect(route.request().postDataJSON()).toMatchObject({requireEarlySlot:false,maxGrossAmount:"1000000"});expect(route.request().postDataJSON().idempotencyKey).toMatch(/^buy:/);state.authorizations++;state.prepared=true;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ buyerWallet: buyer, campaignId: "1", campaignIdentity: identity,
      maxQuantity: 1, deadline, termsHash, signature: "0x1234",quote:{blockNumber:125,blockHash:"0x"+"12".repeat(32),lockedUnitPrice:"1000000",commitmentAmount:"1000000"},operation }) });
  });
  const currentOperation=()=>({...operation,phase:state.phase,...(["SUBMITTED","UNKNOWN","PROJECTED","REVERTED","RECEIPT_VERIFIED","SUPERSEDED"].includes(state.phase)?{txHash:hash}:{})});
  await page.route(/\/api\/transactions(?:\?.*)?$/,route=>route.fulfill({json:{operations:state.prepared?[currentOperation()]:[],pagination:{nextCursor:null}}}));
  await page.route("**/api/transactions/durable-buy-fixture",route=>route.fulfill({json:{operation:currentOperation()}}));
  await page.route("**/api/transactions/durable-buy-fixture/ready",route=>{state.phase="AWAITING_SIGNATURE";return route.fulfill({json:{operation:{...operation,phase:state.phase}}});});
  await page.route("**/api/transactions/durable-buy-fixture/submit",route=>{expect(route.request().postDataJSON().txHash).toBe(hash);state.phase="SUBMITTED";return route.fulfill({status:202,json:{operation:{...operation,phase:state.phase,txHash:hash}}});});
  await page.route("**/api/transactions/durable-buy-fixture/recover",route=>{expect(route.request().postDataJSON().txHash).toBe(hash);state.recoveries++;state.phase=options.walletReverted?(options.verifiedRevert?"REVERTED":"UNKNOWN"):state.indexerOffline?"UNKNOWN":state.partialProjection?"RECEIPT_VERIFIED":"PROJECTED";return route.fulfill(!["PROJECTED","RECEIPT_VERIFIED"].includes(state.phase)?{status:409,json:{error:state.phase==="REVERTED"?"TRANSACTION_REVERTED: Đã kiểm tra receipt trên chain":"Receipt đã gửi; indexer đang chờ phục hồi"}}:{json:{operation:{...operation,phase:state.phase,txHash:hash,...(state.phase==="PROJECTED"?{projectedOrderId:"2"}:{})}}});});
  await page.route("**/api/orders/buyer", route => {
    state.indexedReads++;
    if (state.indexerOffline) return route.fulfill({ status: 503, body: "offline" });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ orders: state.indexedReads === 1 ? [] : [
      { id: "2", onchainOrderId: 2, txHash: hash, buyerPrincipal: buyer, quantity: 1 },
    ] }) });
  });
  await installBridgeServerFixture(page,"fixture-buyer",buyer);
  await page.goto("/#campaign-fixture");
  await expect(page.getByRole("heading", { name: "Checkout fixture" })).toBeVisible();
  fixtureErrors.set(page,wallet.errors);
  return state;
}

const fixtureErrors=new WeakMap<Page,string[]>();
test.afterEach(async({page})=>{expect(fixtureErrors.get(page)??[]).toEqual([]);});

async function confirm(page: Page, source = "ARC_USDC",sign = true) {
  await page.getByRole("button", { name: /cam kết mua/i }).click();
  await page.getByLabel("Nguồn thanh toán").selectOption(source);
  await page.locator(".modal-content input[type=checkbox]").last().check();
  await page.locator(".modal-content > button.btn-primary").click();
  if(sign){
    await chooseCheckoutWallet(page);
    const fees=page.locator('dialog.external-fee-dialog');
    await expect(fees.locator('[data-external-fee=network]')).toBeVisible();
    await fees.getByRole('checkbox').check();
    await fees.getByRole('button',{name:'Tiếp tục trong ví',exact:true}).click();
  }
}

test("checkout confirms only after backend has indexed the matching order", async ({ page }) => {
  const state = await fixture(page);
  await confirm(page);
  await expect(page.getByRole("button", { name: "Xem đơn hàng của tôi" })).toBeVisible();
  expect(state.indexedReads).toBeGreaterThanOrEqual(2);
  expect(state.authorizations).toBe(1);
  expect(await page.evaluate(() => (window as any).buyWrites)).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("groupdeal_checkout:")))).toEqual([]);
});

test("checkout keeps a partial HTTP 200 receipt pending before and after reload",async({page})=>{
 const state=await fixture(page,{partialProjection:true});await confirm(page);await expect(page.getByText("Cần kiểm tra giao dịch cũ",{exact:true})).toBeVisible();expect(state.indexedReads).toBe(0);
 const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith("groupdeal_checkout:")||key.startsWith("groupdeal_operation:")||key.startsWith("groupdeal_buy_retry:"))));
 await page.reload();
 // The click only dispatches recovery; wait for its receipt before changing the fixture.
 const receipt=page.waitForResponse(response=>response.url().endsWith("/api/transactions/durable-buy-fixture/recover")&&response.request().method()==="POST");
 await page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"}).click();
 const ack=await receipt;expect(ack.status()).toBe(200);expect((await ack.json()).operation).toMatchObject({id:"durable-buy-fixture",phase:"RECEIPT_VERIFIED",txHash:hash});
  await expect(page.getByText("Chưa có projection đã xác minh cho giao dịch này; giữ checkpoint và intent để phục hồi.",{exact:true})).toBeVisible();
 await expect(page.getByText("Cần kiểm tra giao dịch cũ",{exact:true})).toBeVisible();expect(state.recoveries).toBe(2);expect(state.indexedReads).toBe(0);expect(state.authorizations).toBe(1);
 const after=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith("groupdeal_checkout:")||key.startsWith("groupdeal_operation:")||key.startsWith("groupdeal_buy_retry:"))));
 for(const [key,value] of Object.entries(before)){if(key.startsWith("groupdeal_checkout:")){const expected=JSON.parse(value),actual=JSON.parse(after[key]);delete expected.createdAt;delete actual.createdAt;expect(actual).toEqual(expected);}else expect(after[key]).toBe(value);}expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
 state.partialProjection=false;await page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"}).click();await expect(page.getByRole("button",{name:"Xem đơn hàng của tôi"})).toBeVisible();expect(state.authorizations).toBe(1);expect(await page.evaluate(()=>(window as any).buyWrites||0)).toBe(0);
});

test("checkout releases a chain-confirmed nonce-consumed intent without an order success",async({page})=>{
 const state=await fixture(page,{indexerOffline:true});await confirm(page);await expect(page.getByText("Cần kiểm tra giao dịch cũ",{exact:true})).toBeVisible();state.phase="SUPERSEDED";
 await page.reload();await page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"}).click();await expect(page.getByRole("heading",{name:"Giao dịch thất bại"})).toBeVisible();await expect(page.getByRole("button",{name:"Xem đơn hàng của tôi"})).toHaveCount(0);expect(state.recoveries).toBe(1);expect(state.authorizations).toBe(1);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith("groupdeal_checkout:")||key.startsWith("groupdeal_buy_retry:")))).toEqual([]);
});

test("indexer failure stays pending across reload and never buys again automatically", async ({ page }) => {
  const state = await fixture(page, { indexerOffline: true });
  await confirm(page);
  await expect(page.getByText("Cần kiểm tra giao dịch cũ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xem đơn hàng của tôi" })).not.toBeVisible();
  await page.reload();
  await expect(page.getByText("Cần kiểm tra giao dịch cũ", { exact: true })).toBeVisible();
  expect(state.authorizations).toBe(1);
  expect(await page.evaluate(() => (window as any).buyWrites || 0)).toBe(0);
});

test("a pending purchase restores from server after browser checkpoints are lost and recovers without a new authorization",async({page})=>{
  const state=await fixture(page,{indexerOffline:true});await confirm(page);await expect(page.getByText("Cần kiểm tra giao dịch cũ",{exact:true})).toBeVisible();
  await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith("groupdeal_checkout:")||key.startsWith("groupdeal_operation:")||key.startsWith("groupdeal_buy_retry:"))localStorage.removeItem(key);});
  state.indexerOffline=false;await page.reload();await expect(page.getByText("Cần kiểm tra giao dịch cũ",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"}).click();await expect(page.getByRole("button",{name:"Xem đơn hàng của tôi"})).toBeVisible();
  expect(state.authorizations).toBe(1);expect(state.recoveries).toBe(2);expect(await page.evaluate(()=>(window as any).buyWrites||0)).toBe(0);
});

test("a wallet revert report keeps the purchase locked until the server verifies its canonical receipt",async({page})=>{
  const state=await fixture(page,{walletReverted:true});await confirm(page);await expect(page.getByText("Cần kiểm tra giao dịch cũ",{exact:true})).toBeVisible();expect(state.phase).toBe("UNKNOWN");expect(state.indexedReads).toBe(0);
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("groupdeal_checkout:")).length)).toBe(1);await expect(page.getByRole("button",{name:"Xem đơn hàng của tôi"})).toHaveCount(0);
});
test("a server-verified revert releases checkout without rendering an order success",async({page})=>{
  const state=await fixture(page,{walletReverted:true,verifiedRevert:true});await confirm(page);await expect(page.getByRole("heading",{name:"Giao dịch thất bại"})).toBeVisible();expect(state.phase).toBe("REVERTED");expect(state.indexedReads).toBe(0);
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("groupdeal_checkout:")||k.startsWith("groupdeal_buy_retry:")||k.startsWith("groupdeal_operation:")))).toEqual([]);await expect(page.getByRole("button",{name:"Xem đơn hàng của tôi"})).toHaveCount(0);
});

test("funding precedes authorization and a closed campaign never submits a purchase", async ({ page }) => {
  const state = await fixture(page, { funded: false });
  await confirm(page, "OTHER_USDC",false);
  await expect(page.getByRole("button", { name: "Kiểm tra số dư và tiếp tục mua" })).toBeVisible();
  expect(state.authorizations).toBe(0);
  state.funded = true;
  state.campaignOpen = false;
  await page.getByRole("button", { name: "Kiểm tra số dư và tiếp tục mua" }).click();
  await expect(page.getByText(/Chiến dịch đã đóng; tiền nạp vẫn ở ví/)).toBeVisible();
  expect(state.authorizations).toBe(0);
  expect(await page.evaluate(() => (window as any).buyWrites || 0)).toBe(0);
});

test("another tab cannot queue a second purchase while the checkout lock is held", async ({ page, context }) => {
  await fixture(page);
  await page.evaluate((key) => {
    void navigator.locks.request(key, async () => { (window as any).lockHeld = true;
      await new Promise<void>(resolve => { (window as any).releaseLock = resolve; }); });
  }, `groupdeal_payment:v1:${buyer}`);
  await page.waitForFunction(() => (window as any).lockHeld);
  const second = await context.newPage();
  try {
    const state = await fixture(second);
    await confirm(second,"ARC_USDC",false);
    await expect(second.getByText(/Một tab khác đang xử lý giao dịch này/)).toBeVisible();
    expect(state.authorizations).toBe(0);
    await page.evaluate(() => (window as any).releaseLock());
    expect(await second.evaluate(() => (window as any).buyWrites || 0)).toBe(0);
  } finally { await second.close(); }
});

test('external checkout requires separate fresh consent for approval and commitment',async({page})=>{
 const state=await fixture(page,{approveFirst:true});
 await page.getByRole('button',{name:/cam kết mua/i}).click();await page.locator('.join-agreement input').check();await page.locator('.join-submit').click();await chooseCheckoutWallet(page);
 const fees=page.locator('dialog.external-fee-dialog');await expect(fees).toContainText('Cấp quyền USDC');await expect(fees.locator('[data-external-fee=goods]')).toHaveText('1.0 USDC');await expect(fees.getByRole('checkbox')).not.toBeChecked();expect(await page.evaluate(()=>(window as any).buyWrites)).toBe(0);
 await fees.getByRole('checkbox').check();await fees.getByRole('button',{name:'Tiếp tục trong ví',exact:true}).click();
 await expect(fees).toContainText('Cam kết mua');await expect(fees.locator('[data-external-fee=goods]')).toHaveText('1.0 USDC');await expect(fees.getByRole('checkbox')).not.toBeChecked();await expect(fees.getByRole('button',{name:'Tiếp tục trong ví',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as any).buyWrites)).toBe(1);
 await fees.getByRole('checkbox').check();await fees.getByRole('button',{name:'Tiếp tục trong ví',exact:true}).click();await expect(page.getByRole('button',{name:'Xem đơn hàng của tôi'})).toBeVisible();expect(await page.evaluate(()=>(window as any).buyWrites)).toBe(2);expect(state.authorizations).toBe(1);
});
