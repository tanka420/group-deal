import { test, expect, type Page } from "@playwright/test";
import {emptyCatalog} from './fixtures/catalog';

const wallet = "0x1111111111111111111111111111111111111111";
const account = { id: "fixture-auth-dialog", email: null, roles: ["buyer", "seller", "operator"], loginMethod: "EVM_WALLET", activeWallet: wallet };
const isBuilt = process.env.GROUPDEAL_BROWSER_MODE === "preview";

async function fixture(page: Page, language = "vi", owned = false, circle = false) {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.addInitScript(({ language, owned }) => {
    if (window.top !== window.self) return; // App storage fixture must not run in Circle's opaque iframe.
    localStorage.setItem("groupdeal_lang", language);
    localStorage.setItem("groupdeal_operation_checkpoints", "fixture-preserved-financial-checkpoint");
    if (owned) localStorage.setItem("groupdeal_token", "fixture-auth-dialog-session");
  }, { language, owned });
  await page.route("**/api/**", route => route.fulfill({ json: new URL(route.request().url()).pathname==='/api/v1/catalog'?emptyCatalog(route.request().url()):{ campaigns: [], notifications: [], unread: 0 } }));
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: account } }));
  await page.route("**/api/auth/wallets?**", route => route.fulfill({ json: { userId: account.id, activeWallet: wallet, wallets: [{ address: wallet, selected: true, kind: "EXTERNAL", canSignIn: true }], pagination: { nextCursor: null }, serverTime: Date.now() } }));
  await page.route("**/api/notifications/preferences", route => route.fulfill({ json: { preferences: { inApp: true, email: false }, contactStatus: "MISSING" } }));
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*", route => route.fulfill({ contentType: "application/javascript", body: circle ? `
    export class W3SSdk {
      constructor(config,callback){ this.callback=callback; }
      updateConfigs(config,callback){ if(callback)this.callback=callback; }
      getDeviceId(){ return Promise.resolve("fixture-browser-device"); }
      verifyOtp(){
        window.fixtureCircleVerifications=(window.fixtureCircleVerifications||0)+1;
        const frame=document.createElement("iframe");frame.id="sdkIframe";frame.title="Circle authentication fixture";
        frame.style.cssText="position:fixed;inset:10%;width:80%;height:80%;z-index:2147483647;background:white";
        frame.srcdoc='<button id="fixture-cancel">Cancel fixture authentication</button>';
        frame.addEventListener("load",()=>frame.contentDocument.getElementById("fixture-cancel").addEventListener("click",()=>{frame.remove();this.callback({message:"Bạn đã đóng xác thực Circle. Có thể mở lại để tiếp tục."});}));
        document.body.appendChild(frame);
      }
    // Vite's optimized CommonJS import unwraps the default namespace.
    } export default {W3SSdk};` : 'export class W3SSdk { updateConfigs(){} getDeviceId(){return Promise.reject(new Error("Fixture provider unavailable"));} } export default {W3SSdk};' }));
}

async function open(page: Page, en = false, owned = false) {
  await page.goto("/");
  if (owned) {
    await page.locator(".account-pill-btn").click();
    await page.getByRole("button", { name: en ? "Account details" : "Thông tin tài khoản", exact: true }).click();
  } else await page.getByRole("button", { name: en ? "Log In" : "Đăng nhập", exact: true }).click();
  return page.getByRole("dialog", { name: owned ? (en ? "Your account" : "Tài khoản của bạn") : (en ? "Sign in to GroupDeal" : "Đăng nhập GroupDeal"), exact: true });
}
async function preserved(page: Page) {
  expect(await page.evaluate(() => localStorage.getItem("groupdeal_operation_checkpoints"))).toBe("fixture-preserved-financial-checkpoint");
}
function otpResponse() { return { deviceToken: "fixture-device-token", deviceEncryptionKey: "fixture-device-encryption", otpToken: "fixture-provider-otp-token", loginAttemptId: "11111111-2222-4333-8444-555555555555" }; }

for (const language of ["vi", "en"]) test(`sign-in ${language} seven widths keyboard containment and clean reopening`, async ({ page }, info) => {
  const en = language === "en", errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page, language); let writes = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") writes++; });
  const dialog = await open(page, en);
  await expect(page.locator("#auth-title")).toBeFocused(); await expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(await page.locator("#root").evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await expect(dialog.getByLabel(en ? "Email address" : "Địa chỉ email", { exact: true })).toHaveAttribute("autocomplete", "email");
  await expect(dialog).not.toContainText(en ? "Đăng nhập" : "Sign in by email"); await expect(dialog).not.toContainText("Gmail");
  const retry=dialog.getByRole("button",{name:en?"Retry Circle connection":"Thử lại kết nối Circle",exact:true}); await expect(retry).toBeVisible({timeout:18_000});
  for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })).toBe(true);
    await expect.poll(() => dialog.evaluate(el => Array.from(el.querySelectorAll("button,input,h2,h3,p")).every(node => { const r = node.getBoundingClientRect(); return r.width === 0 || r.left >= -1 && r.right <= innerWidth + 1; }))).toBe(true);
    await page.screenshot({ path: info.outputPath(`auth-${language}-${width}.png`) });
  }
  const email = dialog.getByLabel(en ? "Email address" : "Địa chỉ email", { exact: true }), close = dialog.getByRole("button", { name: en ? "Close sign-in" : "Đóng đăng nhập", exact: true });
  await email.fill("fixture@example.test"); await email.focus(); await page.keyboard.press("Tab"); await expect(retry).toBeFocused();
  await page.keyboard.press("Tab"); await expect(close).toBeFocused(); await page.keyboard.press("Shift+Tab"); await expect(retry).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(email).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: en ? "Log In" : "Đăng nhập", exact: true })).toBeFocused();
  expect(await page.locator("#root").evaluate(el => (el as HTMLElement).inert)).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByRole("button", { name: en ? "Log In" : "Đăng nhập", exact: true }).click(); await expect(email).toHaveValue("");
  expect(writes).toBe(0); expect(errors).toEqual([]); await preserved(page);
});

for (const language of ["vi", "en"]) test(`account ${language} dialog preserves identity and returns focus on mobile`, async ({ page }, info) => {
  const en = language === "en"; await fixture(page, language, true); await page.setViewportSize({ width: 320, height: 700 }); let writes = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") writes++; });
  const dialog = await open(page, en, true); await expect(dialog).toContainText(wallet); await expect(dialog).toContainText(en ? "Operator" : "Vận hành");
  await expect(dialog.getByRole("region", { name: en ? "Account wallets" : "Ví tài khoản", exact: true })).toBeVisible();
  await expect(page.locator(".account-dropdown-menu")).toHaveCount(0);
  expect(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
  await page.screenshot({ path: info.outputPath(`auth-account-${language}-320.png`) });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(page.locator(".account-pill-btn")).toBeFocused();
  expect(writes).toBe(0); expect(await page.evaluate(() => localStorage.getItem("groupdeal_token"))).toBe("fixture-auth-dialog-session"); await preserved(page);
});

for (const language of ["vi", "en"]) test(`Circle account ${language} retains account information while signing authentication is unavailable`, async ({ page }) => {
  const en = language === "en"; await fixture(page, language, true); let writes = 0;
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { ...account, loginMethod: "CIRCLE_EMAIL" } } }));
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") writes++; });
  const dialog = await open(page, en, true);
  await expect(dialog.getByRole("region", { name: en ? "Account information" : "Thông tin tài khoản", exact: true })).toContainText(wallet);
  await expect(dialog).toContainText(en ? "Your account session is active" : "Phiên tài khoản còn hiệu lực");
  await expect(dialog.getByRole("button", { name: en ? "Email sign-in is currently unavailable" : "Đăng nhập email hiện chưa sẵn sàng", exact: true })).toBeDisabled();
  expect(writes).toBe(0); expect(await page.evaluate(() => localStorage.getItem("groupdeal_token"))).toBe("fixture-auth-dialog-session"); await preserved(page);
});

test("closed OTP request cannot advance a newly reopened dialog", async ({ page }) => {
  test.skip(isBuilt, "Circle SDK module fixture is available only in the dev server; built checks cover the real emitted view.");
  await fixture(page, "en", false, true); let release!: () => void, writes = 0; const gate = new Promise<void>(done => release = done);
  await page.route("**/api/circle/email/token", async route => { writes++; expect(route.request().postDataJSON()).toEqual({ email: "fixture@example.test", deviceId: "fixture-browser-device" }); await gate; await route.fulfill({ json: otpResponse() }); });
  const dialog = await open(page, true), send = dialog.getByRole("button", { name: "Send OTP with Circle", exact: true });
  await expect(send).toBeEnabled(); await dialog.getByLabel("Email address", { exact: true }).fill("fixture@example.test"); await send.click(); await expect.poll(() => writes).toBe(1);
  await dialog.getByRole("button", { name: "Close sign-in", exact: true }).click();
  await page.getByRole("button", { name: "Log In", exact: true }).click(); release();
  await expect(dialog.getByLabel("Email address", { exact: true })).toHaveValue(""); await expect(dialog.getByRole("button", { name: "Open Circle authentication", exact: true })).toHaveCount(0);
  await expect(send).toBeEnabled(); expect(writes).toBe(1); expect(await page.evaluate(() => localStorage.getItem("groupdeal_token"))).toBeNull(); await preserved(page);
});

for (const language of ["vi", "en"]) test(`OTP ${language} failure is localized and provider diagnostics stay private`, async ({ page }) => {
  test.skip(isBuilt, "Circle SDK module fixture is dev-only.");
  const en = language === "en"; await fixture(page, language, false, true); let writes = 0;
  await page.route("**/api/circle/email/token", route => { writes++; return route.fulfill({ status: 503, json: { error: "Private provider diagnostic fixture; do not render this text." } }); });
  const dialog = await open(page, en); await dialog.getByLabel(en ? "Email address" : "Địa chỉ email", { exact: true }).fill("fixture@example.test");
  await dialog.getByRole("button", { name: en ? "Send OTP with Circle" : "Gửi mã OTP qua Circle", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(en ? "The OTP request could not be confirmed" : "Chưa xác nhận được yêu cầu gửi OTP");
  await expect(dialog.getByRole("alert")).toBeFocused(); await expect(dialog).not.toContainText("Private provider diagnostic"); expect(writes).toBe(1); await preserved(page);
});

for (const language of ["vi", "en"]) test(`OTP ${language} explicit Circle handoff allows provider cancellation without a local code field`, async ({ page }) => {
  test.skip(isBuilt, "Circle provider callback/window is a dev-only local fixture, not real OTP evidence.");
  const en = language === "en"; await fixture(page, language, false, true); let writes = 0;
  await page.route("**/api/circle/email/token", route => { writes++; return route.fulfill({ json: otpResponse() }); });
  const dialog = await open(page, en); await dialog.getByLabel(en ? "Email address" : "Địa chỉ email", { exact: true }).fill("fixture@example.test");
  await dialog.getByRole("button", { name: en ? "Send OTP with Circle" : "Gửi mã OTP qua Circle", exact: true }).click();
  await expect(page.locator("#circle-otp-instructions")).toBeFocused(); await expect(dialog.locator("input")).toHaveCount(0); expect(await page.evaluate(() => (window as any).fixtureCircleVerifications || 0)).toBe(0);
  const verify = dialog.getByRole("button", { name: en ? "Open Circle authentication" : "Mở xác thực Circle", exact: true }); await verify.click();
  const frame = page.locator("#sdkIframe"); await expect(frame).toBeVisible(); expect(await frame.evaluate(el => !!el.closest("[inert]"))).toBe(false);
  await expect(dialog).toHaveAttribute("aria-modal", "false"); await expect(dialog.getByRole("button", { name: en ? "Close sign-in" : "Đóng đăng nhập", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText(en ? "Complete authentication in Circle’s window" : "Hoàn tất xác thực trong cửa sổ Circle");
  await page.frameLocator("#sdkIframe").getByRole("button", { name: "Cancel fixture authentication", exact: true }).click();
  await expect(frame).toHaveCount(0); await expect(dialog.getByRole("alert")).toContainText(en ? "You declined or closed authentication" : "Bạn đã từ chối hoặc đóng xác thực");
  await expect(verify).toBeEnabled(); await expect(dialog.getByRole("alert")).toBeFocused(); expect(writes).toBe(1);
  expect(await page.evaluate(() => (window as any).fixtureCircleVerifications)).toBe(1); expect(await page.evaluate(() => localStorage.getItem("groupdeal_token"))).toBeNull(); await preserved(page);
});

test("late OTP response cannot overwrite another tab's authenticated account view", async ({ page }) => {
  test.skip(isBuilt, "Circle SDK module fixture is dev-only.");
  await fixture(page, "en", false, true); let release!: () => void, writes = 0; const gate = new Promise<void>(done => release = done);
  await page.route("**/api/circle/email/token", async route => { writes++; await gate; await route.fulfill({ json: otpResponse() }); });
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { ...account, id: "fixture-other-account" } } }));
  await page.route("**/api/auth/wallets?**", route => route.fulfill({ json: { userId: "fixture-other-account", activeWallet: wallet, wallets: [{ address: wallet, selected: true, kind: "EXTERNAL", canSignIn: true }], pagination: { nextCursor: null }, serverTime: Date.now() } }));
  const dialog = await open(page, true); await dialog.getByLabel("Email address", { exact: true }).fill("fixture@example.test"); await dialog.getByRole("button", { name: "Send OTP with Circle", exact: true }).click(); await expect.poll(() => writes).toBe(1);
  await page.evaluate(() => { localStorage.setItem("groupdeal_token", "fixture-other-account-session"); dispatchEvent(new StorageEvent("storage", { key: "groupdeal_token", newValue: "fixture-other-account-session", storageArea: localStorage })); });
  const current = page.getByRole("dialog", { name: "Your account", exact: true }); await expect(current).toContainText(wallet); release();
  await expect(current.getByRole("button", { name: "Open Circle authentication", exact: true })).toHaveCount(0); await expect(current.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("groupdeal_token"))).toBe("fixture-other-account-session"); expect(writes).toBe(1); await preserved(page);
});
