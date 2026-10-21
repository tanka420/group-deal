import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './build-csv-studio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath,
  [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--outdir', '.cache/bundle'],
  {cwd: root, windowsHide: true, stdio: 'inherit', env: {...process.env,
    WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: path.join(root, '.cache/wrangler-config'),
    WRANGLER_LOG_PATH: path.join(root, '.cache/wrangler.log')}});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
