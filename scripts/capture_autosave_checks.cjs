const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const priorPath='reports/evidence/checks-drafts-2026-10-03T13-04-03-056Z/CHECKS.json',prior=JSON.parse(fs.readFileSync(path.join(root,priorPath)));
const listed=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const extras=['sdk/README.md','frontend/index.html','frontend/fallback.html','reports/RUNBOOK_VAN_HAN_ARC.md','scripts/package_fallback.cjs','scripts/serve_fallback.cjs','scripts/run_contract_checks.cjs','scripts/capture_master_checks.cjs','scripts/capture_draft_checks.cjs','scripts/capture_autosave_checks.cjs','scripts/serve_master_preview.cjs'];
const selected=[...new Set(listed)].filter(file=>/^(backend\/(src|scripts|test)\/|contracts\/(contracts|scripts|test)\/|frontend\/(src|e2e)\/|sdk\/(src|test|examples)\/|shared\/)/.test(file)||/^(backend|contracts|frontend|sdk)\/(package(?:-lock)?\.json|tsconfig.*\.json|hardhat\.config\.ts|playwright\.config\.ts|vite\.config\.ts)$/.test(file)||extras.includes(file)).filter(file=>fs.existsSync(path.join(root,file))).sort();
const files=selected.map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
let typeErasureWitness=null;
function unchanged(file){
 const current=files.find(item=>item.path===file),old=prior.files.find(item=>item.path===file);if(!current||!old)throw new Error('Prior proof dependency missing: '+file);
 if(current.sha256!==old.sha256){
  if(file!=='backend/src/db/store.ts')throw new Error('Prior proof dependency changed: '+file);
  const candidate=fs.readFileSync(path.join(root,file),'utf8'),line=candidate.split(/\r?\n/).find(line=>line.includes('campaignDraftKeys: Record'));
  const original='  campaignDraftKeys: Record<string, {sellerId:string;idempotencyKey:string;payloadHash:string;campaignId:string}>;', reconstructed=candidate.replace(line,original);
  if(hash(Buffer.from(reconstructed))!==old.sha256)throw new Error('Type-only reconstruction does not match immutable prior source');
  const parsed=ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root,'backend/tsconfig.json'),ts.sys.readFile).config,ts.sys,path.join(root,'backend'));if(parsed.errors.length)throw new Error('Compiler options failed');
  const compile=source=>ts.transpileModule(source,{compilerOptions:parsed.options,fileName:path.join(root,file)}).outputText,oldJs=compile(reconstructed),newJs=compile(candidate);
  if(oldJs!==newJs)throw new Error('Store emitted JavaScript differs; generated worker proof cannot be carried');
  typeErasureWitness={path:file,priorSha256:old.sha256,candidateSha256:current.sha256,priorSource:reconstructed,candidateSource:candidate,compiledJavaScript:oldJs,compiledJavaScriptSha256:hash(Buffer.from(oldJs)),typeScriptVersion:ts.version,compilerOptionsSha256:hash(Buffer.from(JSON.stringify(parsed.options))),note:'Only journal type declaration widened; reconstructed prior whole-file bytes match prior SHA256 and emitted JS is byte-identical. No runtime storage/projection carry exception.'};
 }return current;
}
function unchangedDomain(prefix){const current=files.filter(item=>item.path.startsWith(prefix)),old=prior.files.filter(item=>item.path.startsWith(prefix));if(current.length!==old.length)throw new Error('Prior proof domain inventory changed: '+prefix);current.forEach(item=>unchanged(item.path));return current;}
const contractsScope=unchangedDomain('contracts/'),sdkScope=unchangedDomain('sdk/'),sharedScope=unchangedDomain('shared/');
unchanged('backend/package-lock.json');unchanged('backend/tsconfig.json');unchanged('scripts/run_contract_checks.cjs');
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'backend/package.json'))),lockedRoot=JSON.parse(fs.readFileSync(path.join(root,'backend/package-lock.json'))).packages[''];
for(const key of ['dependencies','devDependencies'])if(JSON.stringify(packageJson[key])!==JSON.stringify(lockedRoot[key]))throw new Error('Backend runtime/development dependency definitions differ from the unchanged lock');
if(prior.runtime.node!==process.version)throw new Error('Prior runtime version changed');
// Include declaration and corresponding actual runtime; do not carry by Solidity alone.
const ts=require(path.join(root,'backend/node_modules/typescript')),seen=new Set();
function dependencyClosure(file){
 const absolute=path.resolve(root,file);if(seen.has(absolute)||absolute.includes(path.sep+'node_modules'+path.sep))return;seen.add(absolute);
 const source=fs.readFileSync(absolute,'utf8');
 for(const imported of ts.preProcessFile(source,true,true).importedFiles){
  if(!imported.fileName.startsWith('.'))continue;
  const resolved=ts.resolveModuleName(imported.fileName,absolute,{moduleResolution:ts.ModuleResolutionKind.NodeJs,allowJs:true,resolveJsonModule:true},ts.sys).resolvedModule;
  if(!resolved)throw new Error('Unresolved local dependency: '+imported.fileName);
  dependencyClosure(resolved.resolvedFileName);
  if(/\.d\.(cts|mts)$/.test(resolved.resolvedFileName)){const runtime=resolved.resolvedFileName.replace(/\.d\.(cts|mts)$/,(_,kind)=>kind==='cts'?'.cjs':'.mjs');if(!fs.existsSync(runtime))throw new Error('Missing runtime behind declaration');dependencyClosure(runtime);}
 }
}
dependencyClosure('backend/test/generated_projection_worker.test.ts');
const projectionScope=[...seen].map(file=>unchanged(path.relative(root,file).replaceAll('\\','/'))).sort((a,b)=>a.path.localeCompare(b.path));
for(const item of prior.compilerInputs.sourceHashes)if(hash(fs.readFileSync(path.join(root,item.path)))!==item.sha256)throw new Error('Compiler input changed: '+item.path);
const freshCases=[
 ['backend','.cache/autosave-backend-full.log',/^PASS LOCAL_FIXTURE: seller draft read RBAC/m,'npm --prefix backend test','Full backend including draft recovery RBAC/privacy/version/product, optimistic edit race, pinned publish and duplicate-key guards','LOCAL_BACKEND_FIXTURES'],
 ['backend-build','.cache/autosave-backend-build.log',/> tsc/,'npm --prefix backend run build','TypeScript backend build','LOCAL_BUILD'],
 ['frontend-build','.cache/autosave-frontend-build.log',/built in/,'npm --prefix frontend run build','TypeScript/Vite multipage build; eval and large-chunk warnings remain','LOCAL_BUILD'],
 ['browser','.cache/autosave-browser-complete.log',/^\s*84 passed /m,'PLAYWRIGHT_REUSE_SERVER=1 npm --prefix frontend run test:e2e','84 browser cases including 19 master/validation and 15 seller draft/autosave recovery tests and 28 four-screen/seven-width images; HTTP/auth/RPC/wallet fixtures only','LOCAL_BROWSER_FIXTURE'],
 ['fallback-built-artifact','.cache/autosave-fallback-artifact.log',/^\s*14 passed /m,'GROUPDEAL_FALLBACK_BASE_URL=http://127.0.0.1:4172 npm --prefix frontend run test:e2e -- fallback.spec.ts --output ../.cache/autosave-fallback-artifacts','14 separately served built-artifact cases; app/API blocked and signing/receipt/RPC are fixtures','LOCAL_FIXTURE_BUILT_ARTIFACT'],
];
const fresh=freshCases.map(([id,source,marker,command,summary,layer])=>{const bytes=fs.readFileSync(path.join(root,source)),log=bytes.toString();if(!marker.test(log)||/^\s*[1-9]\d* (?:failing|failed)\s*(?:$|\()/m.test(log)||/error TS\d+/.test(log))throw new Error('Missing completion/failure present: '+id);return {id,bytes,command,summary,layer,result:'PASS',exitCode:0,carriedForward:false};});
const carried=['contracts','contract-types','generated-projection','sdk-consumer'].map(id=>{const check=prior.checks.find(check=>check.id===id);if(!check||check.result!=='PASS'||check.exitCode!==0)throw new Error('Prior PASS missing: '+id);const bytes=fs.readFileSync(path.join(root,check.log));if(hash(bytes)!==check.sha256)throw new Error('Prior immutable log changed: '+id);return {...check,bytes,sourceProof:priorPath,carriedForward:true,summary:'Unchanged scoped dependencies and immutable log verified; not rerun: '+check.summary};});
const artifactRoot=path.join(root,'.cache/autosave-browser-complete-artifacts'),widths=[320,375,430,768,1024,1280,1440],screens=['buyer-detail','buyer-join','seller-create','operator-detail'];
function inventory(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(item=>item.isDirectory()?inventory(path.join(directory,item.name)):[path.join(directory,item.name)]);}
const shots=inventory(artifactRoot).filter(file=>/\.(png)$/.test(file));
const visuals=widths.flatMap(width=>screens.map(screen=>{const name=`${screen}-${width}.png`,matches=shots.filter(file=>path.basename(file)===name);if(matches.length!==1)throw new Error('Missing/ambiguous master screenshot: '+name);return {name,source:matches[0],screen,viewport:{width,height:1000},layer:'LOCAL_BROWSER_FIXTURE',fullPage:screen!=='buyer-join'};}));
async function main(){
 const artifact=JSON.parse(fs.readFileSync(path.join(root,'.cache/fallback-latest-package.json')));
 if(!/^\.cache\/fallback-release-[\dTZ-]+$/.test(artifact.artifactDirectory))throw new Error('Invalid owned artifact directory');
 const packageBytes=fs.readFileSync(path.join(root,artifact.artifactDirectory,'PACKAGE.json'));
 if(JSON.stringify(JSON.parse(packageBytes))!==JSON.stringify(artifact))throw new Error('Latest static package identity changed');
 const boundary={layer:'LOCAL_STATIC_PACKAGE_BOUNDARY',acceptanceEligible:false,server:'http://127.0.0.1:4172',files:[],blocked:[],head:[]};
 for(const file of artifact.files){
  if(path.isAbsolute(file.path)||file.path.split(/[\\/]/).includes('..')||file.path!=='fallback.html'&&!file.path.startsWith('assets/'))throw new Error('Unexpected static package path');
  const bytes=fs.readFileSync(path.join(root,artifact.artifactDirectory,file.path));if(hash(bytes)!==file.sha256||hash(fs.readFileSync(path.join(root,'frontend/dist',file.path)))!==file.sha256)throw new Error('Current build/package mismatch');
  const response=await fetch(boundary.server+'/'+file.path,{signal:AbortSignal.timeout(10000)});if(response.status!==200||hash(Buffer.from(await response.arrayBuffer()))!==file.sha256)throw new Error('Served asset mismatch');
  boundary.files.push({path:file.path,status:200,sha256:file.sha256});
 }
 const head=await fetch(boundary.server+'/fallback.html',{method:'HEAD',signal:AbortSignal.timeout(10000)});if(head.status!==200||(await head.arrayBuffer()).byteLength!==0)throw new Error('HEAD boundary failed');boundary.head.push({path:'/fallback.html',status:200,bodyBytes:0});
 for(const route of ['/api/transactions','/src/App.tsx','/index.html']){const response=await fetch(boundary.server+route,{signal:AbortSignal.timeout(10000)});if(response.status!==404)throw new Error('Standalone host exposed app/API');boundary.blocked.push({path:route,status:404});}
 const post=await fetch(boundary.server+'/fallback.html',{method:'POST',signal:AbortSignal.timeout(10000)});if(post.status!==405)throw new Error('Standalone host allowed mutations');boundary.blocked.push({path:'/fallback.html',method:'POST',status:405});
 const relative='reports/evidence/checks-autosave-'+new Date().toISOString().replace(/[:.]/g,'-'),destination=path.join(root,relative);fs.mkdirSync(destination,{recursive:false});
 const write=(name,bytes)=>{const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});return {path:relative+'/'+name,sha256:hash(bytes)};};
 const checks=[...fresh,...carried].map(check=>{const {bytes,...metadata}=check,log=write(check.id+'.log',bytes);return {...metadata,log:log.path,sha256:log.sha256};});
 const boundaryFile=write('static-boundary.json',Buffer.from(JSON.stringify(boundary,null,2)+'\n'));checks.push({id:'static-package-boundary',layer:boundary.layer,result:'PASS',exitCode:0,carriedForward:false,command:'node scripts/capture_autosave_checks.cjs',summary:'Seven current-build/static assets match SHA256 over HTTP; HEAD body empty; app/API 404; POST 405',log:boundaryFile.path,sha256:boundaryFile.sha256});
 const standalone=[write('standalone/PACKAGE.json',packageBytes),...artifact.files.map(file=>write('standalone/'+file.path,fs.readFileSync(path.join(root,artifact.artifactDirectory,file.path))))];
 const visualArtifacts=visuals.map(({source,name,...metadata})=>({...metadata,...write('visuals/'+name,fs.readFileSync(source))}));
 const fallbackShot=inventory(path.join(root,'.cache/autosave-fallback-artifacts')).find(file=>path.basename(file)==='fallback-independent-local.png');if(!fallbackShot)throw new Error('Fresh artifact visual missing');visualArtifacts.push({...write('visuals/fallback-independent-local.png',fs.readFileSync(fallbackShot)),viewport:{width:1440,height:900},layer:'LOCAL_FIXTURE_BUILT_ARTIFACT'});
 const failures=[
  ['operator-duplicate-fixture-email','.cache/masters-operator-api.log','Fixture email uniqueness violation fixed with distinct emails; production constraints unchanged.'],
  ['operator-legacy-fixture-flag','.cache/masters-operator-api-final.log','Unknown cumulative fixture now has legacy buyerClaimed=true plus missing amount; an unset/false flag legitimately means no claim.'],
  ['master-selector-ambiguity','.cache/masters-browser-initial.log','Scoped heading/price locators; duplicate matching headings were test selector errors.'],
  ['badge-read-before-load','.cache/masters-browser-all.log','Wait for both seller badges before computing actual contrast; threshold unchanged.'],
  ['operator-navigation-before-list','.cache/masters-browser-all-pass.log','Scoped second click to loaded deal list; same-text portal tab could otherwise receive it.'],
  ['pricing-es2020-types','.cache/masters-validation-type-failed.log','Use array index instead of Array.at to preserve existing ES2020 compiler target.'],
  ['pricing-blur-layout-shift','.cache/masters-browser-validation.log','Reveal errors during input focus/edit instead of on blur, preventing moved checkbox click; focus first invalid field in form order.'],
  ['draft-stale-fixture-reference','.cache/draft-recovery-api-stale-fixture-failed.log','A rejected edit restores cloned records; the corruption fixture now reacquires the current record before testing drift. Production guards were retained.'],
  ['static-package-build-mismatch','.cache/masters-static-build-mismatch.log','A subsequent frontend build changed standalone chunk filenames; repackaged current dist and renewed 14 served-artifact tests instead of carrying the older build proof.'],
  ['autosave-incomplete-product-fixture','.cache/autosave-browser-incomplete-fixture-failed.log','Public product fixture omitted the rights record ID that the real DTO supplies. Added that fixture ID while keeping the stricter checkpoint schema; renewed the full browser run.'],
  ['autosave-canonical-number-timer','.cache/autosave-raw-validation-failed.log','A raw 3.0 is invalid for integer validation but Number conversion equals 3; the canonical-only effect kept an old valid save timer. Added raw form effect dependency, corrected saved-current label for invalid fields, and retained the failing regression.'],
  ['autosave-pending-input-type','.cache/autosave-build-second.log','Pending write replay uses the explicit DraftInput type; the former inferred full form parameter rejected a stored pending input.'],
 ].map(([id,source,reason])=>({id,result:'FAIL',log:write('failures/'+id+'.log',fs.readFileSync(path.join(root,source))),reason}));
 const financial=prior.historicalFinancialScope;const inherited={...financial,sourceProof:priorPath,carriedForward:true};
 for(const item of [...financial.generatedProjection.fixtures,financial.generatedProjection.deliberateBug,...financial.queuedConcurrency.fixtures,...financial.boundedGas.fixtures,financial.boundedGas.summary])if(hash(fs.readFileSync(path.join(root,item.path)))!==item.sha256)throw new Error('Prior corpus changed');
 const record={schemaVersion:1,recordedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint:hash(Buffer.from(JSON.stringify(files))),files,checks,sourceProof:priorPath,candidateFrozen:false,acceptanceEligible:false,activeDataMutated:false,liveDeploymentMutated:false,
  taskTrace:['WP21-T07','WP07-T04','WP13-T04','WP08-T08'],
  scopedCarry:{contracts:contractsScope,sdk:sdkScope,shared:sharedScope,generatedWorkerClosure:projectionScope,backendLock:unchanged('backend/package-lock.json'),backendCompilerOptions:unchanged('backend/tsconfig.json'),backendDependencyDefinitionsSha256:hash(Buffer.from(JSON.stringify({dependencies:packageJson.dependencies,devDependencies:packageJson.devDependencies}))),note:'Backend package scripts/API DTO/routes/editor and frontend changed; no full backend proof carried. Financial model/projection emitted runtime, complete contract/shared/SDK sets and locked dependency definitions remain identical; the only changed worker dependency is the journal type declaration, verified by whole-file reconstruction and byte-identical TypeScript output.'},
  typeErasureCarry:typeErasureWitness?(()=>{const {priorSource,candidateSource,compiledJavaScript,...witness}=typeErasureWitness;return {...witness,artifacts:[write('type-erasure/prior-store.ts',Buffer.from(priorSource)),write('type-erasure/candidate-store.ts',Buffer.from(candidateSource)),write('type-erasure/store-runtime.js',Buffer.from(compiledJavaScript))]};})():null,
  compilerInputs:{...prior.compilerInputs,sourceProof:priorPath,initializedRuntimeTestFresh:false,carriedForward:true,cleanCheckoutVerified:false},historicalFinancialScope:inherited,
  standalone:{testedPackage:artifact.artifactDirectory+'/PACKAGE.json',archivedEntry:relative+'/standalone/fallback.html',files:standalone,dependencies:artifact.dependencies,unsupported:artifact.unsupported},visualArtifacts,interruptedRuns:failures,
  openGates:[...new Set(prior.openGates.filter(gate=>!gate.startsWith('Four master screens')&&!gate.startsWith('Seller autosave/resume')&&!gate.startsWith('Manual draft save/resume')).concat(['Four masters have local 7-width evidence; full states/VI–EN/manual zoom/accessibility/performance/CI remain open','Autosave/CAS/exact lost-ACK replay/explicit conflict rebase have local fixture proof; invalid partial fields are tab-only, full English/cross-device partial sync/live remain open','Native Browser manual connection became unavailable; automated local Chrome render/keyboard evidence is scoped, not full manual acceptance']))],
  runtime:{node:process.version},captureScript:{path:'scripts/capture_autosave_checks.cjs',sha256:hash(fs.readFileSync(__filename)),packet:'draft-autosave-cas-exact-write-replay-conflict-recovery'}};
 write('CHECKS.json',Buffer.from(JSON.stringify(record,null,2)+'\n'));console.log(JSON.stringify({report:relative+'/CHECKS.json',sourceFingerprint:record.sourceFingerprint,fileCount:files.length,checks:checks.length,visuals:visualArtifacts.length,browserCases:84,acceptanceEligible:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
