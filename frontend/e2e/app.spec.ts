import { expect, test } from "@playwright/test";
import {installEmptyCatalog} from './fixtures/catalog';

test.beforeEach(async ({ page }) => {
  await installEmptyCatalog(page,'0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574');
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `export class W3SSdk {
      updateConfigs() {} getDeviceId() { return Promise.reject(new Error("Circle disabled in this fixture")); }
    } export default { W3SSdk };`,
  }));
  // These tests verify local application behaviour, not external font/RPC uptime.
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
  await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?/, async (route) => {
    const payload = route.request().postDataJSON();
    const reply = (request: { id: number; method: string }) => ({
      jsonrpc: "2.0", id: request.id,
      result: request.method === "eth_getBalance" ? "0x265559f3fb4200000" : "0x4cef52",
    });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(Array.isArray(payload) ? payload.map(reply) : reply(payload)) });
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        network: "Arc Testnet (5042002)",
        hubAddress: "0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574",
        usdcAddress: "0x3600000000000000000000000000000000000000",
      }),
    })
  );
  await page.route("**/api/campaigns", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"campaigns":[]}' })
  );
  await page.route("**/api/notifications", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"notifications":[],"unread":0}',
    })
  );
});

test("renders Arc identity and fails closed when Circle is not configured", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByText("Mạng Arc Testnet • USDC Smart Contract Escrow")).toBeVisible();
  await expect(page.getByText("Chain ID: 5042002")).toBeVisible();

  await page.getByRole("button", { name: /đăng nhập/i }).click();
  const walletLogin = page.getByRole("button", { name: "Đăng nhập bằng ví hiện chưa sẵn sàng", exact: true });
  await expect(walletLogin).toBeDisabled();
  await expect(page.getByText(/Thao tác này không tạo giao dịch chuyển tiền/i)).toBeVisible();
  await page.getByLabel("Địa chỉ email", { exact: true }).fill("buyer@example.com");
  const submit = page.getByRole("button", { name: "Đăng nhập email hiện chưa sẵn sàng", exact: true });
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/Không nhập seed phrase hay private key vào GroupDeal/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("offers an in-app Arc App Kit bridge and reports missing Reown configuration", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: /nạp usdc/i }).click();
  await page.getByRole("button", { name: "CCTP Bridge" }).click();

  await expect(page.getByText(/Kết nối ví ngoài chưa được cấu hình/)).toBeVisible();
  await expect(page.getByText("Arc Testnet (5042002)").last()).toBeVisible();
  await page.getByLabel("Số USDC cần bridge").fill("1.25");
  await expect(page.getByRole("button", { name: "Lấy báo giá bridge USDC vào Arc" })).toBeDisabled();
  await expect(page.getByText("Hãy đăng nhập trước",{exact:true})).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("restores the authenticated wallet after reload and requests faucet in-app", async ({ page }) => {
  const address = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "mock-session-not-live"));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ user: {
      id: "mock-buyer", email: null, roles: ["buyer"], loginMethod: "EVM_WALLET", activeWallet: address,
    } }),
  }));
  let requests = 0;
  await page.route("**/api/faucet/usdc", async (route) => {
    expect(route.request().postDataJSON().address.toLowerCase()).toBe(address);
    expect(route.request().headers().authorization).toBe("Bearer mock-session-not-live");
    requests += 1;
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({
      message: "Circle đã nhận yêu cầu faucet. Số dư sẽ cập nhật khi token đến ví.",
    }) });
  });
  await page.goto("/");
  await page.reload();
  await page.getByRole("button", { name: /nạp usdc/i }).click();
  await expect(page.getByText(new RegExp(address, "i"))).toBeVisible();
  await page.getByRole("button", { name: "Nhận USDC testnet trực tiếp" }).click();
  await expect(page.getByRole('dialog').getByRole("status")).toContainText("Faucet đã nhận yêu cầu");
  expect(requests).toBe(1);
  expect(page.context().pages()).toHaveLength(1);
  await page.getByRole("button", { name: "Đóng nạp USDC" }).click();
  await page.getByRole("button", { name: /^Thông báo/ }).click();
  await expect(page.getByRole("button", { name: "Kết nối lại ví để ký" })).toBeVisible();
});

test("email session opens immediately and binds an existing wallet even without SDK execute callback", async ({ page }) => {
  const address = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
  const user = { id: "circle-fixture", email: "fixture@example.com", roles: ["buyer"], loginMethod: "CIRCLE_EMAIL", activeWallet: null };
  await page.route("**/*circle-fin_w3s-pw-web-sdk.js*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `let singleton;
      export class W3SSdk {
        constructor(config, callback) { this.callback = callback; if(singleton) return singleton; singleton = this; }
        updateConfigs(config, callback) { if(callback) this.callback = callback; }
        getDeviceId() { return Promise.resolve("e2e-device-id"); }
        setAuthentication() {}
        verifyOtp() { this.callback(undefined, {userToken:"fixture-user-token",encryptionKey:"fixture-encryption-key",refreshToken:"fixture-refresh-token"}); }
        execute() { /* Deliberately never emits completion. Inventory must recover. */ }
      } export default { W3SSdk };`,
  }));
  await page.route("**/api/circle/email/token", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ loginAttemptId: "fixture-attempt", deviceToken: "fixture-device-token", deviceEncryptionKey: "fixture-key", otpToken: "fixture-otp-token" }) }));
  await page.route("**/api/circle/session", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ token: "fixture-session", user, walletInitialized: false }) }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user }) }));
  await page.route("**/api/circle/wallet/initialize", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ challengeId: "fixture-challenge" }) }));
  let inventoryCalls = 0;
  await page.route("**/api/circle/wallets", async (route) => {
    inventoryCalls++;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      wallets: [{ address, walletId: "fixture-wallet", blockchain: "ARC-TESTNET" }],
      user: { ...user, activeWallet: address, circleWallet: { address, walletId: "fixture-wallet", blockchain: "ARC-TESTNET" } },
    }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /đăng nhập/i }).click();
  await page.getByLabel("Địa chỉ Email").fill("fixture@example.com");
  await page.getByRole("button", { name: "Gửi mã OTP qua Circle" }).click();
  await page.getByRole("button", { name: "Mở xác thực Circle" }).click();
  await expect(page.getByRole("button", { name: "Đóng đăng nhập" })).not.toBeVisible({ timeout: 2000 });
  await page.getByRole("button", { name: /nạp usdc/i }).click();
  await expect(page.getByText(new RegExp(address, "i"))).toBeVisible();
  expect(inventoryCalls).toBeGreaterThan(0);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("fixture-user-token");
  expect(stored).not.toContain("fixture-encryption-key");
});

test("email account can reopen OTP after reload without logging out", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "fixture-session"));
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    user: { id: "circle-fixture", email: "fixture@example.com", roles: ["buyer"], loginMethod: "CIRCLE_EMAIL", activeWallet: null },
  }) }));
  await page.goto("/");
  await page.getByRole("button", { name: /^Thông báo/ }).click();
  await page.getByRole("button", { name: "Xác thực email để ký / đồng bộ ví" }).click();
  await expect(page.getByLabel("Địa chỉ Email")).toBeVisible();
});

test("SDK result without a captured financial write cannot confirm a mint", async ({ page }) => {
  const sender = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
  const recipient = "0x580cdb6a6354313f73ff16b160b15dcc914d21ae";
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "fixture-session"));
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: {
    id: "circle-fixture", email: "fixture@example.com", roles: ["buyer"], loginMethod: "CIRCLE_EMAIL", activeWallet: recipient,
    circleWallet: { address: recipient, walletId: "fixture-wallet", blockchain: "ARC-TESTNET" },
  } }) }));
  await page.route("**/src/context/ExternalWalletContext.tsx*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `export const ExternalWalletProvider = ({children}) => children;
      const provider = { request: async ({method}) => {
        if(method==="eth_accounts") return ["${sender}"];
        if(method==="eth_chainId") return "0xaa36a7";
        if(method==="eth_getBalance") return "0xde0b6b3a7640000";
        if(method==="eth_call") return "0x"+BigInt(100000000).toString(16).padStart(64,"0");
        return null;
      } };
      export const useExternalWallet = () => ({ configured:true, connected:true, address:"${sender}", chainId:5042002, provider,
        getProvider:()=>provider, connect:async()=>"${sender}", disconnect:async()=>{},
        getSigner:async()=>({getAddress:async()=>"${sender}"}) });`,
  }));
  await page.route("**/*circle-fin_adapter-viem-v2.js*", (route) => route.fulfill({ contentType: "application/javascript",
    body: "export const createViemAdapterFromProvider = () => ({actionRegistry:{registerHandler(){},executeAction(){throw Error('Mock SDK must not execute registry actions');}}}); export default { createViemAdapterFromProvider };",
  }));
  await page.route("**/*circle-fin_app-kit.js*", (route) => route.fulfill({ contentType: "application/javascript",
    body: `export class AppKit {
      on(){} off(){} getSupportedChains(){return [{"chain":"Ethereum_Sepolia","type":"evm","name":"Ethereum_Sepolia","isTestnet":true,"chainId":11155111,"usdcAddress":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","cctp":{"domain":0,"contracts":{"v2":{"type":"split","tokenMessenger":"0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA","messageTransmitter":"0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"}}},"kitContracts":{"bridge":"0xC5567a5E3370d4DBfB0540025078e283e36A363d"}},{"chain":"Arc_Testnet","type":"evm","name":"Arc_Testnet","isTestnet":true,"chainId":5042002,"usdcAddress":"0x3600000000000000000000000000000000000000","cctp":{"domain":26,"contracts":{"v2":{"type":"split","tokenMessenger":"0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA","messageTransmitter":"0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"}}},"kitContracts":{"bridge":"0xC5567a5E3370d4DBfB0540025078e283e36A363d"}}];}
      async estimateBridge(params) { window.bridgeEstimate = {recipient:params.to.recipientAddress,amount:params.amount,batch:params.config.batchTransactions}; return {
        token:"USDC",amount:params.amount,source:{address:"${sender}",chain:"Ethereum_Sepolia"},destination:{address:"${sender}",recipientAddress:params.to.recipientAddress,chain:"Arc_Testnet"},
        fees:[{type:"provider",token:"USDC",amount:"0"}],gasFees:[{name:"burn",token:"ETH",blockchain:"Ethereum_Sepolia",fees:{gas:100000n,gasPrice:1000000000n,fee:"0.0001"}}] }; }
      async bridge(params) { window.bridgeWrites = (window.bridgeWrites||0)+1; return {
        token:"USDC",amount:params.amount,state:"success",provider:"CCTPv2",
        source:{address:"${sender}",chain:{chain:"Ethereum_Sepolia",chainId:11155111}},
        destination:{address:"${sender}",recipientAddress:params.to.recipientAddress,chain:{chain:"Arc_Testnet",chainId:5042002}},
        steps:[{name:"burn",state:"success",txHash:"0x"+"1".repeat(64)}, {name:"mint",state:"success"}] }; }
      async retryBridge(result) { window.bridgeRetried = {recipient:result.destination.recipientAddress,amount:result.amount}; return {...result,state:"success",steps:result.steps.map(step=>({...step,state:"success"}))}; }
    } export default {AppKit};`,
  }));
  await page.goto("/");
  await page.getByRole("button", { name: /nạp usdc/i }).click();
  await page.getByRole("button", { name: "CCTP Bridge" }).click();
  await page.getByLabel("Số USDC cần bridge").fill("1.25");
  await page.getByRole("button", { name: "Lấy báo giá bridge USDC vào Arc" }).click();
  await expect(page.getByText(/Số nhận dự kiến tối thiểu/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).bridgeWrites || 0)).toBe(0);
  await page.getByRole("button", { name: "Xác nhận bridge USDC vào Arc" }).click();
  await expect(page.getByRole('dialog').locator('p[role="status"]')).toContainText("Lượt đã dừng trước burn");
  await expect(page.getByText(/Receipt Arc xác nhận đã mint/)).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Tiếp tục attestation / mint"})).toHaveCount(0);
  const evidence=await page.evaluate(recipient=>({writes:(window as any).bridgeWrites,record:JSON.parse(localStorage.getItem('groupdeal_bridge:v2:'+recipient)!)}),recipient);
  expect(evidence.writes).toBe(1); // SDK method call, no wallet transaction.
  expect(evidence.record.writes).toEqual([]);
  const estimate=await page.evaluate(()=>(window as any).bridgeEstimate);
  expect(estimate).toMatchObject({amount:"1.25",batch:false});expect(estimate.recipient.toLowerCase()).toBe(recipient);

});

test("bridge blocks a source wallet with USDC but no native ETH before estimating or writing", async ({ page }) => {
  const address = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "fixture-session"));
  await page.route("**/api/auth/me", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: {
    id: "fixture", email: null, loginMethod: "EVM_WALLET", roles: ["buyer"], activeWallet: address,
  } }) }));
  await page.route("**/src/context/ExternalWalletContext.tsx*", route => route.fulfill({ contentType: "application/javascript", body: `
    export const ExternalWalletProvider=({children})=>children;
    const provider={request:async({method})=>method==="eth_accounts"?["${address}"]:method==="eth_chainId"?"0xaa36a7":method==="eth_getBalance"?"0x0":method==="eth_call"?"0x"+BigInt(100000000).toString(16).padStart(64,"0"):null};
    export const useExternalWallet=()=>({configured:true,connected:true,address:"${address}",provider,getProvider:()=>provider,getSigner:async()=>({getAddress:async()=>"${address}"})});` }));
  await page.route("**/*circle-fin_adapter-viem-v2.js*", route => route.fulfill({ contentType: "application/javascript",
    body: "export const createViemAdapterFromProvider=()=>({actionRegistry:{registerHandler(){},executeAction(){throw Error('Mock SDK must not execute registry actions');}}}); export default {createViemAdapterFromProvider};" }));
  await page.route("**/*circle-fin_app-kit.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    export class AppKit {on(){} off(){} async estimateBridge(){window.unexpectedEstimate=true;throw new Error("Unexpected estimate")} async bridge(){window.unexpectedWrite=true;} } export default {AppKit};` }));
  await page.goto("/");
  await page.getByRole("button", { name: /nạp usdc/i }).click();
  await page.getByRole("button", { name: "CCTP Bridge" }).click();
  await page.getByRole("button", { name: "Lấy báo giá bridge USDC vào Arc" }).click();
  await expect(page.getByRole("alert")).toContainText("Ví nguồn không có ETH");
  expect(await page.evaluate(() => Boolean((window as any).unexpectedEstimate || (window as any).unexpectedWrite))).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("groupdeal_bridge:")))).toBe(false);
});

test("balance survives RPC failure and failover avoids a false zero", async ({ page }) => {
  const address = "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d";
  let unavailable = false;
  await page.addInitScript(() => localStorage.setItem("groupdeal_token", "fixture-session"));
  await page.route("**/api/auth/me", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: {
    id: "fixture", email: null, loginMethod: "EVM_WALLET", roles: ["buyer"], activeWallet: address,
  } }) }));
  await page.route(/https:\/\/rpc(?:\.[a-z]+)?\.testnet\.arc\.io\/?/, route => {
    if (unavailable || route.request().url().includes("//rpc.testnet")) return route.fulfill({ status: 429, body: "busy" });
    const batch = route.request().postDataJSON();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(batch.map((request: any) => ({
      id: request.id, result: request.method === "eth_chainId" ? "0x4cef52" : "0x37b387604ebf16400",
    }))) });
  });
  await page.goto("/");
  await expect(page.getByText("64.219208 USDC", { exact: true })).toBeVisible();
  unavailable = true;
  await page.getByRole("button", { name: /nạp usdc/i }).click();
  await page.getByRole("button", { name: "Tôi đã nhận USDC — cập nhật số dư" }).click();
  await expect(page.getByText("64.219208 USDC · chưa cập nhật", { exact: true })).toBeVisible();
});
