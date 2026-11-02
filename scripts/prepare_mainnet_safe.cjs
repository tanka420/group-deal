const fs=require('node:fs'),path=require('node:path');
const {ethers}=require('../backend/node_modules/ethers');
const registry=require('../contracts/node_modules/@safe-global/safe-deployments');
const {prepareMainnet}=require('./prepare_mainnet.cjs');
const {createRpc}=require('./quote_mainnet_deployment.cjs');
const root=path.resolve(__dirname,'..'),SAFE_VERSION='1.5.0';
const address=v=>typeof v==='string'&&ethers.isAddress(v)&&v.toLowerCase()!==ethers.ZeroAddress;
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
function buildSafePlan(manifest){
 if(manifest.environment!=='arc-mainnet'||manifest.chainId!==5042||manifest.protocolVersion!==2)throw Error('MAINNET_SAFE_NETWORK_INVALID');
 const roles=manifest.roles,safe=roles?.securityAuthority,owners=safe?.owners;
 if(!roles||!['owner','authorizedSigner','operator'].every(k=>address(roles[k]?.address))
  ||new Set(['owner','authorizedSigner','operator'].map(k=>roles[k].address.toLowerCase())).size!==3
  ||safe?.type!=='safe-multisig'||!Array.isArray(owners)||owners.length!==2||!owners.every(address)||same(owners[0],owners[1])||safe.threshold!==2
  ||!owners.some(a=>same(a,roles.owner.address))||!owners.some(a=>same(a,roles.operator.address))||safe.address!=='')throw Error('MAINNET_SAFE_ROLE_PLAN_INVALID');
 const contracts={};
 for(const [key,fn]of Object.entries({singleton:'getSafeL2SingletonDeployment',factory:'getProxyFactoryDeployment',fallbackHandler:'getCompatibilityFallbackHandlerDeployment'})){
  const entry=registry[fn]({version:SAFE_VERSION,network:'5042'}),canonical=entry?.deployments?.canonical;
  if(!entry?.released||entry.version!==SAFE_VERSION||!canonical||!address(canonical.address)
   ||!/^0x[0-9a-f]{64}$/i.test(canonical.codeHash)||!same(entry.networkAddresses?.['5042']||'',canonical.address))throw Error('MAINNET_SAFE_REGISTRY_INVALID');
  contracts[key]={address:ethers.getAddress(canonical.address),runtimeBytecodeHash:canonical.codeHash,interface:new ethers.Interface(entry.abi)};
 }
 const saltNonce=BigInt(ethers.id(`groupdeal:arc-mainnet:security-safe:v1:${owners.map(ethers.getAddress).join(':')}:2`)).toString();
 const initializer=contracts.singleton.interface.encodeFunctionData('setup',[owners,2,ethers.ZeroAddress,'0x',contracts.fallbackHandler.address,ethers.ZeroAddress,0,ethers.ZeroAddress]);
 const data=contracts.factory.interface.encodeFunctionData('createProxyWithNonce',[contracts.singleton.address,initializer,saltNonce]);
 return {chainId:5042,safeVersion:SAFE_VERSION,owners:owners.map(ethers.getAddress),threshold:2,from:roles.owner.address,
  signer:roles.authorizedSigner.address,operator:roles.operator.address,contracts,saltNonce,initializer,data,
  setup:{delegateCallTarget:ethers.ZeroAddress,delegateCallData:'0x',fallbackHandler:contracts.fallbackHandler.address,paymentToken:ethers.ZeroAddress,payment:'0',paymentReceiver:ethers.ZeroAddress}};
}
async function inspectSafePlan(preparation,rpc){
 const plan=buildSafePlan(preparation.manifest);
 if(BigInt(await rpc('eth_chainId',[]))!==5042n)throw Error('MAINNET_SAFE_CHAIN_MISMATCH');
 const block=await rpc('eth_getBlockByNumber',['finalized',false]);
 if(!block||!ethers.isHexString(block.hash,32)||!/^0x[0-9a-f]+$/i.test(block.number)||!/^0x[0-9a-f]+$/i.test(block.timestamp)
  ||Math.abs(Date.now()/1000-Number(BigInt(block.timestamp)))>120)throw Error('MAINNET_SAFE_FINALIZED_BLOCK_UNAVAILABLE');
 const pins=[];
 for(const [name,entry]of Object.entries(plan.contracts)){
  const code=await rpc('eth_getCode',[entry.address,block.number]);
  if(!ethers.isHexString(code)||code==='0x'||!same(ethers.keccak256(code),entry.runtimeBytecodeHash))throw Error(`MAINNET_SAFE_CODE_MISMATCH: ${name}`);
  pins.push({name,address:entry.address,runtimeBytecodeHash:entry.runtimeBytecodeHash});
 }
 const singleton=plan.contracts.singleton,factory=plan.contracts.factory;
 const version=singleton.interface.decodeFunctionResult('VERSION',await rpc('eth_call',[{to:singleton.address,data:singleton.interface.encodeFunctionData('VERSION')},block.number]))[0];
 if(version!==SAFE_VERSION)throw Error('MAINNET_SAFE_VERSION_MISMATCH');
 for(const [name,a]of Object.entries({deployer:plan.from,signer:plan.signer,operator:plan.operator})){
  if(await rpc('eth_getCode',[a,block.number])!=='0x')throw Error(`MAINNET_SAFE_EXPECTED_EOA: ${name}`);
 }
 const proxyCreationCode=factory.interface.decodeFunctionResult('proxyCreationCode',await rpc('eth_call',[{to:factory.address,data:factory.interface.encodeFunctionData('proxyCreationCode')},block.number]))[0];
 const salt=ethers.solidityPackedKeccak256(['bytes32','uint256'],[ethers.keccak256(plan.initializer),plan.saltNonce]);
 const deploymentCode=ethers.concat([proxyCreationCode,ethers.AbiCoder.defaultAbiCoder().encode(['uint256'],[BigInt(singleton.address)])]);
 const predictedSafeAddress=ethers.getCreate2Address(factory.address,salt,ethers.keccak256(deploymentCode));
 if([plan.from,plan.signer,plan.operator].some(a=>same(a,predictedSafeAddress)))throw Error('MAINNET_SAFE_ROLE_COLLISION');
 const existingCode=await rpc('eth_getCode',[predictedSafeAddress,block.number]);
 if(existingCode!=='0x')throw Error('MAINNET_SAFE_PREDICTED_ADDRESS_ALREADY_DEPLOYED_REQUIRES_READBACK');
 const creation={from:plan.from,to:factory.address,data:plan.data,value:'0x0'};
 const result=factory.interface.decodeFunctionResult('createProxyWithNonce',await rpc('eth_call',[creation,block.number]))[0];
 if(!same(result,predictedSafeAddress))throw Error('MAINNET_SAFE_PREDICTION_SIMULATION_MISMATCH');
 const canonical=await rpc('eth_getBlockByNumber',[block.number,false]);
 if(canonical?.hash!==block.hash||BigInt(await rpc('eth_chainId',[]))!==5042n)throw Error('MAINNET_SAFE_CONTEXT_CHANGED');
 return {schemaVersion:1,layer:'UNSIGNED_MAINNET_SAFE_PREPARATION',status:'PREPARED_AND_SIMULATED_NOT_DEPLOYED',recordedAt:new Date().toISOString(),
  sourceCommit:preparation.sourceCommit,sourceFingerprint:preparation.sourceFingerprint,chainId:5042,
  block:{number:block.number,hash:block.hash,timestamp:block.timestamp},safeVersion:SAFE_VERSION,owners:plan.owners,threshold:2,
  contracts:pins,saltNonce:plan.saltNonce,initializer:plan.initializer,setup:plan.setup,predictedSafeAddress,
  unsignedTransaction:{chainId:5042,...creation,nonce:null,gasLimit:null,maxFeePerGas:null,maxPriorityFeePerGas:null},dataHash:ethers.keccak256(plan.data),
  simulation:{method:'eth_call',returnedAddress:ethers.getAddress(result),actualDeployment:false},
  budgetApproved:false,signingAuthorized:false,broadcastAuthorized:false,activationAuthorized:false,acceptanceEligible:false,
  notes:['The deterministic address has no code at the inspected finalized block. It is not a deployed Safe.','Before any signature, obtain fresh nonce/gas/fee/budget and verify all code pins and owner assignments again.','After deployment, verify the actual proxy, singleton, fallback, owners, threshold, nonce, modules/guards and finalized receipt before pinning the runtime manifest.','No private key, credential, wallet connection, signature, funding, transaction submission, or service activation is used.']};
}
async function main(){
 if(process.argv.length>2)throw Error('MAINNET_SAFE_PREPARATION_ACCEPTS_NO_SIGNING_OR_DEPLOY_ARGUMENTS');
 const before=prepareMainnet(),report=await inspectSafePlan(before,createRpc(before.manifest.rpc.primary));
 if(prepareMainnet().sourceFingerprint!==before.sourceFingerprint)throw Error('MAINNET_SAFE_SOURCE_CHANGED');
 const directory=path.join(root,'.cache/mainnet-preparation',before.sourceFingerprint);fs.mkdirSync(directory,{recursive:true});
 const target=path.join(directory,'UNSIGNED_SAFE_REVIEW.json');fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,sourceCommit:report.sourceCommit,sourceFingerprint:report.sourceFingerprint,path:target,
  chainId:5042,safeVersion:SAFE_VERSION,owners:report.owners,threshold:2,predictedSafeAddress:report.predictedSafeAddress,dataHash:report.dataHash,actualDeployment:false,broadcastAuthorized:false},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={buildSafePlan,inspectSafePlan};
