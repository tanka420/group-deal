import { expect, test, Page } from "@playwright/test";

const buyer = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
const hash = `0x${"2".repeat(64)}`;
const identity = `0x${"3".repeat(64)}`;
const termsHash = `0x${"4".repeat(64)}`;
const campaign = {
  id: "fixture", onchainCampaignId: 1, title: "Checkout fixture", category: "Software", metric: "UNITS_COUNT",
  tiers: [{ threshold: 0, price: "1000000" }], currentUnlockedTier: 0, status: "ACTIVE", termsHash,
  maxPerAccount: 10, inventoryLimit: 100, totalUnitsCommitted: 0, totalBuyerCount: 0, totalGrossCommitted: "0",
  endTime: Math.floor(Date.now() / 1000) + 3600, deliverySlaSeconds: 86400, earlyRebateEnabled: false,
  description: "Fixture only", thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
};

async function fixture(page: Page, options: { funded?: boolean; indexerOffline?: boolean } = {}) {
  const state = { funded: options.funded ?? true, campaignOpen: true, authorizations: 0, indexedReads: 0 };
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "fixture-session"));
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*", route => route.fulfill({ contentType: "application/javascript",
    body: `export class W3SSdk { updateConfigs(){} getDeviceId(){ return Promise.reject(new Error("Fixture")); } } export default {W3SSdk};` }));
  await page.route("**/src/context/Web3Context.tsx*", route => route.fulfill({ contentType: "application/javascript", body: `
    export const Web3Provider = ({children})=>children;
    export const useWeb3 = ()=>({account:"${buyer}",hubAddress:"0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",usdcBalance:"10.00",balanceError:null,
      walletMode:"EXTERNAL_REOWN",externalSignerReady:true,refreshBalance:async()=>{},
      commitToBuyOnchain:async(params)=>{ window.buyWrites=(window.buyWrites||0)+1; params.onStep?.("BROADCAST"); params.onBroadcast?.("${hash}"); return {txHash:"${hash}",orderId:"2"}; }});` }));
  await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?/, route => {
    const payload = route.request().postDataJSON();
    const reply = (request: any) => ({ id: request.id, jsonrpc: "2.0", result: request.method === "eth_chainId" ? "0x4cef52" :
      request.method === "eth_getBalance" ? `0x${(state.funded ? 10n ** 19n : 0n).toString(16)}` : "0x3b9aca00" });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(Array.isArray(payload) ? payload.map(reply) : reply(payload)) });
  });
  await page.route("**/api/auth/me", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: {
    id: "fixture-buyer", email: null, roles: ["buyer"], loginMethod: "EVM_WALLET", activeWallet: buyer,
  } }) }));
  await page.route("**/api/notifications", route => route.fulfill({ contentType: "application/json", body: '{"notifications":[],"unread":0}' }));
  await page.route("**/api/campaigns/fixture", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    campaign: { ...campaign, status: state.campaignOpen ? "ACTIVE" : "FINALIZED" }, seller: { displayName: "Fixture seller" },
  }) }));
  await page.route("**/api/orders/authorize", route => {
    state.authorizations++;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ buyerWallet: buyer, campaignId: "1", campaignIdentity: identity,
      maxQuantity: 1, deadline: Math.floor(Date.now() / 1000) + 900, termsHash, signature: "0xfixture" }) });
  });
  await page.route("**/api/orders/buyer", route => {
    state.indexedReads++;
    if (options.indexerOffline) return route.fulfill({ status: 503, body: "offline" });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ orders: state.indexedReads === 1 ? [] : [
      { id: "2", onchainOrderId: 2, txHash: hash, buyerPrincipal: buyer, quantity: 1 },
    ] }) });
  });
  await page.goto("/#campaign-fixture");
  await expect(page.getByRole("heading", { name: "Checkout fixture" })).toBeVisible();
  return state;
}

async function confirm(page: Page, source = "ARC_USDC") {
  await page.getByRole("button", { name: /cam kết mua/i }).click();
  await page.getByLabel("Nguồn thanh toán").selectOption(source);
  await page.locator(".modal-content input[type=checkbox]").last().check();
  await page.locator(".modal-content > button.btn-primary").click();
}

test("checkout confirms only after backend has indexed the matching order", async ({ page }) => {
  const state = await fixture(page);
  await confirm(page);
  await expect(page.getByRole("button", { name: "Xem đơn hàng của tôi" })).toBeVisible();
  expect(state.indexedReads).toBeGreaterThanOrEqual(2);
  expect(state.authorizations).toBe(1);
  expect(await page.evaluate(() => (window as any).buyWrites)).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("groupdeal_checkout:")))).toEqual([]);
});

test("indexer failure stays pending across reload and never buys again automatically", async ({ page }) => {
  const state = await fixture(page, { indexerOffline: true });
  await confirm(page);
  await expect(page.getByText("Cần kiểm tra giao dịch cũ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xem đơn hàng của tôi" })).not.toBeVisible();
  await page.reload();
  await expect(page.getByText("Cần kiểm tra giao dịch cũ", { exact: true })).toBeVisible();
  expect(state.authorizations).toBe(1);
  expect(await page.evaluate(() => (window as any).buyWrites || 0)).toBe(0);
});

test("funding precedes authorization and a closed campaign never submits a purchase", async ({ page }) => {
  const state = await fixture(page, { funded: false });
  await confirm(page, "OTHER_USDC");
  await expect(page.getByRole("button", { name: "Kiểm tra số dư và tiếp tục mua" })).toBeVisible();
  expect(state.authorizations).toBe(0);
  state.funded = true;
  state.campaignOpen = false;
  await page.getByRole("button", { name: "Kiểm tra số dư và tiếp tục mua" }).click();
  await expect(page.getByText(/Chiến dịch đã đóng; tiền nạp vẫn ở ví/)).toBeVisible();
  expect(state.authorizations).toBe(0);
  expect(await page.evaluate(() => (window as any).buyWrites || 0)).toBe(0);
});

test("another tab cannot queue a second purchase while the checkout lock is held", async ({ page, context }) => {
  await fixture(page);
  await page.evaluate((key) => {
    void navigator.locks.request(key, async () => { (window as any).lockHeld = true;
      await new Promise<void>(resolve => { (window as any).releaseLock = resolve; }); });
  }, `groupdeal_payment:v1:${buyer}`);
  await page.waitForFunction(() => (window as any).lockHeld);
  const second = await context.newPage();
  try {
    const state = await fixture(second);
    await confirm(second);
    await expect(second.getByText(/Một tab khác đang xử lý giao dịch này/)).toBeVisible();
    expect(state.authorizations).toBe(0);
    await page.evaluate(() => (window as any).releaseLock());
    expect(await second.evaluate(() => (window as any).buyWrites || 0)).toBe(0);
  } finally { await second.close(); }
});
