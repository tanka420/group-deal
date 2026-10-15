'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { inspectScope, commands, publicSummary } = require('../scripts/run_current_arc_delta.cjs');
const parent = path.resolve(__dirname, '../.cache/current-arc-delta-guard-tests');
fs.mkdirSync(parent, { recursive: true });
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(parent, 'case-'));
  const git = args => cp.execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Scoped fixture']); git(['config', 'user.email', 'scoped-fixture@example.test']); git(['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(directory, '.gitignore'), '.cache/\n'); fs.writeFileSync(path.join(directory, 'app.js'), 'module.exports=1;\n');
  git(['add', '.']); git(['commit', '-qm', 'base']); const base = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(directory, 'app.js'), 'module.exports=2;\n'); git(['add', '.']); git(['commit', '-qm', 'application']); const app = git(['rev-parse', 'HEAD']);
  const packet = { baselineCommit: base, applicationCommit: app, changedFiles: [{ path: 'app.js', sha256: crypto.createHash('sha256').update('module.exports=2;\n').digest('hex') }] };
  t.after(() => { const real = fs.realpathSync(directory); assert.equal(real, directory); assert.equal(path.dirname(real), parent); fs.rmSync(real, { recursive: true }); });
  return { directory, git, packet };
}
test('real Git delta accepts pinned application and only declared CI additions', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.directory, 'scripts')); fs.writeFileSync(path.join(f.directory, 'scripts/run_current_arc_delta.cjs'), '// fixture CI\n'); f.git(['add', '.']); f.git(['commit', '-qm', 'CI only']);
  const scope = inspectScope(f.directory, f.packet); assert.equal(scope.applicationIdenticalToPinnedCommit, true); assert.equal(scope.changedApplicationFiles, 1); assert.deepEqual(scope.infrastructureDelta, ['scripts/run_current_arc_delta.cjs']);
});
test('committed application changes outside the pin cannot receive a scoped pass', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.directory, 'app.js'), 'module.exports=3;\n'); f.git(['add', '.']); f.git(['commit', '-qm', 'unreviewed app']);
  assert.throws(() => inspectScope(f.directory, f.packet), /APPLICATION_CHANGED_OUTSIDE_PINNED_DELTA/);
});
test('omitted and duplicate packet files are rejected against actual Git history', t => {
  const f = fixture(t); assert.throws(() => inspectScope(f.directory, { ...f.packet, changedFiles: [] }), /DELTA_PACKET_FILES_MISMATCH/);
  assert.throws(() => inspectScope(f.directory, { ...f.packet, changedFiles: [...f.packet.changedFiles, ...f.packet.changedFiles] }), /DELTA_PACKET_FILES_MISMATCH/);
});
test('wrong blob hashes and dirty source fail closed without starting application checks', t => {
  const f = fixture(t); assert.throws(() => inspectScope(f.directory, { ...f.packet, changedFiles: [{ path: 'app.js', sha256: '0'.repeat(64) }] }), /DELTA_PACKET_BLOB_MISMATCH/);
  fs.writeFileSync(path.join(f.directory, 'app.js'), 'dirty\n'); assert.throws(() => inspectScope(f.directory, f.packet), /DELTA_WORKTREE_DIRTY/);
});
test('deletion and rename after the pinned application are rejected', t => {
  const f = fixture(t); f.git(['mv', 'app.js', 'renamed.js']); f.git(['commit', '-qm', 'rename']); assert.throws(() => inspectScope(f.directory, f.packet), /APPLICATION_CHANGED_OUTSIDE_PINNED_DELTA/);
});
test('scoped plan is fixed, isolates configured Reown, and publishes counts rather than raw diagnostics', () => {
  const packet = { browserSpecs: ['frontend/e2e/circle_fee_review.spec.ts', 'frontend/e2e/external_fee_review.spec.ts'] }, plan = commands(packet);
  assert.equal(plan.length, 9); assert.equal(plan.some(([, , args]) => args.includes('verify:pipeline') || args.includes('contracts') || args.includes('sdk')), false);
  assert.ok(plan.find(([id]) => id === 'changed-browser-dev')[2].includes('circle_fee_review.spec.ts'));
  assert.equal(plan.find(([id]) => id === 'changed-browser-dev')[2].includes('external_fee_review.spec.ts'), false);
  assert.ok(plan.find(([id]) => id === 'external-fee-browser-dev')[2].includes('--reown-fixture'));
  const summary = publicSummary('private-provider-diagnostic-and-fixture-credential\n# tests 3\n# pass 3\n  7 passed (2s)\n');
  assert.deepEqual(summary.summaries, ['tests:3', 'pass:3', 'passed:7']); assert.equal(JSON.stringify(summary).includes('private-provider'), false);
});
