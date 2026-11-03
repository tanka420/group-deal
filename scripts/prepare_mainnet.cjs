const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),{ethers}=require('../backend/node_modules/ethers');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
/** Offline review package. This module has no provider, wallet, signing or broadcast code. */
function prepareMainnet(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'shared/manifests/arc-mainnet.json'),'utf8'));
 if(manifest.chainId!==5042||manifest.environment!=='arc-mainnet'||manifest.contracts.USDC.address!=='0x3600000000000000000000000000000000000000')throw Error('MAINNET_NETWORK_INVALID');
 const selectedVersion=manifest.protocolVersion;
 if(selectedVersion!==null&&![1,2].includes(selectedVersion))throw Error('MAINNET_PROTOCOL_VERSION_INVALID');
 const ownerAddress=manifest.roles?.owner?.address||null;
 if(ownerAddress&&(!ethers.isAddress(ownerAddress)||ownerAddress===ethers.ZeroAddress))throw Error('MAINNET_OWNER_ADDRESS_INVALID');
 const deploymentPlan=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-contract-deployment.json'),'utf8'));
 const planSuperseded=deploymentPlan.releaseStatus==='SUPERSEDED';
 const plannedRoles=deploymentPlan.roles;
 if(deploymentPlan.schemaVersion!==1||deploymentPlan.scope!=='CONTRACT_DEPLOYMENT_ONLY'||deploymentPlan.environment!=='arc-mainnet'||deploymentPlan.chainId!==5042
  ||deploymentPlan.protocolVersion!==selectedVersion||deploymentPlan.runtimeActivationAuthorized!==false
  ||!plannedRoles||!['owner','authorizedSigner','operator','securityAuthority'].every(k=>ethers.isAddress(plannedRoles[k])&&plannedRoles[k]!==ethers.ZeroAddress)
  ||plannedRoles.owner.toLowerCase()!==ownerAddress?.toLowerCase()
  ||plannedRoles.operator.toLowerCase()===plannedRoles.securityAuthority.toLowerCase())throw Error('MAINNET_CONTRACT_DEPLOYMENT_PLAN_INVALID');
 const productionFile=path.join(root,'config/mainnet-hub-deployment.json');
 const productionDeploymentPlan=fs.existsSync(productionFile)?JSON.parse(fs.readFileSync(productionFile,'utf8')):null;
 const deploymentComplete=productionDeploymentPlan?.releaseStatus==='FINALIZED_VERIFIED';
 if(productionDeploymentPlan){
  const p=productionDeploymentPlan,safe=manifest.roles.securityAuthority,roleNames=['owner','authorizedSigner','operator','securityAuthority'];
  if(p.schemaVersion!==1||p.scope!=='PRODUCTION_HUB_V2_DEPLOYMENT'||!['PREPARED_FOR_OWNER_REVIEW','FINALIZED_VERIFIED'].includes(p.releaseStatus)||p.environment!=='arc-mainnet'||p.chainId!==5042||p.protocolVersion!==2||selectedVersion!==2
   ||!roleNames.every(k=>ethers.isAddress(p.roles?.[k])&&p.roles[k]!==ethers.ZeroAddress&&p.roles[k].toLowerCase()===manifest.roles[k].address.toLowerCase())||new Set(roleNames.map(k=>p.roles[k].toLowerCase())).size!==4
   ||safe.type!=='safe-multisig'||safe.owners.length!==2||safe.threshold!==2||safe.safeVersion!=='1.5.0'||!ethers.isHexString(safe.bytecodeHash,32)||!ethers.isHexString(safe.deploymentTxHash,32)||!Number.isSafeInteger(safe.deploymentBlock)||safe.deploymentBlock<=0
   ||p.safe?.version!==safe.safeVersion||p.safe?.bytecodeHash!==safe.bytecodeHash||p.safe?.deploymentTxHash!==safe.deploymentTxHash||p.safe?.deploymentBlock!==safe.deploymentBlock
   ||['budgetApproved','signingAuthorized','broadcastAuthorized','runtimeActivationAuthorized'].some(k=>p[k]!==false))throw Error('MAINNET_PRODUCTION_HUB_PLAN_INVALID');
  if(deploymentComplete&&(manifest.deploymentStatus!=='VERIFIED'||!p.deployment||JSON.stringify(p.deployment)!==JSON.stringify(manifest.contracts.GroupDealHub)))throw Error('MAINNET_DEPLOYED_HUB_PLAN_MISMATCH');
 }
 const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0');
 const names=[...new Set(tracked)].filter(f=>/^(?:backend\/src\/|frontend\/(?:src|build)\/|shared\/|sdk\/src\/|contracts\/contracts\/|scripts\/mainnet-safe-page\/)/.test(f)||['config/mainnet-contract-deployment.json','config/mainnet-safe-budget.json','config/mainnet.env.example','contracts/hardhat.config.ts','scripts/prepare_mainnet.cjs','scripts/prepare_mainnet_safe.cjs','scripts/quote_mainnet_safe.cjs','scripts/serve_mainnet_safe_review.cjs','scripts/initialize_mainnet_secrets.ps1','scripts/validate_mainnet_secret_input.cjs','scripts/configure_mainnet_smtp.ps1','scripts/configure_mainnet_indexer.ps1','scripts/check_mainnet_providers.cjs','scripts/quote_mainnet_deployment.cjs','scripts/build_mainnet.cjs','scripts/local_check_runtime.cjs','scripts/local_network_guard.cjs','backend/package-lock.json','frontend/package-lock.json','contracts/package-lock.json','sdk/package-lock.json'].includes(f)).sort();
 for(const extra of ['config/mainnet-hub-deployment.json','config/mainnet-hub-budget.json','scripts/verify_mainnet_safe.cjs','scripts/verify_mainnet_hub.cjs','scripts/serve_mainnet_hub_review.cjs','scripts/mainnet-hub-page/index.html','scripts/prepare_mainnet_release.cjs','scripts/export_mainnet_credentials.ps1',...tracked.filter(f=>f.startsWith('scripts/mainnet-ops/'))])if(tracked.includes(extra)&&!names.includes(extra))names.push(extra);
 names.sort();
 const files=names.map(f=>({path:f,sha256:sha(fs.readFileSync(path.join(root,f)))}));
 const sourceFingerprint=sha(JSON.stringify(files));
 const candidates=['GroupDealHub','GroupDealHubV2'].map((name,index)=>{
  const artifactPath=path.join(root,`contracts/artifacts/contracts/${name}.sol/${name}.json`),artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8'));
  const debug=JSON.parse(fs.readFileSync(artifactPath.replace('.json','.dbg.json'),'utf8'));
  const build=JSON.parse(fs.readFileSync(path.resolve(path.dirname(artifactPath),debug.buildInfo),'utf8'));
  if(!build.solcLongVersion.startsWith('0.8.24+')||build.input.settings.evmVersion!=='cancun'||build.input.settings.viaIR!==true||build.input.settings.optimizer?.runs!==200)throw Error('MAINNET_COMPILER_SETTINGS_MISMATCH');
  for(const [f,v]of Object.entries(build.input.sources)){
   const filename=path.join(root,'contracts',f.startsWith('@')?'node_modules/'+f:f);
   if(fs.readFileSync(filename,'utf8')!==v.content)throw Error('MAINNET_BUILD_SOURCE_CHANGED: '+f);
  }
  if(!ethers.isHexString(artifact.bytecode)||!ethers.isHexString(artifact.deployedBytecode))throw Error('MAINNET_UNLINKED_BYTECODE');
  const selectedForRelease=selectedVersion===index+1;
  const activeRoles=productionDeploymentPlan?.roles||plannedRoles;
  const constructorArguments=selectedForRelease?(productionDeploymentPlan?[manifest.contracts.USDC.address,activeRoles.authorizedSigner,activeRoles.operator,activeRoles.securityAuthority]:planSuperseded
   ?[manifest.contracts.USDC.address,manifest.roles.authorizedSigner.address||null,manifest.roles.operator.address||null,manifest.roles.securityAuthority.address||null]
   :[manifest.contracts.USDC.address,plannedRoles.authorizedSigner,plannedRoles.operator,plannedRoles.securityAuthority]):[manifest.contracts.USDC.address,null,null,null];
  const deploymentData=selectedForRelease&&(productionDeploymentPlan||!planSuperseded)?ethers.concat([artifact.bytecode,new ethers.Interface(artifact.abi).encodeDeploy(constructorArguments)]):null;
  return {contract:name,protocolVersion:index+1,selectedForRelease:selectedVersion===index+1,compiler:build.solcLongVersion,compilerSettings:build.input.settings,
   abi:artifact.abi,creationBytecode:artifact.bytecode,creationBytecodeHash:ethers.keccak256(artifact.bytecode),
   runtimeBytecodeTemplate:artifact.deployedBytecode,runtimeBytecodeTemplateHash:ethers.keccak256(artifact.deployedBytecode),
   runtimeHashStatus:'TEMPLATE_ONLY_IMMUTABLES_REQUIRE_DEPLOYMENT_READBACK',
   constructor:{signature:'constructor(address usdcToken,address authorizedSigner,address operatorAddress,address securityAuthority)',arguments:constructorArguments,owner:ownerAddress||'msg.sender; owner/deployer not selected'},
   unsignedTransaction:{chainId:5042,to:null,from:ownerAddress,data:deploymentData,value:'0',nonce:null,gasLimit:null,maxFeePerGas:null,maxPriorityFeePerGas:null},
   deploymentDataHash:deploymentData?ethers.keccak256(deploymentData):null,
   transactionStatus:selectedForRelease?(deploymentComplete?'DEPLOYED_VERIFIED_NO_NEW_TRANSACTION':productionDeploymentPlan?'ENCODED_PRODUCTION_V2_AWAITING_BUDGET_AND_OWNER_SIGNATURE':planSuperseded?'NOT_CONSTRUCTED_AWAITING_PRODUCTION_ROLE_PLAN':'ENCODED_AWAITING_NONCE_FEES_BUDGET_AND_OWNER_SIGNATURE'):'NOT_SELECTED_FOR_RELEASE'};
 });
 const selected=candidates.find(candidate=>candidate.selectedForRelease);
 return {schemaVersion:1,layer:'OFFLINE_MAINNET_PREPARATION',acceptanceEligible:false,signingAuthorized:false,broadcastAuthorized:false,activationAuthorized:false,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint,files,manifest,deploymentPlan,productionDeploymentPlan,
  release:{frontend:{sourceFingerprint,environment:'arc-mainnet',artifact:null},backend:{sourceFingerprint,environment:'arc-mainnet',artifact:null}},
  selectedCandidate:selected?{contract:selected.contract,protocolVersion:selected.protocolVersion,creationBytecodeHash:selected.creationBytecodeHash}:null,
  candidates,blockers:[...(selected?[]:['M01: select protocol version and release scope']),...(productionDeploymentPlan?[]:[planSuperseded?'M03 before deployment: finalize production owner, signer, operator and Safe plan; historical constructor assignments are superseded':'M03 before runtime activation: rotate initial shared roles and verify the required Safe owners/threshold']),...(deploymentComplete?['M07: separately scope limited live application/financial acceptance']:['M04: approve budget and obtain a fresh nonce/fee quote','M06: owner-controlled deployment, finalized receipt, runtime hash and role readback']),'M05: independent review of the exact commit and bytecode','M09: separately approve service activation'],
  notes:['No Testnet address or signing key is used as a Mainnet deployment default.',selected?`${selected.contract} is selected for Mainnet preparation; this selection does not authorize signing or broadcasting.`:'Both variants are proposals; neither is selected for release.',productionDeploymentPlan?'The historical contract-only plan remains superseded. Constructor data uses the distinct production roles and verified Safe in mainnet-hub-deployment.json; no budget, signing, broadcast or activation authority is granted.':planSuperseded?'The previous contract-only plan is historical. Candidate constructor arguments now reflect the production manifest with nulls for missing addresses; historical assignments remain only in deploymentPlan. Creation calldata is withheld until the production role plan is finalized.':'Constructor calldata uses the user-selected contract-only deployment plan; this plan does not satisfy or weaken the production runtime guard.','A fresh nonce, fee quote and approved cost limit are required before asking for a signature.','Deployment block and actual runtime hash must come from a real finalized receipt; neither is predicted here.']};
}
function main(){
 if(process.argv.length>2)throw Error('MAINNET_PREPARATION_ACCEPTS_NO_SIGNING_OR_DEPLOY_ARGUMENTS');
 const report=prepareMainnet(),directory=path.join(root,'.cache/mainnet-preparation',report.sourceFingerprint);
 fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,'UNSIGNED_REVIEW.json');
 fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',layer:report.layer,sourceCommit:report.sourceCommit,sourceFingerprint:report.sourceFingerprint,path:target,selectedCandidate:report.selectedCandidate,candidates:report.candidates.map(c=>({contract:c.contract,creationBytecodeHash:c.creationBytecodeHash,selectedForRelease:c.selectedForRelease,transactionStatus:c.transactionStatus})),acceptanceEligible:false},null,2));
}
if(require.main===module)main();
module.exports={prepareMainnet};
