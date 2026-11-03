"""Synthetic input only; never load DPAPI vaults, install env files or contact SSH."""
import importlib.util
from pathlib import Path
import secrets
import unittest

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).parent / 'mainnet-ops/receive_credentials.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


class Credentials(unittest.TestCase):
    def fixture(self):
        values = {key: 'fixture-value' for key in receiver.KEYS}
        values.update({key: secrets.token_hex(32) for key in ('JWT_SECRET', 'CAMPAIGN_IDENTITY_SECRET', 'MASTER_ENCRYPTION_KEY')})
        values.update(AUTHORIZED_SIGNER_PRIVATE_KEY='0x' + secrets.token_hex(32), MASTER_ENCRYPTION_KEY_ID='mainnet-v1', SMTP_PORT='587', SMTP_SECURE='false', BLOCKSCOUT_API_KEY='proapi_fixture', SMTP_APP_PASSWORD='space "quote" \\ dollar$ percent%')
        return {'releaseCommit': 'a' * 40, 'secrets': values}

    def test_quotes_literal_values_and_pins_public_scope(self):
        body = receiver.render(self.fixture(), 'a' * 40)
        self.assertIn('ARC_CHAIN_ID="5042"\n', body)
        self.assertIn('SMTP_APP_PASSWORD="space \\"quote\\" \\\\ dollar$ percent%"\n', body)
        self.assertNotIn('DEPLOYER_PRIVATE_KEY', body)

    def test_rejects_newline_extra_keys_wrong_commit_missing_key_and_reused_secrets(self):
        for change in ('newline', 'extra', 'missing', 'reused', 'smtp'):
            p = self.fixture()
            if change == 'newline': p['secrets']['SMTP_APP_PASSWORD'] = 'x\nPORT=4000'
            if change == 'extra': p['secrets']['DEPLOYER_PRIVATE_KEY'] = 'forbidden'
            if change == 'missing': del p['secrets']['BLOCKSCOUT_API_KEY']
            if change == 'reused': p['secrets']['JWT_SECRET'] = p['secrets']['MASTER_ENCRYPTION_KEY']
            if change == 'smtp': p['secrets']['SMTP_SECURE'] = 'true'
            with self.assertRaises(ValueError): receiver.render(p, 'a' * 40)
        with self.assertRaises(ValueError): receiver.render(self.fixture(), 'b' * 40)


if __name__ == '__main__': unittest.main()
