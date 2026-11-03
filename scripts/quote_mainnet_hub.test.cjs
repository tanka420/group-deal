const test=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('../backend/node_modules/ethers'),{quoteDeployment}=require('./quote_mainnet_deployment.cjs');
const address=()=>ethers.Wallet.createRandom().address,from=address(),security=address(),owners=[from,address()],code='0x6001600055';
const abi=new ethers.Interface(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function VERSION() view returns(string)','function nonce() view returns(uint256)','function getModulesPaginated(address,uint256) view returns(address[],address)']);
function fixture(mode='normal'){
 const calls=[],block={number:'0x64',hash:ethers.id('hub-quote-fixture-block'),timestamp:ethers.toQuantity(Math.floor(Date.now()/1000)),baseFeePerGas:ethers.toQuantity(20_000_000_000n),gasLimit:ethers.toQuantity(30_000_000)};
 const roles={owner:from,authorizedSigner:address(),operator:owners[1],securityAuthority:security};
 const prep={sourceCommit:'a'.repeat(40),sourceFingerprint:'b'.repeat(64),signingAuthorized:false,broadcastAuthorized:false,activationAuthorized:false,deploymentPlan:{releaseStatus:'SUPERSEDED'},productionDeploymentPlan:{scope:'PRODUCTION_HUB_V2_DEPLOYMENT',releaseStatus:'PREPARED_FOR_OWNER_REVIEW',roles,budgetApproved:false,signingAuthorized:false,broadcastAuthorized:false,runtimeActivationAuthorized:false},manifest:{contracts:{USDC:{address:address()}},roles:{securityAuthority:{address:security,owners,safeVersion:'1.5.0',bytecodeHash:ethers.keccak256(code)}}},candidates:[{selectedForRelease:true,protocolVersion:2,contract:'GroupDealHubV2',constructor:{arguments:[]},unsignedTransaction:{from,data:'0x12345678'}}]};
 const rpc=async(method,params)=>{calls.push(method);switch(method){
  case 'eth_chainId':return '0x13b2';case 'eth_getBlockByNumber':return block;
  case 'eth_getCode':return params[0]===from?'0x':mode==='wrong-code'&&params[0]===security?'0x6000':code;
  case 'eth_getBalance':return ethers.toQuantity(10n**18n);case 'eth_getTransactionCount':return mode==='pending'&&params[1]==='pending'?'0x2':'0x1';
  case 'eth_gasPrice':return ethers.toQuantity(20_000_000_000n);case 'eth_maxPriorityFeePerGas':return ethers.toQuantity(1_000_000_000n);
  case 'eth_estimateGas':return ethers.toQuantity(4_650_432);
  case 'eth_call':{const tx=params[0];if(!tx.to)return '0x6002600055';const name=abi.parseTransaction({data:tx.data}).name;return abi.encodeFunctionResult(name,({getOwners:[mode==='owners'?[address(),address()]:owners],getThreshold:[mode==='threshold'?1:2],VERSION:[mode==='version'?'1.4.1':'1.5.0'],nonce:[mode==='safe-nonce'?1:0],getModulesPaginated:[mode==='module'?[address()]:[],'0x0000000000000000000000000000000000000001']})[name]);}
  default:throw Error('RPC_MUTATION_FORBIDDEN');
 }};return {prep,rpc,calls};
}
test('production quote uses the actual Safe and distinct plan while retaining all authority false',async()=>{
 const f=fixture(),q=await quoteDeployment(f.prep,f.rpc);assert.equal(q.unsignedTransaction.nonce,'0x1');assert.equal(q.securityAuthority.address,security);assert.equal(q.securityAuthority.safeVerified,true);assert.equal(q.budgetApproved,false);assert.equal(q.signingAuthorized,false);assert.equal(q.broadcastAuthorized,false);assert.equal(q.activationAuthorized,false);assert.equal(q.expectedContractAddress,ethers.getCreateAddress({from,nonce:1}));assert(!f.calls.some(m=>m.includes('send')||m.includes('sign')));
});
test('a superseded legacy plan never becomes deployable without a separate valid production plan',async()=>{
 const f=fixture();delete f.prep.productionDeploymentPlan;await assert.rejects(quoteDeployment(f.prep,f.rpc),/MAINNET_PRODUCTION_ROLE_PLAN_REQUIRED/);assert.equal(f.calls.length,0);
 const g=fixture();g.prep.productionDeploymentPlan.signingAuthorized=true;await assert.rejects(quoteDeployment(g.prep,g.rpc),/MAINNET_QUOTE_PRODUCTION_SCOPE_INVALID/);assert.equal(g.calls.length,0);
});
test('changed Safe bytecode, owners, threshold, version, nonce, modules or pending sender blocks estimate',async()=>{
 for(const mode of ['wrong-code','owners','threshold','version','safe-nonce','module','pending']){const f=fixture(mode);await assert.rejects(quoteDeployment(f.prep,f.rpc),/MAINNET_QUOTE_/);assert(!f.calls.includes('eth_estimateGas'));}
});
