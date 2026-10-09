const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['operator_legacy_review','auth_sessions','session_logout_regression','legacy_data_review','recovery_inspection','restored_work_barrier']){
 console.log('Operator legacy regression: '+file);
 const r=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+file+'.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),stdio:'inherit',timeout:180000});if(r.status!==0||r.error||r.signal){process.exitCode=1;break;}
}
