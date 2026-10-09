const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
const files=['operational_health','indexer_evidence','receipt_race','reconciliation_corruption','transactional_store'];
for(const name of files){
 console.log('Operational regression: '+name);
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+name+'.test.ts')],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',timeout:120000});
 if(result.status!==0||result.error||result.signal){process.exitCode=1;break;}
}
