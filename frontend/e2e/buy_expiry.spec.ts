import {test,expect,Page} from "@playwright/test";
import {ethers} from "ethers";
import {HUB_ABI} from "../src/contracts/hubAbi";
import {checkoutKey} from "../src/services/checkout";

const principal="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",hub="0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",identity=ethers.id("expiry buyer fixture"),termsHash=ethers.id("expiry terms fixture");
const checkpoint="groupdeal_operation:buyer:op-expiry",checkout=checkoutKey(principal,"expiry"),retry="groupdeal_buy_retry:buyer:expiry";
async function fixture(page:Page,options:{checkout?:boolean;existingExpiry?:boolean;language?:"vi"|"en"}={}){
 const deadline=Math.floor(Date.now()/1000)-900,quoteHash=ethers.id("expiry quote"),state={phase:options.existingExpiry?"EXPIRED":"AWAITING_SIGNATURE",mode:"valid",expiries:0,recoveries:0,authorizations:[] as string[]};
 const proof={blockNumber:101,blockHash:ethers.id("expiry block"),blockTimestamp:deadline+600,deadline,authorizationNonce:7,quoteBlockNumber:100,quoteBlockHash:quoteHash,authorizationSigner:principal,verifiedAt:Date.now()};
 const operation=()=>({id:"op-expiry",action:"BUY",resourceId:"expiry",chainId:5042002,hubAddress:hub,principal,calldata:new ethers.Interface(HUB_ABI).encodeFunctionData("commitToBuy",[1,identity,1,false,3,deadline,"0x1234"]),phase:state.phase,createdAt:1,updatedAt:1,expectedEventArgs:{campaignId:1,campaignIdentity:identity,buyerPrincipal:principal,quantity:1},purchaseQuote:{blockNumber:100,blockHash:quoteHash,lockedUnitPrice:"1000000",commitmentAmount:"1000000",maxGrossAmount:"1000000",authorizationNonce:7,termsHash},...(state.phase==="EXPIRED"?{authorizationExpiry:proof}:{})});
 const campaign={id:"expiry",onchainCampaignId:1,title:"Expiry deal fixture",description:"Fixture only",category:"Software",metric:"UNITS_COUNT",status:"ACTIVE",termsHash,tiers:[{threshold:1,price:"1000000"},{threshold:2,price:"800000"}],currentUnlockedTier:0,maxPerAccount:10,inventoryLimit:100,totalUnitsCommitted:0,totalBuyerCount:0,totalGrossCommitted:"0",endTime:Math.floor(Date.now()/1000)+3600,deliverySlaSeconds:86400,earlyRebateEnabled:false,platformFeeBps:0,deliveryMethod:"FILE_LINK",thumbnailUrl:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",product:{vendor:"Fixture",requirements:[],supportPolicy:"Fixture",license:{edition:"Fixture",seatsPerUnit:1,usageScope:"PERSONAL",durationDays:null,activationWindowDays:30,regions:["Worldwide"],transferable:false,usageTerms:"Fixture license"}},rights:{status:"APPROVED",validUntil:Math.floor(Date.now()/1000)+90*86400}};
 await page.addInitScript(({checkpoint,checkout,retry,principal,identity,options})=>{
  localStorage.setItem("groupdeal_token","fixture");localStorage.setItem("groupdeal_lang",options.language||"vi");
  if(!localStorage.getItem("expiry-fixture-initialized")){
   localStorage.setItem("expiry-fixture-initialized","1");localStorage.setItem(checkpoint,JSON.stringify({id:"op-expiry",phase:"AWAITING_SIGNATURE"}));
   if(options.checkout){localStorage.setItem(checkout,JSON.stringify({operationId:"op-expiry",quantity:1,requireEarlySlot:false,maxGrossUsdc:"1000000",campaignIdentity:identity,onchainCampaignId:1,phase:"BUY_PENDING",createdAt:1}));localStorage.setItem(retry,"buy:old-expiry-fixture");}
  }
 },{checkpoint,checkout,retry,principal,identity,options});
 await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:""}));
 await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:"export class W3SSdk {updateConfigs(){}};export default {W3SSdk};"}));
 await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:`export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:${options.checkout?JSON.stringify(principal):"null"},hubAddress:"${hub}",usdcBalance:"10",walletMode:"EXTERNAL_REOWN",externalSignerReady:true,refreshBalance:async()=>{},broadcastPreparedOperation:async()=>{window.unexpectedSign=true;throw new Error("Unexpected signing")},commitToBuyOnchain:async()=>{window.unexpectedSign=true;throw new Error("Unexpected signing")}});`}));
 await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?/,r=>{const input=r.request().postDataJSON(),reply=(p:any)=>({jsonrpc:"2.0",id:p.id,result:p.method==="eth_chainId"?"0x4cef52":p.method==="eth_getBalance"?"0x8ac7230489e80000":"0x3b9aca00"});return r.fulfill({json:Array.isArray(input)?input.map(reply):reply(input)});});
 await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:"buyer",roles:["buyer"],activeWallet:principal,loginMethod:"EVM_WALLET",email:null}}}));
 await page.route("**/api/notifications",r=>r.fulfill({json:{notifications:[],unread:0}}));
 await page.route("**/api/orders/buyer",r=>r.fulfill({json:{orders:[]}}));
 await page.route("**/api/campaigns/expiry",r=>r.fulfill({json:{campaign,seller:{displayName:"Fixture seller"}}}));
 await page.route(/\/api\/transactions(?:\?.*)?$/,r=>r.fulfill({json:{operations:[operation()],pagination:{nextCursor:null}}}));
 await page.route("**/api/transactions/op-expiry",r=>r.fulfill({json:{operation:operation()}}));
 await page.route("**/api/transactions/op-expiry/recover",r=>{state.recoveries++;return r.fulfill({status:409,json:{error:"Receipt requires recovery"}});});
 await page.route("**/api/transactions/op-expiry/expire",r=>{
  expect(r.request().postDataJSON()).toEqual({});state.expiries++;
  if(state.mode==="nonce-changed")return r.fulfill({status:409,json:{error:"CONFLICT: purchase nonce changed; recover commitments"}});
  if(state.mode==="pending")return r.fulfill({json:{operation:operation()}});
  if(state.mode==="missing-proof")return r.fulfill({json:{operation:{...operation(),phase:"EXPIRED"}}});
  if(state.mode==="wrong-id")return r.fulfill({json:{operation:{...operation(),id:"foreign-intent",phase:"EXPIRED",authorizationExpiry:proof}}});
  state.phase="EXPIRED";return r.fulfill({json:{operation:operation()}});
 });
 await page.route("**/api/orders/authorize",r=>{
  const key=r.request().postDataJSON().idempotencyKey;state.authorizations.push(key);expect(key).not.toBe("buy:old-expiry-fixture");
  return r.fulfill({json:{buyerWallet:principal,campaignId:"1",campaignIdentity:identity,maxQuantity:3,deadline:deadline+1800,termsHash,signature:"0x1234",quote:operation().purchaseQuote,operation:{...operation(),id:"op-fresh",phase:"PREPARED",authorizationExpiry:undefined}}});
 });
 await page.route("**/api/transactions/op-fresh/ready",r=>r.fulfill({status:409,json:{error:"Local fixture stops before any wallet signing"}}));
 await page.goto(options.checkout?"/#campaign-expiry":"/#orders");
 if(options.checkout)await expect(page.getByRole("heading",{name:"Expiry deal fixture"})).toBeVisible();
 else await expect(page.getByRole("heading",{name:/Cam kết mua.*Đang chờ chữ ký/})).toBeVisible();
 return state;
}

test("history checks BUY expiry explicitly without a connected wallet or an order success",async({page},info)=>{
 const state=await fixture(page);expect(state.expiries).toBe(0);await page.getByRole("button",{name:"Kiểm tra chứng thực hết hạn trên chain"}).focus();await page.keyboard.press("Enter");
 await expect(page.getByRole("heading",{name:/Chứng thực mua đã hết hạn, nonce chưa sử dụng/})).toBeVisible();expect(state.expiries).toBe(1);expect(state.recoveries).toBe(0);expect(await page.evaluate(key=>localStorage.getItem(key),checkpoint)).toBeNull();
 await expect(page.getByRole("button",{name:/Ký intent/})).toHaveCount(0);await expect(page.getByRole("button",{name:"Kiểm tra chứng thực hết hạn trên chain"})).toHaveCount(0);await expect(page.getByText(/Lượt mua này không tạo đơn/)).toBeVisible();expect(await page.evaluate(()=>(window as any).unexpectedSign)).toBeUndefined();
 for(const width of [320,375,1440]){await page.setViewportSize({width,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:375,height:700});await page.screenshot({path:info.outputPath("buy-expired-history.png"),fullPage:true});await page.reload();await expect(page.getByRole("heading",{name:/Chứng thực mua đã hết hạn/})).toBeVisible();expect(state.expiries).toBe(1);
});
for(const mode of ["pending","missing-proof","wrong-id","nonce-changed"])test(`history retains BUY checkpoint for ${mode} expiry response`,async({page})=>{
 const state=await fixture(page);state.mode=mode;const before=await page.evaluate(key=>localStorage.getItem(key),checkpoint);await page.getByRole("button",{name:"Kiểm tra chứng thực hết hạn trên chain"}).click();await expect(page.getByRole("alert")).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),checkpoint)).toBe(before);expect(state.expiries).toBe(1);expect(state.recoveries).toBe(0);expect(await page.evaluate(()=>(window as any).unexpectedSign)).toBeUndefined();
});
test("checkout releases only verified expired BUY and prepares a fresh key on a later explicit confirmation",async({page},info)=>{
 const state=await fixture(page,{checkout:true});await expect(page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"})).toBeVisible();expect(state.expiries).toBe(0);await page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"}).click();
 await expect(page.getByRole("heading",{name:"Chứng thực mua đã hết hạn"})).toBeVisible();await expect(page.getByRole("button",{name:"Xem đơn hàng của tôi"})).toHaveCount(0);expect(state.expiries).toBe(1);expect(state.authorizations).toEqual([]);expect(state.recoveries).toBe(0);
 expect(await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[checkout,retry,checkpoint])).toEqual([null,null,null]);await page.setViewportSize({width:375,height:700});await page.screenshot({path:info.outputPath("buy-expired-checkout.png"),fullPage:true});
 await page.getByRole("button",{name:"Đóng",exact:true}).click();await page.getByRole("button",{name:/cam kết mua/i}).click();await page.locator(".modal-content input[type=checkbox]").last().check();await page.locator(".modal-content > button.btn-primary").click();
 await expect(page.getByText("Cần kiểm tra giao dịch cũ",{exact:true})).toBeVisible();expect(state.authorizations.length).toBe(1);expect(state.authorizations[0]).toMatch(/^buy:/);expect(await page.evaluate(()=>(window as any).unexpectedSign)).toBeUndefined();
});
test("checkout preserves its no-hash intent when expiry cannot be proved",async({page})=>{
 const state=await fixture(page,{checkout:true});state.mode="nonce-changed";await expect(page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"})).toBeVisible();
 const before=await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[checkout,retry,checkpoint]);await page.getByRole("button",{name:"Kiểm tra lại giao dịch / đơn cũ"}).click();await expect(page.getByText(/purchase nonce changed/)).toBeVisible();expect(await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[checkout,retry,checkpoint])).toEqual(before);expect(state.authorizations).toEqual([]);expect(state.expiries).toBe(1);
});
test("checkout recovers an already expired BUY after reload with English status and no repeated expiry call",async({page})=>{
 const state=await fixture(page,{checkout:true,existingExpiry:true,language:"en"});await page.getByRole("button",{name:"Check previous transaction / order"}).click();await expect(page.getByRole("heading",{name:"Purchase authorization expired"})).toBeVisible();await expect(page.getByText(/old authorization expired on chain/)).toBeVisible();expect(state.expiries).toBe(0);expect(state.recoveries).toBe(0);expect(state.authorizations).toEqual([]);expect(await page.evaluate(key=>localStorage.getItem(key),checkout)).toBeNull();
});
