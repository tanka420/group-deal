'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),packet=require('./ui_orders_packet.json');
const infra=['.github/workflows/local-candidate.yml','scripts/run_ui_orders_checks.cjs','scripts/ui_orders_packet.json'];
const git=(args,bytes=false)=>cp.execFileSync('git',args,{cwd:root,encoding:bytes?undefined:'utf8',windowsHide:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=git(['rev-parse','HEAD']).trim();
if(git(['status','--porcelain']).trim())throw Error('UI_DELTA_DIRTY');
const changed=git(['diff','--name-only',packet.baselineCommit,packet.applicationCommit]).trim().split('\n').sort();
if(JSON.stringify(changed)!==JSON.stringify(packet.files.map(f=>f.path).sort()))throw Error('UI_DELTA_SCOPE_MISMATCH');
for(const f of packet.files)if(sha(git(['show',packet.applicationCommit+':'+f.path],true))!==f.sha256)throw Error('UI_DELTA_BYTES_MISMATCH');
const extra=git(['diff','--name-only',packet.applicationCommit,'HEAD']).trim().split('\n').filter(Boolean);
if(extra.some(p=>!infra.includes(p)))throw Error('UI_APPLICATION_CHANGED');
if(process.argv.includes('--check-scope')){console.log(JSON.stringify({result:'UI_SCOPE_PASS',source,application:packet.applicationCommit,files:changed.length}));process.exit(0);}
const {localCheckEnvironment}=require('./local_check_runtime.cjs'),env=localCheckEnvironment(root);
const commands=[
 ['backend-build',process.execPath,['backend/node_modules/typescript/bin/tsc','--project','backend/tsconfig.json']],
 ['order-list-unit',process.execPath,['backend/node_modules/tsx/dist/cli.mjs','frontend/test/order_list.test.ts']],
 ['route-unit',process.execPath,['backend/node_modules/tsx/dist/cli.mjs','frontend/test/app_route.test.ts']],
 ['frontend-build',process.execPath,['frontend/node_modules/typescript/bin/tsc','--project','frontend/tsconfig.json']],
 ['frontend-bundle',process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'build'],path.join(root,'frontend')],
 ['built-browser',process.execPath,['scripts/run_browser_checks.cjs','--preview','--port=4192','--','buyer_integration.spec.ts','buyer_order_view.spec.ts','buyer_resources.spec.ts','operator_deal_sections.spec.ts','--workers=1']],
 ['built-support-follows',process.execPath,['scripts/run_browser_checks.cjs','--preview','--port=4192','--','support_tickets.spec.ts','seller_follow.spec.ts','--grep','order ticket is shared|own account list|account paging|product UI saves','--workers=1']],
];
const result={schemaVersion:1,recordedAt:new Date().toISOString(),sourceCommit:source,applicationCommit:packet.applicationCommit,scope:'UI_ORDERS_ONLY',checks:[],result:'RUNNING',acceptanceEligible:false,isolatedBackendFixtureOnly:true,liveOrSnapshotDatabaseStarted:false};
fs.mkdirSync(path.join(root,'.cache'),{recursive:true});const out=path.join(root,'.cache/ui-orders-'+Date.now()+'.json');
for(const [name,command,args,cwd] of commands){const start=Date.now(),r=cp.spawnSync(command,args,{cwd:cwd||root,env:name==='frontend-bundle'?{...env,NODE_ENV:'production'}:env,windowsHide:true,stdio:'inherit'});result.checks.push({name,exitCode:r.status,durationMs:Date.now()-start});if(r.status!==0){result.result='FAIL';fs.writeFileSync(out,JSON.stringify(result,null,2));process.exit(1);}}
result.result='PASS';fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
