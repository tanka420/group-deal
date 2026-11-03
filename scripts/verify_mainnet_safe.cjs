'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {ethers}=require('../backend/node_modules/ethers');
const {buildSafePlan}=require('./prepare_mainnet_safe.cjs');
const root=path.resolve(__dirname,'..'),sentinel='0x0000000000000000000000000000000000000001';
const endpoints=['https://rpc.mainnet.arc.io','https://rpc.blockdaemon.mainnet.arc.io'];
const methods=new Set(['eth_chainId','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const requireThat=(condition,code)=>{if(!condition)throw Error(code);};
const quantity=v=>{requireThat(typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v),'SAFE_VERIFY_INVALID_QUANTITY');return BigInt(v);};
const slots={singleton:'0x0',fallbackHandler:ethers.id('fallback_manager.handler.address'),guard:ethers.id('guard_manager.guard.address'),moduleGuard:ethers.id('module_manager.module_guard.address')};
const word=a=>ethers.AbiCoder.defaultAbiCoder().encode(['address'],[a]);
function readRpc(url){
 requireThat(endpoints.includes(url),'SAFE_VERIFY_RPC_NOT_ALLOWED');let id=0;
 return async(method,params)=>{requireThat(methods.has(method),'SAFE_VERIFY_METHOD_NOT_ALLOWED');const n=++id;
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:n,method,params}),signal:AbortSignal.timeout(15000)});
  requireThat(response.ok,'SAFE_VERIFY_RPC_HTTP_FAILED');const body=await response.json();requireThat(body.id===n&&!body.error&&body.result!==undefined,'SAFE_VERIFY_RPC_READ_FAILED');return body.result;
 };
}
function validateTransaction(hash,tx,receipt,block,budget,plan,attempt){
 requireThat(tx&&receipt&&block,'SAFE_VERIFY_TRANSACTION_NOT_MINED');
 requireThat(same(tx.hash,hash)&&same(receipt.transactionHash,hash)&&receipt.status==='0x1'&&tx.chainId==='0x13b2'&&tx.type==='0x2','SAFE_VERIFY_TRANSACTION_STATUS_OR_CHAIN');
 requireThat(same(tx.from,budget.from)&&same(tx.to,budget.factory)&&same(receipt.from,budget.from)&&same(receipt.to,budget.factory)&&quantity(tx.value)===0n,'SAFE_VERIFY_TRANSACTION_SCOPE');
 requireThat(same(tx.input,plan.data)&&same(ethers.keccak256(tx.input),budget.dataHash)&&same(attempt.hash,hash)&&same(attempt.dataHash,budget.dataHash)&&quantity(tx.nonce)===quantity(attempt.transaction.nonce),'SAFE_VERIFY_TRANSACTION_DATA_OR_NONCE');
 requireThat(same(tx.blockHash,receipt.blockHash)&&same(block.hash,receipt.blockHash)&&quantity(tx.blockNumber)===quantity(receipt.blockNumber)&&quantity(block.number)===quantity(receipt.blockNumber),'SAFE_VERIFY_CANONICAL_RECEIPT_MISMATCH');
 const maxCost=quantity(tx.gas)*quantity(tx.maxFeePerGas),actualCost=quantity(receipt.gasUsed)*quantity(receipt.effectiveGasPrice),budgetCap=BigInt(budget.maximumGasCostNative);
 requireThat(quantity(receipt.gasUsed)<=quantity(tx.gas)&&quantity(receipt.effectiveGasPrice)<=quantity(tx.maxFeePerGas)&&maxCost<=budgetCap&&actualCost<=maxCost,'SAFE_VERIFY_BUDGET_EXCEEDED');
 const creation=receipt.logs.filter(l=>same(l.address,plan.contracts.factory.address)).map(l=>{try{return plan.contracts.factory.interface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='ProxyCreation');
 requireThat(creation.length===1&&same(creation[0].args.proxy,budget.predictedSafeAddress)&&same(creation[0].args.singleton,plan.contracts.singleton.address),'SAFE_VERIFY_CREATION_EVENT_MISMATCH');
 const setup=receipt.logs.filter(l=>same(l.address,budget.predictedSafeAddress)).map(l=>{try{return plan.contracts.singleton.interface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='SafeSetup');
 requireThat(setup.length===1&&same(setup[0].args.initiator,budget.factory)&&setup[0].args.threshold===2n&&same(setup[0].args.initializer,ethers.ZeroAddress)&&same(setup[0].args.fallbackHandler,plan.contracts.fallbackHandler.address)&&JSON.stringify(Array.from(setup[0].args.owners).map(a=>a.toLowerCase()))===JSON.stringify(budget.owners.map(a=>a.toLowerCase())),'SAFE_VERIFY_SETUP_EVENT_MISMATCH');
 requireThat(receipt.logs.every(l=>l.removed===false&&same(l.transactionHash,hash)&&same(l.blockHash,receipt.blockHash)),'SAFE_VERIFY_REMOVED_OR_UNBOUND_LOG');
 return {gasUsed:quantity(receipt.gasUsed).toString(),effectiveGasPrice:quantity(receipt.effectiveGasPrice).toString(),actualGasCostUsdc:ethers.formatUnits(actualCost,18),walletGasLimit:quantity(tx.gas).toString(),walletMaximumGasCostUsdc:ethers.formatUnits(maxCost,18),walletAdjustedGasFields:quantity(tx.gas)!==quantity(attempt.transaction.gas)||quantity(tx.maxFeePerGas)!==quantity(attempt.transaction.maxFeePerGas)||quantity(tx.maxPriorityFeePerGas)!==quantity(attempt.transaction.maxPriorityFeePerGas)};
}
async function inspect(hash,rpc,budget,plan,attempt,fixedBlock){
 const [chain,tx,receipt,head]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getTransactionByHash',[hash]),rpc('eth_getTransactionReceipt',[hash]),rpc('eth_getBlockByNumber',['finalized',false])]);
 requireThat(chain==='0x13b2'&&head&&Math.abs(Date.now()/1000-Number(quantity(head.timestamp)))<=120,'SAFE_VERIFY_FINALITY_UNAVAILABLE');
 requireThat(receipt&&quantity(receipt.blockNumber)<=quantity(head.number),'SAFE_VERIFY_NOT_FINALIZED');
 const pinned=fixedBlock||{number:head.number,hash:head.hash,timestamp:head.timestamp};requireThat(quantity(pinned.number)<=quantity(head.number),'SAFE_VERIFY_SECONDARY_FINALITY_BEHIND');
 const mined=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]),fees=validateTransaction(hash,tx,receipt,mined,budget,plan,attempt);
 const pins=[];
 for(const [name,c]of Object.entries(plan.contracts)){const code=await rpc('eth_getCode',[c.address,pinned.number]);requireThat(ethers.isHexString(code)&&same(ethers.keccak256(code),c.runtimeBytecodeHash),'SAFE_VERIFY_CANONICAL_CODE_MISMATCH');pins.push({name,address:c.address,bytecodeHash:c.runtimeBytecodeHash});}
 const factory=plan.contracts.factory,proxyCreation=factory.interface.decodeFunctionResult('proxyCreationCode',await rpc('eth_call',[{to:factory.address,data:factory.interface.encodeFunctionData('proxyCreationCode')},pinned.number]))[0];
 const init=ethers.concat([proxyCreation,ethers.AbiCoder.defaultAbiCoder().encode(['uint256'],[BigInt(plan.contracts.singleton.address)])]);
 const salt=ethers.solidityPackedKeccak256(['bytes32','uint256'],[ethers.keccak256(plan.initializer),plan.saltNonce]);requireThat(same(ethers.getCreate2Address(factory.address,salt,ethers.keccak256(init)),budget.predictedSafeAddress),'SAFE_VERIFY_CREATE2_MISMATCH');
 const expectedProxy=await rpc('eth_call',[{from:budget.from,data:init,value:'0x0'},pinned.number]);requireThat(ethers.isHexString(expectedProxy)&&expectedProxy!=='0x','SAFE_VERIFY_PROXY_TEMPLATE_UNAVAILABLE');
 const readState=async tag=>{
  const c=budget.predictedSafeAddress,abi=plan.contracts.singleton.interface;
  const call=async(name,args=[])=>abi.decodeFunctionResult(name,await rpc('eth_call',[{to:c,data:abi.encodeFunctionData(name,args)},tag]));
  const [code,owners,threshold,version,nonce,modules]=await Promise.all([rpc('eth_getCode',[c,tag]),call('getOwners'),call('getThreshold'),call('VERSION'),call('nonce'),call('getModulesPaginated',[sentinel,20])]);
  requireThat(same(code,expectedProxy),'SAFE_VERIFY_PROXY_CODE_MISMATCH');requireThat(JSON.stringify(Array.from(owners[0]).map(a=>a.toLowerCase()))===JSON.stringify(budget.owners.map(a=>a.toLowerCase()))&&threshold[0]===2n&&version[0]==='1.5.0'&&nonce[0]===0n,'SAFE_VERIFY_OWNER_THRESHOLD_VERSION_OR_NONCE');
  requireThat(modules[0].length===0&&same(modules[1],sentinel),'SAFE_VERIFY_MODULES_ENABLED');
  const storage={};for(const [name,slot]of Object.entries(slots)){storage[name]=(await rpc('eth_getStorageAt',[c,slot,tag])).toLowerCase();requireThat(same(storage[name],word(name==='singleton'?plan.contracts.singleton.address:name==='fallbackHandler'?plan.contracts.fallbackHandler.address:ethers.ZeroAddress)),'SAFE_VERIFY_STORAGE_MISMATCH');}
  return {address:c,bytecodeHash:ethers.keccak256(code),safeVersion:version[0],owners:Array.from(owners[0]),threshold:Number(threshold[0]),nonce:nonce[0].toString(),modules:[],singleton:plan.contracts.singleton.address,fallbackHandler:plan.contracts.fallbackHandler.address,guard:ethers.ZeroAddress,moduleGuard:ethers.ZeroAddress,storage};
 };
 const deployed=await readState(receipt.blockNumber),current=await readState(pinned.number);requireThat(JSON.stringify(deployed)===JSON.stringify(current),'SAFE_VERIFY_STATE_CHANGED');
 const [canonical,again,chainAgain]=await Promise.all([rpc('eth_getBlockByNumber',[pinned.number,false]),rpc('eth_getTransactionReceipt',[hash]),rpc('eth_chainId',[])]);
 requireThat(same(canonical?.hash,pinned.hash)&&same(again?.blockHash,receipt.blockHash)&&again?.status==='0x1'&&chainAgain==='0x13b2','SAFE_VERIFY_FINAL_CONTEXT_CHANGED');
 return {chainId:5042,transactionHash:hash.toLowerCase(),deploymentBlock:Number(quantity(receipt.blockNumber)),deploymentBlockHash:receipt.blockHash.toLowerCase(),verificationBlock:pinned,from:ethers.getAddress(tx.from),factory:ethers.getAddress(tx.to),value:'0',nonce:quantity(tx.nonce).toString(),dataHash:ethers.keccak256(tx.input),fees,safe:current,canonicalContracts:pins};
}
async function main(){
 const [hash,...rest]=process.argv.slice(2);requireThat(/^0x[a-f0-9]{64}$/i.test(hash||'')&&!rest.length,'SAFE_VERIFY_REQUIRES_ONE_TRANSACTION_HASH');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'shared/manifests/arc-mainnet.json'))),budget=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-safe-budget.json')));
 requireThat(!manifest.roles.securityAuthority.address||same(manifest.roles.securityAuthority.address,budget.predictedSafeAddress),'SAFE_VERIFY_MANIFEST_ADDRESS_MISMATCH');
 // Reconstruct the original setup only for comparison. No creation quote or runtime guard is relaxed.
 const original=structuredClone(manifest);original.roles.securityAuthority.address='';const plan=buildSafePlan(original);
 require('./quote_mainnet_safe.cjs').validateBudget(budget,{unsignedTransaction:{from:plan.from,to:plan.contracts.factory.address},owners:plan.owners,predictedSafeAddress:budget.predictedSafeAddress,dataHash:ethers.keccak256(plan.data)});
 requireThat(same(ethers.keccak256(plan.data),budget.dataHash),'SAFE_VERIFY_APPROVED_PLAN_CHANGED');
 const attempt=JSON.parse(fs.readFileSync(path.join(root,'.cache/mainnet-safe-attempts',budget.dataHash.slice(2),'ATTEMPT.json')));
 const first=await inspect(hash,readRpc(endpoints[0]),budget,plan,attempt),second=await inspect(hash,readRpc(endpoints[1]),budget,plan,attempt,first.verificationBlock);
 requireThat(JSON.stringify(first)===JSON.stringify(second),'SAFE_VERIFY_RPC_DISAGREEMENT');
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),report={schemaVersion:1,result:'PASS_FINALIZED_MAINNET_SAFE',verifiedAt:new Date().toISOString(),sourceCommit,endpointsAgree:endpoints,...first,actualDeployment:true,hubDeploymentVerified:false,activationAuthorized:false,transactionsSubmittedByVerifier:0};
 const directory=path.join(root,'.cache/mainnet-safe-verification',crypto.randomUUID());fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'VERIFIED.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({result:report.result,file,sourceCommit,safe:report.safe.address,safeVersion:report.safe.safeVersion,bytecodeHash:report.safe.bytecodeHash,owners:report.safe.owners,threshold:2,deploymentBlock:report.deploymentBlock,fees:report.fees,transactionHash:hash,endpointsAgree:endpoints,actualDeployment:true,hubDeploymentVerified:false,transactionsSubmittedByVerifier:0}));
}
module.exports={readRpc,validateTransaction,inspect};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
