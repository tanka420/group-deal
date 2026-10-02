const { spawnSync } = require("child_process");
const path = require("path");

function runStep(name, cmd, args, cwd) {
  console.log(`\n======================================================`);
  console.log(`>>> [Pipeline Step] ${name}`);
  console.log(`>>> Command: ${cmd} ${args.join(" ")} in ${cwd || process.cwd()}`);
  console.log(`======================================================\n`);

  const isWin = process.platform === "win32";
  const executable = isWin && (cmd === "npm" || cmd === "npx") ? `${cmd}.cmd` : cmd;

  const result = spawnSync(executable, args, {
    cwd: cwd || path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });

  if (result.error) {
    console.error(`\n❌ [Pipeline Failed] Step "${name}" error:`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\n❌ [Pipeline Failed] Step "${name}" exited with code ${result.status}\n`);
    process.exit(result.status || 1);
  }
  console.log(`\n✔ [Pipeline Step Passed] ${name}\n`);
}

console.log("======================================================");
console.log("   GROUPDEAL DETERMINISTIC REPRODUCIBILITY PIPELINE   ");
console.log("======================================================");

// 1. Clean
runStep("Clean", "npm", ["run", "clean"]);

// 2. Compile contracts & generate ABI
runStep("Compile & Generate ABI", "npm", ["run", "compile"]);

// 3. Tests (Contracts + Backend)
runStep("Run Tests", "npm", ["test"]);

// 4. Arc Testnet Smoke Probe
runStep("Arc Testnet Smoke Probe", "npm", ["run", "test:arc-smoke"]);

// 5. Backend Build
runStep("Build Backend", "npm", ["run", "backend:build"]);

// 6. SDK Build
runStep("Build SDK", "npm", ["run", "build:sdk"]);

// 7. Frontend Build
runStep("Build Frontend", "npm", ["run", "frontend:build"]);

// 8. Typecheck
runStep("Typecheck", "npm", ["run", "typecheck"]);

// 9. Browser acceptance tests (credential-free fail-closed paths)
runStep("Browser Acceptance", "npm", ["run", "test:browser"]);

// 10. Git Diff Check (ignore CRLF whitespace)
runStep("Git Diff Hygiene Check", "git", ["diff", "--check"]);

console.log("\n🎉 ALL REPRODUCIBILITY PIPELINE STEPS PASSED SUCCESSFULLY!\n");
