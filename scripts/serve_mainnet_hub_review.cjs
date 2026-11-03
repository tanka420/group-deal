'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {ethers}=require('../backend/node_modules/ethers'),{prepareMainnet}=require('./prepare_mainnet.cjs'),{quoteDeployment,createRpc}=require('./quote_mainnet_deployment.cjs'),{createReviewServer}=require('./serve_mainnet_safe_review.cjs');
const root=path.resolve(__dirname,'..'),same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function validateHubBudget(budget,preparation){
 const candidate=preparation.candidates.find(c=>c.selectedForRelease);
 if(budget?.schemaVersion!==1||budget.scope!=='PRODUCTION_HUB_V2_DEPLOYMENT'||budget.chainId!==5042||budget.nativeValue!=='0'||budget.maximumGasCostNative!=='250000000000000000'||budget.maximumGasCostUsdc!=='0.25'
  ||budget.budgetApproved!==true||typeof budget.signingAuthorized!=='boolean'||budget.signingAuthorized!==budget.broadcastAuthorized||budget.activationAuthorized!==false
  ||!preparation.productionDeploymentPlan||candidate?.contract!=='GroupDealHubV2'||!same(candidate.unsignedTransaction.from,budget.from)||!same(candidate.deploymentDataHash,budget.dataHash)
  ||budget.nonce!=='0x1'||!ethers.isAddress(budget.expectedContractAddress)||!same(budget.expectedContractAddress,ethers.getCreateAddress({from:budget.from,nonce:1})))throw Error('HUB_REVIEW_BUDGET_OR_SCOPE_INVALID');
 return candidate;
}
async function hubQuote(){
 if(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim()!=='codex/mainnet'||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('HUB_REVIEW_SOURCE_UNCOMMITTED');
 const p=prepareMainnet(),budget=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-hub-budget.json')));validateHubBudget(budget,p);
 if(execFileSync('git',['rev-parse','refs/remotes/origin/codex/mainnet'],{cwd:root,encoding:'utf8'}).trim()!==p.sourceCommit)throw Error('HUB_REVIEW_SOURCE_NOT_PUSHED');
 const quoted=await quoteDeployment(p,createRpc(p.manifest.rpc.primary));
 if(!same(quoted.expectedContractAddress,budget.expectedContractAddress)||quoted.unsignedTransaction.nonce!==budget.nonce)throw Error('HUB_REVIEW_NONCE_OR_ADDRESS_CHANGED');
 if(BigInt(quoted.fees.maximumGasCostNative)>BigInt(budget.maximumGasCostNative)||!quoted.sender.sufficientForMaximumGasCost)throw Error('HUB_REVIEW_GAS_BUDGET_OR_BALANCE');
 if(prepareMainnet().sourceFingerprint!==p.sourceFingerprint)throw Error('HUB_REVIEW_SOURCE_CHANGED');
 const report={...quoted,budgetApproved:true,signingAuthorized:budget.signingAuthorized,broadcastAuthorized:budget.broadcastAuthorized,approvedBudget:{scope:budget.scope,maximumGasCostNative:budget.maximumGasCostNative,maximumGasCostUsdc:'0.25',nativeValue:'0'}};
 const directory=path.join(root,'.cache/mainnet-preparation',p.sourceFingerprint);fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'HUB_QUOTE-'+crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return {report,file};
}
async function main(){
 const args=process.argv.slice(2),port=args.length===1&&/^--port=\d{4,5}$/.test(args[0])?Number(args[0].slice(7)):0;
 if(args.length&&(args.length!==1||port<1024||port>65535))throw Error('HUB_REVIEW_ACCEPTS_ONLY_LOCAL_PORT');
 const initial=await hubQuote(),p=prepareMainnet(),budget=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-hub-budget.json'))),candidate=validateHubBudget(budget,p);
 if(initial.report.sourceFingerprint!==p.sourceFingerprint)throw Error('HUB_REVIEW_SOURCE_CHANGED');
 const packet={...budget,sourceCommit:p.sourceCommit,sourceFingerprint:p.sourceFingerprint,constructorArguments:candidate.constructor.arguments,securityAuthority:p.manifest.roles.securityAuthority.address,owners:p.manifest.roles.securityAuthority.owners};
 const built=await require('../backend/node_modules/esbuild').build({entryPoints:[path.join(__dirname,'mainnet-safe-page/client.mjs')],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minify:true,nodePaths:[path.join(root,'backend/node_modules')],define:{__SAFE_REVIEW_PACKET__:JSON.stringify(packet)}});
 if(built.outputFiles.length!==1||prepareMainnet().sourceFingerprint!==p.sourceFingerprint)throw Error('HUB_REVIEW_BUILD_CHANGED');
 const files={'/':{bytes:fs.readFileSync(path.join(__dirname,'mainnet-hub-page/index.html')),type:'text/html'},'/client.js':{bytes:built.outputFiles[0].contents,type:'text/javascript'},'/style.css':{bytes:fs.readFileSync(path.join(__dirname,'mainnet-safe-page/style.css')),type:'text/css'}};
 const attemptDirectory=path.join(root,'.cache/mainnet-hub-attempts',budget.dataHash.slice(2)),assertContext=()=>{if(prepareMainnet().sourceFingerprint!==p.sourceFingerprint)throw Error('HUB_REVIEW_SOURCE_CHANGED');};
 const server=createReviewServer({packet,files,quoteLoader:hubQuote,attemptDirectory,assertContext});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 const directory=path.join(root,'.cache/mainnet-hub-review',crypto.randomUUID());fs.mkdirSync(directory,{recursive:true});const artifactDirectory=path.join(directory,'page');fs.mkdirSync(artifactDirectory);for(const [route,item]of Object.entries(files))fs.writeFileSync(path.join(artifactDirectory,route==='/'?'index.html':route.slice(1)),item.bytes,{flag:'wx'});
 const record={schemaVersion:1,result:'LOCAL_HUB_V2_REVIEW_READY',recordedAt:new Date().toISOString(),sourceCommit:p.sourceCommit,sourceFingerprint:p.sourceFingerprint,url:'http://127.0.0.1:'+server.address().port,files:Object.entries(files).map(([route,item])=>({route,sha256:crypto.createHash('sha256').update(item.bytes).digest('hex')})),budgetApproved:true,maximumGasCostUsdc:'0.25',signingAuthorized:budget.signingAuthorized,broadcastAuthorized:budget.broadcastAuthorized,activationAuthorized:false,transactionSubmitted:false,initialQuote:initial.file,artifactDirectory,attemptDirectory};
 const reportPath=path.join(directory,'SERVE.json');fs.writeFileSync(reportPath,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({url:record.url,reportPath,sourceCommit:p.sourceCommit,budgetApproved:true,maximumGasCostUsdc:'0.25',signingAuthorized:record.signingAuthorized,broadcastAuthorized:record.broadcastAuthorized}));
}
module.exports={validateHubBudget,hubQuote};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
