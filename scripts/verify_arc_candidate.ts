import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
const requireFromBackend=createRequire(path.resolve(__dirname,'../backend/package.json')),{ethers}=requireFromBackend('ethers'),dotenv=requireFromBackend('dotenv');
const {OpsCheckError,writeOpsEvidence,toolInputs,sha256}=require('./ops_evidence.cjs');
const fail=(code:string):never=>{throw new OpsCheckError(code);},same=(a:any,b:any)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const knownSafe={address:'0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6',owners:['0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d','0xc289b853d90F2C604FD38458B1cE4B991156d18B','0x7366adBf19E511095e7737138498f625D737dB22']};
const hubAbi=['function owner() view returns(address)','function authorizedSigner() view returns(address)','function operatorAddress() view returns(address)','function securityAuthority() view returns(address)','function usdcToken() view returns(address)','function nextCampaignId() view returns(uint256)','function nextOrderId() view returns(uint256)','function protocolVersion() view returns(uint256)'];
const safeAbi=['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function VERSION() view returns(string)'];

/** Fixed-block deployment identity readback. Counts/balance are observations, never accounting acceptance. */
export async function checkArcDeployment(manifest:any,provider:any){
 let phase='MANIFEST';
 try{
  const declaration=manifest.contracts?.GroupDealHub,token=manifest.contracts?.USDC?.address,roles=manifest.roles,safeDeclaration=roles?.securityAuthority,protocolVersion=manifest.protocolVersion??1;
  if(manifest.chainId!==5042002||manifest.environment!=='arc-testnet'||![1,2].includes(protocolVersion)||!ethers.isAddress(declaration?.address)||!ethers.isHexString(declaration?.bytecodeHash,32)||!ethers.isHexString(declaration?.txHash,32)||!Number.isSafeInteger(declaration?.deploymentBlock)||declaration.deploymentBlock<1||!same(token,'0x3600000000000000000000000000000000000000'))fail('DEPLOYMENT_MANIFEST_INVALID');
  const roleNames=['owner','authorizedSigner','operator','securityAuthority'];if(roleNames.some(n=>!ethers.isAddress(roles?.[n]?.address))||new Set(roleNames.map(n=>roles[n].address.toLowerCase())).size!==4||safeDeclaration.type!=='safe-multisig')fail('DEPLOYMENT_ROLES_INVALID');
  const quorum=/^(\d+)-of-(\d+)$/.exec(safeDeclaration.quorum||''),expectedOwners=safeDeclaration.owners??(same(safeDeclaration.address,knownSafe.address)?knownSafe.owners:undefined);
  if(!quorum||Number(quorum[1])<2||Number(quorum[1])>Number(quorum[2])||!Array.isArray(expectedOwners)||expectedOwners.length!==Number(quorum[2])||expectedOwners.some(a=>!ethers.isAddress(a))||new Set(expectedOwners.map(a=>a.toLowerCase())).size!==expectedOwners.length||typeof safeDeclaration.safeVersion!=='string')fail('SAFE_EXPECTATIONS_MISSING');
  phase='CHAIN';const network=await provider.getNetwork();if(Number(network.chainId)!==manifest.chainId)fail('DEPLOYMENT_CHAIN_MISMATCH');
  phase='FIXED_BLOCK';
  const block=await provider.getBlock('latest');if(!block||!ethers.isHexString(block.hash,32)||block.number<declaration.deploymentBlock)fail('FIXED_BLOCK_UNCONFIRMED');
  const blockTag=block.number,hub=new ethers.Contract(declaration.address,hubAbi,provider),safe=new ethers.Contract(safeDeclaration.address,safeAbi,provider),usdc=new ethers.Contract(token,['function balanceOf(address) view returns(uint256)'],provider);
  phase='FIXED_BLOCK_READBACK';
  const [hubCode,usdcCode,safeCode,owner,authorizedSigner,operator,securityAuthority,onchainToken,nextCampaignId,nextOrderId,usdcBalance,owners,threshold,safeVersion,receipt,deploymentBlock]=await Promise.all([
   provider.getCode(declaration.address,blockTag),provider.getCode(token,blockTag),provider.getCode(safeDeclaration.address,blockTag),hub.owner({blockTag}),hub.authorizedSigner({blockTag}),hub.operatorAddress({blockTag}),hub.securityAuthority({blockTag}),hub.usdcToken({blockTag}),hub.nextCampaignId({blockTag}),hub.nextOrderId({blockTag}),usdc.balanceOf(declaration.address,{blockTag}),safe.getOwners({blockTag}),safe.getThreshold({blockTag}),safe.VERSION({blockTag}),provider.getTransactionReceipt(declaration.txHash),provider.getBlock(declaration.deploymentBlock),
  ]);
  const actualRoles={owner,authorizedSigner,operator,securityAuthority};for(const name of roleNames)if(!same(actualRoles[name as keyof typeof actualRoles],roles[name].address))fail('DEPLOYMENT_ROLE_MISMATCH');
  if(!same(onchainToken,token)||usdcCode==='0x')fail('DEPLOYMENT_USDC_MISMATCH');
  if(hubCode==='0x'||!same(ethers.keccak256(hubCode),declaration.bytecodeHash))fail('DEPLOYMENT_RUNTIME_MISMATCH');
  if(!receipt||receipt.status!==1||receipt.blockNumber!==declaration.deploymentBlock||!same(receipt.hash,declaration.txHash)||!same(receipt.contractAddress,declaration.address)||!deploymentBlock||!same(receipt.blockHash,deploymentBlock.hash))fail('DEPLOYMENT_RECEIPT_MISMATCH');
  if(safeCode==='0x'||safeCode.toLowerCase().startsWith('0xef0100'))fail('SAFE_CODE_INVALID');
  const actualOwners=new Set((owners as string[]).map(a=>a.toLowerCase()));if(actualOwners.size!==expectedOwners.length||expectedOwners.some((a:string)=>!actualOwners.has(a.toLowerCase()))||threshold!==BigInt(quorum![1])||safeVersion!==safeDeclaration.safeVersion)fail('SAFE_POLICY_MISMATCH');
  if(nextCampaignId<1n||nextOrderId<1n||usdcBalance<0n)fail('DEPLOYMENT_COUNTERS_INVALID');
  if(protocolVersion===2&&await hub.protocolVersion({blockTag})!==2n)fail('DEPLOYMENT_PROTOCOL_MISMATCH');
  phase='CANONICAL_RECHECK';const canonical=await provider.getBlock(blockTag);if(!canonical||!same(canonical.hash,block.hash))fail('FIXED_BLOCK_CHANGED');
  return{status:'PASS' as const,chainId:manifest.chainId,fixedBlock:{number:block.number,hash:block.hash,timestamp:block.timestamp},hub:{address:declaration.address,protocolVersion,deploymentTxHash:receipt.hash,deploymentBlock:receipt.blockNumber,deploymentBlockHash:receipt.blockHash,runtimeBytecodeHash:ethers.keccak256(hubCode),...actualRoles,usdc:onchainToken,nextCampaignId:nextCampaignId.toString(),nextOrderId:nextOrderId.toString(),usdcBalance:usdcBalance.toString()},safe:{address:safeDeclaration.address,owners:Array.from(owners),threshold:Number(threshold),version:safeVersion,runtimeBytecodeHash:ethers.keccak256(safeCode)}};
 }catch(error){return{status:'FAIL' as const,phase,code:error instanceof OpsCheckError?(error as {code:string}).code:'DEPLOYMENT_READBACK_UNCONFIRMED'};}
}
async function main(){
 if(process.argv.length>2)fail('DEPLOYMENT_ARGUMENTS_UNSUPPORTED');
 const root=path.resolve(__dirname,'..'),manifestPath=path.join(root,'shared/manifests/arc-testnet.json'),envPath=path.join(root,'backend/.env'),tools=['scripts/verify_arc_candidate.ts','scripts/ops_evidence.cjs','backend/src/services/arcReadProvider.ts','backend/src/config.ts','backend/package-lock.json'],checkedTools=toolInputs(root,tools);let provider:any,timer:ReturnType<typeof setTimeout>|undefined,result:any={status:'FAIL',code:'DEPLOYMENT_INPUT_UNCONFIRMED'},manifestHash:string|undefined;
 try{
  const manifestBytes=fs.readFileSync(manifestPath),envBytes=fs.readFileSync(envPath),manifest=JSON.parse(manifestBytes.toString()),env=dotenv.parse(envBytes);manifestHash=sha256(manifestBytes);
  // Load the real backend configuration in this short-lived CLI before its
  // provider module. The repository-root .env is not the backend runtime.
  for(const key of ['NODE_ENV','JWT_SECRET','CAMPAIGN_IDENTITY_SECRET','MASTER_ENCRYPTION_KEY','MASTER_ENCRYPTION_KEY_ID','MASTER_ENCRYPTION_PREVIOUS_KEYS','MASTER_ENCRYPTION_LEGACY_KEY','AUTHORIZED_SIGNER_PRIVATE_KEY','OPERATOR_ADDRESS','ARC_CHAIN_ID','ARC_RPC_URL','ARC_TESTNET_RPC','GROUPDEAL_HUB_ADDRESS','USDC_ADDRESS','DEPLOYMENT_BLOCK'])if(typeof env[key]==='string')process.env[key]=env[key];
  const {ArcReadProvider}=await import('../backend/src/services/arcReadProvider');
  const primary=env.ARC_RPC_URL||env.ARC_TESTNET_RPC||manifest.rpc.primary;provider=new ArcReadProvider([...new Set([primary,...manifest.rpc.fallbacks])] as string[],manifest.chainId);
  result=await Promise.race([checkArcDeployment(manifest,provider),new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'FAIL',code:'DEPLOYMENT_READBACK_TIMEOUT'}),45_000);})]);
  if(!fs.readFileSync(manifestPath).equals(manifestBytes)||!fs.readFileSync(envPath).equals(envBytes))result={status:'FAIL',code:'DEPLOYMENT_INPUT_CHANGED'};
  if(JSON.stringify(checkedTools)!==JSON.stringify(toolInputs(root,tools)))result={status:'FAIL',code:'DEPLOYMENT_TOOL_CHANGED'};
 }catch{result={status:'FAIL',code:'DEPLOYMENT_INPUT_UNCONFIRMED'};}finally{clearTimeout(timer);provider?.destroy();}
 const record={schemaVersion:2,verifiedAt:new Date().toISOString(),layer:'READ_ONLY_FIXED_BLOCK_DEPLOYMENT',acceptanceEligible:false,candidateFrozen:false,...result,manifestSha256:manifestHash,toolInputs:checkedTools,node:process.version,scope:{financialBroadcast:false,deploymentMutated:false,activeDataMutated:false,legacyDeploymentRead:false,initialCleanStateRequired:false,financialAccountingVerified:false,sourceContractMatchChecked:false,principalAuthenticated:false},openGates:['Compiled source/runtime comparison for the final fixed candidate','Per-order reconciliation at the selected block and provider/product journeys','Actual principals, real delivery, new G5 and independent G6; Mainnet deferred']};
 const reference=writeOpsEvidence(root,'deployment',record);process.stdout.write(JSON.stringify({status:record.status,...(record.code?{code:record.code}:{}),evidence:reference.path,sha256:reference.sha256,acceptanceEligible:false})+'\n',()=>process.exit(record.status==='PASS'?0:1));
}
if(require.main===module)main().catch(()=>{process.stderr.write('DEPLOYMENT_TOOL_UNCONFIRMED\n',()=>process.exit(1));});
