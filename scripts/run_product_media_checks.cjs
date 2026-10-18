const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs'),root=path.resolve(__dirname,'..');
const r=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/product_media.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),stdio:'inherit',timeout:90000,windowsHide:true});
if(r.status!==0||r.error||r.signal)process.exitCode=1;
