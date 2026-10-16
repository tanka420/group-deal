'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline='fa08285e248709258b78db9c1b00d25a6eb310f9';
const allowed=['frontend/src/components/ProductStudio.tsx','frontend/e2e/product_fields.spec.ts','.github/workflows/local-candidate.yml','scripts/run_r7_product_checks.cjs'];
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:20000});
function inspect(){
 const changed=git(['diff','--name-only',baseline,'HEAD']).trim().split('\n').filter(Boolean);
 if(git(['status','--porcelain']).trim()||changed.some(p=>!allowed.includes(p)&&!p.startsWith('reports/')))throw Error('R7_PRODUCT_SCOPE_CHANGED');
 return {sourceCommit:git(['rev-parse','HEAD']).trim(),baseline,changedFiles:changed,sourceFiles:allowed.map(p=>{const b=fs.readFileSync(path.join(root,p));return{path:p,sha256:crypto.createHash('sha256').update(b).digest('hex'),byteLength:b.length};})};
}
async function main(){
 const args=process.argv.slice(2);if(args.length>1||args.length===1&&args[0]!=='--check-scope')throw Error('R7_PRODUCT_ARGUMENTS');const source=inspect();
 if(args[0]==='--check-scope'){console.log(JSON.stringify({result:'R7_PRODUCT_SCOPE_VERIFIED',...source,acceptanceEligible:false}));return;}
 const {localCheckEnvironment}=require('./local_check_runtime.cjs'),environment=localCheckEnvironment(root),commands=[
  ['tooling-guards',['test/local_pipeline.test.cjs']],
  ['frontend-typecheck',['frontend/node_modules/typescript/bin/tsc','--noEmit','--project','frontend/tsconfig.json']],
  ['frontend-bundle',['frontend/node_modules/vite/bin/vite.js','build'],path.join(root,'frontend')],
  ["product-fields-dev",["scripts/run_browser_checks.cjs","--port=4183","--","product_fields.spec.ts","--workers=1"]],
  ["product-recovery-dev",["scripts/run_browser_checks.cjs","--port=4184","--","product_studio_scope.spec.ts","product_commands.spec.ts","--grep","late product save|unconfirmed product creation|product errors|product create commits|burst of product|mismatched .* product ACK|lost (create|version|rights) ACK|unknown create checkpoint|unavailable checkpoint storage|submitted rights ACK|fits seven widths|N152|N153|N154|N156","--workers=1"]],
  ["product-built",["scripts/run_browser_checks.cjs","--preview","--port=4185","--","product_fields.spec.ts","product_studio_scope.spec.ts","product_commands.spec.ts","--grep","R7 |late product save|unconfirmed product creation|product errors|product create commits|burst of product|mismatched .* product ACK|lost (create|version|rights) ACK|unknown create checkpoint|unavailable checkpoint storage|submitted rights ACK|fits seven widths|N152|N153|N154|N156","--workers=1"]],
 ];
 const result={schemaVersion:1,recordedAt:new Date().toISOString(),layer:'SCOPED_R7_PRODUCT_FIXTURE_CI',...source,scope:{backendApplicationStarted:false,liveDatabaseOpened:false,financialOrProviderRequestsCreated:false,applicationDeployed:false,fullCiOrFullApplicationSuite:false},steps:[],result:'RUNNING',acceptanceEligible:false};
 fs.mkdirSync(path.join(root,'.cache'),{recursive:true});const out=path.join(root,'.cache/r7-product-ci-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),save=()=>fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');save();
 for(const [id,args,cwd]of commands){const started=Date.now(),actual=args.map((a,i)=>i===0?path.join(root,a):a),child=cp.spawnSync(process.execPath,actual,{cwd:cwd||root,env:{...environment,...(id==='frontend-bundle'?{NODE_ENV:'production'}:{})},encoding:'utf8',windowsHide:true,timeout:id.includes('dev')||id.includes('built')?180000:90000,maxBuffer:8000000}),output=(child.stdout||'')+'\n'+(child.stderr||'');
  const step={id,result:child.status===0&&!child.error?'PASS':'FAIL',exitCode:child.status,signal:child.signal??null,durationMs:Date.now()-started,summaries:[...output.matchAll(/(?:^|\n)\s*(\d+) (passed|failed|skipped)\b/g)].map(m=>m[2]+':'+m[1]),failureSourceLocations:[...new Set([...output.matchAll(/(?:frontend|backend|scripts|test)[/\\][A-Za-z0-9_./\\-]+\.(?:ts|tsx|cjs|js):\d+(?::\d+)?/g)].map(m=>m[0]))].slice(0,12),rawOutputPublished:false};result.steps.push(step);save();console.log(JSON.stringify(step));if(step.result!=='PASS'){result.result='FAIL';save();process.exitCode=1;return;}
 }
 if(JSON.stringify(inspect())!==JSON.stringify(source))throw Error('R7_PRODUCT_SOURCE_CHANGED_DURING_RUN');result.result='PASS';result.finishedAt=new Date().toISOString();result.sourceUnchanged=true;save();console.log(JSON.stringify({result:'SCOPED_R7_PRODUCTS_PASS',sourceCommit:source.sourceCommit,record:path.relative(root,out),acceptanceEligible:false}));
}
main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message??'')?error.message:'R7_PRODUCT_CHECK_UNCONFIRMED');process.exitCode=1;});
