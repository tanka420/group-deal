import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {checkLiveReadiness} from '../scripts/verify_live_readiness';
const fromBackend=createRequire(path.resolve(__dirname,'../backend/package.json')),{ethers}=fromBackend('ethers');
const {writeOpsEvidence,sha256}=require('../scripts/ops_evidence.cjs');
async function main(){
 const signer=ethers.Wallet.createRandom(),operator=ethers.Wallet.createRandom();
 const backend={AUTHORIZED_SIGNER_PRIVATE_KEY:signer.privateKey,OPERATOR_ADDRESS:operator.address,ARC_CHAIN_ID:'5042002',GROUPDEAL_HUB_ADDRESS:'0x1111111111111111111111111111111111111111',USDC_ADDRESS:'0x3600000000000000000000000000000000000000',DEPLOYMENT_BLOCK:'12345',JWT_SECRET:crypto.randomBytes(32).toString('hex'),CAMPAIGN_IDENTITY_SECRET:crypto.randomBytes(32).toString('hex'),MASTER_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),SMTP_HOST:'smtp.fixture.test',SMTP_PORT:'587',SMTP_USER:'readiness@fixture.test',SMTP_FROM:'readiness@fixture.test',SMTP_APP_PASSWORD:crypto.randomBytes(16).toString('hex'),CIRCLE_API_KEY:crypto.randomBytes(24).toString('hex')};
 const frontend={VITE_REOWN_PROJECT_ID:'f1'.repeat(16),VITE_CIRCLE_APP_ID:'fixture-app'},manifest={environment:'arc-testnet',chainId:5042002,contracts:{GroupDealHub:{address:backend.GROUPDEAL_HUB_ADDRESS,deploymentBlock:12345},USDC:{address:backend.USDC_ADDRESS}},roles:{authorizedSigner:{address:signer.address},operator:{address:operator.address}}};
 let verified=0,closed=0,fetched=0;const marker='PRIVATE_PROVIDER_DIAGNOSTIC_FIXTURE';
 const diagnostic=marker+' '+[signer.privateKey,backend.JWT_SECRET,backend.MASTER_ENCRYPTION_KEY,backend.SMTP_APP_PASSWORD,backend.CIRCLE_API_KEY].join(' ');
 const deps={smtp:(_opts:any)=>({verify:async()=>{verified++;},close:()=>{closed++;},sendMail:()=>{throw Error('No email authorized by readiness');}}),fetch:(async(input:any,options:any)=>{fetched++;assert.equal(new URL(input).href,'https://api.circle.com/v1/w3s/config/entity');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+backend.CIRCLE_API_KEY);return new Response(JSON.stringify({data:{appId:frontend.VITE_CIRCLE_APP_ID}}));}) as typeof fetch};
 const safe=(result:any)=>{const rendered=JSON.stringify(result);for(const secret of [marker,signer.privateKey,backend.JWT_SECRET,backend.MASTER_ENCRYPTION_KEY,backend.SMTP_APP_PASSWORD,backend.CIRCLE_API_KEY])assert.ok(!rendered.includes(secret));};
 const good=await checkLiveReadiness(backend,frontend,manifest,deps);assert.equal(good.status,'PASS');assert.equal(good.checks.reownProjectId,'FORMAT_VALID_ONLY');assert.equal(verified,1);assert.equal(closed,1);assert.equal(fetched,1);safe(good);
 let cases=1;
 for(const [b,f,m,code] of [
  [{...backend,AUTHORIZED_SIGNER_PRIVATE_KEY:diagnostic},frontend,manifest,'AUTHORIZED_SIGNER_INVALID'],
  [{...backend,OPERATOR_ADDRESS:signer.address},frontend,manifest,'MANIFEST_ROLE_MISMATCH'],
  [{...backend,DEPLOYMENT_BLOCK:'12346'},frontend,manifest,'MANIFEST_ENVIRONMENT_MISMATCH'],
  [{...backend,JWT_SECRET:backend.MASTER_ENCRYPTION_KEY},frontend,manifest,'APPLICATION_SECRETS_INVALID'],
  [{...backend,JWT_SECRET:'groupdeal-super-secret-'+'x'.repeat(32)},frontend,manifest,'APPLICATION_SECRETS_INVALID'],
  [backend,{...frontend,VITE_REOWN_PROJECT_ID:'invalid'},manifest,'REOWN_PROJECT_FORMAT_INVALID'],
  [{...backend,CIRCLE_BASE_URL:'https://unapproved.fixture.test'},frontend,manifest,'CIRCLE_ENDPOINT_INVALID'],
  [{...backend,CIRCLE_BASE_URL:'https://api.circle.com/private'},frontend,manifest,'CIRCLE_ENDPOINT_INVALID'],
  [{...backend,SMTP_PORT:'0'},frontend,manifest,'SMTP_CONFIG_INVALID'],
 ] as const){verified=closed=fetched=0;const result=await checkLiveReadiness(b,f,m,deps);assert.equal(result.status,'FAIL');assert.equal(result.code,code);assert.equal(verified+closed+fetched,0);safe(result);cases++;}
 let result=await checkLiveReadiness(backend,frontend,manifest,{...deps,smtp:()=>({verify:async()=>{throw Error(diagnostic);},close:()=>{closed++;}})});assert.equal(result.status,'FAIL');assert.equal(result.code,'SMTP_AUTHENTICATION_UNCONFIRMED');assert.equal(closed,1);safe(result);cases++;
 result=await checkLiveReadiness(backend,frontend,manifest,{...deps,fetch:(async()=>{throw Error(diagnostic);}) as typeof fetch});assert.equal(result.status,'FAIL');assert.equal(result.code,'CIRCLE_CONFIGURATION_UNCONFIRMED');safe(result);cases++;
 result=await checkLiveReadiness(backend,frontend,manifest,{...deps,fetch:(async()=>new Response(diagnostic,{status:503})) as typeof fetch});assert.equal(result.code,'CIRCLE_CONFIGURATION_UNCONFIRMED');safe(result);cases++;
 result=await checkLiveReadiness(backend,frontend,manifest,{...deps,fetch:(async()=>new Response(JSON.stringify({data:{appId:diagnostic}}))) as typeof fetch});assert.equal(result.code,'CIRCLE_APP_MISMATCH');safe(result);cases++;
 const originalTimer=globalThis.setTimeout;let deadline:number|undefined;
 try{globalThis.setTimeout=((callback:any,delay:number,...args:any[])=>{deadline=delay;return originalTimer(callback,delay===20_000?5:delay,...args);}) as typeof setTimeout;result=await checkLiveReadiness(backend,frontend,manifest,{...deps,smtp:()=>({verify:()=>new Promise(()=>{}),close:()=>{closed++;}})});assert.equal(deadline,20_000);assert.equal(result.code,'SMTP_AUTHENTICATION_TIMEOUT');safe(result);cases++;}finally{globalThis.setTimeout=originalTimer;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-ops-evidence-')),folder=path.join(root,'reports/evidence');fs.mkdirSync(folder,{recursive:true});const old=path.join(folder,'LIVE_READINESS.json');fs.writeFileSync(old,'historical-fixture');
 const first=writeOpsEvidence(root,'readiness',{status:'PASS',acceptanceEligible:false,checks:{fixture:true}}),saved=fs.readFileSync(path.join(root,first.path));const second=writeOpsEvidence(root,'readiness',{status:'FAIL',code:'SMTP_AUTHENTICATION_UNCONFIRMED'});
 assert.notEqual(first.path,second.path);assert.equal(fs.readFileSync(old,'utf8'),'historical-fixture');assert.equal(sha256(saved),first.sha256);assert.ok(fs.readFileSync(path.join(root,first.path)).equals(saved));assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'LIVE_READINESS_LATEST.json'),'utf8')).status,'FAIL');cases++;
 console.log(`PASS ${cases} ops readiness cases: credential/manifest guards, provider diagnostic redaction, no email, no redirect, transport closure and immutable historical evidence. Local fixtures only.`);
}
main().catch(()=>{console.error('FAIL isolated ops readiness checks');process.exitCode=1;});
