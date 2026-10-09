const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const priorPath='reports/evidence/checks-projection-2026-10-03T09-38-15-217Z/CHECKS.json',prior=JSON.parse(fs.readFileSync(path.join(root,priorPath)));
const listed=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const selected=[...new Set(listed)].filter(file=>/^(backend\/(src|scripts|test)\/|contracts\/(contracts|scripts|test)\/|frontend\/(src|e2e)\/|sdk\/(src|test|examples)\/|shared\/)/.test(file)||/^(backend|contracts|frontend|sdk)\/(package(?:-lock)?\.json|tsconfig.*\.json|hardhat\.config\.ts|playwright\.config\.ts|vite\.config\.ts)$/.test(file)||['sdk/README.md','frontend/index.html','frontend/fallback.html','scripts/package_fallback.cjs','scripts/serve_fallback.cjs','scripts/capture_fallback_checks.cjs','scripts/run_contract_checks.cjs','scripts/capture_stateful_checks.cjs','scripts/capture_projection_checks.cjs','scripts/capture_load_checks.cjs','reports/RUNBOOK_VAN_HAN_ARC.md'].includes(file)).filter(file=>fs.existsSync(path.join(root,file))).sort();
const files=selected.map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
for(const prefix of ['frontend/','sdk/','shared/']){
  const current=files.filter(file=>file.path.startsWith(prefix)),previous=prior.files.filter(file=>file.path.startsWith(prefix));
  if(current.length!==previous.length||current.some(file=>previous.find(old=>old.path===file.path)?.sha256!==file.sha256))throw new Error(prefix+' changed; prior proof cannot be carried');
}
const solidity=files.filter(file=>file.path.startsWith('contracts/contracts/')),oldSolidity=prior.files.filter(file=>file.path.startsWith('contracts/contracts/'));
if(solidity.length!==oldSolidity.length||solidity.some(file=>oldSolidity.find(old=>old.path===file.path)?.sha256!==file.sha256))throw new Error('Solidity changed; compiler/runtime proof must be renewed');
const cases=[
 ['backend','.cache/v2-backend-queued-full.log',/PASS LOCAL_FIXTURE: durable order actions/, 'npm --prefix backend test','Fresh full backend suite after effective cancelled status and zero-proceeds seller receipt fixes; existing cumulative/publish/readiness/receipt regressions retained','LOCAL_BACKEND_FIXTURES'],
 ['backend-build','.cache/v2-backend-load-build.log',/> tsc/,'npm --prefix backend run build','Fresh TypeScript backend build','LOCAL_BUILD'],
 ['contracts','.cache/v2-contract-load-full.log',/52 passing/,'node scripts/run_contract_checks.cjs all','Fresh 52 contract/model/concurrency/gas/deliberate-bug tests','LOCAL_CONTRACT_AND_STATEFUL'],
 ['contract-types','.cache/v2-contract-load-types.log',/PASS CONTRACT_TYPES/,'node scripts/run_contract_checks.cjs types','Fresh contract/reference/HTTP bridge TypeScript noEmit','LOCAL_TYPECHECK'],
 ['generated-projection','.cache/v2-queued-generated-projection-all.log',/9 passing/,'node scripts/run_contract_checks.cjs projection','Fresh same-stream actual local EVM receipts through production indexer and fixed-block per-order reconciliation','LOCAL_CONTRACT_BACKEND_DIFFERENTIAL'],
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
const fullLog=fresh.find(check=>check.id==='contracts').bytes.toString();
const queuedNames=[...seeds.map(seed=>`seed-${seed}.json`),'cancel-dispute-true.json','cancel-dispute-false.json','seller-zero-duplicate.json'];
const queuedRecords=queuedNames.map(name=>{
 const bytes=fs.readFileSync(path.join(root,'.cache/concurrent-transitions',name)),record=JSON.parse(bytes);
 if(record.result!=='PASS'||record.layer!=='LOCAL_QUEUED_CONCURRENCY'||record.acceptanceEligible!==false||record.backend.rebuilds!==1||!record.trace.length||record.trace.some(item=>!/^0x[0-9a-f]{64}$/i.test(item.txHash)||!/^0x[0-9a-f]{64}$/i.test(item.blockHash)||!Number.isSafeInteger(item.blockNumber)||!Number.isSafeInteger(item.transactionIndex)))throw new Error('Queued receipt/model corpus missing: '+name);
 if(record.seed!==undefined&&(!fullLog.includes(`PASS LOCAL_QUEUED seed=${record.seed} kind=${record.kind}`)||record.kind!==seeds.indexOf(record.seed)%4))throw new Error('Queued family/log mismatch: '+name);
 return {name,bytes,record};
});
const queuedTotals={cases:queuedRecords.length,transactions:0,accepted:0,reverted:0,sameBlockGroups:0,checkpoints:0,rebuilds:0,rpcReads:0};
for(const {record} of queuedRecords){
 queuedTotals.transactions+=record.trace.length;queuedTotals.accepted+=record.trace.filter(item=>item.accepted).length;queuedTotals.reverted+=record.trace.filter(item=>!item.accepted).length;
 const groups=new Map();for(const item of record.trace){const key=item.blockHash;groups.set(key,(groups.get(key)||0)+1);}queuedTotals.sameBlockGroups+=[...groups.values()].filter(count=>count>1).length;
 for(const name of ['checkpoints','rebuilds','rpcReads'])queuedTotals[name]+=record.backend[name];
}
if(queuedTotals.cases!==11||queuedTotals.transactions!==45||queuedTotals.sameBlockGroups!==13||queuedTotals.rebuilds!==11)throw new Error('Queued coverage changed; inspect it explicitly');
const gasRecords=[10,100,1000].map(orderCount=>{
 const name=`orders-${orderCount}.json`,bytes=fs.readFileSync(path.join(root,'.cache/bounded-gas',name)),record=JSON.parse(bytes);
 if(record.result!=='PASS'||record.layer!=='LOCAL_GAS_BENCHMARK'||record.acceptanceEligible!==false||record.chainId!==31337||record.orderCount!==orderCount||record.perOrderWithdrawalVerified!==orderCount||!fullLog.includes(`PASS LOCAL_GAS orders=${orderCount} finalize=${record.finalize.gasUsed} cancel=${record.cancel.gasUsed} finalEscrow=0`))throw new Error('Large-order gas/withdrawal proof missing: '+name);
 for(const action of ['batches','claims']){const fifty=record[action].find(item=>item.count===Math.min(50,orderCount));if(!fifty||BigInt(fifty.gasUsed)>=16_000_000n)throw new Error('Bounded batch proof absent');}
 if(orderCount===1000){for(const [kind,count] of [['batches',500],['claims',250]]){const reverted=record[kind].find(item=>item.count===count);if(!reverted||reverted.status!==0||!reverted.expectedBudgetExhaustion||!reverted.rollbackVerified||BigInt(reverted.gasUsed)!==16_000_000n)throw new Error('Expected out-of-gas rollback proof absent');}}
 return {name,bytes,record};
});
const gasSummaryBytes=fs.readFileSync(path.join(root,'.cache/bounded-gas/summary.json')),gasSummary=JSON.parse(gasSummaryBytes);
if(gasSummary.result!=='PASS'||JSON.stringify(gasSummary.sizes)!=='[10,100,1000]')throw new Error('Gas summary incomplete');
for(const action of ['finalize','cancel']){const values=gasRecords.map(item=>BigInt(item.record[action].gasUsed)),minimum=values.reduce((a,b)=>a<b?a:b),maximum=values.reduce((a,b)=>a>b?a:b);if(String(maximum-minimum)!==String(gasSummary[action+'Spread'])||maximum-minimum>500n)throw new Error('Constant-work gas result differs from receipts');}
const failures=[
 ['initial-clearing-price','.cache/v2-generated-projection-price-failed.log','.cache/v2-generated-projection-price-counterexample.json','Campaign creation omitted the initial tier-zero clearing-price getter; canonical creation evidence now populates it without claiming finalization.'],
 ['missing-terms-update','.cache/v2-generated-projection-terms-failed.log','.cache/v2-generated-projection-terms-counterexample.json','A successful updateTermsBeforeFirstCommitment receipt was journalled without projecting its hash. Current chain hash is now tracked separately from immutable creation/publish binding.'],
].map(([id,source,fixture,reason])=>{
 const bytes=fs.readFileSync(path.join(root,source)),counterexample=fs.readFileSync(path.join(root,fixture)),record=JSON.parse(counterexample);
 if(record.result!=='FAIL'||!bytes.toString().includes('failing'))throw new Error('Original failure evidence missing: '+id);
 return {id,bytes,counterexample,reason,property:record.property,result:'FAIL',exitCode:1};
});
const relative='reports/evidence/checks-load-'+new Date().toISOString().replace(/[:.]/g,'-'),destination=path.join(root,relative);fs.mkdirSync(destination,{recursive:false});
const write=(name,bytes)=>{const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});return {path:relative+'/'+name,sha256:hash(bytes)};};
const checks=[...carried,...fresh].map(check=>{const copied=write(check.id+'.log',check.bytes),{bytes,...metadata}=check;return {...metadata,log:copied.path,sha256:copied.sha256};});
const fixtures=seedRecords.map(({name,bytes,record})=>({...write('generated/'+name,bytes),seed:record.seed,layer:record.layer,result:'PASS',transitions:record.stats.transitions}));
const queuedProofs=queuedRecords.map(({name,bytes})=>write('queued/'+name,bytes)),gasProofs=gasRecords.map(({name,bytes})=>write('gas/'+name,bytes)),gasSummaryProof=write('gas/summary.json',gasSummaryBytes);
const interruptedRuns=failures.map(({id,bytes,counterexample,...metadata})=>({id,...metadata,log:write(id+'-failed.log',bytes),counterexample:write(id+'-counterexample.json',counterexample)}));
const captureFailure=write('capture-otp-description-marker-failed.log',fs.readFileSync(path.join(root,'.cache/v2-projection-capture-marker-failed.log')));
interruptedRuns.push({id:'capture-otp-description-marker',result:'FAIL',exitCode:1,log:captureFailure,reason:'The initial capture guard mistook a passing OTP brute-force description (five failed attempts) for a test failure count. Anchored the failure-count check to summary lines; test results were not changed.'});
for(const [id,source,counterexample,reason] of [
 ['queued-cancel-dispute','.cache/v2-queued-concurrency-initial.log','.cache/v2-queued-cancel-dispute-counterexample.json','A valid dispute after cancellation overwrote the effective lazy-cancel refund status in projection. Canonical OrderDisputed now retains the cancelled effective status.'],
 ['queued-zero-seller-duplicate','.cache/v2-queued-concurrency-initial.log','.cache/v2-queued-seller-zero-counterexample.json','A valid positive seller claim may include repeated zero-proceeds orders. Project unique positive payouts only; zero orders keep their false claimed flag. Positive duplicates and previously paid orders still fail closed.'],
 ['wrong-cumulative-field','.cache/v2-queued-projection-wrong-field-failed.log',null,'An intermediate implementation used sellerClaimed instead of sellerClaimedAmount; corrected the field after the new regression failed.'],
 ['fixture-minimum-tiers','.cache/v2-queued-concurrency-initial.log',null,'Four initial inventory fixtures used one tier, contradicting the existing two-to-five tier guard. Corrected fixtures to reachable two-tier inventory and indexed four scenario families; protocol guards were preserved.'],
 ['allocation-budget','.cache/v2-bounded-gas-budget-failed.log','.cache/v2-bounded-gas-budget-counterexample.json','500 worst-case allocations do not fit the explicit local 16M budget. Retained the original FAIL; the negative-boundary test now proves status-0/full rollback and recovery using smaller batches.'],
 ['claim-budget','.cache/v2-bounded-claim-budget-failed.log','.cache/v2-bounded-claim-budget-counterexample.json','250 lazy buyer claims do not fit the explicit local 16M budget. Retained the original FAIL and added an exact reverted-receipt/rollback assertion; complete 1000-order withdrawal remains required.'],
]){const failure={id,result:'FAIL',log:write(id+'-failed.log',fs.readFileSync(path.join(root,source))),reason};if(counterexample)failure.counterexample=write(id+'-counterexample.json',fs.readFileSync(path.join(root,counterexample)));interruptedRuns.push(failure);}
const record={schemaVersion:1,recordedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint:hash(Buffer.from(JSON.stringify(files))),files,checks,sourceProof:priorPath,candidateFrozen:false,acceptanceEligible:false,activeDataMutated:false,liveDeploymentMutated:false,
 generatedProjection:{layer:'LOCAL_CONTRACT_BACKEND_DIFFERENTIAL',chainId:31337,token:'MockUSDC',principals:'Isolated fixture wallets and generated signed authorizations',...totals,fixtures,scope:'Independent business model, actual local contract state/token balances, canonical successful receipts, production journal/indexer, SQLite process restarts and same-block per-order reconciliation; read-only HTTP transport forwards the real EVM provider.',limitations:['Generated financial traces have at most twelve orders; separate fixed-distribution gas benchmarks measure 1000','Scoped same-block seeded scenarios are covered separately; unconstrained concurrent generation and production multiwriter remain open','Private fixture markers prove persistence, not real entitlement/provider delivery','No Circle/Safe/real principal signing, Arc chain write, live outage or acceptance','Further protocol mutations/numeric shrinking and clean-checkout CI remain open'],deliberateBug:{...write('generated/deliberate-cap-bug-minimal.json',mutationBytes),actualVersion:1,expectedModelVersion:2,deletionMinimal:true,minimalCommands:3}},
 queuedConcurrency:{layer:'LOCAL_QUEUED_CONCURRENCY',...queuedTotals,fixtures:queuedProofs,scope:'Fixture EOA transactions queued with automine disabled, mined into the same block; model predicts acceptance/financial effects in actual receipt order and production projection/reconciliation verifies the final block.',limitations:['Eight seeded families and three targeted regressions; not unconstrained concurrent stateful fuzz','Single local writer; no production multiwriter/HA or live replacement/custody proof']},
 boundedGas:{layer:'LOCAL_GAS_BENCHMARK',orderCounts:[10,100,1000],totalOrders:1110,perOrderWithdrawalVerified:1110,finalizeGas:gasRecords.map(item=>({orders:item.record.orderCount,gas:String(item.record.finalize.gasUsed)})),cancelGas:gasRecords.map(item=>({orders:item.record.orderCount,gas:String(item.record.cancel.gasUsed)})),explicitTestGasBudget:'16000000',fixtures:gasProofs,summary:gasSummaryProof,scope:'Actual initialized V2/MockUSDC, one identity, quantity-one orders locked at 100 then cleared at 50; actual receipts, token balances, per-order cumulative withdrawal and expected out-of-gas rollback.',limitations:['Local VM snapshots restore benchmark branches; their block hashes are local receipt witnesses, not live canonical chain acceptance','No Arc network gas/transaction limits or native fee cost certification','Actual USDC, other tier/quantity/early/settlement/seller-gas paths and thousands of mixed lifecycle orders remain unproved']},
 compilerInputs:{...prior.compilerInputs,sourceProof:priorPath,cleanCheckoutVerified:false},inheritedFallback:prior.inheritedFallback,interruptedRuns,
 openGates:prior.openGates.filter(gate=>!gate.startsWith('Stateful contract generation')&&!gate.startsWith('No source Solidity')&&!gate.startsWith('Concurrent/large-order gas')).concat(['Scoped queued transactions and 1000-order local gas are measured; live token/network gas, unconstrained permutations, production multiwriter, further mutations and clean-checkout CI remain open','Changed chain terms require verified product/license rebinding before new BUY; no automatic metadata rewrite','Legacy writer/cutover, real product/provider and independent G5/G6 are unaccepted']),
 captureScript:{path:'scripts/capture_load_checks.cjs',sha256:hash(fs.readFileSync(__filename)),packet:'queued-concurrency-and-gas'},runtime:{node:process.version},
};
write('CHECKS.json',Buffer.from(JSON.stringify(record,null,2)+'\n'));
console.log(JSON.stringify({report:relative+'/CHECKS.json',sourceFingerprint:record.sourceFingerprint,fileCount:files.length,checks:checks.length,transitions:totals.transitions,checkpoints:totals.checkpoints,queuedTransactions:queuedTotals.transactions,sameBlockGroups:queuedTotals.sameBlockGroups,largeOrders:1110,acceptanceEligible:false}));
