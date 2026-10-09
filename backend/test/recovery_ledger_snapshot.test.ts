import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {ethers} from 'ethers';
import {TransactionalStore} from '../src/db/store';
import {config} from '../src/config';
import {HUB_ABI} from '../src/contracts/hubAbi';
import {SessionRegistry} from '../src/services/sessionService';
import {SignerReservationRegistry} from '../src/services/signerReservationRegistry';
import {prepareSignerObservation,readSignerReservation,signerReservationId} from '../src/domain/signerReservation';
import {BridgeTransferRegistry} from '../src/services/bridgeTransferRegistry';
import {bridgeTransferMessage,readBridgeTransferRecord} from '../src/domain/bridgeTransfer';
import {BackupService} from '../src/services/backupService';
import {backupRuntimeStore} from '../src/services/runtimeBackup';
import {prepareShadowCandidate} from '../src/services/shadowPreparation';
import {eventProvider} from './fixtures/events';
import {reconciliationProvider} from './fixtures/reconciliation';
const root=path.resolve(__dirname,'../..'),origin='https://fixture.groupdeal.invalid';
const opened:TransactionalStore[]=[];
const owned=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-recovery-ledger-'));assert.ok(dir.includes('local-check-temp'));return dir};
const open=(dir=owned())=>{const db=new TransactionalStore(dir);opened.push(db);return db};
const sqlState=(db:TransactionalStore)=>{const sql=new DatabaseSync(path.join(db.storageDirectory,'groupdeal.sqlite'),{readOnly:true});try{return{rows:sql.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all(),revision:sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get()}}finally{sql.close()}};
const footprint=(dir:string)=>Object.fromEntries(['groupdeal.sqlite','groupdeal.sqlite-wal','groupdeal.sqlite-shm'].filter(f=>fs.existsSync(path.join(dir,f))).map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex')]));
async function fixture(){
 const directory=owned(),db=open(path.join(directory,'source')),wallet=ethers.Wallet.createRandom(),source=ethers.Wallet.createRandom();
 db.db.authRecovery={current:{version:1,context:randomBytes(32).toString('base64url'),createdAt:Date.now()}};
 db.db.users.owner={id:'owner',email:'owner@fixture.invalid',roles:['buyer'],activeWallet:wallet.address.toLowerCase(),createdAt:0};
 const id='op_'+randomUUID(),calldata=new ethers.Interface(HUB_ABI).encodeFunctionData('claimBuyerFunds',[1,[1]]),key='recovery:'+randomUUID();
 db.db.operations[id]={id,userId:'owner',action:'BUYER_CLAIM',resourceId:'campaign',chainId:5042002,hubAddress:config.hubAddress,principal:wallet.address.toLowerCase(),idempotencyKey:key,payloadHash:ethers.id(key),calldata,intentId:key,expectedFunction:'claimBuyerFunds',expectedEvent:'FundsClaimed',expectedEventArgs:{claimType:0},phase:'PREPARED',createdAt:Date.now(),updatedAt:Date.now()};db.save();
 const sessions=new SessionRegistry(db),token=sessions.issue(db.db.users.owner,'EVM_WALLET'),proof=sessions.authenticate(token),signer=new SignerReservationRegistry(db),reference={purpose:{kind:'HUB_OPERATION' as const,operationId:id},chainId:5042002,principal:wallet.address.toLowerCase()};
 await signer.acquire(proof,reference,async()=>{throw Error('No RPC expected for first empty signer history')});
 const raw=await wallet.signTransaction({chainId:5042002,to:config.hubAddress,nonce:7,data:calldata,value:0n,gasLimit:200000n,type:2,maxFeePerGas:2n,maxPriorityFeePerGas:1n}),tx=ethers.Transaction.from(raw);
 db.db.operations[id].txHash=tx.hash!;db.db.operations[id].phase='SUBMITTED';db.save();
 db.mutateSignerReservation({actorId:'owner',sessionKey:proof.key,...reference},state=>{const plan=prepareSignerObservation(state.signer,proof.claims.authRecoveryContext,tx,'SIGNED_TRANSACTION',Date.now());return{result:true,plan}});
 const registry=new BridgeTransferRegistry(db,origin),challenge=registry.create(proof,{source:'Ethereum_Sepolia',sender:source.address.toLowerCase(),recipient:wallet.address.toLowerCase(),amountBaseUnits:'1250000'},randomUUID()),authorized=registry.authorize(proof,challenge.id,await source.signMessage(registry.sourceMessage(challenge)));
 const transfer=registry.reserve(proof,authorized.id,{id:randomUUID(),kind:'approve',chainId:11155111,calldataHash:ethers.id('fixture-approve'),nonce:'15',afterBlock:'100'},authorized.revision);
 await signer.acquire(proof,{purpose:{kind:'BRIDGE_WRITE',transferId:transfer.id,writeId:transfer.writes[0].id},chainId:11155111,principal:source.address.toLowerCase()},async()=>{throw Error('No RPC expected for distinct source signer')});
 const snapshot=db.snapshot();assert.equal(Object.keys(snapshot.signerReservations!).length,2);assert.equal(Object.values(snapshot.signerReservations!).find(r=>r.purpose.kind==='HUB_OPERATION')!.witnesses![0].nonce,'7');return{directory,db,snapshot,proof,reference,token,transfer};
}
let cases=0,ordinal=0,stage='SETUP';
const fromCase=Number(process.argv.find(arg=>arg.startsWith('--from='))?.slice(7)??1);
async function check(name:string,fn:()=>void|Promise<void>){if(++ordinal<fromCase)return;stage=name;await fn();cases++;console.log('PASS recovery ledger snapshot: '+name)}
async function main(){
 config.arcChainId=5042002;config.deploymentBlock=1;config.protocolVersion=1;config.arcWsUrl='';
 const f=await fixture();
 if(process.argv.includes('--reproduce')){const archive=BackupService.createEncryptedBackup(path.join(f.directory,'archive'),f.db),target=open();assert.throws(()=>BackupService.restoreEncryptedBackup(archive.backupPath,target),/signer ledger requires scoped mutation|bridge ledger requires scoped mutation/);console.log(JSON.stringify({suite:'RECOVERY_LEDGER_SNAPSHOT_REPRODUCTION',result:'EXPECTED_OLD_RESTORE_REJECTION',protectedSignerRows:2,protectedBridgeRows:1,source:'LOCAL_FIXTURE'}));return}
 await check('authenticated backup restores exact loans nonce witness bridge journal and recovery context',()=>{
  const archive=BackupService.createEncryptedBackup(path.join(f.directory,'archive'),f.db),decoded=BackupService.readEncryptedBackup(archive.backupPath).data,target=open();BackupService.restoreEncryptedBackup(archive.backupPath,target);
  for(const key of Object.keys(decoded))if(key==='auditLogs'){assert.equal(target.db.auditLogs.length,decoded.auditLogs.length+1);assert.deepEqual(target.db.auditLogs.slice(1),decoded.auditLogs)}else assert.deepEqual((target.db as any)[key],(decoded as any)[key]);
  assert.equal(Object.values(target.db.signerReservations!).every(r=>r.phase==='ACTIVE'),true);assert.equal(target.db.bridgeTransfers![f.transfer.id].writes[0].state,'REQUESTED');assert.equal(target.verifyAuditLogIntegrity().valid,true);
  const directory=target.storageDirectory;target.close();opened.splice(opened.indexOf(target),1);const reopened=open(directory);assert.deepEqual(reopened.db.signerReservations,decoded.signerReservations);assert.deepEqual(reopened.db.bridgeTransfers,decoded.bridgeTransfers);
 });
 await check('runtime backup copies both protected ledgers without changing source bytes',()=>{
  const before=footprint(f.db.storageDirectory),result=backupRuntimeStore({inputScope:'LOCAL_FIXTURE',sourceDirectory:f.db.storageDirectory,privateParent:path.join(f.directory,'runtime'),reportDirectory:path.join(f.directory,'runtime-reports')});
  assert.equal(result.status,'RUNTIME_BACKUP_RESTORE_DATA_VERIFIED',JSON.stringify(result.report.failureCode));assert.deepEqual(footprint(f.db.storageDirectory),before);const decoded=BackupService.readEncryptedBackup(path.resolve(root,result.report.archive.path)).data;assert.deepEqual(decoded.signerReservations,f.snapshot.signerReservations);assert.deepEqual(decoded.bridgeTransfers,f.snapshot.bridgeTransfers);assert.equal(result.report.restore.allFieldsPreserved,true);assert.equal(result.report.financialAccountingVerified,false);
 });
 await check('migration candidate keeps protected loans and unknown requested bridge writes',async()=>{
  const before=footprint(f.db.storageDirectory),result=await prepareShadowCandidate({inputScope:'LOCAL_FIXTURE',migrationOnly:true,retainLegacy:false,sourceDirectory:f.db.storageDirectory,privateParent:path.join(f.directory,'migration'),reportDirectory:path.join(f.directory,'migration-reports')});assert.notEqual(result.status,'REJECTED',JSON.stringify(result.report.failureCode));
  const candidate=open(path.dirname(path.resolve(root,result.report.projectionDatabase.path)));assert.deepEqual(candidate.db.signerReservations,f.snapshot.signerReservations);assert.deepEqual(candidate.db.bridgeTransfers,f.snapshot.bridgeTransfers);assert.deepEqual(footprint(f.db.storageDirectory),before);
 });
 await check('replay candidate and its first verified checkpoint both retain protected ledgers',async()=>{
  const state=f.db.snapshot(),provider={...eventProvider([]),...reconciliationProvider(state,0n,3),getNetwork:async()=>({chainId:5042002n}),getLogs:async()=>[]};
  const result=await prepareShadowCandidate({inputScope:'LOCAL_FIXTURE',migrationOnly:false,retainLegacy:true,sourceDirectory:f.db.storageDirectory,privateParent:path.join(f.directory,'replay'),reportDirectory:path.join(f.directory,'replay-reports'),provider,verifyDeployment:async()=>{}});assert.notEqual(result.status,'REJECTED',JSON.stringify(result.report.failureCode));
  for(const ref of [result.report.projectionDatabase,result.report.checkpointDatabase]){assert.ok(ref);const candidate=open(path.dirname(path.resolve(root,ref.path)));assert.deepEqual(candidate.db.signerReservations,f.snapshot.signerReservations);assert.deepEqual(candidate.db.bridgeTransfers,f.snapshot.bridgeTransfers)}
 });
 await check('initial import accepts a fresh empty candidate exactly once',()=>{const target=open();target.initializeRecoverySnapshot(f.snapshot);const before=sqlState(target),cached=structuredClone(target.db);assert.throws(()=>target.initializeRecoverySnapshot(f.snapshot),/RECOVERY_SNAPSHOT_TARGET_NOT_EMPTY/);assert.deepEqual(sqlState(target),before);assert.deepEqual(target.db,cached)});
 await check('ordinary replace still rejects importing protected rows',()=>{const target=open(),before=sqlState(target),cached=structuredClone(target.db);assert.throws(()=>target.replace(f.snapshot),/ledger requires scoped mutation/);assert.deepEqual(sqlState(target),before);assert.deepEqual(target.db,cached)});
 await check('ordinary save and replace cannot change or delete imported protected records',()=>{const target=open();target.initializeRecoverySnapshot(f.snapshot);const before=sqlState(target),changed=structuredClone(target.db);Object.values(changed.signerReservations!).find(r=>r.witnesses)!.revision=0;assert.throws(()=>target.replace(changed),/signer ledger requires scoped mutation/);const removed=structuredClone(target.db);delete removed.bridgeTransfers;assert.throws(()=>target.replace(removed),/bridge ledger requires scoped mutation/);target.db.signerReservations={};assert.throws(()=>target.save(),/signer ledger requires scoped mutation/);assert.deepEqual(sqlState(target),before)});
 await check('malformed signer nonce witness is rejected without partial import',()=>{const target=open(),bad=structuredClone(f.snapshot),before=sqlState(target),cached=structuredClone(target.db);Object.values(bad.signerReservations!).find(r=>r.witnesses)!.witnesses![0].nonce='-1';assert.throws(()=>target.initializeRecoverySnapshot(bad),/SIGNER_RESERVATION_INVALID/);assert.deepEqual(sqlState(target),before);assert.deepEqual(target.db,cached);target.initializeRecoverySnapshot(f.snapshot)});
 await check('malformed bridge source binding is rejected without partial import',()=>{const target=open(),bad=structuredClone(f.snapshot),before=sqlState(target);bad.bridgeTransfers![f.transfer.id].sourceAuthorization!.messageHash=ethers.id('wrong');assert.throws(()=>target.initializeRecoverySnapshot(bad),/BRIDGE_TRANSFER_UNAVAILABLE/);assert.deepEqual(sqlState(target),before)});
 await check('record keys must match protected ids and collections must be maps',()=>{for(const kind of ['key','array'] as const){const target=open(),bad=structuredClone(f.snapshot),before=sqlState(target);if(kind==='key'){const [key,row]=Object.entries(bad.signerReservations!)[0];delete bad.signerReservations![key];bad.signerReservations!['wrong']=row}else bad.bridgeTransfers=[] as any;assert.throws(()=>target.initializeRecoverySnapshot(bad),/RECOVERY_SNAPSHOT_LEDGER_INVALID/);assert.deepEqual(sqlState(target),before)}});
 await check('duplicate active signer is rejected by the physical unique index with full rollback',()=>{const target=open(),bad=structuredClone(f.snapshot),before=sqlState(target),original=Object.values(bad.signerReservations!).find(r=>r.purpose.kind==='HUB_OPERATION')!,duplicate={...original,purpose:{kind:'HUB_OPERATION' as const,operationId:'op_'+randomUUID()}};duplicate.id=signerReservationId(duplicate);bad.signerReservations![duplicate.id]=readSignerReservation(duplicate);assert.throws(()=>target.initializeRecoverySnapshot(bad),/UNIQUE constraint failed/);assert.deepEqual(sqlState(target),before);target.initializeRecoverySnapshot(f.snapshot)});
 await check('duplicate reserved bridge source or recipient is rejected with full rollback',()=>{for(const key of ['sender','recipient'] as const){const target=open(),bad=structuredClone(f.snapshot),before=sqlState(target),original=bad.bridgeTransfers![f.transfer.id],id=randomUUID(),duplicate={...original,id,idempotencyKey:id,scope:{...original.scope,[key==='sender'?'recipient':'sender']:ethers.Wallet.createRandom().address.toLowerCase()},sourceAuthorization:{...original.sourceAuthorization!}};duplicate.sourceAuthorization.messageHash=ethers.id(bridgeTransferMessage(duplicate));bad.bridgeTransfers![id]=readBridgeTransferRecord(duplicate);assert.throws(()=>target.initializeRecoverySnapshot(bad),/UNIQUE constraint failed/);assert.deepEqual(sqlState(target),before)}});
 await check('existing writes and unsaved candidate changes cannot be overwritten by initialization',()=>{for(const committed of [false,true]){const target=open();target.db.notificationPreferences.pending={email:false,inApp:true};if(committed)target.save();const before=sqlState(target),cached=structuredClone(target.db);assert.throws(()=>target.initializeRecoverySnapshot(f.snapshot),/RECOVERY_SNAPSHOT_TARGET_NOT_EMPTY/);assert.deepEqual(sqlState(target),before);assert.deepEqual(target.db,cached)}});
 await check('a concurrent committed writer prevents pristine import from a stale instance',()=>{const target=open(),writer=open(target.storageDirectory);writer.db.notificationPreferences.other={email:false,inApp:true};writer.save();const before=sqlState(writer);assert.throws(()=>target.initializeRecoverySnapshot(f.snapshot),/Database changed in another process/);assert.deepEqual(sqlState(writer),before)});
 await check('nested transaction and active-store scope reject before importing',()=>{const target=open(),before=sqlState(target);assert.throws(()=>target.transaction(()=>target.initializeRecoverySnapshot(f.snapshot)),/RECOVERY_SNAPSHOT_TARGET_NOT_EMPTY/);assert.throws(()=>TransactionalStore.prototype.initializeRecoverySnapshot.call({isIsolated:false} as any,f.snapshot),/RECOVERY_SNAPSHOT_TARGET_NOT_EMPTY/);assert.deepEqual(sqlState(target),before)});
 await check('restored active nonce loan still prevents issuing another signer request',async()=>{
  const target=open();target.initializeRecoverySnapshot(f.snapshot);const sessions=new SessionRegistry(target),proof=sessions.authenticate(f.token),id='op_'+randomUUID();target.db.operations[id]={...target.db.operations[f.reference.purpose.operationId],id,idempotencyKey:'next:'+randomUUID(),intentId:'next:'+randomUUID(),phase:'PREPARED',txHash:undefined};target.save();const before=sqlState(target);
  await assert.rejects(new SignerReservationRegistry(target).acquire(proof,{...f.reference,purpose:{kind:'HUB_OPERATION',operationId:id}},async<T>(_chain,method)=>{assert.ok(['eth_getTransactionByHash','eth_getTransactionReceipt'].includes(method));return null as T}),/SIGNER_RECEIPT_PENDING/);assert.deepEqual(sqlState(target),before);
 });
 console.log(JSON.stringify({suite:'RECOVERY_LEDGER_SNAPSHOT',result:'PASS',cases,inputScope:'LOCAL_FIXTURE',liveFinancialAcceptance:false,restoredWritesRemainHeld:true}));
}
main().catch(error=>{console.error(JSON.stringify({suite:'RECOVERY_LEDGER_SNAPSHOT',result:'FAIL',stage,cases,message:error instanceof Error?error.message:'unknown'}));process.exitCode=1}).finally(()=>{for(const db of opened)db.close()});