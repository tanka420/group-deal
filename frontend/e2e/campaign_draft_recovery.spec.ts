import { test, expect, Page } from "@playwright/test";
import { masterFixture } from "./fixtures/master-deal.mjs";
import {productInventoryFixture} from './fixtures/product-inventory';

const hash="0x"+"12".repeat(32),principal="0x0000000000000000000000000000000000000001";
async function draftFixture(page:Page,language:"vi"|"en"="vi"){
 const data=masterFixture(),product={...data.product,latestVersionId:"newer-version",version:{...data.product.version,title:"Original pinned product"}};
 const view={draft:{id:"saved-draft",version:7,protocolVersion:1,resourceId:"file",input:{title:"Saved draft",description:"Saved campaign description, preserved on resume",category:"Saved category",thumbnailUrl:data.product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"900719925474099312.345678"},{threshold:10,priceUSDC:"89.0"}],maxPerAccount:3,inventoryLimit:100,durationDays:7,deliverySlaHours:24,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmountUSDC:"0.0",earlyRebateBps:0,visibility:"UNLISTED",deliveryMethod:"FILE_LINK",deliveryContentTemplate:""}},product,publication:null as any};
 await page.addInitScript(lang=>{localStorage.setItem("groupdeal_token","local-draft-fixture");if(!localStorage.getItem("groupdeal_lang"))localStorage.setItem("groupdeal_lang",lang);},language);
 await page.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:""}));
 await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:'export class W3SSdk{updateConfigs(){}};'}));
 await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,walletMode:"NONE",preflightPreparedOperation:async()=>{},broadcastPreparedOperation:async()=>{throw new Error("LOCAL_FIXTURE_UNEXPECTED_SIGNATURE")}});'}));
 await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:"seller",email:null,roles:["seller","buyer"],loginMethod:"EVM_WALLET",activeWallet:null,sellerProfile:data.seller}}}));
 for(const [route,json] of [["notifications",{notifications:[],unread:0}],["transactions",{operations:[],pagination:{nextCursor:null}}],["seller/campaigns",{campaigns:[]}],["seller/orders",{orders:[]}],["seller/webhooks",{webhook:null}],["products/mine",productInventoryFixture([data.product],'seller')]] as const)await page.route("**/api/"+route,r=>r.fulfill({json}));
 await page.route("**/api/delivery/resources?*",r=>r.fulfill({json:{resources:[{id:"file",sellerId:"seller",productVersionId:product.version.id,fileName:"actual-fixture.pdf",mimeType:"application/pdf",byteLength:12,sha256:"cd".repeat(32),availableLicenses:0}]}}));
 await page.route("**/api/seller/campaign-drafts",r=>r.fulfill({json:{drafts:[{id:view.draft.id,title:view.draft.input.title,draftVersion:view.draft.version,publicationLocked:!!view.publication}],pagination:{nextCursor:null}}}));
 await page.route("**/api/seller/campaign-drafts/saved-draft",r=>r.fulfill({json:view}));
 return {data,view};
}
async function openDraft(page:Page){await page.goto("/#seller");await page.getByRole("button",{name:/Tạo chiến dịch mới|Create new campaign/}).first().click();await page.getByRole("button",{name:/Mở bản nháp|Open draft/}).click();}
async function toggleEditorLanguage(page:Page){
 const toggle=page.getByRole("button",{name:/^(Ngôn ngữ:|Language:)/});if(!await toggle.isVisible())await page.locator(".account-pill-btn").click();await toggle.click();await page.locator(".account-pill-btn").click();
}
async function editorCheckpoint(page:Page){return page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith("groupdeal_draft_editor:")).map(k=>sessionStorage.getItem(k)));}

test("seller resumes original product and exact money, saves versioned edits and opens them after reload without creating another draft",async({page})=>{
 const {view}=await draftFixture(page);let updates=0,creates=0;
 await page.route("**/api/campaigns/draft",r=>{creates++;return r.fulfill({status:409,json:{error:"Unexpected creation"}});});
 await page.route("**/api/campaigns/saved-draft",r=>{expect(r.request().method()).toBe("PUT");const input=r.request().postDataJSON();expect(input.expectedVersion).toBe(7);expect(input.description).toBe(view.draft.input.description);expect(input.category).toBe("Saved category");expect(input.tiers[0].priceUSDC).toBe("900719925474099312.345678");updates++;view.draft.version=8;view.draft.input.title=input.title;return r.fulfill({json:{campaign:{id:"saved-draft",draftVersion:8}}});});
 await openDraft(page);await expect(page.locator("#tier-price-0")).toHaveValue("900719925474099312.345678");await expect(page.locator(".wizard-main p[role=status]")).toContainText("đã lưu nội dung hiện tại");await expect(page.locator(".deal-preview img")).toHaveAttribute("alt","Original pinned product");
 await page.getByLabel("Tên deal",{exact:true}).fill("Edited saved draft");await expect(page.locator(".wizard-main p[role=status]")).toContainText("có thay đổi chưa lưu");await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 8 · đã lưu nội dung hiện tại");expect(updates).toBe(1);expect(creates).toBe(0);
 await page.reload();await openDraft(page);await expect(page.locator("#deal-title")).toHaveValue("Edited saved draft");await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 8 · đã lưu nội dung hiện tại");expect(creates).toBe(0);
});
test("seller keeps local fields after a version conflict and never overwrites or creates a replacement automatically",async({page})=>{
 await draftFixture(page);let writes=0;
 await page.route("**/api/campaigns/saved-draft",r=>{writes++;return r.fulfill({status:409,json:{error:"CONFLICT: draft changed; reload before saving"}});});
 await openDraft(page);await page.locator("#deal-title").fill("Local unsaved edit");await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await expect(page.getByRole("alert")).toContainText("CONFLICT");await expect(page.locator("#deal-title")).toHaveValue("Local unsaved edit");await expect(page.locator(".wizard-main p[role=status]")).toContainText("có thay đổi chưa lưu");expect(writes).toBe(1);
});
test("seller restores submitted publish hash from the server with no wallet and waits for PROJECTED before reporting completion",async({page})=>{
 const {data,view}=await draftFixture(page);let recoveries=0,walletCalls=0;
 view.publication={campaign:{...data.campaign,id:"saved-draft",title:view.draft.input.title,status:"DRAFT",durationSeconds:604800},operation:{id:"saved-publish",action:"PUBLISH",resourceId:"saved-draft",chainId:5042002,hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",principal,calldata:"0xfixture",phase:"SUBMITTED",idempotencyKey:"publish:saved-key",txHash:hash,createdAt:0,updatedAt:0,expectedEventArgs:{}}};
 await page.route("**/api/transactions/saved-publish/ready",r=>{walletCalls++;return r.fulfill({status:409,json:{error:"Unexpected new signature"}});});
 await page.route("**/api/transactions/saved-publish/recover",r=>{expect(r.request().postDataJSON()).toEqual({txHash:hash});recoveries++;return r.fulfill({json:{operation:{...view.publication.operation,phase:recoveries===1?"RECEIPT_VERIFIED":"PROJECTED"}}});});
 await openDraft(page);await expect(page.getByRole("heading",{name:"Điều khoản đã được ghim"})).toBeVisible();await page.getByRole("button",{name:"Kiểm tra receipt đã gửi"}).click();await expect(page.getByRole("alert")).toContainText("chưa ghép vào projection");await expect(page.getByRole("heading",{name:"Điều khoản đã được ghim"})).toBeVisible();await page.getByRole("button",{name:"Kiểm tra receipt đã gửi"}).click();await expect(page.getByRole("button",{name:/Tạo chiến dịch mới/}).first()).toBeVisible();expect(recoveries).toBe(2);expect(walletCalls).toBe(0);
});
test("seller restores an awaiting-signature intent without a hash and refuses another wallet call",async({page})=>{
 const {data,view}=await draftFixture(page);let writes=0;
 view.publication={campaign:{...data.campaign,id:"saved-draft",durationSeconds:604800},operation:{id:"saved-publish",action:"PUBLISH",resourceId:"saved-draft",chainId:5042002,hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",principal,calldata:"0xfixture",phase:"AWAITING_SIGNATURE",idempotencyKey:"publish:saved-key",createdAt:0,updatedAt:0,expectedEventArgs:{}}};
 page.on("request",r=>{if(r.url().includes("/api/")&&r.method()!=="GET")writes++;});await openDraft(page);await page.getByRole("button",{name:"Kiểm tra intent chưa có hash"}).click();await expect(page.getByRole("alert")).toContainText("không ký lại");expect(writes).toBe(0);
});
test("seller rereads an unchanged saved draft before publish preparation and blocks a newer remote version",async({page})=>{
 const {view}=await draftFixture(page);let reads=0,writes=0;
 await page.route("**/api/seller/campaign-drafts/saved-draft",r=>{reads++;return r.fulfill({json:{...view,draft:{...view.draft,version:reads===1?7:8}}});});
 page.on("request",r=>{if(r.url().includes("/api/")&&r.method()!=="GET")writes++;});await openDraft(page);await page.getByRole("button",{name:"Tiếp tục: giao hàng"}).click();await expect(page.getByLabel("Tài nguyên đã tải lên")).toHaveValue("file");await page.getByRole("button",{name:"Lưu draft và kiểm tra điều khoản"}).click();await expect(page.getByRole("alert")).toContainText("bản nháp đã đổi");expect(reads).toBe(2);expect(writes).toBe(0);
});

test("autosave debounces rapid edits and queues typing during an in-flight CAS write",async({page})=>{
 const {view}=await draftFixture(page);let release!:()=>void;const hold=new Promise<void>(r=>release=r),writes:any[]=[],keys:string[]=[];let active=0,maximum=0;
 await page.route("**/api/campaigns/saved-draft",async r=>{
   active++;maximum=Math.max(maximum,active);const input=r.request().postDataJSON();writes.push(input);keys.push(r.request().headers()["idempotency-key"]);
   if(writes.length===1)await hold;
   expect(input.expectedVersion).toBe(view.draft.version);view.draft.version++;view.draft.input.title=input.title;active--;await r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:view.draft.version}}});
 });
 await openDraft(page);await page.locator("#deal-title").fill("Rapid one");await page.locator("#deal-title").fill("Rapid two");await page.locator("#deal-title").fill("First committed edit");
 await expect.poll(()=>writes.length).toBe(1);await page.locator("#deal-title").fill("Typing while saving");release();
 await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 9 · đã lưu nội dung hiện tại");expect(writes.map(w=>[w.expectedVersion,w.title])).toEqual([[7,"First committed edit"],[8,"Typing while saving"]]);expect(maximum).toBe(1);expect(new Set(keys).size).toBe(2);for(const key of keys)expect(key).toMatch(/^draft-write:/);
});

test("unknown PUT acknowledgement survives reload and replays the exact request before saving newer typing",async({page})=>{
 const {view}=await draftFixture(page);let calls=0;const requests:any[]=[];let firstKey="";
 await page.route("**/api/campaigns/saved-draft",async r=>{
   calls++;const input=r.request().postDataJSON(),key=r.request().headers()["idempotency-key"];requests.push(input);
   if(calls===1){firstKey=key;view.draft.version=8;view.draft.input.title=input.title;await r.abort("connectionreset");return;}
   if(calls===2){expect(key).toBe(firstKey);expect(input).toEqual(requests[0]);await r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:8}}});return;}
   expect(key).not.toBe(firstKey);expect(input.expectedVersion).toBe(8);view.draft.version=9;view.draft.input.title=input.title;await r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:9}}});
 });
 await openDraft(page);await page.locator("#deal-title").fill("Unknown committed edit");await expect(page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"})).toBeVisible();
 await page.locator("#deal-title").fill("Newer local edit");await page.reload();await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Khôi phục phiên chỉnh sửa"}).click();await expect(page.locator("#deal-title")).toHaveValue("Newer local edit");
 await page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"}).click();await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 9 · đã lưu nội dung hiện tại");expect(calls).toBe(3);
 const checkpoint=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith("groupdeal_draft_editor:")).map(k=>JSON.parse(sessionStorage.getItem(k)!)));expect(checkpoint).toHaveLength(1);expect(checkpoint[0].save.pending).toBeNull();expect(JSON.stringify(checkpoint)).not.toContain("local-draft-fixture");expect(JSON.stringify(checkpoint)).not.toContain("evidenceRefs");
});

test("unknown create acknowledgement is retried with the same key after reload and creates one draft",async({page})=>{
 const {data}=await draftFixture(page);let creates=0;let firstBody:any,firstKey="";
 await page.route("**/api/campaigns/draft",async r=>{
   creates++;const body=r.request().postDataJSON(),key=r.request().headers()["idempotency-key"];
   if(creates===1){firstBody=body;firstKey=key;await r.abort("connectionreset");return;}
   expect(body).toEqual(firstBody);expect(key).toBe(firstKey);await r.fulfill({status:201,json:{campaign:{id:"created-draft",draftVersion:1}}});
 });
 await page.route("**/api/seller/campaign-drafts/created-draft",r=>r.fulfill({json:{draft:{id:"created-draft",version:1,input:firstBody},product:data.product,publication:null}}));
 await page.goto("/#seller");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await page.getByRole("button",{name:"Tiếp tục: cấu hình giá"}).click();
 await expect(page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"})).toBeVisible();await page.reload();await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Khôi phục phiên chỉnh sửa"}).click();await page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"}).click();
 await expect(page.locator(".wizard-main p[role=status]")).toContainText("created-draft · version 1 · đã lưu nội dung hiện tại");expect(creates).toBe(2);
});

test("invalid partial fields survive reload in this tab and never reach the draft API",async({page})=>{
 const {view}=await draftFixture(page);let writes=0;
 await page.route("**/api/campaigns/saved-draft",r=>{writes++;const input=r.request().postDataJSON();expect(input.tiers[1].priceUSDC).toBe("88.5");view.draft.version=8;view.draft.input.tiers[1].priceUSDC="88.5";return r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:8}}});});
 await openDraft(page);await page.locator("#tier-price-1").fill("89.");await page.reload();await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Khôi phục phiên chỉnh sửa"}).click();await expect(page.locator("#tier-price-1")).toHaveValue("89.");expect(writes).toBe(0);await expect(page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"})).toBeDisabled();
 await page.locator("#tier-price-1").fill("88.5");await page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"}).click();await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 8 · đã lưu nội dung hiện tại");expect(writes).toBe(1);
});

test("autosave stops after a conflict while retaining subsequent local edits across reload",async({page})=>{
 await draftFixture(page);let writes=0;
 await page.route("**/api/campaigns/saved-draft",r=>{writes++;return r.fulfill({status:409,json:{error:"CONFLICT: a different editor committed version 8"}});});
 await openDraft(page);await page.locator("#deal-title").fill("Conflicting edit");await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("CONFLICT");await page.locator("#deal-title").fill("Keep this local revision");await page.reload();await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Khôi phục phiên chỉnh sửa"}).click();await expect(page.locator("#deal-title")).toHaveValue("Keep this local revision");await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("CONFLICT");await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await expect(page.getByRole("alert")).toContainText("autosave đã dừng");expect(writes).toBe(1);
});

test("seller compares a newer server version and explicitly reapplies local fields with a fresh CAS",async({page})=>{
 const {view}=await draftFixture(page);let writes=0;
 await page.route("**/api/campaigns/saved-draft",r=>{
   writes++;const input=r.request().postDataJSON();
   if(writes===1){view.draft.version=8;view.draft.input.title="Other editor title";return r.fulfill({status:409,json:{error:"CONFLICT: draft changed"}});}
   expect(input.expectedVersion).toBe(8);expect(input.title).toBe("Local title kept");view.draft.version=9;view.draft.input.title=input.title;return r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:9}}});
 });
 await openDraft(page);await page.locator("#deal-title").fill("Local title kept");await expect(page.getByRole("button",{name:"Đối chiếu phiên bản server"})).toBeVisible();await page.getByRole("button",{name:"Đối chiếu phiên bản server"}).click();await expect(page.getByRole("region",{name:"Đối chiếu bản nháp"})).toContainText("Other editor title");await expect(page.locator("#deal-title")).toHaveValue("Local title kept");expect(writes).toBe(1);
 await page.getByRole("button",{name:"Giữ nội dung local, dùng version server"}).click();await expect(page.locator("#deal-title")).toHaveValue("Local title kept");expect(writes).toBe(1);await page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"}).click();await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 9 · đã lưu nội dung hiện tại");expect(writes).toBe(2);
});

test("a definitive validation rejection retains fields and allows an explicit corrected retry",async({page})=>{
 const {view}=await draftFixture(page);let calls=0,firstKey="";
 await page.route("**/api/campaigns/saved-draft",r=>{
   calls++;const key=r.request().headers()["idempotency-key"],body=r.request().postDataJSON();
   if(calls===1){firstKey=key;return r.fulfill({status:400,json:{error:"VALIDATION: product metadata requires correction"}});}
   expect(key).not.toBe(firstKey);expect(body.expectedVersion).toBe(7);view.draft.version=8;view.draft.input.title=body.title;return r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:8}}});
 });
 await openDraft(page);await page.locator("#deal-title").fill("Rejected validation edit");await expect(page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"})).toBeVisible();await page.locator("#deal-title").fill("Corrected edit");await page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"}).click();await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 8 · đã lưu nội dung hiện tại");expect(calls).toBe(2);
});

test("unresolved creation checkpoint prevents silently starting a different draft",async({page})=>{
 await draftFixture(page);let writes=0;
 await page.route("**/api/campaigns/draft",r=>{writes++;return r.abort("connectionreset");});
 await page.goto("/#seller");await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await expect(page.getByRole("button",{name:"Kiểm tra và tiếp tục đồng bộ"})).toBeVisible();await page.reload();await page.getByRole("button",{name:/Tạo chiến dịch mới/}).first().click();await page.getByRole("button",{name:"Dùng phiên bản này"}).click();await expect(page.getByRole("alert")).toContainText("Phục hồi lần lưu hiện tại");await page.getByRole("button",{name:/Mở bản nháp/}).click();await expect(page.getByRole("alert")).toContainText("Phục hồi lần lưu chưa xác nhận");expect(writes).toBe(1);
});

test("checkpoint storage failure stops draft writes and keeps editable fields",async({page})=>{
 await draftFixture(page);let writes=0;
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("groupdeal_draft_editor:"))throw new DOMException("Local fixture quota exceeded","QuotaExceededError");return original.call(this,key,value);};});
 page.on("request",r=>{if(r.url().includes("/api/campaigns/")&&r.method()!=="GET")writes++;});
 await openDraft(page);await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("Không lưu được checkpoint");await page.locator("#deal-title").fill("Keep fields if storage is unavailable");await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await expect(page.getByRole("alert")).toContainText("quota");await expect(page.locator("#deal-title")).toHaveValue("Keep fields if storage is unavailable");expect(writes).toBe(0);
});

test("raw invalid numeric editing cancels a queued autosave even when its canonical number is unchanged",async({page})=>{
 await draftFixture(page);let writes=0;
 await page.route("**/api/campaigns/saved-draft",r=>{writes++;return r.fulfill({json:{campaign:{id:"saved-draft",draftVersion:8}}});});
 await openDraft(page);await page.locator("#deal-title").fill("Queued valid title");await page.locator("#deal-max").fill("3.0");await expect(page.locator("#deal-max")).toHaveAttribute("aria-invalid","true");
 // Observe beyond the 900 ms debounce; a stale valid closure must never send while the field is invalid.
 await page.waitForTimeout(1400);expect(writes).toBe(0);await expect(page.locator(".wizard-main p[role=status]")).toContainText("có thay đổi chưa lưu");
});

test("English seller labels and validation change language without changing exact prices or invalid draft fields",async({page},info)=>{
 await draftFixture(page,"en");let writes=0;page.on("request",r=>{if(r.url().includes("/api/")&&r.method()!=="GET")writes++;});
 await page.setViewportSize({width:320,height:225});await openDraft(page);await expect(page.locator("#wizard-step-title")).toHaveText("Pricing and quantity");await expect(page.locator("#tier-price-0")).toHaveValue("900719925474099312.345678");await page.locator("#deal-max").fill("3.0");await page.getByRole("button",{name:"Continue: delivery"}).click();await expect(page.locator("#deal-max-error")).toHaveText("Enter an integer from 1 to 10,000.");const checkpoint=await editorCheckpoint(page);
 await toggleEditorLanguage(page);await expect(page.locator("html")).toHaveAttribute("lang","vi");await expect(page.locator("#deal-max-error")).toHaveText("Nhập số nguyên từ 1 đến 10.000.");await expect(page.locator("#deal-max")).toHaveValue("3.0");expect(await editorCheckpoint(page)).toEqual(checkpoint);
 await toggleEditorLanguage(page);await expect(page.locator("#deal-max-error")).toHaveText("Enter an integer from 1 to 10,000.");await page.waitForTimeout(1200);expect(writes).toBe(0);expect(await editorCheckpoint(page)).toEqual(checkpoint);await page.locator("#deal-max").focus();await page.keyboard.press("Shift+Tab");await page.keyboard.press("Tab");await expect(page.locator("#deal-max")).toBeFocused();await page.screenshot({path:info.outputPath("seller-english-short-validation.png")});
});

test("language switching during a lost save acknowledgement preserves the exact pending CAS request and recovery key",async({page})=>{
 const {view}=await draftFixture(page);let release!:()=>void;const hold=new Promise<void>(resolve=>release=resolve),requests:{key:string;body:any}[]=[];
 await page.route("**/api/campaigns/saved-draft",async r=>{
  requests.push({key:r.request().headers()["idempotency-key"],body:r.request().postDataJSON()});if(requests.length===1){await hold;await r.abort("connectionreset");return;}expect(requests[1]).toEqual(requests[0]);await r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:8}}});
 });
 await openDraft(page);await page.locator("#deal-title").fill("Nội dung seller giữ nguyên · β");await expect.poll(()=>requests.length).toBe(1);await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("Đang đồng bộ");const checkpoint=await editorCheckpoint(page);
 await toggleEditorLanguage(page);await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("Syncing the draft");expect(await editorCheckpoint(page)).toEqual(checkpoint);release();await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("connection error");await expect(page.getByRole("button",{name:"Check and resume sync"})).toBeVisible();expect(requests.length).toBe(1);
 await page.reload();await page.getByRole("button",{name:"Create new campaign",exact:true}).first().click();await page.getByRole("button",{name:"Restore editing session"}).click();await expect(page.locator("#deal-title")).toHaveValue("Nội dung seller giữ nguyên · β");await page.getByRole("button",{name:"Check and resume sync"}).click();await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 8 · current edits saved");expect(requests.length).toBe(2);expect(requests[1].body.tiers[0].priceUSDC).toBe("900719925474099312.345678");expect(requests[1].body.description).toBe(view.draft.input.description);await toggleEditorLanguage(page);await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("Đã đồng bộ bản nháp trên server");expect(requests.length).toBe(2);
});

test("English conflict recovery requires explicit comparison and preserves local content when changing language",async({page})=>{
 const {view}=await draftFixture(page,"en");let writes=0;
 await page.route("**/api/campaigns/saved-draft",r=>{writes++;const input=r.request().postDataJSON();if(writes===1){view.draft.version=8;view.draft.input.title="Remote unchanged language content";return r.fulfill({status:409,json:{error:"CONFLICT: draft changed"}});}expect(input.expectedVersion).toBe(8);expect(input.title).toBe("Local edit preserved");return r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:9}}});});
 await openDraft(page);await page.locator("#deal-title").fill("Local edit preserved");await expect(page.getByRole("button",{name:"Compare server version"})).toBeVisible();await page.getByRole("button",{name:"Compare server version"}).click();await expect(page.getByRole("region",{name:"Compare drafts"})).toContainText("Remote unchanged language content");await toggleEditorLanguage(page);await expect(page.getByRole("region",{name:"Đối chiếu bản nháp"})).toContainText("Remote unchanged language content");expect(writes).toBe(1);await toggleEditorLanguage(page);
 await page.getByRole("button",{name:"Keep local edits, use server version"}).click();await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("Local edits are preserved");expect(writes).toBe(1);await page.getByRole("button",{name:"Check and resume sync"}).click();await expect(page.locator(".wizard-main p[role=status]")).toContainText("version 9 · current edits saved");expect(writes).toBe(2);
});

test("English submitted publish recovery localizes partial receipt status without another wallet call",async({page},info)=>{
 const {data,view}=await draftFixture(page,"en");let recoveries=0,walletCalls=0;
 view.publication={campaign:{...data.campaign,id:"saved-draft",title:view.draft.input.title,status:"DRAFT",durationSeconds:604800},operation:{id:"saved-publish",action:"PUBLISH",resourceId:"saved-draft",chainId:5042002,hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",principal,calldata:"0xfixture",phase:"SUBMITTED",idempotencyKey:"publish:saved-key",txHash:hash,createdAt:0,updatedAt:0,expectedEventArgs:{}}};
 await page.route("**/api/transactions/saved-publish/ready",r=>{walletCalls++;return r.fulfill({status:409,json:{error:"Unexpected signature"}});});await page.route("**/api/transactions/saved-publish/recover",r=>{expect(r.request().postDataJSON()).toEqual({txHash:hash});recoveries++;return r.fulfill({json:{operation:{...view.publication.operation,phase:recoveries===1?"RECEIPT_VERIFIED":"PROJECTED"}}});});
 await page.setViewportSize({width:375,height:400});await openDraft(page);await page.getByRole("button",{name:"Check submitted receipt"}).click();await expect(page.getByRole("alert")).toContainText("receipt has not been projected");await expect(page.getByRole("heading",{name:"Pinned terms"})).toBeVisible();await toggleEditorLanguage(page);await expect(page.getByRole("alert")).toContainText("chưa ghép vào projection");expect(recoveries).toBe(1);expect(walletCalls).toBe(0);await toggleEditorLanguage(page);await page.screenshot({path:info.outputPath("seller-english-publish-recovery.png")});await page.getByRole("button",{name:"Check submitted receipt"}).click();await expect(page.getByRole("button",{name:"Create new campaign",exact:true}).first()).toBeVisible();expect(recoveries).toBe(2);expect(walletCalls).toBe(0);
});

test("English checkpoint failure changes language while preserving fields and pausing all draft writes",async({page})=>{
 await draftFixture(page,"en");let writes=0;
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("groupdeal_draft_editor:"))throw new DOMException("LOCAL_FIXTURE quota","QuotaExceededError");return original.call(this,key,value);};});page.on("request",r=>{if(r.url().includes("/api/campaigns/")&&r.method()!=="GET")writes++;});
 await openDraft(page);await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("browser checkpoint could not be saved");await page.locator("#deal-title").fill("Keep raw seller fields");await toggleEditorLanguage(page);await expect(page.locator(".wizard-main .notice[role=status]")).toContainText("Không lưu được checkpoint");await expect(page.locator("#deal-title")).toHaveValue("Keep raw seller fields");await page.waitForTimeout(1200);expect(writes).toBe(0);
});

test("English saved draft loading error updates language without displaying an empty success state",async({page})=>{
 await draftFixture(page,"en");let reads=0;await page.route("**/api/seller/campaign-drafts",r=>{reads++;return r.fulfill({status:503,json:{error:"LOCAL_FIXTURE unavailable"}});});await page.goto("/#seller");await page.getByRole("button",{name:"Create new campaign",exact:true}).first().click();await expect(page.locator("[aria-labelledby=saved-drafts-title] [role=alert]")).toContainText("Could not load saved drafts");await expect(page.getByText("No saved drafts yet.",{exact:true})).toHaveCount(0);const before=reads;await toggleEditorLanguage(page);await expect(page.locator("[aria-labelledby=saved-drafts-title] [role=alert]")).toContainText("Không tải được bản nháp đã lưu");expect(reads).toBe(before);
});
