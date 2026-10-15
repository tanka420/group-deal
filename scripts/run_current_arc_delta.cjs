'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = '47d853f79ff5c2b1c8ac7f0f8163ca613fb82d9a';
const application = '9825db3a0b5c505d0fb40599b51dad562252143a';
const infrastructure = [
  '.github/workflows/local-candidate.yml',
  'scripts/current_arc_delta.json',
  'scripts/run_current_arc_delta.cjs',
  'test/current_arc_delta.test.cjs',
];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
function git(directory, args, bytes = false) {
  return cp.execFileSync('git', ['-C', directory, ...args], {
    encoding: bytes ? undefined : 'utf8', windowsHide: true, timeout: 20000,
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
  });
}
function inspectScope(directory, packet) {
  if (!packet || !/^[a-f0-9]{40}$/.test(packet.baselineCommit) ||
      !/^[a-f0-9]{40}$/.test(packet.applicationCommit) || !Array.isArray(packet.changedFiles)) fail('DELTA_PACKET_INVALID');
  const changed = git(directory, ['diff', '--name-only', '-z', packet.baselineCommit, packet.applicationCommit]).split('\0').filter(Boolean).sort();
  if (JSON.stringify(changed) !== JSON.stringify(packet.changedFiles.map(f => f.path).sort()) ||
      new Set(packet.changedFiles.map(f => f.path)).size !== changed.length) fail('DELTA_PACKET_FILES_MISMATCH');
  for (const file of packet.changedFiles) {
    if (typeof file.path !== 'string' || file.path.includes('..') || file.path.startsWith('/') ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        sha(git(directory, ['show', packet.applicationCommit + ':' + file.path], true)) !== file.sha256) fail('DELTA_PACKET_BLOB_MISMATCH');
  }
  const extra = git(directory, ['diff', '--name-only', '-z', packet.applicationCommit, 'HEAD']).split('\0').filter(Boolean);
  if (extra.some(file => !infrastructure.includes(file))) fail('APPLICATION_CHANGED_OUTSIDE_PINNED_DELTA');
  if (git(directory, ['status', '--porcelain']).trim()) fail('DELTA_WORKTREE_DIRTY');
  return {
    sourceCommit: git(directory, ['rev-parse', 'HEAD']).trim(),
    baselineCommit: packet.baselineCommit, applicationCommit: packet.applicationCommit,
    changedApplicationFiles: changed.length, infrastructureDelta: extra.sort(),
    applicationIdenticalToPinnedCommit: true,
  };
}
function readPacket() {
  const packet = JSON.parse(fs.readFileSync(path.join(__dirname, 'current_arc_delta.json')));
  if (packet.baselineCommit !== baseline || packet.applicationCommit !== application ||
      packet.baselineCiRun !== '38354629984') fail('DELTA_PIN_CHANGED');
  const browsers = packet.changedFiles.map(f => f.path).filter(p => /^frontend\/e2e\/.+\.spec\.ts$/.test(p)).sort();
  if (JSON.stringify(browsers) !== JSON.stringify(packet.browserSpecs) || browsers.length !== 16) fail('DELTA_BROWSER_SCOPE_INVALID');
  return packet;
}
function commands(packet) {
  const defaultSpecs = packet.browserSpecs.filter(f => !f.endsWith('/external_fee_review.spec.ts')).map(f => path.basename(f));
  return [
    ['scope-guard-tests', 'node', ['--test', 'test/current_arc_delta.test.cjs']],
    ['backend-build', 'npm', ['--prefix', 'backend', 'run', 'build']],
    ['circle-wallet-authority', 'node', ['backend/node_modules/tsx/dist/cli.mjs', 'backend/test/circle_wallet_authority.test.ts']],
    ['external-receipt-unit', 'node', ['backend/node_modules/tsx/dist/cli.mjs', 'frontend/test/external_receipt_discovery.test.ts']],
    ['ops', 'node', ['--test', 'scripts/hosted_backup.test.cjs', 'scripts/observe_hosted_health.test.cjs', 'scripts/hosted_alerts.test.cjs']],
    ['frontend-build', 'npm', ['--prefix', 'frontend', 'run', 'build']],
    ['changed-browser-dev', 'node', ['scripts/run_browser_checks.cjs', '--port=4322', '--', ...defaultSpecs]],
    ['external-fee-browser-dev', 'node', ['scripts/run_browser_checks.cjs', '--reown-fixture', '--port=4323', '--', 'external_fee_review.spec.ts']],
    ['changed-core-browser-built', 'node', ['scripts/run_browser_checks.cjs', '--preview', '--reown-fixture', '--port=4324', '--', 'circle_fee_review.spec.ts', 'external_fee_review.spec.ts', 'external_receipt_discovery.spec.ts']],
  ];
}
function publicSummary(output) {
  const summaries = [];
  for (const match of output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)) summaries.push(match[1] + ':' + match[2]);
  for (const match of output.matchAll(/(?:^|\n)\s*(\d+) (passed|failed|skipped)\b/g)) summaries.push(match[2] + ':' + match[1]);
  const cases = /PASS (\d+) Circle wallet authority cases/.exec(output);
  if (cases) summaries.push('circle-authority-cases:' + cases[1]);
  const locations = [...new Set([...output.matchAll(/(?:backend|frontend|scripts|test)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|cjs):\d+(?::\d+)?/g)].map(m => m[0]))].slice(0, 12);
  return { summaries, failureSourceLocations: locations, rawOutputPublished: false };
}
function scanChanged(packet) {
  const { scanText } = require('./scan_candidate_secrets.cjs');
  const { ethers } = require(path.join(root, 'backend/node_modules/ethers'));
  const known = new Set(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266','0x70997970c51812dc3a010c7d01b50e0d17dc79c8','0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc','0x90f79bf6eb2c4f870365e785982e1f101e93b906','0x15d34aaf54267db7d7c367839aaf71a00a2c6a65','0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc','0x976ea74026e726554db657fa54763abd0c3a0aa9','0x14dc79964da2c08b23698b3d3cc7ca32193d9955','0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f','0xa0ee7a142d267c1f36714e4a8f75612f20a79720']);
  const developmentKey = value => { try { return /^0x[0-9a-f]{64}$/i.test(value) && known.has(new ethers.Wallet(value).address.toLowerCase()); } catch { return false; } };
  const exceptions = JSON.parse(fs.readFileSync(path.join(__dirname, 'secret_scan_fixtures.json'))).exceptions;
  const files = [...new Set([...packet.changedFiles.map(f => f.path), ...infrastructure])];
  const findings = files.flatMap(file => scanText(fs.readFileSync(path.join(root, file), 'utf8'), file, /(?:\/test\/|\/e2e\/)/.test(file) ? developmentKey : undefined, exceptions));
  return { filesScanned: files.length, findings, result: findings.length ? 'FAIL' : 'PASS' };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && args[0] !== '--check-scope') fail('DELTA_ARGUMENTS_INVALID');
  const packet = readPacket(), before = inspectScope(root, packet);
  if (args[0] === '--check-scope') { console.log(JSON.stringify({ result: 'PINNED_DELTA_SCOPE_VERIFIED', ...before, completeScope: false })); return; }
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true' || process.platform !== 'linux') fail('DELTA_RUN_REQUIRES_ISOLATED_GITHUB_RUNNER');
  const { localCheckEnvironment } = require('./local_check_runtime.cjs');
  fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
  const output = path.join(root, '.cache/current-arc-delta-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  const record = { schemaVersion: 1, layer: 'GITHUB_SCOPED_FIXTURE_CI', recordedAt: new Date().toISOString(), ...before, runId: process.env.GITHUB_RUN_ID, baselineCiRun: packet.baselineCiRun, result: 'RUNNING', completeScope: false, acceptanceEligible: false, steps: [], scope: { liveProviderCredentialsLoaded: false, liveDatabaseOpened: false, applicationDeployed: false, financialTransactionsBroadcast: false, contractsOrSdkSuiteRun: false } };
  const save = () => fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n'); save();
  for (const [id, command, args] of commands(packet)) {
    const start = Date.now(), build = id === 'frontend-build';
    const environment = { ...localCheckEnvironment(root, { configuredReown: build }), ...(build ? { NODE_ENV: 'production' } : {}) };
    const child = cp.spawnSync(command === 'node' ? process.execPath : command, args, { cwd: root, env: environment, encoding: 'utf8', windowsHide: true, timeout: id.includes('browser') ? 480000 : 180000, maxBuffer: 8 * 1024 * 1024 });
    const step = { id, result: !child.error && child.status === 0 ? 'PASS' : 'FAIL', exitCode: child.status, signal: child.signal || null, durationMs: Date.now() - start, ...publicSummary((child.stdout || '') + '\n' + (child.stderr || '')) };
    record.steps.push(step); save(); console.log(JSON.stringify(step));
    if (step.result !== 'PASS') { record.result = 'FAIL'; save(); process.exitCode = 1; return; }
  }
  record.secretScan = scanChanged(packet);
  if (record.secretScan.result !== 'PASS') { record.result = 'FAIL'; save(); process.exitCode = 1; return; }
  const after = inspectScope(root, packet);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('DELTA_SOURCE_CHANGED_DURING_CHECKS');
  record.sourceUnchanged = true; record.result = 'PASS'; record.finishedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ result: 'SCOPED_CURRENT_ARC_DELTA_PASS', steps: record.steps.length, sourceCommit: record.sourceCommit, applicationCommit: record.applicationCommit, completeScope: false, acceptanceEligible: false }));
}
if (require.main === module) main().catch(error => { console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'CURRENT_ARC_DELTA_UNCONFIRMED'); process.exitCode = 1; });
module.exports = { inspectScope, commands, publicSummary };
