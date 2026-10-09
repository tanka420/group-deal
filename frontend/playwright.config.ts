import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform === "win32" && existsSync(installedChrome) ? installedChrome : undefined);
const browserPort=Number(process.env.GROUPDEAL_BROWSER_PORT||4173);
if(!Number.isInteger(browserPort)||browserPort<1024||browserPort>65535)throw new Error("Invalid local browser port");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${browserPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.GROUPDEAL_FALLBACK_BASE_URL || process.env.GROUPDEAL_BROWSER_MODE === "preview" ? undefined : {
    command: `npm run dev -- --host 127.0.0.1 --port ${browserPort} --strictPort`,
    url: `http://127.0.0.1:${browserPort}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 120_000,
    env: {
      VITE_CIRCLE_APP_ID: "e2e-only-circle-app-id",
      VITE_REOWN_PROJECT_ID: "",
    },
  },
});
