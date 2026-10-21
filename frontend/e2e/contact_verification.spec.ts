import {test,expect,Page} from "@playwright/test";
const challengeId="ctc_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const target="contact-fixture@example.test",masked="c***@example.test";
const empty=()=>({userId:"fixture",status:"MISSING",revision:0,emailMasked:null,verifiedAt:null,lastVerificationId:null,challenge:null as any});
const requested=()=>({...empty(),status:"UNVERIFIED",challenge:{id:challengeId,emailMasked:masked,requestedAt:Date.now(),expiresAt:Date.now()+300000,resendAfter:Date.now()+60000,attemptsRemaining:5,state:"PENDING",mailStatus:"QUEUED"}});
const verified=()=>({...requested(),status:"VERIFIED",revision:1,emailMasked:masked,verifiedAt:Date.now(),lastVerificationId:challengeId,challenge:{...requested().challenge,state:"VERIFIED",mailStatus:"SENT"}});
async function fixture(page:Page,language="vi"){
  await page.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  await page.addInitScript(lang=>{localStorage.setItem("groupdeal_token","local-fixture-session");localStorage.setItem("groupdeal_lang",lang);localStorage.setItem("groupdeal_operation_checkpoints","fixture-contact-checkpoint");},language);
  await page.route("**/api/**",r=>r.fulfill({json:{campaigns:[],notifications:[],unread:0}}));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:'export class W3SSdk{updateConfigs(){} getDeviceId(){return Promise.reject(new Error("Local fixture"))}};'}));
  await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,usdcBalance:null,walletMode:"NONE"});'}));
  await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:"fixture",email:null,roles:["buyer"],loginMethod:"EVM_WALLET",emailVerified:false,activeWallet:null}}}));
  await page.route("**/api/notifications/preferences",r=>r.fulfill({json:{preferences:{inApp:true,email:false},contactStatus:"MISSING"}}));
}
const labels=(en:boolean)=>({open:en?"Contact email":"Email liên hệ",region:en?"Contact email settings":"Cài đặt email liên hệ",email:en?"Contact email address":"Địa chỉ email liên hệ",send:en?"Send verification code":"Gửi mã xác minh",code:en?"Six-digit code":"Mã 6 chữ số",verify:en?"Verify contact":"Xác minh liên hệ",reload:en?"Reload contact status":"Tải lại trạng thái liên hệ",confirmed:en?"Contact email verified.":"Đã xác minh email liên hệ."});
async function open(page:Page,en=false){await page.goto("/account");await page.getByRole("button",{name:labels(en).open,exact:true}).click();return page.getByRole("region",{name:labels(en).region,exact:true});}
async function untouched(page:Page){
  expect(await page.evaluate(()=>localStorage.getItem("groupdeal_operation_checkpoints"))).toBe("fixture-contact-checkpoint");
  expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain(target);
}
for(const language of ["vi","en"])test(`contact ${language} explicit request verification removal and mobile scope`,async({page},info)=>{
  await fixture(page,language);await page.setViewportSize({width:320,height:650});const en=language==="en",n=labels(en);
  let current=empty(),requests:any[]=[],attempts:any[]=[],removes=0;
  await page.route("**/api/notifications/contact**",async r=>{
    if(r.request().url().endsWith("/request")){requests.push(r.request().postDataJSON());current=requested();await r.fulfill({status:202,json:{contact:current}});}
    else if(r.request().url().endsWith("/verify")){attempts.push(r.request().postDataJSON());current=verified();await r.fulfill({json:{contact:current}});}
    else if(r.request().method()==="DELETE"){removes++;current={...empty(),revision:2};await r.fulfill({json:{contact:current}});}
    else await r.fulfill({json:{contact:current}});
  });
  const panel=await open(page,en);await expect(panel.getByLabel(n.email,{exact:true})).toBeEnabled();expect(requests).toHaveLength(0);
  await panel.getByLabel(n.email,{exact:true}).fill(target);await panel.getByRole("button",{name:n.send,exact:true}).click();
  await expect(panel).toContainText(en?"Verification email is queued":"Email xác minh đang chờ");await expect(panel).not.toContainText(en?"Contact email verified.":"Đã xác minh email liên hệ.");
  expect(requests).toHaveLength(1);expect(requests[0].email).toBe(target);expect(requests[0].language).toBe(language);expect(requests[0].idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  await panel.getByLabel(n.code,{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`contact-${language}-pending-mobile.png`)});
  await panel.getByLabel(n.code,{exact:true}).fill("000042");await panel.getByRole("button",{name:n.verify,exact:true}).click();await expect(panel.getByRole("status")).toHaveText(n.confirmed);
  expect(attempts).toHaveLength(1);expect(attempts[0].challengeId).toBe(challengeId);
  await expect(page.getByRole("checkbox",{name:en?"Email notifications":"Thông báo qua email",exact:true})).not.toBeChecked();await untouched(page);
  await panel.getByRole("button",{name:en?"Remove contact email":"Xóa email liên hệ",exact:true}).click();expect(removes).toBe(0);
  await panel.getByRole("button",{name:en?"Confirm removal":"Xác nhận xóa",exact:true}).click();await expect(panel).toContainText(en?"No verified contact email.":"Chưa có email liên hệ đã xác minh.");expect(removes).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await panel.getByRole("button",{name:n.reload,exact:true}).focus();expect(await panel.getByRole("button",{name:n.reload,exact:true}).evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight;})).toBe(true);
  await page.screenshot({path:info.outputPath(`contact-${language}-mobile.png`)});
  await page.getByRole("button",{name:n.open,exact:true}).click();await expect(panel).toHaveCount(0);await expect(page.getByRole("button",{name:n.open,exact:true})).toBeFocused();
});

for(const outcome of ["lost-ack","wrong-confirmation","malformed-json","rate-limit"])test(`contact verification ${outcome} requires confirmed matching challenge`,async({page})=>{
  await fixture(page);let current=requested(),writes=0;
  await page.route("**/api/notifications/contact**",async r=>{
    if(r.request().url().endsWith("/verify")){
      writes++;
      if(outcome==="lost-ack"){current=verified();await r.abort("failed");}
      else if(outcome==="wrong-confirmation")await r.fulfill({json:{contact:{...verified(),lastVerificationId:"ctc_11111111-2222-4333-8444-555555555555"}}});
      else if(outcome==="malformed-json")await r.fulfill({body:"invalid",contentType:"application/json"});
      else await r.fulfill({status:429,headers:{"Retry-After":"60"},json:{error:"CONTACT_RATE_LIMIT"}});
    }else await r.fulfill({json:{contact:current}});
  });
  const panel=await open(page);await expect(panel.getByLabel(labels(false).code,{exact:true})).toBeEnabled();await panel.getByLabel(labels(false).code,{exact:true}).fill("000042");await panel.getByRole("button",{name:labels(false).verify,exact:true}).click();
  await expect(panel.getByRole("alert")).toHaveCount(1);await expect(panel).not.toContainText(labels(false).confirmed);expect(writes).toBe(1);await expect(panel.getByLabel(labels(false).code,{exact:true})).toHaveValue("");
  await panel.getByRole("button",{name:labels(false).reload,exact:true}).click();
  if(outcome==="lost-ack")await expect(panel.getByRole("status")).toHaveText(labels(false).confirmed);
  else await expect(panel).not.toContainText(labels(false).confirmed);
  expect(writes).toBe(1);await untouched(page);
});

test("contact request lost ACK retries one idempotency key and never stores input",async({page})=>{
  await fixture(page);let current=empty(),keys:string[]=[];
  await page.route("**/api/notifications/contact**",async r=>{
    if(r.request().url().endsWith("/request")){keys.push(r.request().postDataJSON().idempotencyKey);current=requested();if(keys.length===1)await r.abort("failed");else await r.fulfill({status:202,json:{contact:current}});}
    else await r.fulfill({json:{contact:current}});
  });
  const panel=await open(page);await expect(panel.getByLabel(labels(false).email,{exact:true})).toBeEnabled();await panel.getByLabel(labels(false).email,{exact:true}).fill(target);await panel.getByRole("button",{name:labels(false).send,exact:true}).click();await expect(panel.getByRole("alert")).toHaveCount(1);
  await panel.getByRole("button",{name:labels(false).send,exact:true}).click();await expect(panel.getByLabel(labels(false).code,{exact:true})).toBeEnabled();expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);await untouched(page);
});

test("contact expired locked and wrong-account DTO remain unusable",async({page})=>{
  await fixture(page);let current={...requested(),challenge:{...requested().challenge,state:"LOCKED",attemptsRemaining:0}};
  await page.route("**/api/notifications/contact**",r=>r.fulfill({json:{contact:current}}));
  const panel=await open(page);await expect(panel).toContainText("Yêu cầu đã hết hạn, bị khóa hoặc hủy");await expect(panel.getByRole("form",{name:"Xác minh mã liên hệ"})).toHaveCount(0);
  current={...requested(),challenge:{...requested().challenge,expiresAt:Date.now()-1,requestedAt:Date.now()-300001,resendAfter:Date.now()-240001}};
  await panel.getByRole("button",{name:labels(false).reload,exact:true}).click();await expect(panel.getByRole("form",{name:"Xác minh mã liên hệ"})).toHaveCount(0);
  current={...empty(),userId:"other-user"} as any;await panel.getByRole("button",{name:labels(false).reload,exact:true}).click();await expect(panel.getByRole("alert")).toHaveCount(1);await expect(panel).not.toContainText("other-user");await untouched(page);
});

test("contact close aborts pending load and reopening clears transient email/code",async({page})=>{
  await fixture(page);let delayed=true,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route("**/api/notifications/contact**",async r=>{if(delayed)await gate;try{await r.fulfill({json:{contact:requested()}});}catch{}});
  const panel=await open(page);await expect(panel.getByRole("status")).toContainText("Đang kiểm tra");await page.getByRole("button",{name:labels(false).open,exact:true}).click();await expect(panel).toHaveCount(0);delayed=false;release();
  await page.getByRole("button",{name:labels(false).open,exact:true}).click();await expect(panel.getByLabel(labels(false).code,{exact:true})).toBeEnabled();await panel.getByLabel(labels(false).email,{exact:true}).fill(target);await panel.getByLabel(labels(false).code,{exact:true}).fill("000042");
  await page.getByRole("button",{name:labels(false).open,exact:true}).click();await page.getByRole("button",{name:labels(false).open,exact:true}).click();await expect(panel.getByLabel(labels(false).code,{exact:true})).toHaveValue("");await expect(panel.getByLabel(labels(false).email,{exact:true})).toHaveValue("");await untouched(page);
});
