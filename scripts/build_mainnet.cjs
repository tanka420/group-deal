const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {localCheckEnvironment}=require('./local_check_runtime.cjs'),{prepareMainnet}=require('./prepare_mainnet.cjs');
const root=path.resolve(__dirname,'..');
if(process.argv.length>2)throw Error('Mainnet preparation build accepts no activation options');
const env={...localCheckEnvironment(root),NODE_ENV:'production',APP_ENV:'arc-mainnet',VITE_APP_ENV:'arc-mainnet',ARC_CHAIN_ID:'5042',VITE_CIRCLE_APP_ID:'',VITE_REOWN_PROJECT_ID:''};
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
const record={schemaVersion:1,result:'PASS',layer:'LOCAL_MAINNET_PREPARATION_BUILD',acceptanceEligible:false,sourceCommit:before.sourceCommit,sourceFingerprint:before.sourceFingerprint,node:process.version,
 frontend:{environment:'arc-mainnet',productionCredentialsConfigured:false,directory:path.join(output,'frontend'),files:files(path.join(output,'frontend'))},
 backend:{environment:'arc-mainnet',directory:path.join(root,'backend/dist'),files:files(path.join(root,'backend/dist'))},
 activationAuthorized:false,notes:['Mainnet manifest remains UNDEPLOYED.','Circle/Reown owner configuration and exact release review are still required.']};
const report=path.join(output,'BUILD.json');fs.writeFileSync(report,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({result:record.result,layer:record.layer,sourceFingerprint:record.sourceFingerprint,report,acceptanceEligible:false},null,2));
