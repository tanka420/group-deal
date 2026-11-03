'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {ethers}=require('../backend/node_modules/ethers'),{prepareMainnet}=require('./prepare_mainnet.cjs'),{readRpc,inspect:inspectSafe}=require('./verify_mainnet_safe.cjs'),{buildSafePlan}=require('./prepare_mainnet_safe.cjs');
const root=path.resolve(__dirname,'..'),endpoints=['https://rpc.mainnet.arc.io','https://rpc.blockdaemon.mainnet.arc.io'];
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase(),check=(v,c)=>{if(!v)throw Error(c);};
const quantity=v=>{check(typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v),'HUB_VERIFY_INVALID_QUANTITY');return BigInt(v);};
function validateHubTransaction(hash,tx,receipt,mined,budget,candidate,attempt){
 check(tx&&receipt&&mined,'HUB_VERIFY_NOT_MINED');
 check(same(tx.hash,hash)&&same(receipt.transactionHash,hash)&&receipt.status==='0x1'&&tx.chainId==='0x13b2'&&tx.type==='0x2','HUB_VERIFY_STATUS_OR_CHAIN');
 check(same(tx.from,budget.from)&&same(receipt.from,budget.from)&&tx.to===null&&receipt.to===null&&quantity(tx.value)===0n,'HUB_VERIFY_TRANSACTION_SCOPE');
 check(same(tx.input,candidate.unsignedTransaction.data)&&same(ethers.keccak256(tx.input),budget.dataHash)&&same(attempt.hash,hash)&&same(attempt.dataHash,budget.dataHash)&&quantity(tx.nonce)===quantity(budget.nonce)&&quantity(tx.nonce)===quantity(attempt.transaction.nonce),'HUB_VERIFY_INPUT_OR_NONCE');
 const expected=ethers.getCreateAddress({from:budget.from,nonce:quantity(tx.nonce)});
 check(same(expected,budget.expectedContractAddress)&&same(receipt.contractAddress,expected),'HUB_VERIFY_CREATE_ADDRESS');
 check(same(tx.blockHash,receipt.blockHash)&&same(mined.hash,receipt.blockHash)&&quantity(tx.blockNumber)===quantity(receipt.blockNumber)&&quantity(mined.number)===quantity(receipt.blockNumber),'HUB_VERIFY_CANONICAL_RECEIPT');
 const maximum=quantity(tx.gas)*quantity(tx.maxFeePerGas),actual=quantity(receipt.gasUsed)*quantity(receipt.effectiveGasPrice);
 check(maximum<=BigInt(budget.maximumGasCostNative)&&actual<=maximum&&quantity(receipt.gasUsed)<=quantity(tx.gas)&&quantity(receipt.effectiveGasPrice)<=quantity(tx.maxFeePerGas),'HUB_VERIFY_BUDGET_EXCEEDED');
 const abi=new ethers.Interface(candidate.abi),events=receipt.logs.filter(l=>same(l.address,expected)).map(l=>{try{return abi.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='OwnershipTransferred');
 check(events.length===1&&same(events[0].args.previousOwner,ethers.ZeroAddress)&&same(events[0].args.newOwner,budget.from),'HUB_VERIFY_OWNER_EVENT');
 check(receipt.logs.every(l=>l.removed===false&&same(l.transactionHash,hash)&&same(l.blockHash,receipt.blockHash)),'HUB_VERIFY_UNBOUND_LOG');
 return {gasUsed:quantity(receipt.gasUsed).toString(),effectiveGasPrice:quantity(receipt.effectiveGasPrice).toString(),actualGasCostUsdc:ethers.formatUnits(actual,18),walletGasLimit:quantity(tx.gas).toString(),walletMaximumGasCostUsdc:ethers.formatUnits(maximum,18),walletAdjustedGasFields:quantity(tx.gas)!==quantity(attempt.transaction.gas)||quantity(tx.maxFeePerGas)!==quantity(attempt.transaction.maxFeePerGas)||quantity(tx.maxPriorityFeePerGas)!==quantity(attempt.transaction.maxPriorityFeePerGas)};
}
async function inspectHub(hash,rpc,p,budget,attempt,safeContext,fixedBlock){
 const [chain,tx,receipt,head]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getTransactionByHash',[hash]),rpc('eth_getTransactionReceipt',[hash]),rpc('eth_getBlockByNumber',['finalized',false])]);
 check(chain==='0x13b2'&&head&&Math.abs(Date.now()/1000-Number(quantity(head.timestamp)))<=120,'HUB_VERIFY_FINALITY_UNAVAILABLE');
 check(receipt&&quantity(receipt.blockNumber)<=quantity(head.number),'HUB_VERIFY_NOT_FINALIZED');const pinned=fixedBlock||{number:head.number,hash:head.hash,timestamp:head.timestamp};check(quantity(pinned.number)<=quantity(head.number),'HUB_VERIFY_SECONDARY_FINALITY_BEHIND');
 const candidate=p.candidates.find(c=>c.selectedForRelease),mined=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]),fees=validateHubTransaction(hash,tx,receipt,mined,budget,candidate,attempt);
 const parentTag=ethers.toQuantity(quantity(receipt.blockNumber)-1n),parent=await rpc('eth_getBlockByNumber',[parentTag,false]);check(same(parent?.hash,mined.parentHash),'HUB_VERIFY_PARENT_BLOCK_MISMATCH');
 const expectedRuntime=await rpc('eth_call',[{from:budget.from,data:candidate.unsignedTransaction.data,value:'0x0',gas:'0x7a1200'},parentTag]);check(ethers.isHexString(expectedRuntime)&&expectedRuntime!=='0x','HUB_VERIFY_RUNTIME_SIMULATION_FAILED');
 const abi=new ethers.Interface(candidate.abi),tokenAbi=new ethers.Interface(['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)']),c=budget.expectedContractAddress;
 const readState=async tag=>{
  const code=await rpc('eth_getCode',[c,tag]);check(same(code,expectedRuntime),'HUB_VERIFY_RUNTIME_BYTECODE_MISMATCH');
  const values={};for(const name of ['protocolVersion','usdcToken','owner','authorizedSigner','operatorAddress','securityAuthority','pendingSecurityAuthority','nextCampaignId','nextOrderId']){const value=abi.decodeFunctionResult(name,await rpc('eth_call',[{to:c,data:abi.encodeFunctionData(name)},tag]))[0];values[name]=typeof value==='bigint'?value.toString():value;}
  const roles=p.manifest.roles;check(values.protocolVersion==='2'&&same(values.usdcToken,p.manifest.contracts.USDC.address)&&same(values.owner,roles.owner.address)&&same(values.authorizedSigner,roles.authorizedSigner.address)&&same(values.operatorAddress,roles.operator.address)&&same(values.securityAuthority,roles.securityAuthority.address)&&same(values.pendingSecurityAuthority,ethers.ZeroAddress)&&values.nextCampaignId==='1'&&values.nextOrderId==='1','HUB_VERIFY_ROLE_OR_INITIAL_STATE_MISMATCH');
  const domain=abi.decodeFunctionResult('eip712Domain',await rpc('eth_call',[{to:c,data:abi.encodeFunctionData('eip712Domain')},tag]));check(domain[0]==='0x0f'&&domain[1]==='GroupDealHub'&&domain[2]==='1'&&domain[3]===5042n&&same(domain[4],c),'HUB_VERIFY_EIP712_DOMAIN_MISMATCH');
  const token=p.manifest.contracts.USDC.address,tokenCode=await rpc('eth_getCode',[token,tag]);check(ethers.isHexString(tokenCode)&&tokenCode!=='0x','HUB_VERIFY_USDC_CODE_MISSING');
  const decimals=tokenAbi.decodeFunctionResult('decimals',await rpc('eth_call',[{to:token,data:tokenAbi.encodeFunctionData('decimals')},tag]))[0];check(decimals===6n,'HUB_VERIFY_USDC_DECIMALS');
  return {address:c,bytecodeHash:ethers.keccak256(code),protocolVersion:2,roles:{owner:values.owner,authorizedSigner:values.authorizedSigner,operator:values.operatorAddress,securityAuthority:values.securityAuthority},usdc:values.usdcToken,usdcDecimals:6,pendingSecurityAuthority:values.pendingSecurityAuthority,nextCampaignId:values.nextCampaignId,nextOrderId:values.nextOrderId,eip712Domain:{name:domain[1],version:domain[2],chainId:5042,verifyingContract:domain[4]}};
 };
 const deployed=await readState(receipt.blockNumber),current=await readState(pinned.number);check(JSON.stringify(deployed)===JSON.stringify(current),'HUB_VERIFY_STATE_CHANGED');
 const verifiedSafe=await inspectSafe(safeContext.budget.completedTransactionHash,rpc,safeContext.budget,safeContext.plan,safeContext.attempt,pinned);check(same(verifiedSafe.safe.address,current.roles.securityAuthority),'HUB_VERIFY_SECURITY_SAFE_MISMATCH');
 const [canonical,again,chainAgain]=await Promise.all([rpc('eth_getBlockByNumber',[pinned.number,false]),rpc('eth_getTransactionReceipt',[hash]),rpc('eth_chainId',[])]);check(same(canonical?.hash,pinned.hash)&&same(again?.blockHash,receipt.blockHash)&&again?.status==='0x1'&&chainAgain==='0x13b2','HUB_VERIFY_FINAL_CONTEXT_CHANGED');
 return {chainId:5042,transactionHash:hash.toLowerCase(),deploymentBlock:Number(quantity(receipt.blockNumber)),deploymentBlockHash:receipt.blockHash.toLowerCase(),verificationBlock:pinned,from:ethers.getAddress(tx.from),nonce:'1',value:'0',dataHash:ethers.keccak256(tx.input),creationBytecodeHash:candidate.creationBytecodeHash,constructor:candidate.constructor,fees,hub:current,securitySafe:verifiedSafe.safe};
}
async function main(){
 const [hash,...rest]=process.argv.slice(2);check(/^0x[a-f0-9]{64}$/i.test(hash||'')&&!rest.length,'HUB_VERIFY_REQUIRES_ONE_TRANSACTION_HASH');
 const p=prepareMainnet(),budget=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-hub-budget.json')));require('./serve_mainnet_hub_review.cjs').validateHubBudget(budget,p);
 const attempt=JSON.parse(fs.readFileSync(path.join(root,'.cache/mainnet-hub-attempts',budget.dataHash.slice(2),'ATTEMPT.json'))),safeBudget=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-safe-budget.json')));
 const original=structuredClone(p.manifest);original.roles.securityAuthority.address='';const safePlan=buildSafePlan(original),safeAttempt=JSON.parse(fs.readFileSync(path.join(root,'.cache/mainnet-safe-attempts',safeBudget.dataHash.slice(2),'ATTEMPT.json')));
 require('./quote_mainnet_safe.cjs').validateBudget(safeBudget,{unsignedTransaction:{from:safePlan.from,to:safePlan.contracts.factory.address},owners:safePlan.owners,predictedSafeAddress:safeBudget.predictedSafeAddress,dataHash:ethers.keccak256(safePlan.data)});
 const context={budget:safeBudget,plan:safePlan,attempt:safeAttempt},first=await inspectHub(hash,readRpc(endpoints[0]),p,budget,attempt,context),second=await inspectHub(hash,readRpc(endpoints[1]),p,budget,attempt,context,first.verificationBlock);check(JSON.stringify(first)===JSON.stringify(second),'HUB_VERIFY_RPC_DISAGREEMENT');
 const report={schemaVersion:1,result:'PASS_FINALIZED_MAINNET_HUB_V2',verifiedAt:new Date().toISOString(),verifierSourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),candidateSourceFingerprint:p.sourceFingerprint,deploymentSourceFingerprint:attempt.sourceFingerprint,endpointsAgree:endpoints,...first,actualDeployment:true,activationAuthorized:false,transactionsSubmittedByVerifier:0};
 const directory=path.join(root,'.cache/mainnet-hub-verification',crypto.randomUUID());fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'VERIFIED.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({result:report.result,file,sourceCommit:report.verifierSourceCommit,address:report.hub.address,bytecodeHash:report.hub.bytecodeHash,protocolVersion:2,deploymentBlock:report.deploymentBlock,roles:report.hub.roles,fees:report.fees,transactionHash:hash,endpointsAgree:endpoints,actualDeployment:true,activationAuthorized:false,transactionsSubmittedByVerifier:0}));
}
module.exports={validateHubTransaction,inspectHub};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
