const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const priorPath='reports/evidence/checks-stateful-2026-10-03T08-53-54-068Z/CHECKS.json',prior=JSON.parse(fs.readFileSync(path.join(root,priorPath)));
const listed=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const selected=[...new Set(listed)].filter(file=>/^(backend\/(src|scripts|test)\/|contracts\/(contracts|scripts|test)\/|frontend\/(src|e2e)\/|sdk\/(src|test|examples)\/|shared\/)/.test(file)||/^(backend|contracts|frontend|sdk)\/(package(?:-lock)?\.json|tsconfig.*\.json|hardhat\.config\.ts|playwright\.config\.ts|vite\.config\.ts)$/.test(file)||['sdk/README.md','frontend/index.html','frontend/fallback.html','scripts/package_fallback.cjs','scripts/serve_fallback.cjs','scripts/capture_fallback_checks.cjs','scripts/run_contract_checks.cjs','scripts/capture_stateful_checks.cjs','scripts/capture_projection_checks.cjs','reports/RUNBOOK_VAN_HAN_ARC.md'].includes(file)).filter(file=>fs.existsSync(path.join(root,file))).sort();
const files=selected.map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
for(const prefix of ['frontend/','sdk/','shared/']){
  const current=files.filter(file=>file.path.startsWith(prefix)),previous=prior.files.filter(file=>file.path.startsWith(prefix));
  if(current.length!==previous.length||current.some(file=>previous.find(old=>old.path===file.path)?.sha256!==file.sha256))throw new Error(prefix+' changed; prior proof cannot be carried');
}
const solidity=files.filter(file=>file.path.startsWith('contracts/contracts/')),oldSolidity=prior.files.filter(file=>file.path.startsWith('contracts/contracts/'));
if(solidity.length!==oldSolidity.length||solidity.some(file=>oldSolidity.find(old=>old.path===file.path)?.sha256!==file.sha256))throw new Error('Solidity changed; compiler/runtime proof must be renewed');
const cases=[
 ['backend','.cache/v2-backend-generated-projection-all.log',/PASS LOCAL_FIXTURE: durable order actions/, 'npm --prefix backend test','Fresh full backend suite, including initial clearing price, canonical terms/publish race, readiness hold and mined receipt recovery','LOCAL_BACKEND_FIXTURES'],
 ['backend-build','.cache/v2-backend-generated-projection-build.log',/> tsc/,'npm --prefix backend run build','Fresh TypeScript backend build','LOCAL_BUILD'],
 ['contracts','.cache/v2-contract-generated-projection-full.log',/38 passing/,'node scripts/run_contract_checks.cjs all','Fresh 38 contract/model/deliberate-bug tests','LOCAL_CONTRACT_AND_STATEFUL'],
 ['contract-types','.cache/v2-contract-projection-types.log',/PASS CONTRACT_TYPES/,'node scripts/run_contract_checks.cjs types','Fresh contract/reference/HTTP bridge TypeScript noEmit','LOCAL_TYPECHECK'],
 ['generated-projection','.cache/v2-generated-projection-all.log',/9 passing/,'node scripts/run_contract_checks.cjs projection','Fresh same-stream actual local EVM receipts through production indexer and fixed-block per-order reconciliation','LOCAL_CONTRACT_BACKEND_DIFFERENTIAL'],
];
const fresh=cases.map(([id,source,marker,command,summary,layer])=>{
 const bytes=fs.readFileSync(path.join(root,source)),log=bytes.toString();
 if(!marker.test(log)||/^\s*[1-9]\d* (?:failing|failed)\s*(?:$|\()/m.test(log)||/error TS\d+/.test(log))throw new Error('Completion marker missing or failure present: '+id);
 return {id,bytes,command,summary,layer,result:'PASS',exitCode:0,carriedForward:false};
});
const integrationLog=fresh.find(check=>check.id==='generated-projection').bytes.toString();
const seeds=[1,7,19,73,311,7331,65537,31153],seedRecords=seeds.map(seed=>{
 const name=`projection-seed-${seed}.json`,bytes=fs.readFileSync(path.join(root,'.cache/stateful-fuzz',name)),record=JSON.parse(bytes);
 if(record.result!=='PASS'||record.seed!==seed||record.layer!=='LOCAL_CONTRACT_BACKEND_DIFFERENTIAL'||record.acceptanceEligible!==false||record.trace.length!==record.stats.transitions||record.backend?.checkpoints!==record.stats.transitions+1||record.backend.restarts!==2||record.backend.outageChecks!==1||record.backend.corruptionChecks!==1||record.backend.rebuilds!==1||record.backend.duplicateChecks!==Math.floor(record.backend.checkpoints/12)||!integrationLog.includes(`PASS LOCAL_STATEFUL seed=${seed} transitions=${record.stats.transitions}`))throw new Error('Generated integration corpus/log mismatch: '+name);
 const required=['eth_getCode','eth_getBlockByNumber','eth_getLogs','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call'];
 if(required.some(method=>!record.backend.methods[method])||record.backend.rpcReads!==Object.values(record.backend.methods).reduce((sum,count)=>sum+count,0))throw new Error('Actual RPC transport coverage missing: '+name);
 return {name,bytes,record};
});
const totals={seeds:8,transitions:0,checkpoints:0,additionalBuyerClaims:0,cancelledAfterAllocation:0,maximumOrders:0,restarts:0,outageChecks:0,corruptionChecks:0,rebuilds:0,duplicateChecks:0,rpcReads:0,accepted:{},rejected:{},methods:{}};
for(const {record} of seedRecords){
 for(const name of ['transitions','additionalBuyerClaims','cancelledAfterAllocation'])totals[name]+=record.stats[name];
 totals.maximumOrders=Math.max(totals.maximumOrders,record.stats.maximumOrders);
 for(const name of ['checkpoints','restarts','outageChecks','corruptionChecks','rebuilds','duplicateChecks','rpcReads'])totals[name]+=record.backend[name];
 for(const kind of ['accepted','rejected'])for(const [name,count] of Object.entries(record.stats[kind]))totals[kind][name]=(totals[kind][name]||0)+count;
 for(const [name,count] of Object.entries(record.backend.methods))totals.methods[name]=(totals.methods[name]||0)+count;
}
if(totals.transitions!==972||totals.additionalBuyerClaims!==36||totals.cancelledAfterAllocation!==8||totals.checkpoints!==980)throw new Error('Generated coverage changed; explicitly inspect the new bounds before recording');
for(const item of prior.compilerInputs.sourceHashes)if(hash(fs.readFileSync(path.join(root,item.path)))!==item.sha256)throw new Error('Compiler input changed: '+item.path);
const carriedIds=new Set(['frontend-build','browser','fallback-built-artifact','static-package-boundary','sdk-consumer']);
const carried=prior.checks.filter(check=>carriedIds.has(check.id)).map(check=>{
 const bytes=fs.readFileSync(path.join(root,check.log));if(check.result!=='PASS'||check.exitCode!==0||hash(bytes)!==check.sha256)throw new Error('Prior log changed: '+check.id);
 return {...check,bytes,sourceProof:priorPath,carriedForward:true,summary:'Carried only after complete source/config/test and immutable log hashes match: '+check.summary};
});
if(carried.length!==carriedIds.size)throw new Error('Required prior package/browser checks missing');
for(const item of prior.inheritedFallback.files)if(hash(fs.readFileSync(path.join(root,item.path)))!==item.sha256)throw new Error('Archived standalone artifact changed');
const mutationBytes=fs.readFileSync(path.join(root,'.cache/stateful-fuzz/deliberate-cap-bug-minimal.json')),mutation=JSON.parse(mutationBytes);
if(!mutation.expectedDetection||!mutation.deletionMinimal||mutation.minimalLength!==3||!integrationLog.includes('PASS LOCAL_DELIBERATE_BUG'))throw new Error('Executable deliberate-bug/shrink result absent');
const failures=[
 ['initial-clearing-price','.cache/v2-generated-projection-price-failed.log','.cache/v2-generated-projection-price-counterexample.json','Campaign creation omitted the initial tier-zero clearing-price getter; canonical creation evidence now populates it without claiming finalization.'],
 ['missing-terms-update','.cache/v2-generated-projection-terms-failed.log','.cache/v2-generated-projection-terms-counterexample.json','A successful updateTermsBeforeFirstCommitment receipt was journalled without projecting its hash. Current chain hash is now tracked separately from immutable creation/publish binding.'],
].map(([id,source,fixture,reason])=>{
 const bytes=fs.readFileSync(path.join(root,source)),counterexample=fs.readFileSync(path.join(root,fixture)),record=JSON.parse(counterexample);
 if(record.result!=='FAIL'||!bytes.toString().includes('failing'))throw new Error('Original failure evidence missing: '+id);
 return {id,bytes,counterexample,reason,property:record.property,result:'FAIL',exitCode:1};
});
const relative='reports/evidence/checks-projection-'+new Date().toISOString().replace(/[:.]/g,'-'),destination=path.join(root,relative);fs.mkdirSync(destination,{recursive:false});
const write=(name,bytes)=>{const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});return {path:relative+'/'+name,sha256:hash(bytes)};};
const checks=[...carried,...fresh].map(check=>{const copied=write(check.id+'.log',check.bytes),{bytes,...metadata}=check;return {...metadata,log:copied.path,sha256:copied.sha256};});
const fixtures=seedRecords.map(({name,bytes,record})=>({...write('generated/'+name,bytes),seed:record.seed,layer:record.layer,result:'PASS',transitions:record.stats.transitions}));
const interruptedRuns=failures.map(({id,bytes,counterexample,...metadata})=>({id,...metadata,log:write(id+'-failed.log',bytes),counterexample:write(id+'-counterexample.json',counterexample)}));
const captureFailure=write('capture-otp-description-marker-failed.log',fs.readFileSync(path.join(root,'.cache/v2-projection-capture-marker-failed.log')));
interruptedRuns.push({id:'capture-otp-description-marker',result:'FAIL',exitCode:1,log:captureFailure,reason:'The initial capture guard mistook a passing OTP brute-force description (five failed attempts) for a test failure count. Anchored the failure-count check to summary lines; test results were not changed.'});
const record={schemaVersion:1,recordedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint:hash(Buffer.from(JSON.stringify(files))),files,checks,sourceProof:priorPath,candidateFrozen:false,acceptanceEligible:false,activeDataMutated:false,liveDeploymentMutated:false,
 generatedProjection:{layer:'LOCAL_CONTRACT_BACKEND_DIFFERENTIAL',chainId:31337,token:'MockUSDC',principals:'Isolated fixture wallets and generated signed authorizations',...totals,fixtures,scope:'Independent business model, actual local contract state/token balances, canonical successful receipts, production journal/indexer, SQLite process restarts and same-block per-order reconciliation; read-only HTTP transport forwards the real EVM provider.',limitations:['Maximum twelve orders, no large-order gas bound','No concurrent mempool or production multiwriter differential generation','Private fixture markers prove persistence, not real entitlement/provider delivery','No Circle/Safe/real principal signing, Arc chain write, live outage or acceptance','Further protocol mutations/numeric shrinking and clean-checkout CI remain open'],deliberateBug:{...write('generated/deliberate-cap-bug-minimal.json',mutationBytes),actualVersion:1,expectedModelVersion:2,deletionMinimal:true,minimalCommands:3}},
 compilerInputs:{...prior.compilerInputs,sourceProof:priorPath,cleanCheckoutVerified:false},inheritedFallback:prior.inheritedFallback,interruptedRuns,
 openGates:prior.openGates.filter(gate=>!gate.startsWith('Stateful contract generation')&&!gate.startsWith('No source Solidity')).concat(['Concurrent/large-order gas, further mutations and clean-checkout CI remain open','Changed chain terms require verified product/license rebinding before new BUY; no automatic metadata rewrite','Legacy writer/cutover, real product/provider and independent G5/G6 are unaccepted']),
 captureScript:{path:'scripts/capture_projection_checks.cjs',sha256:hash(fs.readFileSync(__filename)),packet:'generated-projection'},runtime:{node:process.version},
};
write('CHECKS.json',Buffer.from(JSON.stringify(record,null,2)+'\n'));
console.log(JSON.stringify({report:relative+'/CHECKS.json',sourceFingerprint:record.sourceFingerprint,fileCount:files.length,checks:checks.length,transitions:totals.transitions,checkpoints:totals.checkpoints,rpcReads:totals.rpcReads,restarts:totals.restarts,acceptanceEligible:false}));
