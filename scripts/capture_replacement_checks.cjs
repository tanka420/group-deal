const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>fs.readFileSync(path.join(root,f));
const priorPath='reports/evidence/checks-seller-locale-2026-10-03T15-22-32-930Z/CHECKS.json',prior=JSON.parse(read(priorPath));
const listed=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const extras=['sdk/README.md','frontend/index.html','frontend/fallback.html','reports/RUNBOOK_VAN_HAN_ARC.md','scripts/package_fallback.cjs','scripts/serve_fallback.cjs','scripts/run_contract_checks.cjs','scripts/capture_replacement_checks.cjs'];
const files=[...new Set(listed)].filter(f=>/^(backend\/(src|scripts|test)\/|contracts\/(contracts|scripts|test)\/|frontend\/(src|e2e)\/|sdk\/(src|test|examples)\/|shared\/)/.test(f)||/^(backend|contracts|frontend|sdk)\/(package(?:-lock)?\.json|tsconfig.*\.json|hardhat\.config\.ts|playwright\.config\.ts|vite\.config\.ts)$/.test(f)||extras.includes(f)).filter(f=>fs.existsSync(path.join(root,f))).sort().map(f=>({path:f,sha256:sha(read(f))}));
function unchanged(f){const now=files.find(x=>x.path===f),old=prior.files.find(x=>x.path===f);if(!now||!old||now.sha256!==old.sha256)throw new Error('Changed carried dependency: '+f);return now;}
function domain(prefix){const now=files.filter(f=>f.path.startsWith(prefix)),old=prior.files.filter(f=>f.path.startsWith(prefix));if(now.length!==old.length)throw new Error('Carried domain inventory changed');return now.map(f=>unchanged(f.path));}
const contracts=domain('contracts/'),shared=domain('shared/');for(const f of ['backend/package-lock.json','backend/tsconfig.json','scripts/run_contract_checks.cjs'])unchanged(f);
if(prior.runtime.node!==process.version)throw new Error('Runtime changed');
for(const item of prior.compilerInputs.sourceHashes)if(sha(read(item.path))!==item.sha256)throw new Error('Compiler input changed');
const closure=JSON.parse(read('.cache/replacement-worker-closure.json')),typeWitness=JSON.parse(read('.cache/replacement-type-only.json'));
for(const file of closure.files){if(sha(read(file.path))!==file.sha256)throw new Error('Worker changed since closure capture');if(!file.unchanged&&(file.path!==typeWitness.file||file.sha256!==typeWitness.currentSourceSha256||!typeWitness.exactPriorReconstructed||!typeWitness.emittedJavaScriptEqual))throw new Error('Worker runtime changed');}
const artifact=JSON.parse(read('.cache/fallback-latest-package.json'));
for(const file of artifact.files)if(sha(read('frontend/dist/'+file.path))!==file.sha256||sha(read(artifact.artifactDirectory+'/'+file.path))!==file.sha256)throw new Error('Fallback build/package bytes changed');
// The earlier completed 34-case run had 30 passing cases outside the replacement file.
// Preserve its overall FAIL; only those named, unchanged cases are counted in the scoped result.
const earlier=read('.cache/replacement-browser-renewed.log').toString(),caseLines=earlier.split(/\r?\n/).filter(line=>/^\s*ok\s+\d+ .*e2e\\(?:checkout|financial_projection|product_operations)\.spec\.ts:/.test(line));
if(caseLines.length!==30||!/33 passed /.test(earlier)||!/1 failed/.test(earlier)||earlier.split(/\r?\n/).filter(line=>/^\s*x\s+\d+/.test(line)).some(line=>!line.includes('transaction_replacement.spec.ts')))throw new Error('Unexpected earlier scoped browser results');
// Product test file gained one delivery regression after that run; its earlier prefix is exact.
const productFile='frontend/e2e/product_operations.spec.ts',product=read(productFile).toString().replace(/\r\n/g,'\n'),start=product.indexOf('\n\ntest("seller fulfillment preserves'),end=product.indexOf('\ntest("buyer activates',start);
if(start<0||end<0)throw new Error('Delivery test boundary missing');const reconstructed=product.slice(0,start)+product.slice(end),expected=prior.files.find(f=>f.path===productFile).sha256;
if(![reconstructed,reconstructed.replace(/\r\n/g,'\n'),reconstructed.replace(/\r?\n/g,'\r\n')].some(s=>sha(s)===expected))throw new Error('Earlier product cases changed');
const scopedBrowser={scope:['checkout.spec.ts','financial_projection.spec.ts','product_operations.spec.ts existing 15 cases'],caseCount:30,caseResults:'PASS',wholeRunResult:'FAIL',wholeRunExitCode:1,failureScope:'transaction_replacement.spec.ts fixture load race; four cases renewed separately',lines:caseLines,productPriorSourceSha256:expected,exactEarlierProductFileReconstructed:true};
const fresh=[
 ['backend','.cache/replacement-backend-suite.log',/PASS LOCAL_FIXTURE: signed\/RPC nonce lineage/,'npm --prefix backend test','Full backend suite including replacement/ACL/concurrency/restart; isolated temporary SQLite','LOCAL_FIXTURE'],
 ['backend-build','.cache/replacement-backend-build.log',/> tsc/,'npm --prefix backend run build','TypeScript backend build','LOCAL_BUILD'],
 ['frontend-build','.cache/replacement-frontend-build-final.log',/built in/,'npm --prefix frontend run build','Final production code multipage build; eval/chunk warnings remain','LOCAL_BUILD'],
 ['sdk-consumer','.cache/replacement-sdk-final.log',/PASS LOCAL_FIXTURE: packed install/,'npm --prefix sdk test','Packed types/API/observe/replace validation, HMAC and durable HTTP inbox consumer; README explanation subsequently updated','LOCAL_FIXTURE_PACKED_CONSUMER'],
 ['browser-replacement','.cache/replacement-history-final.log',/4 passed /,'PLAYWRIGHT_REUSE_SERVER=1 npm --prefix frontend run test:e2e -- transaction_replacement.spec.ts','Four owned history/partial/same-call/rejected/nonce-consumed cases; no wallet signing','LOCAL_BROWSER_FIXTURE'],
 ['browser-delivery','.cache/replacement-delivery.log',/1 passed /,'PLAYWRIGHT_REUSE_SERVER=1 npm --prefix frontend run test:e2e -- product_operations.spec.ts --grep "fulfillment preserves"','Staged delivery HTTP 200 partial keeps dialog/checkpoint; PROJECTED closes without another signature','LOCAL_BROWSER_FIXTURE'],
].map(([id,file,marker,command,summary,layer])=>{const bytes=read(file),log=bytes.toString();if(!marker.test(log)||/^\s*[1-9]\d* (?:failed|failing)/m.test(log)||/error TS\d+/.test(log))throw new Error('Fresh completion missing: '+id);return {id,bytes,command,summary,layer,result:'PASS',exitCode:0,carriedForward:false};});
const carried=['contracts','contract-types','generated-projection','fallback-built-artifact'].map(id=>{const old=prior.checks.find(c=>c.id===id);if(!old||old.result!=='PASS'||sha(read(old.log))!==old.sha256)throw new Error('Invalid prior check '+id);return {...old,bytes:read(old.log),sourceProof:priorPath,carriedForward:true,summary:'Scoped hashes/compile inputs/runtime verified; not rerun. '+old.summary};});
function inventory(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?inventory(path.join(dir,item.name)):[path.join(dir,item.name)]);}
async function main(){
 const boundary={server:'http://127.0.0.1:4175',files:[],blocked:[],layer:'LOCAL_STATIC_PACKAGE_BOUNDARY',acceptanceEligible:false};
 for(const file of artifact.files){const response=await fetch(boundary.server+'/'+file.path,{signal:AbortSignal.timeout(5000)});if(response.status!==200||sha(Buffer.from(await response.arrayBuffer()))!==file.sha256)throw new Error('Static HTTP bytes differ');boundary.files.push({path:file.path,status:200,sha256:file.sha256});}
 const head=await fetch(boundary.server+'/fallback.html',{method:'HEAD'});if(head.status!==200||(await head.arrayBuffer()).byteLength)throw new Error('HEAD boundary failed');boundary.head={status:200,bodyBytes:0};
 for(const route of ['/api/transactions','/src/App.tsx','/index.html']){const response=await fetch(boundary.server+route);if(response.status!==404)throw new Error('Static route exposed');boundary.blocked.push({path:route,status:404});}
 if((await fetch(boundary.server+'/fallback.html',{method:'POST'})).status!==405)throw new Error('Static mutation allowed');boundary.blocked.push({path:'/fallback.html',method:'POST',status:405});
 const relative='reports/evidence/checks-replacement-'+new Date().toISOString().replace(/[:.]/g,'-'),destination=path.join(root,relative);fs.mkdirSync(destination,{recursive:false});
 const write=(name,bytes)=>{const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});return {path:relative+'/'+name,sha256:sha(bytes)};};
 const checks=[...fresh,...carried].map(({bytes,...check})=>{const log=write(check.id+'.log',bytes);return {...check,log:log.path,sha256:log.sha256};});
 const scoped=write('browser-scoped.json',Buffer.from(JSON.stringify(scopedBrowser,null,2)+'\n'));checks.push({id:'browser-existing-30',result:'SCOPED_PASS',layer:'LOCAL_BROWSER_FIXTURE',caseCount:30,wholeRunResult:'FAIL',wholeRunExitCode:1,log:scoped.path,sha256:scoped.sha256});
 const http=write('static-boundary.json',Buffer.from(JSON.stringify(boundary,null,2)+'\n'));checks.push({id:'static-boundary',result:'PASS',exitCode:0,carriedForward:false,log:http.path,sha256:http.sha256,layer:boundary.layer});
 const witnesses=[write('worker-closure.json',read('.cache/replacement-worker-closure.json')),write('interface-runtime-witness.json',read('.cache/replacement-type-only.json'))];
 const failures=[
 ['partial-checkpoint-real-bugs','.cache/replacement-before.log','History and claim cleared/closed on partial HTTP 200. Fixed PROJECTED/id/hash guard.'],
 ['wrong-test-working-directory','.cache/replacement-backend-initial.log','Root cwd missed backend environment; production JWT guard retained; use npm --prefix backend.'],
 ['fixture-timing-and-json-comparison','.cache/replacement-browser.log','Interrupted after finished cases: fixture phase changed during loading; compare parsed checkout financial/hash/key fields across local/server timestamp and key order. Not a complete PASS.'],
 ['fixture-initial-list-race','.cache/replacement-browser-renewed.log','Completed 33 PASS/1 FAIL: initial heading precedes async list; wait submitted row before changing fixture phase. Four replacement cases renewed PASS.'],
 ['partial-run-after-first-fix','.cache/replacement-after.log','Two cases reached PASS but framework server teardown stalled; interrupted owned handle, not a completed process PASS.'],
 ].map(([id,file,reason])=>({id,reason,...write('failures/'+id+'.log',read(file))}));
 const shots=inventory(path.join(root,'.cache/replacement-history-final-artifacts')).filter(file=>/replacement-(?:partial-history|nonce-consumed)\.png$/.test(file));if(shots.length!==2)throw new Error('Replacement visuals missing');
 const visuals=shots.map(file=>({...write('visuals/'+path.basename(file),fs.readFileSync(file)),viewport:{width:375,height:700},fullPage:true,layer:'LOCAL_BROWSER_FIXTURE'}));
 const record={schemaVersion:1,recordedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint:sha(Buffer.from(JSON.stringify(files))),files,checks,witnesses,visualArtifacts:visuals,failures,sourceProof:priorPath,
 taskTrace:['WP08-T09','WP07-T04','WP20-T09','WP21-T09','WP18-T04'],candidateFrozen:false,acceptanceEligible:false,activeDataMutated:false,liveDeploymentMutated:false,
 browserCoverage:{uniqueCases:35,note:'30 named passing cases from a completed 33/1 run plus four renewed replacement cases and one new delivery case. No full 114-case rerun; overall earlier FAIL archived.'},
 scopedCarry:{contracts,shared,generatedWorkerClosure:closure.files,typeOnlyExtensionWitness:typeWitness,backendLock:unchanged('backend/package-lock.json'),backendCompilerOptions:unchanged('backend/tsconfig.json'),note:'Contract/compiler inputs unchanged; generated worker has only interface extension with reconstructed prior hash and identical emitted JS. Backend/SDK runtime changed and were tested fresh.'},
 compilerInputs:{...prior.compilerInputs,carriedForward:true,sourceProof:priorPath},standalone:{currentBuildByteMatch:true,testedPackage:artifact.artifactDirectory+'/PACKAGE.json',artifactTestsCarried:true,currentHttpBoundaryFresh:true,files:artifact.files},
 runtime:{node:process.version},goalRestoration:{restoredAtUserRequest:true,priorFilesAndEvidenceRetained:true,newUsageCounterStartsFromZero:true},
 openGates:[...prior.openGates,'WP08 replacement has local signed/RPC/browser proof; Circle/no-hash rejection/BUY expiration/live wallet detection and staged delivery retry remain open'],captureScript:{path:'scripts/capture_replacement_checks.cjs',sha256:sha(fs.readFileSync(__filename))}};
 write('CHECKS.json',Buffer.from(JSON.stringify(record,null,2)+'\n'));console.log(JSON.stringify({report:relative+'/CHECKS.json',sourceFingerprint:record.sourceFingerprint,files:files.length,checks:checks.length,browserCoverage:35,acceptanceEligible:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
