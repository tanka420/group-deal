const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const bytes=name=>fs.readFileSync(path.join(root,name)),json=name=>JSON.parse(bytes(name));
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const match=/^--([a-z-]+)=(.+)$/.exec(value);if(!match)throw Error('Invalid argument');return [match[1],match[2]];}));
const required=name=>{if(!args[name])throw Error('Missing '+name);return args[name];};
const bindingPath='.cache/wp24-wallet-recovery-inputs.json',buildPath='.cache/wp24-wallet-recovery-build.json';
function source(){return [...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString().split('\0').filter(Boolean))].filter(f=>!/^reports\/(?:evidence|archive)\//.test(f)&&!/(?:^|\/)\.env(?:\.|$)/.test(f)&&!/^backend\/data\//.test(f)).sort().filter(f=>fs.existsSync(path.join(root,f))&&fs.statSync(path.join(root,f)).isFile()).map(f=>({path:f,sha256:sha(bytes(f))}));}
function inventory(directory){return fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?inventory(directory+'/'+entry.name):[{path:directory+'/'+entry.name,sha256:sha(bytes(directory+'/'+entry.name)),bytes:bytes(directory+'/'+entry.name).length}]).sort((a,b)=>a.path.localeCompare(b.path));}
const free=port=>new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
function browser(file,mode,configured){
 const log=bytes(file).toString(),output=/Owned browser artifacts: (.+)/.exec(log)?.[1]?.trim();if(!output||/\b\d+ failed\b/.test(log))throw Error('Browser log failed');
 const report='.cache/browser-run-'+output.replace('.cache/browser-artifacts-','')+'.json',run=json(report);
 if(run.result!=='PASS'||run.mode!==mode||run.configuredReownFixture!==configured||!run.ownedServerStopped||!run.ownedRunnerStopped)throw Error('Owned browser/profile mismatch');
 const titles=[...log.matchAll(/^\s+ok\s+\d+ \[chromium\] › (.+?) \([\d.]+(?:ms|s)\)$/gm)].map(m=>m[1]),skipped=[...log.matchAll(/^\s+-\s+\d+ \[chromium\] › (.+)$/gm)].map(m=>m[1]);
 if(configured&&titles.filter(t=>t.includes('reown_lazy.spec.ts')).length!==13)throw Error('Reown coverage incomplete');
 if((!configured||mode==='preview')&&titles.filter(t=>t.includes('circle_lazy.spec.ts')).length!==(mode==='dev'?6:5))throw Error('Circle coverage incomplete');
 if(!configured&&!titles.some(t=>t.includes('sign-in vi seven widths')))throw Error('Default auth coverage incomplete');
 if(mode==='dev'&&skipped.length||mode==='preview'&&(skipped.length!==1||!skipped[0].includes('provider remount shares the pending device request')))throw Error('Unexpected skip');
 return {file,report,run,titles,skipped};
}
async function main(){
 const files=source(),fingerprint=sha(Buffer.from(JSON.stringify(files)));
 if(args.mode==='prepare'){fs.writeFileSync(path.join(root,bindingPath),JSON.stringify({startedAtMs:Date.now(),sourceFingerprint:fingerprint,files},null,2)+'\n');console.log(JSON.stringify({result:'PREPARED',sourceFingerprint:fingerprint,sourceFiles:files.length}));return;}
 const binding=json(bindingPath);if(binding.sourceFingerprint!==fingerprint||JSON.stringify(binding.files)!==JSON.stringify(files))throw Error('Source changed since binding');
 if(args.mode==='build'){
  const pipeline=json(required('pipeline'));if(pipeline.result!=='PASS'||!pipeline.configuredReownFixture||pipeline.sourceFingerprint!==fingerprint)throw Error('Build source/profile mismatch');
  const directory='.cache/wallet-recovery-emits-'+crypto.randomUUID();fs.cpSync(path.join(root,'frontend/dist'),path.join(root,directory),{recursive:true,errorOnExist:true,force:false});
  fs.writeFileSync(path.join(root,buildPath),JSON.stringify({directory,sourceFingerprint:fingerprint,pipeline:args.pipeline,pipelineLog:required('pipeline-log'),graph:required('graph'),files:inventory(directory)},null,2)+'\n');console.log(JSON.stringify({result:'BUILD_RETAINED',files:inventory(directory).length}));return;
 }
 if(args.mode!=='capture')throw Error('Invalid mode');
 const build=json(buildPath),pipeline=json(build.pipeline),graph=json(build.graph),unitLog=bytes(build.pipelineLog).toString();
 if(build.sourceFingerprint!==fingerprint||pipeline.sourceFingerprint!==fingerprint||JSON.stringify(pipeline.sourceFiles)!==JSON.stringify(files)||pipeline.result!=='PASS'||!pipeline.configuredReownFixture||JSON.stringify(pipeline.steps.map(s=>s.id))!==JSON.stringify(['wallet-runtime','frontend-build'])||pipeline.steps.some(s=>s.result!=='PASS'||s.exitCode!==0)||pipeline.steps[1].nodeEnvironment!=='production'||!unitLog.includes('pass 13'))throw Error('Production pipeline proof missing');
 if(JSON.stringify(inventory('frontend/dist').map(f=>({...f,path:f.path.replace('frontend/dist',build.directory)})))!==JSON.stringify(build.files)||JSON.stringify(inventory(build.directory))!==JSON.stringify(build.files))throw Error('Tested build bytes changed');
 const emitted=new Map(build.files.map(f=>[f.path.slice(build.directory.length+1),f.sha256]));
 if(graph.chunks.some(c=>emitted.get(c.file)!==c.sha256||c.evalLikeToken)||graph.chunks.flatMap(c=>c.modules).some(m=>/\.development\.js$|node_modules\/(?:vm-browserify|crypto-browserify|jsonwebtoken|browserify-sign)\//.test(m)))throw Error('Production graph rejected');
 const runs=[browser(required('dev-default'),'dev',false),browser(required('dev-configured'),'dev',true),browser(required('built-configured'),'preview',true)];
 for(const run of runs)if(!run.run.startedAt||Date.parse(run.run.startedAt)<binding.startedAtMs||!run.run.finishedAt||!await free(run.run.port))throw Error('Browser source/time/port mismatch');
 const active=json('.cache/wp03-sessions-active-data-metadata.json');if(active.length!==5||active.some(f=>sha(bytes('backend/data/'+f.Name))!==f.SHA256.toLowerCase()||bytes('backend/data/'+f.Name).length!==f.Bytes))throw Error('Original data changed');
 const priorPointer=json('reports/evidence/REOWN_LAZY_LATEST.json'),prior=json(priorPointer.path);if(sha(bytes(priorPointer.path))!==priorPointer.sha256)throw Error('Prior proof hash mismatch');
 const closure=files.filter(f=>/^(?:backend|contracts|sdk|shared)\//.test(f.path)),oldClosure=prior.files.filter(f=>/^(?:backend|contracts|sdk|shared)\//.test(f.path));if(JSON.stringify(closure)!==JSON.stringify(oldClosure))throw Error('Unchanged closure mismatch');
 for(const f of [...prior.contractCarry.inputs,...prior.contractCarry.compilerInputs.sourceHashes,{path:prior.contractCarry.buildInfo,sha256:prior.contractCarry.compilerInputs.buildInfoSha256}])if(sha(bytes(f.path))!==f.sha256)throw Error('Contract carry inputs changed');
 const toolingDelta=prior.contractCarry.toolingDelta;if(toolingDelta&&sha(bytes(toolingDelta.path))!==toolingDelta.afterSha256)throw Error('Carried tooling delta changed');
 const standalone=prior.standalone,standaloneCurrent=standalone.files.every(f=>sha(bytes(standalone.package.replace('/PACKAGE.json','')+'/'+f.path))===f.sha256&&fs.existsSync(path.join(root,'frontend/dist',f.path))&&sha(bytes('frontend/dist/'+f.path))===f.sha256);
 if(json(required('scan')).result!=='PASS')throw Error('Secret scan failed');
 const directory='reports/evidence/checks-wallet-recovery-'+new Date().toISOString().replace(/[:.]/g,'-'),pending=[];
 const ref=(name,value)=>{const target=directory+'/'+name;pending.push({target,value});return {path:target,sha256:sha(value)};},copy=(name,file)=>ref(name,bytes(file));
 const record={schemaVersion:1,recordedAt:new Date().toISOString(),result:'LOCAL_SCOPED_PASS',acceptanceEligible:false,candidateFrozen:false,workingTreeOnly:true,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint:fingerprint,files,taskTrace:['WP24-T06','WP03-T14','WP27-T27'],issues:['F18','F30','A03','A04','UI02','UI03','UI04','N65'],binding:copy('checks/source-inputs.json',bindingPath),build:{...build,pipeline:copy('checks/pipeline.json',build.pipeline),pipelineLog:copy('checks/pipeline.log',build.pipelineLog),graph:copy('build/graph.json',build.graph)},browser:runs.map((r,i)=>({mode:r.run.mode,configured:r.run.configuredReownFixture,titles:r.titles,skipped:r.skipped,log:copy('checks/browser-'+i+'.log',r.file),run:copy('owned/browser-'+i+'.json',r.report)})),secretScan:copy('checks/secret-scan.json',args.scan),activeData:copy('checks/original-data-hashes.json','.cache/wp03-sessions-active-data-metadata.json'),activeDataMutated:false,liveDeploymentMutated:false,
  unchangedClosure:{files:closure,prior:{path:priorPointer.path,sha256:priorPointer.sha256},freshBackendContractSdkRun:false},contractCarry:{...prior.contractCarry,freshRun:false},standalone:{...standalone,emittedBytesUnchanged:standaloneCurrent,currentProof:standaloneCurrent,freshJourney:false},
  installedSdk:['frontend/node_modules/@reown/appkit/package.json','frontend/node_modules/@reown/appkit/dist/esm/src/client/appkit.js','frontend/node_modules/@reown/appkit/dist/esm/src/client/appkit-base-client.js'].map(p=>({path:p,sha256:sha(bytes(p))})),
  scope:{runtimeUnitCases:13,configuredDevCases:13,configuredBuiltCases:13,remoteHttp:'LOCAL_EMULATION_OR_RESOURCE_FAULT',remoteWebsocket:'BLOCKED',realPrincipalWallet:false,realOtp:false,financialBroadcast:false,fatalReadyException:'SOURCE_MAPPING_ONLY',wholeFrontend:false,defaultProductionBuild:false,productionCspDeployed:false},
  observations:{initializationTimeout:'RECOVERABLE_WITH_EXPLICIT_RETRY',moduleFailure:'USER_RELOAD_REQUIRED_WITHOUT_CREDENTIAL_RESET',lateResource:'NO_AUTO_MODAL_OR_LOGIN_APPROVAL',openCloseTimeout:'BOUNDED_UNIT_PROOF',originalData:'FIVE_FILES_UNCHANGED'},
  negativeEvidence:[{path:'.cache/wp24-reown-recovery-dev-first.log',reason:'Initial test assumed modal resource loaded after ready; config matcher omitted query. Product no-auto-approval predicates retained.'},{path:'.cache/wp24-wallet-recovery-pipeline-first.log',reason:'AppKit open public return includes send hash; use the actual public ReturnType without casting or changing connect behavior.'}].map(f=>({...f,log:copy('negative/'+path.basename(f.path),f.path),currentCandidateProof:false})),
  openGates:['Actual principal/provider/WalletConnect/OTP and resource outage journeys','Delivery resource/license/provider decisions deferred','Full manual AA/i18n/performance/dependency/monitoring checks','Cold CI, fixed candidate, new G5 and independent G6']};
 const proof=ref('CHECKS.json',Buffer.from(JSON.stringify(record,null,2)+'\n'));if(sha(Buffer.from(JSON.stringify(source())))!==fingerprint)throw Error('Source changed during capture');
 for(const f of pending){fs.mkdirSync(path.dirname(path.join(root,f.target)),{recursive:true});fs.writeFileSync(path.join(root,f.target),f.value,{flag:'wx'});}
 fs.writeFileSync(path.join(root,'reports/evidence/WALLET_RECOVERY_LATEST.json'),JSON.stringify({schemaVersion:1,result:record.result,...proof,sourceFingerprint:fingerprint,acceptanceEligible:false},null,2)+'\n');console.log(JSON.stringify({result:record.result,...proof,sourceFiles:files.length,browserCases:runs.map(r=>r.titles.length),acceptanceEligible:false}));
}
main().catch(e=>{console.error('Wallet recovery evidence rejected: '+e.message);process.exitCode=1;});
