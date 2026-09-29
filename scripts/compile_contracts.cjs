const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { generateAbi } = require("./generate_abi.cjs");

process.env.LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(os.tmpdir(), "groupdeal-hardhat-cache");
const isWin = process.platform === "win32";
const npxCmd = isWin ? "npx.cmd" : "npx";

console.log("[Tooling] Compiling contracts with safe Hardhat cache...");
const res = spawnSync(npxCmd, ["hardhat", "compile"], {
  cwd: path.resolve(__dirname, "../contracts"),
  stdio: "inherit",
  shell: isWin,
  env: {
    ...process.env,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  },
});

if (res.status !== 0) {
  console.error("[Tooling] Hardhat compile failed with exit code:", res.status);
  process.exit(res.status || 1);
}

console.log("[Tooling] Generating ABI and type bindings...");
generateAbi();
console.log("[Tooling] Contract compilation and ABI generation completed successfully!");
