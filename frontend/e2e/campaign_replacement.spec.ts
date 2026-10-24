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
 await page.locator(".header-language").click();
}
async function editorCheckpoint(page:Page){return page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith("groupdeal_draft_editor:")).map(k=>sessionStorage.getItem(k)));}


async function replacementFixture(page:Page,language:'vi'|'en'='vi'){
 const {data,view}=await draftFixture(page,language),source={campaignId:'original-campaign',onchainCampaignId:77,chainId:5042002,hubAddress:'0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574',creationTermsHash:hash,sourceProtocolVersion:1},template={source,input:view.draft.input,payoutWallet:principal,templateHash:'0x'+'ab'.repeat(32)};view.draft.version=1;(view.draft as any).resourceId=null;(view.draft as any).replacementFor=source;
 await page.route('**/api/seller/campaigns**',r=>r.fulfill({json:{pagination:{limit:20,nextCursor:null},campaigns:[{...data.campaign,id:source.campaignId,sellerId:'seller',status:'ACTIVE',projectionOrigin:'VERIFIED_PUBLISH',chainId:source.chainId,hubAddress:source.hubAddress,creationTermsHash:hash}]}}));
 await page.route('**/api/seller/campaigns/original-campaign/replacement-template',r=>r.fulfill({json:template}));
 await page.route('**/api/campaigns/draft',r=>r.fulfill({status:409,json:{error:'Unexpected new unlinked draft'}}));
 return{view,source,template};
}
test('replacement Vietnamese review creates one linked draft and opens existing editor without changing original',async({page},info)=>{
 const {view,source}=await replacementFixture(page);const creates:any[]=[],updates:any[]=[];
 await page.route('**/api/seller/campaigns/original-campaign/replacement-draft',r=>{creates.push({body:r.request().postDataJSON(),key:r.request().headers()['idempotency-key']});return r.fulfill({status:201,json:{draft:{id:view.draft.id,version:1,status:'DRAFT'},replacementFor:source,replayed:false}})});
 await page.route('**/api/campaigns/saved-draft',r=>{const body=r.request().postDataJSON();updates.push(body);expect(body.expectedVersion).toBe(1);view.draft.version=2;view.draft.input.title=body.title;return r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:2}}})});
 await page.goto('/seller/campaigns');await page.getByRole('button',{name:'Tạo chiến dịch thay thế',exact:true}).click();await expect(page.getByRole('region',{name:'Xem lại campaign thay thế'})).toContainText('không tự hủy campaign gốc');expect(creates).toHaveLength(0);await page.getByRole('button',{name:'Tạo bản nháp mới',exact:true}).click();await expect(page.locator('[data-replacement-origin]')).toContainText(source.campaignId);await expect(page.locator('#tier-price-0')).toHaveValue('900719925474099312.345678');expect(creates).toHaveLength(1);await page.locator('#deal-title').fill('Replacement reviewed title');await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await expect(page.locator('.wizard-main p[role=status]')).toContainText('version 2 · đã lưu nội dung hiện tại');expect(updates).toHaveLength(1);await page.screenshot({path:info.outputPath('replacement-vi-editor.png'),fullPage:true});
});
test('replacement English lost ACK reload repeats exact request and opens one draft on mobile',async({page},info)=>{
 const {view,source}=await replacementFixture(page,'en');const requests:any[]=[];await page.route('**/api/seller/campaigns/original-campaign/replacement-draft',r=>{requests.push({body:r.request().postDataJSON(),key:r.request().headers()['idempotency-key']});if(requests.length===1)return r.abort('connectionreset');expect(requests[1]).toEqual(requests[0]);return r.fulfill({json:{draft:{id:view.draft.id,version:1,status:'DRAFT'},replacementFor:source,replayed:true}})});
 await page.setViewportSize({width:390,height:844});await page.goto('/seller/campaigns');await page.getByRole('button',{name:'Create replacement campaign',exact:true}).click();await page.getByRole('button',{name:'Create new draft',exact:true}).click();await expect(page.getByRole('button',{name:'Check unconfirmed creation'})).toBeVisible();expect(requests).toHaveLength(1);const saved=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('groupdeal_replacement:')).map(k=>sessionStorage.getItem(k)));expect(saved).toHaveLength(1);expect(saved[0]).not.toContain('local-draft-fixture');await page.reload();await page.getByRole('button',{name:'Review replacement request',exact:true}).click();await page.getByRole('button',{name:'Check unconfirmed creation'}).click();await expect(page.locator('[data-replacement-origin]')).toContainText('The original orders and access remain unchanged');expect(requests).toHaveLength(2);await expect(page.locator('#deal-title')).toHaveValue('Saved draft');await page.screenshot({path:info.outputPath('replacement-en-mobile.png'),fullPage:true});
});
test('replacement mismatched source response stays out of editor and never creates',async({page})=>{
 const {template}=await replacementFixture(page,'en');let creates=0;await page.route('**/api/seller/campaigns/original-campaign/replacement-template',r=>r.fulfill({json:{...template,source:{...template.source,campaignId:'foreign-campaign'}}}));await page.route('**/api/seller/campaigns/original-campaign/replacement-draft',r=>{creates++;return r.fulfill({status:503,json:{error:'Unexpected write'}})});
 await page.goto('/seller/campaigns');await page.getByRole('button',{name:'Create replacement campaign',exact:true}).click();await expect(page.getByRole('alert')).toContainText('action is unconfirmed');await expect(page.getByRole('button',{name:'Create new draft',exact:true})).toHaveCount(0);await expect(page.locator('#deal-title')).toHaveCount(0);expect(creates).toBe(0);
});
test('replacement changed template clears only definitive rejected creation and requires new review',async({page})=>{
 await replacementFixture(page,'en');let posts=0;await page.route('**/api/seller/campaigns/original-campaign/replacement-draft',r=>{posts++;return r.fulfill({status:409,json:{error:'REPLACEMENT_TEMPLATE_CHANGED'}})});
 await page.goto('/seller/campaigns');await page.getByRole('button',{name:'Create replacement campaign',exact:true}).click();await page.getByRole('button',{name:'Create new draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('configuration or payout wallet changed');await expect(page.getByRole('button',{name:'Create new draft',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Check unconfirmed creation'})).toHaveCount(0);expect(posts).toBe(1);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Create replacement campaign',exact:true}).click();await expect(page.getByRole('region',{name:'Review replacement campaign'})).toBeVisible();expect(posts).toBe(1);
});
