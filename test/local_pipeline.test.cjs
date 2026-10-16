const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),net=require('node:net'),{spawnSync}=require('node:child_process');
const {localCheckEnvironment}=require('../scripts/local_check_runtime.cjs'),{steps}=require('../scripts/pipeline_verification.cjs'),{scanText}=require('../scripts/scan_candidate_secrets.cjs');
const root=path.resolve(__dirname,'..');
function immutableActionReferences(workflow){
 const references=[...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map(match=>match[1]);
 return references.length>=3&&references.every(ref=>/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[a-f0-9]{40}$/.test(ref))&&['actions/checkout','actions/setup-node','actions/upload-artifact'].every(action=>references.some(ref=>ref.startsWith(action+'@')));
}
async function main(){
 const sentinel='GROUPDEAL_TOOLING_SENTINEL_TOKEN',previous=process.env[sentinel];process.env[sentinel]=crypto.randomBytes(32).toString('hex');
 const inheritedProject=process.env.VITE_REOWN_PROJECT_ID;process.env.VITE_REOWN_PROJECT_ID=crypto.randomBytes(16).toString('hex');
 const inheritedRecovery=process.env.GROUPDEAL_RECOVERY_MODE;process.env.GROUPDEAL_RECOVERY_MODE='1';
 const first=localCheckEnvironment(root),second=localCheckEnvironment(root),configured=localCheckEnvironment(root,{configuredReown:true});
 if(inheritedRecovery===undefined)delete process.env.GROUPDEAL_RECOVERY_MODE;else process.env.GROUPDEAL_RECOVERY_MODE=inheritedRecovery;
 if(inheritedProject===undefined)delete process.env.VITE_REOWN_PROJECT_ID;else process.env.VITE_REOWN_PROJECT_ID=inheritedProject;
 if(previous===undefined)delete process.env[sentinel];else process.env[sentinel]=previous;
 assert.ok(first[sentinel]===''&&second[sentinel]==='','Inherited credentials must be blank in child checks');
 assert.equal(first.GROUPDEAL_RECOVERY_MODE,undefined);assert.equal(second.GROUPDEAL_RECOVERY_MODE,undefined);assert.equal(configured.GROUPDEAL_RECOVERY_MODE,undefined,'Local checks must not inherit a live recovery-store selection');
 for(const key of ['JWT_SECRET','CAMPAIGN_IDENTITY_SECRET','MASTER_ENCRYPTION_KEY','AUTHORIZED_SIGNER_PRIVATE_KEY']){assert.ok(first[key].length>=32,'Ephemeral credentials must satisfy runtime lengths');assert.ok(first[key]!==second[key],'Each local run must have fresh credentials');}
 assert.ok(new Set([first.JWT_SECRET,first.CAMPAIGN_IDENTITY_SECRET,first.MASTER_ENCRYPTION_KEY]).size===3,'Purpose secrets must differ');
 assert.ok(first.DEPLOYER_PRIVATE_KEY===''&&first.CIRCLE_API_KEY===''&&first.SMTP_APP_PASSWORD==='','Live provider/deployer credentials must not reach local checks');
 assert.ok(first.ARC_RPC_URL==='http://127.0.0.1:9'&&first.ARC_WS_URL==='ws://127.0.0.1:9','Local checks must not use Arc RPC');
 assert.equal(first.VITE_REOWN_PROJECT_ID,'');assert.equal(second.VITE_REOWN_PROJECT_ID,'');assert.equal(configured.VITE_REOWN_PROJECT_ID,'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1');
 assert.equal(configured.NODE_OPTIONS,first.NODE_OPTIONS);assert.equal(configured.ARC_RPC_URL,first.ARC_RPC_URL);assert.equal(configured.DEPLOYER_PRIVATE_KEY,'');assert.equal(configured.CIRCLE_API_KEY,'');assert.equal(configured[sentinel],'');
 const runtime=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),'--eval','import {validateRuntimeSecurity} from "./src/services/runtimeSecurity"; validateRuntimeSecurity();'],{cwd:path.join(root,'backend'),env:first,encoding:'utf8'});
 assert.ok(runtime.status===0,'Ephemeral Arc fixture configuration must pass the actual runtime guard');
 assert.ok(!steps.some(s=>/clean|arc|deploy|seed|generate/i.test(JSON.stringify(s))),'Default local pipeline must contain no cleanup, deployment, seed, ABI generation or Arc probe');
 const listed=spawnSync(process.execPath,['scripts/pipeline_verification.cjs','--list'],{cwd:root,encoding:'utf8'});assert.ok(listed.status===0);const plan=JSON.parse(listed.stdout);assert.ok(!plan.acceptanceEligible&&plan.steps.some(s=>s.id==='projection')&&plan.steps.some(s=>s.id==='fallback-browser'));assert.ok(plan.excluded.includes('database reset/seed'));assert.ok(plan.steps.findIndex(s=>s.id==='backend-build')<plan.steps.findIndex(s=>s.id==='backend'),'Clean checkout must emit backend before suites requiring dist modules');
 const invalid=spawnSync(process.execPath,['scripts/pipeline_verification.cjs','--only=deploy'],{cwd:root,encoding:'utf8'});assert.ok(invalid.status===1,'Unknown steps must fail before processes start');
 const mixed=spawnSync(process.execPath,['scripts/pipeline_verification.cjs','--reown-fixture','--only=backend'],{cwd:root,encoding:'utf8'});assert.equal(mixed.status,1,'Configured frontend fixture must reject backend checks before processes start');
 const secret=crypto.randomBytes(32).toString('hex'),text='const JWT_SECRET="'+secret+'";';
 const found=scanText(text,'candidate.ts');assert.ok(found.length===1&&found[0].rule==='SECRET_LITERAL');assert.ok(!JSON.stringify(found).includes(secret),'Scan result must never contain the matched value');
 const exact={file:'fixture.ts',rule:'SECRET_LITERAL',literalSha256:crypto.createHash('sha256').update(secret).digest('hex')};assert.ok(scanText(text,'fixture.ts',undefined,[exact]).length===0);assert.ok(scanText(text,'other.ts',undefined,[exact]).length===1,'Exceptions must be bound to both file and literal hash');
 const changed='const JWT_SECRET="'+crypto.randomBytes(32).toString('hex')+'";';assert.ok(scanText(changed,'fixture.ts',undefined,[exact]).length===1,'Changing a fixture value must reopen the scan finding');
 const privatePem=crypto.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});assert.ok(scanText(privatePem,'candidate.pem').length===1);assert.ok(scanText('const value="ghp_'+crypto.randomBytes(24).toString('hex')+'";','candidate.ts').length===1);
 const blocked=spawnSync(process.execPath,['-e','fetch("https://rpc.drpc.testnet.arc.io").then(()=>process.exitCode=2).catch(e=>{process.exitCode=e.message.startsWith("LOCAL_CHECK_NETWORK_GUARD:")?0:3;});'],{cwd:root,env:first,encoding:'utf8'});assert.ok(blocked.status===0,'Hardcoded Arc fallback must also be blocked before network access');
 const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
 try{const port=probe.address().port,result=spawnSync(process.execPath,['scripts/run_browser_checks.cjs','--port='+port],{cwd:root,encoding:'utf8',timeout:10000});assert.ok(result.status===1&&/already occupied/.test(result.stderr),'Occupied server must fail before reuse');assert.ok(probe.listening,'Runner must not stop an existing server');}finally{await new Promise(resolve=>probe.close(resolve));}
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/local-candidate.yml'),'utf8');assert.ok(!/pull_request_target|secrets\.|deploy:|arc-live/.test(workflow),'PR checks must have no privileged/live step');assert.ok(/persist-credentials: false/.test(workflow)&&/contents: read/.test(workflow));assert.ok(immutableActionReferences(workflow),'Every action use must have an immutable commit ref, across every job');
 const pinned=['actions/checkout','actions/setup-node','actions/upload-artifact'].map(action=>'      - uses: '+action+'@'+'a'.repeat(40)).join('\n');
 assert.ok(immutableActionReferences(Array(8).fill(pinned).join('\n')),'Multiple jobs may reuse correctly pinned actions');
 for(const floating of ['actions/checkout@main','actions/setup-node@v7','actions/upload-artifact@'+'a'.repeat(39),'${{ inputs.action }}'])assert.equal(immutableActionReferences(pinned+'\n      - uses: '+floating),false,'An extra unpinned use must fail even when the required three uses are pinned');
 assert.equal(immutableActionReferences(pinned.replace(/actions\/setup-node/g,'actions/checkout')),false,'Required action coverage must remain present');
 console.log('PASS LOCAL_TOOLING: fresh purpose credentials pass actual runtime guard, no live RPC/provider/deploy/cleanup steps, exact redacted secret exceptions, immutable workflow refs and occupied-server refusal. No clean-checkout/GitHub/G5 proof.');
}
main().catch(error=>{const location=/local_pipeline\.test\.cjs:\d+(?::\d+)?/.exec(error?.stack??'')?.[0]??'location unavailable';console.error('FAIL LOCAL_TOOLING: isolation/redaction/workflow invariant failed at '+location+'; values withheld');process.exitCode=1;});
