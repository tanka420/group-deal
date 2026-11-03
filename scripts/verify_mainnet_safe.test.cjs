const test=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('../backend/node_modules/ethers'),{buildSafePlan}=require('./prepare_mainnet_safe.cjs'),{validateTransaction,readRpc}=require('./verify_mainnet_safe.cjs');
const manifest=structuredClone(require('../shared/manifests/arc-mainnet.json')),addr=()=>ethers.Wallet.createRandom().address;
manifest.roles.owner.address=addr();manifest.roles.operator.address=addr();manifest.roles.authorizedSigner.address=addr();manifest.roles.securityAuthority.address='';manifest.roles.securityAuthority.owners=[manifest.roles.owner.address,manifest.roles.operator.address];
const plan=buildSafePlan(manifest),hash=ethers.id('isolated-safe-transaction'),block={number:'0x64',hash:ethers.id('isolated-safe-block')},safe=addr();
const budget={from:plan.from,factory:plan.contracts.factory.address,predictedSafeAddress:safe,owners:plan.owners,dataHash:ethers.keccak256(plan.data),maximumGasCostNative:'20000000000000000'};
function fixture(){
 const event=(abi,name,args,address)=>({address,...abi.encodeEventLog(abi.getEvent(name),args),transactionHash:hash,blockHash:block.hash,removed:false});
 const tx={hash,from:plan.from,to:budget.factory,value:'0x0',nonce:'0x0',chainId:'0x13b2',type:'0x2',input:plan.data,blockHash:block.hash,blockNumber:'0x64',gas:ethers.toQuantity(419253),maxFeePerGas:ethers.toQuantity(27_000_000_000n),maxPriorityFeePerGas:'0x0'};
 const receipt={transactionHash:hash,from:tx.from,to:tx.to,status:'0x1',blockHash:block.hash,blockNumber:'0x64',gasUsed:ethers.toQuantity(272835),effectiveGasPrice:ethers.toQuantity(20_000_000_000n),logs:[event(plan.contracts.factory.interface,'ProxyCreation',[safe,plan.contracts.singleton.address],budget.factory),event(plan.contracts.singleton.interface,'SafeSetup',[budget.factory,plan.owners,2,ethers.ZeroAddress,plan.contracts.fallbackHandler.address],safe)]};
 const attempt={hash,dataHash:budget.dataHash,transaction:{nonce:'0x0',gas:ethers.toQuantity(335403),maxFeePerGas:ethers.toQuantity(41_000_000_000n),maxPriorityFeePerGas:'0x0'}};return {tx,receipt,attempt};
}
test('finalized transaction comparison permits wallet fee edits only within the approved total cap',()=>{
 const {tx,receipt,attempt}=fixture(),r=validateTransaction(hash,tx,receipt,block,budget,plan,attempt);assert.equal(r.actualGasCostUsdc,'0.0054567');assert.equal(r.walletMaximumGasCostUsdc,'0.011319831');assert.equal(r.walletAdjustedGasFields,true);
});
test('wrong hash/status/chain/from/to/value/input/nonce/block, excessive fees or removed logs are rejected',()=>{
 for(const patch of [{hash:ethers.id('wrong')},{chainId:'0x4cef52'},{from:addr()},{to:addr()},{value:'0x1'},{input:'0x1234'},{nonce:'0x1'},{blockHash:ethers.id('wrong-block')},{maxFeePerGas:ethers.toQuantity(1_000_000_000_000n)}]){const f=fixture();assert.throws(()=>validateTransaction(hash,{...f.tx,...patch},f.receipt,block,budget,plan,f.attempt),/SAFE_VERIFY_/);}
 for(const patch of [{status:'0x0'},{gasUsed:ethers.toQuantity(9999999)},{logs:[]}]){const f=fixture();assert.throws(()=>validateTransaction(hash,f.tx,{...f.receipt,...patch},block,budget,plan,f.attempt),/SAFE_VERIFY_/);}
 const f=fixture();f.receipt.logs[0].removed=true;assert.throws(()=>validateTransaction(hash,f.tx,f.receipt,block,budget,plan,f.attempt),/SAFE_VERIFY_/);
});
test('unexpected Safe threshold is rejected and RPC forbids mutation before network',async()=>{
 const f=fixture(),abi=plan.contracts.singleton.interface;Object.assign(f.receipt.logs[1],abi.encodeEventLog(abi.getEvent('SafeSetup'),[budget.factory,plan.owners,1,ethers.ZeroAddress,plan.contracts.fallbackHandler.address]));
 assert.throws(()=>validateTransaction(hash,f.tx,f.receipt,block,budget,plan,f.attempt),/SETUP_EVENT_MISMATCH/);
 assert.throws(()=>readRpc('https://untrusted.invalid'),/RPC_NOT_ALLOWED/);await assert.rejects(readRpc('https://rpc.mainnet.arc.io')('eth_sendRawTransaction',[]),/METHOD_NOT_ALLOWED/);
});
