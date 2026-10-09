const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['recovery_auth_barrier','auth_sessions','session_logout_regression','wallet_binding','seller_profile','transactional_store','backup_shadow']){
 console.log('Recovery auth regression: '+file);
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+file+'.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),stdio:'inherit',timeout:120000});
 if(result.status!==0||result.error||result.signal){process.exitCode=1;break;}
}
