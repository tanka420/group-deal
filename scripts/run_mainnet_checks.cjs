const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
if(process.argv.length>2)throw Error('Mainnet checks accept no live options');
const env={...localCheckEnvironment(root),APP_ENV:'arc-mainnet',VITE_APP_ENV:'arc-mainnet',ARC_CHAIN_ID:'5042'};
const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/mainnet_configuration.test.ts')],{cwd:root,env,stdio:'inherit',windowsHide:true,timeout:180000});
process.exitCode=result.status??1;
