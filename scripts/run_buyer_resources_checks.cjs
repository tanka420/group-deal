const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['buyer_order_view','legacy_session_materialization','buyer_resource_access','resource_redemption','resource_delivery','delivery_retry','product_rights','transactional_store','auth_sessions','recovery_auth_barrier','session_logout_regression']){
 console.log('Buyer resource regression: '+file);
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+file+'.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),stdio:'inherit',timeout:180000});
 if(result.status!==0||result.error||result.signal){process.exitCode=1;break;}
}
