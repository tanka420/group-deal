import {expect} from 'chai';
import {ethers,network} from 'hardhat';
import {time} from '@nomicfoundation/hardhat-network-helpers';
import {Command,Model,Terms,newCampaign,predict,viewOrder,escrow} from './StateModel';
import {BackendProjection} from './BackendProjection';

export const FUNDING=1_000_000_000_000n;
export const identity=(buyer:number)=>ethers.id(`generated-account:0:${buyer}`);
const types={BuyAuthorization:[{name:'chainId',type:'uint256'},{name:'hubContract',type:'address'},{name:'campaignId',type:'uint256'},{name:'termsHash',type:'bytes32'},{name:'campaignIdentity',type:'bytes32'},{name:'buyerWallet',type:'address'},{name:'nonce',type:'uint256'},{name:'maxQuantity',type:'uint256'},{name:'deadline',type:'uint256'}]};
export async function localFixture(terms:Terms){
 if(network.name!=='hardhat'||(await ethers.provider.getNetwork()).chainId!==31337n)throw new Error('Only isolated Hardhat/31337 is allowed');
 const actors=(await ethers.getSigners()).slice(0,11),token=await(await ethers.getContractFactory('MockUSDC')).deploy();
 const hub=await(await ethers.getContractFactory('GroupDealHubV2')).deploy(await token.getAddress(),actors[7].address,actors[8].address,actors[9].address);
 for(let index=0;index<actors.length;index++){if(index!==0)await token.mint(actors[index].address,FUNDING);await token.connect(actors[index]).approve(await hub.getAddress(),ethers.MaxUint256);}
 const tx=await hub.connect(actors[terms.seller]).createCampaign({sellerPayoutWallet:actors[terms.seller].address,metric:terms.metric,maxPerAccount:terms.maxUnits,inventoryLimit:terms.inventory,durationSeconds:terms.duration,deliverySlaSeconds:terms.sla,earlyRebateEnabled:terms.earlySlots>0,earlySlotsCount:terms.earlySlots,earlyRebateAmount:terms.fixed,earlyRebateBps:terms.bps,platformFeeBps:0,termsHash:terms.termsHash},terms.prices.map((price,index)=>({price,threshold:terms.thresholds[index]})));
 const receipt=await tx.wait();if(!receipt)throw new Error('Creation receipt missing');const block=await ethers.provider.getBlock(receipt.blockNumber);if(!block)throw new Error('Creation block missing');
 const model:Model={now:block.timestamp,owner:0,operator:8,security:9,campaigns:[newCampaign(terms,block.timestamp)],orders:[]};
 return {actors,token,hub,model};
}
export type LocalContext=Awaited<ReturnType<typeof localFixture>>;
export async function backendFor(context:LocalContext,seed:number){
 const deployment=await context.hub.deploymentTransaction()!.wait();if(!deployment)throw new Error('Deployment receipt missing');
 return new BackendProjection((method,params)=>ethers.provider.send(method,params),{seed,hub:await context.hub.getAddress(),token:await context.token.getAddress(),deploymentBlock:deployment.blockNumber,actors:context.actors.map(actor=>actor.address),campaigns:1}).start();
}
export async function encoded(context:LocalContext,command:Command,authorizationNonce?:bigint){
 const {hub,actors,model}=context,terms=model.campaigns[0].terms,orderId=(command.orderSlots?.[0]??0)+1;
 let data:string,authNonce:bigint|undefined;
 switch(command.kind){
 case 'COMMIT':{
  const buyer=command.buyer??0;authNonce=authorizationNonce??model.campaigns[0].accounts.get(buyer)?.nonce??0n;
  const deadline=(await time.latest())+3600,hubContract=await hub.getAddress();
  const signature=await actors[7].signTypedData({name:'GroupDealHub',version:'1',chainId:31337n,verifyingContract:hubContract},types,{chainId:31337n,hubContract,campaignId:1,termsHash:terms.termsHash,campaignIdentity:identity(buyer),buyerWallet:actors[command.caller].address,nonce:authNonce,maxQuantity:terms.maxUnits,deadline});
  data=hub.interface.encodeFunctionData('commitToBuy',[1,identity(buyer),command.quantity??1,command.requireEarly??false,terms.maxUnits,deadline,signature]);break;
 }
 case 'FINALIZE':data=hub.interface.encodeFunctionData('finalizeCampaign',[1]);break;
 case 'DELIVER':data=hub.interface.encodeFunctionData('recordDelivery',[1,orderId,ethers.id('local actual delivery proof')]);break;
 case 'CONFIRM':data=hub.interface.encodeFunctionData('confirmReceipt',[1,orderId]);break;
 case 'DISPUTE':data=hub.interface.encodeFunctionData('openDispute',[1,orderId,ethers.id('local dispute reason digest')]);break;
 case 'CANCEL':data=hub.interface.encodeFunctionData('emergencyCancelCampaign',[1,ethers.id('local emergency cancel digest')]);break;
 case 'BUYER_CLAIM':data=hub.interface.encodeFunctionData('claimBuyerFunds',[1,(command.orderSlots??[]).map(slot=>slot+1)]);break;
 case 'SELLER_CLAIM':data=hub.interface.encodeFunctionData('claimSellerProceeds',[1,(command.orderSlots??[]).map(slot=>slot+1)]);break;
 default:throw new Error('Unsupported local concurrency command');
 }
 return {command,data,authNonce};
}
export async function checkModel(context:LocalContext,backend?:BackendProjection){
 const {hub,token,actors,model}=context,campaign=model.campaigns[0],state=await hub.campaignStates(1);
 for(const [name,expected] of Object.entries({status:campaign.status,totalUnitsCommitted:campaign.units,totalBuyerCount:campaign.buyers,totalGrossCommitted:campaign.gross,currentUnlockedTier:campaign.tier,earlySlotsTaken:campaign.earlySlotsUsed,finalClearingPrice:campaign.finalPrice,totalSellerClaimable:model.orders.reduce((s,o)=>s+o.seller,0n),totalSellerClaimed:model.orders.reduce((s,o)=>s+o.sellerPaid,0n)}))expect(String((state as any)[name]),name).to.equal(String(expected));
 expect(await hub.campaignEscrowBalance(1)).to.equal(escrow(model,0));expect(await token.balanceOf(await hub.getAddress())).to.equal(escrow(model,0));
 for(let buyer=0;buyer<4;buyer++){
  const account=campaign.accounts.get(buyer);expect(await hub.identityNonces(1,identity(buyer))).to.equal(account?.nonce??0n);
  expect(await hub.buyerUnitsCommitted(1,identity(buyer))).to.equal(account?.units??0n);
  expect(await hub.campaignIdentityPrincipals(1,identity(buyer))).to.equal(account?actors[account.principal].address:ethers.ZeroAddress);
 }
 for(const stored of model.orders){
  const order=viewOrder(model,stored),actual=await hub.getOrderDetails(stored.id);
  for(const [name,expected] of Object.entries({quantity:order.quantity,lockedUnitPrice:order.locked,committedGross:order.gross,isEarlySupporter:order.isEarly,earlyRebateValue:order.early,rebateAllocated:order.rebate,buyerRefundAllocated:order.refund,sellerAllocated:order.seller,deliveryStatus:order.status,buyerClaimed:stored.buyerClaimed,sellerClaimed:stored.sellerClaimed}))expect(String((actual as any)[name]),name).to.equal(String(expected));
  expect(await hub.buyerClaimedAmount(stored.id)).to.equal(stored.buyerPaid);
 }
 for(let actor=0;actor<actors.length;actor++){
  const buyer=model.orders.filter(o=>o.principal===actor).reduce((s,o)=>s-o.gross+o.buyerPaid,0n),seller=model.orders.filter(o=>model.campaigns[o.campaign].terms.seller===actor).reduce((s,o)=>s+o.sellerPaid,0n);
  expect(await token.balanceOf(actors[actor].address)).to.equal(FUNDING+buyer+seller);
 }
 if(backend)await backend.check(model);
}
export async function mineCommands(context:LocalContext,commands:Command[],backend?:BackendProjection){
 const prepared=await Promise.all(commands.map(command=>encoded(context,command))),nextNonce=new Map<number,number>(),submitted:any[]=[];
 for(const command of commands)if(!nextNonce.has(command.caller))nextNonce.set(command.caller,await ethers.provider.getTransactionCount(context.actors[command.caller].address));
 await network.provider.send('evm_setAutomine',[false]);
 try{
  for(const item of prepared){
   const nonce=nextNonce.get(item.command.caller)!;nextNonce.set(item.command.caller,nonce+1);
   const tx=await context.actors[item.command.caller].sendTransaction({to:await context.hub.getAddress(),data:item.data,nonce,gasLimit:1_000_000n,gasPrice:2_000_000_000n});submitted.push({...item,hash:tx.hash});
  }
  await network.provider.send('evm_mine');
 }finally{await network.provider.send('evm_setAutomine',[true]);}
 const mined=await Promise.all(submitted.map(async item=>{const receipt=await ethers.provider.getTransactionReceipt(item.hash);if(!receipt)throw new Error('Queued transaction not mined; inspect the owned local mempool');return {...item,receipt};}));
 expect(new Set(mined.map(item=>item.receipt.blockNumber)).size,'all queued commands must share a block').to.equal(1);
 mined.sort((a,b)=>a.receipt.index-b.receipt.index);const block=await ethers.provider.getBlock(mined[0].receipt.blockNumber);if(!block)throw new Error('Mined block missing');
 const trace=[];
 for(const item of mined){
  const before=context.model,command={...item.command};
  if(command.kind==='COMMIT')command.replayNonce=item.authNonce!==(before.campaigns[0].accounts.get(command.buyer??0)?.nonce??0n);
  const predicted=predict(before,command,block.timestamp);expect(item.receipt.status===1,command.kind+' receipt acceptance').to.equal(predicted.accepted);
  if(!predicted.accepted)expect(item.receipt.logs.length,'reverted transaction must have no persistent events').to.equal(0);
  if(predicted.accepted&&command.kind.includes('CLAIM')){
   const event=item.receipt.logs.map((log:any)=>{try{return context.hub.interface.parseLog(log);}catch{return null;}}).find((e:any)=>e?.name==='FundsClaimed');expect(event).not.to.equal(undefined);
   const buyer=command.kind==='BUYER_CLAIM',amount=predicted.model.orders.reduce((s,o,index)=>s+(buyer?o.buyerPaid-before.orders[index].buyerPaid:o.sellerPaid-before.orders[index].sellerPaid),0n);
   expect(event!.args.amount).to.equal(amount);expect(event!.args.claimType).to.equal(buyer?0:2);expect(event!.args.recipient).to.equal(context.actors[command.caller].address);
  }
  context.model=predicted.model;trace.push({command,accepted:predicted.accepted,txHash:item.hash,blockNumber:item.receipt.blockNumber,blockHash:item.receipt.blockHash,transactionIndex:item.receipt.index,gasUsed:String(item.receipt.gasUsed)});
 }
 try{await checkModel(context,backend);}catch(error){Object.assign(error as object,{localTrace:trace});throw error;}
 return trace;
}
