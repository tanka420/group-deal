const test=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('../backend/node_modules/ethers');
const {quoteSafe,validateBudget}=require('./quote_mainnet_safe.cjs');
const address=()=>ethers.Wallet.createRandom().address;
const from=address(),other=address(),to=address(),predicted=address(),data='0x12345678';
const safe={owners:[from,other],threshold:2,safeVersion:'1.5.0',predictedSafeAddress:predicted,dataHash:ethers.keccak256(data),unsignedTransaction:{from,to,data,value:'0x0'}};
const budget={schemaVersion:1,scope:'SAFE_CREATION_ONLY',chainId:5042,safeVersion:'1.5.0',from,factory:to,owners:[from,other],threshold:2,predictedSafeAddress:predicted,dataHash:safe.dataHash,nativeValue:'0',maximumGasCostNative:'20000000000000000',maximumGasCostUsdc:'0.02',budgetApproved:true,signingAuthorized:false,broadcastAuthorized:false,hubDeploymentAuthorized:false,activationAuthorized:false};
const preparation={sourceCommit:'a'.repeat(40),sourceFingerprint:'b'.repeat(64)};
function fixture(mode='normal'){
 const calls=[],block={number:'0x64',hash:ethers.id('fixture-block'),timestamp:ethers.toQuantity(Math.floor(Date.now()/1000)-(mode==='stale'?1000:0)),baseFeePerGas:ethers.toQuantity(mode==='over-budget'?1_000_000_000_000n:20_000_000_000n),gasLimit:ethers.toQuantity(30_000_000)};
 const rpc=async(method,params)=>{calls.push(method);switch(method){
  case 'eth_getBlockByNumber':return mode==='reorg'&&params[0]==='0x64'?{...block,hash:ethers.id('other-block')}:block;
  case 'eth_getTransactionCount':return mode==='pending'&&params[1]==='pending'?'0x1':'0x0';
  case 'eth_getBalance':return mode==='insufficient'?'0x0':ethers.toQuantity(10n**18n);
  case 'eth_gasPrice':return ethers.toQuantity(20_000_000_000n);
  case 'eth_maxPriorityFeePerGas':return ethers.toQuantity(1_000_000_000n);
  case 'eth_estimateGas':return ethers.toQuantity(279502);
  case 'eth_call':return ethers.AbiCoder.defaultAbiCoder().encode(['address'],[mode==='simulation'?address():predicted]);
  case 'eth_chainId':return mode==='wrong-chain'?'0x4cef52':'0x13b2';
  default:throw Error('NON_READ_RPC_FORBIDDEN');
 }};
 return {rpc,calls};
}
test('budget approval produces a capped unsigned quote with signing/send still false',async()=>{
 const f=fixture(),q=await quoteSafe(preparation,f.rpc,budget,async()=>safe);
 assert.equal(q.budgetApproved,true);assert.equal(q.signingAuthorized,false);assert.equal(q.broadcastAuthorized,false);assert.equal(q.actualDeployment,false);
 assert.equal(q.unsignedTransaction.chainId,'0x13b2');assert.equal(q.unsignedTransaction.value,'0x0');assert.equal(q.unsignedTransaction.nonce,'0x0');
 assert.equal(q.gasLimit,'335403');assert.equal(q.fees.maximumGasCostUsdc,'0.013751523');assert.equal(q.dataHash,safe.dataHash);
 assert(f.calls.every(m=>!m.startsWith('eth_send')&&!m.includes('sign')));
});
test('wrong scope, increased cap, changed factory/owners/data or unmatched authorization flags are rejected',()=>{
 for(const patch of [{scope:'HUB_DEPLOYMENT'},{maximumGasCostNative:'30000000000000000'},{maximumGasCostUsdc:'0.03'},{factory:address()},{dataHash:ethers.id('wrong')},{owners:[from,address()]},{broadcastAuthorized:true},{nativeValue:'1'},{hubDeploymentAuthorized:true}])assert.throws(()=>validateBudget({...budget,...patch},safe),/SAFE_BUDGET_SCOPE_MISMATCH/);
});
test('over-budget, insufficient funds, pending nonce, stale/reorg/chain/simulation errors stop the quote',async()=>{
 for(const [mode,error]of Object.entries({'over-budget':'OVER_APPROVED_BUDGET',insufficient:'INSUFFICIENT_BALANCE',pending:'PENDING_SENDER_TRANSACTION',stale:'STALE_BLOCK',reorg:'CONTEXT_CHANGED','wrong-chain':'CONTEXT_CHANGED',simulation:'SIMULATION_MISMATCH'})){
  const f=fixture(mode);await assert.rejects(quoteSafe(preparation,f.rpc,budget,async()=>safe),new RegExp(error));
  if(['over-budget','insufficient','pending','stale'].includes(mode))assert(!f.calls.includes('eth_call'));
 }
});
module.exports={safe,budget,preparation};
