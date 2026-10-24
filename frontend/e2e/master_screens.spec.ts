import {operatorFixtureWallet,operatorFixtureStatus} from './fixtures/operator-enrollment';
import {selectOperatorSection} from './fixtures/operator-navigation';
import {installEmptyCatalog} from './fixtures/catalog';
import {readFileSync} from 'node:fs';
const arcManifest=JSON.parse(readFileSync(new URL('../../shared/manifests/arc-testnet.json',import.meta.url),'utf8'));
import {test,expect,Page} from "@playwright/test";
import {masterFixture} from "./fixtures/master-deal.mjs";
import {productInventoryFixture} from './fixtures/product-inventory';

const widths=[320,375,430,768,1024,1280,1440];
async function fixture(page:Page,language="vi",signedIn=true) {
  const data=masterFixture();
  const wallet=operatorFixtureWallet;
  // A ready budget is required by the current consent state; RPC remains a read-only local fixture.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.routeWebSocket('**/*',ws=>new URL(ws.url()).hostname==='127.0.0.1'?ws.connectToServer():ws.close());
  await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?$/,async route=>{
    const payload=route.request().postDataJSON(),list=Array.isArray(payload)?payload:[payload];
    for(const request of list)expect(['eth_chainId','eth_getBalance','eth_gasPrice','eth_call','eth_getCode']).toContain(request.method);
    const reply=(request:any)=>({jsonrpc:'2.0',id:request.id,result:request.method==='eth_chainId'?'0x4cef52':request.method==='eth_getBalance'?'0x'+(300n*10n**18n).toString(16):request.method==='eth_gasPrice'?'0x4a817c800':'0x'+'0'.repeat(64)});
    await route.fulfill({json:Array.isArray(payload)?list.map(reply):reply(payload)});
  });
  // Keep this suite entirely in its declared UI-fixture layer. Vite must not proxy unknown API reads to a local backend.
  await page.route('**/api/**',route=>route.fulfill({status:404,json:{error:'LOCAL_UI_FIXTURE: route unavailable'}}));
  await installEmptyCatalog(page,arcManifest.contracts.GroupDealHub.address);
  await page.addInitScript(({lang,authenticated})=>{if(authenticated){localStorage.setItem("groupdeal_token","local-fixture-session");localStorage.setItem("groupdeal_admin_token","local-fixture-admin-session");}else{localStorage.removeItem("groupdeal_token");localStorage.removeItem("groupdeal_admin_token");}localStorage.setItem("groupdeal_lang",lang);},{lang:language,authenticated:signedIn});
  await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:""}));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:'export class W3SSdk{updateConfigs(){} getDeviceId(){return Promise.reject(new Error("Local fixture"))}};'}));
  await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:`export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:${JSON.stringify(signedIn?wallet:null)},usdcBalance:"300",walletMode:${JSON.stringify(signedIn?"EXTERNAL":"NONE")}});`}));
  await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:"fixture",email:null,roles:["buyer","seller","operator"],loginMethod:"EVM_WALLET",activeWallet:wallet,sellerProfile:data.seller}}}));
  await page.route("**/api/admin-auth/me",r=>r.fulfill({json:{user:{id:"fixture",email:null,roles:["buyer","seller","operator"],loginMethod:"EVM_WALLET",activeWallet:wallet,sellerProfile:data.seller}}}));
  await page.route("**/api/admin-auth/operator/enrollment",r=>r.fulfill({json:operatorFixtureStatus("fixture",wallet,true,true,Date.now())}));
  await page.route("**/api/notifications",r=>r.fulfill({json:{notifications:[],unread:0}}));
  await page.route("**/api/transactions**",r=>r.fulfill({json:{operations:[],pagination:{nextCursor:null}}}));
  await page.route("**/api/campaigns/master",r=>r.fulfill({json:{campaign:data.campaign,seller:data.seller}}));
  await page.route("**/api/campaigns/draft",r=>r.fulfill({status:201,json:{campaign:{id:"draft_01234567-89ab-cdef-0123-456789abcdef",draftVersion:1}}}));
  await page.route("**/api/seller/campaign-drafts",r=>r.fulfill({json:{drafts:[],pagination:{nextCursor:null}}}));
  await page.route("**/api/seller/campaigns**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},campaigns:[]}}));
  await page.route("**/api/seller/orders**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[]}}));
  await page.route("**/api/seller/webhooks",r=>r.fulfill({json:{webhook:null}}));
  await page.route("**/api/products/mine**",r=>r.fulfill({json:productInventoryFixture([data.product],'fixture')}));
  await page.route("**/api/delivery/resources?*",r=>r.fulfill({json:{resources:[]}}));
  await page.route("**/api/operator/disputes",r=>r.fulfill({json:{disputes:[]}}));
  await page.route("**/api/operator/sellers",r=>r.fulfill({json:{sellers:[]}}));
  await page.route("**/api/operator/reconciliation",r=>r.fulfill({json:{report:{status:"UNVERIFIED",perOrderVerified:false}}}));
  await page.route("**/api/operator/audit-logs",r=>r.fulfill({json:{logs:[]}}));
  await page.route("**/api/operator/deals",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},campaigns:[data.detail.campaign],pagination:{nextCursor:null}}}));
  await page.route("**/api/operator/deals/master",r=>r.fulfill({json:data.detail}));
  return data;
}
async function scrollForCapture(page:Page){
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo({top:0,behavior:"instant"});});await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
}
async function layout(page:Page,width:number,scope="body") {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),`page overflow ${width}`).toBeLessThanOrEqual(width);
  const rect=await page.locator(scope).evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));expect(rect.scroll,`content overflow ${width}`).toBeLessThanOrEqual(rect.client+1);
}
async function tabToPricingField(page:Page){
  for(const selector of ['.wizard-completed button:first-of-type','.wizard-completed section:nth-child(2) button','#deal-title']) {await page.keyboard.press("Tab");await focusVisible(page,selector==='.wizard-completed button:first-of-type'?'.wizard-completed section:first-child button':selector);}
}
async function focusVisible(page:Page,selector:string){
  const target=page.locator(selector);await expect(target).toBeFocused();
  await expect.poll(()=>target.evaluate(element=>{
    const rect=element.getBoundingClientRect(),header=document.querySelector(".header")?.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
    return {aboveHeader:rect.top>=(header?.bottom||0)+8,inViewport:rect.bottom<=innerHeight-8,uncovered:hit===element||!!hit&&element.contains(hit)};
  })).toEqual({aboveHeader:true,inViewport:true,uncovered:true});
}
for(const viewport of [{width:320,height:225},{width:375,height:400},{width:1024,height:450}])test(`seller short viewport keeps pricing controls visible at ${viewport.width}x${viewport.height}`,async({page},info)=>{
  await fixture(page);await page.setViewportSize(viewport);await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();
  await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();await focusVisible(page,"#wizard-step-title");
  await tabToPricingField(page);await page.locator("#tier-price-1").fill("105");await page.getByRole("button",{name:"Tiếp tục: giao hàng"}).click();await focusVisible(page,"#tier-price-1");await layout(page,viewport.width);
  await page.screenshot({path:info.outputPath(`seller-short-${viewport.width}-${viewport.height}.png`)});
});
test("seller active step is horizontally revealed before keyboard focus reaches the wizard rail",async({page})=>{
  await fixture(page);await page.setViewportSize({width:320,height:900});await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();
  await expect(page.locator("#wizard-step-title")).toBeFocused();await expect.poll(()=>page.locator(".wizard-steps button[aria-current=step]").evaluate(element=>{const rect=element.getBoundingClientRect(),rail=element.closest(".wizard-steps")!.getBoundingClientRect();return rect.left>=rail.left&&rect.right<=rail.right;})).toBe(true);
});
test("seller focused field stays visible when switching between short and sticky-header heights",async({page})=>{
 await fixture(page);await page.setViewportSize({width:320,height:225});await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();await tabToPricingField(page);await expect(page.getByRole("main")).toHaveCount(1);
 await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 1 · đã lưu nội dung hiện tại");await focusVisible(page,"#deal-title");await page.setViewportSize({width:320,height:700});await focusVisible(page,"#deal-title");await page.setViewportSize({width:320,height:225});await focusVisible(page,"#deal-title");
});
for(const viewport of [{width:320,height:225},{width:375,height:400},{width:1024,height:450}])test(`buyer dialog and operator keyboard controls remain reachable at ${viewport.width}x${viewport.height}`,async({page},info)=>{
 await fixture(page);await page.setViewportSize(viewport);await page.goto("/#campaign-master");const trigger=page.getByRole("button",{name:/cam kết mua/i});await trigger.click();const dialog=page.getByRole("dialog",{name:"Xác nhận cam kết mua"});await expect(dialog).toBeVisible();await layout(page,viewport.width,".join-dialog");
 const visibleFocused=()=>page.evaluate(()=>{const el=document.activeElement as HTMLElement,rect=el.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return !!el.closest("dialog")&&rect.top>=0&&rect.bottom<=innerHeight&&(hit===el||!!hit&&el.contains(hit));});
 await page.getByRole("button",{name:"Đóng xác nhận mua"}).focus();await page.keyboard.press("Tab");await expect.poll(visibleFocused).toBe(true);await page.locator(".join-agreement input").check();await page.locator(".join-submit").focus();await expect.poll(visibleFocused).toBe(true);await page.screenshot({path:info.outputPath(`buyer-short-${viewport.width}-${viewport.height}.png`)});await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
 await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Kiểm tra deal",exact:true}).click();await focusVisible(page,".operator-deal-card h2");await page.keyboard.press("Tab");await focusVisible(page,".operator-deal :focus");await layout(page,viewport.width);await page.screenshot({path:info.outputPath(`operator-short-${viewport.width}-${viewport.height}.png`)});
});
for(const width of widths)test(`seller and operator focus stays below the actual header at ${width}px`,async({page})=>{
  await fixture(page);await page.setViewportSize({width,height:900});await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await focusVisible(page,"#wizard-step-title");
  await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await focusVisible(page,"#wizard-step-title");await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();await focusVisible(page,"#wizard-step-title");
  await tabToPricingField(page);await page.keyboard.press("Shift+Tab");await focusVisible(page,".wizard-completed section:nth-child(2) button");
  await page.locator("#tier-price-1").fill("105");await page.getByRole("button",{name:"Tiếp tục: giao hàng"}).click();await focusVisible(page,"#tier-price-1");
  await page.locator("#tier-price-1").fill("89");await page.getByRole("button",{name:"Tiếp tục: giao hàng"}).click();await focusVisible(page,"#wizard-step-title");await page.locator(".wizard-main").getByRole("button",{name:"Quay lại",exact:true}).click();await focusVisible(page,"#wizard-step-title");
  await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Kiểm tra deal",exact:true}).click();await focusVisible(page,".operator-deal-card h2");
  await page.setViewportSize({width:width===320?1440:320,height:900});await focusVisible(page,".operator-deal-card h2");
});
for(const language of ["vi","en"])for(const hash of ["#campaign-master","#seller","#operator"])test(`keyboard skip link preserves ${hash} and document language ${language}`,async({page})=>{
  await fixture(page,language);await page.setViewportSize({width:320,height:700});await page.goto("/"+hash);await expect(page.locator(".header")).toBeVisible();await expect(page.locator("html")).toHaveAttribute("lang",language);await expect(page.locator(".main-content h1")).toBeVisible();await expect(page.locator(".main-content button:not(:disabled)").first()).toBeVisible();
  const routeBefore=page.url();await page.keyboard.press("Tab");const link=page.getByRole("link",{name:language==="en"?"Skip to main content":"Đến nội dung chính"});await expect(link).toBeFocused();
  expect(await link.evaluate(element=>{const rect=element.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return rect.top>=0&&hit===element;})).toBe(true);
  await page.keyboard.press("Enter");await expect(page.locator("#main-content")).toBeFocused();expect(page.url()).toBe(routeBefore);await page.keyboard.press("Tab");await focusVisible(page,".main-content :focus");
});
test("language toggling works with blocked preference storage and updates document and navigation labels",async({page})=>{
  await fixture(page);await page.goto("/#campaign-master");await expect(page.locator("html")).toHaveAttribute("lang","vi");const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.evaluate(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(key==="groupdeal_lang")throw new DOMException("LOCAL_FIXTURE blocked preference","SecurityError");return get.call(this,key);};Storage.prototype.setItem=function(key,value){if(key==="groupdeal_lang")throw new DOMException("LOCAL_FIXTURE blocked preference","SecurityError");return set.call(this,key,value);};});
  await page.locator(".account-pill-btn").click();await page.getByRole("button",{name:"Ngôn ngữ: Tiếng Việt",exact:true}).click();await expect(page.locator("html")).toHaveAttribute("lang","en");await page.locator(".account-pill-btn").click();await expect(page.getByRole("button",{name:"Fund USDC",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Notifications",exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Skip to main content"})).toHaveCount(1);
  await page.getByRole("button",{name:"Language: English",exact:true}).click();await expect(page.locator("html")).toHaveAttribute("lang","vi");await page.locator(".account-pill-btn").click();await expect(page.getByRole("button",{name:"Nạp USDC",exact:true})).toBeVisible();expect(errors).toEqual([]);
});
for(const width of widths) test(`four master views remain readable at ${width}px without page/dialog overflow`,async({page},info)=>{
  await fixture(page);await page.setViewportSize({width,height:1000});
  await page.goto("/#campaign-master");await expect(page.getByRole("heading",{name:"Digital toolkit · fixture local",exact:true})).toBeVisible();await layout(page,width);
  await page.screenshot({path:info.outputPath(`buyer-detail-${width}.png`),fullPage:true});
  await page.getByRole("button",{name:/cam kết mua/i}).click();await expect(page.getByRole("dialog",{name:"Xác nhận cam kết mua"})).toBeVisible();await expect(page.locator(".join-dialog")).toHaveCSS("opacity","1");await layout(page,width,".join-dialog");
  await expect(page.locator(".join-steps [aria-current=step]")).toHaveCount(1);await expect(page.locator(".join-dialog .commitment-total")).toContainText("105");await page.screenshot({path:info.outputPath(`buyer-join-${width}.png`)});
  await page.getByRole("button",{name:"Đóng xác nhận mua"}).click();
  await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();await layout(page,width);
  await expect(page.locator(".deal-preview [aria-current]")).toHaveCount(0);await scrollForCapture(page);await page.screenshot({path:info.outputPath(`seller-create-${width}.png`),fullPage:true});
  await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Kiểm tra deal",exact:true}).click();await expect(page.locator(".operator-deal-card h2")).toContainText("Digital toolkit");await layout(page,width);
  await expect(page.locator(".operator-deal .notice-warning")).toContainText("chưa phải xác minh chain");await scrollForCapture(page);await page.screenshot({path:info.outputPath(`operator-detail-${width}.png`),fullPage:true});
});
test("join dialog traps keyboard focus, restores trigger and clears consent after amount changes",async({page})=>{
  await fixture(page);await page.goto("/#campaign-master");const trigger=page.getByRole("button",{name:/cam kết mua/i});await trigger.click();
  const agree=page.locator(".join-agreement input"),submit=page.locator(".join-submit");await expect(submit).toBeDisabled();await agree.check();await expect(submit).toBeEnabled();await page.getByRole("button",{name:"Tăng số lượng"}).click();await expect(submit).toBeDisabled();await expect(page.locator(".commitment-total")).toContainText("210");
  await page.getByRole("button",{name:"Đóng xác nhận mua"}).focus();await page.keyboard.press("Shift+Tab");expect(await page.evaluate(()=>document.activeElement?.closest("dialog")!==null)).toBe(true);
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).not.toBeVisible();await expect(trigger).toBeFocused();
});
for(const issue of ["TERMS_REVIEW","CLOSED","SOLD_OUT","RIGHTS"]) test(`deal disables new purchase for ${issue} without hiding existing orders`,async({page})=>{
  const data=await fixture(page);if(issue==="TERMS_REVIEW")data.campaign.termsPolicyReviewRequired=true;if(issue==="CLOSED")data.campaign.status="FINALIZED";if(issue==="SOLD_OUT")data.campaign.totalUnitsCommitted=data.campaign.inventoryLimit;if(issue==="RIGHTS")data.campaign.rights.status="REVOKED";
  await page.goto("/#campaign-master");await expect(page.getByRole("button",{name:/cam kết mua/i})).toBeDisabled();await expect(page.getByRole("button",{name:"Xem đơn đã mua"})).toBeVisible();
});
test("buyer English summary preserves exact USDC and explicit claim semantics",async({page})=>{
  const data=await fixture(page,"en");data.campaign.tiers[1].price="900719925474099312345678";await page.goto("/#campaign-master");await expect(page.locator(".deal-purchase-panel > .deal-price-large strong")).toHaveText("900719925474099312.345678");await page.getByRole("button",{name:/Commit to Buy/i}).click();await expect(page.getByRole("dialog",{name:"Confirm your commitment"})).toBeVisible();await expect(page.locator(".join-dialog")).toContainText("claim them to your wallet");await page.setViewportSize({width:320,height:900});await layout(page,320,".join-dialog");
});
test("verified seller/rights badges use opaque light surfaces with readable text contrast",async({page})=>{
  await fixture(page);await page.goto("/#campaign-master");
  await expect(page.locator(".seller-identity .badge")).toHaveCount(2);
  const ratios=await page.locator(".seller-identity .badge").evaluateAll(nodes=>{
    const luminance=(value:string)=>{const rgb=value.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
    return nodes.map(node=>{const style=getComputedStyle(node),fore=luminance(style.color),back=luminance(style.backgroundColor);return (Math.max(fore,back)+.05)/(Math.min(fore,back)+.05);});
  });expect(ratios).toHaveLength(2);for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
});
test("operator unknown cumulative totals are labelled unverified instead of zero",async({page})=>{
  const data=await fixture(page);data.detail.accounting.accountingKnown=false;for(const key of ["grossCommitted","rebatesAllocated","refundsAllocated","sellerAllocated","buyerClaimed","sellerClaimed","buyerClaimable","sellerClaimable"])(data.detail.accounting as any)[key]=null;
  await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Kiểm tra deal",exact:true}).click();await expect(page.locator(".operator-metrics dd")).toHaveText(Array(8).fill("Chưa xác minh"));
});
test("operator deal API failure does not render empty-success or financial metrics",async({page})=>{
  await fixture(page);await page.route("**/api/operator/deals",r=>r.fulfill({status:503,json:{error:"Local fixture outage"}}));await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await expect(page.locator(".operator-deal [role=alert]")).toContainText("Không tải được dữ liệu deal");await expect(page.locator(".operator-metrics")).toHaveCount(0);await expect(page.getByText("Chưa có deal trong dữ liệu vừa tải.",{exact:true})).toHaveCount(0);
});
test("seller pricing errors stay near fields and block progression before any draft or wallet write",async({page})=>{
  await fixture(page);let writes=0;page.on("request",request=>{if(request.url().includes("/api/")&&request.method()!=="GET")writes++;});
  await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();
  await page.locator("#tier-price-1").fill("105");await page.locator("#tier-threshold-1").fill("1");await page.locator("#deal-inventory").fill("2");await page.locator("#deal-duration").fill("31");await page.getByLabel("Thêm rebate cho early supporter").check();await page.locator("#deal-early-slots").fill("0");await page.locator("#deal-early-amount").fill("105.000001");
  await page.getByRole("button",{name:"Tiếp tục: giao hàng"}).click();await expect(page.locator("#wizard-step-title")).toHaveText("Giá và số lượng");await expect(page.locator("#tier-price-1")).toHaveAttribute("aria-invalid","true");await expect(page.locator("#tier-price-1-error")).toContainText("nhỏ hơn");await expect(page.locator("#deal-early-amount-error")).toContainText("không vượt giá bậc thấp nhất");await expect(page.locator("#tier-threshold-1")).toBeFocused();expect(writes).toBe(0);
  await page.locator("#tier-price-0").fill("1"+"0".repeat(90));await page.locator("#tier-price-0").blur();await expect(page.locator("#tier-price-0")).toHaveAttribute("aria-invalid","true");
  await page.locator("#tier-price-0").fill("105");await page.locator("#tier-price-1").fill("89");await page.locator("#tier-threshold-1").fill("10");await page.locator("#deal-inventory").fill("100");await page.locator("#deal-duration").fill("7");await page.locator("#deal-early-slots").fill("10");await page.locator("#deal-early-amount").fill("5");await page.getByRole("button",{name:"Tiếp tục: giao hàng"}).click();await expect(page.locator("#wizard-step-title")).toHaveText("Giao hàng");expect(writes).toBe(0);await page.setViewportSize({width:320,height:900});await layout(page,320);
});
test("operator master fixture totals reconcile all 37 accounts and 42 units at the actual 105 clearing tier",async({page})=>{
  const data=await fixture(page),orders=data.detail.orders;
  expect(orders.length).toBe(37);expect(orders.reduce((total,order)=>total+order.quantity,0)).toBe(42);
  for(const order of orders)expect(BigInt(order.rebateAllocated)+BigInt(order.sellerAllocated)).toBe(BigInt(order.committedGross));
  expect(data.detail.accounting).toMatchObject({grossCommitted:"4710000000",rebatesAllocated:"350000000",sellerAllocated:"4360000000",buyerClaimed:"10000000",buyerClaimable:"340000000",sellerClaimable:"4360000000"});
  await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Kiểm tra deal",exact:true}).click();await expect(page.locator(".operator-metrics dd")).toContainText(["4710","350","4360","10","0","340","4360","0"]);
});
test("finalized buyer/operator tiers show their final milestone without promising further unlocking",async({page})=>{
  const data=await fixture(page);data.campaign.status="FINALIZED";Object.assign(data.campaign,{finalClearingPrice:"105000000"});
  await page.goto("/#campaign-master");await expect(page.locator(".price-tier-rail .rail-current-label")).toHaveText("Bậc chốt");await expect(page.locator(".price-tier-rail .tier-next")).toHaveCount(0);
  await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Kiểm tra deal",exact:true}).click();await expect(page.locator(".price-tier-rail .rail-current-label")).toHaveText("Bậc chốt");await expect(page.locator(".price-tier-rail .tier-next")).toHaveCount(0);
});

for(const width of widths)test(`four master views in English remain readable at ${width}px`,async({page},info)=>{
  await fixture(page,"en");await page.setViewportSize({width,height:1000});
  await page.goto("/#campaign-master");await expect(page.locator(".deal-key-facts")).toContainText("Seats per unit");await layout(page,width);await page.screenshot({path:info.outputPath(`buyer-detail-en-${width}.png`),fullPage:true});
  await page.getByRole("button",{name:/Commit to Buy/i}).click();await expect(page.getByRole("dialog",{name:"Confirm your commitment"})).toBeVisible();await expect(page.locator(".join-dialog")).toHaveCSS("opacity","1");await layout(page,width,".join-dialog");await expect(page.locator(".commitment-total")).toContainText("105");await page.screenshot({path:info.outputPath(`buyer-join-en-${width}.png`)});await page.getByRole("button",{name:"Close purchase confirmation"}).click();
  await page.goto("/seller/campaigns");await page.getByRole("button",{name:"Create campaign",exact:true}).first().click();await page.getByRole("button",{name:"Use this version"}).click();await page.getByRole("button",{name:"Continue: pricing"}).click();await expect(page.locator(".wizard-completed")).toContainText("Approved for this version");await layout(page,width);await scrollForCapture(page);await page.screenshot({path:info.outputPath(`seller-create-en-${width}.png`),fullPage:true});
  await page.goto("/#operator");await selectOperatorSection(page,{name:"Inspect deals",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Inspect deal",exact:true}).click();await expect(page.locator(".operator-exceptions")).toContainText("not deal-wide totals");await layout(page,width);await scrollForCapture(page);await page.screenshot({path:info.outputPath(`operator-detail-en-${width}.png`),fullPage:true});
});

test("buyer content navigation preserves the deal route and moves keyboard focus",async({page})=>{
  await fixture(page);await page.setViewportSize({width:320,height:900});await page.goto("/#campaign-master");await expect(page.locator(".buyer-deal-detail h1")).toBeVisible();const dealRoute=page.url();
  await page.getByRole("button",{name:"License và quyền sử dụng",exact:true}).click();await expect(page.locator("#deal-license")).toBeFocused();expect(page.url()).toBe(dealRoute);
  await page.getByRole("button",{name:"Giao hàng và điều khoản",exact:true}).click();await expect(page.locator("#deal-delivery")).toBeFocused();expect(page.url()).toBe(dealRoute);
});
test("join blocks an expired deal even when consent was already checked",async({page})=>{
  const data=await fixture(page);data.campaign.endTime=Math.floor(Date.now()/1000)+5;await page.clock.install({time:new Date()});await page.goto("/#campaign-master");await page.getByRole("button",{name:/cam kết mua/i}).click();await page.locator(".join-agreement input").check();await expect(page.locator(".join-submit")).toBeEnabled();await page.clock.runFor(7000);await expect(page.locator(".join-submit")).toBeDisabled();await expect(page.locator(".join-dialog [role=alert]")).toContainText("đã đóng");
});
test("seller mobile preview reuses exact prices and never initiates checkout",async({page},info)=>{
  await fixture(page);let writes=0;page.on("request",r=>{if(r.method()!=="GET"&&/\/api\/orders|\/api\/transactions/.test(r.url()))writes++;});await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();await page.locator("#tier-price-0").fill("105.123456");await page.getByRole("button",{name:"Xem trước",exact:true}).click();await page.getByRole("button",{name:"Điện thoại",exact:true}).click();await expect(page.locator(".preview-mobile .preview-price strong")).toHaveText("105.123456");await expect(page.locator(".preview-mode button[aria-pressed=true]")).toHaveText("Điện thoại");await expect(page.locator(".deal-preview [aria-current]")).toHaveCount(0);await page.setViewportSize({width:320,height:900});await layout(page,320);await page.locator(".deal-preview").scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("seller-preview-mobile-320.png")});expect(writes).toBe(0);
});
test("operator exception counters describe the loaded page and keep financial totals independent",async({page})=>{
  const data=await fixture(page);data.detail.orders=data.detail.orders.slice(0,3);data.detail.orders[0].deliveryStatus="PENDING";data.detail.orders[1].deliveryStatus="DISPUTED";Object.assign(data.detail,{pagination:{nextCursor:"next-local-page",hasMore:true}});await page.goto("/#operator");await selectOperatorSection(page,{name:"Kiểm tra deal",exact:true});await page.locator(".operator-deal .operator-order-list").getByRole("button",{name:"Kiểm tra deal",exact:true}).click();await expect(page.locator(".operator-exception-grid strong")).toHaveText(["1","1","3"]);await expect(page.locator(".operator-exceptions")).toContainText("không phải tổng toàn deal");await expect(page.locator(".operator-metrics dd").first()).toContainText("4710");await expect(page.locator(".operator-loaded-orders li")).toHaveCount(3);
});
for(const status of [404,503])test(`buyer English ${status} response has an actionable state`,async({page})=>{
  await fixture(page,"en");await page.route("**/api/campaigns/master",r=>r.fulfill({status,json:{error:"LOCAL_FIXTURE"}}));await page.goto("/#campaign-master");await expect(page.getByRole("heading",{name:status===404?"Deal not found":"Unable to load deal"})).toBeVisible();await expect(page.getByRole("button",{name:"Back to catalogue"})).toBeVisible();await expect(page.getByRole("button",{name:"Retry"})).toHaveCount(status===503?1:0);
});
for(const language of ["vi","en"])for(const guest of [false,true])test(`compact ${guest?"guest":"account"} header preserves controls in ${language}`,async({page},info)=>{
  await fixture(page,language,!guest);if(guest)await page.route("**/api/auth/me",r=>r.fulfill({status:401,json:{error:"LOCAL_FIXTURE_SESSION"}}));await page.setViewportSize({width:320,height:900});await page.goto("/#campaign-master");await expect(page.locator(".buyer-deal-detail h1")).toBeVisible();await layout(page,320);expect(await page.locator(".header").evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(130);
  const navigation=page.getByRole("button",{name:language==="en"?"Open navigation":"Mở điều hướng",exact:true});await navigation.click();await expect(page.locator("#mobile-navigation")).toBeVisible();await expect(page.locator("#mobile-navigation").getByRole("link",{name:language==="en"?"Explore":"Khám phá",exact:true})).toBeVisible();await page.keyboard.press("Escape");await expect(navigation).toBeFocused();
  if(guest){await page.locator(".header-login").click();await expect(page.getByRole("dialog")).toBeVisible();await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).not.toBeVisible();await expect(page.locator(".header-login")).toBeFocused();}
  else{await page.locator(".account-pill-btn").click();await expect(page.locator("#header-account").getByRole("button",{name:language==="en"?"Fund USDC":"Nạp USDC",exact:true})).toBeVisible();await expect(page.getByRole("region",{name:language==="en"?"Account menu":"Menu tài khoản"})).toBeVisible();await expect(page.getByRole("button",{name:language==="en"?"Language: English":"Ngôn ngữ: Tiếng Việt",exact:true})).toBeVisible();await page.keyboard.press("Escape");}
  await scrollForCapture(page);await page.screenshot({path:info.outputPath(`header-${guest?"guest":"account"}-${language}-320.png`)});
});
