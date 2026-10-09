// Read-only inventory and encrypted recovery copy. Never imports the mutable app store.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DatabaseSync, backup } = require('node:sqlite');
const dotenv = require('../backend/node_modules/dotenv');

const root = path.resolve(__dirname, '..');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const walk = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isSymbolicLink() ? [] : entry.isDirectory()
    ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

async function main() {
  const createdAt = new Date().toISOString();
  const id = `v2-${createdAt.replace(/[:.]/g, '-')}`;
  const privateDir = path.join(root, 'data', 'execution-backups', id);
  const evidenceDir = path.join(root, 'reports', 'evidence', id);
  const runtimeFiles = ['backend/data', 'data'].flatMap(dir => walk(path.join(root, dir)))
    .filter(file => !file.includes(`${path.sep}execution-backups${path.sep}`));
  const env = { ...dotenv.parse(fs.readFileSync(path.join(root, '.env'))),
    ...(fs.existsSync(path.join(root, 'backend', '.env'))
      ? dotenv.parse(fs.readFileSync(path.join(root, 'backend', '.env'))) : {}), ...process.env };
  if (runtimeFiles.length && (!env.MASTER_ENCRYPTION_KEY || env.MASTER_ENCRYPTION_KEY.length < 24)) {
    throw new Error('A configured backup encryption key is required; no runtime data was copied.');
  }
  fs.mkdirSync(privateDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  const sourceFiles = git(['ls-files', '--cached', '--others', '--exclude-standard']).split(/\r?\n/)
    .filter(file => file && fs.existsSync(path.join(root, file)));
  const sourceInventory = sourceFiles.map(file => ({ path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
  fs.writeFileSync(path.join(privateDir, 'working-tree.patch'), execFileSync('git', ['diff', 'HEAD', '--binary'], { cwd: root }));
  for (const file of sourceFiles) {
    const target = path.join(privateDir, 'source', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  const runtime = [];
  for (const file of runtimeFiles.filter(f => !/-wal$|-shm$/.test(f))) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    let data;
    let inventory;
    if (/\.sqlite3?$/.test(file)) {
      const database = new DatabaseSync(file, { readOnly: true });
      const snapshot = path.join(privateDir, `snapshot-${runtime.length}.sqlite`);
      try {
        await backup(database, snapshot);
        const copied = new DatabaseSync(snapshot, { readOnly: true });
        try {
          const tables = copied.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
          inventory = { integrity: copied.prepare('PRAGMA integrity_check').get().integrity_check, tables: tables.map(row => row.name) };
          if (inventory.tables.includes('app_state')) {
            const row = copied.prepare('SELECT state_json FROM app_state WHERE id=1').get();
            if (row) {
              const state = JSON.parse(row.state_json);
              inventory.counts = Object.fromEntries(Object.entries(state).filter(([,v]) => v && typeof v === 'object').map(([k,v]) => [k, Object.keys(v).length]));
              inventory.syncState = state.syncState;
            }
          }
        } finally { copied.close(); }
        data = fs.readFileSync(snapshot);
      } finally { database.close(); if (fs.existsSync(snapshot)) fs.unlinkSync(snapshot); }
    } else {
      data = fs.readFileSync(file);
    }
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(env.MASTER_ENCRYPTION_KEY, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const envelope = { version: 1, algorithm: 'AES-256-GCM', kdf: 'scrypt', salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') };
    const destination = path.join(privateDir, `${runtime.length}.enc`);
    fs.writeFileSync(destination, JSON.stringify(envelope));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    const recovered = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (!data.equals(recovered)) throw new Error('Encrypted backup round-trip failed.');
    runtime.push({ path: relative, bytes: data.length, backup: path.relative(root, destination).replace(/\\/g, '/'), encryptedRoundTrip: true, inventory });
  }
  const report = { version: '2.0', id, createdAt, scope: 'LOCAL_READ_ONLY_BASELINE_AND_ENCRYPTED_BACKUP',
    sourceCommit: git(['rev-parse','HEAD']), branch: git(['branch','--show-current']), gitStatus: git(['status','--short']),
    runtime: { node: process.version, platform: process.platform },
    sourceInventory, runtimeInventory: runtime,
    configuration: { rootEnvironmentPresent: true, backendEnvironmentPresent: fs.existsSync(path.join(root,'backend','.env')), frontendEnvironmentPresent: fs.existsSync(path.join(root,'frontend','.env')) },
    limitations: ['Filesystem resources are copied individually; SQLite snapshots use the online backup API.', 'No live transaction or new G5/G6 acceptance is certified.', 'Backup key remains in the existing private environment configuration.'] };
  fs.writeFileSync(path.join(evidenceDir, 'BASELINE.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ evidenceDir: path.relative(root,evidenceDir), sourceFiles: sourceInventory.length, runtimeFiles: runtime.length, backupsVerified: runtime.every(r=>r.encryptedRoundTrip) }));
}
main().catch(() => { console.error('Baseline capture failed. No secret values are printed.'); process.exitCode = 1; });
