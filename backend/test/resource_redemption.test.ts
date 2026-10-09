import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {store,TransactionalStore} from '../src/db/store';
import {ResourceDeliveryService} from '../src/services/resourceDeliveryService';
import {SessionService,SessionError} from '../src/services/sessionService';
import {ResourceAccessError} from '../src/services/buyerResourceView';
import {encryptEntitlement} from '../src/utils/crypto';

const base=store.snapshot(),key='local-redemption-fixture-license',sql=()=>new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'));
let current='startup',cases=0,ordinal=0,pendingOwnershipFlushObserved=false;
function setup(){store.replace(structuredClone(base));store.transaction(()=>{
 const bytes=Buffer.from('Protected redemption fixture\n');store.db.users.buyer={id:'buyer',email:'buyer@example.test',roles:['buyer'],activeWallet:null,createdAt:Date.now()};
 store.db.orders.order={id:'order',buyerAccountId:'buyer',buyerPrincipal:'0x'+'1'.repeat(40),quantity:1} as any;
 store.db.resources.resource={id:'resource',sellerId:'seller',productVersionId:'version',fileName:'file.txt',mimeType:'text/plain',byteLength:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),encryptedPayload:encryptEntitlement(bytes.toString('base64')),createdAt:Date.now()};
 store.db.licenseVersions.license={id:'license',durationDays:10,activationWindowDays:1,seatsPerUnit:1} as any;
 store.db.resourceGrants.grant={id:'grant',orderId:'order',buyerAccountId:'buyer',buyerPrincipal:'0x'+'1'.repeat(40),productVersionId:'version',licenseVersionId:'license',resourceId:'resource',unitIndex:0,seatsPerUnit:1,state:'ACTIVE',activatedAt:Math.floor(Date.now()/1000),licenseKeyId:'key'};
 store.db.licenseInventory.key={id:'key',sellerId:'seller',productVersionId:'version',resourceId:'resource',keyEncrypted:encryptEntitlement(key),keyFingerprint:crypto.createHash('sha256').update(key).digest('hex'),status:'ASSIGNED',orderId:'order',createdAt:Date.now()};
});return SessionService.authenticate(SessionService.issue(store.db.users.buyer));}
async function check(name:string,fn:(proof:ReturnType<typeof setup>)=>void){ordinal++;const selection=process.argv.find(a=>a.startsWith('--select='))?.slice(9);if(selection&&ordinal!==Number(selection))return;current=name;fn(setup());cases++;console.log('PASS resource redemption: '+name);}
async function main(){
 await check('unrelated pending graph never enters license activation commit',proof=>{
  store.db.orders.order.buyerAccountId='pending-other';store.db.resources.resource.fileName='pending.txt';(store.db.users.buyer as any).pendingPrivate='must remain pending';
  ResourceDeliveryService.redeem('buyer','grant',key,proof);const reader=sql();try{
   const row=(collection:string,id:string)=>JSON.parse((reader.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection,id) as any).record_json);
   pendingOwnershipFlushObserved=row('orders','order').buyerAccountId!=='buyer';assert.equal(row('orders','order').buyerAccountId,'buyer');assert.equal(row('resources','resource').fileName,'file.txt');assert.equal(row('users','buyer').pendingPrivate,undefined);
   assert.equal(store.db.orders.order.buyerAccountId,'pending-other');assert.equal(store.db.resources.resource.fileName,'pending.txt');assert.equal((store.db.users.buyer as any).pendingPrivate,'must remain pending');
   assert.equal(row('resourceGrants','grant').redeemedAt,store.db.resourceGrants.grant.redeemedAt);assert.equal(row('licenseInventory','key').status,'ASSIGNED');assert.equal(store.db.auditLogs.filter(a=>a.action==='RESOURCE_LICENSE_REDEEMED').length,1);
  }finally{reader.close();}
 });
 if(process.argv.includes('--reproduce'))return;
 await check('pending target grant is rejected without overwriting or committing it',proof=>{(store.db.resourceGrants.grant as any).pendingPrivate='must not commit';const before=structuredClone(store.db);assert.throws(()=>ResourceDeliveryService.redeem('buyer','grant',key,proof),e=>e instanceof ResourceAccessError&&e.code==='RESOURCE_REDEMPTION_CONFLICT');assert.deepEqual(structuredClone(store.db),before);const reader=sql();try{assert.equal((reader.prepare("SELECT json_extract(record_json,'$.redeemedAt') AS value FROM domain_records WHERE collection='resourceGrants' AND record_key='grant'").get() as any).value,null);}finally{reader.close();}});
 await check('repeat activation keeps timestamp revision inventory and one audit',proof=>{ResourceDeliveryService.redeem('buyer','grant',key,proof);const before=structuredClone(store.db),reader=sql();try{const revision=reader.prepare('SELECT revision FROM storage_revision WHERE id=1').get();ResourceDeliveryService.redeem('buyer','grant',key,proof);assert.deepEqual(structuredClone(store.db),before);assert.deepEqual(reader.prepare('SELECT revision FROM storage_revision WHERE id=1').get(),revision);assert.equal(store.db.auditLogs.filter(a=>a.action==='RESOURCE_LICENSE_REDEEMED').length,1);assert.throws(()=>ResourceDeliveryService.redeem('buyer','grant','wrong-local-fixture-key',proof),e=>e instanceof ResourceAccessError&&e.code==='RESOURCE_KEY_INVALID');assert.deepEqual(structuredClone(store.db),before);}finally{reader.close();}});
 await check('SQL audit failure rolls back grant timestamp and leaves graph unchanged',proof=>{const reader=sql(),before=structuredClone(store.db);try{reader.exec("CREATE TRIGGER reject_redemption_audit BEFORE UPDATE ON domain_records WHEN NEW.collection='auditLogs' BEGIN SELECT RAISE(ABORT,'LOCAL_REDEMPTION_AUDIT_FAILURE'); END");assert.throws(()=>ResourceDeliveryService.redeem('buyer','grant',key,proof));assert.deepEqual(structuredClone(store.db),before);assert.equal((reader.prepare("SELECT json_extract(record_json,'$.redeemedAt') AS value FROM domain_records WHERE collection='resourceGrants' AND record_key='grant'").get() as any).value,null);reader.exec('DROP TRIGGER reject_redemption_audit');ResourceDeliveryService.redeem('buyer','grant',key,proof);assert.ok(store.db.resourceGrants.grant.redeemedAt);}finally{reader.close();}});
 await check('revoked committed session never activates a license',proof=>{store.transaction(()=>{store.db.authSessions[proof.key].state='REVOKED';});const before=structuredClone(store.db);assert.throws(()=>ResourceDeliveryService.redeem('buyer','grant',key,proof),SessionError);assert.deepEqual(structuredClone(store.db),before);});
 await check('concurrent committed owner change prevents stale writer activation',proof=>{const peer=new TransactionalStore(store.storageDirectory);try{peer.transaction(()=>{peer.db.orders.order.buyerAccountId='other';});const before=structuredClone(store.db);assert.throws(()=>ResourceDeliveryService.redeem('buyer','grant',key,proof),e=>e instanceof ResourceAccessError&&e.code==='RESOURCE_REDEMPTION_CONFLICT');assert.deepEqual(structuredClone(store.db),before);assert.equal(peer.db.resourceGrants.grant.redeemedAt,undefined);}finally{peer.close();}});
 console.log('PASS '+cases+' isolated resource redemption cases; no live actor/key/provider acceptance.');
}
void main().catch(error=>{console.error(JSON.stringify({diagnosticName:error?.name??null,diagnosticCode:error?.code??null,missingExpectedException:typeof error?.message==='string'&&error.message.startsWith('Missing expected exception'),frames:error instanceof Error?error.stack?.split(/\r?\n/).filter(line=>/^\s+at /.test(line)).slice(0,3):[]}));console.error(JSON.stringify({result:'FAIL',case:current,code:'LOCAL_ASSERTION_OR_STORAGE',pendingOwnershipFlushObserved,privateValuesWithheld:true}));process.exitCode=1;}).finally(()=>store.close());
