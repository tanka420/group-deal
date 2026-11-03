'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {ethers}=require('../backend/node_modules/ethers');
const {prepareMainnet}=require('./prepare_mainnet.cjs');
const {inspectSafePlan}=require('./prepare_mainnet_safe.cjs');
const {createRpc}=require('./quote_mainnet_deployment.cjs');
const root=path.resolve(__dirname,'..');
const quantity=value=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))throw Error('SAFE_QUOTE_INVALID_QUANTITY');return BigInt(value);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function validateBudget(budget,safe){
 if(budget?.schemaVersion!==1||budget.scope!=='SAFE_CREATION_ONLY'||budget.chainId!==5042||budget.safeVersion!=='1.5.0'
  ||budget.nativeValue!=='0'||budget.maximumGasCostNative!=='20000000000000000'||budget.maximumGasCostUsdc!=='0.02'||budget.budgetApproved!==true
  ||typeof budget.signingAuthorized!=='boolean'||typeof budget.broadcastAuthorized!=='boolean'||budget.signingAuthorized!==budget.broadcastAuthorized
  ||budget.hubDeploymentAuthorized!==false||budget.activationAuthorized!==false
  ||!same(budget.from,safe.unsignedTransaction.from)||!same(budget.factory,safe.unsignedTransaction.to)
  ||!same(budget.predictedSafeAddress,safe.predictedSafeAddress)||!same(budget.dataHash,safe.dataHash)||budget.threshold!==2
  ||JSON.stringify(budget.owners?.map(a=>a.toLowerCase()))!==JSON.stringify(safe.owners.map(a=>a.toLowerCase())))throw Error('SAFE_BUDGET_SCOPE_MISMATCH');
 return BigInt(budget.maximumGasCostNative);
}
async function quoteSafe(preparation,rpc,budget,inspect=inspectSafePlan){
 const safe=await inspect(preparation,rpc),maximumCost=validateBudget(budget,safe);
 const block=await rpc('eth_getBlockByNumber',['latest',false]);
 if(!block||!ethers.isHexString(block.hash,32)||Math.abs(Date.now()/1000-Number(quantity(block.timestamp)))>120)throw Error('SAFE_QUOTE_STALE_BLOCK');
 const {from,to,data}=safe.unsignedTransaction;
 const [latest,pending,balance,price,tip]=await Promise.all([
  rpc('eth_getTransactionCount',[from,block.number]),rpc('eth_getTransactionCount',[from,'pending']),rpc('eth_getBalance',[from,block.number]),rpc('eth_gasPrice',[]),rpc('eth_maxPriorityFeePerGas',[])
 ]);
 if(quantity(latest)!==quantity(pending))throw Error('SAFE_QUOTE_PENDING_SENDER_TRANSACTION');
 const base=quantity(block.baseFeePerGas),priority=quantity(tip),suggested=quantity(price),fee=2n*base+priority>suggested?2n*base+priority:suggested;
 if(fee<20_000_000_000n||fee<priority)throw Error('SAFE_QUOTE_INVALID_FEE');
 const unsigned={type:'0x2',chainId:'0x13b2',from,to,data,value:'0x0',nonce:pending,maxFeePerGas:ethers.toQuantity(fee),maxPriorityFeePerGas:ethers.toQuantity(priority)};
 const estimate=quantity(await rpc('eth_estimateGas',[unsigned,'latest'])),gas=(estimate*120n+99n)/100n,cost=gas*fee;
 if(estimate<=0n||gas>quantity(block.gasLimit))throw Error('SAFE_QUOTE_INVALID_GAS');
 if(cost>maximumCost)throw Error('SAFE_QUOTE_OVER_APPROVED_BUDGET');
 if(quantity(balance)<cost)throw Error('SAFE_QUOTE_INSUFFICIENT_BALANCE');
 unsigned.gas=ethers.toQuantity(gas);
 const abi=new ethers.Interface(['function createProxyWithNonce(address,bytes,uint256) returns(address)']);
 const returned=abi.decodeFunctionResult('createProxyWithNonce',await rpc('eth_call',[unsigned,block.number]))[0];
 if(!same(returned,safe.predictedSafeAddress))throw Error('SAFE_QUOTE_SIMULATION_MISMATCH');
 if((await rpc('eth_getBlockByNumber',[block.number,false]))?.hash!==block.hash||quantity(await rpc('eth_getTransactionCount',[from,'pending']))!==quantity(pending)||quantity(await rpc('eth_chainId',[]))!==5042n)throw Error('SAFE_QUOTE_CONTEXT_CHANGED');
 const now=Date.now();
 return {schemaVersion:1,layer:'READ_ONLY_MAINNET_SAFE_QUOTE',sourceCommit:preparation.sourceCommit,sourceFingerprint:preparation.sourceFingerprint,
  createdAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),block:{number:block.number,hash:block.hash},
  safePreparation:safe,predictedSafeAddress:safe.predictedSafeAddress,owners:safe.owners,threshold:2,unsignedTransaction:unsigned,dataHash:safe.dataHash,
  estimatedGas:estimate.toString(),gasLimit:gas.toString(),gasMarginPercent:20,fees:{maxFeePerGas:fee.toString(),maxPriorityFeePerGas:priority.toString(),maximumGasCostUsdc:ethers.formatUnits(cost,18)},
  sender:{address:from,balanceUsdc:ethers.formatUnits(quantity(balance),18),sufficientForMaximumGasCost:true},
  approvedBudget:{scope:budget.scope,maximumGasCostNative:budget.maximumGasCostNative,maximumGasCostUsdc:'0.02',nativeValue:'0'},budgetApproved:true,
  signingAuthorized:budget.signingAuthorized,broadcastAuthorized:budget.broadcastAuthorized,activationAuthorized:false,actualDeployment:false,acceptanceEligible:false,
  notes:['Budget approval is separate from authority to sign or send. Only an explicit owner click may request a wallet transaction after that authority is recorded.','Refresh all code pins/state/nonce/fees before the wallet prompt. No retry after an ambiguous wallet outcome.','Wallet fee edits must stay within 0.02 USDC. This quote covers Safe creation only, with zero native value.','A returned transaction hash is not proof of finalized Safe deployment. Hub V2 and service activation require separate scopes.']};
}
function saveQuote(report){
 const directory=path.join(root,'.cache/mainnet-preparation',report.sourceFingerprint);fs.mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'SAFE_QUOTE-'+crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return file;
}
async function currentQuote(){
 if(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim()!=='codex/mainnet')throw Error('SAFE_QUOTE_BRANCH_NOT_MAINNET');
 if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('SAFE_QUOTE_SOURCE_UNCOMMITTED');
 const preparation=prepareMainnet(),budget=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-safe-budget.json'),'utf8'));
 if(execFileSync('git',['rev-parse','refs/remotes/origin/codex/mainnet'],{cwd:root,encoding:'utf8'}).trim()!==preparation.sourceCommit)throw Error('SAFE_QUOTE_SOURCE_NOT_PUSHED');
 const report=await quoteSafe(preparation,createRpc(preparation.manifest.rpc.primary),budget);
 if(prepareMainnet().sourceFingerprint!==preparation.sourceFingerprint)throw Error('SAFE_QUOTE_SOURCE_CHANGED');
 return {report,file:saveQuote(report)};
}
module.exports={quoteSafe,validateBudget,currentQuote};
if(require.main===module){if(process.argv.length>2)throw Error('SAFE_QUOTE_ACCEPTS_NO_TRANSACTION_ARGUMENTS');currentQuote().then(({report,file})=>console.log(JSON.stringify({result:'PASS',file,sourceCommit:report.sourceCommit,sourceFingerprint:report.sourceFingerprint,expiresAt:report.expiresAt,maximumGasCostUsdc:report.fees.maximumGasCostUsdc,approvedBudgetUsdc:'0.02',nonce:report.unsignedTransaction.nonce,gasLimit:report.gasLimit,budgetApproved:true,signingAuthorized:report.signingAuthorized,broadcastAuthorized:report.broadcastAuthorized,actualDeployment:false}))).catch(e=>{console.error(e.message);process.exitCode=1;});}
