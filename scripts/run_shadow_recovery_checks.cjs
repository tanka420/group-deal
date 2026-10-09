const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['shadow_recovery','shadow_rebuild','deployment_binding','financial_projection','reconciliation_corruption','receipt_race','protocol_projection','indexer_evidence','arc_read_provider']){
 console.log('Shadow recovery regression: '+file);
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+file+'.test.ts')],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',timeout:180000});
 if(result.status!==0||result.error||result.signal){process.exitCode=1;break;}
}
