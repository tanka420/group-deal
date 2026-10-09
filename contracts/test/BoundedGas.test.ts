import {expect} from 'chai';
import {ethers} from 'hardhat';
import {time,takeSnapshot} from '@nomicfoundation/hardhat-network-helpers';
import fs from 'node:fs';
import path from 'node:path';
import {Terms} from './reference/StateModel';
import {localFixture,encoded,FUNDING} from './reference/LocalTransitions';
import {compiledV2Runtime} from '../scripts/compiledRuntime';

const directory=path.resolve(__dirname,'../../.cache/bounded-gas'),UNIT=1_000_000n;
const write=(name:string,value:unknown)=>{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,name),JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');};
describe('WP26 local order-count and explicit batch gas measurements',function(){
 this.timeout(180_000);
 const rows:any[]=[];
 for(const orderCount of [10,100,1000])it(`measures ${orderCount} real committed orders, lazy allocations and withdrawals`,async()=>{
  const terms:Terms={seller:4,metric:1,prices:[100n*UNIT,50n*UNIT],thresholds:[1n,BigInt(orderCount)],maxUnits:BigInt(orderCount),inventory:0n,duration:86400,sla:86400,earlySlots:0,fixed:0n,bps:0,termsHash:ethers.id('bounded actual local orders '+orderCount)};
  const {hub,token,actors,...rest}=await localFixture(terms),context={hub,token,actors,...rest},address=await hub.getAddress();
  const record:any={layer:'LOCAL_GAS_BENCHMARK',acceptanceEligible:false,chainId:31337,token:'MockUSDC',orderCount,terms,batches:[],claims:[],result:'RUNNING'};
  try{
   const code=await ethers.provider.getCode(address);expect(code).to.equal(await compiledV2Runtime(address,await token.getAddress(),31337n));record.runtimeHash=ethers.keccak256(code);
   let commitGasMin:bigint|undefined,commitGasMax=0n;
   for(let index=0;index<orderCount;index++){
    const call=await encoded(context,{kind:'COMMIT',campaign:0,caller:0,buyer:0,quantity:1},BigInt(index));
    const tx=await actors[0].sendTransaction({to:address,data:call.data,gasLimit:1_000_000n}),receipt=await tx.wait();if(!receipt)throw new Error('Commit receipt absent');expect(receipt.status).to.equal(1);
    const event=receipt.logs.map(log=>{try{return hub.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='CommitmentMade');
    expect(event!.args.orderId).to.equal(index+1);expect(event!.args.lockedUnitPrice).to.equal(100n*UNIT);expect(event!.args.committedGross).to.equal(100n*UNIT);
    commitGasMin=commitGasMin===undefined||receipt.gasUsed<commitGasMin?receipt.gasUsed:commitGasMin;if(receipt.gasUsed>commitGasMax)commitGasMax=receipt.gasUsed;
   }
   record.commitGas={minimum:commitGasMin,maximum:commitGasMax};
   const gross=100n*UNIT*BigInt(orderCount),state=await hub.campaignStates(1);expect(state.totalUnitsCommitted).to.equal(orderCount);expect(state.totalBuyerCount).to.equal(1);expect(state.totalGrossCommitted).to.equal(gross);
   expect(await token.balanceOf(address)).to.equal(gross);expect(await token.balanceOf(actors[0].address)).to.equal(FUNDING-gross);
   expect(await hub.identityNonces(1,ethers.id('generated-account:0:0'))).to.equal(orderCount);
   await time.increase(86401);const finalReceipt=await(await hub.finalizeCampaign(1,{gasLimit:1_000_000n})).wait();if(!finalReceipt)throw new Error('Final receipt absent');
   record.finalize={gasUsed:finalReceipt.gasUsed,txHash:finalReceipt.hash,blockNumber:finalReceipt.blockNumber,blockHash:finalReceipt.blockHash};
   const finalBlock=await ethers.provider.getBlock(finalReceipt.blockNumber);if(!finalBlock)throw new Error('Final block absent');record.localBlockGasLimit=finalBlock.gasLimit;
   expect((await hub.campaignStates(1)).finalClearingPrice).to.equal(50n*UNIT);
   const snapshot=await takeSnapshot(),batchCounts=[0,1,10,50,100,250,500].filter(count=>count<=orderCount);
   for(const count of batchCounts){
    await snapshot.restore();
    if(count===500){
     const before=Number(BigInt(await ethers.provider.send('eth_blockNumber',[])));let exhausted=false;
     try{await hub.allocateRebatesBatch(1,0,count,{gasLimit:16_000_000n});}catch(error){if(!/out of gas/i.test((error as Error).message))throw error;exhausted=true;}
     expect(exhausted,'500 worst-case allocations exceed the explicit local 16M budget').to.equal(true);
     const number=Number(BigInt(await ethers.provider.send('eth_blockNumber',[]))),block=await ethers.provider.getBlock(number);expect(number).to.equal(before+1);expect(block!.transactions.length).to.equal(1);
     const receipt=await ethers.provider.getTransactionReceipt(block!.transactions[0]);expect(receipt!.status).to.equal(0);expect(receipt!.gasUsed).to.equal(16_000_000n);expect(receipt!.logs.length).to.equal(0);
     for(let start=1;start<=count;start+=50){const orders=await Promise.all(Array.from({length:Math.min(50,count-start+1)},(_,index)=>hub.orders(start+index)));for(const order of orders)expect(order.rebateAllocated,'out-of-gas rollback').to.equal(0);}
     expect(await hub.campaignEscrowBalance(1)).to.equal(gross);expect(await token.balanceOf(address)).to.equal(gross);
     record.batches.push({count,gasBudget:16_000_000n,gasUsed:receipt!.gasUsed,status:0,expectedBudgetExhaustion:true,rollbackVerified:true,blockNumber:number,blockHash:block!.hash});continue;
    }
    const receipt=await(await hub.allocateRebatesBatch(1,0,count,{gasLimit:16_000_000n})).wait();if(!receipt)throw new Error('Allocation receipt absent');
    if(count>0){expect((await hub.orders(1)).rebateAllocated).to.equal(50n*UNIT);expect((await hub.orders(count)).rebateAllocated).to.equal(50n*UNIT);}
    if(count<orderCount)expect((await hub.orders(count+1)).rebateAllocated).to.equal(0);
    expect(await token.balanceOf(address)).to.equal(gross);expect(await hub.campaignEscrowBalance(1)).to.equal(gross);
    record.batches.push({count,gasUsed:receipt.gasUsed,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash});
   }
   await snapshot.restore();const beyond=await(await hub.allocateRebatesBatch(1,orderCount+7,5,{gasLimit:1_000_000n})).wait();expect((await hub.orders(orderCount)).rebateAllocated).to.equal(0);record.noopPastEndGas=beyond!.gasUsed;
   for(const count of [1,10,50,100,250].filter(count=>count<=orderCount)){
    await snapshot.restore();const ids=Array.from({length:count},(_,index)=>index+1);
    if(count===250){
     const before=Number(BigInt(await ethers.provider.send('eth_blockNumber',[])));let exhausted=false;
     try{await hub.connect(actors[0]).claimBuyerFunds(1,ids,{gasLimit:16_000_000n});}catch(error){if(!/out of gas/i.test((error as Error).message))throw error;exhausted=true;}
     expect(exhausted,'250 lazy claims exceed the explicit local 16M budget').to.equal(true);
     const number=Number(BigInt(await ethers.provider.send('eth_blockNumber',[]))),block=await ethers.provider.getBlock(number);expect(number).to.equal(before+1);expect(block!.transactions.length).to.equal(1);
     const receipt=await ethers.provider.getTransactionReceipt(block!.transactions[0]);expect(receipt!.status).to.equal(0);expect(receipt!.gasUsed).to.equal(16_000_000n);expect(receipt!.logs.length).to.equal(0);
     for(let start=1;start<=count;start+=50){const range=Array.from({length:Math.min(50,count-start+1)},(_,index)=>start+index),claimed=await Promise.all(range.map(id=>hub.buyerClaimedAmount(id))),orders=await Promise.all(range.map(id=>hub.orders(id)));for(let index=0;index<range.length;index++){expect(claimed[index]).to.equal(0);expect(orders[index].rebateAllocated).to.equal(0);expect(orders[index].buyerClaimed).to.equal(false);}}
     expect(await hub.campaignEscrowBalance(1)).to.equal(gross);expect(await token.balanceOf(address)).to.equal(gross);expect(await token.balanceOf(actors[0].address)).to.equal(FUNDING-gross);
     record.claims.push({count,gasBudget:16_000_000n,gasUsed:receipt!.gasUsed,status:0,expectedBudgetExhaustion:true,rollbackVerified:true,blockNumber:number,blockHash:block!.hash});continue;
    }
    const receipt=await(await hub.connect(actors[0]).claimBuyerFunds(1,ids,{gasLimit:16_000_000n})).wait();if(!receipt)throw new Error('Claim receipt absent');
    const withdrawn=50n*UNIT*BigInt(count);expect(await token.balanceOf(actors[0].address)).to.equal(FUNDING-gross+withdrawn);expect(await token.balanceOf(address)).to.equal(gross-withdrawn);expect(await hub.campaignEscrowBalance(1)).to.equal(gross-withdrawn);
    expect(await hub.buyerClaimedAmount(count)).to.equal(50n*UNIT);if(count<orderCount)expect(await hub.buyerClaimedAmount(count+1)).to.equal(0);
    const event=receipt.logs.map(log=>{try{return hub.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='FundsClaimed');expect(event!.args.amount).to.equal(withdrawn);expect(event!.args.claimType).to.equal(0);
    await expect(hub.connect(actors[0]).claimBuyerFunds(1,ids,{gasLimit:16_000_000n})).to.be.revertedWith('Order already claimed by buyer');expect(await hub.campaignEscrowBalance(1)).to.equal(gross-withdrawn);
    record.claims.push({count,gasUsed:receipt.gasUsed,amount:withdrawn,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash});
   }
   await snapshot.restore();const cancel=await(await hub.connect(actors[9]).emergencyCancelCampaign(1,ethers.id('bounded cancellation'),{gasLimit:1_000_000n})).wait();if(!cancel)throw new Error('Cancel receipt absent');record.cancel={gasUsed:cancel.gasUsed,txHash:cancel.hash,blockNumber:cancel.blockNumber,blockHash:cancel.blockHash};
   for(const id of [1,orderCount]){const order=await hub.getOrderDetails(id);expect(order.rebateAllocated).to.equal(50n*UNIT);expect(order.buyerRefundAllocated).to.equal(50n*UNIT);expect(order.deliveryStatus).to.equal(4);}
   let totalWithdrawal=0n;
   for(let start=0;start<orderCount;start+=100){
    const ids=Array.from({length:Math.min(100,orderCount-start)},(_,index)=>start+index+1),receipt=await(await hub.connect(actors[0]).claimBuyerFunds(1,ids,{gasLimit:16_000_000n})).wait();if(!receipt)throw new Error('Cancel withdrawal receipt absent');
    const event=receipt.logs.map(log=>{try{return hub.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='FundsClaimed'),amount=100n*UNIT*BigInt(ids.length);expect(event!.args.amount).to.equal(amount);totalWithdrawal+=amount;
    expect(await hub.campaignEscrowBalance(1)).to.equal(gross-totalWithdrawal);
   }
   expect(totalWithdrawal).to.equal(gross);expect(await token.balanceOf(address)).to.equal(0);expect(await token.balanceOf(actors[0].address)).to.equal(FUNDING);
   for(let start=1;start<=orderCount;start+=50){
    const ids=Array.from({length:Math.min(50,orderCount-start+1)},(_,index)=>start+index),orders=await Promise.all(ids.map(id=>hub.getOrderDetails(id))),claimed=await Promise.all(ids.map(id=>hub.buyerClaimedAmount(id)));
    for(let index=0;index<ids.length;index++){expect(claimed[index]).to.equal(100n*UNIT);expect(orders[index].buyerPrincipal).to.equal(actors[0].address);expect(orders[index].rebateAllocated).to.equal(50n*UNIT);expect(orders[index].buyerRefundAllocated).to.equal(50n*UNIT);expect(orders[index].sellerAllocated).to.equal(0);expect(orders[index].deliveryStatus).to.equal(4);}
   }
   record.perOrderWithdrawalVerified=orderCount;
   record.result='PASS';rows.push(record);write(`orders-${orderCount}.json`,record);
   console.log(`PASS LOCAL_GAS orders=${orderCount} finalize=${record.finalize.gasUsed} cancel=${record.cancel.gasUsed} finalEscrow=0`);
  }catch(error){record.result='FAIL';record.message=(error as Error).message;write(`orders-${orderCount}-failed.json`,record);throw error;}
 });
 after(()=>{
  if(rows.length!==3)return;
  const spreads:Record<string,string>={};
  for(const action of ['finalize','cancel']){const values=rows.map(row=>BigInt(row[action].gasUsed)),minimum=values.reduce((a,b)=>a<b?a:b),maximum=values.reduce((a,b)=>a>b?a:b);expect(maximum-minimum,action+' gas independent of campaign order count').to.be.at.most(500n);spreads[action]=String(maximum-minimum);}
  write('summary.json',{layer:'LOCAL_GAS_BENCHMARK',acceptanceEligible:false,result:'PASS',sizes:rows.map(row=>row.orderCount),finalizeSpread:spreads.finalize,cancelSpread:spreads.cancel,limits:'Actual local receipts only; Arc block/transaction limits, token implementation and fee funding require independent live verification'});
 });
});
