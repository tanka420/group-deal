import {ethers} from 'ethers';
import {createHash} from 'node:crypto';
export const sha256=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export class PreparationError extends Error {constructor(public readonly code:string){super(code);}}
const fail=(code:string):never=>{throw new PreparationError(code);};
const same=(a:any,b:any)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();

/** The old deploy script overwrites active manifests and always deploys protocol 1. */
export function assertLegacyDeploymentAllowed(networkName:string){
 if(!['hardhat','localhost'].includes(networkName))fail('LEGACY_ARC_DEPLOYMENT_DISABLED_USE_PREPARE');
}

/** A review artifact only. It has no nonce, signer, fee approval, submission or cutover authority. */
export function prepareCandidate(manifest:any,deployment:any,build:any,artifact:any,readSource:(name:string)=>string){
 if(manifest.chainId!==5042002||manifest.environment!=='arc-testnet'||!same(manifest.contracts?.USDC?.address,'0x3600000000000000000000000000000000000000'))fail('CANDIDATE_NETWORK_INVALID');
 if(deployment.status!=='PASS'||deployment.layer!=='READ_ONLY_FIXED_BLOCK_DEPLOYMENT'||deployment.acceptanceEligible!==false||deployment.candidateFrozen!==false||deployment.chainId!==manifest.chainId||!same(deployment.hub?.address,manifest.contracts?.GroupDealHub?.address)||!same(deployment.hub?.runtimeBytecodeHash,manifest.contracts?.GroupDealHub?.bytecodeHash)||!ethers.isHexString(deployment.fixedBlock?.hash,32)||!Number.isSafeInteger(deployment.fixedBlock?.number))fail('CURRENT_DEPLOYMENT_OBSERVATION_INVALID');
 const roleNames=['owner','authorizedSigner','operator','securityAuthority'],roles=Object.fromEntries(roleNames.map(n=>[n,manifest.roles?.[n]?.address]));
 if(roleNames.some(n=>!ethers.isAddress(roles[n])||same(roles[n],ethers.ZeroAddress))||new Set(Object.values(roles).map(v=>v.toLowerCase())).size!==4||roleNames.some(n=>!same(deployment.hub[n],roles[n])))fail('CANDIDATE_ROLES_INVALID');
 const authority=manifest.roles.securityAuthority,quorum=/^(\d+)-of-(\d+)$/.exec(authority.quorum||'');
 if(authority.type!=='safe-multisig'||!quorum||Number(quorum[1])<2||Number(quorum[1])>Number(quorum[2])||!same(deployment.safe?.address,roles.securityAuthority)||deployment.safe?.threshold!==Number(quorum[1])||deployment.safe?.owners?.length!==Number(quorum[2])||deployment.safe?.version!==authority.safeVersion)fail('CANDIDATE_SAFE_OBSERVATION_INVALID');
 const settings=build?.input?.settings;
 if(build?.solcVersion!=='0.8.24'||settings?.evmVersion!=='cancun'||settings.viaIR!==true||settings.optimizer?.enabled!==true||settings.optimizer.runs!==200)fail('CANDIDATE_COMPILER_SETTINGS_INVALID');
 const sourceName='contracts/GroupDealHubV2.sol',contractName='GroupDealHubV2',output=build.output?.contracts?.[sourceName]?.[contractName];
 if(artifact?.sourceName!==sourceName||artifact.contractName!==contractName||!output||artifact.bytecode!=='0x'+output.evm?.bytecode?.object||artifact.deployedBytecode!=='0x'+output.evm?.deployedBytecode?.object||JSON.stringify(artifact.abi)!==JSON.stringify(output.abi)||!ethers.isHexString(artifact.bytecode)||artifact.bytecode.length<4)fail('CANDIDATE_ARTIFACT_MISMATCH');
 if(Object.values(output.evm.bytecode.linkReferences||{}).length||Object.values(output.evm.deployedBytecode.linkReferences||{}).length)fail('CANDIDATE_UNRESOLVED_LIBRARY');
 if(!Object.keys(output.evm.deployedBytecode.immutableReferences||{}).length)fail('CANDIDATE_IMMUTABLE_REFERENCES_MISSING');
 const sources=Object.entries(build.input.sources||{}).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>{
  const content=(value as {content?:string}).content;if(typeof content!=='string')throw new PreparationError('CANDIDATE_COMPILER_SOURCE_MISSING');let actual:string;try{actual=readSource(name);}catch{throw new PreparationError('CANDIDATE_CURRENT_SOURCE_UNAVAILABLE');}
  if(actual!==content)fail('CANDIDATE_STALE_COMPILER_SOURCE');return{path:name,sha256:sha256(content)};
 });
 if(!sources.some(s=>s.path===sourceName))fail('CANDIDATE_COMPILER_SOURCE_MISSING');
 const runtimeBytes=ethers.getBytes(artifact.deployedBytecode).length;if(runtimeBytes>24576)fail('CANDIDATE_RUNTIME_SIZE_EXCEEDED');
 const constructorArguments=[manifest.contracts.USDC.address,roles.authorizedSigner,roles.operator,roles.securityAuthority],iface=new ethers.Interface(artifact.abi),encoded=iface.encodeDeploy(constructorArguments),data=ethers.concat([artifact.bytecode,encoded]);
 if(!iface.fragments.some(f=>f.type==='function'&&(f as ethers.FunctionFragment).name==='protocolVersion'))fail('CANDIDATE_PROTOCOL_ABI_INVALID');
 if(ethers.getBytes(data).length>49152)fail('CANDIDATE_INITCODE_SIZE_EXCEEDED');
 return{protocolVersion:2,contract:{sourceName,contractName,constructorArguments,ownerOnCreation:roles.owner},compiler:{version:build.solcVersion,longVersion:build.solcLongVersion,inputSha256:sha256(JSON.stringify(build.input)),settings,sources},creationBytecodeHash:ethers.keccak256(artifact.bytecode),runtimeTemplate:{byteLength:runtimeBytes,keccak256:ethers.keccak256(artifact.deployedBytecode),initialized:false,immutableReferences:output.evm.deployedBytecode.immutableReferences},unsignedCreation:{chainId:5042002,from:roles.owner,data,value:'0',nonce:null,gasLimit:null,feesApproved:false},currentDeploymentObservation:{protocolVersion:deployment.hub.protocolVersion,hubAddress:deployment.hub.address,fixedBlock:deployment.fixedBlock,verifiedAt:deployment.verifiedAt},scope:{broadcastReady:false,candidateFrozen:false,sourceVerifiedAgainstCompiler:true,initializedRuntimeComparedOnChain:false,financialBroadcast:false,activeManifestChanged:false,activeDataMutated:false,principalControlVerified:false},requiredBeforeBroadcast:['Freeze and independently review the candidate sources and compiled inputs','Fresh chain/roles/Safe/balance/nonce/fee reads and explicit owner review/signature','Verify initialized runtime with actual address/chain/USDC and canonical creation receipt','Stage a separate protocol2 manifest and shadow data; review rollout and recovery without changing existing orders']};
}
