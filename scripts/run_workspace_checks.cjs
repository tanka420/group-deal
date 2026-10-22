const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const tests=['workspace_pagination','seller_workspace_view','buyer_order_view','product_inventory','seller_identity','operation_history','wallet_flow','wallet_rows','wallet_api','manifest_startup','indexer_range','indexer_evidence'];
for(const test of tests){
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+test+'.test.ts')],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',windowsHide:true});
 if(result.status!==0)process.exit(result.status??1);
}
console.log('PASS workspace checks: isolated local data; no production acceptance.');
