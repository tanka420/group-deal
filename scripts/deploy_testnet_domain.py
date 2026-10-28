"""Install the approved Testnet subdomain without replacing app source or data.

Run on the VPS as root from a package containing the exact committed public files.
No transaction signing, provider credential replacement, database copy or job replay.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request

APP = Path('/home/ubuntu/groupdeal/releases/47d853f79ff5c2b1c8ac7f0f8163ca613fb82d9a')
OPS = Path('/home/ubuntu/groupdeal/operations')
SITE = Path('/etc/nginx/sites-available/testnet.groupdeal.tech')
ENABLED = Path('/etc/nginx/sites-enabled/testnet.groupdeal.tech')
APEX = Path('/etc/nginx/sites-available/groupdeal.tech')
ENV = APP / 'backend/.env'
LAUNCHER = APP / '.cache/hosted/start.cjs'
PROBE = OPS / 'observe_hosted_health.cjs'
ALERT = OPS / 'hosted_alerts.cjs'
ROUTES = Path('/etc/nginx/snippets/groupdeal-app-routes.conf')
HOOK = Path('/etc/letsencrypt/renewal-hooks/deploy/groupdeal-nginx-reload')
ORIGIN = 'https://testnet.groupdeal.tech'
OLD_ORIGIN = 'https://groupdeal.tech'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()

def service():
    return dict(line.split('=', 1) for line in run('systemctl', 'show', 'groupdeal-testnet', '--property=ActiveState,MainPID,NRestarts').splitlines())

def runtime():
    return json.loads((APP / '.cache/hosted/RUN.json').read_text())

def write(file, data, mode=None):
    previous = file.stat() if file.exists() else None
    temp = file.with_name(file.name + '.domain-split-tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode or (previous.st_mode & 0o777 if previous else 0o644))
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if previous:
            os.chown(temp, previous.st_uid, previous.st_gid)
            os.chmod(temp, mode or (previous.st_mode & 0o777))
        os.replace(temp, file)
    finally:
        if temp.exists():
            temp.unlink()

def env_without_origin(data):
    return '\n'.join(line for line in data.decode().splitlines() if line.partition('=')[0].strip() not in ('PUBLIC_APP_URL', 'ALLOWED_ORIGINS'))

def health(url):
    with urllib.request.urlopen(url, timeout=12) as response:
        value = json.load(response)
    if value.get('chainId') != 5042002 or value.get('protocolVersion') != 1 or value.get('hubAddress', '').lower() != '0x2a7aecd1ce90f1284eb060488c8ddef4b1be0574':
        raise RuntimeError('TESTNET_HEALTH_DEPLOYMENT_MISMATCH')
    return {'chainId': value['chainId'], 'hubAddress': value['hubAddress']}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', required=True)
    parser.add_argument('--phase', choices=('bootstrap', 'activate'), required=True)
    args = parser.parse_args()
    package = Path(args.package).resolve()
    if os.geteuid() != 0 or package.parent != OPS or not re.fullmatch(r'domain-split-[0-9a-f]{40}', package.name):
        raise RuntimeError('DOMAIN_PACKAGE_SCOPE_INVALID')
    record = json.loads((package / 'PACKAGE.json').read_text())
    if record['commit'] != package.name.removeprefix('domain-split-'):
        raise RuntimeError('DOMAIN_COMMIT_MISMATCH')
    for name, digest in record['files'].items():
        file = (package / name).resolve()
        if not file.is_relative_to(package) or sha(file.read_bytes()) != digest:
            raise RuntimeError('DOMAIN_PACKAGE_BYTES_CHANGED')
    if sha(APEX.read_bytes()) != 'f8248e614c9c9f5305f2e4119210b23b1bed62c5a14f14992960863a33887a42':
        raise RuntimeError('APEX_CONFIGURATION_CHANGED_REVIEW_REQUIRED')
    before = service()
    state = runtime()
    if before['ActiveState'] != 'active' or int(before['MainPID']) != state['pid'] or state['sourceCommit'] != '8c32212fdb051cdb01f98226932f3a61afa3e9bf' or state['heldWorkCount'] != 95:
        raise RuntimeError('ACTIVE_TESTNET_SCOPE_CHANGED')
    bootstrap = (package / 'config/nginx/groupdeal-testnet-bootstrap.conf').read_bytes()
    if args.phase == 'bootstrap':
        if SITE.exists() or ENABLED.is_symlink() or ENABLED.exists():
            raise RuntimeError('TESTNET_VHOST_ALREADY_EXISTS_REVIEW_REQUIRED')
        write(SITE, bootstrap)
        try:
            ENABLED.symlink_to(SITE)
            run('nginx', '-t')
            run('systemctl', 'reload', 'nginx')
        except Exception:
            if ENABLED.is_symlink() and ENABLED.resolve() == SITE:
                ENABLED.unlink()
            SITE.unlink(missing_ok=True)
            raise
        if service() != before:
            raise RuntimeError('TESTNET_WRITER_CHANGED_DURING_BOOTSTRAP')
        print(json.dumps({'phase': 'bootstrap', 'status': 'INSTALLED', 'commit': record['commit'], 'backendRestarted': False, 'apexChanged': False, 'databaseOpened': False}))
        return
    if not SITE.exists() or sha(SITE.read_bytes()) != sha(bootstrap) or ENABLED.resolve() != SITE:
        raise RuntimeError('TESTNET_BOOTSTRAP_CHANGED')
    if not Path('/etc/letsencrypt/live/testnet.groupdeal.tech/fullchain.pem').is_file():
        raise RuntimeError('TESTNET_TLS_CERTIFICATE_REQUIRED')
    expected = {
        ENV: 'ef7c9b974dc3431cfab34b072d14e080a29a4dc2a3246d541dc2e09a43dd3004',
        LAUNCHER: 'cac97063d9d721c1e9612632d3d176d286af2d46cae54eed1010de9ee20867d7',
        PROBE: 'e8ca45fe01d25f1de56eb177e9506833efb915b6f08c3a2f024b729a6f628b96',
        ALERT: 'd4a4e574211ce33fee1fdd6ef3677d80f305c0bac361d759b56099da00d2ed2d',
    }
    originals = {file: file.read_bytes() for file in expected}
    if any(sha(originals[file]) != digest for file, digest in expected.items()):
        raise RuntimeError('DOMAIN_INPUT_CHANGED_REVIEW_REQUIRED')
    lines = originals[ENV].decode().splitlines(keepends=True)
    replacements = {'PUBLIC_APP_URL': ORIGIN, 'ALLOWED_ORIGINS': ORIGIN + ',' + OLD_ORIGIN}
    seen = []
    for index, line in enumerate(lines):
        key = line.partition('=')[0].strip()
        if key in replacements:
            seen.append(key)
            lines[index] = key + '=' + replacements[key] + ('\r\n' if line.endswith('\r\n') else '\n')
    env = ''.join(lines).encode()
    if sorted(seen) != sorted(replacements) or env_without_origin(env) != env_without_origin(originals[ENV]):
        raise RuntimeError('ENVIRONMENT_NON_ORIGIN_CHANGE_REFUSED')
    old_guard = "config.publicAppUrl!=='https://groupdeal.tech'||config.allowedOrigins.length!==1||config.allowedOrigins[0]!==config.publicAppUrl"
    new_guard = "config.publicAppUrl!=='https://testnet.groupdeal.tech'||config.allowedOrigins.length!==2||!config.allowedOrigins.includes(config.publicAppUrl)||!config.allowedOrigins.includes('https://groupdeal.tech')"
    launcher = originals[LAUNCHER].decode()
    if launcher.count(old_guard) != 1:
        raise RuntimeError('LAUNCHER_ORIGIN_GUARD_CHANGED')
    updates = {ENV: env, LAUNCHER: launcher.replace(old_guard, new_guard).encode()}
    for file in (PROBE, ALERT):
        if OLD_ORIGIN.encode() not in originals[file]:
            raise RuntimeError('OPERATIONS_ENDPOINT_CHANGED')
        updates[file] = originals[file].replace(OLD_ORIGIN.encode(), ORIGIN.encode())
    updates.update({SITE: (package / 'config/nginx/groupdeal-testnet.conf').read_bytes(), ROUTES: (package / 'config/nginx/groupdeal-app-routes.conf').read_bytes(), HOOK: (package / 'config/nginx/groupdeal-cert-renewal.sh').read_bytes()})
    for file in (SITE, ROUTES, HOOK):
        originals[file] = file.read_bytes() if file.exists() else None
    backup = package / 'private-rollback'
    backup.mkdir(mode=0o700)
    for index, (file, data) in enumerate(originals.items()):
        if data is not None:
            target = backup / str(index)
            target.write_bytes(data)
            target.chmod(0o600)
    alert_timer_active = subprocess.run(['systemctl', 'is-active', '--quiet', 'groupdeal-alert.timer']).returncode == 0
    run('systemctl', 'stop', 'groupdeal-alert.timer')
    try:
        for file, data in updates.items():
            write(file, data, 0o600 if file == ENV else 0o755 if file == HOOK else None)
        run('nginx', '-t')
        run('systemctl', 'restart', 'groupdeal-testnet')
        ready = False
        for _ in range(75):
            try:
                health('http://127.0.0.1:18420/api/health')
                ready = True
                break
            except Exception:
                time.sleep(2)
        if not ready:
            raise RuntimeError('TESTNET_STARTUP_NOT_READY')
        after = runtime()
        if after['nativeDirectory'] != state['nativeDirectory'] or after['heldWorkCount'] != 95 or after['sourceCommit'] != state['sourceCommit'] or after['url'] != ORIGIN:
            raise RuntimeError('TESTNET_RUNTIME_PRESERVATION_FAILED')
        if sha(APEX.read_bytes()) != 'f8248e614c9c9f5305f2e4119210b23b1bed62c5a14f14992960863a33887a42':
            raise RuntimeError('APEX_CHANGED')
        run('systemctl', 'reload', 'nginx')
        observed = health(ORIGIN + '/api/health')
        run('systemctl', 'start', 'groupdeal-health-probe.service')
        receipt = {'phase': 'activate', 'status': 'DEPLOYED', 'commit': record['commit'], 'origin': ORIGIN, 'apexChanged': False, 'backendSourceCommit': after['sourceCommit'], 'nativeDirectoryUnchanged': True, 'heldWorkCount': after['heldWorkCount'], 'otherEnvironmentUnchanged': env_without_origin(ENV.read_bytes()) == env_without_origin(originals[ENV]), 'health': observed, 'applicationTests': 'SKIP_USER_REQUEST'}
        (package / 'ACTIVATION.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt))
    except Exception as error:
        for file, data in originals.items():
            if data is None:
                file.unlink(missing_ok=True)
            else:
                write(file, data, 0o600 if file == ENV else 0o755 if file == HOOK else None)
        run('nginx', '-t')
        run('systemctl', 'restart', 'groupdeal-testnet')
        run('systemctl', 'reload', 'nginx')
        print(json.dumps({'status': 'ROLLED_BACK', 'reason': type(error).__name__, 'details': str(error) if isinstance(error, RuntimeError) else 'REDACTED'}))
        raise RuntimeError('DOMAIN_ACTIVATION_ROLLED_BACK') from None
    finally:
        if alert_timer_active:
            run('systemctl', 'start', 'groupdeal-alert.timer')

if __name__ == '__main__':
    main()
