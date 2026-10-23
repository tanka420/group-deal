import {test,expect,Page} from "@playwright/test";

const principal="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",original="0x"+"ab".repeat(32),replacement="0x"+"cd".repeat(32);
const key="groupdeal_operation:buyer:op-replacement";
async function history(page:Page){
 const state={phase:"SUBMITTED",txHash:original,recoveries:0,replacements:[] as any[],reject:false};
 const operation=()=>({id:"op-replacement",action:"BUYER_CLAIM",resourceId:"campaign",chainId:5042002,hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",principal,calldata:"0x",createdAt:0,updatedAt:0,expectedEventArgs:{},phase:state.phase,txHash:state.txHash,replacements:state.replacements});
 await page.addInitScript(({key,original})=>{localStorage.setItem("groupdeal_token","fixture");if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({id:"op-replacement",txHash:original,phase:"SUBMITTED"}));},{key,original});
 await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:""}));
 await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:"export class W3SSdk {updateConfigs(){}};export default {W3SSdk};"}));
 await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:`export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,usdcBalance:"0",walletMode:"NONE",preflightPreparedOperation:async()=>{},broadcastPreparedOperation:async()=>{window.unexpectedSign=true;throw new Error("Unexpected signature")}});`}));
 await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:"buyer",roles:["buyer"],activeWallet:principal,email:null,loginMethod:"EVM_WALLET"}}}));
 await page.route("**/api/notifications",r=>r.fulfill({json:{notifications:[],unread:0}}));
 await page.route("**/api/orders/buyer**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[]}}));
 await page.route("**/api/transactions",r=>r.fulfill({json:{operations:[operation()],pagination:{nextCursor:null}}}));
 await page.route("**/api/transactions/op-replacement/recover",r=>{expect(r.request().postDataJSON()).toEqual({txHash:state.txHash});state.recoveries++;if(state.phase!=="PROJECTED")state.phase="RECEIPT_VERIFIED";return r.fulfill({json:{operation:operation()}});});
 await page.route("**/api/transactions/op-replacement/replace",r=>{
  expect(r.request().postDataJSON()).toEqual({previousTxHash:original,txHash:replacement});
  if(state.reject)return r.fulfill({status:409,json:{error:"CONFLICT: replacement nonce is unverified"}});
  const kind=state.phase==="SUPERSEDED"?"NONCE_CONSUMED":"SAME_CALL";state.replacements=[{previousTxHash:original,txHash:replacement,nonce:7,blockNumber:64644320,blockHash:original,kind,verifiedAt:0}];if(kind==="SAME_CALL"){state.txHash=replacement;state.phase="SUBMITTED";}return r.fulfill({json:{operation:operation()}});
 });
 await page.goto("/#orders");await expect(page.getByRole("heading",{name:"Lịch sử và phục hồi giao dịch"})).toBeVisible();await page.locator(".transaction-row>summary").first().click();await expect(page.getByRole("heading",{name:/Rút rebate và tiền hoàn.*Đã gửi; chờ xác minh/})).toBeVisible();return state;
}

test("history retains its broadcast checkpoint when HTTP 200 is only a partial projection",async({page})=>{
 const state=await history(page);const checkpoint=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true}).click();
 await expect(page.getByRole("heading",{name:/Receipt đã xác minh; chờ ghép dữ liệu/})).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(checkpoint);
 await page.reload();await page.locator(".transaction-row>summary").first().click();await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true}).click();await expect(page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true})).toBeEnabled();expect(state.recoveries).toBe(2);
 state.phase="PROJECTED";await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true}).click();await expect(page.getByRole("heading",{name:/Đã ghép dữ liệu/})).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();expect(await page.evaluate(()=>(window as any).unexpectedSign)).toBeUndefined();
});

test("history imports a verified same-call replacement without a wallet and keeps its new checkpoint until projection",async({page},info)=>{
 const state=await history(page);await page.getByText("Phục hồi giao dịch tăng phí hoặc hủy từ ví",{exact:true}).click();
 await page.getByLabel("Hash giao dịch thay thế đã có receipt").fill(replacement);await page.getByRole("button",{name:"Xác minh giao dịch thay thế",exact:true}).click();
 await expect(page.getByRole("heading",{name:/Receipt đã xác minh; chờ ghép dữ liệu/})).toBeVisible();await expect(page.getByText(/Cùng lời gọi; cần receipt và projection/)).toBeVisible();
 expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)||"null").txHash).toBe(replacement);expect(state.recoveries).toBe(1);
 for(const width of [320,375,1440]){await page.setViewportSize({width,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:375,height:700});await page.screenshot({path:info.outputPath("replacement-partial-history.png"),fullPage:true});
 await page.reload();await page.locator(".transaction-row>summary").first().click();await expect(page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true})).toBeEnabled();state.phase="PROJECTED";await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true}).click();await expect(page.getByRole("heading",{name:/Đã ghép dữ liệu/})).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();expect(await page.evaluate(()=>(window as any).unexpectedSign)).toBeUndefined();
});

test("history preserves the original checkpoint when replacement proof is rejected",async({page})=>{
 const state=await history(page);state.reject=true;const before=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.getByText("Phục hồi giao dịch tăng phí hoặc hủy từ ví",{exact:true}).click();await page.getByLabel("Hash giao dịch thay thế đã có receipt").fill(replacement);await page.getByRole("button",{name:"Xác minh giao dịch thay thế",exact:true}).click();
 await expect(page.getByRole("alert")).toContainText("nonce is unverified");expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(before);expect(state.recoveries).toBe(0);
});

test("history shows a canonical nonce-consumed outcome without financial success or recovery/signature",async({page},info)=>{
 const state=await history(page);state.phase="SUPERSEDED";await page.getByText("Phục hồi giao dịch tăng phí hoặc hủy từ ví",{exact:true}).click();await page.getByLabel("Hash giao dịch thay thế đã có receipt").fill(replacement);await page.getByRole("button",{name:"Xác minh giao dịch thay thế",exact:true}).click();
 await expect(page.getByRole("heading",{name:/Nonce đã được giao dịch khác sử dụng/})).toBeVisible();await expect(page.getByText(/chưa suy ra kết quả tài chính/)).toBeVisible();expect(state.recoveries).toBe(0);
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();await expect(page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:/Ký intent/})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).unexpectedSign)).toBeUndefined();
 await page.setViewportSize({width:375,height:700});await page.screenshot({path:info.outputPath("replacement-nonce-consumed.png"),fullPage:true});
});
