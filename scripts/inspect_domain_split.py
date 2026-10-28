"""Read-only VPS inventory. Never emit environment credentials or open SQLite."""
import hashlib
import json
from pathlib import Path

app = Path('/home/ubuntu/groupdeal/releases/47d853f79ff5c2b1c8ac7f0f8163ca613fb82d9a')
runtime = json.loads((app / '.cache/hosted/RUN.json').read_text())
env_bytes = (app / 'backend/.env').read_bytes()
lines = env_bytes.decode().splitlines()
values = {}
for line in lines:
    key, sep, value = line.partition('=')
    if sep and key.strip() in ('PUBLIC_APP_URL', 'ALLOWED_ORIGINS'):
        values[key.strip()] = value.strip()
other = '\n'.join(line for line in lines if line.partition('=')[0].strip() not in ('PUBLIC_APP_URL', 'ALLOWED_ORIGINS'))
print(json.dumps({
    'runtime': {k: runtime.get(k) for k in ('sourceCommit', 'pid', 'url', 'chainId', 'hubAddress', 'nativeDirectory', 'heldWorkCount', 'counts')},
    'origin': values,
    'privateEnvironmentSha256': hashlib.sha256(env_bytes).hexdigest(),
    'environmentExceptOriginSha256': hashlib.sha256(other.encode()).hexdigest(),
    'launcherSha256': hashlib.sha256((app / '.cache/hosted/start.cjs').read_bytes()).hexdigest(),
    'nginxSha256': hashlib.sha256(Path('/etc/nginx/sites-available/groupdeal.tech').read_bytes()).hexdigest(),
    'credentialsEmitted': False,
    'sqliteOpened': False,
}))
