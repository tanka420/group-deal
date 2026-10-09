const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

process.env.LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(os.tmpdir(), "groupdeal-hardhat-cache");
const isWin = process.platform === "win32";
const npxCmd = isWin ? "npx.cmd" : "npx";

const res = spawnSync(npxCmd, ["hardhat", "test"], {
  cwd: path.resolve(__dirname, "../contracts"),
  stdio: "inherit",
  shell: isWin,
  env: {
    ...process.env,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  },
});
process.exit(res.status ?? 1);
