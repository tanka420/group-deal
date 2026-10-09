const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
if(process.argv.length!==2)throw Error('Invalid Circle fee review check arguments');
const root=path.resolve(__dirname,'..'),result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'frontend/test/circle_fee_review.test.ts')],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',windowsHide:true,timeout:180000});
if(result.status!==0||result.signal||result.error)process.exitCode=1;
