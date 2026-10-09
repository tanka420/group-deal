const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['backend/test/manifest_startup.test.ts','test/ops_readiness.test.ts','test/ops_deployment.test.ts','backend/test/arc_read_provider.test.ts']){
 const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,file)],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',timeout:120_000});
 if(result.status!==0||result.error||result.signal){process.exitCode=1;break;}
}
