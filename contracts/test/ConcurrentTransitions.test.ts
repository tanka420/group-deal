import {expect} from 'chai';
import {ethers} from 'hardhat';
import {time} from '@nomicfoundation/hardhat-network-helpers';
import fs from 'node:fs';
import path from 'node:path';
import {Terms,Command} from './reference/StateModel';
import {localFixture,backendFor,checkModel,mineCommands} from './reference/LocalTransitions';

const directory=path.resolve(__dirname,'../../.cache/concurrent-transitions');
const write=(name:string,value:unknown)=>{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,name),JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');};
function terms(seed:number):Terms{return {seller:4,metric:1,prices:[100_000_000n+BigInt(seed),50_000_000n],thresholds:[1n,2n],maxUnits:8n,inventory:0n,duration:86400,sla:86400,earlySlots:0,fixed:0n,bps:0,termsHash:ethers.id('concurrent terms '+seed)};}
const commit=(caller:number,buyer=caller,quantity=1,requireEarly=false):Command=>({kind:'COMMIT',campaign:0,caller,buyer,quantity,requireEarly});

describe('WP26 local queued transaction/model/projection concurrency',function(){
 this.timeout(180_000);
 for(const [caseIndex,seed] of [1,7,19,73,311,7331,65537,31153].entries())it(`checks queued competition seed ${seed} using actual same-block receipts`,async()=>{
  const configuration=terms(seed),kind=caseIndex%4,quantity=kind===1?2+seed%3:1+seed%3,requireSecondEarly=caseIndex<4;
  if(kind===1){configuration.maxUnits=BigInt(quantity);configuration.inventory=BigInt(quantity);}
  if(kind===3){configuration.earlySlots=1;configuration.fixed=25_000_000n+BigInt(seed);}
  const context=await localFixture(configuration),backend=await backendFor(context,seed),trace:any[]=[];
  try{
   await checkModel(context,backend);
   if(kind===0)trace.push(...await mineCommands(context,[commit(0)],backend));
   const commands=kind===1?[commit(0,0,quantity),commit(1,1,quantity)]:kind===3?[commit(0,0,quantity,true),commit(1,1,quantity,requireSecondEarly)]:kind===0?[commit(1,0),commit(0,0)]:[commit(0),commit(0)];
   const race=await mineCommands(context,commands,backend);trace.push(...race);
   if(kind!==3||requireSecondEarly)expect(race.filter(item=>item.accepted).length,'exactly one competing intent succeeds').to.equal(1);
   else expect(race.filter(item=>item.accepted).length).to.equal(2);
   if(kind===2){
    trace.push(...await mineCommands(context,[commit(0)],backend));
    await time.increase(86401);trace.push(...await mineCommands(context,[{kind:'FINALIZE',campaign:0,caller:10}],backend));
    const claim:Command={kind:'BUYER_CLAIM',campaign:0,caller:0,orderSlots:[0]};const withdrawals=await mineCommands(context,[claim,claim],backend);trace.push(...withdrawals);
    expect(withdrawals.map(item=>item.accepted)).to.deep.equal([true,false]);
   }
   await backend.rebuild();
   write(`seed-${seed}.json`,{layer:'LOCAL_QUEUED_CONCURRENCY',acceptanceEligible:false,result:'PASS',seed,kind,terms:configuration,trace,backend:backend.stats});
   console.log(`PASS LOCAL_QUEUED seed=${seed} kind=${kind} transactions=${trace.length}`);
  }catch(error){write(`seed-${seed}-failed.json`,{layer:'LOCAL_QUEUED_CONCURRENCY',acceptanceEligible:false,result:'FAIL',seed,kind,terms:configuration,trace:trace.concat((error as any).localTrace??[]),property:(error as any).property??'concurrency',message:(error as Error).message});throw error;}
  finally{await backend.close();}
 });
 for(const cancellationFirst of [true,false])it(`preserves effective cancelled status when dispute/cancel share a block (${cancellationFirst?'cancel first':'dispute first'})`,async()=>{
  const context=await localFixture(terms(991)),backend=await backendFor(context,991),trace:any[]=[];
  try{
   trace.push(...await mineCommands(context,[commit(0)],backend));await time.increase(86401);
   trace.push(...await mineCommands(context,[{kind:'FINALIZE',campaign:0,caller:10}],backend));
   trace.push(...await mineCommands(context,[{kind:'DELIVER',campaign:0,caller:4,orderSlots:[0]}],backend));
   const cancel:Command={kind:'CANCEL',campaign:0,caller:9},dispute:Command={kind:'DISPUTE',campaign:0,caller:0,orderSlots:[0]};
   trace.push(...await mineCommands(context,cancellationFirst?[cancel,dispute]:[dispute,cancel],backend));
   await backend.rebuild();write(`cancel-dispute-${cancellationFirst}.json`,{layer:'LOCAL_QUEUED_CONCURRENCY',acceptanceEligible:false,result:'PASS',cancellationFirst,trace,backend:backend.stats});
  }catch(error){write(`cancel-dispute-${cancellationFirst}-failed.json`,{layer:'LOCAL_QUEUED_CONCURRENCY',acceptanceEligible:false,result:'FAIL',cancellationFirst,trace:trace.concat((error as any).localTrace??[]),property:(error as any).property??'concurrency',message:(error as Error).message});throw error;}
  finally{await backend.close();}
 });
 it('projects a canonical seller batch containing repeated zero-proceeds orders and a positive order',async()=>{
  const configuration=terms(1001);configuration.earlySlots=1;configuration.fixed=configuration.prices[0];
  const context=await localFixture(configuration),backend=await backendFor(context,1001),trace:any[]=[];
  try{
   trace.push(...await mineCommands(context,[commit(0),commit(1)],backend));await time.increase(86401);
   trace.push(...await mineCommands(context,[{kind:'FINALIZE',campaign:0,caller:10}],backend));
   for(const slot of [0,1]){trace.push(...await mineCommands(context,[{kind:'DELIVER',campaign:0,caller:4,orderSlots:[slot]}],backend));trace.push(...await mineCommands(context,[{kind:'CONFIRM',campaign:0,caller:slot,orderSlots:[slot]}],backend));}
   expect(context.model.orders[0].seller).to.equal(0n);expect(context.model.orders[1].seller).to.equal(50_000_000n);
   trace.push(...await mineCommands(context,[{kind:'SELLER_CLAIM',campaign:0,caller:4,orderSlots:[0,0,1]}],backend));
   const duplicate=await mineCommands(context,[{kind:'SELLER_CLAIM',campaign:0,caller:4,orderSlots:[0,0,1]}],backend);trace.push(...duplicate);expect(duplicate[0].accepted).to.equal(false);
   await backend.rebuild();write('seller-zero-duplicate.json',{layer:'LOCAL_QUEUED_CONCURRENCY',acceptanceEligible:false,result:'PASS',trace,backend:backend.stats});
  }catch(error){write('seller-zero-duplicate-failed.json',{layer:'LOCAL_QUEUED_CONCURRENCY',acceptanceEligible:false,result:'FAIL',trace:trace.concat((error as any).localTrace??[]),property:(error as any).property??'concurrency',message:(error as Error).message});throw error;}
  finally{await backend.close();}
 });
});
