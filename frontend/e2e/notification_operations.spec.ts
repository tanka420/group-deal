import {operatorFixtureWallet,operatorFixtureStatus} from './fixtures/operator-enrollment';
import {selectOperatorSection} from './fixtures/operator-navigation';
import {test,expect,Page} from "@playwright/test";
// API data fixtures exercise product code. They are not provider, principal or chain acceptance.
const txHash="0x"+"ab".repeat(32),hubAddress="0x"+"11".repeat(20);
const source={kind:"CHAIN_EVENT",eventId:`5042002_${hubAddress}_${txHash}_0`,eventName:"CommitmentMade",chainId:5042002,hubAddress,txHash,blockNumber:123,blockHash:"0x"+"cd".repeat(32),logIndex:0,occurredAt:1700000001000};
const notification=(userId="fixture")=>({id:"ntf_fixture_event",userId,type:"ORDER_COMMITTED",title:"Cam kết đã xác nhận fixture",message:"Sự kiện đã được ghi nhận.",translations:{en:{title:"Fixture commitment confirmed",message:"The event was recorded."}},createdAt:Date.now(),source,privateField:"fixture-private-not-rendered"});
const job=()=>({id:"mail_ntf_fixture_event",notificationId:"ntf_fixture_event",purpose:"EVENT_NOTIFICATION",status:"DLQ",attempts:5,attemptLimit:5,createdAt:1700000001000,nextAttemptAt:1700000002000,lastError:"PROVIDER_NOT_ACKNOWLEDGED",redriveCount:0,redriveRequestIds:[] as string[],canRedrive:true,redriveReason:"READY",canCancel:false,source,privateField:"fixture-private-not-rendered"});
async function fixture(page:Page,language="vi",roles=["buyer","operator"]){
  await page.addInitScript(({lang,admin})=>{localStorage.setItem("groupdeal_token","local-fixture-session");if(admin)localStorage.setItem("groupdeal_admin_token","local-fixture-admin-session");localStorage.setItem("groupdeal_lang",lang);localStorage.setItem("groupdeal_operation_checkpoints","notification-fixture-unchanged");},{lang:language,admin:roles.includes("operator")});
  await page.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  await page.route("**/api/**",r=>r.fulfill({json:{campaigns:[],notifications:[],unread:0,orders:[],operations:[],pagination:{nextCursor:null},disputes:[],sellers:[],logs:[],report:null,resources:[],products:[],drafts:[],webhook:null}}));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:'export class W3SSdk{updateConfigs(){} getDeviceId(){return Promise.reject(new Error("Local fixture"))}};'}));
  await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,usdcBalance:null,walletMode:"NONE"});'}));
  await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:"fixture",email:null,roles,loginMethod:"EVM_WALLET",emailVerified:false,activeWallet:roles.includes('operator')?operatorFixtureWallet:null}}}));
  await page.route("**/api/admin-auth/me",r=>r.fulfill({json:{user:{id:"fixture",email:null,roles,loginMethod:"EVM_WALLET",emailVerified:false,activeWallet:roles.includes('operator')?operatorFixtureWallet:null}}}));
  await page.route("**/api/notifications/preferences",r=>r.fulfill({json:{preferences:{inApp:true,email:false},contactStatus:"MISSING"}}));

 await page.route('**/api/admin-auth/operator/enrollment',async r=>{const now=await page.evaluate(()=>Date.now());return r.fulfill({json:operatorFixtureStatus('fixture',roles.includes('operator')?operatorFixtureWallet:null,roles.includes('operator'),true,now)});});
}
const bell=(page:Page,en=false)=>page.getByRole("button",{name:en?/^Notifications(?:,|$)/:/^Thông báo(?:,|$)/});
const inbox=(page:Page,en=false)=>page.getByRole("region",{name:en?"Your notifications":"Thông báo của bạn",exact:true});
const scopeUnchanged=async(page:Page)=>{expect(await page.evaluate(()=>localStorage.getItem("groupdeal_operation_checkpoints"))).toBe("notification-fixture-unchanged");await expect(page.locator("body")).not.toContainText("fixture-private-not-rendered");};
for(const language of ['vi','en'])test(`notification panel ${language} fits both viewport edges across wrapped and desktop headers`,async({page},info)=>{
  await fixture(page,language);await page.route("**/api/notifications?**",r=>r.fulfill({json:{notifications:[notification()],unread:1,pagination:{nextCursor:null}}}));
  await page.goto("/");for(const [width,font] of [[320,16],[375,16],[430,16],[768,16],[1024,16],[1440,16],[375,32]]){await page.setViewportSize({width,height:700});await page.evaluate(size=>{document.documentElement.style.fontSize=`${size}px`;},font);const headerBounds=await page.evaluate(()=>{const boxes=['.header .logo-group','.header .mobile-menu-button','.header .header-actions'].map(s=>({selector:s,rect:document.querySelector(s).getBoundingClientRect().toJSON()}));return {viewport:innerWidth,font:getComputedStyle(document.documentElement).fontSize,boxes,fits:boxes.every((a,i)=>boxes.every((b,j)=>i===j||Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)<=1||Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)<=1))};});expect(headerBounds,JSON.stringify(headerBounds)).toMatchObject({fits:true});await bell(page,language==='en').click();const menu=page.locator(".account-dropdown-menu");await expect(menu).toBeVisible();await expect.poll(async()=>{const rect=await menu.boundingBox();return rect&&rect.x>=11&&rect.x+rect.width<=width-11?'inside':JSON.stringify({rect,width,font});}).toBe('inside');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);if(font===32)await page.screenshot({path:info.outputPath(`notification-panel-${language}-text200.png`)});await page.keyboard.press("Escape");await expect(bell(page,language==='en')).toBeFocused();}await scopeUnchanged(page);
});
for(const language of ["vi","en"])test(`inbox ${language} source time pagination and lost read acknowledgement`,async({page},info)=>{
  await fixture(page,language);await page.setViewportSize({width:375,height:700});const en=language==="en";
  let current:any=notification(),writes=0;const cursors:string[]=[];
  await page.route("**/api/notifications**",async r=>{
    const url=new URL(r.request().url());
    if(url.pathname==="/api/notifications"){
      const cursor=url.searchParams.get("cursor");if(cursor)cursors.push(cursor);
      await r.fulfill({json:{notifications:cursor?[{...notification(),id:"ntf_fixture_older",source:undefined,title:"Thông báo cũ fixture",translations:{en:{title:"Fixture legacy notification",message:"Older stored text."}}}]:[current],unread:current.readAt?0:1,pagination:{nextCursor:cursor?null:"older-fixture-cursor"}}});
    }else if(url.pathname.endsWith("/read")){writes++;current={...current,readAt:1700000010000};await r.abort("failed");}
    else await r.fallback();
  });
  await page.goto("/");await bell(page,en).click();const panel=inbox(page,en);await expect(panel).toContainText(en?"Fixture commitment confirmed":"Cam kết đã xác nhận fixture");await expect(panel).toContainText(en?"Verified chain event":"Sự kiện chain đã xác minh");
  expect(await panel.locator("time").getAttribute("datetime")).toBe(new Date(source.occurredAt).toISOString());
  await panel.getByRole("button",{name:en?"Older notifications":"Thông báo trước",exact:true}).click();await expect(panel.locator(".notification-item")).toHaveCount(2);expect(cursors).toEqual(["older-fixture-cursor"]);await expect(panel).toContainText(en?"Legacy notification: event source unavailable":"Thông báo cũ: chưa có nguồn sự kiện");
  await panel.locator(".notification-item").first().click();await expect(panel.getByRole("alert")).toHaveCount(1);expect(writes).toBe(1);await expect(panel.locator(".notification-item").first()).toHaveAttribute("data-read","false");
  await panel.getByRole("button",{name:en?"Reload notifications":"Tải lại thông báo",exact:true}).click();await expect(panel.locator(".notification-item").first()).toHaveAttribute("data-read","true");expect(writes).toBe(1);await scopeUnchanged(page);
  await page.screenshot({path:info.outputPath(`inbox-${language}-375.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
for(const failure of ["foreign-account","malformed-json","incomplete-source"])test(`inbox rejects ${failure} without exposing or acknowledging data`,async({page})=>{
  await fixture(page);await page.route("**/api/notifications?**",r=>failure==="malformed-json"?r.fulfill({body:"invalid",contentType:"application/json"}):r.fulfill({json:{notifications:[failure==="foreign-account"?notification("other-account"):{...notification(),source:{kind:"CHAIN_EVENT",eventId:source.eventId,occurredAt:source.occurredAt}}],unread:1}}));
  await page.goto("/");await bell(page).click();const panel=inbox(page);await expect(panel.getByRole("alert")).toHaveCount(1);await expect(panel.locator(".notification-item")).toHaveCount(0);await scopeUnchanged(page);
});
test("inbox delayed former-account response cannot replace current-account data",async({page})=>{
  test.skip(process.env.GROUPDEAL_BROWSER_MODE==="preview","Account-switch fixture replaces a dev module; built cases use the real auth context.");
  await fixture(page);await page.route("**/src/context/AuthContext.tsx*",r=>r.fulfill({contentType:"application/javascript",body:'window.__notificationScope={epoch:1,user:{id:"scope-a",roles:["buyer"],loginMethod:"EVM_WALLET",activeWallet:null},token:"scope-a-session"};export const AuthProvider=({children})=>children;export const useAuth=()=>({...window.__notificationScope,isLoading:false,getSessionEpoch:()=>window.__notificationScope.epoch,refreshUser:async()=>{}});'}));
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route("**/api/notifications?**",async r=>{const old=r.request().headers().authorization==="Bearer scope-a-session";if(old)await gate;try{await r.fulfill({json:{notifications:[{...notification(old?"scope-a":"scope-b"),title:old?"Former account private fixture":"Current account public fixture",translations:undefined}],unread:1}});}catch{}});
  await page.goto("/");await bell(page).click();await expect(inbox(page).getByRole("status")).toHaveCount(1);
  await page.locator('.account-pill-btn').click();await page.evaluate(()=>{(window as any).__notificationScope={epoch:2,user:{id:"scope-b",roles:["buyer"],loginMethod:"EVM_WALLET",activeWallet:null},token:"scope-b-session"};});
  await page.getByRole("button",{name:/Ngôn ngữ:/}).click();await bell(page,true).click();await expect(inbox(page,true)).toContainText("Current account public fixture");release();await expect(page.locator("body")).not.toContainText("Former account private fixture");await scopeUnchanged(page);
});
async function openOutbox(page:Page,en=false){await page.goto("/#operator");await selectOperatorSection(page,{name:en?"Email outbox":"Hàng đợi email",exact:true});return page.getByRole("region",{name:en?"Email outbox operations":"Vận hành email outbox",exact:true});}
for(const language of ['vi','en'])test(`restored operator outbox ${language} keeps held history and exposes no retry or cancellation action`,async({page},info)=>{
  await fixture(page,language);await page.setViewportSize({width:375,height:700});const en=language==='en';let writes=0;
  await page.route('**/api/operator/email-outbox**',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({json:{jobs:[{...job(),status:'QUEUED',attempts:0,canRedrive:false,canCancel:false,redriveReason:'RESTORED_WORK_REVIEW_REQUIRED'}],pagination:{nextCursor:null},providerConfigured:true}});});
  const panel=await openOutbox(page,en);await expect(panel.getByRole('article')).toHaveCount(1);await expect(panel).toContainText(en?'This restored job is on hold':'Job phục hồi đang được giữ');await expect(panel.getByRole('button',{name:en?'Review redrive':'Xem yêu cầu gửi lại',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:en?'Review cancellation':'Xem yêu cầu hủy',exact:true})).toHaveCount(0);await panel.getByRole('button',{name:en?'Reload outbox':'Tải lại outbox',exact:true}).click();await expect(panel).toContainText(en?'This restored job is on hold':'Job phục hồi đang được giữ');expect(writes).toBe(0);await scopeUnchanged(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);await page.screenshot({path:info.outputPath(`restored-outbox-${language}-375.png`),fullPage:true});
});
for(const language of ["vi","en"])test(`operator outbox ${language} explicit bounded redrive and cancellation at375px`,async({page},info)=>{
  await fixture(page,language);await page.setViewportSize({width:375,height:700});const en=language==="en";let current=job(),writes:any[]=[];
  await page.route("**/api/operator/email-outbox**",async r=>{
    if(r.request().url().endsWith("/redrive")){const body=r.request().postDataJSON();writes.push(body);current={...current,status:"RETRY",attemptLimit:10,redriveCount:1,redriveRequestIds:[body.idempotencyKey],canRedrive:false,redriveReason:"JOB_NOT_DLQ",canCancel:true};await r.fulfill({status:202,json:{job:current,requestId:body.idempotencyKey}});}
    else if(r.request().url().endsWith("/cancel")){writes.push(r.request().postDataJSON());current={...current,status:"CANCELLED",canCancel:false};await r.fulfill({json:{job:current}});}
    else await r.fulfill({json:{jobs:[current],pagination:{nextCursor:null},providerConfigured:true}});
  });
  const panel=await openOutbox(page,en);await expect(panel.getByRole("article")).toHaveCount(1);expect(writes).toHaveLength(0);
  await panel.getByRole("button",{name:en?"Review redrive":"Xem yêu cầu gửi lại",exact:true}).click();expect(writes).toHaveLength(0);await expect(panel.getByRole("group")).toContainText(en?"up to five sends":"tối đa 5 lần gửi");await panel.getByRole("button",{name:en?"Confirm outbox action":"Xác nhận thao tác",exact:true}).click();
  await expect(panel.getByRole("status")).toContainText(en?"The request is recorded":"Đã ghi nhận yêu cầu");await expect(panel.getByRole("status")).toBeFocused();expect(writes).toHaveLength(1);expect(writes[0].expectedAttempts).toBe(5);expect(writes[0].expectedRedriveCount).toBe(0);expect(writes[0].idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  await panel.getByRole("button",{name:en?"Review cancellation":"Xem yêu cầu hủy",exact:true}).click();await panel.getByRole("button",{name:en?"Confirm outbox action":"Xác nhận thao tác",exact:true}).click();await expect(panel.getByRole("article")).toContainText(en?"Cancelled":"Đã hủy");expect(writes).toHaveLength(2);expect(writes[1]).toEqual({});await scopeUnchanged(page);
  await expect(panel.getByRole("status")).toBeFocused();expect(await panel.getByRole("status").evaluate(element=>{const r=element.getBoundingClientRect(),header=document.querySelector(".header")!.getBoundingClientRect();return r.top>=header.bottom&&r.bottom<=innerHeight;})).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath(`operator-outbox-${language}-375.png`),fullPage:true});
});
for(const outcome of ["lost-ack","wrong-confirmation","malformed-json"])test(`operator redrive ${outcome} recovers target beyond status filter without repeating writes`,async({page})=>{
  await fixture(page);let current=job(),writes=0,targetReads=0;
  await page.route("**/api/operator/email-outbox**",async r=>{
    const url=new URL(r.request().url());
    if(url.pathname.endsWith("/redrive")){writes++;const body=r.request().postDataJSON();if(outcome==="lost-ack"){current={...current,status:"RETRY",attemptLimit:10,redriveCount:1,redriveRequestIds:[body.idempotencyKey],canRedrive:false,redriveReason:"JOB_NOT_DLQ",canCancel:true};await r.abort("failed");}else if(outcome==="malformed-json")await r.fulfill({body:"invalid",contentType:"application/json"});else await r.fulfill({json:{job:{...current,id:"mail_ntf_wrong_job"},requestId:body.idempotencyKey}});}
    else if(url.pathname.endsWith("/"+current.id)){targetReads++;await r.fulfill({json:{job:current}});}
    else await r.fulfill({json:{jobs:url.searchParams.get("status")==="DLQ"&&current.status!=="DLQ"?[]:[current],pagination:{nextCursor:null},providerConfigured:true}});
  });
  const panel=await openOutbox(page);await expect(panel.getByRole("article")).toHaveCount(1);await panel.getByRole("button",{name:"Xem yêu cầu gửi lại",exact:true}).click();await panel.getByRole("button",{name:"Xác nhận thao tác",exact:true}).click();await expect(panel.getByRole("alert")).toHaveCount(1);await expect(panel).not.toContainText("Đã ghi nhận yêu cầu");
  await panel.getByRole("combobox",{name:"Trạng thái",exact:true}).selectOption("DLQ");
  if(outcome==="lost-ack"){await expect(panel.getByRole("status")).toContainText("Đã ghi nhận yêu cầu");await expect(panel.getByRole("article")).toHaveCount(0);}else{await expect(panel.getByRole("article")).toHaveCount(1);await expect(panel).not.toContainText("Đã ghi nhận yêu cầu");}
  expect(writes).toBe(1);expect(targetReads).toBeGreaterThan(0);await scopeUnchanged(page);
});
test("operator outbox signed cursor is forwarded only on explicit older-page request",async({page})=>{
  await fixture(page);const cursors:string[]=[];await page.route("**/api/operator/email-outbox**",r=>{const cursor=new URL(r.request().url()).searchParams.get("cursor");if(cursor)cursors.push(cursor);return r.fulfill({json:{jobs:[cursor?{...job(),id:"mail_ntf_older_event",notificationId:"ntf_older_event",canRedrive:false,redriveReason:"SOURCE_UNVERIFIED"}:job()],pagination:{nextCursor:cursor?null:"owned-cursor-fixture"},providerConfigured:false}});});
  const panel=await openOutbox(page);await expect(panel.getByRole("article")).toHaveCount(1);expect(cursors).toHaveLength(0);await panel.getByRole("button",{name:"Job outbox trước",exact:true}).click();await expect(panel.getByRole("article")).toHaveCount(2);expect(cursors).toEqual(["owned-cursor-fixture"]);await expect(panel).toContainText("Chưa cấu hình provider email");await scopeUnchanged(page);
});
