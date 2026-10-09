const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const priorPath = "reports/evidence/checks-orders-2026-10-03T07-21-41-714Z/CHECKS.json";
const prior = JSON.parse(fs.readFileSync(path.join(root, priorPath)));
const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
const selected = [...new Set(listed)].filter(file =>
  /^(backend\/(src|scripts|test)\/|contracts\/(contracts|scripts|test)\/|frontend\/(src|e2e)\/|sdk\/(src|test|examples)\/|shared\/)/.test(file) ||
  /^(backend|contracts|frontend|sdk)\/(package(?:-lock)?\.json|tsconfig.*\.json|hardhat\.config\.ts|playwright\.config\.ts|vite\.config\.ts)$/.test(file) ||
  ["sdk/README.md", "frontend/index.html", "frontend/fallback.html", "scripts/package_fallback.cjs", "scripts/serve_fallback.cjs", "scripts/capture_fallback_checks.cjs", "reports/RUNBOOK_VAN_HAN_ARC.md"].includes(file)
).filter(file => fs.existsSync(path.join(root, file))).sort();
const files = selected.map(file => ({ path: file, sha256: hash(fs.readFileSync(path.join(root, file))) }));

// A prior PASS is reused only for an identical complete source/config/test set.
for (const prefix of ["backend/", "contracts/", "sdk/"]) {
  const current = files.filter(file => file.path.startsWith(prefix));
  const previous = prior.files.filter(file => file.path.startsWith(prefix));
  if (current.length !== previous.length || current.some(file => previous.find(old => old.path === file.path)?.sha256 !== file.sha256)) throw new Error(prefix + " changed; its previous proof cannot be carried forward");
}
const freshCases = [
  ["frontend-build", ".cache/v2-fallback-build.log", /built in/, "npm --prefix frontend run build", "TypeScript/Vite multipage build; main app eval and large-chunk warnings remain", "LOCAL_BUILD"],
  ["browser", ".cache/v2-browser-fallback-current.log", /50 passed/, "PLAYWRIGHT_REUSE_SERVER=1 npm --prefix frontend run test:e2e", "50 browser cases; wallet and RPC transports are fixtures, including 14 fallback cases", "LOCAL_FIXTURE"],
  ["fallback-built-artifact", ".cache/v2-fallback-artifact.log", /14 passed/, "GROUPDEAL_FALLBACK_BASE_URL=http://127.0.0.1:4168 npx playwright test e2e/fallback.spec.ts", "14 cases on the separately served static package, with app/API requests blocked; fixture wallet/RPC", "LOCAL_FIXTURE_BUILT_ARTIFACT"],
];
const fresh = freshCases.map(([id, source, marker, command, summary, layer]) => {
  const bytes = fs.readFileSync(path.join(root, source));
  if (!marker.test(bytes.toString()) || /\b[1-9]\d* failed\b/.test(bytes.toString())) throw new Error("Missing successful completion for " + id);
  return { id, source, bytes, command, summary, layer, result: "PASS", exitCode: 0, sha256: hash(bytes) };
});
const carried = ["backend", "backend-build", "sdk-consumer", "contracts-unchanged"].map(id => {
  const check = prior.checks.find(check => check.id === id);
  if (!check || check.result !== "PASS" || check.exitCode !== 0) throw new Error("Prior PASS missing: " + id);
  const bytes = fs.readFileSync(path.join(root, check.log));
  if (hash(bytes) !== check.sha256) throw new Error("Prior log changed: " + id);
  return { ...check, bytes, sourceProof: priorPath, carriedForward: true, summary: "Carried unchanged source/config/test set and verified immutable log: " + check.summary };
});

async function main() {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, ".cache/fallback-latest-package.json")));
  if (!/^\.cache\/fallback-release-[\dTZ-]+$/.test(artifact.artifactDirectory)) throw new Error("Invalid owned artifact directory");
  const packageFile = path.join(root, artifact.artifactDirectory, "PACKAGE.json");
  const packageBytes = fs.readFileSync(packageFile);
  if (JSON.stringify(JSON.parse(packageBytes)) !== JSON.stringify(artifact)) throw new Error("Latest package identity changed");
  const boundary = { layer: "LOCAL_STATIC_PACKAGE_BOUNDARY", acceptanceEligible: false, package: artifact.artifactDirectory + "/PACKAGE.json", server: "http://127.0.0.1:4168", files: [], blocked: [] };
  for (const file of artifact.files) {
    if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes("..") || file.path !== "fallback.html" && !file.path.startsWith("assets/")) throw new Error("Unexpected artifact path");
    const bytes = fs.readFileSync(path.join(root, artifact.artifactDirectory, file.path));
    if (hash(bytes) !== file.sha256 || hash(fs.readFileSync(path.join(root, "frontend/dist", file.path))) !== file.sha256) throw new Error("Built/package asset mismatch");
    const response = await fetch(boundary.server + "/" + file.path);
    if (response.status !== 200 || hash(Buffer.from(await response.arrayBuffer())) !== file.sha256) throw new Error("Served package mismatch");
    boundary.files.push({ path: file.path, status: 200, sha256: file.sha256 });
  }
  for (const file of ["/api/transactions", "/src/App.tsx", "/index.html"]) {
    const response = await fetch(boundary.server + file);
    if (response.status !== 404) throw new Error("Main app/API route exposed by standalone host");
    boundary.blocked.push({ path: file, status: 404 });
  }
  const resultRoot = path.join(root, ".cache/fallback-artifact-test-results");
  const shot = fs.readdirSync(resultRoot).map(name => path.join(resultRoot, name, "fallback-independent-local.png")).find(file => fs.existsSync(file));
  if (!shot) throw new Error("Built artifact screenshot missing");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relative = "reports/evidence/checks-fallback-" + stamp, destination = path.join(root, relative);
  fs.mkdirSync(destination, { recursive: false });
  const write = (name, bytes) => {
    const target = path.join(destination, name); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx" }); return { path: relative + "/" + name, sha256: hash(bytes) };
  };
  const checks = [...carried, ...fresh].map(check => {
    const log = write(check.id + ".log", check.bytes); const { bytes, source, ...record } = check;
    return { ...record, log: log.path, sha256: log.sha256 };
  });
  const boundaryLog = write("static-boundary.json", Buffer.from(JSON.stringify(boundary, null, 2) + "\n"));
  checks.push({ id: "static-package-boundary", layer: boundary.layer, result: "PASS", exitCode: 0, command: "node scripts/capture_fallback_checks.cjs", summary: "Every packaged asset served with identical SHA256; main App and API routes absent", log: boundaryLog.path, sha256: boundaryLog.sha256 });
  const standalone = [write("standalone/PACKAGE.json", packageBytes)];
  for (const file of artifact.files) standalone.push(write("standalone/" + file.path, fs.readFileSync(path.join(root, artifact.artifactDirectory, file.path))));
  const visual = write("fallback-independent-local.png", fs.readFileSync(shot));
  const failure = write("fallback-json-import-failed.log", fs.readFileSync(path.join(root, ".cache/v2-fallback-json-import-failed.log")));
  const observation = JSON.parse(fs.readFileSync(path.join(root, "frontend/e2e/fixtures/arc-runtime-public.json")));
  const record = {
    schemaVersion: 1, recordedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceFingerprint: hash(Buffer.from(JSON.stringify(files))), files, checks, candidateFrozen: false, acceptanceEligible: false,
    activeDataMutated: false, liveDeploymentMutated: false, sourceProof: priorPath,
    standalone: { testedPackage: artifact.artifactDirectory + "/PACKAGE.json", packageSha256: hash(packageBytes), archivedEntry: relative + "/standalone/fallback.html", files: standalone, layer: "BUILT_STATIC_ARTIFACT", networkRequired: true, dependencies: artifact.dependencies, unsupported: artifact.unsupported },
    visualArtifacts: [{ ...visual, layer: "LOCAL_FIXTURE_BUILT_ARTIFACT", viewport: { width: 1440, height: 900 } }],
    publicRuntimeObservation: { source: "frontend/e2e/fixtures/arc-runtime-public.json", sourceSha256: hash(fs.readFileSync(path.join(root, "frontend/e2e/fixtures/arc-runtime-public.json"))), blockNumber: observation.blockNumber, bytecodeHash: observation.bytecodeHash, layer: "READ_ONLY_PUBLIC_RUNTIME", acceptanceEligible: false, note: "Public deployed runtime only. All order/state/receipt and EIP1193 signing transports in browser tests are synthetic fixtures." },
    interruptedRuns: [{ id: "fallback-node-json-import", result: "FAIL", exitCode: 1, log: failure.path, sha256: failure.sha256, reason: "Node 24 requires an attribute for direct JSON imports. The test now reads JSON as UTF-8 using node:fs; no deployed manifest was changed." }],
    openGates: ["Independent Circle principal signing and real external/embedded outage drill are unproved", "No separate public fallback hosting/deployment", "Legacy writer/provenance/cursor cutover remains open", "V2 contract is not deployed; no new G5 product/provider/real-principal receipts", "Safe independent custody/emergency proof, rejection/expiration/replacement lineage remain open", "Four master screens/full VI–EN/accessibility/performance/CI and stateful fuzz incomplete", "Independent G6 reviewer/sign-off absent; historical G5/G6 stay revoked"],
    captureScript: { path: "scripts/capture_fallback_checks.cjs", sha256: hash(fs.readFileSync(__filename)), packet: "fallback" },
  };
  write("CHECKS.json", Buffer.from(JSON.stringify(record, null, 2) + "\n"));
  console.log(JSON.stringify({ report: relative + "/CHECKS.json", sourceFingerprint: record.sourceFingerprint, fileCount: files.length, checks: checks.length, candidateFrozen: false, acceptanceEligible: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
