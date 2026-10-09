const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const priorPath = "reports/evidence/checks-fallback-2026-10-03T08-19-19-865Z/CHECKS.json", prior = JSON.parse(fs.readFileSync(path.join(root, priorPath)));
const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
const selected = [...new Set(listed)].filter(file => /^(backend\/(src|scripts|test)\/|contracts\/(contracts|scripts|test)\/|frontend\/(src|e2e)\/|sdk\/(src|test|examples)\/|shared\/)/.test(file) || /^(backend|contracts|frontend|sdk)\/(package(?:-lock)?\.json|tsconfig.*\.json|hardhat\.config\.ts|playwright\.config\.ts|vite\.config\.ts)$/.test(file) || ["sdk/README.md", "frontend/index.html", "frontend/fallback.html", "scripts/package_fallback.cjs", "scripts/serve_fallback.cjs", "scripts/capture_fallback_checks.cjs", "scripts/run_contract_checks.cjs", "scripts/capture_stateful_checks.cjs", "reports/RUNBOOK_VAN_HAN_ARC.md"].includes(file)).filter(file => fs.existsSync(path.join(root, file))).sort();
const files = selected.map(file => ({ path: file, sha256: hash(fs.readFileSync(path.join(root, file))) }));
for (const prefix of ["backend/", "frontend/", "sdk/", "shared/"]) {
  const current = files.filter(file => file.path.startsWith(prefix)), previous = prior.files.filter(file => file.path.startsWith(prefix));
  if (current.length !== previous.length || current.some(file => previous.find(old => old.path === file.path)?.sha256 !== file.sha256)) throw new Error(prefix + " changed; its previous proof cannot be reused");
}
const priorSolidity = prior.files.filter(file => file.path.startsWith("contracts/contracts/")), currentSolidity = files.filter(file => file.path.startsWith("contracts/contracts/"));
if (priorSolidity.length !== currentSolidity.length || currentSolidity.some(file => priorSolidity.find(old => old.path === file.path)?.sha256 !== file.sha256)) throw new Error("Solidity changed; verify fresh compiler/runtime compatibility before checkpointing");
const cases = [
  ["contracts", ".cache/v2-contract-stateful-full.log", /38 passing/, "node scripts/run_contract_checks.cjs all", "38 fresh local contract tests, including eight generated stateful seeds and executable deliberate cap-bug detection/shrink", "LOCAL_CONTRACT_AND_STATEFUL"],
  ["contract-types", ".cache/v2-contract-typecheck.log", /PASS CONTRACT_TYPES/, "node scripts/run_contract_checks.cjs types", "TypeScript noEmit after narrowing the V1/V2 fixture and fail-closed immutable reference guard", "LOCAL_TYPECHECK"],
  ["contract-compile-state", ".cache/v2-contract-local-compile.log", /Nothing to compile/, "node scripts/run_contract_checks.cjs compile", "Existing compiler artifacts remain current; this is not a clean-checkout compiler download/build proof", "LOCAL_EXISTING_ARTIFACT"],
];
const fresh = cases.map(([id, source, marker, command, summary, layer]) => {
  const bytes = fs.readFileSync(path.join(root, source)); if (!marker.test(bytes.toString()) || /\b[1-9]\d* (?:failing|failed)\b/.test(bytes.toString())) throw new Error("Successful completion missing: " + id);
  return { id, bytes, command, summary, layer, result: "PASS", exitCode: 0 };
});
const contractLog = fresh[0].bytes.toString();
const seeds = [1, 7, 19, 73, 311, 7331, 65537, 31153], seedRecords = seeds.map(seed => {
  const name = `seed-${seed}.json`, bytes = fs.readFileSync(path.join(root, ".cache/stateful-fuzz", name)), record = JSON.parse(bytes);
  if (record.result !== "PASS" || record.seed !== seed || !contractLog.includes(`PASS LOCAL_STATEFUL seed=${seed} transitions=${record.stats.transitions}`) || record.trace.length !== record.stats.transitions) throw new Error("Seed fixture/log mismatch");
  return { name, bytes, record };
});
const totals = { seeds: seeds.length, transitions: 0, accepted: {}, rejected: {}, additionalBuyerClaims: 0, cancelledAfterAllocation: 0, maximumOrders: 0 };
for (const { record } of seedRecords) {
  totals.transitions += record.stats.transitions; totals.additionalBuyerClaims += record.stats.additionalBuyerClaims;
  totals.cancelledAfterAllocation += record.stats.cancelledAfterAllocation; totals.maximumOrders = Math.max(totals.maximumOrders, record.stats.maximumOrders);
  for (const kind of ["accepted", "rejected"]) for (const [name, count] of Object.entries(record.stats[kind])) totals[kind][name] = (totals[kind][name] || 0) + count;
}
if (totals.transitions !== 972 || totals.additionalBuyerClaims !== 36 || totals.cancelledAfterAllocation !== 8) throw new Error("Current generated coverage differs; inspect and update the checkpoint explicitly");
const mutationBytes = fs.readFileSync(path.join(root, ".cache/stateful-fuzz/deliberate-cap-bug-minimal.json")), mutation = JSON.parse(mutationBytes);
if (!mutation.expectedDetection || !mutation.deletionMinimal || mutation.minimalLength !== 3 || !contractLog.includes("PASS LOCAL_DELIBERATE_BUG")) throw new Error("Deliberate-bug proof missing");
const debugFile = path.join(root, "contracts/artifacts/contracts/GroupDealHubV2.sol/GroupDealHubV2.dbg.json"), debug = JSON.parse(fs.readFileSync(debugFile));
const buildFile = path.resolve(path.dirname(debugFile), debug.buildInfo), build = JSON.parse(fs.readFileSync(buildFile)), compilerSources = [];
for (const [file, input] of Object.entries(build.input.sources)) {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes("..") || !file.startsWith("contracts/") && !file.startsWith("@openzeppelin/contracts/")) throw new Error("Unexpected compiler source path");
  const sourcePath = "contracts/" + (file.startsWith("contracts/") ? file : "node_modules/" + file);
  const current = fs.readFileSync(path.join(root, sourcePath));
  if (hash(current) !== hash(Buffer.from(input.content))) throw new Error("Compiler input changed: " + file);
  compilerSources.push({ path: sourcePath, sha256: hash(current) });
}
const carried = prior.checks.filter(check => check.id !== "contracts-unchanged").map(check => {
  const bytes = fs.readFileSync(path.join(root, check.log)); if (check.result !== "PASS" || check.exitCode !== 0 || hash(bytes) !== check.sha256) throw new Error("Previous log changed");
  return { ...check, bytes, sourceProof: priorPath, carriedForward: true, summary: "Carried only after complete source/config/test and immutable log hashes matched: " + check.summary };
});
for (const file of prior.standalone.files) if (hash(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw new Error("Archived fallback artifact changed");
const stamp = new Date().toISOString().replace(/[:.]/g, "-"), relative = "reports/evidence/checks-stateful-" + stamp, destination = path.join(root, relative);
fs.mkdirSync(destination, { recursive: false });
const write = (name, bytes) => { const target = path.join(destination, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: "wx" }); return { path: relative + "/" + name, sha256: hash(bytes) }; };
const checks = [...carried, ...fresh].map(check => { const log = write(check.id + ".log", check.bytes), { bytes, ...publicCheck } = check; return { ...publicCheck, log: log.path, sha256: log.sha256 }; });
const fixtures = seedRecords.map(({ name, bytes, record }) => ({ ...write("stateful/" + name, bytes), seed: record.seed, result: "PASS", transitions: record.stats.transitions, layer: record.layer }));
const mutationProof = write("stateful/deliberate-cap-bug-minimal.json", mutationBytes);
const failureCases = [
  ["hardhat-profile-cache", ".cache/v2-stateful-hardhat-cache-failed.log", 1, "Hardhat default profile directory failed in the restricted runtime; the child-only cache/config path now stays in the workspace."],
  ["fixture-initial-funding", ".cache/v2-stateful-initial-funding-failed.log", 9, "MockUSDC already funds its deployer; removed the extra deployer mint from the isolated fixture. No contract economics were changed."],
  ["contract-types-before-fix", ".cache/v2-contract-typecheck-before-fix.log", 2, "Dynamic factory selection lost generated method types, and immutableReferences could be absent. Narrowed factories and added a fail-closed presence guard."],
];
const interruptedRuns = failureCases.map(([id, source, exitCode, reason]) => { const proof = write(id + "-failed.log", fs.readFileSync(path.join(root, source))); return { id, result: "FAIL", exitCode, log: proof.path, sha256: proof.sha256, reason }; });
const record = { schemaVersion: 1, recordedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceFingerprint: hash(Buffer.from(JSON.stringify(files))), files, checks, sourceProof: priorPath, candidateFrozen: false, acceptanceEligible: false, activeDataMutated: false, liveDeploymentMutated: false,
  stateful: { layer: "LOCAL_STATEFUL_DIFFERENTIAL", ...totals, fixtures, deliberateBug: { ...mutationProof, layer: "LOCAL_DELIBERATE_BUG", actualVersion: 1, expectedModelVersion: 2, deletionMinimal: true, originalCommands: 5, minimalCommands: 3 },
    scope: "Independent model versus real local contract transitions/token balances/claim events, with synthetic actor authorization and MockUSDC", limitations: ["Contract/projection differential on the same generated stream not implemented", "Maximum 12 orders; no large-order bounded gas proof", "No concurrent mempool/multiwriter generated interleavings", "Only first-unit cap deliberate implementation mutation; no scalar parameter shrinking", "CI and real-principal/provider/live proof absent"] },
  compilerInputs: { solcVersion: build.solcVersion, solcLongVersion: build.solcLongVersion, buildInfoSha256: hash(fs.readFileSync(buildFile)), sourceHashes: compilerSources, unchangedSolidityAgainst: priorPath, initializedRuntimeTestFresh: true, cleanCheckoutVerified: false },
  inheritedFallback: { sourceProof: priorPath, files: prior.standalone.files, acceptanceEligible: false }, interruptedRuns,
  openGates: prior.openGates.map(gate => gate.replace(" and stateful fuzz incomplete", " incomplete")).concat(["Stateful contract generation is local only; projection differential, concurrent/large-order gas, further mutations and CI remain open", "No source Solidity/active DB/live deployment changed by this packet"]),
  captureScript: { path: "scripts/capture_stateful_checks.cjs", sha256: hash(fs.readFileSync(__filename)), packet: "stateful" } };
write("CHECKS.json", Buffer.from(JSON.stringify(record, null, 2) + "\n"));
console.log(JSON.stringify({ report: relative + "/CHECKS.json", sourceFingerprint: record.sourceFingerprint, fileCount: files.length, checks: checks.length, transitions: totals.transitions, additionalBuyerClaims: totals.additionalBuyerClaims, candidateFrozen: false, acceptanceEligible: false }));
