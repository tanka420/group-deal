const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..'),negative=process.argv.includes('--negative'),regressions=process.argv.includes('--regressions');
if(process.argv.slice(2).some(a=>!['--negative','--regressions'].includes(a))||(negative&&regressions))throw Error('Invalid recovery dependency argument');
const environment=localCheckEnvironment(root);
delete environment.GROUPDEAL_TEST_RECOVERY_DEPENDENCY_BEFORE;
if(negative)environment.GROUPDEAL_TEST_RECOVERY_DEPENDENCY_BEFORE=JSON.parse(fs.readFileSync(path.join(root,'.cache/recovery-dependency-before.json'),'utf8')).directory;
const result=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/recovery_dependency_freshness.test.ts')],{cwd:root,env:environment,encoding:'utf8',timeout:120000,windowsHide:true});
const log=(result.stdout||'')+(result.stderr||'');
if(negative){fs.writeFileSync(path.join(root,'.cache/recovery-dependency-negative.log'),log);fs.writeFileSync(path.join(root,'.cache/recovery-dependency-negative-terminal.json'),JSON.stringify({exitCode:result.status,signal:result.signal,errorCode:result.error?.code||null,oldSourceLoaded:true,actualDataOrNetwork:false},null,2)+'\n');}
process.stdout.write(log);process.exitCode=result.status??1;
if(regressions&&result.status===0&&!result.error&&!result.signal)for(const file of ['recovery_drill','recovery_inspection','shadow_recovery','recovery_application','runtime_backup','legacy_data_review','restored_work_barrier','backup_shadow','transactional_store','restored_subscription','webhook_recovery_review']){
 console.log('Recovery dependency regression: '+file);
 const check=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),path.join(root,'backend/test/'+file+'.test.ts')],{cwd:path.join(root,'backend'),env:localCheckEnvironment(root),stdio:'inherit',timeout:180000,windowsHide:true});
 if(check.status!==0||check.error||check.signal){process.exitCode=1;break;}
}
