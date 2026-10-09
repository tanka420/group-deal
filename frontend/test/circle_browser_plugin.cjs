const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function main(){
 const root=path.resolve(__dirname,'..');
 const {loadConfigFromFile}=await import('vite');
 const loaded=await loadConfigFromFile({command:'build',mode:'test'},path.join(root,'vite.config.ts'),root);
 assert.ok(loaded,'Actual Vite configuration must load');
 const plugin=loaded.config.plugins.find(p=>p?.name==='groupdeal-circle-decode-only');
 assert.ok(plugin,'Actual build must install the scoped adapter');
 const entry=require.resolve('@circle-fin/w3s-pw-web-sdk'),original=fs.readFileSync(entry,'utf8');
 plugin.configResolved({root});
 const production=plugin.transform(original,entry);
 assert.equal((production.code.match(/src\/vendor\/circleJwtDecode.cjs/g)||[]).length,1);
 assert.equal(production.code.includes('require("jsonwebtoken")'),false);
 assert.equal(plugin.transform('require("jsonwebtoken")',path.join(root,'src/unrelated.cjs')),undefined,'Do not redirect another importer');
 assert.throws(()=>plugin.transform(original+'\n// changed installed source',entry),/Unexpected Circle source/,'Fail closed on an unexpected transform');
 const configured=plugin.config(),prebundle=configured.optimizeDeps.rolldownOptions.plugins.find(p=>p.name==='groupdeal-circle-decode-prebundle');
 assert.equal(prebundle.transform(original,entry).code,production.code,'Development and production must use the same source replacement');
 const inventory=loaded.config.plugins.find(p=>p?.name==='groupdeal-bundle-inventory');assert.ok(inventory,'Production runtime guard must always be installed');
 assert.throws(()=>inventory.writeBundle({}, {'bad.js':{type:'chunk',modules:{[path.join(root,'node_modules/react/cjs/react.development.js')]:{}}}}),/React development runtime/,'Reject a frontend artifact compiled with the development React runtime');
 console.log(JSON.stringify({result:'PASS',cases:7,layer:'LOCAL_SCOPED_BUILD_PLUGIN',acceptanceEligible:false,scope:'Actual Vite config, SDK-only importer, exact source guard, production/prebundle parity, React production guard'}));
}
main().catch(()=>{console.error('Circle build plugin regression failed');process.exitCode=1;});
