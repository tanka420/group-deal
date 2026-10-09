import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
const requireFromBackend=createRequire(path.resolve(__dirname,'../backend/package.json'));
const dotenv=requireFromBackend('dotenv'),{ethers}=requireFromBackend('ethers'),nodemailer=requireFromBackend('nodemailer');
const {OpsCheckError,writeOpsEvidence,toolInputs,sha256}=require('./ops_evidence.cjs');
type Env=Record<string,string>;
const fail=(code:string):never=>{throw new OpsCheckError(code);};
function value(env:Env,name:string){const v=env[name]?.trim();if(!v||/replace-with|changeme|your-address|example/i.test(v))fail('CONFIG_VALUE_MISSING');return v;}
const same=(a:string,b:string)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();

/** Inputs remain in memory. Provider diagnostics, credentials and their hashes are never returned. */
export async function checkLiveReadiness(backend:Env,frontend:Env,manifest:any,deps={smtp:nodemailer.createTransport,fetch:globalThis.fetch}){
 const checks:Record<string,string>={};let phase='CONFIG';
 try{
  if(manifest.chainId!==5042002||manifest.environment!=='arc-testnet'||!ethers.isAddress(manifest.contracts?.GroupDealHub?.address)||!same(manifest.contracts?.USDC?.address,'0x3600000000000000000000000000000000000000'))fail('MANIFEST_INVALID');
  let signer:any;try{signer=new ethers.Wallet(value(backend,'AUTHORIZED_SIGNER_PRIVATE_KEY'));}catch{fail('AUTHORIZED_SIGNER_INVALID');}
  let operator:string;try{operator=ethers.getAddress(value(backend,'OPERATOR_ADDRESS'));}catch{fail('OPERATOR_INVALID');}
  if(!same(signer.address,manifest.roles?.authorizedSigner?.address)||!same(operator!,manifest.roles?.operator?.address)||same(operator!,signer.address))fail('MANIFEST_ROLE_MISMATCH');
  if(Number(value(backend,'ARC_CHAIN_ID'))!==manifest.chainId||!same(value(backend,'GROUPDEAL_HUB_ADDRESS'),manifest.contracts.GroupDealHub.address)||!same(value(backend,'USDC_ADDRESS'),manifest.contracts.USDC.address)||!Number.isSafeInteger(manifest.contracts.GroupDealHub.deploymentBlock)||manifest.contracts.GroupDealHub.deploymentBlock<=0||Number(value(backend,'DEPLOYMENT_BLOCK'))!==manifest.contracts.GroupDealHub.deploymentBlock)fail('MANIFEST_ENVIRONMENT_MISMATCH');
  checks.manifestEnvironment='MATCHED';
  const secrets=['JWT_SECRET','CAMPAIGN_IDENTITY_SECRET','MASTER_ENCRYPTION_KEY'].map(n=>value(backend,n));
  if(secrets.some(v=>v.length<32||/groupdeal-super-secret|groupdeal-campaign-identity|groupdeal-master-aes/i.test(v))||new Set(secrets).size!==3)fail('APPLICATION_SECRETS_INVALID');
  checks.applicationSecrets='VALID_DISTINCT_VALUES';
  if(!/^[a-f0-9]{32}$/i.test(value(frontend,'VITE_REOWN_PROJECT_ID')))fail('REOWN_PROJECT_FORMAT_INVALID');
  checks.reownProjectId='FORMAT_VALID_ONLY';
  const circleKey=value(backend,'CIRCLE_API_KEY'),circleApp=value(frontend,'VITE_CIRCLE_APP_ID');let circleBase:URL;
  try{circleBase=new URL(backend.CIRCLE_BASE_URL||'https://api.circle.com');}catch{fail('CIRCLE_ENDPOINT_INVALID');}
  if(circleBase!.origin!=='https://api.circle.com'||circleBase!.username||circleBase!.password||circleBase!.search||circleBase!.hash||circleBase!.pathname!=='/')fail('CIRCLE_ENDPOINT_INVALID');
  const smtpHost=value(backend,'SMTP_HOST'),smtpPort=Number(value(backend,'SMTP_PORT')),smtpUser=value(backend,'SMTP_USER'),smtpPass=value(backend,'SMTP_APP_PASSWORD').replace(/\s+/g,''),smtpFrom=value(backend,'SMTP_FROM');
  if(!Number.isInteger(smtpPort)||smtpPort<1||smtpPort>65535||!smtpFrom.toLowerCase().includes(smtpUser.toLowerCase())||!['true','false'].includes((backend.SMTP_SECURE||'false').toLowerCase()))fail('SMTP_CONFIG_INVALID');
  phase='SMTP';let transport:any,timer:ReturnType<typeof setTimeout>|undefined;
  try{transport=deps.smtp({host:smtpHost,port:smtpPort,secure:(backend.SMTP_SECURE||'false').toLowerCase()==='true',requireTLS:(backend.SMTP_SECURE||'false').toLowerCase()!=='true',auth:{user:smtpUser,pass:smtpPass},tls:{minVersion:'TLSv1.2'},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000});await Promise.race([transport.verify(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new OpsCheckError('SMTP_AUTHENTICATION_TIMEOUT')),20_000);})]);}finally{clearTimeout(timer);transport?.close();}
  checks.smtpAuthentication='VERIFIED_NO_MESSAGE_SENT';
  phase='CIRCLE';const response=await deps.fetch(new URL('/v1/w3s/config/entity',circleBase!),{headers:{Authorization:'Bearer '+circleKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
  if(!response.ok)fail('CIRCLE_CONFIGURATION_UNCONFIRMED');
  const payload=await response.json() as {data?:{appId?:string}};
  if(payload.data?.appId!==circleApp)fail('CIRCLE_APP_MISMATCH');
  checks.circleApiAndAppId='MATCHED';
  return{status:'PASS' as const,checks,chainId:manifest.chainId,hubAddress:manifest.contracts.GroupDealHub.address,authorizedSignerAddress:signer.address,operatorAddress:operator!};
 }catch(error){return{status:'FAIL' as const,phase,code:error instanceof OpsCheckError?(error as {code:string}).code:phase==='SMTP'?'SMTP_AUTHENTICATION_UNCONFIRMED':phase==='CIRCLE'?'CIRCLE_CONFIGURATION_UNCONFIRMED':'CONFIG_UNCONFIRMED',checks};}
}
async function main(){
 if(process.argv.length>2)fail('READINESS_ARGUMENTS_UNSUPPORTED');
 const root=path.resolve(__dirname,'..'),paths=['backend/.env','frontend/.env','shared/manifests/arc-testnet.json'],tools=['scripts/verify_live_readiness.ts','scripts/ops_evidence.cjs','backend/package-lock.json'],checkedTools=toolInputs(root,tools);let result:any={status:'FAIL',phase:'CONFIG',code:'CONFIG_FILE_UNAVAILABLE',checks:{}},manifestHash:string|undefined;
 try{
  const inputs=paths.map(p=>fs.readFileSync(path.join(root,p)));manifestHash=sha256(inputs[2]);
  result=await checkLiveReadiness(dotenv.parse(inputs[0]),dotenv.parse(inputs[1]),JSON.parse(inputs[2].toString()));
  if(paths.some((p,i)=>!fs.readFileSync(path.join(root,p)).equals(inputs[i])))result={status:'FAIL',phase:'CONFIG',code:'CONFIG_CHANGED_DURING_CHECK',checks:result.checks};
  if(JSON.stringify(checkedTools)!==JSON.stringify(toolInputs(root,tools)))result={status:'FAIL',phase:'CONFIG',code:'TOOL_CHANGED_DURING_CHECK',checks:result.checks};
 }catch{result={status:'FAIL',phase:'CONFIG',code:'CONFIG_INPUT_UNCONFIRMED',checks:result.checks};}
 const record={schemaVersion:2,verifiedAt:new Date().toISOString(),layer:'READ_ONLY_PROVIDER_PREFLIGHT',acceptanceEligible:false,candidateFrozen:false,...result,manifestSha256:manifestHash,toolInputs:checkedTools,node:process.version,scope:{smtpMessageSent:false,circleOtpRequested:false,realPrincipalAuthenticated:false,financialBroadcast:false,deploymentMutated:false,activeDataMutated:false,reownRemoteConfigurationChecked:false,sourceContractMatchChecked:false},openGates:['Installed provider OTP/signature and received transactional email','Current deployment fixed-block verification and full product journeys','Fixed candidate, real delivery, G5/G6; Mainnet deferred']};
 const reference=writeOpsEvidence(root,'readiness',record);process.stdout.write(JSON.stringify({status:record.status,...(record.code?{code:record.code}:{}),evidence:reference.path,sha256:reference.sha256,acceptanceEligible:false})+'\n',()=>{process.exitCode=record.status==='PASS'?0:1;if(record.status!=='PASS')setTimeout(()=>process.exit(1),1000).unref();});
}
if(require.main===module)main().catch(()=>{process.stderr.write('READINESS_TOOL_UNCONFIRMED\n',()=>{process.exitCode=1;setTimeout(()=>process.exit(1),1000).unref();});});
