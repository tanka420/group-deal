import {operatorFixtureWallet,operatorFixtureStatus} from './fixtures/operator-enrollment';
import { test,expect,Page } from "@playwright/test";
import {createHash} from "node:crypto";
import {productInventoryFixture,ownedProductFixture} from './fixtures/product-inventory';

const wallet="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",hash="0x"+"ab".repeat(32);
const version={id:"product-version",title:"Protected document",description:"Complete purchased document",category:"Documents",vendor:"Fixture",thumbnailUrl:"https://asset.example.test/protected.png",requirements:["PDF reader"],supportPolicy:"Support for 30 days"};
const license={edition:"Individual",seatsPerUnit:1,usageScope:"PERSONAL",durationDays:null,activationWindowDays:30,regions:["Worldwide"],transferable:false,supportDays:30,usageTerms:"Personal access, redistribution prohibited"};
const product={id:"product",latestVersionId:version.id,status:"PUBLISHED",version,license,rights:[{id:"rights",status:"APPROVED",validUntil:Math.floor(Date.now()/1000)+60*86400}]};
const operation={id:"op-fixture",action:"PUBLISH",resourceId:"draft-fixture",chainId:5042002,hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",principal:wallet,calldata:"0xfixture",phase:"PREPARED",createdAt:Date.now(),updatedAt:Date.now(),expectedEventArgs:{}};
function probeAck(r:any){const receipt={schema:"GroupDealResourceCommandV1",commandId:r.request().headers()["idempotency-key"],sellerAccountId:"seller",kind:"PROBE",status:"SUCCEEDED",productVersionId:version.id,resourceId:"file",committedAt:Date.now(),probeId:"probe-fixture",method:"FILE_LINK",evidenceHash:"0x"+"ab".repeat(32),sha256:"cd".repeat(32),campaignId:"draft-fixture"};expect(receipt.commandId).toMatch(/^[a-f0-9-]{36}$/);return r.fulfill({json:{success:true,result:{success:true,probe:{id:receipt.probeId,sellerId:"seller",productVersionId:version.id,resourceId:"file",method:receipt.method,resourceSha256:receipt.sha256,checkedAt:receipt.committedAt,evidenceHash:receipt.evidenceHash}},receipt}})}
async function base(page:Page,role="seller",language:"vi"|"en"="vi") {
  const activeWallet=role==="operator"?operatorFixtureWallet:wallet;
  await page.addInitScript(({lang,admin})=>{localStorage.setItem(admin?"groupdeal_admin_token":"groupdeal_token",admin?"isolated-admin-browser-fixture":"isolated-browser-fixture");if(!localStorage.getItem("groupdeal_lang"))localStorage.setItem("groupdeal_lang",lang);},{lang:language,admin:role==="operator"});
  await page.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  await page.route("**/api/**",r=>r.fulfill({status:404,json:{error:"LOCAL_PRODUCT_OPERATIONS_ROUTE_UNAVAILABLE"}}));
  await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:""}));
  await page.route("https://asset.example.test/**",r=>r.fulfill({contentType:"image/svg+xml",body:"<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'/>"}));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:"export class W3SSdk{updateConfigs(){}};export default {W3SSdk};"}));
  await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:`export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:"${activeWallet}",usdcBalance:"10",balanceError:null,walletMode:"EXTERNAL_REOWN",externalSignerReady:true,refreshBalance:async()=>{},preflightPreparedOperation:async()=>{localStorage.setItem('fixture-preflights',String(Number(localStorage.getItem('fixture-preflights')||0)+1));},broadcastPreparedOperation:async(operation,onBroadcast)=>{localStorage.setItem("fixture-broadcasts",String(Number(localStorage.getItem("fixture-broadcasts")||0)+1));await onBroadcast("${hash}");return {txHash:"${hash}"};}});`}));
  await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:role,email:null,roles:["buyer",role],loginMethod:"EVM_WALLET",activeWallet,sellerProfile:{bio:"Local fixture",verifiedSellerBadge:false,verifiedRightsBadge:false,displayName:"Fixture seller",payoutWallet:wallet}}}}));
  await page.route("**/api/admin-auth/me",r=>r.fulfill({json:{user:{id:role,email:null,roles:["buyer",role],loginMethod:"EVM_WALLET",activeWallet,sellerProfile:{bio:"Local fixture",verifiedSellerBadge:false,verifiedRightsBadge:false,displayName:"Fixture seller",payoutWallet:wallet}}}}));
  await page.route("**/api/admin-auth/operator/enrollment",r=>r.fulfill({json:operatorFixtureStatus("operator",operatorFixtureWallet,true,true,Date.now())}));
  await page.route("**/api/notifications",r=>r.fulfill({json:{notifications:[],unread:0}}));
  await page.route("**/api/seller/campaign-drafts",r=>r.fulfill({json:{drafts:[],pagination:{nextCursor:null}}}));
  await page.route("**/api/seller/campaigns**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},campaigns:[]}}));
  await page.route("**/api/seller/orders**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[]}}));
  await page.route("**/api/seller/webhooks",r=>r.fulfill({json:{webhook:null}}));
  await page.route(/\/api\/transactions(?:\?.*)?$/,r=>r.fulfill({json:{operations:[]}}));
}
async function noOverflow(page:Page) {
  for(const width of [320,375,430,768,1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth),`overflow at ${width}`).toBeLessThanOrEqual(width);
  }
}
async function previewMoneyFits(page:Page){
 await page.getByRole("button",{name:/^(Preview|Xem trước)$/,exact:true}).click();await expect(page.locator(".deal-preview")).toBeVisible();await expect(page.locator(".deal-preview .preview-price")).toHaveCount(1);
 for(const width of [320,375,430,768,1024,1280,1440]){
  await page.setViewportSize({width,height:900});await expect.poll(()=>page.locator(".deal-preview .preview-price, .deal-preview .deal-price strong").evaluateAll(elements=>elements.every(element=>{
   const range=document.createRange();range.selectNodeContents(element);const bounds=(element.closest("li")||element).getBoundingClientRect();return Array.from(range.getClientRects()).every(rect=>rect.left>=bounds.left-1&&rect.right<=bounds.right+1);
  })),`complete money text fits its preview/tier column at ${width}`).toBe(true);
 }
 await page.keyboard.press("Escape");
}

test("English seller creates a draft through license, pricing, delivery and pinned review without translating product terms",async({page},info)=>{
 await base(page,"seller","en");let draftVersion=0,input:any,publishKey="";const price="900719925474099312.345678";
 await page.route("**/api/products/mine",r=>r.fulfill({json:productInventoryFixture([product],'seller')}));await page.route("**/api/delivery/resources?*",r=>r.fulfill({json:{resources:[{id:"file",sellerId:"seller",productVersionId:version.id,fileName:"complete.pdf",mimeType:"application/pdf",byteLength:12,sha256:"cd".repeat(32),availableLicenses:100}]}}));
 const save=(r:any)=>{const body=r.request().postDataJSON();expect(body.productVersionId).toBe(version.id);expect(body.description).toBe(version.description);expect(body.category).toBe(version.category);expect(body.thumbnailUrl).toBe(version.thumbnailUrl);expect(r.request().headers()["idempotency-key"]).toMatch(/^draft-write:/);if(r.request().method()==="PUT")expect(body.expectedVersion).toBe(draftVersion);input=body;draftVersion++;return r.fulfill({json:{campaign:{id:"draft-fixture",draftVersion}}});};
 await page.route("**/api/campaigns/draft",save);await page.route("**/api/campaigns/draft-fixture",save);await page.route("**/api/seller/campaign-drafts/draft-fixture",r=>r.fulfill({json:{draft:{id:"draft-fixture",version:draftVersion,input:{...input,expectedVersion:undefined}},publication:null}}));
 await page.route("**/api/campaigns/draft-fixture/test-delivery",r=>{expect(r.request().postDataJSON()).toEqual({resourceId:"file"});return probeAck(r);});await page.route("**/api/campaigns/draft-fixture/prepare-publish",r=>{expect(input.tiers[0].priceUSDC).toBe(price);publishKey=r.request().postDataJSON().idempotencyKey;return r.fulfill({json:{campaign:{id:"draft-fixture",title:version.title,tiers:[{threshold:1,price:"900719925474099312345678"},{threshold:10,price:"89000000"}],durationSeconds:604800,termsHash:"0x"+"34".repeat(32)},operation:{...operation,idempotencyKey:r.request().postDataJSON().idempotencyKey}}});});
 await page.goto("/seller/create");await expect(page.getByRole("heading",{name:"Products, licenses and distribution rights"})).toBeVisible();await expect(page.getByRole("heading",{name:"Saved drafts",exact:true})).toBeVisible();await page.getByRole("button",{name:"Use this version"}).click();await expect(page.locator(".wizard-main")).toContainText(license.usageTerms);await expect(page.locator(".wizard-main")).toContainText("Approved for this version through the delivery period");
 await page.getByRole("button",{name:"Continue: pricing"}).click();await page.locator("#tier-price-0").fill(price);await page.getByRole("button",{name:"Continue: delivery"}).click();await page.getByRole("combobox",{name:"Uploaded resource",exact:true}).selectOption("file");await page.getByRole("button",{name:"Save draft and check terms"}).click();await expect(page.getByRole("heading",{name:"Pinned terms"})).toBeVisible();await expect(page.locator(".wizard-main")).toContainText(price);await expect(page.getByRole("button",{name:"Sign and publish on Arc Testnet"})).toBeEnabled();expect(publishKey).toMatch(/^publish:/);expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBeNull();await noOverflow(page);await previewMoneyFits(page);await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:info.outputPath("seller-english-pinned-review.png"),fullPage:true});
});

test("product profile labels change language while the versioned license payload preserves seller content",async({page})=>{
 await base(page,"seller","en");let saves=0,currentProduct:any=product;await page.route("**/api/products/mine",r=>r.fulfill({json:productInventoryFixture([currentProduct],'seller')}));await page.route("**/api/delivery/resources?*",r=>r.fulfill({json:{resources:[]}}));
 await page.route("**/api/products/product/versions",r=>{saves++;const body=r.request().postDataJSON();expect(body.expectedVersionId).toBe(version.id);expect(body.title).toBe(version.title);expect(body.description).toBe(version.description);expect(body.vendor).toBe(version.vendor);expect(body.license).toEqual(license);const saved=ownedProductFixture({...product,latestVersionId:"revised-version",version:{...version,id:"revised-version"},license,rights:[]},"seller");const {expectedVersionId,...input}=body,commandId=r.request().headers()["idempotency-key"];expect(commandId).toMatch(/^[a-f0-9-]{36}$/);const receipt={schema:"GroupDealProductCommandV1",commandId,sellerAccountId:"seller",kind:"VERSION",status:"SUCCEEDED",committedAt:Date.now(),contentDigest:createHash("sha256").update(JSON.stringify(input)).digest("hex"),productId:saved.id,productVersionId:saved.version.id,licenseVersionId:saved.license.id,previousVersionId:expectedVersionId};currentProduct=saved;return r.fulfill({json:{product:saved,version:saved.version,license:saved.license,receipt}});});
 await page.goto("/seller/products");await page.getByRole("button",{name:"Create revised version"}).click();await expect(page.getByRole("textbox",{name:"License usage terms",exact:true})).toHaveValue(license.usageTerms);await expect(page.getByRole("combobox",{name:"Usage scope",exact:true})).toHaveValue("PERSONAL");await page.locator(".account-pill-btn").click();await page.getByRole("button",{name:"Language: English",exact:true}).click();await page.locator(".account-pill-btn").click();await expect(page.getByRole("textbox",{name:"Điều khoản sử dụng license",exact:true})).toHaveValue(license.usageTerms);expect(saves).toBe(0);await page.getByRole("button",{name:"Lưu phiên bản",exact:true}).click();await expect.poll(()=>saves).toBe(1);await expect(page.locator(".product-record-list").getByRole("heading",{name:version.title,exact:true})).toBeVisible();await expect(page.locator("#product-title")).toHaveValue("");
});
test("seller reviews product/license, stages a publish intent and recovers its broadcast across reload without another signature",async({page},testInfo)=>{
  await base(page);let phase="PREPARED",recoveries=0;const draft={draftVersion:1,id:"draft-fixture",title:version.title,tiers:[{threshold:1,price:"105000000"},{threshold:10,price:"89000000"}],durationSeconds:604800,termsHash:"0x"+"34".repeat(32),sellerPayoutWallet:wallet};
  await page.route("**/api/products/mine",r=>r.fulfill({json:productInventoryFixture([product],'seller')}));
  await page.route("**/api/delivery/resources?*",r=>r.fulfill({json:{resources:[{id:"file",sellerId:"seller",productVersionId:version.id,fileName:"complete.pdf",mimeType:"application/pdf",byteLength:12,sha256:"cd".repeat(32),availableLicenses:100}]}}));
  await page.route("**/api/campaigns/draft",r=>{expect(r.request().headers()["idempotency-key"]).toMatch(/^draft-write:/);return r.fulfill({status:201,json:{campaign:draft}});});
  await page.route("**/api/seller/campaign-drafts/draft-fixture",r=>r.fulfill({json:{draft:{id:draft.id,version:1,input:{title:version.title,description:version.description,category:version.category,thumbnailUrl:version.thumbnailUrl,productVersionId:version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"105"},{threshold:10,priceUSDC:"89"}],maxPerAccount:3,inventoryLimit:0,durationDays:7,deliverySlaHours:24,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmountUSDC:"0",earlyRebateBps:0,visibility:"PUBLIC",deliveryMethod:"FILE_LINK",deliveryContentTemplate:""}},publication:null}}));
  await page.route("**/api/campaigns/draft-fixture/test-delivery",r=>probeAck(r));
  await page.route("**/api/campaigns/draft-fixture/prepare-publish",r=>r.fulfill({json:{campaign:draft,operation:{...operation,idempotencyKey:r.request().postDataJSON().idempotencyKey}}}));
  await page.route("**/api/transactions/op-fixture/ready",r=>r.fulfill({json:{operation}}));
  await page.route("**/api/transactions/op-fixture/submit",r=>{phase="SUBMITTED";return r.fulfill({status:202,json:{operation:{...operation,phase,txHash:hash}}});});
  await page.route("**/api/transactions/op-fixture/recover",r=>{expect(r.request().postDataJSON().txHash).toBe(hash);recoveries++;phase=recoveries===1?"UNKNOWN":"PROJECTED";return r.fulfill(recoveries===1?{status:409,json:{error:"Receipt chưa xác minh"}}:{json:{operation:{...operation,phase,txHash:hash}}});});
  await page.route(/\/api\/transactions(?:\?.*)?$/,r=>r.fulfill({json:{operations:phase==="PREPARED"?[]:[{...operation,phase,txHash:hash}]}}));
  await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();
  await expect(page.getByRole("heading",{name:"Sản phẩm, license và quyền phân phối"})).toBeVisible();await noOverflow(page);
  await expect(page.getByText("Chiến dịch đang mở")).toHaveCount(0);await expect(page.getByRole("button",{name:"← Quay lại quản lý deal"})).toBeVisible();
  await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await expect(page.getByText("Đã duyệt cho phiên bản này và đủ thời hạn giao hàng")).toBeVisible();
  await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();await noOverflow(page);
  await page.getByRole("button",{name:"Tiếp tục: giao hàng"}).click();await page.getByLabel("Tài nguyên đã tải lên").selectOption("file");
  await page.getByRole("button",{name:"Lưu draft và kiểm tra điều khoản"}).click();await expect(page.getByRole("heading",{name:"Điều khoản đã được ghim"})).toBeVisible();await noOverflow(page);
  await page.screenshot({path:testInfo.outputPath("seller-create-local.png"),fullPage:true});
  await page.getByRole("button",{name:"Ký và xuất bản trên Arc Testnet"}).click();await expect(page.getByRole("alert")).toContainText("Receipt chưa xác minh");
  await page.goto("/seller/transactions");await page.locator(".transaction-row>summary").first().click();await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi"}).click();await expect(page.getByRole("heading",{name:/Đã ghép dữ liệu/})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBe("1");
  expect(await page.evaluate(()=>localStorage.getItem("fixture-preflights"))).toBe("1");
});

test("seller and operator API errors do not render empty-success or zero financial counters",async({page})=>{
  await base(page);
  await page.route("**/api/seller/campaigns**",route=>route.fulfill({status:503,json:{error:"Offline"}}));
  await page.goto("/seller/campaigns");await expect(page.getByRole("alert")).toContainText("Không tải được dữ liệu");
  await expect(page.getByText("Bạn chưa có chiến dịch nào.",{exact:false})).toHaveCount(0);await expect(page.getByText("Doanh thu có thể rút (Proceeds)")).toHaveCount(0);
  await noOverflow(page);
  await page.evaluate(()=>localStorage.setItem("groupdeal_admin_token","isolated-admin-browser-fixture"));await page.route("**/api/admin-auth/me",route=>route.fulfill({json:{user:{id:"operator",email:null,roles:["operator"],loginMethod:"EVM_WALLET",activeWallet:operatorFixtureWallet}}}));
  await page.route("**/api/operator/**",route=>route.fulfill({status:503,json:{error:"Offline"}}));
  await page.goto("/#operator");await page.reload();await expect(page.getByRole("alert")).toContainText("Không tải được dữ liệu");
  await expect(page.getByText("Không có tranh chấp nào đang mở")).toHaveCount(0);await noOverflow(page);
});

test("seller claim uses a reviewed server intent and reports success after receipt projection",async({page})=>{
  await base(page);let phase="PREPARED",started=false;
  const claim={...operation,id:"op-seller-claim",action:"SELLER_CLAIM",resourceId:"stable",financialQuote:{kind:"READ_ONLY_SIMULATION",blockNumber:125,blockHash:hash,amountBaseUnits:"50000000"}};
  await page.route("**/api/seller/campaigns**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},campaigns:[{id:"stable",title:"Seller claim fixture",thumbnailUrl:version.thumbnailUrl,category:"Documents",sellerPayoutWallet:wallet,status:"FINALIZED",onchainCampaignId:1,tiers:[{threshold:1,price:"100000000"},{threshold:10,price:"80000000"}],currentUnlockedTier:0,metric:"BUYER_COUNT",totalBuyerCount:1,totalUnitsCommitted:1}]}}));
  await page.route("**/api/seller/orders**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[{id:"internal-order",campaignId:"stable",campaignTitle:"Seller claim fixture",buyerPrincipal:wallet,quantity:1,lockedUnitPrice:'100000000',committedGross:"100000000",rebateAllocated:'50000000',buyerRefundAllocated:'0',sellerAllocated:"50000000",sellerClaimedAmount:phase==="PROJECTED"?"50000000":"0",sellerClaimable:phase==="PROJECTED"?"0":"50000000",accountingVerified:true,deliveryStatus:"CONFIRMED"}]}}));
  await page.route(/\/api\/transactions(?:\?.*)?$/,r=>r.fulfill({json:{operations:started?[{...claim,phase,...(phase==="PREPARED"?{}:{txHash:hash})}]:[]}}));
  await page.route("**/api/transactions/claims/prepare",r=>{expect(r.request().postDataJSON()).toMatchObject({action:"SELLER_CLAIM",campaignId:"stable",orderIds:["internal-order"]});started=true;return r.fulfill({json:{operation:{...claim,phase}}});});
  await page.route("**/api/transactions/op-seller-claim/ready",r=>{phase="AWAITING_SIGNATURE";return r.fulfill({json:{operation:{...claim,phase}}});});
  await page.route("**/api/transactions/op-seller-claim/submit",r=>{phase="SUBMITTED";return r.fulfill({status:202,json:{operation:{...claim,phase,txHash:hash}}});});
  await page.route("**/api/transactions/op-seller-claim/recover",r=>{expect(r.request().postDataJSON().txHash).toBe(hash);phase="PROJECTED";return r.fulfill({json:{operation:{...claim,phase,txHash:hash}}});});
  await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Đơn hàng & Giao quyền truy cập/}).click();await page.getByRole("button",{name:"Rút $50 USDC"}).click();
  await expect(page.getByRole("heading",{name:"Kiểm tra khoản rút trên Arc"})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBeNull();
  await page.getByRole("button",{name:"Ký rút tiền đã kiểm tra"}).click();await expect(page.getByRole("dialog")).not.toBeVisible();await expect(page.getByRole("button",{name:"Rút $50 USDC"})).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBe("1");
});

test("seller fulfillment preserves its staged intent on HTTP 200 until the delivery projection is complete",async({page})=>{
 await base(page);let recovered=0,delivered=false;const delivery={...operation,id:"op-delivery-partial",action:"DELIVER",resourceId:"delivery-order",phase:"SUBMITTED",txHash:hash,expectedEventArgs:{proofHash:hash}};
 const checkpoint="groupdeal_operation:seller:op-delivery-partial";await page.addInitScript(({checkpoint,hash})=>localStorage.setItem(checkpoint,JSON.stringify({id:"op-delivery-partial",txHash:hash,phase:"SUBMITTED"})),{checkpoint,hash});
 await page.route("**/api/seller/orders**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[{id:"delivery-order",campaignId:"stable",campaignTitle:"Delivery recovery fixture",buyerPrincipal:wallet,quantity:1,committedGross:"100000000",rebateAllocated:"0",sellerAllocated:"0",sellerClaimedAmount:"0",sellerClaimable:"0",accountingVerified:true,deliveryStatus:delivered?"DELIVERED":"PENDING"}]}}));
 await page.route(/\/api\/transactions(?:\?.*)?$/,r=>r.fulfill({json:{operations:[delivery]}}));
 await page.route("**/api/transactions/op-delivery-partial/recover",r=>{expect(r.request().postDataJSON()).toEqual({txHash:hash});recovered++;delivered=recovered===2;return r.fulfill({json:{operation:{...delivery,phase:delivered?"PROJECTED":"RECEIPT_VERIFIED"}}});});
 await page.goto("/seller/campaigns");await page.getByRole("button",{name:/Đơn hàng & Giao quyền truy cập/}).click();await page.getByRole("button",{name:"Giao tài nguyên",exact:true}).click();
 await page.getByRole("button",{name:"Xác minh receipt và mở quyền tải",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByRole("dialog").getByRole("alert")).toContainText("projection");expect(await page.evaluate(checkpoint=>localStorage.getItem(checkpoint),checkpoint)).not.toBeNull();expect(delivered).toBe(false);
 await page.getByRole("button",{name:"Xác minh receipt và mở quyền tải",exact:true}).click();await expect(page.getByRole("dialog")).not.toBeVisible();expect(await page.evaluate(checkpoint=>localStorage.getItem(checkpoint),checkpoint)).toBeNull();expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBeNull();expect(recovered).toBe(2);
});
test("buyer activates a managed license and downloads actual returned bytes; private entitlement is never rendered",async({page})=>{
  await base(page,"buyer");let redeemed=false;
  await page.route("**/api/orders/buyer**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[{id:"1",campaignId:"stable",campaignTitle:version.title,quantity:1,lockedUnitPrice:"105000000",committedGross:"105000000",rebateAllocated:"16000000",buyerRefundAllocated:"0",buyerClaimedAmount:"0",buyerClaimable:"16000000",accountingVerified:true,deliveryStatus:"DELIVERED",hasEntitlement:true,managedResourceDelivery:true,buyerPrincipal:wallet}]}}));
  const sha256=createHash('sha256').update('Complete protected content').digest('hex'),activatedAt=Date.now()-1000,expiresAt=Math.floor(Date.now()/1000)+600;
  await page.route("**/api/delivery/orders/1/grants",r=>r.fulfill({json:{orderId:'1',buyerAccountId:'buyer',serverTime:Date.now(),grants:[{id:"grant",unitIndex:0,seatsPerUnit:1,requiresRedemption:!redeemed,canRedeem:!redeemed,downloadReady:redeemed,accessStatus:redeemed?'DOWNLOAD_READY':'AWAITING_REDEMPTION',fileName:"actual-resource.txt",mimeType:'text/plain',byteLength:26,sha256,activatedAt,redeemedAt:redeemed?Date.now():null,licenseExpiresAt:null,activationDeadline:null}]}}));
  await page.route("**/api/orders/1/entitlement",r=>r.fulfill({json:{entitlement:JSON.stringify({version:1,method:'LICENSE_KEY',grants:[{id:"grant",unitIndex:0,seatsPerUnit:1,licenseKey:"private-fixture-key"}]})}}));
  await page.route("**/api/delivery/grants/grant/redeem",r=>{expect(r.request().postDataJSON().key).toBe("private-fixture-key");redeemed=true;return r.fulfill({json:{success:true}});});
  await page.route("**/api/delivery/grants/grant/download-link",r=>r.fulfill({json:{grantId:'grant',fileName:'actual-resource.txt',mimeType:'text/plain',byteLength:26,sha256,expiresAt,url:"/api/delivery/grants/grant/download?expiresAt="+expiresAt+"&keyId=fixture&signature="+'ab'.repeat(32)}}));
  await page.route("**/api/delivery/grants/grant/download?*",r=>r.fulfill({contentType:"text/plain",headers:{"Content-Disposition":"attachment; filename=actual-resource.txt"},body:"Complete protected content"}));
  await page.goto("/orders/1");await page.getByRole("button",{name:"Kích hoạt mã truy cập"}).click();await expect(page.getByRole("button",{name:"Tải tài nguyên"})).toBeVisible();await expect(page.getByText("private-fixture-key")).toHaveCount(0);
  await noOverflow(page);const download=page.waitForEvent("download");await page.getByRole("button",{name:"Tải tài nguyên"}).click();expect((await download).suggestedFilename()).toBe("actual-resource.txt");
});
test("deal 404 and API outage offer distinct back/retry states",async({page})=>{
  await base(page,"buyer");let missing=true;
  await page.route("**/api/campaigns/missing",r=>r.fulfill(missing?{status:404,json:{error:"Not found"}}:{status:503,json:{error:"Offline"}}));
  await page.goto("/#campaign-missing");await expect(page.getByRole("heading",{name:"Không tìm thấy deal"})).toBeVisible();await page.getByRole("button",{name:"Quay về danh mục"}).click();
  missing=false;await page.goto("/#campaign-missing");await expect(page.getByRole("heading",{name:"Không tải được deal",exact:true})).toBeVisible();await expect(page.getByRole("alert")).toContainText("Không tải được dữ liệu");await expect(page.getByRole("button",{name:"Thử lại"})).toBeVisible();
});


test("integration docs describe durable inbox, receipt SDK and JSON widget accurately across supported widths",async({page})=>{
  await base(page,"buyer");await page.goto("/#docs");
  await expect(page.getByRole("heading",{name:"Tích hợp với GroupDeal",exact:true})).toBeVisible();
  await expect(page.getByText("SDK v2 là bản candidate",{exact:false})).toBeVisible();
  await expect(page.getByText("Cửa sổ thời gian vẫn cho phép nhận trùng",{exact:false})).toBeVisible();
  await expect(page.getByText("trả trang HTML chỉ đọc để nhúng iframe",{exact:false})).toBeVisible();
  await expect(page.getByText("Khả năng này mới được kiểm tra local",{exact:false})).toBeVisible();
  expect(await page.locator("iframe").count()).toBe(0);await noOverflow(page);
});

test("transaction history loads older pages without duplicate entries and preserves narrow-screen layout",async({page})=>{
  await base(page,"buyer");await page.route("**/api/orders/buyer**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[]}}));
  const operations=Array.from({length:25},(_,i)=>({...operation,id:`history-${i}`,resourceId:`deal-${i}`,phase:"PROJECTED"}));
  await page.route(/\/api\/transactions(?:\?.*)?$/,r=>{const cursor=new URL(r.request().url()).searchParams.get("cursor");return r.fulfill({json:{operations:cursor?operations.slice(19):operations.slice(0,20),pagination:{nextCursor:cursor?null:"fixture-older-page"}}});});
  await page.goto("/#orders");await expect(page.getByRole("heading",{name:"Xuất bản deal · Đã ghép dữ liệu"})).toHaveCount(20);await page.getByRole("button",{name:"Tải thêm lịch sử"}).click();await expect(page.getByRole("heading",{name:"Xuất bản deal · Đã ghép dữ liệu"})).toHaveCount(25);await expect(page.getByRole("button",{name:"Tải thêm lịch sử"})).toHaveCount(0);await noOverflow(page);
});

test("operator renders unsafe legacy evidence as text and opens only credential-free HTTPS evidence",async({page})=>{
  await base(page,"operator");let evidence="javascript:alert(1)";
  await page.route("**/api/operator/disputes",r=>r.fulfill({json:{disputes:[{id:"order",campaignTitle:"Evidence fixture",quantity:1,buyerPrincipal:wallet,sellerPayoutWallet:wallet,committedGross:"100000000",rebateAllocated:"10000000",disputeReason:"Activation failed",disputeEvidence:[evidence],messages:[]}]}}));
  await page.route("**/api/operator/sellers",r=>r.fulfill({json:{sellers:[]}}));await page.route("**/api/operator/reconciliation",r=>r.fulfill({json:{report:null}}));await page.route("**/api/operator/audit-logs",r=>r.fulfill({json:{logs:[]}}));
  await page.goto("/#operator");await expect(page.getByText("Link bằng chứng cũ cần kiểm tra; chưa mở liên kết.")).toBeVisible();await expect(page.getByRole("link",{name:"Xem link bằng chứng"})).toHaveCount(0);
  evidence="https://fixture.invalid/evidence";await page.reload();await expect(page.getByRole("link",{name:"Xem link bằng chứng"})).toHaveAttribute("href",evidence);await noOverflow(page);
});

async function orderActionFixture(page:Page,action:string,unknown=false){
  const role=action==="RESOLVE"?"operator":action==="SETTLE"?"seller":"buyer";
  await base(page,role);let started=false,phase="PREPARED",recoveries=0;
  const current={...operation,principal:role==="operator"?operatorFixtureWallet:wallet,id:"op-order-action",action,resourceId:"order-action",orderQuote:{kind:"READ_ONLY_SIMULATION",blockNumber:125,blockHash:hash,remainingGross:"75000000",...(action==="RESOLVE"?{buyerShare:"27750000",sellerShare:"47250000"}:{}),disputeDeadline:Math.floor(Date.now()/1000)+1000}};
  const dto=()=>({...current,phase,...(["PREPARED","AWAITING_SIGNATURE"].includes(phase)?{}:{txHash:hash})});
  const order=()=>({id:"order-action",campaignId:"stable",campaignTitle:"Durable order fixture",onchainCampaignId:42,onchainOrderId:77,buyerPrincipal:wallet,sellerPayoutWallet:wallet,quantity:1,lockedUnitPrice:"100000000",committedGross:action==="RESOLVE"?"3":"100000000",rebateAllocated:action==="RESOLVE"?"2":"25000000",buyerRefundAllocated:phase==="PROJECTED"&&action==="BREACH"?"75000000":"0",buyerClaimedAmount:"0",sellerAllocated:"0",sellerClaimedAmount:"0",buyerClaimable:phase==="PROJECTED"&&action==="BREACH"?"100000000":"0",sellerClaimable:"0",accountingVerified:true,finalizedAt:Math.floor(Date.now()/1000)-10000,deliverySlaSeconds:100,disputeDeadline:Math.floor(Date.now()/1000)-1,deliveryStatus:phase==="PROJECTED"?action==="DISPUTE"?"DISPUTED":action==="RESOLVE"?"RESOLVED":action==="BREACH"?"BREACHED_REFUNDED":"CONFIRMED":action==="BREACH"?"PENDING":action==="RESOLVE"?"DISPUTED":"DELIVERED",disputeReason:action==="RESOLVE"?"Private existing issue":undefined});
  await page.route(/\/api\/transactions(?:\?.*)?$/,r=>r.fulfill({json:{operations:started?[dto()]:[]}}));
  await page.route("**/api/transactions/orders/prepare",r=>{
    expect(r.request().postDataJSON()).toMatchObject({orderId:"order-action",intent:{action}});expect(r.request().postDataJSON().idempotencyKey).toMatch(/^order:/);
    if(action==="DISPUTE")expect(r.request().postDataJSON().intent).toEqual({action,reason:"Private fixture issue",evidenceUrls:["https://fixture.invalid/private-evidence"]});
    if(action==="RESOLVE")expect(r.request().postDataJSON().intent).toEqual({action,buyerPercent:37,notes:"Private fixture decision"});
    started=true;return r.fulfill({json:{operation:dto()}});
  });
  await page.route("**/api/transactions/op-order-action",r=>r.fulfill({json:{operation:dto()}}));
  await page.route("**/api/transactions/op-order-action/ready",r=>{phase="AWAITING_SIGNATURE";return r.fulfill({json:{operation:dto()}});});
  await page.route("**/api/transactions/op-order-action/submit",r=>{expect(r.request().postDataJSON()).toEqual({txHash:hash});phase="SUBMITTED";return r.fulfill({status:202,json:{operation:dto()}});});
  await page.route("**/api/transactions/op-order-action/recover",r=>{expect(r.request().postDataJSON()).toEqual({txHash:hash});recoveries++;phase=unknown&&recoveries===1?"UNKNOWN":"PROJECTED";return r.fulfill(phase==="UNKNOWN"?{status:409,json:{error:"Order receipt chưa xác minh"}}:{json:{operation:dto()}});});
  await page.route("**/api/orders/buyer**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[order()]}}));
  await page.route("**/api/seller/orders**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},orders:[order()]}}));
  await page.route("**/api/seller/campaigns**",r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},campaigns:[{id:"stable",title:"Durable order fixture",thumbnailUrl:version.thumbnailUrl,category:"Documents",sellerPayoutWallet:wallet,status:"FINALIZED",onchainCampaignId:42,tiers:[{threshold:1,price:"100000000"}],currentUnlockedTier:0,metric:"BUYER_COUNT",totalBuyerCount:1,totalUnitsCommitted:1}]}}));
  await page.route("**/api/operator/disputes",r=>r.fulfill({json:{disputes:phase==="PROJECTED"?[]:[order()]}}));
  for(const [path,body] of [["sellers",{sellers:[]}],["reconciliation",{report:null}],["audit-logs",{logs:[]}]] as const)await page.route("**/api/operator/"+path,r=>r.fulfill({json:body}));
  await page.goto(role==="buyer"?"/orders/order-action":"/#"+role);
}

test("buyer confirm reserves an intent before signing and recovers UNKNOWN across reload with one broadcast",async({page})=>{
  await orderActionFixture(page,"CONFIRM",true);
  await expect(page.getByText("openDispute(campaignId: 42, orderId: 77, reasonHash)")).toBeVisible();
  await page.getByRole("button",{name:"Xác nhận đã nhận sản phẩm",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("kết thúc quyền mở tranh chấp");expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBeNull();
  await noOverflow(page);await page.getByRole("button",{name:"Ký thao tác đã kiểm tra"}).focus();await expect(page.getByRole("button",{name:"Ký thao tác đã kiểm tra"})).toBeFocused();await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Chưa xác minh được receipt; intent được giữ để phục hồi.");await page.reload();await page.locator(".transaction-row>summary").first().click();await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true}).click();
  await expect(page.getByRole("heading",{name:/Xác nhận nhận hàng · Đã ghép dữ liệu/})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBe("1");
});

test("buyer stages dispute evidence before a wallet call and recovers it without private browser storage",async({page})=>{
  await orderActionFixture(page,"DISPUTE",true);await page.getByRole("button",{name:"Mở tranh chấp",exact:true}).click();
  await page.getByPlaceholder("Mô tả sự cố:",{exact:false}).fill("Private fixture issue");await page.getByRole('textbox',{name:'Link ảnh chụp màn hình bằng chứng (tùy chọn)',exact:true}).fill("https://fixture.invalid/private-evidence");
   await page.getByRole("button",{name:"Kiểm tra và lưu bằng chứng"}).click();await expect(page.getByRole("dialog")).toHaveCount(1);await expect(page.getByRole("dialog")).toContainText("Bằng chứng riêng được lưu trước chữ ký");
  expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBeNull();await page.getByRole("button",{name:"Ký thao tác đã kiểm tra"}).click();await expect(page.getByRole("alert")).toContainText("Chưa xác minh được receipt; intent được giữ để phục hồi.");
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toMatch(/Private fixture issue|private-evidence/);
  await page.reload();await page.locator(".transaction-row>summary").first().click();await page.getByRole("button",{name:"Kiểm tra receipt và phục hồi",exact:true}).click();await expect(page.getByRole("heading",{name:/Mở tranh chấp · Đã ghép dữ liệu/})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBe("1");await noOverflow(page);
});

test("operator reviews chain-provided shares independently of a tiny DB projection before signing",async({page},testInfo)=>{
  await orderActionFixture(page,"RESOLVE");await expect(page.getByText("Kiểm tra quote trước khi ký")).toBeVisible();await page.getByRole("button",{name:/Phán quyết & Phân bổ tiền/}).click();
  await page.getByRole("slider").fill("37");await page.getByPlaceholder("Ghi nhận lý do:",{exact:false}).fill("Private fixture decision");await page.getByRole("button",{name:"Kiểm tra khoản chia trên chain"}).click();
   const dialog=page.getByRole("dialog");await expect(dialog).toHaveCount(1);await expect(dialog).toContainText("75 USDC");await expect(dialog).toContainText("27.75 USDC");await expect(dialog).toContainText("47.25 USDC");expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBeNull();
  await noOverflow(page);await page.screenshot({path:testInfo.outputPath("operator-chain-split-local.png"),fullPage:true});
  await page.getByRole("button",{name:"Ký thao tác đã kiểm tra"}).click();await expect(dialog).not.toBeVisible();await expect(page.getByText("Không có tranh chấp nào đang mở",{exact:true})).toBeVisible();expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain("Private fixture decision");
});

test("buyer breach projects a refund allocation then offers a separate cumulative claim",async({page})=>{
  await orderActionFixture(page,"BREACH");await page.getByRole("button",{name:"Kiểm tra giao quá SLA trên Arc"}).click();await expect(page.getByRole("dialog")).toContainText("75 USDC");
  await page.getByRole("button",{name:"Ký thao tác đã kiểm tra"}).click();await expect(page.getByText("Vi phạm SLA • Đã phân bổ quyền hoàn tiền")).toBeVisible();await expect(page.getByRole("button",{name:"Rút $100 USDC"})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBe("1");
});

test("seller settle after the dispute window requires a reviewed durable intent",async({page})=>{
  await orderActionFixture(page,"SETTLE");await page.getByRole("button",{name:/Đơn hàng & Giao quyền truy cập/}).click();await page.getByRole("button",{name:"Kiểm tra quyết toán trên Arc",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("Quyết toán sau 48h");expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBeNull();await noOverflow(page);
  await page.getByRole("button",{name:"Ký thao tác đã kiểm tra"}).click();await expect(page.getByRole("dialog")).not.toBeVisible();await expect(page.getByRole("button",{name:"Kiểm tra quyết toán trên Arc",exact:true})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem("fixture-broadcasts"))).toBe("1");
});
