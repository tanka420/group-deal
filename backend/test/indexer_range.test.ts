import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ethers} from 'ethers';
import {TransactionalStore} from '../src/db/store';
import {IndexerProjection} from '../src/services/indexerService';
import {config} from '../src/config';

async function main(){
 const target=new TransactionalStore(fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-indexer-ranges-'))),original=config.deploymentBlock,indexer=new IndexerProjection(target,false);
 const ranges:number[][]=[];let fail=true,reads=0;
 const provider={getNetwork:async()=>({chainId:BigInt(config.arcChainId)}),getBlock:async(number:number)=>{reads++;return{number,hash:ethers.id('block-'+number),timestamp:1700000000+number};},getLogs:async({fromBlock,toBlock}:{fromBlock:number;toBlock:number})=>{ranges.push([fromBlock,toBlock]);if(fail&&fromBlock===5001)throw Error('Arc read RPC unavailable or wrong network');return[];}};
 try{
  config.deploymentBlock=1;indexer.setProvider(provider);
  for(const rangeSize of [0,-1,5001,NaN,Infinity,1.5])await assert.rejects(indexer.syncThroughBlock(12000,{rangeSize}),/Invalid bounded sync/);
  assert.equal(reads,0);assert.equal(target.db.syncState.lastIndexedBlock,0);
  await assert.rejects(indexer.syncThroughBlock(12000,{rangeSize:5000}),/Arc read RPC unavailable/);
  assert.equal(target.db.syncState.lastIndexedBlock,5000);assert.equal(target.db.syncState.lastIndexedBlockHash,ethers.id('block-5000'));
  assert.deepEqual(ranges,[[1,5000],[5001,10000]]);assert.deepEqual(target.db.eventJournal,{});
  fail=false;ranges.length=0;
  await indexer.syncThroughBlock(12000,{rangeSize:5000});
  assert.deepEqual(ranges,[[5001,10000],[10001,12000]]);assert.equal(target.db.syncState.lastIndexedBlock,12000);
  ranges.length=0;await indexer.syncThroughBlock(13001);
  assert.deepEqual(ranges,[[12001,12500],[12501,13000],[13001,13001]]);
  const before=JSON.stringify(target.snapshot());indexer.setProvider({...provider,getBlock:async(number:number)=>({...await provider.getBlock(number),hash:ethers.id('reorg')})});
  await assert.rejects(indexer.syncThroughBlock(14000,{rangeSize:5000}),/durable cursor block hash changed/);assert.equal(JSON.stringify(target.snapshot()),before);
  console.log('PASS bounded indexer ranges: invalid sizes rejected, failed ranges do not advance, verified resume, canonical hash guard and unchanged production default');
 }finally{config.deploymentBlock=original;indexer.stop();target.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
