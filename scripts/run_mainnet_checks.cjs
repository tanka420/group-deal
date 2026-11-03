const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
const holdingsOnly=process.argv.length===3&&process.argv[2]==='--holdings-only';
if(process.argv.length>2&&!holdingsOnly)throw Error('Mainnet checks accept only --holdings-only; no live options');
const env={...localCheckEnvironment(root),APP_ENV:'arc-mainnet',VITE_APP_ENV:'arc-mainnet',ARC_CHAIN_ID:'5042'};
for(const file of holdingsOnly?['mainnet_holdings.test.ts']:['mainnet_configuration.test.ts','mainnet_holdings.test.ts']){
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test',file)],{cwd:root,env,stdio:'inherit',windowsHide:true,timeout:180000});
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
