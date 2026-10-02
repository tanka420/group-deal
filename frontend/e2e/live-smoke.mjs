import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
const pageErrors = [];
let consoleErrors = 0;
const failedResources = [];
const networkFailures = [];
const consoleCategories = [];
page.on("response", response => { if (response.status() >= 400) failedResources.push({ host: new URL(response.url()).hostname, status: response.status() }); });
page.on("requestfailed", request => networkFailures.push({ host: new URL(request.url()).hostname, error: request.failure()?.errorText }));
page.on("pageerror", error => pageErrors.push(error.name));
page.on("console", message => { if (message.type() === "error") { consoleErrors++; consoleCategories.push(message.text().match(/net::ERR_[A-Z_]+|CORS|WebSocket|WalletConnect|Reown|Circle|Failed to load resource/gi) || ["OTHER"]); } });
try {
  const response = await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.getByText("Mạng Arc Testnet • USDC Smart Contract Escrow").waitFor();
  const health = await page.evaluate(async () => { const response = await fetch("/api/health"); const body = await response.json(); return { status: response.status, network: body.network }; });
  await page.getByRole("button", { name: /nạp usdc/i }).click();
  await page.getByRole("button", { name: "CCTP Bridge" }).click();
  await page.getByRole("button", { name: "Lấy báo giá bridge USDC vào Arc" }).waitFor();
  await page.screenshot({ path: "test-results/live-bridge-smoke.png", fullPage: true });
  console.log(JSON.stringify({ pageStatus: response.status(), health, pageErrors, consoleErrors, consoleCategories, failedResources, networkFailures, bridgeUi: "VISIBLE", scope: "read-only fresh browser, no login/signatures" }));
} finally { await browser.close(); }
