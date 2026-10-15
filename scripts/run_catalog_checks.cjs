const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const suite of ['public_catalog','public_api','public_seller']){
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+suite+'.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),stdio:'inherit',windowsHide:true,timeout:180000});
 if(result.status!==0||result.signal||result.error){process.exitCode=1;break;}
}
