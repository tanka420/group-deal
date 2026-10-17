import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalogHub=JSON.parse(readFileSync(new URL("../../shared/contracts.json",import.meta.url),"utf8")).contracts.GroupDealHub.address;

const buyer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const claimHash="0x"+"ab".repeat(32);
async function ordersFixture(page: Page, verified = true, unknownReceipt=false) {
  let started=false,phase="PREPARED",recoveries=0;
  const operation={id:"op_claim_fixture",action:"BUYER_CLAIM",resourceId:"stable",chainId:5042002,hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",principal:buyer,calldata:"0xfixture",expectedEventArgs:{campaignId:1,claimType:0},financialQuote:{kind:"READ_ONLY_SIMULATION",blockNumber:125,blockHash:claimHash,amountBaseUnits:"89000000"},createdAt:0,updatedAt:0};
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "isolated-browser-fixture"));
  await page.route("https://fonts.googleapis.com/**", r=>r.fulfill({contentType:"text/css",body:""}));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*", r=>r.fulfill({contentType:"application/javascript",body:"export class W3SSdk {updateConfigs(){}}; export default {W3SSdk};"}));
  await page.route("**/src/context/Web3Context.tsx*", r=>r.fulfill({contentType:"application/javascript",body:`
    export const Web3Provider=({children})=>children;
    export const useWeb3=()=>({account:"${buyer}",usdcBalance:"10",balanceError:null,walletMode:"EXTERNAL_REOWN",externalSignerReady:true,
      preflightPreparedOperation:async()=>{},broadcastPreparedOperation:async(operation,onBroadcast)=>{window.fixtureClaims={campaignId:1,orderIds:[1]};localStorage.setItem("fixture-claim-broadcasts",String(Number(localStorage.getItem("fixture-claim-broadcasts")||0)+1));await onBroadcast("${claimHash}");return {txHash:"${claimHash}"}},refreshBalance:async()=>{}});`}));
  await page.route("**/api/auth/me", r=>r.fulfill({contentType:"application/json",body:JSON.stringify({user:{id:"buyer",email:null,roles:["buyer"],activeWallet:buyer,loginMethod:"EVM_WALLET"}})}));
  await page.route("**/api/notifications", r=>r.fulfill({contentType:"application/json",body:'{"notifications":[],"unread":0}'}));
  await page.route("**/api/transactions",r=>r.fulfill({json:{operations:started?[{...operation,phase,...(phase==="PREPARED"?{}:{txHash:claimHash})}]:[]}}));
  await page.route("**/api/transactions/claims/prepare",r=>{expect(r.request().postDataJSON()).toMatchObject({action:"BUYER_CLAIM",campaignId:"stable",orderIds:["1"]});started=true;return r.fulfill({json:{operation:{...operation,phase}}});});
  await page.route("**/api/transactions/op_claim_fixture/ready",r=>{phase="AWAITING_SIGNATURE";return r.fulfill({json:{operation:{...operation,phase}}});});
  await page.route("**/api/transactions/op_claim_fixture/submit",r=>{expect(r.request().postDataJSON().txHash).toBe(claimHash);phase="SUBMITTED";return r.fulfill({status:202,json:{operation:{...operation,phase,txHash:claimHash}}});});
  await page.route("**/api/transactions/op_claim_fixture/recover",r=>{recoveries++;phase=unknownReceipt&&recoveries===1?"UNKNOWN":"PROJECTED";return r.fulfill(phase==="UNKNOWN"?{status:409,json:{error:"Claim receipt chưa xác minh"}}:{json:{operation:{...operation,phase,txHash:claimHash}}});});
  await page.route("**/api/orders/buyer", r=>r.fulfill({contentType:"application/json",body:JSON.stringify({orders:[{
    id:"1",onchainOrderId:1,onchainCampaignId:1,campaignId:"stable",campaignTitle:"Cumulative claim fixture",buyerPrincipal:buyer,
    quantity:1,lockedUnitPrice:"105000000",committedGross:"105000000",rebateAllocated:"16000000",buyerRefundAllocated:"89000000",sellerAllocated:"0",
    buyerClaimed:true,buyerClaimedAmount:verified ? "16000000":undefined,buyerClaimable:verified ? "89000000":null,
    accountingVerified:verified,deliveryStatus:"BREACHED_REFUNDED",sellerPayoutWallet:buyer,
  }]})}));
  await page.goto("/orders/1");
  await expect(page.getByText("Cumulative claim fixture")).toBeVisible();
  return {operation};
}

test("buyer can claim the later refund after an earlier rebate claim", async ({page})=>{
  await ordersFixture(page);
  const withdraw = page.getByRole("button",{name:"Rút $89 USDC"});
  await expect(withdraw).toBeVisible();
  await expect(page.getByText("Vi phạm SLA • Đã phân bổ quyền hoàn tiền")).toBeVisible();
  await withdraw.click();
  await expect(page.getByRole("heading",{name:"Kiểm tra khoản rút trên Arc"})).toBeVisible();
  expect(await page.evaluate(()=> (window as any).fixtureClaims)).toBeUndefined();
  await page.getByRole("button",{name:"Ký rút tiền đã kiểm tra"}).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await page.evaluate(()=> (window as any).fixtureClaims)).toEqual({campaignId:1,orderIds:[1]});
});

test("claim dialog retains intent and checkpoint on a successful HTTP partial projection",async({page})=>{
 const {operation}=await ordersFixture(page);let recoveries=0;await page.route("**/api/transactions/op_claim_fixture/recover",r=>{recoveries++;expect(r.request().postDataJSON()).toEqual({txHash:claimHash});return r.fulfill({json:{operation:{...operation,phase:"RECEIPT_VERIFIED",txHash:claimHash}}});});
 await page.getByRole("button",{name:"Rút $89 USDC"}).click();await page.getByRole("button",{name:"Ký rút tiền đã kiểm tra"}).click();
 await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByRole("dialog").getByRole("alert")).toContainText("projection");
 expect(await page.evaluate(()=>localStorage.getItem("groupdeal_operation:buyer:op_claim_fixture"))).not.toBeNull();
 expect(await page.evaluate(()=>localStorage.getItem("groupdeal_claim:buyer:BUYER_CLAIM:stable:1"))).not.toBeNull();expect(await page.evaluate(()=>localStorage.getItem("fixture-claim-broadcasts"))).toBe("1");expect(recoveries).toBe(3);
});

test("buyer claim with unknown receipt survives reload and recovers the same broadcast without another signature",async({page})=>{
  await ordersFixture(page,true,true);await page.getByRole("button",{name:"Rút $89 USDC"}).click();await page.getByRole("button",{name:"Ký rút tiền đã kiểm tra"}).click();
  await expect(page.getByRole("alert").filter({hasText:"Chưa xác minh được receipt; giữ intent để phục hồi."})).toBeVisible();
  for(const width of [320,375,430,768,1024,1280,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  await page.reload();await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true}).click();
  await expect(page.getByRole("heading",{name:/Rút rebate và tiền hoàn.*Đã ghép dữ liệu/})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem("fixture-claim-broadcasts"))).toBe("1");
});

test("legacy claimed boolean without amount cannot imply a zero or withdrawable balance", async({page})=>{
  await ordersFixture(page,false);
  await expect(page.getByRole("button",{name:/Rút \$/})).toHaveCount(0);
  await expect(page.getByRole("status").filter({hasText:"Đang chờ xác minh số tiền đã rút"})).toBeVisible();
});

test("buyer claim state fits all required viewport widths with keyboard focus", async({page})=>{
  await ordersFixture(page);
  for (const width of [320,375,430,768,1024,1280,1440]) {
    await page.setViewportSize({width,height:900});
    const dimensions=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));
    expect(dimensions.content,`horizontal overflow at ${width}`).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole("button",{name:"Rút $89 USDC"})).toBeVisible();
  }
  await page.getByRole("button",{name:"Rút $89 USDC"}).focus();
  await expect(page.getByRole("button",{name:"Rút $89 USDC"})).toBeFocused();
});

test("catalogue API failure offers retry and does not masquerade as empty data", async({page})=>{
  let fail=true;
  await page.route("**/api/health",r=>r.fulfill({contentType:"application/json",body:'{}'}));
  await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:""}));
  await page.route("**/api/v1/catalog?*",r=>r.fulfill(fail ? {status:503,body:"offline"}:{json:{version:"1.0",chainId:5042002,hubAddress:catalogHub,amountEncoding:"USDC base-unit integer strings (6 decimals)",filters:{q:"",category:"",status:null,metric:null,sort:"newest"},campaigns:[],categoriesScope:"PUBLIC_CURRENT_DEPLOYMENT",categories:[],pagination:{limit:12,sort:"newest",hasMore:false,nextCursor:null},summary:{scope:"MATCHING_PUBLIC_CURRENT_DEPLOYMENT",campaignCount:0,openCampaignCount:0,totalGrossCommitted:"0",projection:{source:"INDEXER",financialStateChainVerified:false,fetchedAt:Date.now()}}}}));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Chưa tải được danh sách chiến dịch");
  await expect(page.getByRole("heading",{name:"Chưa có chiến dịch phù hợp",exact:true})).toHaveCount(0);
  fail=false;
  await page.getByRole("button",{name:"Thử lại"}).click();
  await expect(page.getByRole("heading",{name:"Chưa có chiến dịch phù hợp",exact:true})).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
