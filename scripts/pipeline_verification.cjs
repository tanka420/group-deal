const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const {localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
function sourceSnapshot(){
 const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
 const files=[...new Set(names)].filter(f=>!/^reports\/(?:evidence|archive)\//.test(f)&&!/(?:^|\/)\.env(?:\.|$)/.test(f)&&!/^backend\/data\//.test(f)).sort().filter(f=>fs.existsSync(path.join(root,f))&&fs.statSync(path.join(root,f)).isFile()).map(f=>({path:f,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')}));
 return {sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files,fingerprint:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex')};
}
const steps=[
 ['compile','node',['scripts/run_contract_checks.cjs','compile']],
 ['contract-types','node',['scripts/run_contract_checks.cjs','types']],
 ['candidate-preparation','node',['scripts/run_contract_checks.cjs','preparation']],
 ['contracts','node',['scripts/run_contract_checks.cjs','all']],
 ['projection','node',['scripts/run_contract_checks.cjs','projection']],
 ['backend-build','npm',['--prefix','backend','run','build']],
 ['backend','npm',['--prefix','backend','test']],
 ['provider-delivery','npm',['--prefix','backend','run','test:provider-delivery']],
 ['public-api','npm',['--prefix','backend','run','test:public-api']],
 ['operational-health','node',['scripts/run_operational_health_checks.cjs']],
 ['recovery-drill','node',['scripts/run_recovery_drill_checks.cjs']],
 ['recovery-types','npm',['run','typecheck:recovery']],
 ['recovery-dependencies','node',['scripts/run_recovery_dependency_checks.cjs','--regressions']],
 ['recovery-dependency-types','npm',['run','typecheck:recovery-dependencies']],
 ['recovery-inspection','node',['scripts/run_recovery_inspection_checks.cjs']],
 ['recovery-inspection-types','npm',['run','typecheck:recovery-inspection']],
 ['shadow-recovery','node',['scripts/run_shadow_recovery_checks.cjs']],
 ['shadow-recovery-types','npm',['run','typecheck:shadow-recovery']],
 ['recovery-auth','node',['scripts/run_recovery_auth_checks.cjs']],
 ['recovery-auth-types','npm',['run','typecheck:recovery-auth']],
 ['recovery-application','node',['scripts/run_recovery_application_checks.cjs']],
 ['recovery-application-types','npm',['run','typecheck:recovery-application']],
 ['runtime-backup','node',['scripts/run_runtime_backup_checks.cjs']],
 ['runtime-backup-types','npm',['run','typecheck:runtime-backup']],
 ['legacy-review','node',['scripts/run_legacy_review_checks.cjs']],
 ['legacy-review-types','npm',['run','typecheck:legacy-review']],
 ['restored-work','node',['scripts/run_restored_work_checks.cjs']],
 ['restored-work-types','npm',['run','typecheck:restored-work']],
 ['operator-legacy','node',['scripts/run_operator_legacy_checks.cjs']],
 ['operator-legacy-types','npm',['run','typecheck:operator-legacy']],
 ['buyer-resources','node',['scripts/run_buyer_resources_checks.cjs']],
 ['buyer-resource-types','npm',['run','typecheck:buyer-resources']],
 ['seller-workspace','node',['scripts/run_seller_workspace_checks.cjs']],
 ['seller-workspace-types','npm',['run','typecheck:seller-workspace']],
 ['product-inventory','node',['scripts/run_product_inventory_checks.cjs','--regressions']],
 ['product-inventory-types','npm',['run','typecheck:product-inventory']],
 ['public-metadata','node',['scripts/run_public_metadata_checks.cjs','--regressions']],
 ['public-metadata-types','npm',['run','typecheck:public-metadata']],
 ['public-projection','node',['scripts/run_public_projection_checks.cjs','--regressions']],
 ['public-projection-types','npm',['run','typecheck:public-projection']],
 ['product-policy','node',['scripts/run_product_policy_checks.cjs','--regressions']],
 ['product-policy-types','npm',['run','typecheck:product-policy']],
 ['product-mutation','node',['scripts/run_product_mutation_checks.cjs','--regressions']],
 ['product-mutation-types','npm',['run','typecheck:product-mutation']],
 ['product-commands','node',['scripts/run_product_command_checks.cjs','--regressions']],
 ['product-command-types','npm',['run','typecheck:product-commands']],
 ['circle-wallet-choice','node',['scripts/run_circle_wallet_choice_checks.cjs','--regressions']],
 ['circle-wallet-choice-types','npm',['run','typecheck:circle-wallet-choice']],
 ['circle-provider-results','node',['scripts/run_circle_provider_result_checks.cjs','--regressions']],
 ['circle-provider-result-types','npm',['run','typecheck:circle-provider-results']],
  ['circle-operation-recovery','node',['scripts/run_circle_operation_recovery_checks.cjs','--regressions']],
  ['circle-operation-recovery-types','npm',['run','typecheck:circle-operation-recovery']],
  ['circle-status','node',['scripts/run_circle_status_checks.cjs','--regressions']],
 ['circle-status-types','npm',['run','typecheck:circle-status']],
 ['circle-challenge','node',['scripts/run_circle_challenge_checks.cjs','--regressions']],
 ['circle-policy','node',['scripts/run_circle_policy_checks.cjs','--regressions']],
 ['circle-challenge-types','npm',['run','typecheck:circle-challenge']],
 ['circle-policy-types','npm',['run','typecheck:circle-policy']],
 ['circle-wallet','node',['scripts/run_circle_wallet_checks.cjs','--regressions']],
 ['circle-wallet-types','npm',['run','typecheck:circle-wallet']],
 ['circle-auth','node',['scripts/run_circle_auth_checks.cjs','--regressions']],
 ['circle-auth-types','npm',['run','typecheck:circle-auth']],
 ['session-management','node',['scripts/run_session_management_checks.cjs','--regressions']],
 ['session-management-types','npm',['run','typecheck:session-management']],
 ['seller-profile-authority','node',['scripts/run_seller_profile_authority_checks.cjs','--regressions']],
 ['seller-profile-authority-types','npm',['run','typecheck:seller-profile-authority']],
 ['wallet-binding-authority','node',['scripts/run_wallet_binding_authority_checks.cjs','--regressions']],
 ['wallet-binding-authority-types','npm',['run','typecheck:wallet-binding-authority']],
 ['wallet-authority','node',['scripts/run_wallet_authority_checks.cjs','--regressions']],
 ['wallet-authority-types','npm',['run','typecheck:wallet-authority']],
 ['operator-badges','node',['scripts/run_operator_badge_checks.cjs','--regressions']],
 ['operator-badge-types','npm',['run','typecheck:operator-badges']],
 ['seller-resources','node',['scripts/run_seller_resource_inventory_checks.cjs','--regressions']],
 ['seller-resource-types','npm',['run','typecheck:seller-resources']],
 ['resource-mutation','node',['scripts/run_resource_mutation_checks.cjs','--regressions']],
 ['resource-mutation-types','npm',['run','typecheck:resource-mutation']],
 ['resource-cancellation','node',['scripts/run_resource_cancellation_checks.cjs','--regressions']],
 ['resource-cancellation-types','npm',['run','typecheck:resource-cancellation']],
 ['sdk','npm',['--prefix','sdk','test']],
 ['provider-receiver','npm',['--prefix','integrations/cloudflare-receiver','test']],
 ['provider-contract','npm',['--prefix','backend','run','test:provider-contract']],
 ['wallet-runtime','npm',['--prefix','frontend','run','test:wallet-runtime']],
 ['bridge-recovery-and-fees','node',['scripts/run_bridge_fee_checks.cjs']],
 ['purchase-budget','node',['scripts/run_purchase_budget_checks.cjs']],
 ['circle-fee-review','node',['scripts/run_circle_fee_review_checks.cjs']],
 ['operation-projection-recovery','node',['backend/node_modules/tsx/dist/cli.mjs','frontend/test/operation_projection_recovery.test.ts']],
 ['circle-decoder','npm',['--prefix','frontend','run','test:circle-decoder']],
 ['frontend-build','npm',['--prefix','frontend','run','build']],
 ['ops-preflight','node',['scripts/run_ops_checks.cjs']],
 ['ops-types','npm',['run','typecheck:ops']],
 ['browser','node',['scripts/run_browser_checks.cjs']],
 ['browser-built','node',['scripts/run_browser_checks.cjs','--preview','--port=4180','--','deferred_pages.spec.ts']],
 ['wallet-login-browser','node',['scripts/run_browser_checks.cjs','--reown-fixture','--port=4206','--','reown_lazy.spec.ts']],
 ['checkout-browser','node',['scripts/run_browser_checks.cjs','--reown-fixture','--port=4203','--',"(?:^|[/\\\\])checkout\\.spec\\.ts$"]],
 ['external-fee-browser','node',['scripts/run_browser_checks.cjs','--reown-fixture','--port=4205','--','external_fee_review.spec.ts']],
 ['checkout-build','npm',['--prefix','frontend','run','build']],
 ['checkout-built','node',['scripts/run_browser_checks.cjs','--preview','--reown-fixture','--port=4204','--',"(?:^|[/\\\\])checkout\\.spec\\.ts$"]],
 ['fallback-fee-review','node',['scripts/run_fallback_fee_checks.cjs']],
 ['fallback-package','node',['scripts/package_fallback.cjs']],
 ['fallback-browser','node',['scripts/run_browser_checks.cjs','--artifact']],
 ['secret-scan','node',['scripts/scan_candidate_secrets.cjs']],
];
function main(){
 const args=process.argv.slice(2),only=args.find(a=>a.startsWith('--only='));
 if(args.some(a=>a!=='--list'&&a!=='--reown-fixture'&&!a.startsWith('--only='))||args.filter(a=>a.startsWith('--only=')).length>1)throw new Error('Use --list or --only=comma-separated-step-ids');
 // Selectable backend subsets are already covered by the full backend step.
 // The full backend step already covers these regression suites. Run each wrapper
 // primary once; --only keeps its broader regression arguments for targeted work.
 const defaultPrimaryOnly=new Set(["circle-wallet-choice","circle-provider-results","circle-status","circle-challenge","circle-policy","circle-wallet","circle-auth","session-management","seller-profile-authority","wallet-binding-authority","wallet-authority","operator-badges"]);
 const fullSteps=steps.filter(s=>!['provider-delivery','public-api','operational-health','recovery-drill','recovery-dependencies','recovery-inspection','shadow-recovery','recovery-auth','recovery-application','runtime-backup','legacy-review','restored-work','operator-legacy','buyer-resources','seller-workspace','product-inventory','public-metadata','public-projection','product-policy','product-mutation','product-commands','seller-resources','resource-mutation','resource-cancellation'].includes(s[0])).map(([id,command,args])=>[id,command,defaultPrimaryOnly.has(id)?args.filter(a=>a!=='--regressions'):args]),names=only?only.slice(7).split(','):fullSteps.map(s=>s[0]);
 if(!names.length||new Set(names).size!==names.length||names.some(n=>!steps.some(s=>s[0]===n)))throw new Error('Unknown or duplicate local pipeline step');
 const selected=(only?steps:fullSteps).filter(s=>names.includes(s[0]));
 if(args.includes('--list')){console.log(JSON.stringify({layer:'LOCAL_REPRODUCIBLE',acceptanceEligible:false,steps:selected.map(([id,command,args])=>({id,command,args})),excluded:['cleanup','ABI source generation','Arc probe','deployment','live journey','database reset/seed']},null,2));return;}
 const configuredReown=args.includes('--reown-fixture');if(configuredReown&&selected.some(s=>!['frontend-build','circle-decoder','wallet-runtime'].includes(s[0])))throw Error('Reown configuration fixture is only for frontend checks');
 const environment=localCheckEnvironment(root,{configuredReown}),cache=path.join(root,'.cache');fs.mkdirSync(cache,{recursive:true});
 const file=path.join(cache,'local-pipeline-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 const before=sourceSnapshot();
 const record={schemaVersion:1,recordedAt:new Date().toISOString(),layer:'LOCAL_REPRODUCIBLE',acceptanceEligible:false,candidateFrozen:false,configuredReownFixture:configuredReown,node:process.version,sourceCommit:before.sourceCommit,sourceFingerprint:before.fingerprint,sourceFiles:before.files,steps:[],result:'RUNNING',completeScope:fullSteps.every(s=>names.includes(s[0]))};
 const save=()=>fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');save();
 for(const [id,command,args] of selected){
  console.log('Local check: '+id);
  let executable=command,argv=args,shell=false;
  if(command==='node')executable=process.execPath;
  else if(process.env.npm_execpath){executable=process.execPath;argv=[process.env.npm_execpath,...args];}
  else if(process.platform==='win32'){executable='npm.cmd';shell=true;}
  // Backend fixtures retain test isolation; emitted frontend must use React production.
  const childEnvironment=id==='checkout-build'?{...localCheckEnvironment(root,{configuredReown:true}),NODE_ENV:'production'}:id==='frontend-build'?{...environment,NODE_ENV:'production'}:environment;
  const result=spawnSync(executable,argv,{cwd:root,env:childEnvironment,stdio:'inherit',shell});
  record.steps.push({id,nodeEnvironment:childEnvironment.NODE_ENV,exitCode:result.status,signal:result.signal||null,result:!result.error&&result.status===0?'PASS':'FAIL'});save();
  if(result.error||result.status!==0){record.result='FAIL';save();console.error('Local pipeline failed: '+id+'; result file '+path.relative(root,file));process.exitCode=result.status||1;return;}
 }
 if(sourceSnapshot().fingerprint!==before.fingerprint){record.result='FAIL';record.errorCode='SOURCE_CHANGED_DURING_CHECKS';save();console.error('Candidate source changed while checks ran; no PASS recorded');process.exitCode=1;return;}
 record.result='PASS';save();console.log('PASS '+(record.completeScope?'full local reproducible pipeline':'selected local checks')+'; '+path.relative(root,file)+'; no G5/G6 acceptance');
}
if(require.main===module){try{main();}catch{console.error('Local pipeline configuration failed; no live credentials or data printed');process.exitCode=1;}}
module.exports={steps};
