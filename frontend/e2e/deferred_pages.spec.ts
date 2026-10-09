import {operatorFixtureWallet,operatorFixtureStatus} from './fixtures/operator-enrollment';
import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { masterFixture } from "./fixtures/master-deal.mjs";
import {productInventoryFixture} from './fixtures/product-inventory';

test.skip(process.env.GROUPDEAL_BROWSER_MODE !== "preview", "These checks exercise emitted chunks on an owned built preview.");
const manifest = JSON.parse(readFileSync(new URL("../dist/.vite/manifest.json", import.meta.url), "utf8"));
const deployment=JSON.parse(readFileSync(new URL('../../shared/contracts.json',import.meta.url),'utf8')),hub=deployment.contracts.GroupDealHub.address;
const file = (page: string): string => manifest[`src/pages/${page}.tsx`].file;
const checkpointKey = "groupdeal_operation:buyer:durable-fixture";
const checkpoint = JSON.stringify({ id: "durable-fixture", phase: "RECEIPT_VERIFIED", txHash: "0x" + "ab".repeat(32) });

async function fixture(page: Page, language = "en") {
  const data = masterFixture(), requests: string[] = [], writes: string[] = [], hosts: string[] = [];
  const now=Date.now(),card={version:'1.0',id:'master',chainId:deployment.chainId,hubAddress:hub,visibility:'PUBLIC',title:data.campaign.title,status:data.campaign.status,metric:data.campaign.metric,currentMetric:37,endTime:data.campaign.endTime,currentPriceBaseUnits:'105000000',currentPriceUSDC:'105.000000',nextPriceBaseUnits:'89000000',nextPriceUSDC:'89.000000',nextThreshold:50,priceKind:'CURRENT_GROUP_PRICE',priceScope:'PER_UNIT_BEFORE_BUYER_REBATE',platformFeeBps:0,purchaseHeld:false,campaignUrl:'https://deals.example.test/#campaign-master',widgetUrl:'https://deals.example.test/api/v1/campaigns/master/widget',projection:{source:'INDEXER',financialStateChainVerified:false,fetchedAt:now}},campaign={...data.campaign,chainId:deployment.chainId,hubAddress:hub,seller:{...data.seller,id:'fixture-preview-seller',profilePath:'#seller-profile-fixture-preview-seller'},card};
  await page.addInitScript(({ language, checkpointKey, checkpoint }) => {
    localStorage.setItem("groupdeal_token", "local-preview-fixture");
    if (!localStorage.getItem("groupdeal_lang")) localStorage.setItem("groupdeal_lang", language);
    if (!localStorage.getItem(checkpointKey)) localStorage.setItem(checkpointKey, checkpoint);
  }, { language, checkpointKey, checkpoint });
  page.on("request", request => { const url = new URL(request.url()); requests.push(url.pathname); hosts.push(url.hostname); });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") { writes.push(url.pathname); return route.fulfill({ status: 405, json: { error: "Preview fixture forbids writes" } }); }
    const values: Record<string, unknown> = {
      "/api/auth/me": { user: { id: "buyer", email: null, loginMethod: "EVM_WALLET", activeWallet: operatorFixtureWallet, roles: ["buyer", "seller", "operator"], sellerProfile: data.seller } },
      "/api/auth/operator/enrollment": operatorFixtureStatus("buyer",operatorFixtureWallet,true,true,Date.now()),
      "/api/health": { chainId: deployment.chainId, hubAddress:hub, usdcAddress: "0x3600000000000000000000000000000000000000" },
      "/api/v1/catalog": {version:'1.0',chainId:deployment.chainId,hubAddress:hub,amountEncoding:'USDC base-unit integer strings (6 decimals)',filters:{q:'',category:'',status:null,metric:null,sort:'newest'},campaigns:[campaign],categoriesScope:'PUBLIC_CURRENT_DEPLOYMENT',categories:[{value:'Documents',label:'Documents',campaignCount:1}],pagination:{limit:12,sort:'newest',hasMore:false,nextCursor:null},summary:{scope:'MATCHING_PUBLIC_CURRENT_DEPLOYMENT',campaignCount:1,openCampaignCount:1,totalGrossCommitted:data.campaign.totalGrossCommitted,projection:{source:'INDEXER',financialStateChainVerified:false,fetchedAt:now}}},
      "/api/notifications": { notifications: [], unread: 0 },
      "/api/campaigns": { campaigns: [data.campaign] },
      "/api/campaigns/master": { campaign: data.campaign, seller: data.seller },
      "/api/orders/buyer": { orders: [] },
      "/api/transactions": { operations: [], pagination: { nextCursor: null } },
      "/api/seller/campaigns": { campaigns: [] }, "/api/seller/orders": { orders: [] },
      "/api/seller/campaign-drafts": { drafts: [], pagination: { nextCursor: null } },
      "/api/seller/webhooks": { webhook: null }, "/api/products/mine": productInventoryFixture([data.product],'buyer'),
      "/api/delivery/resources": { resources: [] }, "/api/operator/disputes": { disputes: [] },
      "/api/operator/sellers": { sellers: [] }, "/api/operator/deals": { campaigns: [], pagination: { nextCursor: null } },
      "/api/operator/reconciliation": { report: { status: "UNVERIFIED", perOrderVerified: false } },
      "/api/operator/audit-logs": { logs: [] },
    };
    if (!(url.pathname in values)) return route.fulfill({ status: 404, json: { error: "Preview fixture has no such API" } });
    return route.fulfill({ json: values[url.pathname] });
  });
  return { requests, writes, hosts };
}

test("built marketplace loads protected route chunks only when the user opens their page", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/");
  await expect(page.locator(".grid-cards > .glass-card").first()).toBeVisible();
  const deferred = ["BuyerDashboard", "SellerDashboard", "OperatorPortal", "DeveloperDocs", "CampaignDetailPage"];
  expect(state.requests.filter(path => deferred.some(name => path === "/" + file(name)))).toEqual([]);
  for (const [hash, name, selector] of [["orders", "BuyerDashboard", ".transaction-history"], ["seller", "SellerDashboard", ".workspace-heading"], ["operator", "OperatorPortal", ".workspace-heading"], ["docs", "DeveloperDocs", "#integration-title"], ["campaign-master", "CampaignDetailPage", ".campaign-detail-grid"]]) {
    await page.evaluate(hash => { window.location.hash = hash; }, hash);
    await expect(page.locator(selector).first()).toBeVisible();
    expect(state.requests).toContain("/" + file(name));
    expect(await page.evaluate(key => localStorage.getItem(key), checkpointKey)).toBe(checkpoint);
  }
  expect(state.requests.some(path => path.startsWith("/src/"))).toBe(false);
  expect(state.writes).toEqual([]);
});

for (const language of ["vi", "en"]) test(`built chunk failure preserves recovery checkpoints and supports reload in ${language}`, async ({ page }) => {
  const state = await fixture(page, language);
  const chunk = "**/" + file("SellerDashboard");
  await page.route(chunk, route => route.abort());
  await page.goto("/#seller");
  await expect(page.getByRole("alert")).toContainText(language === "en" ? "Could not display this page" : "Không thể hiển thị trang này");
  expect(await page.evaluate(key => localStorage.getItem(key), checkpointKey)).toBe(checkpoint);
  await page.evaluate(() => { window.location.hash = "docs"; });
  await expect(page.locator("#integration-title")).toBeVisible();
  await page.evaluate(() => { window.location.hash = "seller"; });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute(chunk);
  await page.getByRole("button", { name: language === "en" ? "Reload page" : "Tải lại trang", exact: true }).click();
  await expect(page.locator(".workspace-heading")).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), checkpointKey)).toBe(checkpoint);
  expect(state.writes).toEqual([]);
});

test("delayed built page exposes a status while navigation remains available", async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/" + file("SellerDashboard"), async route => { await wait; await route.continue(); });
  await page.goto("/#seller", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status").filter({ hasText: "Loading page…" })).toBeVisible();
  await page.evaluate(() => { window.location.hash = "docs"; });
  await expect(page.locator("#integration-title")).toBeVisible();
  release();
  expect(await page.evaluate(key => localStorage.getItem(key), checkpointKey)).toBe(checkpoint);
  expect(state.writes).toEqual([]);
});

for (const width of [375, 1440]) test(`self-hosted Vietnamese and English fonts load with external networking unavailable at ${width}px`, async ({ page }, info) => {
  const state = await fixture(page, "vi");
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/");
  await expect(page.locator(".grid-cards > .glass-card").first()).toBeVisible();
  const loaded = await page.evaluate(async () => {
    const vietnamese = "Tiền hoàn • Đơn vị • Quyền nhận sản phẩm số", english = "Refund • 1234567890.000001 USDC";
    for (const family of ["Plus Jakarta Sans Variable", "JetBrains Mono Variable"])
      for (const sample of [vietnamese, english]) await document.fonts.load(`400 16px "${family}"`, sample);
    await document.fonts.ready;
    return ["Plus Jakarta Sans Variable", "JetBrains Mono Variable"].map(family => ({
      family, vietnamese: document.fonts.check(`400 16px "${family}"`, vietnamese),
      english: document.fonts.check(`400 16px "${family}"`, english),
      loadedFaces: [...document.fonts].filter(face => face.family.includes(family) && face.status === "loaded").length,
    }));
  });
  expect(loaded.every(font => font.vietnamese && font.english && font.loadedFaces >= 2)).toBe(true);
  expect(state.requests.some(path => /plus-jakarta-sans-vietnamese.*\.woff2$/.test(path))).toBe(true);
  expect(state.requests.some(path => /jetbrains-mono-vietnamese.*\.woff2$/.test(path))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(state.hosts.some(host => host === "fonts.googleapis.com" || host === "fonts.gstatic.com")).toBe(false);
  await page.screenshot({ path: info.outputPath(`built-fonts-${width}.png`) });
  expect(state.writes).toEqual([]);
});
