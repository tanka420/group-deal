import fs from 'node:fs';
import path from 'node:path';
import {TransactionalStore} from '../src/db/store';
import {SellerProfileRegistry} from '../src/services/sellerProfileService';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
if(typeof input.directory!=='string'||!path.basename(input.directory).startsWith('groupdeal-test-seller-profile-')||typeof input.token!=='string')throw new Error('Invalid isolated worker input');
const db=new TransactionalStore(input.directory);
try{const r=new SellerProfileRegistry(db).status(input.token,input.id);if(r.state!=='COMMITTED'||!r.profileCurrent||r.user?.sellerProfile?.payoutWallet!==input.payout)throw new Error('Seller profile recovery failed');process.stdout.write('PASS seller profile request after process restart\n');}finally{db.close();}
