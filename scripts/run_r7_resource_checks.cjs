'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline='5e5640254840ec4be67e214c7c13d82810e06824';
const allowed=["frontend/src/components/ProductStudio.tsx","frontend/src/index.css","frontend/e2e/resource_fields.spec.ts","frontend/e2e/product_resource_rejections.spec.ts",".github/workflows/local-candidate.yml","scripts/run_r7_resource_checks.cjs"];
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:20000});
function inspect(){
 const changed=git(['diff','--name-only',baseline,'HEAD']).trim().split('\n').filter(Boolean);
 if(git(['status','--porcelain']).trim()||changed.some(p=>!allowed.includes(p)&&!p.startsWith('reports/')))throw Error('R7_RESOURCE_SCOPE_CHANGED');
 return {sourceCommit:git(['rev-parse','HEAD']).trim(),baseline,changedFiles:changed,sourceFiles:allowed.map(p=>{const b=fs.readFileSync(path.join(root,p));return{path:p,sha256:crypto.createHash('sha256').update(b).digest('hex'),byteLength:b.length};})};
}
async function main(){
 const args=process.argv.slice(2);if(args.length>1||args.length===1&&args[0]!=='--check-scope')throw Error('R7_RESOURCE_ARGUMENTS');const source=inspect();
 if(args[0]==='--check-scope'){console.log(JSON.stringify({result:'R7_RESOURCE_SCOPE_VERIFIED',...source,acceptanceEligible:false}));return;}
 const {localCheckEnvironment}=require('./local_check_runtime.cjs'),environment=localCheckEnvironment(root),commands=[
  ['tooling-guards',['test/local_pipeline.test.cjs']],
  ['frontend-typecheck',['frontend/node_modules/typescript/bin/tsc','--noEmit','--project','frontend/tsconfig.json']],
  ['frontend-bundle',['frontend/node_modules/vite/bin/vite.js','build'],path.join(root,'frontend')],
  ["resource-fields-dev",["scripts/run_browser_checks.cjs","--port=4183","--","resource_fields.spec.ts","--workers=1"]],
  ["resource-recovery-dev",["scripts/run_browser_checks.cjs","--port=4184","--","product_resource_rejections.spec.ts","product_resource_commands.spec.ts","--workers=1"]],
  ["resource-built",["scripts/run_browser_checks.cjs","--preview","--port=4185","--","resource_fields.spec.ts","product_resource_rejections.spec.ts","product_resource_commands.spec.ts","product_fields.spec.ts","--workers=1"]],
 ];
 const result={schemaVersion:1,recordedAt:new Date().toISOString(),layer:'SCOPED_R7_RESOURCE_FIXTURE_CI',...source,scope:{backendApplicationStarted:false,liveDatabaseOpened:false,financialOrProviderRequestsCreated:false,applicationDeployed:false,fullCiOrFullApplicationSuite:false},steps:[],result:'RUNNING',acceptanceEligible:false};
 fs.mkdirSync(path.join(root,'.cache'),{recursive:true});const out=path.join(root,'.cache/r7-resource-ci-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),save=()=>fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');save();
 for(const [id,args,cwd]of commands){const started=Date.now(),actual=args.map((a,i)=>i===0?path.join(root,a):a),child=cp.spawnSync(process.execPath,actual,{cwd:cwd||root,env:{...environment,...(id==='frontend-bundle'?{NODE_ENV:'production'}:{})},encoding:'utf8',windowsHide:true,timeout:id.includes('dev')||id.includes('built')?180000:90000,maxBuffer:8000000}),output=(child.stdout||'')+'\n'+(child.stderr||'');
  const step={id,result:child.status===0&&!child.error?'PASS':'FAIL',exitCode:child.status,signal:child.signal??null,durationMs:Date.now()-started,summaries:[...output.matchAll(/(?:^|\n)\s*(\d+) (passed|failed|skipped)\b/g)].map(m=>m[2]+':'+m[1]),failureSourceLocations:[...new Set([...output.matchAll(/(?:frontend|backend|scripts|test)[/\\][A-Za-z0-9_./\\-]+\.(?:ts|tsx|cjs|js):\d+(?::\d+)?/g)].map(m=>m[0]))].slice(0,12),rawOutputPublished:false};result.steps.push(step);save();console.log(JSON.stringify(step));if(step.result!=='PASS'){result.result='FAIL';save();process.exitCode=1;return;}
 }
 if(JSON.stringify(inspect())!==JSON.stringify(source))throw Error('R7_RESOURCE_SOURCE_CHANGED_DURING_RUN');result.result='PASS';result.finishedAt=new Date().toISOString();result.sourceUnchanged=true;save();console.log(JSON.stringify({result:'SCOPED_R7_RESOURCES_PASS',sourceCommit:source.sourceCommit,record:path.relative(root,out),acceptanceEligible:false}));
}
main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message??'')?error.message:'R7_RESOURCE_CHECK_UNCONFIRMED');process.exitCode=1;});
