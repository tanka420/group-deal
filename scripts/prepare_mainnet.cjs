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
 const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0');
 const names=[...new Set(tracked)].filter(f=>/^(?:backend\/src\/|frontend\/(?:src|build)\/|shared\/|sdk\/src\/|contracts\/contracts\/)/.test(f)||['config/mainnet-contract-deployment.json','config/mainnet.env.example','contracts/hardhat.config.ts','scripts/prepare_mainnet.cjs','scripts/prepare_mainnet_safe.cjs','scripts/initialize_mainnet_secrets.ps1','scripts/validate_mainnet_secret_input.cjs','scripts/configure_mainnet_smtp.ps1','scripts/configure_mainnet_indexer.ps1','scripts/check_mainnet_providers.cjs','scripts/quote_mainnet_deployment.cjs','scripts/build_mainnet.cjs','scripts/local_check_runtime.cjs','scripts/local_network_guard.cjs','backend/package-lock.json','frontend/package-lock.json','contracts/package-lock.json','sdk/package-lock.json'].includes(f)).sort();
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
  const constructorArguments=selectedForRelease?(planSuperseded
   ?[manifest.contracts.USDC.address,manifest.roles.authorizedSigner.address||null,manifest.roles.operator.address||null,manifest.roles.securityAuthority.address||null]
   :[manifest.contracts.USDC.address,plannedRoles.authorizedSigner,plannedRoles.operator,plannedRoles.securityAuthority]):[manifest.contracts.USDC.address,null,null,null];
  const deploymentData=selectedForRelease&&!planSuperseded?ethers.concat([artifact.bytecode,new ethers.Interface(artifact.abi).encodeDeploy(constructorArguments)]):null;
  return {contract:name,protocolVersion:index+1,selectedForRelease:selectedVersion===index+1,compiler:build.solcLongVersion,compilerSettings:build.input.settings,
   abi:artifact.abi,creationBytecode:artifact.bytecode,creationBytecodeHash:ethers.keccak256(artifact.bytecode),
   runtimeBytecodeTemplate:artifact.deployedBytecode,runtimeBytecodeTemplateHash:ethers.keccak256(artifact.deployedBytecode),
   runtimeHashStatus:'TEMPLATE_ONLY_IMMUTABLES_REQUIRE_DEPLOYMENT_READBACK',
   constructor:{signature:'constructor(address usdcToken,address authorizedSigner,address operatorAddress,address securityAuthority)',arguments:constructorArguments,owner:ownerAddress||'msg.sender; owner/deployer not selected'},
   unsignedTransaction:{chainId:5042,to:null,from:ownerAddress,data:deploymentData,value:'0',nonce:null,gasLimit:null,maxFeePerGas:null,maxPriorityFeePerGas:null},
   deploymentDataHash:deploymentData?ethers.keccak256(deploymentData):null,
   transactionStatus:selectedForRelease?(planSuperseded?'NOT_CONSTRUCTED_AWAITING_PRODUCTION_ROLE_PLAN':'ENCODED_AWAITING_NONCE_FEES_BUDGET_AND_OWNER_SIGNATURE'):'NOT_SELECTED_FOR_RELEASE'};
 });
 const selected=candidates.find(candidate=>candidate.selectedForRelease);
 return {schemaVersion:1,layer:'OFFLINE_MAINNET_PREPARATION',acceptanceEligible:false,signingAuthorized:false,broadcastAuthorized:false,activationAuthorized:false,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint,files,manifest,deploymentPlan,
  release:{frontend:{sourceFingerprint,environment:'arc-mainnet',artifact:null},backend:{sourceFingerprint,environment:'arc-mainnet',artifact:null}},
  selectedCandidate:selected?{contract:selected.contract,protocolVersion:selected.protocolVersion,creationBytecodeHash:selected.creationBytecodeHash}:null,
  candidates,blockers:[...(selected?[]:['M01: select protocol version and release scope']),planSuperseded?'M03 before deployment: finalize production owner, signer, operator and Safe plan; historical constructor assignments are superseded':'M03 before runtime activation: rotate initial shared roles and verify the required Safe owners/threshold','M04: approve budget and obtain a fresh nonce/fee quote','M05: independent review of the exact commit and bytecode','M06: owner-controlled deployment, finalized receipt, runtime hash and role readback','M09: separately approve service activation'],
  notes:['No Testnet address or signing key is used as a Mainnet deployment default.',selected?`${selected.contract} is selected for Mainnet preparation; this selection does not authorize signing or broadcasting.`:'Both variants are proposals; neither is selected for release.',planSuperseded?'The previous contract-only plan is historical. Candidate constructor arguments now reflect the production manifest with nulls for missing addresses; historical assignments remain only in deploymentPlan. Creation calldata is withheld until the production role plan is finalized.':'Constructor calldata uses the user-selected contract-only deployment plan; this plan does not satisfy or weaken the production runtime guard.','A fresh nonce, fee quote and approved cost limit are required before asking for a signature.','Deployment block and actual runtime hash must come from a real finalized receipt; neither is predicted here.']};
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
