const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
if(process.argv.length!==2)throw Error('Invalid purchase budget check arguments');
const root=path.resolve(__dirname,'..'),result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'frontend/test/purchase_budget.test.ts')],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',windowsHide:true,timeout:180000});
if(result.status!==0||result.signal||result.error)process.exitCode=1;

if(!process.exitCode){const call=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'frontend/test/call_budget.test.ts')],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',windowsHide:true,timeout:180000});if(call.status!==0||call.signal||call.error)process.exitCode=1;}
