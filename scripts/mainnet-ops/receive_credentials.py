"""One-time initial Mainnet env install, after separate authority. JSON only via SSH stdin."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

CORE = {'CIRCLE_API_KEY', 'AUTHORIZED_SIGNER_PRIVATE_KEY', 'JWT_SECRET', 'CAMPAIGN_IDENTITY_SECRET', 'MASTER_ENCRYPTION_KEY', 'MASTER_ENCRYPTION_KEY_ID'}
SMTP = {'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_FROM', 'SMTP_APP_PASSWORD'}
KEYS = CORE | SMTP | {'BLOCKSCOUT_API_KEY'}
PUBLIC = {'APP_ENV': 'arc-mainnet', 'NODE_ENV': 'production', 'ARC_CHAIN_ID': '5042', 'PORT': '4100', 'PUBLIC_APP_URL': 'https://groupdeal.tech', 'ALLOWED_ORIGINS': 'https://groupdeal.tech', 'ARC_RPC_URL': 'https://rpc.mainnet.arc.io', 'CIRCLE_BASE_URL': 'https://api.circle.com', 'GROUPDEAL_HUB_ADDRESS': '0x52A893b45C1BeaBdCe04f58705D7812eA2519Ff8', 'DEPLOYMENT_BLOCK': '29264761', 'OPERATOR_ADDRESS': '0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c'}


def render(payload, commit):
    if payload.get('releaseCommit') != commit or set(payload.get('secrets', {})) != KEYS:
        raise ValueError('SCOPE')
    values = payload['secrets']
    if any(not isinstance(v, str) or not v or len(v) > 8192 or any(ord(c) < 32 or ord(c) == 127 for c in v) for v in values.values()):
        raise ValueError('FORMAT')
    for key in ('JWT_SECRET', 'CAMPAIGN_IDENTITY_SECRET', 'MASTER_ENCRYPTION_KEY'):
        if not re.fullmatch('[a-f0-9]{64}', values[key]):
            raise ValueError('APP_SECRET')
    if len({values[k] for k in ('JWT_SECRET', 'CAMPAIGN_IDENTITY_SECRET', 'MASTER_ENCRYPTION_KEY')}) != 3 or values['MASTER_ENCRYPTION_KEY_ID'] != 'mainnet-v1':
        raise ValueError('APP_SECRET')
    if not re.fullmatch('(?:0x)?[a-fA-F0-9]{64}', values['AUTHORIZED_SIGNER_PRIVATE_KEY']) or not values['BLOCKSCOUT_API_KEY'].startswith('proapi_') or 'TEST_API_KEY' in values['CIRCLE_API_KEY']:
        raise ValueError('KEY_FORMAT')
    if values['SMTP_PORT'] not in ('465', '587') or values['SMTP_SECURE'] != ('true' if values['SMTP_PORT'] == '465' else 'false'):
        raise ValueError('SMTP')
    def quote(value):
        return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return ''.join(key + '=' + quote(value) + '\n' for key, value in sorted({**PUBLIC, **values}.items()))


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch('[a-f0-9]{40}', sys.argv[1]):
        raise ValueError('SCOPE')
    parent = Path('/etc/groupdeal-mainnet')
    if parent.is_symlink() or parent.resolve() != parent or parent.stat().st_uid != 0 or parent.stat().st_mode & 0o077:
        raise ValueError('DIRECTORY')
    raw = sys.stdin.buffer.read(131073)
    if len(raw) > 131072:
        raise ValueError('SIZE')
    body = render(json.loads(raw), sys.argv[1])
    release = Path(__file__).resolve().parent.parent
    if release != Path('/opt/groupdeal-mainnet/releases') / sys.argv[1] or json.loads((release / 'RELEASE.json').read_text())['sourceCommit'] != sys.argv[1]:
        raise ValueError('RELEASE')
    values = json.loads(raw)['secrets']
    check = subprocess.run(['/opt/groupdeal-mainnet/runtime/node', str(release / 'ops/validate_mainnet_secret_input.cjs')], input=json.dumps({'circleApiKey': values['CIRCLE_API_KEY'], 'signerPrivateKey': values['AUTHORIZED_SIGNER_PRIVATE_KEY']}).encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15, check=False)
    if check.returncode != 0 or len(check.stdout) > 2048 or json.loads(check.stdout).get('result') != 'PASS':
        raise ValueError('SIGNER')
    target = parent / 'runtime.env'
    descriptor, temporary = tempfile.mkstemp(prefix='.runtime-', dir=parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        # Atomic initial creation; never overwrite a previous credential installation.
        os.link(temporary, target, follow_symlinks=False)
    finally:
        os.unlink(temporary)
    print(json.dumps({'result': 'MAINNET_CREDENTIALS_INSTALLED', 'releaseCommit': sys.argv[1], 'credentialsPrinted': False, 'serviceActivated': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"result":"MAINNET_CREDENTIAL_INSTALL_REJECTED","credentialsPrinted":false}', file=sys.stderr)
        sys.exit(1)
