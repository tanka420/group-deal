import {test,expect,Page} from "@playwright/test";
async function fixture(page:Page,language="vi") {
  await page.addInitScript(lang=>{localStorage.setItem("groupdeal_token","local-fixture-session");localStorage.setItem("groupdeal_lang",lang);localStorage.setItem("groupdeal_operation_checkpoints","fixture-checkpoint-unchanged");},language);
  await page.route("**/api/**",r=>r.fulfill({json:{campaigns:[],notifications:[],unread:0}}));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*",r=>r.fulfill({contentType:"application/javascript",body:'export class W3SSdk{updateConfigs(){} getDeviceId(){return Promise.reject(new Error("Local fixture"))}};'}));
  await page.route("**/src/context/Web3Context.tsx*",r=>r.fulfill({contentType:"application/javascript",body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,usdcBalance:null,walletMode:"NONE"});'}));
  await page.route("**/api/auth/me",r=>r.fulfill({json:{user:{id:"fixture",email:null,roles:["buyer","seller"],loginMethod:"EVM_WALLET",emailVerified:false,activeWallet:null}}}));
}
const names=(en:boolean)=>({form:en?"Notification preferences":"Tùy chọn thông báo",email:en?"Email notifications":"Thông báo qua email",inApp:en?"In-app notifications":"Thông báo trong ứng dụng",save:en?"Save preferences":"Lưu tùy chọn",reload:en?"Reload preferences":"Tải lại tùy chọn",saved:en?"Preferences saved.":"Đã lưu tùy chọn."});
for(const language of ["vi","en"])for(const contactStatus of ["VERIFIED","UNVERIFIED","MISSING"])test(`notification preferences ${language} ${contactStatus} preserve confirmed values and scope`,async({page})=>{
  await fixture(page,language);await page.setViewportSize({width:375,height:700});const en=language==="en",n=names(en);
  let preferences={inApp:true,email:true},writes:any[]=[];
  await page.route("**/api/notifications/preferences",async r=>{
    if(r.request().method()==="PUT"){writes.push(r.request().postDataJSON());preferences=r.request().postDataJSON();await r.fulfill({json:{preferences}});}
    else await r.fulfill({json:{preferences,contactStatus}});
  });
  await page.goto("/");const trigger=page.getByRole("button",{name:en?"Notifications":"Thông báo",exact:true});await trigger.click();
  const form=page.getByRole("form",{name:n.form});await expect(form.getByRole("checkbox",{name:n.email,exact:true})).toBeChecked();
  await expect(form).toContainText(contactStatus==="VERIFIED"?(en?"Verified contact email":"Email liên hệ đã xác minh"):(en?"No verified contact email":"Chưa có email liên hệ đã xác minh"));
  expect(writes).toHaveLength(0);await form.getByRole("checkbox",{name:n.email,exact:true}).uncheck();await form.getByRole("button",{name:n.save,exact:true}).click();
  await expect(form.getByRole("status")).toHaveText(n.saved);expect(writes).toEqual([{inApp:true,email:false}]);
  await form.getByRole("button",{name:n.reload,exact:true}).click();await expect(form.getByRole("checkbox",{name:n.email,exact:true})).not.toBeChecked();expect(writes).toHaveLength(1);
  expect(await page.evaluate(()=>localStorage.getItem("groupdeal_operation_checkpoints"))).toBe("fixture-checkpoint-unchanged");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await form.getByRole("checkbox",{name:n.inApp,exact:true}).focus();await page.keyboard.press("Escape");await expect(form).toHaveCount(0);await expect(trigger).toBeFocused();
});
for(const failure of ["http-error","wrong-confirmation","lost-ack","malformed-json"])test(`notification save ${failure} never reports unconfirmed success`,async({page})=>{
  await fixture(page);let preferences={inApp:true,email:true},writes=0;
  await page.route("**/api/notifications/preferences",async r=>{
    if(r.request().method()==="GET"){await r.fulfill({json:{preferences,contactStatus:"VERIFIED"}});return;}
    writes++;
    if(failure==="http-error")await r.fulfill({status:400,json:{error:"fixture rejected"}});
    else if(failure==="wrong-confirmation")await r.fulfill({json:{preferences}});
    else if(failure==="malformed-json")await r.fulfill({status:200,body:"invalid",contentType:"application/json"});
    else{preferences=r.request().postDataJSON();await r.abort("failed");}
  });
  await page.goto("/");await page.getByRole("button",{name:"Thông báo",exact:true}).click();const form=page.getByRole("form",{name:"Tùy chọn thông báo"});
  await expect(form.getByRole("checkbox",{name:"Thông báo qua email",exact:true})).toBeChecked();await form.getByRole("checkbox",{name:"Thông báo qua email",exact:true}).uncheck();await form.getByRole("button",{name:"Lưu tùy chọn",exact:true}).click();
  await expect(form.getByRole("alert")).toContainText("Chưa xác nhận");await expect(form).not.toContainText("Đã lưu tùy chọn.");expect(writes).toBe(1);
  await form.getByRole("button",{name:"Tải lại tùy chọn",exact:true}).click();await expect(form.getByRole("checkbox",{name:"Thông báo qua email",exact:true})).toBeChecked({checked:failure!=="lost-ack"});
  await expect(form.getByRole("alert")).toHaveCount(0);expect(writes).toBe(1);
});
test("notification unmount aborts delayed load; reopen can load current settings",async({page})=>{
  await fixture(page);await page.setViewportSize({width:320,height:400});let reads=0,delayed=true,release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route("**/api/notifications/preferences",async r=>{
    reads++;if(delayed)await gate;
    try{await r.fulfill({json:{preferences:{inApp:true,email:false},contactStatus:"MISSING"}});}catch{}
  });
  await page.goto("/");const trigger=page.getByRole("button",{name:"Thông báo",exact:true});await trigger.click();
  const form=page.getByRole("form",{name:"Tùy chọn thông báo"});await expect(form.getByRole("status")).toContainText("Đang tải");await trigger.click();await expect(form).toHaveCount(0);delayed=false;release();await trigger.click();
  await expect(form.getByRole("checkbox",{name:"Thông báo qua email",exact:true})).not.toBeChecked();await expect(form.getByRole("checkbox",{name:"Thông báo trong ứng dụng",exact:true})).toBeChecked();
  await expect(form.getByRole("button",{name:"Tải lại tùy chọn",exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await form.getByRole("button",{name:"Tải lại tùy chọn",exact:true}).focus();expect(await form.getByRole("button",{name:"Tải lại tùy chọn",exact:true}).evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight;})).toBe(true);
});
