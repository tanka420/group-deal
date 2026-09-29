const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

process.env.LOCALAPPDATA = path.join(os.tmpdir(), "groupdeal-hardhat-cache");
const res = spawnSync("npx", ["hardhat", "test"], {
  cwd: path.resolve(__dirname, "../contracts"),
  stdio: "inherit",
  shell: true,
});
process.exit(res.status || 0);
