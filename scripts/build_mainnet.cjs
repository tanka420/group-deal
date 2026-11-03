const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {localCheckEnvironment}=require('./local_check_runtime.cjs'),{prepareMainnet}=require('./prepare_mainnet.cjs');
const root=path.resolve(__dirname,'..');
if(process.argv.length>2)throw Error('Mainnet preparation build accepts no activation options');
const publicConfiguration=JSON.parse(fs.readFileSync(path.join(root,'shared/mainnet-public.json'),'utf8'));
if(publicConfiguration.schemaVersion!==1||publicConfiguration.environment!=='arc-mainnet'||publicConfiguration.chainId!==5042||publicConfiguration.publicAppUrl!=='https://groupdeal.tech'
 ||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(publicConfiguration.circleAppId)||!/^[a-f\d]{32}$/i.test(publicConfiguration.reownProjectId))throw Error('MAINNET_PUBLIC_CONFIGURATION_INVALID');
const env={...localCheckEnvironment(root),NODE_ENV:'production',APP_ENV:'arc-mainnet',VITE_APP_ENV:'arc-mainnet',ARC_CHAIN_ID:'5042',VITE_CIRCLE_APP_ID:publicConfiguration.circleAppId,VITE_REOWN_PROJECT_ID:publicConfiguration.reownProjectId};
const output=path.join(root,'.cache/mainnet-build',crypto.randomUUID());
fs.mkdirSync(output,{recursive:true});
const before=prepareMainnet();
for(const [cwd,args]of [
 ['backend',['node_modules/typescript/bin/tsc']],
 ['frontend',['node_modules/typescript/bin/tsc','--noEmit']],
 ['frontend',['node_modules/vite/bin/vite.js','build','--outDir',path.join(output,'frontend')]],
]){
 const result=spawnSync(process.execPath,args,{cwd:path.join(root,cwd),env,stdio:'inherit',windowsHide:true});
 if(result.status!==0||result.error)process.exit(result.status||1);
}
if(prepareMainnet().sourceFingerprint!==before.sourceFingerprint)throw Error('MAINNET_BUILD_SOURCE_CHANGED');
function files(dir,base=dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name),base):[{path:path.relative(base,path.join(dir,e.name)).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,e.name))).digest('hex')}]);}
const frontendFiles=files(path.join(output,'frontend'));
const javascript=frontendFiles.filter(f=>f.path.endsWith('.js')).map(f=>fs.readFileSync(path.join(output,'frontend',f.path),'utf8')).join('\n');
if(!javascript.includes(publicConfiguration.circleAppId)||!javascript.includes(publicConfiguration.reownProjectId)||javascript.includes('e2e-only-circle-app-id')||frontendFiles.some(f=>f.path.endsWith('.map')||/(?:^|\/)\.env(?:\.|$)/.test(f.path)))throw Error('MAINNET_PUBLIC_BUILD_BINDING_INVALID');
const record={schemaVersion:1,result:'PASS',layer:'LOCAL_MAINNET_PREPARATION_BUILD',acceptanceEligible:false,sourceCommit:before.sourceCommit,sourceFingerprint:before.sourceFingerprint,node:process.version,
 frontend:{environment:'arc-mainnet',publicProviderIdentifiersConfigured:true,publicConfiguration,liveAuthenticationVerified:false,directory:path.join(output,'frontend'),files:frontendFiles},
 backend:{environment:'arc-mainnet',productionCredentialsConfigured:false,directory:path.join(root,'backend/dist'),files:files(path.join(root,'backend/dist'))},
 contractDeployment:{status:before.manifest.deploymentStatus,...before.manifest.contracts.GroupDealHub},
 activationAuthorized:false,notes:[`Contract deployment status in the pinned manifest: ${before.manifest.deploymentStatus}.`,'The build contains public Circle/Reown identifiers and pinned contract roles. Production backend credentials are not configured in this build environment; VPS activation, independent release review and live application acceptance remain separate steps.']};
const report=path.join(output,'BUILD.json');fs.writeFileSync(report,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({result:record.result,layer:record.layer,sourceFingerprint:record.sourceFingerprint,report,acceptanceEligible:false},null,2));
