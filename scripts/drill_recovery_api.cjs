const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),{spawn}=require('node:child_process'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),sha=value=>crypto.createHash('sha256').update(value).digest('hex'),bytes=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(bytes(p));
const toolPaths=[
 "scripts/drill_recovery_api.cjs",
 "backend/src/recoveryInspection.ts",
 "backend/src/services/recoveryInspection.ts",
 "backend/src/services/recoveryDrillService.ts",
 "backend/src/services/backupService.ts",
 "backend/src/services/projectionScope.ts",
 "backend/src/db/store.ts",
 "backend/src/domain/operatorCapability.ts",
 "backend/src/domain/operatorEnrollment.ts",
 "backend/src/domain/walletAuthentication.ts",
 "backend/src/db/rowPersistence.ts",
 "backend/src/db/operatorDealRead.ts",
 "backend/dist/db/operatorAccountAccessRead.js",
 "backend/dist/domain/accountAccess.js",
 "backend/dist/domain/walletCircleRejection.js",
 "backend/src/db/operatorAccountAccessRead.ts",
 "backend/src/domain/accountAccess.ts",
 "backend/src/domain/walletCircleRejection.ts",
 "backend/src/db/operatorAccountRead.ts",
 "backend/src/domain/walletFlow.ts",
 "backend/src/domain/walletQuote.ts",
 "shared/arcWallet.mjs",
 "backend/dist/db/operatorAccountRead.js",
 "backend/dist/domain/walletFlow.js",
 "backend/dist/domain/walletQuote.js",
 "backend/src/config.ts",
 "backend/src/services/runtimeSecurity.ts",
 "backend/src/utils/crypto.ts",
 "backend/dist/recoveryInspection.js",
 "backend/dist/services/recoveryInspection.js",
 "backend/dist/services/recoveryDrillService.js",
 "backend/dist/services/backupService.js",
 "backend/dist/services/projectionScope.js",
 "backend/dist/db/store.js",
 "backend/dist/domain/operatorCapability.js",
 "backend/dist/domain/operatorEnrollment.js",
 "backend/dist/domain/walletAuthentication.js",
 "backend/dist/db/rowPersistence.js",
 "backend/dist/db/operatorDealRead.js",
 "backend/dist/config.js",
 "backend/dist/services/runtimeSecurity.js",
 "backend/dist/utils/crypto.js",
 "backend/package-lock.json",
 'shared/contracts.json','shared/network.mjs','shared/network.d.mts','shared/manifests/local.json','shared/manifests/arc-mainnet.json',
 "shared/manifests/arc-testnet.json",
 "backend/dist/db/legacyReviewMetadata.js",
 "backend/dist/domain/operations.js",
 "backend/dist/domain/sellerInventory.js",
 "backend/dist/domain/product.js",
 "backend/dist/services/webhookSecret.js",
 "backend/src/db/legacyReviewMetadata.ts",
 "backend/src/domain/operations.ts",
 "backend/src/domain/sellerInventory.ts",
 "backend/src/domain/product.ts",
 "backend/src/domain/support.ts",
 "backend/src/domain/sellerFollow.ts",
 "backend/dist/domain/sellerFollow.js",
 "backend/dist/domain/support.js",
 "backend/src/services/webhookSecret.ts",
 "backend/src/domain/authRecovery.ts",
 "backend/src/domain/sellerBadge.ts",
 "shared/operatorBadge.mjs",
 "backend/dist/domain/sellerBadge.js",
 "backend/dist/domain/authRecovery.js",
 "backend/dist/contracts/hubAbi.js",
 "backend/dist/domain/operationPreparation.js",
 "backend/dist/domain/operationReadiness.js",
 "backend/dist/domain/operationReplacement.js",
 "backend/dist/domain/operationTracking.js",
 "backend/dist/domain/operationVerification.js",
 "backend/dist/domain/orderReview.js",
 "backend/dist/domain/receiptConsumption.js",
 "backend/dist/services/eventEvidence.js",
 "backend/src/contracts/hubAbi.ts",
 "backend/src/domain/operationPreparation.ts",
 "backend/src/domain/operationReadiness.ts",
 "backend/src/domain/operationReplacement.ts",
 "backend/src/domain/operationTracking.ts",
 "backend/src/domain/operationVerification.ts",
 "backend/src/domain/orderReview.ts",
 "backend/src/domain/receiptConsumption.ts",
 "backend/src/services/eventEvidence.ts",
 "backend/src/domain/operationCompletion.ts",
 "backend/dist/domain/operationCompletion.js",
 "backend/src/domain/financialProjection.ts",
 "backend/dist/domain/financialProjection.js"
,
 "backend/src/domain/bridgeClosure.ts",
 "backend/src/domain/bridgeReceipt.ts",
 "backend/src/domain/bridgeRequest.ts",
 "backend/src/domain/bridgeTransfer.ts",
 "backend/src/domain/signerReservation.ts"
,
 "backend/dist/domain/bridgeClosure.js",
 "backend/dist/domain/bridgeReceipt.js",
 "backend/dist/domain/bridgeRequest.js",
 "backend/dist/domain/bridgeTransfer.js",
 "backend/dist/domain/signerReservation.js"
];
const inputs=()=>toolPaths.map(p=>({path:p,sha256:sha(bytes(p))}));
const files=['groupdeal.sqlite','groupdeal.sqlite-wal','groupdeal.sqlite-shm','groupdeal_db.json','groupdeal_db.json.tmp'];
const footprint=()=>files.filter(f=>fs.existsSync(path.join(root,'backend/data',f))).map(f=>{const b=bytes('backend/data/'+f);return{file:f,byteLength:b.length,sha256:sha(b)};});
async function main(){
 if(process.argv.length!==2)throw Error('RECOVERY_ARGUMENTS_DISABLED');
 const before=footprint(),toolInputs=inputs(),started=performance.now(),record={schemaVersion:1,recordedAt:new Date().toISOString(),layer:'EXISTING_DATA_EMITTED_RECOVERY_INSPECTION_API',status:'REJECTED',acceptanceEligible:false,financialAccountingVerified:false,productAccessEnabled:false,authCutoverAllowed:false,workersStarted:false,actualServiceRTOEstablished:false,actualLostDataRPOEstablished:false,toolInputs,sourceFootprint:before};
 const child=spawn(process.execPath,[path.join(root,'backend/dist/recoveryInspection.js')],{cwd:path.join(root,'backend'),env:{...process.env},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 child.stdout.resume();child.stderr.resume();
 const terminal=new Promise(resolve=>child.once('exit',(exitCode,signal)=>resolve({exitCode,signal})));let forced=false;
 const timeout=setTimeout(()=>{forced=true;child.kill();},45000);let ready;
 // Native request preserves an explicitly supplied Host; fetch may replace it.
 const request=(route,options={})=>new Promise((resolve,reject)=>{const req=http.request(ready.url+route,options,res=>{let body='';res.on('data',chunk=>{body+=chunk;if(body.length>16384)req.destroy(Error('RECOVERY_RESPONSE_OVERSIZED'));});res.on('end',()=>{try{resolve({status:res.statusCode,cache:res.headers['cache-control'],data:JSON.parse(body)});}catch{reject(Error('RECOVERY_RESPONSE_INVALID'));}});});req.setTimeout(5000,()=>req.destroy(Error('RECOVERY_REQUEST_TIMEOUT')));req.once('error',reject);req.end();});
 try{
  ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',()=>reject(Error('RECOVERY_CHILD_LAUNCH_FAILED')));child.once('exit',()=>reject(Error('RECOVERY_CHILD_STARTUP_REJECTED')));});
  if(ready.event!=='RECOVERY_INSPECTION_READY'||!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(ready.url)||ready.metadata?.inputScope!=='EXISTING_DATA'||ready.metadata.scope!=='RECOVERY_INSPECTION_ONLY')throw Error('RECOVERY_CHILD_SCOPE_INVALID');
  const ref=ready.proofReference,proofBytes=bytes(ref.path);if(sha(proofBytes)!==ref.sha256||proofBytes.length!==ref.byteLength)throw Error('RECOVERY_REFERENCE_CHANGED');
  const proof=JSON.parse(proofBytes);if(proof.inputScope!=='EXISTING_DATA'||proof.acceptanceEligible!==false||proof.promoted!==false)throw Error('RECOVERY_REFERENCE_SCOPE_INVALID');
  const health=await request('/api/health'),status=await request('/api/recovery/status');
  if(health.status!==200||health.cache!=='no-store'||health.data.scope!=='RECOVERY_INSPECTION_ONLY'||health.data.productAccessEnabled!==false||health.data.financialAccountingVerified!==false||status.status!==200||status.cache!=='no-store'||JSON.stringify(status.data)!==JSON.stringify(ready.metadata))throw Error('RECOVERY_HTTP_SCOPE_INVALID');
  const m=status.data;if(m.inspectionReady!==true||m.productAccessEnabled!==false||m.financialAccountingVerified!==false||m.chainReadbackPerformed!==false||m.workersStarted!==false||m.restoredSessionsAccepted!==false||m.authCutoverAllowed!==false||m.acceptanceEligible!==false)throw Error('RECOVERY_HTTP_AUTHORITY_INVALID');
  for(const [name,count]of Object.entries(m.counts))if(proof.restore.counts[name]!==count)throw Error('RECOVERY_HTTP_RECORD_COUNT_CHANGED');
  const checks=[{route:'/api/health',status:health.status},{route:'/api/recovery/status',status:status.status}];
  for(const [route,options,expected]of [['/api/orders',{},423],['/api/auth/me',{headers:{Authorization:'Bearer intentionally-invalid-inspection-probe'}},423],['/api/recovery/status',{method:'POST'},423],['/api/recovery/status',{headers:{Origin:'https://untrusted.example.invalid'}},403],['/api/recovery/status',{headers:{Host:'untrusted.example.invalid'}},403]]){const r=await request(route,options);if(r.status!==expected)throw Error('RECOVERY_HTTP_BOUNDARY_FAILED');checks.push({route,method:options.method||'GET',status:r.status});}
  record.httpChecks=checks;record.metadata=m;record.recoveryReference=ref;record.inspectionStartupAndProbeMs=Math.round((performance.now()-started)*1000)/1000;
  const closing=performance.now();child.send('RECOVERY_INSPECTION_STOP');record.terminal=await terminal;record.shutdownMs=Math.round((performance.now()-closing)*1000)/1000;
  if(record.terminal.exitCode!==0||record.terminal.signal!==null||forced)throw Error('RECOVERY_TERMINAL_NOT_NATURAL');
  if(JSON.stringify(before)!==JSON.stringify(footprint()))throw Error('RECOVERY_ORIGINAL_DATA_CHANGED');
  if(JSON.stringify(toolInputs)!==JSON.stringify(inputs()))throw Error('RECOVERY_TOOL_INPUT_CHANGED');
  record.originalFilesPreserved=true;record.status='INSPECTION_HTTP_PASS_PRODUCT_RECOVERY_OPEN';
 }catch(error){record.failureCode=/^RECOVERY_[A-Z_]+$/.test(error?.message||'')?error.message:'RECOVERY_INSPECTION_PROBE_REJECTED';}
 finally{clearTimeout(timeout);if(child.exitCode===null&&child.signalCode===null){child.kill();record.terminal=await terminal;}record.originalFilesPreserved=JSON.stringify(before)===JSON.stringify(footprint());}
 const directory='reports/evidence/recovery-inspection-api',file=directory+'/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json';fs.mkdirSync(path.join(root,directory),{recursive:true});
 const value=Buffer.from(JSON.stringify(record,null,2)+'\n'),pointer={schemaVersion:1,path:file,sha256:sha(value),byteLength:value.length,status:record.status,acceptanceEligible:false};fs.writeFileSync(path.join(root,file),value,{flag:'wx'});
 const latest=path.join(root,'reports/evidence/RECOVERY_INSPECTION_API_LATEST.json'),temp=latest+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(pointer,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,latest);
 console.log(JSON.stringify(pointer));if(record.status!=='INSPECTION_HTTP_PASS_PRODUCT_RECOVERY_OPEN')process.exitCode=1;
}
main().catch(()=>{console.error('RECOVERY_INSPECTION_API_REJECTED; private data withheld');process.exitCode=1;});
