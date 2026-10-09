const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['webhook_recovery_review','webhook_review_transport','restored_subscription','restored_work_barrier','recovery_auth_barrier','recovery_application','runtime_backup','notification_durability','operator_outbox','webhook_durability']){
 console.log('Restored work regression: '+file);
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+file+'.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),stdio:'inherit',timeout:180000});
 if(result.status!==0||result.error||result.signal){process.exitCode=1;break;}
}
