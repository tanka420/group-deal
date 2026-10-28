const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),{ethers}=require('../backend/node_modules/ethers');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
/** Offline review package. This module has no provider, wallet, signing or broadcast code. */
function prepareMainnet(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'shared/manifests/arc-mainnet.json'),'utf8'));
 if(manifest.chainId!==5042||manifest.environment!=='arc-mainnet'||manifest.contracts.USDC.address!=='0x3600000000000000000000000000000000000000')throw Error('MAINNET_NETWORK_INVALID');
 const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0');
 const names=[...new Set(tracked)].filter(f=>/^(?:backend\/src\/|frontend\/(?:src|build)\/|shared\/|sdk\/src\/|contracts\/contracts\/)/.test(f)||['contracts/hardhat.config.ts','scripts/prepare_mainnet.cjs','scripts/build_mainnet.cjs','scripts/local_check_runtime.cjs','scripts/local_network_guard.cjs','backend/package-lock.json','frontend/package-lock.json','contracts/package-lock.json','sdk/package-lock.json'].includes(f)).sort();
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
  return {contract:name,protocolVersion:index+1,compiler:build.solcLongVersion,compilerSettings:build.input.settings,
   abi:artifact.abi,creationBytecode:artifact.bytecode,creationBytecodeHash:ethers.keccak256(artifact.bytecode),
   runtimeBytecodeTemplate:artifact.deployedBytecode,runtimeBytecodeTemplateHash:ethers.keccak256(artifact.deployedBytecode),
   runtimeHashStatus:'TEMPLATE_ONLY_IMMUTABLES_REQUIRE_DEPLOYMENT_READBACK',
   constructor:{signature:'constructor(address usdcToken,address authorizedSigner,address operatorAddress,address securityAuthority)',arguments:[manifest.contracts.USDC.address,null,null,null],owner:'msg.sender; owner/deployer not selected'},
   unsignedTransaction:{chainId:5042,to:null,from:null,data:null,value:'0',nonce:null,gasLimit:null,maxFeePerGas:null,maxPriorityFeePerGas:null},
   transactionStatus:'NOT_CONSTRUCTED_AWAITING_VERSION_AND_AUTHORITY_ADDRESSES'};
 });
 return {schemaVersion:1,layer:'OFFLINE_MAINNET_PREPARATION',acceptanceEligible:false,signingAuthorized:false,broadcastAuthorized:false,activationAuthorized:false,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint,files,manifest,
  release:{frontend:{sourceFingerprint,environment:'arc-mainnet',artifact:null},backend:{sourceFingerprint,environment:'arc-mainnet',artifact:null}},
  candidates,blockers:['M01: select protocol version and release scope','M03: supply and verify owner, signer, operator and Safe addresses/owners/threshold','M04: approve budget and obtain a fresh nonce/fee quote','M05: independent review of the exact commit and bytecode','M06: owner-controlled deployment, finalized receipt, runtime hash and role readback','M09: separately approve service activation'],
  notes:['No Testnet address or signing key is used as a Mainnet deployment default.','Both variants are proposals; neither is selected for release.','A deployable transaction must be encoded with approved constructor addresses, sender, nonce and fee limits before asking for a signature.','Deployment block and actual runtime hash must come from a real finalized receipt; neither is predicted here.']};
}
function main(){
 if(process.argv.length>2)throw Error('MAINNET_PREPARATION_ACCEPTS_NO_SIGNING_OR_DEPLOY_ARGUMENTS');
 const report=prepareMainnet(),directory=path.join(root,'.cache/mainnet-preparation',report.sourceFingerprint);
 fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,'UNSIGNED_REVIEW.json');
 fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',layer:report.layer,sourceCommit:report.sourceCommit,sourceFingerprint:report.sourceFingerprint,path:target,candidates:report.candidates.map(c=>({contract:c.contract,creationBytecodeHash:c.creationBytecodeHash,transactionStatus:c.transactionStatus})),acceptanceEligible:false},null,2));
}
if(require.main===module)main();
module.exports={prepareMainnet};
