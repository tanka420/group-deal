import {test,expect,Page} from '@playwright/test';

const secret='whsec_'+'1'.repeat(48),otherSecret='whsec_'+'2'.repeat(48);
async function setup(page:Page,language='vi',mode='success'){
  await page.addInitScript(({language,mode})=>{
    localStorage.setItem('groupdeal_token','local-fixture-session');localStorage.setItem('groupdeal_lang',language);
    (window as any).__copies=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{
      (window as any).__copies.push(value);
      if(mode==='denied')throw new Error('fixture-only clipboard denial');
      if(mode==='pending')await new Promise(resolve=>(window as any).__finishCopy=resolve);
    }}});
  },{language,mode});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/**',r=>r.fulfill({json:{campaigns:[],orders:[],operations:[],notifications:[],unread:0,pagination:{nextCursor:null},products:[],drafts:[]}}));
  await page.route('**/*circle-fin_w3s-pw-web-sdk.js*',r=>r.fulfill({contentType:'application/javascript',body:'export class W3SSdk{updateConfigs(){} getDeviceId(){return Promise.reject(new Error("Local fixture"))}};'}));
  await page.route('**/src/context/Web3Context.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,usdcBalance:null,walletMode:"NONE"});'}));
  await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'fixture',email:'seller@example.test',roles:['buyer','seller'],loginMethod:'EVM_WALLET',activeWallet:null}}}));
  await page.route('**/api/notifications/preferences',r=>r.fulfill({json:{preferences:{inApp:true,email:false},contactStatus:'VERIFIED'}}));
  let writes=0;
  await page.route('**/api/seller/webhooks',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({json:{webhook:{id:'wh_fixture',sellerId:'fixture',targetUrl:'https://public.example.test/hook',events:['order.delivered'],secret,logs:[],restoredReviewRequired:false,canConfigure:true,canEnqueue:true}}});});
  return ()=>writes;
}
async function open(page:Page,language='vi'){
  await page.goto('/seller/integrations');
  await expect(page.locator('#seller-webhook-secret')).toBeVisible();
  return {field:page.locator('#seller-webhook-secret'),copy:page.getByRole('button',{name:language==='en'?'Copy secret':'Sao chép secret',exact:true}),show:page.getByRole('button',{name:language==='en'?'Show secret':'Hiện secret',exact:true})};
}
for(const language of ['vi','en']){
  test(`webhook ${language}: copies the full secret without revealing it or saving settings`,async({page},info)=>{
    const writes=await setup(page,language),ui=await open(page,language);
    await expect(ui.field).toHaveAttribute('type','password');await expect(ui.field).toHaveAttribute('readonly','');
    await ui.copy.focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({hasText:language==='en'?'Secret copied.':'Đã sao chép secret.'})).toBeVisible();
    expect(await page.evaluate(()=>(window as any).__copies)).toEqual([secret]);await expect(ui.field).toHaveAttribute('type','password');expect(writes()).toBe(0);
    for(const width of [320,375,1440]){await page.setViewportSize({width,height:820});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
    await page.setViewportSize({width:375,height:820});await page.screenshot({path:info.outputPath('webhook-secret-'+language+'-375.png'),fullPage:true});
  });
  test(`webhook ${language}: denied clipboard offers usable show, select and hide controls`,async({page})=>{
    const writes=await setup(page,language,'denied'),ui=await open(page,language);await ui.copy.click();
    await expect(page.getByRole('alert')).toContainText(language==='en'?'Could not copy':'Chưa sao chép được');
    await ui.show.click();await expect(ui.field).toHaveAttribute('type','text');await expect(ui.field).toHaveValue(secret);
    await ui.field.focus();await ui.field.press('ControlOrMeta+A');
    expect(await ui.field.evaluate((el:HTMLInputElement)=>[el.selectionStart,el.selectionEnd])).toEqual([0,secret.length]);
    await page.getByRole('button',{name:language==='en'?'Hide secret':'Ẩn secret',exact:true}).click();await expect(ui.field).toHaveAttribute('type','password');
    expect(await page.evaluate(s=>Object.values(localStorage).some(v=>v.includes(s)),secret)).toBe(false);expect(writes()).toBe(0);
  });
}
test('restored held subscription never exposes copy or reveal controls',async({page})=>{
  await setup(page);
  await page.route('**/api/seller/webhooks',r=>r.fulfill({json:{webhook:{id:'wh_fixture',sellerId:'fixture',targetUrl:'https://public.example.test/hook',events:['order.delivered'],secret:null,logs:[],restoredReviewRequired:true,canConfigure:false,canEnqueue:false}}}));
  await page.route('**/api/seller/webhooks/recovery-reviews',r=>r.fulfill({json:{review:null,enabledForNewEvents:false}}));
  await page.goto('/seller/integrations');await expect(page.locator('#seller-webhook-url')).toBeDisabled();
  await expect(page.locator('#seller-webhook-secret')).toHaveCount(0);await expect(page.getByRole('button',{name:'Sao chép secret',exact:true})).toHaveCount(0);
});
test('reload hides a revealed secret without persisting it',async({page})=>{
  await setup(page);const ui=await open(page);await ui.show.click();await expect(ui.field).toHaveAttribute('type','text');await page.reload();await expect(ui.field).toHaveAttribute('type','password');
  expect(await page.evaluate(s=>Object.values(localStorage).some(v=>v.includes(s)),secret)).toBe(false);
});
test('old-account clipboard completion cannot reveal or announce a new account secret',async({page})=>{
  test.skip(process.env.GROUPDEAL_BROWSER_MODE==='preview','Source-module account switch fixture; built behavior is covered by the other cases.');
  await setup(page,'vi','pending');
  await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'window.__copyScope={epoch:1,user:{id:"scope-a",roles:["buyer","seller"],loginMethod:"EVM_WALLET",activeWallet:null},token:"scope-a-session"};export const AuthProvider=({children})=>children;export const useAuth=()=>({...window.__copyScope,getSessionEpoch:()=>window.__copyScope.epoch});'}));
  await page.route('**/api/seller/webhooks',r=>{const a=r.request().headers().authorization==='Bearer scope-a-session';return r.fulfill({json:{webhook:{id:a?'wh_a':'wh_b',sellerId:a?'scope-a':'scope-b',targetUrl:'https://public.example.test/hook',events:['order.delivered'],secret:a?secret:otherSecret,logs:[],restoredReviewRequired:false,canConfigure:true,canEnqueue:true}}});});
  const ui=await open(page);await ui.show.click();await ui.copy.click();
  await page.evaluate(()=>{(window as any).__copyScope={epoch:2,user:{id:'scope-b',roles:['buyer','seller'],loginMethod:'EVM_WALLET',activeWallet:null},token:'scope-b-session'};window.dispatchEvent(new Event('groupdeal:navigate'));});
  await expect(ui.field).toHaveValue(otherSecret);await expect(ui.field).toHaveAttribute('type','password');
  await page.evaluate(()=>(window as any).__finishCopy());await expect(page.getByText('Đã sao chép secret.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Sao chép secret',exact:true})).toBeEnabled();
});
