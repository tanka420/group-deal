const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['recovery_drill','backup_shadow']){
 console.log('Recovery regression: '+file);
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+file+'.test.ts')],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',timeout:120000});
 if(result.status!==0||result.error||result.signal){process.exitCode=1;break;}
}
