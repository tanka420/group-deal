const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), cwd = path.join(root, "contracts"), mode = process.argv[2] || "all";
if (!['all', 'fuzz', 'projection', 'concurrency', 'gas', 'types', 'compile', 'expiry','preparation'].includes(mode)) throw new Error("Use all, fuzz, projection, concurrency, gas, types, compile, expiry or preparation");
const runtime = path.join(root, ".cache", "hardhat-tests"); fs.mkdirSync(runtime, { recursive: true });
const argv = mode === "types" ? ["node_modules/typescript/bin/tsc", "--noEmit"] : mode === "compile" ? ["node_modules/hardhat/internal/cli/cli.js", "compile", "--network", "hardhat"] : ["node_modules/hardhat/internal/cli/cli.js", "test", "--no-compile", "--network", "hardhat", ...(["fuzz","projection"].includes(mode) ? ["test/StatefulDifferential.test.ts"] : mode === "concurrency" ? ["test/ConcurrentTransitions.test.ts"] : mode === "gas" ? ["test/BoundedGas.test.ts"] : mode === "expiry" ? ["test/AuthorizationExpiry.test.ts"] : mode==='preparation'?['test/DeploymentPreparation.test.ts']:[])];
// Child-only runtime paths keep Hardhat's cache/analytics/config out of the user's profile.
const result = spawnSync(process.execPath, argv, { cwd, stdio: "inherit", env: { ...process.env, LOCALAPPDATA: runtime, APPDATA: runtime, HARDHAT_TELEMETRY_CONSENT: "false",GROUPDEAL_FUZZ_BACKEND:mode==="projection"?"1":"0" } });
if (result.error) { console.error("Contract check process could not start"); process.exit(1); }
process.exit(result.status ?? 1);
