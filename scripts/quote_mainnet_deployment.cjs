const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {prepareMainnet}=require('./prepare_mainnet.cjs');
const {ethers}=require('../backend/node_modules/ethers');
const root=path.resolve(__dirname,'..');
// This allowlist intentionally excludes every signing and broadcast method.
const READ_METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getBalance','eth_getTransactionCount','eth_gasPrice','eth_maxPriorityFeePerGas','eth_estimateGas','eth_call']);
function createRpc(url){
 if(url!=='https://rpc.mainnet.arc.io')throw Error('MAINNET_QUOTE_RPC_NOT_ALLOWED');
 let id=0;
 return async(method,params)=>{
  if(!READ_METHODS.has(method))throw Error('MAINNET_QUOTE_RPC_METHOD_NOT_ALLOWED');
  const requestId=++id,response=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`MAINNET_QUOTE_HTTP_${response.status}`);
  const body=await response.json();
  if(body.id!==requestId||body.error||body.result===undefined)throw Error(`MAINNET_QUOTE_RPC_FAILED: ${method}${body.error?.message?': '+String(body.error.message).slice(0,200):''}`);
  return body.result;
 };
}
const quantity=value=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))throw Error('MAINNET_QUOTE_INVALID_QUANTITY');return BigInt(value);};
async function quoteDeployment(preparation,rpc){
 if(quantity(await rpc('eth_chainId',[]))!==5042n)throw Error('MAINNET_QUOTE_CHAIN_MISMATCH');
 const candidate=preparation.candidates.find(c=>c.selectedForRelease);
 if(preparation.signingAuthorized!==false||preparation.broadcastAuthorized!==false||preparation.activationAuthorized!==false
  ||candidate?.protocolVersion!==2||!ethers.isHexString(candidate.unsignedTransaction.data)||!ethers.isAddress(candidate.unsignedTransaction.from))throw Error('MAINNET_QUOTE_CANDIDATE_INVALID');
 const {from,data}=candidate.unsignedTransaction;
 const block=await rpc('eth_getBlockByNumber',['latest',false]);
 if(!block||!ethers.isHexString(block.hash,32)||!block.number||Math.abs(Date.now()/1000-Number(quantity(block.timestamp)))>120)throw Error('MAINNET_QUOTE_BLOCK_UNAVAILABLE_OR_STALE');
 const [senderCode,securityCode,usdcCode,balanceHex,latestNonce,pendingNonce,gasPriceHex,tipHex]=await Promise.all([
  rpc('eth_getCode',[from,block.number]),rpc('eth_getCode',[preparation.deploymentPlan.roles.securityAuthority,block.number]),
  rpc('eth_getCode',[preparation.manifest.contracts.USDC.address,block.number]),rpc('eth_getBalance',[from,block.number]),
  rpc('eth_getTransactionCount',[from,block.number]),rpc('eth_getTransactionCount',[from,'pending']),rpc('eth_gasPrice',[]),rpc('eth_maxPriorityFeePerGas',[])
 ]);
 if(senderCode!=='0x')throw Error('MAINNET_QUOTE_REQUIRES_EOA_CREATION_SENDER');
 if(!ethers.isHexString(usdcCode)||usdcCode==='0x'||!ethers.isHexString(securityCode))throw Error('MAINNET_QUOTE_CONTRACT_CODE_INVALID');
 const nonce=quantity(pendingNonce);
 if(nonce!==quantity(latestNonce))throw Error('MAINNET_QUOTE_PENDING_SENDER_TRANSACTION');
 const baseFee=quantity(block.baseFeePerGas),tip=quantity(tipHex),suggestedGasPrice=quantity(gasPriceHex);
 const maxFee=2n*baseFee+tip>suggestedGasPrice?2n*baseFee+tip:suggestedGasPrice;
 if(maxFee<20_000_000_000n||maxFee<tip)throw Error('MAINNET_QUOTE_FEE_INVALID');
 const creation={from,data,value:'0x0',maxFeePerGas:ethers.toQuantity(maxFee),maxPriorityFeePerGas:ethers.toQuantity(tip)};
 const estimatedGas=quantity(await rpc('eth_estimateGas',[creation,'latest']));
 const gasLimit=(estimatedGas*120n+99n)/100n;
 if(estimatedGas<=0n||gasLimit>quantity(block.gasLimit))throw Error('MAINNET_QUOTE_GAS_LIMIT_INVALID');
 const simulatedRuntime=await rpc('eth_call',[{...creation,gas:ethers.toQuantity(gasLimit)},block.number]);
 if(!ethers.isHexString(simulatedRuntime)||simulatedRuntime==='0x')throw Error('MAINNET_QUOTE_CREATION_SIMULATION_FAILED');
 const canonical=await rpc('eth_getBlockByNumber',[block.number,false]);
 if(canonical?.hash!==block.hash||quantity(await rpc('eth_chainId',[]))!==5042n||quantity(await rpc('eth_getTransactionCount',[from,'pending']))!==nonce)throw Error('MAINNET_QUOTE_STATE_CHANGED');
 const maxCost=gasLimit*maxFee,balance=quantity(balanceHex),createdAt=new Date();
 return {schemaVersion:1,layer:'READ_ONLY_MAINNET_DEPLOYMENT_QUOTE',sourceCommit:preparation.sourceCommit,sourceFingerprint:preparation.sourceFingerprint,
  createdAt:createdAt.toISOString(),expiresAt:new Date(createdAt.getTime()+300000).toISOString(),rpc:'https://rpc.mainnet.arc.io',
  block:{number:block.number,hash:block.hash,timestamp:block.timestamp},contract:candidate.contract,constructor:candidate.constructor,deploymentDataHash:ethers.keccak256(data),
  unsignedTransaction:{type:'0x2',chainId:'0x13b2',from,data,value:'0x0',nonce:ethers.toQuantity(nonce),gas:ethers.toQuantity(gasLimit),maxFeePerGas:ethers.toQuantity(maxFee),maxPriorityFeePerGas:ethers.toQuantity(tip)},
  expectedContractAddress:ethers.getCreateAddress({from,nonce}),estimatedGas:estimatedGas.toString(),gasLimit:gasLimit.toString(),gasMarginPercent:20,
  fees:{baseFeePerGas:baseFee.toString(),suggestedGasPrice:suggestedGasPrice.toString(),maxFeePerGas:maxFee.toString(),maxPriorityFeePerGas:tip.toString(),maximumGasCostNative:maxCost.toString(),maximumGasCostUsdc:ethers.formatUnits(maxCost,18)},
  sender:{address:from,balanceNative:balance.toString(),balanceUsdc:ethers.formatUnits(balance,18),sufficientForMaximumGasCost:balance>=maxCost},
  securityAuthority:{address:preparation.deploymentPlan.roles.securityAuthority,hasCode:securityCode!=='0x',safeVerified:false},
  simulation:{method:'eth_call',runtimeBytecodeHash:ethers.keccak256(simulatedRuntime),actualDeployment:false},
  budgetApproved:false,signingAuthorized:false,broadcastAuthorized:false,activationAuthorized:false,acceptanceEligible:false,
  notes:['No transaction was signed or sent. The predicted address is not deployment evidence.','USDC native gas uses 18 decimals. Maximum cost is a proposed transaction fee cap, not an approved budget.','Refresh the quote before signature; verify wallet sender/network/nonce/data/fee limit. A wallet may propose different fee fields.','This contract-only deployment does not satisfy the production application role/Safe/startup requirements.']};
}
async function main(){
 if(process.argv.length>2)throw Error('MAINNET_QUOTE_ACCEPTS_NO_SIGNING_OR_DEPLOY_ARGUMENTS');
 const preparation=prepareMainnet(),report=await quoteDeployment(preparation,createRpc(preparation.manifest.rpc.primary));
 if(prepareMainnet().sourceFingerprint!==preparation.sourceFingerprint)throw Error('MAINNET_QUOTE_SOURCE_CHANGED');
 const directory=path.join(root,'.cache/mainnet-preparation',preparation.sourceFingerprint);fs.mkdirSync(directory,{recursive:true});
 const target=path.join(directory,`QUOTE-${crypto.randomUUID()}.json`);fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',sourceCommit:report.sourceCommit,sourceFingerprint:report.sourceFingerprint,path:target,contract:report.contract,
  estimatedGas:report.estimatedGas,gasLimit:report.gasLimit,maximumGasCostUsdc:report.fees.maximumGasCostUsdc,senderBalanceUsdc:report.sender.balanceUsdc,
  sufficientForMaximumGasCost:report.sender.sufficientForMaximumGasCost,predictedContractAddress:report.expectedContractAddress,actualDeployment:false,budgetApproved:false,broadcastAuthorized:false},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={createRpc,quoteDeployment};
