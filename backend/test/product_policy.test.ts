import {config} from '../src/config';
import {enrollFixtureOperator} from './helpers/operatorFixture';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import express from 'express';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {StorageConflict} from '../src/db/rowPersistence';
import {ProductService} from '../src/services/productService';
import {CampaignEditorService} from '../src/services/campaignEditorService';
import {ResourceDeliveryService} from '../src/services/resourceDeliveryService';
import {SessionService} from '../src/services/sessionService';
import {SellerIdentityService} from '../src/services/sellerIdentityService';
import {campaignRouter} from '../src/routes/campaignRoutes';
import {operationRouter} from '../src/routes/operationRoutes';
import {productInput} from './fixtures/product';
const initial=store.snapshot();let stage='setup',cases=0;
const approved=()=>Math.floor(Date.now()/1000)+60*86400;
async function setup(approve=true){
 store.replace(structuredClone(initial));const wallet=ethers.Wallet.createRandom().address;
 store.transaction(()=>{for(const id of ['seller','other','operator'])store.db.users[id]={id,email:id+'@policy.example.test',roles:id==='operator'?['operator']:['seller'],activeWallet:id==='seller'?wallet:null,createdAt:Date.now(),...(id==='seller'?{sellerProfile:{displayName:'Policy fixture',bio:'Fixture',payoutWallet:wallet,payoutProofSignature:'fixture-only',verifiedSellerBadge:true,verifiedRightsBadge:false}}:{})}});
 SellerIdentityService.username(SessionService.authenticate(SessionService.issue(store.db.users.seller)),{username:'policy_seller',expectedRevision:0});
 const owned=ProductService.createVersion('seller',productInput),foreign=ProductService.createVersion('other',productInput);
 const rights=ProductService.submitRights('seller',owned.version.id,{declaration:'OWNER',declarationText:'Private local policy fixture',evidenceRefs:['https://policy.example.test/evidence']});
 if(approve){const enrollment=await enrollFixtureOperator('operator',undefined,{chainId:config.arcChainId});ProductService.reviewRights('operator',rights.id,{decision:'APPROVED',reason:'Independent local fixture review',validUntil:approved()},await enrollment.authorization());}
 return{owned,foreign,rights,snapshot:approve?ProductService.snapshot('seller',owned.version.id,0):undefined};
}
async function main(){
 assert.ok(store.isIsolated);const sql=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'),{readOnly:true});
 const revision=()=>Number((sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as any).revision);
 const check=async(name:string,fn:(s:Awaited<ReturnType<typeof setup>>)=>unknown)=>{stage=name;await fn(await setup());cases++};
 const deny=(s:Awaited<ReturnType<typeof setup>>)=>assert.throws(()=>ProductService.snapshot('seller',s.owned.version.id,0),/FORBIDDEN|RIGHTS_REQUIRED|CONFLICT|POLICY/);
 try{
  const negative=process.argv.find(a=>a.startsWith('--negative='))?.split('=')[1];
  if(negative==='binding'){await check('SNAPSHOT_EXACT_BINDING',s=>{assert.throws(()=>ProductService.assertPublishable('seller',{...s.snapshot!,productId:s.foreign.product.id,licenseVersionId:s.foreign.license.id},0),/CONFLICT/)});return}
  if(negative==='pending'){stage='COMMITTED_APPROVAL_BOUNDARY';const s=await setup(false);store.db.rights[s.rights.id].status='APPROVED';store.db.rights[s.rights.id].validUntil=approved();store.db.rights[s.rights.id].decisions.push({actorId:'operator',decision:'APPROVED',reason:'Pending only',timestamp:Date.now()});deny(s);return}
  if(negative==='owner'){await check('RIGHTS_OWNER_BOUNDARY',s=>{store.transaction(()=>{store.db.rights[s.rights.id].sellerId='other'});deny(s)});return}
  if(negative)throw Error('Invalid negative');
  await check('committed-read-does-not-write',s=>{const before=revision(),cached=JSON.stringify(store.db);assert.deepEqual(ProductService.snapshot('seller',s.owned.version.id,0),s.snapshot);ProductService.assertPublishable('seller',s.snapshot,0);assert.equal(revision(),before);assert.equal(JSON.stringify(store.db),cached)});
  for(const [field,value] of Object.entries({schema:'OTHER',productId:'foreign',productVersionId:'missing',licenseVersionId:'foreign',productContentHash:ethers.ZeroHash,licenseContentHash:ethers.ZeroHash,rightsId:'foreign',rightsApprovedAt:1,rightsValidUntil:1}))await check('exact-snapshot-'+field,s=>assert.throws(()=>ProductService.assertPublishable('seller',{...s.snapshot!,[field]:value},0)));
  await check('malformed-snapshot-objects',s=>{for(const snap of [[],null,{},'snapshot',{...s.snapshot!,extra:'private'},{...s.snapshot!,rightsValidUntil:String(s.snapshot!.rightsValidUntil)},{...s.snapshot!,productVersionId:'__proto__'}])assert.throws(()=>ProductService.assertPublishable('seller',snap as any,0))});
  for(const minimum of [NaN,Infinity,-1,1.5,'0',null,Number.MAX_SAFE_INTEGER])await check('minimum-'+String(minimum),s=>assert.throws(()=>ProductService.snapshot('seller',s.owned.version.id,minimum as any)));
  await check('pending-approval-cannot-grant',async()=>{const s=await setup(false),before=revision();Object.assign(store.db.rights[s.rights.id],{status:'APPROVED',validUntil:approved(),decisions:[{actorId:'operator',decision:'APPROVED',reason:'Pending',timestamp:Date.now()}]});deny(s);assert.equal(revision(),before);assert.equal(store.db.rights[s.rights.id].status,'APPROVED')});
  await check('pending-selected-policy-denies-without-flush',s=>{for(const change of [()=>{store.db.rights[s.rights.id].status='REVOKED'},()=>{store.db.products[s.owned.product.id].sellerId='other'},()=>{store.db.productVersions[s.owned.version.id].title='Pending title'},()=>{store.db.licenseVersions[s.owned.license.id].seatsPerUnit=2}]){const cached=structuredClone(store.db),before=revision();change();deny(s);assert.equal(revision(),before);store.replace(cached)}});
  await check('committed-foreign-rights-owner',s=>{store.transaction(()=>{store.db.rights[s.rights.id].sellerId='other'});deny(s)});
  await check('committed-product-owner',s=>{store.transaction(()=>{store.db.products[s.owned.product.id].sellerId='other'});deny(s)});
  await check('committed-license-product',s=>{store.transaction(()=>{store.db.licenseVersions[s.owned.license.id].productId=s.foreign.product.id});deny(s)});
  await check('missing-product-or-license',s=>{for(const collection of ['products','licenseVersions'] as const){const data=structuredClone(store.db),id=collection==='products'?s.owned.product.id:s.owned.license.id;store.transaction(()=>{delete store.db[collection][id]});deny(s);store.replace(data)}});
  await check('record-key-bindings',s=>{for(const [collection,id] of [['products',s.owned.product.id],['productVersions',s.owned.version.id],['licenseVersions',s.owned.license.id],['rights',s.rights.id]] as const){const data=structuredClone(store.db);store.transaction(()=>{store.db[collection][id].id='different'});deny(s);store.replace(data)}});
  await check('self-or-missing-approval-decision',s=>{for(const decisions of [[],[{actorId:'seller',decision:'APPROVED',reason:'Self',timestamp:Date.now()}],[{actorId:'operator',decision:'REVOKED',reason:'Revoked',timestamp:Date.now()}],[{actorId:'operator',decision:'APPROVED',reason:'Future',timestamp:Date.now()+86400000}]]){const data=structuredClone(store.db);store.transaction(()=>{store.db.rights[s.rights.id].decisions=decisions as any});deny(s);store.replace(data)}});
  await check('expired-rights-even-zero-minimum',s=>{store.transaction(()=>{store.db.rights[s.rights.id].validUntil=Math.floor(Date.now()/1000)-1});deny(s)});
  await check('hash-recomputed-from-declared-content',s=>{for(const change of [()=>{store.db.productVersions[s.owned.version.id].title='Changed but hash retained'},()=>{store.db.licenseVersions[s.owned.license.id].seatsPerUnit=2}]){const data=structuredClone(store.db);store.transaction(change);deny(s);store.replace(data)}});
  await check('known-metadata-types',s=>{for(const change of [()=>{(store.db.productVersions[s.owned.version.id] as any).media={private:'invalid'}},()=>{(store.db.licenseVersions[s.owned.license.id] as any).transferable=1},()=>{(store.db.rights[s.rights.id] as any).validUntil=String(approved())}]){const data=structuredClone(store.db);store.transaction(change);deny(s);store.replace(data)}});
  await check('SQL-booleans-are-not-integer-metadata',s=>{for(const [collection,id,field] of [['products',s.owned.product.id,'createdAt'],['productVersions',s.owned.version.id,'version'],['productVersions',s.owned.version.id,'createdAt'],['licenseVersions',s.owned.license.id,'createdAt'],['rights',s.rights.id,'createdAt']] as const){const data=structuredClone(store.db);store.transaction(()=>{(store.db[collection][id] as any)[field]=true});deny(s);store.replace(data)}});
  await check('pending-unrelated-policy-is-not-flushed',s=>{const before=revision();store.db.products[s.foreign.product.id].sellerId='seller';deny(s);assert.equal(revision(),before);assert.equal(store.db.products[s.foreign.product.id].sellerId,'seller')});
  await check('seller-authority-is-committed',s=>{const before=revision();store.db.users.seller.roles=['buyer'];deny(s);assert.equal(revision(),before);store.db.users.seller.roles=['seller'];store.transaction(()=>{store.db.users.seller.roles=['buyer']});deny(s)});
  await check('multiple-approval-decisions-are-not-admitted',s=>{store.transaction(()=>{store.db.rights[s.rights.id].decisions.push({...store.db.rights[s.rights.id].decisions[0]})});deny(s)});
  await check('SQL-policy-hydrates-only-declared-fields',s=>{store.transaction(()=>{for(const row of [store.db.users.seller,store.db.productVersions[s.owned.version.id],store.db.rights[s.rights.id]])(row as any).privateExtension='private-policy-extension';(store.db.productVersions[s.owned.version.id].media as any).push({url:'https://fixture.invalid/preview',alt:'Preview',privateExtension:'private-policy-extension'});(store.db.rights[s.rights.id].decisions[0] as any).privateExtension='private-policy-extension'});const before=revision(),state=store.readProductPolicyState('seller',s.owned.version.id);assert.ok(!JSON.stringify(state).includes('private-policy-extension'));assert.deepEqual(Object.keys(state.user!).sort(),['id','roles']);assert.deepEqual(state.version!.media,[{url:'https://fixture.invalid/preview',alt:'Preview'}]);assert.equal(state.rights[0].decisions[0].reason,'Independent local fixture review');assert.equal(revision(),before)});
  await check('committed-private-extensions-retained',s=>{store.transaction(()=>{for(const row of [store.db.products[s.owned.product.id],store.db.productVersions[s.owned.version.id],store.db.licenseVersions[s.owned.license.id],store.db.rights[s.rights.id]])(row as any).privateExtension='retained-private';});const before=revision();assert.deepEqual(ProductService.snapshot('seller',s.owned.version.id,0),s.snapshot);assert.equal(revision(),before);assert.equal((store.db.rights[s.rights.id] as any).privateExtension,'retained-private')});
  await check('old-version-order-preserved',s=>{store.transaction(()=>{store.db.orders.historical={id:'historical',productSnapshot:s.snapshot} as any});const next=ProductService.createVersion('seller',{...productInput,title:'New edition'},s.owned.product.id,s.owned.version.id);ProductService.assertPublishable('seller',s.snapshot,0);assert.throws(()=>ProductService.snapshot('seller',next.version.id,0),/RIGHTS_REQUIRED/);assert.deepEqual(store.db.orders.historical.productSnapshot,s.snapshot);ProductService.archive('seller',s.owned.product.id);deny(s);assert.deepEqual(store.db.orders.historical.productSnapshot,s.snapshot)});
  await check('ready-rechecks-each-bound-snapshot-field',async s=>{
   const resource=ResourceDeliveryService.upload('seller',s.owned.version.id,'policy.txt','text/plain',Buffer.from('Actual isolated local bytes'));
   const app=express();app.use(express.json());app.use('/api/campaigns',campaignRouter);app.use('/api/transactions',operationRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
   const origin='http://127.0.0.1:'+(server.address() as any).port,token=SessionService.issue(store.db.users.seller),post=(url:string,body:unknown)=>fetch(origin+url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
   try{
    const draft=CampaignEditorService.saveDraft('seller',{title:'Policy draft',description:'Policy fixture',thumbnailUrl:s.owned.version.thumbnailUrl,productVersionId:s.owned.version.id,metric:'BUYER_COUNT',tiers:[{threshold:1,priceUSDC:'10'},{threshold:2,priceUSDC:'9'}],maxPerAccount:2,inventoryLimit:10,durationDays:7,deliverySlaHours:24,deliveryMethod:'FILE_LINK'});
    assert.equal((await post('/api/campaigns/'+draft.id+'/test-delivery',{resourceId:resource.id})).status,200);const prepared=await post('/api/campaigns/'+draft.id+'/prepare-publish',{idempotencyKey:'publish:policy-fixture'});assert.equal(prepared.status,200);const op=(await prepared.json() as any).operation,campaign=store.db.campaigns[draft.id],snap=structuredClone(campaign.productSnapshot!);
    for(const [field,value] of Object.entries({schema:'OTHER',productId:s.foreign.product.id,licenseVersionId:s.foreign.license.id,rightsApprovedAt:1,rightsValidUntil:1})){store.transaction(()=>{campaign.productSnapshot={...snap,[field]:value} as any});const before=revision();assert.equal((await post('/api/transactions/'+op.id+'/ready',{})).status,409);assert.equal(store.db.operations[op.id].phase,'PREPARED');assert.equal(revision(),before)}
    store.transaction(()=>{campaign.productSnapshot=snap;store.db.rights[s.rights.id].status='REVOKED'});assert.equal((await post('/api/transactions/'+op.id+'/ready',{})).status,409);assert.equal(store.db.operations[op.id].phase,'PREPARED');
   }finally{await new Promise<void>(r=>server.close(()=>r()))}
  });
  await check('external-writer-revision-does-not-refresh-CAS',s=>{const writer=new DatabaseSync(path.join(store.storageDirectory,'groupdeal.sqlite'));try{writer.exec('BEGIN IMMEDIATE');const record=JSON.parse((writer.prepare("SELECT record_json FROM domain_records WHERE collection='rights' AND record_key=?").get(s.rights.id) as any).record_json);record.status='REVOKED';writer.prepare("UPDATE domain_records SET record_json=? WHERE collection='rights' AND record_key=?").run(JSON.stringify(record),s.rights.id);writer.exec('UPDATE storage_revision SET revision=revision+1 WHERE id=1; COMMIT');const before=revision();assert.throws(()=>ProductService.assertPublishable('seller',s.snapshot,0));assert.equal(store.db.rights[s.rights.id].status,'APPROVED');assert.equal(revision(),before);assert.throws(()=>store.save(),StorageConflict);deny(s)}finally{writer.close()}});
  console.log(`PASS ${cases} committed product policy cases; exact snapshots, isolated SQLite/HTTP, no financial broadcast or live rights review.`);
 }finally{sql.close();store.close()}
}
main().catch(()=>{console.error(JSON.stringify({result:'FAIL',stage,privateValuesWithheld:true}));try{store.close()}catch{}process.exitCode=1});
