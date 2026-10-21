import {test,expect,Page} from '@playwright/test';
import {masterFixture} from './fixtures/master-deal.mjs';
import {productInventoryFixture} from './fixtures/product-inventory';
const wallet='0x'+'1'.repeat(40),capability='b'.repeat(64);
async function base(page:Page,language='vi'){
 await page.addInitScript(language=>{localStorage.setItem('groupdeal_token','fixture-provider-session');localStorage.setItem('groupdeal_lang',language);},language);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',r=>r.fulfill({json:{campaigns:[],orders:[],operations:[],notifications:[],unread:0,products:[],resources:[],drafts:[],pagination:{nextCursor:null}}}));
 await page.route('**/*circle-fin_w3s-pw-web-sdk.js*',r=>r.fulfill({contentType:'application/javascript',body:'export class W3SSdk{updateConfigs(){} getDeviceId(){return "fixture-device"}};'}));
 await page.route('**/src/context/Web3Context.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const Web3Provider=({children})=>children;export const useWeb3=()=>({account:null,usdcBalance:null,walletMode:"NONE"});'}));
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'seller',email:null,roles:['seller','buyer'],loginMethod:'EVM_WALLET',activeWallet:wallet}}}));
 await page.route('**/api/notifications/preferences',r=>r.fulfill({json:{preferences:{inApp:true,email:false},contactStatus:'VERIFIED'}}));
}
async function fixture(page:Page,language='vi',mode='normal'){
 await base(page,language);const data=masterFixture(),product=data.product;
 const input={title:'Provider draft',description:'Provider fixture description',category:'Software',thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:'BUYER_COUNT',tiers:[{threshold:1,priceUSDC:'0.1'},{threshold:2,priceUSDC:'0.08'}],maxPerAccount:1,inventoryLimit:2,durationDays:1,deliverySlaHours:24,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmountUSDC:'0',earlyRebateBps:0,visibility:'UNLISTED',deliveryMethod:'WEBHOOK',deliveryContentTemplate:''};
 const view={draft:{id:'provider_draft',version:3,protocolVersion:1,resourceId:null,input},product,publication:null};let posts=0,publish=0,reads=0;const receipts=new Map<string,any>();
 await page.route('**/api/products/mine',r=>r.fulfill({json:productInventoryFixture([product],'seller')}));
 await page.route('**/api/seller/campaign-drafts',r=>r.fulfill({json:{drafts:[{id:view.draft.id,title:input.title,draftVersion:3,publicationLocked:false}],pagination:{nextCursor:null}}}));
 await page.route('**/api/seller/campaign-drafts/provider_draft',r=>{reads++;return r.fulfill({json:mode==='changed'&&reads>2?{...view,draft:{...view.draft,version:4}}:view});});
 await page.route('**/api/campaigns/provider_draft/provider-probes/*',r=>{const key=new URL(r.request().url()).pathname.split('/').pop()!;return receipts.has(key)?r.fulfill({json:receipts.get(key)}):r.fulfill({status:404,json:{error:'PROVIDER_PROOF_NOT_FOUND'}});});
 await page.route('**/api/campaigns/provider_draft/provider-probe',async r=>{posts++;expect(r.request().postDataJSON()).toEqual({expectedVersion:3});const key=r.request().headers()['idempotency-key'];const value={probe:{id:'provider_proof_fixture',campaignId:mode==='foreign'?'foreign':'provider_draft',productVersionId:product.version.id,licenseVersionId:'lv_fixture',method:'WEBHOOK',packageSha256:'a'.repeat(64),byteLength:6594,checkedAt:Date.now(),expiresAt:Date.now()+900000,evidenceHash:'0x'+'c'.repeat(64)}};receipts.set(key,value);if(mode==='lost'&&posts===1)return r.abort();return r.fulfill({json:value});});
 await page.route('**/api/campaigns/provider_draft/prepare-publish',r=>{publish++;const key=r.request().postDataJSON().idempotencyKey;return r.fulfill({json:{campaign:{...data.campaign,id:'provider_draft',title:input.title,durationSeconds:86400,status:'DRAFT'},operation:{id:'provider_pub_fixture',action:'PUBLISH',resourceId:'provider_draft',chainId:5042002,hubAddress:'0x'+'3'.repeat(40),principal:wallet,calldata:'0x00',phase:'PREPARED',idempotencyKey:key,expectedEventArgs:{},createdAt:Date.now(),updatedAt:Date.now()}}});});
 return{counts:()=>({posts,publish}),view};
}
async function open(page:Page,language='vi'){
 await page.goto('/seller/create');await page.getByRole('button',{name:language==='en'?'Open draft Provider draft':'Mở bản nháp Provider draft',exact:true}).click();await page.getByRole('button',{name:language==='en'?'Continue: delivery':'Tiếp tục: giao hàng',exact:true}).click();
 return page.getByRole('button',{name:language==='en'?'Save draft and verify provider':'Lưu draft và kiểm tra provider',exact:true});
}
for(const language of ['vi','en'])test('provider '+language+' verifies before a separate publication action and stays responsive',async({page},info)=>{
 const f=await fixture(page,language),verify=await open(page,language);await verify.focus();await page.keyboard.press('Enter');await expect(page.getByRole('status').filter({hasText:language==='en'?'Provider and download package verified':'Đã xác minh provider và gói tải'})).toBeVisible();expect(f.counts()).toEqual({posts:1,publish:0});
 for(const width of [375,1440]){await page.setViewportSize({width,height:850});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:375,height:850});await page.screenshot({path:info.outputPath('provider-'+language+'-375.png'),fullPage:true});
 await page.getByRole('button',{name:language==='en'?'Prepare publication terms':'Chuẩn bị điều khoản xuất bản',exact:true}).click();await expect(page.getByRole('heading',{name:language==='en'?'Pinned terms':'Điều khoản đã được ghim'})).toBeVisible();expect(f.counts()).toEqual({posts:1,publish:1});
});
test('provider lost response retries the retained receipt without a second proof POST',async({page})=>{
 const f=await fixture(page,'vi','lost'),verify=await open(page);await verify.click();await expect(page.getByRole('alert')).toBeVisible();expect(f.counts().posts).toBe(1);await verify.click();await expect(page.getByRole('status').filter({hasText:'Đã xác minh provider và gói tải'})).toBeVisible();expect(f.counts()).toEqual({posts:1,publish:0});
});
for(const mode of ['foreign','changed'])test('provider '+mode+' response cannot prepare publication',async({page})=>{
 const f=await fixture(page,'vi',mode),verify=await open(page);await verify.click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Chuẩn bị điều khoản xuất bản',exact:true})).toHaveCount(0);expect(f.counts().publish).toBe(0);
});
for(const language of ['vi','en'])test('provider buyer '+language+' reveals a protected ZIP action without storing the capability',async({page})=>{
 await base(page,language);const order={id:'1',campaignId:'provider_draft',campaignTitle:'Provider purchase',quantity:1,lockedUnitPrice:'100000',committedGross:'100000',rebateAllocated:'0',buyerRefundAllocated:'0',buyerClaimedAmount:'0',buyerClaimable:'0',accountingVerified:true,deliveryStatus:'DELIVERED',hasEntitlement:true,managedResourceDelivery:false,buyerPrincipal:wallet};
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'buyer',email:null,roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:wallet}}}));
 await page.route('**/api/orders/buyer',r=>r.fulfill({json:{orders:[order]}}));
 const download='https://provider.example.test/entitlements/'+capability+'/csv-studio.zip';
 await page.route('**/api/orders/1/entitlement',r=>r.fulfill({json:{entitlement:JSON.stringify({version:1,method:'WEBHOOK',orderId:'1',buyerPrincipal:wallet,quantity:1,chainId:5042002,hubAddress:'0x'+'3'.repeat(40),packageSha256:'a'.repeat(64),byteLength:6594,expiresAt:Date.now()+86400000,downloadUrl:download})}}));
 await page.goto('/orders/1');await page.getByRole('button',{name:language==='en'?'Reveal access details':'Giải mã & Xem nội dung',exact:true}).click();const link=page.getByRole('link',{name:language==='en'?'Download ZIP from provider':'Tải ZIP từ provider',exact:true});await expect(link).toHaveAttribute('href',download);await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(link).toHaveAttribute('referrerpolicy','no-referrer');expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(capability);
});
