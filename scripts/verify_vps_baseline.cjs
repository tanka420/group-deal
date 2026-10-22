#!/usr/bin/env node
'use strict';

// Read-only verification of the recorded VPS baseline. No network or database access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'docs/vps-baseline-2026-10-22.json'), 'utf8'));
const failures = [];
for (const scope of lock.sourceScopes) {
  const result = spawnSync('git', ['diff', '--quiet', scope.commit, '--', ...scope.paths], { cwd: root });
  if (result.status !== 0) failures.push(`Source differs: ${scope.label}`);
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...scope.paths], { cwd: root, encoding: 'utf8' });
  if (untracked.status !== 0 || untracked.stdout.trim()) failures.push(`Untracked source: ${scope.label}`);
}
let checked = 0;
if (process.argv.includes('--artifacts')) {
  for (const [area, entries] of Object.entries(lock.artifacts)) {
    for (const entry of entries) {
      const relative = area === 'frontend' ? `frontend/dist/${entry.path}` : entry.path;
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid artifact path');
      try {
        const bytes = fs.readFileSync(file);
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        if (bytes.length !== entry.byteLength || sha256 !== entry.sha256) failures.push(`Artifact differs: ${relative}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        failures.push(`Artifact missing: ${relative}`);
      }
      checked++;
    }
  }
}
console.log(JSON.stringify({
  baseline: lock.name,
  sourceScopes: lock.sourceScopes.length,
  artifactsChecked: checked,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
