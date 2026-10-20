const path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
for(const file of ['backend/test/seller_identity.test.ts','frontend/test/seller_identity.test.ts']){
  const r=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,file)],{cwd:root,env:localCheckEnvironment(root),stdio:'inherit',windowsHide:true,timeout:180000});
  if(r.status!==0||r.signal||r.error){process.exitCode=1;break;}
}
