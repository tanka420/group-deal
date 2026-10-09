const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {scanText}=require('./scan_candidate_secrets.cjs');
const root=path.resolve(__dirname,'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(bytes(p).toString().replace(/^\uFEFF/,''));
function verify(f){const b=bytes(f.path);if(sha(b)!==f.sha256||f.byteLength!==undefined&&b.length!==f.byteLength)throw Error('Reference changed');}
function source(){
 return [...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString().split('\0').filter(Boolean))]
 .filter(p=>!/^reports\/(?:evidence|archive)\//.test(p)&&!/(?:^|\/)\.env(?:\.|$)/.test(p)&&!/^backend\/data\//.test(p)).sort()
 .filter(p=>fs.existsSync(path.join(root,p))&&fs.statSync(path.join(root,p)).isFile()).map(p=>({path:p,sha256:sha(bytes(p))}));
}
function delta(a,b){const x=new Map(a.map(f=>[f.path,f.sha256])),y=new Map(b.map(f=>[f.path,f.sha256]));return [...new Set([...x.keys(),...y.keys()])].sort().filter(p=>x.get(p)!==y.get(p)).map(p=>({path:p,beforeSha256:x.get(p)||null,afterSha256:y.get(p)||null}));}
function generated(directory,filter){const out=[];function walk(d){for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())walk(p);else if(e.isFile()&&filter(p))out.push({path:p,sha256:sha(bytes(p)),byteLength:bytes(p).length});}}walk(directory);return out.sort((a,b)=>a.path.localeCompare(b.path));}
function preserved(){
 const originalData=json('.cache/wp03-sessions-active-data-metadata.json');for(const f of originalData)verify({path:'backend/data/'+f.Name,sha256:f.SHA256.toLowerCase(),byteLength:f.Bytes});
 const prior=json('reports/evidence/RESTORED_WORK_CHECKS_LATEST.json');verify(prior);const previous=json(prior.path);
 const refs=[...json('.cache/ops-preserved-references.json'),previous.files.find(f=>f.path==='shared/contracts.json')];for(const f of refs)verify(f);
 return{originalData,prior,previous,refs};
}
function browser(logPath){const log=bytes(logPath).toString(),match=log.match(/Owned browser artifacts: \.cache\/browser-artifacts-([^\s]+)/);if(!match)throw Error('Browser reference absent');const reportPath='.cache/browser-run-'+match[1]+'.json';return{logPath,log,reportPath,report:json(reportPath)};}
function main(){
 if(process.argv.length!==2)throw Error('No overrides');
 const pipelinePath='.cache/local-pipeline-2026-10-05T10-54-55-985Z.json',pipeline=json(pipelinePath),logPath='.cache/legacy-operator-pipeline-verified.log',log=bytes(logPath).toString();
 const files=source(),fingerprint=sha(Buffer.from(JSON.stringify(files))),postCheckDelta=delta(pipeline.sourceFiles,files),p=preserved();
 if(pipeline.result!=='PASS'||pipeline.acceptanceEligible!==false||pipeline.completeScope!==false||pipeline.sourceFingerprint!==sha(Buffer.from(JSON.stringify(pipeline.sourceFiles)))||JSON.stringify(pipeline.steps.map(s=>s.id))!==JSON.stringify(['backend-build','operator-legacy','operator-legacy-types','frontend-build','secret-scan'])||pipeline.steps.some(s=>s.result!=='PASS'||s.exitCode!==0||s.signal))throw Error('Scoped terminal mismatch');
 const allowed=['reports/KE_HOACH_HOAN_TAT_DU_AN.md','reports/RUNBOOK_VAN_HAN_ARC.md','scripts/capture_operator_legacy_checks.cjs','frontend/e2e/operator_legacy_review.spec.ts'];
 if(postCheckDelta.some(d=>!allowed.includes(d.path)||!d.afterSha256)||![['12','operator legacy review'],['13','legacy data review'],['19','recovery inspection'],['14','restored work barrier']].every(([n,label])=>log.includes('PASS '+n+' '+label+' cases'))||/\b(?:FAIL|FAILED)\b|error TS|error during build/.test(log)||!log.includes('built in'))throw Error('Checked source/count mismatch');
 const scanPath='.cache/secret-scan-2026-10-05T10-55-30-616Z.json',captureScanPath='.cache/legacy-operator-capture-scan.json';
 for(const file of [scanPath,captureScanPath]){const s=json(file);if(s.result!=='PASS'||!s.redacted||s.findings.length)throw Error('Secret scan mismatch');}
 const toolingPath='.cache/legacy-operator-tooling.log';if(!bytes(toolingPath).toString().includes('PASS LOCAL_TOOLING:'))throw Error('Tooling missing');
 const nativeReference={path:'reports/evidence/legacy-data-reviews/2026-10-05T10-53-42-158Z-b8625335-5cb3-4f79-bef4-81b56640bf80.json',sha256:'741e8597e2ffb6986527f882f4401b9d8f66c608435dc4a320e8faf7715f515a',byteLength:8287};verify(nativeReference);
 const native=json(nativeReference.path),terminal=json('.cache/legacy-operator-existing-terminal.json');for(const f of native.toolInputs)verify(f);
 if(terminal.exitCode!==0||terminal.signal!==null||terminal.errorCode||native.status!=='LEGACY_DATA_REVIEW_ACTION_REQUIRED'||native.inputScope!=='EXISTING_DATA'||!native.originalFilesPreserved||native.sourceAccess!=='FILES_READ_ONLY_NO_SQLITE_CONNECTION'||native.financialAccountingVerified||native.authCutoverAllowed||native.productAccessAutoEnabled||native.workersStarted||native.promoted||native.acceptanceEligible||native.operatorMetadataProjection?.verifiedAgainstFullCopiedState!==true||native.operatorMetadataProjection.privateCiphertextAndPayloadFieldsReturned!==false||native.operatorMetadataProjection.principalAuthenticationVerified!==false||native.review.legacyCounts.orders!==1||native.review.legacyCounts.campaigns!==1||native.review.restoredExternalWork.inventory.webhooks.counts.QUEUED!==2||native.review.journal.metadataUnverified!==6)throw Error('Native scope mismatch');
 const b=browser('.cache/legacy-operator-browser-captured.log');
 if(b.report.result!=='PASS'||b.report.exitCode!==0||b.report.signal!==null||!b.report.ownedServerStopped||!b.report.ownedRunnerStopped||b.report.mode!=='dev'||JSON.stringify(b.report.testArguments)!==JSON.stringify(['operator_legacy_review.spec.ts','--workers=1'])||!b.log.includes('9 passed (21.0s)'))throw Error('Browser terminal mismatch');
 const browserSource=files.find(f=>f.path==='frontend/e2e/operator_legacy_review.spec.ts');if(!browserSource||!bytes(browserSource.path).toString().includes('expect.poll(()=>finishedOld)')||!bytes(browserSource.path).toString().includes('window.scrollTo(0,0)'))throw Error('Final browser fixture absent');
 const negativeLogPath='.cache/legacy-operator-inspection-input-negative.log',negativeTerminal=json('.cache/legacy-operator-inspection-input-negative-terminal.json');
 if(negativeTerminal.exitCode!==1||negativeTerminal.signal!==null||!bytes(negativeLogPath).toString().includes('FAIL recovery inspection regression; private data withheld'))throw Error('Negative missing');
 const diagnostics=[
  {name:'strict-mode-read-count-and-incomplete-auth-hook',log:'.cache/legacy-operator-browser-first.log',passes:7,failures:2},
  {name:'language-menu-not-opened',log:'.cache/legacy-operator-browser-affected.log',passes:1,failures:1},
  {name:'account-workspace-remounted-to-default-tab',log:'.cache/legacy-operator-browser-verified.log',passes:8,failures:1}
 ];
 for(const d of diagnostics){const x=browser(d.log);if(x.report.result!=='FAIL'||x.report.exitCode!==1||x.report.signal!==null||!x.report.ownedServerStopped||!x.report.ownedRunnerStopped||!x.log.includes(d.passes+' passed')||!x.log.includes(d.failures+' failed'))throw Error('Diagnostic terminal mismatch');d.reportPath=x.reportPath;}
 const before=json('.cache/legacy-operator-before-reference.json'),beforeInputs=before.files.map(f=>({path:f,copy:before.directory+'/'+f,sha256:sha(bytes(before.directory+'/'+f))}));
 const emittedFiles=generated('backend/dist',f=>f.endsWith('.js')),frontendFiles=generated('frontend/dist',()=>true);
 const screenshots=generated(b.report.outputDirectory,f=>f.endsWith('.png'));if(screenshots.length!==2||!screenshots.some(f=>f.path.endsWith('legacy-review-vi-375.png'))||!screenshots.some(f=>f.path.endsWith('legacy-review-en-375.png')))throw Error('Screenshot scope mismatch');
 const directory='reports/evidence/checks-operator-legacy-'+new Date().toISOString().replace(/[:.]/g,'-'),pending=[];
 function copy(name,file){const value=bytes(file),target=directory+'/'+name;if(!file.endsWith('.png')&&scanText(value.toString(),file).length)throw Error('Evidence redaction rejected');pending.push({target,value});return{path:target,sha256:sha(value),byteLength:value.length};}
 const record={schemaVersion:1,recordedAt:new Date().toISOString(),layer:'LOCAL_AUTHENTICATED_METADATA_API_UI_AND_NATIVE_COPIED_DATA_REVIEW',result:'SCOPED_PASS_OPERATOR_LEGACY_REVIEW_ACTION_REQUIRED',acceptanceEligible:false,candidateFrozen:false,sourceCommit:pipeline.sourceCommit,checkedSourceFingerprint:pipeline.sourceFingerprint,sourceFingerprint:fingerprint,files,postCheckDelta,
  emittedRuntimeFiles:emittedFiles,emittedRuntimeFingerprint:sha(Buffer.from(JSON.stringify(emittedFiles))),frontendArtifactFiles:frontendFiles,frontendArtifactFingerprint:sha(Buffer.from(JSON.stringify(frontendFiles))),
  trace:['WP25-T16','WP09-T12','WP22-T09','WP27-T45','F17','F23','F32','A04','A09','A12','A14','UI04','N98'],
  checks:{pipeline:copy('pipeline.json',pipelinePath),pipelineLog:copy('pipeline.log',logPath),secretScan:copy('secret-scan.json',scanPath),captureScan:copy('capture-scan.json',captureScanPath),tooling:copy('tooling.log',toolingPath),newCases:12,legacyReviewCases:13,inspectionCases:19,restoredWorkCases:14,regressionGroups:['auth_sessions','session_logout_regression'],frontendBuild:true,strictTypes:true},
  browser:{reference:copy('browser/run.json',b.reportPath),log:copy('browser/run.log',b.logPath),testFile:browserSource,fullCases:9,viAndEn:true,responsiveWidths:[320,375,768,1440],screenshotViewportWidth:375,ownedHandlesStopped:true,fixturesAndMockApi:true,actualPrincipalOrProvider:false,screenshots:screenshots.map((f,i)=>copy('browser/review-'+i+'.png',f.path))},
  nativeCommand:{reference:nativeReference,terminal,terminalEvidence:copy('native/terminal.json','.cache/legacy-operator-existing-terminal.json'),log:copy('native/review.log','.cache/legacy-operator-existing.log'),status:native.status,metadataFactsMatchFullCopiedState:true,originalFilesPreserved:true},
  genuineNegativeEvidence:{code:'N98',reference:copy('negative/inspection-tool-set.log',negativeLogPath),terminal:copy('negative/terminal.json','.cache/legacy-operator-inspection-input-negative-terminal.json'),oldValidatorInput:beforeInputs.find(f=>f.path==='backend/src/services/recoveryInspection.ts'),actualInspectionBootAttempt:false},
  diagnosticEvidence:diagnostics.map(d=>({name:d.name,passes:d.passes,failures:d.failures,log:copy('diagnostics/'+d.name+'.log',d.log),report:copy('diagnostics/'+d.name+'.json',d.reportPath)})),
  beforeInputs,originalData:p.originalData,preservedReferences:p.refs,historicalRestoredWork:{reference:p.prior,sourceFingerprint:p.previous.sourceFingerprint,sourceDeltaToCurrent:delta(p.previous.files,files),actualHistoricalHolds:94,freshFinancialReplay:false},
  scope:{metadataApiCommittedSessionRole:true,privateDependencyFieldsNotReturned:true,pendingWritesNotFlushed:true,actorSessionDeploymentCursorBinding:true,changedReview409:true,metadataFullCopiedStateComparison:true,actualOriginalSqliteOpened:false,actualNormalApiRollout:false,actualLegacyPrincipalOrArchiveAccess:false,rightsReassigned:false,actualJobsSentOrReplayed:false,financialAccountingVerified:false,productAccessAutoEnabled:false,authCutover:false,actualProvider:false,actualServiceRPOOrRTO:false,wholeCandidateAcceptance:false},
  openGates:['Retained archive access with verified principal ACL/account provenance; restored subscription and reviewed release policy','Fresh final-source shadow/projection/admission/canonical sync; actual recovered service/resource/principal/provider/backup/receiver/RPO/RTO','V2 fixed candidate/cold CI/new G5/independent G6; Mainnet deferred']};
 const value=Buffer.from(JSON.stringify(record,null,2)+'\n'),ref={path:directory+'/CHECKS.json',sha256:sha(value),byteLength:value.length};pending.push({target:ref.path,value});
 if(sha(Buffer.from(JSON.stringify(source())))!==fingerprint)throw Error('Source changed');for(const f of [...emittedFiles,...frontendFiles])verify(f);preserved();for(const f of native.toolInputs)verify(f);
 for(const f of pending){fs.mkdirSync(path.dirname(path.join(root,f.target)),{recursive:true});fs.writeFileSync(path.join(root,f.target),f.value,{flag:'wx'});}for(const f of pending)if(sha(bytes(f.target))!==sha(f.value))throw Error('Saved evidence changed');
 const pointer=path.join(root,'reports/evidence/OPERATOR_LEGACY_REVIEW_CHECKS_LATEST.json'),temporary=pointer+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify({schemaVersion:1,...ref,result:record.result,sourceFingerprint:fingerprint,checkedSourceFingerprint:pipeline.sourceFingerprint,acceptanceEligible:false},null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,pointer);
 console.log(JSON.stringify({result:record.result,...ref,sourceFingerprint:fingerprint,checkedSourceFingerprint:pipeline.sourceFingerprint,acceptanceEligible:false}));
}
try{main();}catch{console.error('Operator legacy capture rejected; private values withheld');process.exitCode=1;}
