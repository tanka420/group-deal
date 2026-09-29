const fs = require("fs");
const path = require("path");

const dirsToClean = [
  path.resolve(__dirname, "../contracts/artifacts"),
  path.resolve(__dirname, "../contracts/cache"),
  path.resolve(__dirname, "../contracts/typechain-types"),
  path.resolve(__dirname, "../backend/dist"),
  path.resolve(__dirname, "../frontend/dist"),
  path.resolve(__dirname, "../sdk/dist"),
];

console.log("[Clean] Cleaning build artifacts and caches...");
for (const dir of dirsToClean) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✔ Removed: ${dir}`);
  }
}
console.log("[Clean] Completed successfully.");
