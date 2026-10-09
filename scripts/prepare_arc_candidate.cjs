const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'.cache/hardhat-preparation');fs.mkdirSync(runtime,{recursive:true});
const result=spawnSync(process.execPath,['node_modules/hardhat/internal/cli/cli.js','run','--no-compile','scripts/prepareArcCandidate.ts','--network','hardhat'],{cwd:path.join(root,'contracts'),env:{...localCheckEnvironment(root),LOCALAPPDATA:runtime,APPDATA:runtime,HARDHAT_TELEMETRY_CONSENT:'false'},stdio:'inherit',timeout:120_000});
process.exitCode=result.error||result.signal||result.status!==0?1:0;
