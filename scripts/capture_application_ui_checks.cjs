/** Scoped application UI proof. Read-only local checks; never live acceptance. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), sha = b => crypto.createHash('sha256').update(b).digest('hex');
const bytes = p => fs.readFileSync(path.join(root, p)), json = p => JSON.parse(bytes(p));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)=(.+)$/.exec(a); if (!m) throw Error('Invalid argument'); return [m[1], m[2]]; }));
const arg = name => { if (!args[name]) throw Error('Missing ' + name); return args[name]; };
function source() {
  const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  return [...new Set(names)].filter(f => !/^reports\/(?:evidence|archive)\//.test(f) && !/(?:^|\/)\.env(?:\.|$)/.test(f) && !/^backend\/data\//.test(f)).sort().filter(f => fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile()).map(f => ({ path: f, sha256: sha(bytes(f)) }));
}
function files(dir) { return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(dir + '/' + e.name) : [dir + '/' + e.name]); }
async function free(port) { return new Promise(resolve => { const server = net.createServer(); server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true))); }); }
function browser(logPath, mode, expectedSuites) {
  const log = bytes(logPath).toString(), dir = /Owned browser artifacts: (\.cache\/browser-artifacts-[\w-]+)/.exec(log), pass = /^\s*(\d+) passed \(/m.exec(log);
  if (!dir || !pass || /\b(?:failed|skipped)\b/.test(log)) throw Error('Browser completion rejected: ' + mode);
  const report = '.cache/browser-run-' + dir[1].slice('.cache/browser-artifacts-'.length) + '.json', run = json(report);
  if (run.mode !== mode || run.result !== 'PASS' || run.exitCode !== 0 || run.acceptanceEligible !== false || !run.ownedServerStopped || !run.ownedRunnerStopped || JSON.stringify(run.testArguments) !== JSON.stringify(expectedSuites)) throw Error('Browser boundary rejected: ' + mode);
  return { logPath, report, run, count: Number(pass[1]), directory: dir[1] };
}
async function main() {
  const snapshot = source(), fingerprint = sha(Buffer.from(JSON.stringify(snapshot))), pipelinePath = arg('pipeline'), pipeline = json(pipelinePath), scanPath = arg('scan'), scan = json(scanPath);
  if (pipeline.result !== 'PASS' || pipeline.sourceFingerprint !== fingerprint || pipeline.steps.length !== 2 || pipeline.steps[0].id !== 'frontend-build' || pipeline.steps[0].nodeEnvironment !== 'production' || pipeline.steps[1].id !== 'fallback-package' || pipeline.steps.some(s => s.exitCode !== 0)) throw Error('Current production build binding rejected');
  if (scan.result !== 'PASS' || !scan.redacted || scan.findings.length) throw Error('Secret scan rejected');
  const sourceSuites = ['application_ui.spec.ts', 'master_screens.spec.ts', 'financial_projection.spec.ts', 'product_operations.spec.ts', 'transaction_history_locale.spec.ts', 'auth_dialog.spec.ts', 'seller_profile.spec.ts', 'public_seller.spec.ts', 'support_tickets.spec.ts', 'catalog.spec.ts'];
  const regressions = {...browser('.cache/application-ui-browser-dev.log', 'dev', [...sourceSuites, '--workers=1']), phase:'regression-dev'};
  const runs = [regressions, {...browser('.cache/application-ui-final-dev.log', 'dev', ['application_ui.spec.ts', '--workers=1']), phase:'dev'}, {...browser('.cache/application-ui-browser-built.log', 'preview', ['application_ui.spec.ts', 'master_screens.spec.ts', '--workers=1']), phase:'preview'}, {...browser('.cache/application-ui-browser-fallback.log', 'artifact', []), phase:'artifact'}];
  // Reuse the just-completed behavior regressions only for this exact one-color delta.
  // Every other frontend/shared byte must still match their independently bound build.
  const delta=json('.cache/application-ui-style-delta.json'), earlier=json(delta.priorPipeline), beforeStyle=bytes(delta.backup);
  if(earlier.result!=='PASS'||sha(Buffer.from(JSON.stringify(earlier.sourceFiles)))!==earlier.sourceFingerprint||delta.file!=='frontend/src/pages/OperatorPortal.tsx'||delta.from!=='background: "rgba(0, 0, 0, 0.25)",'||delta.to!=='background: "var(--bg-tertiary)",'||sha(beforeStyle)!==delta.before||beforeStyle.toString().split(delta.from).length!==2||sha(bytes(delta.file))!==delta.after||beforeStyle.toString().replace(delta.from,delta.to)!==bytes(delta.file).toString()||earlier.sourceFiles.find(f=>f.path===delta.file)?.sha256!==delta.before||fs.statSync(path.join(root,delta.file)).mtimeMs<=Date.parse(regressions.run.finishedAt))throw Error('Bounded style delta rejected');
  const ui=f=>/^(?:frontend\/|shared\/)/.test(f.path)&&f.path!==delta.file;
  if(JSON.stringify(earlier.sourceFiles.filter(ui))!==JSON.stringify(snapshot.filter(ui)))throw Error('Behavior regression inputs changed beyond the single style delta');
  for (const r of runs) {
    if (!await free(r.run.port)) throw Error('Owned browser port still in use');
    for (const f of snapshot.filter(f => /^(?:frontend\/|shared\/)/.test(f.path)&&!(r===regressions&&f.path===delta.file))) if (fs.statSync(path.join(root, f.path)).mtimeMs > Date.parse(r.run.startedAt)) throw Error('UI input modified after browser start: ' + f.path);
  }
  const original = json('.cache/application-ui-inputs.json');
  if (original.data.length !== 5 || original.data.some(f => sha(bytes(f.path)) !== f.sha256 || bytes(f.path).length !== f.bytes)) throw Error('Original operational data changed');
  const priorPointer = json('reports/evidence/MASTERS_REFRESH_LATEST.json');
  if (sha(bytes(priorPointer.path)) !== priorPointer.sha256) throw Error('Previous evidence changed');
  const prior = json(priorPointer.path), unchanged = {};
  for (const prefix of ['backend/', 'contracts/', 'sdk/', 'shared/']) {
    const old = prior.files.filter(f => f.path.startsWith(prefix)), current = snapshot.filter(f => f.path.startsWith(prefix));
    if (JSON.stringify(old) !== JSON.stringify(current)) throw Error('Unexpected domain change: ' + prefix);
    unchanged[prefix] = { fileCount: current.length, sha256: sha(Buffer.from(JSON.stringify(current))), freshWholeDomainChecks: false };
  }
  const out = 'reports/evidence/checks-application-ui-' + new Date().toISOString().replace(/[:.]/g, '-'), pending = [];
  const write = (name, value) => { const p = out + '/' + name; pending.push({ p, value }); return { path: p, sha256: sha(value) }; }, copy = (name, p) => write(name, bytes(p));
  const build = files('frontend/dist').map(p => ({ ...copy('build/' + p.slice('frontend/dist/'.length), p), originalPath: p, byteLength: bytes(p).length }));
  if (!build.some(f => f.originalPath === 'frontend/dist/index.html') || !build.some(f => f.originalPath === 'frontend/dist/fallback.html')) throw Error('Missing emitted app/fallback');
  const screens = ['explore', 'buyer-orders', 'buyer-review', 'seller-campaigns', 'seller-fulfillment', 'seller-webhooks', 'seller-products', 'seller-profile', 'operator-disputes', 'operator-deals', 'operator-rights', 'operator-reconciliation', 'operator-audit', 'operator-outbox', 'support-list', 'support-detail', 'docs', 'public-seller', 'account'];
  const visuals = [], masterVisuals = [], regressionVisuals = [];
  for (const r of runs) {
    const images = files(r.directory).filter(p => p.endsWith('.png')), selected = new Set();
    const capture = (name, target, metadata) => { const found = images.filter(p => path.basename(p) === name); if (found.length !== 1) throw Error('Missing/ambiguous screenshot: ' + r.run.mode + '/' + name); selected.add(found[0]); target.push({ ...copy('visuals/' + r.run.mode + '/' + name, found[0]), mode: r.run.mode, layer: 'LOCAL_BROWSER_FIXTURE', ...metadata }); };
    if (r.phase==='dev'||r.phase==='preview') {
      for (const language of ['vi', 'en']) for (const width of [320, 768, 1440]) for (const screen of screens) capture(screen + '-' + language + '-' + width + '.png', visuals, { screen, language, width, height: 1000, fullPage: !['buyer-review', 'account'].includes(screen) });
    }
    if(r.phase==='regression-dev'||r.phase==='preview'){
      for (const language of ['vi', 'en']) for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) for (const screen of ['buyer-detail', 'buyer-join', 'seller-create', 'operator-detail']) capture(screen + (language === 'en' ? '-en' : '') + '-' + width + '.png', masterVisuals, { screen, language, width, height: 1000, fullPage: screen !== 'buyer-join' });
    }
    for (const p of images.filter(p => !selected.has(p))) regressionVisuals.push({ ...copy('regression-visuals/' + r.phase + '/' + p.slice(r.directory.length + 1), p), mode: r.run.mode,phase:r.phase });
  }
  const fallback = json('.cache/fallback-latest-package.json'), fallbackFiles = fallback.files.map(f => { const p = fallback.artifactDirectory + '/' + f.path; if (sha(bytes(p)) !== f.sha256 || bytes(p).length !== f.byteLength) throw Error('Fallback bytes changed'); return { ...copy('fallback/' + f.path, p), byteLength: f.byteLength }; });
  const fallbackLog = bytes(runs[3].logPath).toString(), httpMatch = /PASS static HTTP package hashes and method\/application boundary; (\.cache\/fallback-http-[\w-]+\.json)/.exec(fallbackLog);
  if (!httpMatch) throw Error('Missing fallback HTTP boundary');
  const record = { schemaVersion: 1, recordedAt: new Date().toISOString(), result: 'LOCAL_SCOPED_PASS', sourceCommit: pipeline.sourceCommit, sourceFingerprint: fingerprint, files: snapshot, workingTreeOnly: true, candidateFrozen: false, acceptanceEligible: false,
    taskTrace: original.taskTrace, issues: ['F07', 'F20', 'F25', 'F30', 'A12', 'UI01', 'UI02', 'UI03', 'UI04', 'N15', 'N70'],
    pipeline: copy('checks/pipeline.json', pipelinePath), pipelineLog: copy('checks/pipeline.log', '.cache/application-ui-pipeline.log'), secretScan: copy('checks/secret-scan.json', scanPath), inputBackup: copy('checks/input-backup.json', '.cache/application-ui-inputs.json'), build,
    browser: runs.map(r => ({ mode: r.run.mode, phase:r.phase,count: r.count, suites: r.run.testArguments, log: copy('checks/browser-' + r.phase + '.log', r.logPath), run: copy('checks/browser-' + r.phase + '.json', r.report) })), visuals, masterVisuals, regressionVisuals,
    boundedStyleDelta:{record:copy('checks/style-delta.json','.cache/application-ui-style-delta.json'),beforeSource:copy('checks/operator-before-style.tsx',delta.backup),earlierPipeline:copy('checks/regression-input-pipeline.json',delta.priorPipeline),behaviorCasesBeforeFinalColor:regressions.count,reason:delta.reason,finalStyleVerifiedBySourceAndBuiltMatrix:true,masterSourceCaptures:'Completed regression snapshot before the single rights-tab color change; the four master screens do not render that rights-tab row.'},
    fallback: { package: copy('checks/fallback-package.json', fallback.artifactDirectory + '/PACKAGE.json'), http: copy('checks/fallback-http.json', httpMatch[1]), files: fallbackFiles },
    negativeEvidence: [{ ...copy('negative/json-import.log', '.cache/application-ui-first.log'), reason: 'New test JSON import required an import attribute; changed to repository readFileSync pattern.' }, { ...copy('negative/dialog-focus.log', '.cache/application-ui-second.log'), reason: 'Native dialog allowed Shift+Tab to escape to browser chrome. Added explicit focus loop and retained the same assertion.' }, { ...copy('negative/interrupted-regressions.log', '.cache/application-ui-browser-interrupted.log'), reason: 'Interrupted parallel build/browser run to serialize local workloads. It also exposed outdated assertions for the legacy catalogue endpoint and the former deal error text. Fixtures now use the real catalogue DTO and distinguish the actual heading/alert; docs assertion reflects the existing read-only HTML widget and local-only caveat. No overflow/focus/financial thresholds relaxed.' }],
    unchangedDomains: { sourceProof: { path: priorPointer.path, sha256: priorPointer.sha256 }, ...unchanged, note: 'Source hash inventory only. No fresh whole-backend/contract/SDK or live PASS.' },
    targetedRegressionFailure: { ...copy('negative/targeted-regressions.log', '.cache/application-ui-targeted-regressions.log'), reason: 'A new empty-state assertion used a nonexistent selector; changed to the real heading. Arbitration test observed the transient two-dialog handoff after async preparation; it now first requires exactly one dialog, then checks all original financial quotes and signature counts. Remaining assertions unchanged.' },
    scope: { existingWorkspaces: screens, workspaceVisuals: visuals.length, masterVisuals: masterVisuals.length, browserCases: runs.reduce((n, r) => n + r.count, 0), api: 'HTTP DTO fixtures and selected isolated test API services', builtApi: 'HTTP fixtures with emitted product components', realPrincipal: false, realProvider: false, realDelivery: false, financialBroadcast: false, fullManualAccessibility: false, fullI18n: false }, activeDataMutated: false, liveDeploymentMutated: false,
    openConditions: ['Full WP19–23 and product acceptance', 'All-content i18n, full manual AA/zoom/real device and representative performance', 'Unsealed funding bridge nonce/block/Iris recovery work', 'Deferred product/license/resource/provider decisions and real delivery', 'Missing whole-product capabilities and guest auth handoff', 'Fixed candidate, new live G5 and independent G6'],
    limitations: ['Local fixture proof does not substitute live product/financial journeys', 'API guard and operation recovery regressions are local; no operational data was reset/seeded', 'Scope covers existing pages/workspaces, not new Users/Roles/Settings capabilities'] };
  const proof = write('CHECKS.json', Buffer.from(JSON.stringify(record, null, 2) + '\n'));
  if (sha(Buffer.from(JSON.stringify(source()))) !== fingerprint) throw Error('Source changed during capture');
  for (const item of pending) { fs.mkdirSync(path.dirname(path.join(root, item.p)), { recursive: true }); fs.writeFileSync(path.join(root, item.p), item.value, { flag: 'wx' }); }
  fs.writeFileSync(path.join(root, 'reports/evidence/APPLICATION_UI_LATEST.json'), JSON.stringify({ schemaVersion: 1, ...proof, result: record.result, sourceFingerprint: fingerprint, acceptanceEligible: false }, null, 2) + '\n');
  console.log(JSON.stringify({ ...proof, result: record.result, workspaceVisuals: visuals.length, masterVisuals: masterVisuals.length, browserCases: record.scope.browserCases, sourceFiles: snapshot.length, acceptanceEligible: false }));
}
main().catch(e => { console.error('Application UI evidence rejected: ' + e.message); process.exitCode = 1; });
