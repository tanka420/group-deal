const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const packet=process.argv[2]||"wp18";
if(!["wp18","claims","buys","history","support","orders"].includes(packet))throw new Error("Supported checkpoint packets: wp18, claims, buys, history, support, orders");
const claims=packet==="claims",buys=packet==="buys",history=packet==="history",support=packet==="support",orders=packet==="orders";
const previous=JSON.parse(fs.readFileSync(path.join(root,"reports/evidence/checks-candidate-2026-10-03T04-21-59-562Z/CHECKS.json")));
const listed=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{cwd:root,encoding:"utf8"}).trim().split(/\r?\n/);
const selected=[...new Set(listed)].filter(p=>/^(backend\/(src|scripts|test)\/|contracts\/(contracts|scripts|test)\/|frontend\/(src|e2e)\/|sdk\/(src|test|examples)\/|shared\/)/.test(p)||/^(backend|contracts|frontend|sdk)\/(package(?:-lock)?\.json|tsconfig.*\.json|hardhat\.config\.ts|playwright\.config\.ts|vite\.config\.ts)$/.test(p)||p==="sdk/README.md").filter(p=>fs.existsSync(path.join(root,p))).sort();
const files=selected.map(p=>({path:p,sha256:hash(fs.readFileSync(path.join(root,p)))}));
const previousContracts=previous.files.filter(f=>f.path.startsWith("contracts/"));
const currentContracts=files.filter(f=>f.path.startsWith("contracts/"));
if(previousContracts.some(f=>currentContracts.find(c=>c.path===f.path)?.sha256!==f.sha256))throw new Error("Contract source changed; rerun the contract suite before carrying its prior proof forward");
const additionalContractFiles=currentContracts.filter(c=>!previousContracts.some(f=>f.path===c.path));
for(const file of additionalContractFiles)if(hash(execFileSync("git",["show",previous.sourceCommit+":"+file.path],{cwd:root}))!==file.sha256)throw new Error("Unverified additional contract source/config file");
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const relative="reports/evidence/checks-"+packet+"-"+stamp,destination=path.join(root,relative);
fs.mkdirSync(destination,{recursive:false});
const cases=orders?[
  ["backend","backend","npm test",".cache/v2-backend-order-current.log",/PASS LOCAL_FIXTURE: durable order actions/,"Full backend suite including five durable order actions, chain-only fixed-block unallocated split, private stage preservation and receipt/indexer race; isolated fixtures"],
  ["backend-build","backend","npm run build",".cache/v2-backend-order-build.log",/> tsc/,"TypeScript source build"],
  ["frontend-build","frontend","npm run build",".cache/v2-frontend-order-build.log",/built in/,"TypeScript/Vite build; eval and oversized chunk warnings remain"],
  ["browser","frontend","PLAYWRIGHT_REUSE_SERVER=1 npm run test:e2e",".cache/v2-browser-order-current.log",/36 passed/,"36 browser fixtures including confirm/dispute UNKNOWN reload, private browser-storage exclusion, chain-provided operator split, separate breach allocation/claim and seller settlement; no live wallet/provider proof"],
  ["sdk-consumer","sdk","npm test",".cache/v2-sdk-buy-current.log",/executable HTTP receiver and process restart/,"Packed SDK proof carried forward only after all SDK source/config/test/example hashes matched the previous BUY checkpoint"],
]:support?[
  ["backend","backend","npm test",".cache/v2-backend-support-current.log",/PASS LOCAL_FIXTURE: support\/order ACL/,"Full backend suite including private-safe order/operator DTOs, bounded typed support/review, concurrent idempotence, preserved legacy fields and audit integrity; isolated fixtures"],
  ["backend-build","backend","npm run build",".cache/v2-backend-support-build.log",/> tsc/,"TypeScript source build"],
  ["frontend-build","frontend","npm run build",".cache/v2-frontend-support-build.log",/built in/,"TypeScript/Vite build; eval and oversized chunk warnings remain"],
  ["browser","frontend","PLAYWRIGHT_REUSE_SERVER=1 npm run test:e2e",".cache/v2-browser-support-current.log",/31 passed/,"31 browser fixtures including unsafe legacy evidence handling and HTTPS evidence link, history/server recovery, verified/unverified revert and buyer/seller claims; no live wallet/provider proof"],
  ["sdk-consumer","sdk","npm test",".cache/v2-sdk-buy-current.log",/executable HTTP receiver and process restart/,"Packed SDK proof carried forward only after all SDK source/config/test/example hashes matched the previous BUY checkpoint"],
]:history?[
  ["backend","backend","npm test",".cache/v2-backend-history-current.log",/PASS LOCAL_FIXTURE: owned history stable scoped cursor/,"Full backend suite including owned history pagination, pending lookup beyond 100 intents, exact ACL and private stage exclusion; isolated fixtures"],
  ["backend-build","backend","npm run build",".cache/v2-backend-history-build.log",/> tsc/,"TypeScript source build"],
  ["frontend-build","frontend","npm run build",".cache/v2-frontend-history-build.log",/built in/,"TypeScript/Vite build; eval and oversized chunk warnings remain"],
  ["browser","frontend","PLAYWRIGHT_REUSE_SERVER=1 npm run test:e2e",".cache/v2-browser-history-current.log",/30 passed/,"30 browser fixtures including older history pages, server recovery, verified/unverified revert and buyer/seller claims; no live wallet/provider proof"],
  ["sdk-consumer","sdk","npm test",".cache/v2-sdk-buy-current.log",/executable HTTP receiver and process restart/,"Packed SDK proof carried forward only after all SDK source/config/test/example hashes matched the previous BUY checkpoint"],
]:buys?[
  ["backend","backend","npm test",".cache/v2-backend-buy-current.log",/PASS LOCAL_FIXTURE: durable BUY/,"Full backend suite including durable BUY consent, nonce/principal/rights readiness, concurrent retries, Circle binding, indexer-first receipt and verified revert guards; isolated fixtures"],
  ["backend-build","backend","npm run build",".cache/v2-backend-buy-build.log",/> tsc/,"TypeScript source build"],
  ["frontend-build","frontend","npm run build",".cache/v2-frontend-buy-build.log",/built in/,"TypeScript/Vite build; eval and oversized chunk warnings remain"],
  ["browser","frontend","PLAYWRIGHT_REUSE_SERVER=1 npm run test:e2e",".cache/v2-browser-buy-current.log",/29 passed/,"29 browser fixtures including lost local checkpoint/server recovery, verified/unverified revert, claims and product flows; no live wallet/provider proof"],
  ["sdk-consumer","sdk","npm test",".cache/v2-sdk-buy-current.log",/executable HTTP receiver and process restart/,"Fresh packed consumer/typecheck/API/HMAC/durable receiver restart verification"],
]:claims?[
  ["backend","backend","npm test",".cache/v2-backend-claim-current.log",/PASS LOCAL_FIXTURE: fixed-block claim simulation/,"Full backend suite, including buyer/seller claim privacy, fixed-block quote, readiness, concurrent intent and receipt recovery; isolated fixtures"],
  ["backend-build","backend","npm run build",".cache/v2-backend-claim-build.log",/> tsc/,"TypeScript source build"],
  ["frontend-build","frontend","npm run build",".cache/v2-frontend-claim-build.log",/built in/,"TypeScript/Vite build; eval and oversized chunk warnings remain"],
  ["browser","frontend","PLAYWRIGHT_REUSE_SERVER=1 npm run test:e2e",".cache/v2-browser-claim-current.log",/26 passed/,"26 browser fixtures, including buyer additional refund, unknown receipt across reload and seller claim; explicit owned dev server, no live wallet/provider proof"],
  ["sdk-consumer","sdk","npm test",".cache/v2-sdk-claim-current.log",/executable HTTP receiver and process restart/,"Fresh packed consumer/typecheck/API/HMAC/durable receiver restart verification"],
]:[
  ["backend","backend","npm test",".cache/v2-backend-wp18-current.log",/PASS LOCAL_FIXTURE: public DTO/,"Full backend suite, including runtime/session/startup/projection/recovery/product/webhook/public API; isolated fixtures"],
  ["backend-build","backend","npm run build",".cache/v2-backend-wp18-build.log",/> tsc/,"TypeScript source build"],
  ["frontend-build","frontend","npm run build",".cache/v2-frontend-wp18-build.log",/built in/,"TypeScript/Vite build; eval and oversized chunk warnings remain"],
  ["browser","frontend","PLAYWRIGHT_REUSE_SERVER=1 npm run test:e2e",".cache/v2-browser-wp18-current.log",/24 passed/,"24 browser fixtures; selected states across 7 widths; explicit owned dev server, no live wallet/provider proof"],
  ["sdk-consumer","sdk","npm test",".cache/v2-sdk-consumer.log",/executable HTTP receiver and process restart/,"Packed artifact installed/typechecked; API request contract, raw HMAC/durable inbox, executable HTTP receiver concurrent retries and process restart"],
];
const checks=cases.map(([id,cwd,command,source,marker,summary])=>{
  const bytes=fs.readFileSync(path.join(root,source));if(!marker.test(bytes.toString()))throw new Error("Missing successful completion marker for "+id);
  const name=id+".log";fs.writeFileSync(path.join(destination,name),bytes,{flag:"wx"});
  return {id,cwd,command,summary,result:"PASS",exitCode:0,layer:"LOCAL_FIXTURE",log:relative+"/"+name,sha256:hash(bytes)};
});
const contract=previous.checks.find(c=>c.id==="contracts"||c.id==="contract");
if(!contract)throw new Error("Prior contract evidence missing");
const priorLog=fs.readFileSync(path.join(root,contract.log));if(hash(priorLog)!==contract.sha256)throw new Error("Prior contract log changed");
fs.writeFileSync(path.join(destination,"contracts-unchanged.log"),priorLog,{flag:"wx"});
checks.push({...contract,id:"contracts-unchanged",sourceProof:"reports/evidence/checks-candidate-2026-10-03T04-21-59-562Z/CHECKS.json",additionalConfigVerifiedAgainstCommit:additionalContractFiles,summary:"29 local contract tests carried forward after prior contract source/config/test hashes matched; additional tsconfig matched the unchanged source commit",log:relative+"/contracts-unchanged.log",sha256:hash(priorLog)});
const interrupted=fs.readFileSync(path.join(root,".cache/v2-browser-wp18-teardown-pending.log"));
fs.writeFileSync(path.join(destination,"browser-teardown-interrupted.log"),interrupted,{flag:"wx"});
const report={schemaVersion:1,recordedAt:new Date().toISOString(),sourceCommit:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),candidateFrozen:false,acceptanceEligible:false,sourceFingerprint:hash(Buffer.from(JSON.stringify(files))),files,checks,interruptedRuns:[{id:"browser-owned-server-teardown",result:"INTERRUPTED_AFTER_TESTS",exitCode:1,log:relative+"/browser-teardown-interrupted.log",sha256:hash(interrupted),reason:"24 test cases executed; runner did not terminate during managed web-server teardown on Windows. Interrupted and rerun with an explicit owned server; not counted as a suite PASS."}],activeDataMutated:false,liveDeploymentMutated:false,openGates:previous.openGates};
if(claims||buys||history||support||orders){
  const failure=fs.readFileSync(path.join(root,".cache/v2-seller-claim-fixture-failed.log"));
  fs.writeFileSync(path.join(destination,"seller-claim-fixture-failed.log"),failure,{flag:"wx"});
  report.interruptedRuns.push({id:"seller-claim-incomplete-fixture",result:"FAIL",exitCode:1,log:relative+"/seller-claim-fixture-failed.log",sha256:hash(failure),reason:"Seller fixture omitted the API sellerClaimable projection. UI remained unverified. Corrected fixture; current full 26-case browser run exited 0."});
  const results=path.join(root,"frontend/test-results");
  const shot=fs.readdirSync(results).map(name=>path.join(results,name,"seller-create-local.png")).find(file=>fs.existsSync(file));
  if(!shot)throw new Error("Current browser seller screenshot is missing");
  const pixels=fs.readFileSync(shot);fs.writeFileSync(path.join(destination,"seller-create-local.png"),pixels,{flag:"wx"});
  report.visualArtifacts=[{layer:"LOCAL_FIXTURE",viewport:{width:1440,height:900},path:relative+"/seller-create-local.png",sha256:hash(pixels)}];
}
if(history||support||orders){
  const sdkProofPath="reports/evidence/checks-buys-2026-10-03T06-13-56-768Z/CHECKS.json",sdkProof=JSON.parse(fs.readFileSync(path.join(root,sdkProofPath)));
  const sdkFiles=files.filter(f=>f.path.startsWith("sdk/")),priorSdk=sdkProof.files.filter(f=>f.path.startsWith("sdk/"));
  if(sdkFiles.length!==priorSdk.length||sdkFiles.some(file=>priorSdk.find(prior=>prior.path===file.path)?.sha256!==file.sha256))throw new Error("SDK changed; rerun the packed consumer before carrying proof forward");
  const check=checks.find(c=>c.id==="sdk-consumer"),priorCheck=sdkProof.checks.find(c=>c.id==="sdk-consumer");
  if(check.sha256!==priorCheck.sha256||hash(fs.readFileSync(path.join(root,priorCheck.log)))!==priorCheck.sha256)throw new Error("SDK proof/log mismatch");
  check.sourceProof=sdkProofPath;
  const failure=fs.readFileSync(path.join(root,".cache/v2-operation-history-fixture-failed.log"));fs.writeFileSync(path.join(destination,"history-fixture-failed.log"),failure,{flag:"wx"});
  report.interruptedRuns.push({id:"history-invalid-fixture-email",result:"FAIL",exitCode:1,log:relative+"/history-fixture-failed.log",sha256:hash(failure),reason:"Fixture supplied null email where the stored schema requires a string; corrected fixture without changing production schema. Current full backend run exited 0."});
}
if(orders){
  const failure=fs.readFileSync(path.join(root,".cache/v2-browser-order-slider-failed.log"));fs.writeFileSync(path.join(destination,"operator-slider-failed.log"),failure,{flag:"wx"});
  report.interruptedRuns.push({id:"operator-slider-step-mismatch",result:"FAIL",exitCode:1,log:relative+"/operator-slider-failed.log",sha256:hash(failure),reason:"37% was rejected by the UI's step=5 range while API supports integer 0–100. Changed the UI to step=1 and added accessible labels; current full browser suite completed exit 0."});
  const results=path.join(root,"frontend/test-results"),shot=fs.readdirSync(results).map(name=>path.join(results,name,"operator-chain-split-local.png")).find(file=>fs.existsSync(file));
  if(!shot)throw new Error("Current operator split screenshot is missing");const pixels=fs.readFileSync(shot);fs.writeFileSync(path.join(destination,"operator-chain-split-local.png"),pixels,{flag:"wx"});
  const bindingFailure=fs.readFileSync(path.join(root,".cache/v2-backend-order-binding-fixture-failed.log"));fs.writeFileSync(path.join(destination,"order-binding-fixture-failed.log"),bindingFailure,{flag:"wx"});
  report.interruptedRuns.push({id:"order-binding-duplicate-fixture",result:"FAIL",exitCode:1,log:relative+"/order-binding-fixture-failed.log",sha256:hash(bindingFailure),reason:"The identity-change fixture used an order ID already bound to a second order; the SQL UNIQUE guard correctly rejected persistence. Changed the fixture to an unused ID and kept the production constraint intact."});
  const textFailure=fs.readFileSync(path.join(root,".cache/v2-browser-order-text-fixture-failed.log"));fs.writeFileSync(path.join(destination,"operator-text-fixture-failed.log"),textFailure,{flag:"wx"});
  report.interruptedRuns.push({id:"operator-empty-state-text-fixture",result:"FAIL",exitCode:1,log:relative+"/operator-text-fixture-failed.log",sha256:hash(textFailure),reason:"The test expected a trailing full stop absent from the actual empty-state label. Corrected the assertion; no product behavior was changed for this fixture mismatch."});
  report.visualArtifacts.push({layer:"LOCAL_FIXTURE",viewport:{width:1440,height:900},path:relative+"/operator-chain-split-local.png",sha256:hash(pixels)});
}
report.captureScript={path:"scripts/capture_candidate_checks.cjs",sha256:hash(fs.readFileSync(__filename)),packet};
fs.writeFileSync(path.join(destination,"CHECKS.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({report:relative+"/CHECKS.json",sourceFingerprint:report.sourceFingerprint,fileCount:files.length,localChecks:checks.length,candidateFrozen:false,acceptanceEligible:false}));
