import {readFileSync} from 'node:fs';
const deployment=JSON.parse(readFileSync(new URL('../../shared/contracts.json',import.meta.url),'utf8'));
import { test, expect, Page } from "@playwright/test";
import { masterFixture } from "./fixtures/master-deal.mjs";
import {productInventoryFixture} from './fixtures/product-inventory';

const hash="0x"+"12".repeat(32),principal="0x0000000000000000000000000000000000000001";
async function draftFixture(page:Page,language:"vi"|"en"="vi",protocolVersion:1|2=2){
 const data=masterFixture(),product={...data.product,latestVersionId:"newer-version",version:{...data.product.version,title:"Original pinned product"}};
 const view={draft:{id:"saved-draft",version:7,protocolVersion,resourceId:"file",input:{title:"Saved draft",description:"Saved campaign description, preserved on resume",category:"Saved category",thumbnailUrl:data.product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"105"},{threshold:10,priceUSDC:"89.0"}],maxPerAccount:3,inventoryLimit:100,durationDays:7,deliverySlaHours:24,earlyRebateEnabled:true,earlySlotsCount:2,earlyRebateAmountUSDC:"0",earlyRebateBps:protocolVersion===2?525:0,visibility:"UNLISTED",deliveryMethod:"FILE_LINK",deliveryContentTemplate:""}},product,publication:null as any};
 if(protocolVersion===2)await page.route(/\/shared\/contracts\.json(?:\?|$)/,r=>r.fulfill({contentType:'application/javascript',body:'export default '+JSON.stringify({...deployment,protocolVersion:2})+';'}));
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
async function openDraft(page:Page){await page.goto("/seller/create");await page.getByRole("button",{name:/Mở bản nháp|Open draft/}).click();}
async function expectRebatePreview(page:Page,value:string){await page.getByRole('button',{name:/^(Xem trước|Preview)$/,exact:true}).click();await expect(page.getByRole('dialog').locator('[data-early-rebate-preview]')).toContainText(value);await page.keyboard.press('Escape');}
async function toggleEditorLanguage(page:Page){
 const toggle=page.getByRole("button",{name:/^(Ngôn ngữ:|Language:)/});if(!await toggle.isVisible())await page.locator(".account-pill-btn").click();await toggle.click();await page.locator(".account-pill-btn").click();
}
async function editorCheckpoint(page:Page){return page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith("groupdeal_draft_editor:")).map(k=>sessionStorage.getItem(k)));}


test('V2 percentage draft restores exact bps, saves by CAS and reopens in Vietnamese',async({page},info)=>{
 const {view}=await draftFixture(page);const writes:any[]=[];let creates=0;
 await page.route('**/api/campaigns/draft',r=>{creates++;return r.fulfill({status:409,json:{error:'Unexpected new draft'}})});
 await page.route('**/api/campaigns/saved-draft',r=>{const body=r.request().postDataJSON();expect(r.request().method()).toBe('PUT');expect(body.expectedVersion).toBe(view.draft.version);writes.push(body);view.draft.version++;const {expectedVersion,...input}=body;view.draft.input=input;return r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:view.draft.version}}})});
 await page.setViewportSize({width:1280,height:900});await openDraft(page);await expect(page.locator('#deal-early-mode')).toHaveValue('PERCENTAGE');await expect(page.locator('#deal-early-percent')).toHaveValue('5.25');await expectRebatePreview(page,"5.25%");await expect(page.locator('.wizard-main p[role=status]')).toContainText('đã lưu nội dung hiện tại');
 await page.locator('#deal-early-percent').fill('5.75');await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await expect(page.locator('.wizard-main p[role=status]')).toContainText('version 8 · đã lưu nội dung hiện tại');expect(writes).toHaveLength(1);expect(writes[0].earlyRebateBps).toBe(575);expect(writes[0].earlyRebateAmountUSDC).toBe('0');expect(creates).toBe(0);
 await page.reload();await openDraft(page);await expect(page.locator('#deal-early-percent')).toHaveValue('5.75');await expectRebatePreview(page,"5.75%");await page.screenshot({path:info.outputPath('percentage-v2-vi-desktop.png'),fullPage:true});expect(writes).toHaveLength(1);
});
test('V2 English invalid precision and range block writes, fixed and off clear unused terms',async({page},info)=>{
 const {view}=await draftFixture(page,'en');const writes:any[]=[];await page.route('**/api/campaigns/saved-draft',r=>{const body=r.request().postDataJSON();writes.push(body);view.draft.version++;return r.fulfill({json:{campaign:{id:view.draft.id,draftVersion:view.draft.version}}})});
 await page.setViewportSize({width:390,height:844});await openDraft(page);await page.locator('#deal-early-percent').fill('1.001');await page.getByRole('button',{name:'Continue: delivery',exact:true}).click();await expect(page.locator('#deal-early-percent')).toBeFocused();await expect(page.locator('#deal-early-percent')).toHaveAttribute('aria-invalid','true');await expectRebatePreview(page,"Review the rebate settings");await page.locator('#deal-early-percent').fill('100.01');await expect(page.locator('#deal-early-percent-error')).toContainText('0.01% to 100%');expect(writes).toHaveLength(0);
 await page.locator('#deal-early-mode').selectOption('FIXED');await page.locator('#deal-early-amount').fill('100');await expectRebatePreview(page,"Up to 100 USDC");await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('.wizard-main p[role=status]')).toContainText('version 8 · current edits saved');expect(writes[0].earlyRebateBps).toBe(0);expect(writes[0].earlyRebateAmountUSDC).toBe('100');await page.locator('#deal-early-amount').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('percentage-v2-en-mobile-fixed.png'),fullPage:true});
 await page.getByRole('checkbox',{name:'Add an early supporter rebate'}).uncheck();await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('.wizard-main p[role=status]')).toContainText('version 9 · current edits saved');expect(writes[1].earlyRebateEnabled).toBe(false);expect(writes[1].earlySlotsCount).toBe(0);expect(writes[1].earlyRebateBps).toBe(0);expect(writes[1].earlyRebateAmountUSDC).toBe('0');
});
test('V2 percentage recovery keeps mode, amount and the exact pending request after lost ACK',async({page})=>{
 await draftFixture(page);const requests:any[]=[];await page.route('**/api/campaigns/saved-draft',async r=>{requests.push({key:r.request().headers()['idempotency-key'],body:r.request().postDataJSON()});if(requests.length===1)return r.abort('connectionreset');expect(requests[1]).toEqual(requests[0]);return r.fulfill({json:{campaign:{id:'saved-draft',draftVersion:8}}})});
 await openDraft(page);await page.locator('#deal-early-percent').fill('6.25');await expect(page.getByRole('button',{name:'Kiểm tra và tiếp tục đồng bộ'})).toBeVisible();expect(requests).toHaveLength(1);const checkpoint=await editorCheckpoint(page);expect(JSON.parse(checkpoint[0]!).form.earlyMode).toBe('PERCENTAGE');expect(JSON.parse(checkpoint[0]!).form.earlyPercent).toBe('6.25');await toggleEditorLanguage(page);expect(await editorCheckpoint(page)).toEqual(checkpoint);
 await page.reload();await page.getByRole('button',{name:'Restore editing session'}).click();await expect(page.locator('#deal-early-mode')).toHaveValue('PERCENTAGE');await expect(page.locator('#deal-early-percent')).toHaveValue('6.25');await page.getByRole('button',{name:'Check and resume sync'}).click();await expect(page.locator('.wizard-main p[role=status]')).toContainText('version 8 · current edits saved');expect(requests).toHaveLength(2);expect(requests[1].body.earlyRebateBps).toBe(625);expect(requests[1].body.earlyRebateAmountUSDC).toBe('0');
});
test('V2 pinned publication displays server percentage terms with no edit or wallet call',async({page})=>{
 const {data,view}=await draftFixture(page,'en');view.publication={campaign:{...data.campaign,id:'saved-draft',title:view.draft.input.title,durationSeconds:604800,earlyRebateEnabled:true,earlySlotsCount:2,earlyRebateAmount:'0',earlyRebateBps:525},operation:{id:'saved-publish',action:'PUBLISH',resourceId:'saved-draft',chainId:5042002,hubAddress:'0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574',principal,calldata:'0xfixture',phase:'PREPARED',idempotencyKey:'publish:saved-key',createdAt:0,updatedAt:0,expectedEventArgs:{}}};
 await openDraft(page);await expect(page.getByRole('heading',{name:'Pinned terms'})).toBeVisible();await expect(page.locator('.wizard-main .detail-list')).toContainText('5.25% of the first unit’s locked price · 2 slots');await expect(page.locator('#deal-early-mode')).toHaveCount(0);
});
