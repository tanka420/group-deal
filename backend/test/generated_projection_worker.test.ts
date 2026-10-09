import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createInterface} from "node:readline";
import {ethers} from "ethers";
import {TransactionalStore} from "../src/db/store";
import {IndexerProjection} from "../src/services/indexerService";
import {ReconciliationService} from "../src/services/reconciliationService";
import {config} from "../src/config";
import {orderFunds} from "../../shared/domain.cjs";

const workspace=path.resolve(__dirname,"../.."),cache=path.join(workspace,".cache");
let projection:TransactionalStore|undefined,indexer:IndexerProjection|undefined,provider:ethers.JsonRpcProvider|undefined,directory:string|undefined;
let property="worker",seed=0;
const digest=(value:unknown)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const compare=(label:string,actual:unknown,expected:unknown)=>{property=label;assert.equal(String(actual).toLowerCase(),String(expected).toLowerCase(),label);};
function requireStore():TransactionalStore {assert.ok(projection?.isIsolated,"Only an isolated fixture database is allowed");return projection!;}
function markers(state:TransactionalStore){return Object.values(state.db.orders).map(order=>[order.id,digest([order.disputeReason,order.disputeEvidence])]);}

async function checkpoint(body:any){
  const state=requireStore();assert.ok(indexer&&provider);
  property="indexer.sync";await indexer!.syncThroughBlock(body.blockNumber);
  property="canonical.block";const block=await provider!.getBlock(body.blockNumber);assert.equal(block?.hash,body.blockHash);
  compare("projection.orderCount",Object.keys(state.db.orders).length,body.orders.length);
  compare("projection.campaignCount",Object.keys(state.db.campaigns).length,body.campaigns.length);
  for(const expected of body.campaigns){
    const actual=state.db.campaigns[String(expected.id)];property="projection.campaignMissing";assert.ok(actual);
    for(const [field,value] of Object.entries(expected.fields))compare("projection.campaign."+field,field==="finalizedAt"?actual.finalizedAt||0:field==="finalClearingPrice"?actual.finalClearingPrice||"0":(actual as any)[field],value);
  }
  for(const expected of body.orders){
    const actual=state.db.orders[String(expected.id)];property="projection.orderMissing";assert.ok(actual);
    for(const [field,value] of Object.entries(expected.fields))compare("projection.order."+field,(actual as any)[field],value);
    const funds=orderFunds(actual);
    for(const [field,value] of Object.entries(expected.funds))compare("projection.funds."+field,(funds as any)[field],value);
  }
  property="reconciliation.status";
  const report=await ReconciliationService.runReconciliation({fixedBlockNumber:body.blockNumber,projectionStore:state,customProvider:provider});
  assert.equal(report.status,"HEALTHY",report.discrepancies.join("; "));
  assert.ok(report.perOrderVerified&&report.coverageVerified&&report.onchainBalanceVerified&&report.conservationLawPassed);
  compare("reconciliation.blockHash",report.blockHash,body.blockHash);
  // Fixture evidence survives financial updates/restart; it is not entitlement/delivery acceptance.
  state.transaction(()=>{for(const order of Object.values(state.db.orders))if(order.disputeReason===undefined){order.disputeReason=`isolated generated evidence marker ${seed}`;order.disputeEvidence=["https://example.test/isolated-evidence"];}});
  return {status:report.status,blockNumber:report.blockNumber,blockHash:report.blockHash,orders:report.totalOrdersCount,journal:Object.keys(state.db.eventJournal).length,markerDigest:digest(markers(state))};
}

async function dispatch(body:any):Promise<any>{
  switch(body.type){
    case "INIT":{
      assert.ok(!projection&&!provider);seed=body.seed;
      const endpoint=new URL(body.rpcUrl);assert.equal(endpoint.protocol,"http:");assert.equal(endpoint.hostname,"127.0.0.1");assert.match(endpoint.port,/^\d+$/);
      assert.equal(body.chainId,31337);assert.equal(body.protocolVersion,2);assert.ok(ethers.isAddress(body.hub)&&ethers.isAddress(body.token));
      config.arcChainId=31337;config.protocolVersion=2;config.hubAddress=body.hub;config.usdcAddress=body.token;config.deploymentBlock=body.deploymentBlock;
      config.arcWsUrl="";config.arcRpcUrl=body.rpcUrl;
      fs.mkdirSync(cache,{recursive:true});directory=body.directory?path.resolve(body.directory):fs.mkdtempSync(path.join(cache,"generated-projection-"));
      assert.ok(directory.startsWith(cache+path.sep)&&path.basename(directory).startsWith("generated-projection-"));
      projection=new TransactionalStore(directory);assert.ok(projection.isIsolated);
      if(!Object.keys(projection.db.users).length)projection.transaction(()=>{
        for(let buyer=0;buyer<4;buyer++){
          const id=`generated_buyer_${buyer}`;projection!.db.users[id]={id,email:`buyer-${buyer}@example.test`,emailVerified:true,roles:["buyer"],createdAt:0,activeWallet:body.actors[buyer]};
          for(let campaign=0;campaign<body.campaigns;campaign++)projection!.db.campaignIdentities[id+":"+(campaign+1)]={accountId:id,campaignId:String(campaign+1),identity:ethers.id(`generated-account:${campaign}:${buyer}`),derivationVersion:1,createdAt:0};
        }
      });
      provider=new ethers.JsonRpcProvider(body.rpcUrl,31337,{staticNetwork:true,cacheTimeout:-1,batchStallTime:0});
      compare("worker.chain",(await provider.getNetwork()).chainId,31337);
      assert.notEqual(await provider.getCode(body.hub),"0x");
      indexer=new IndexerProjection(projection,false);indexer.setProvider(provider);
      return {directory,isolated:true,activeDatabaseOpened:false,markerDigest:digest(markers(projection))};
    }
    case "CHECK":return checkpoint(body);
    case "DUPLICATE":{
      const state=requireStore();const before=digest(state.db);
      const logs=await provider!.getLogs({address:config.hubAddress,fromBlock:config.deploymentBlock,toBlock:body.blockNumber});
      await Promise.all([indexer!.processLogs([...logs].reverse()),indexer!.processLogs([...logs,...logs])]);
      compare("duplicate.unchanged",digest(state.db),before);return {unchanged:true,logs:logs.length};
    }
    case "OUTAGE":{
      const state=requireStore(),before=digest(state.db);let rejected=false;
      try{await indexer!.syncThroughBlock(body.blockNumber);}catch{rejected=true;}
      assert.ok(rejected,"Outage must prevent cursor advancement");
      const report=await ReconciliationService.runReconciliation({fixedBlockNumber:body.blockNumber,projectionStore:state,customProvider:provider});
      compare("outage.status",report.status,"UNVERIFIED");compare("outage.unchanged",digest(state.db),before);
      return {status:report.status,unchanged:true};
    }
    case "CORRUPT":{
      const state=requireStore(),order=Object.values(state.db.orders)[0];if(!order)return {skipped:true};
      const amount=order.buyerClaimedAmount;
      try{
        state.transaction(()=>{order.buyerClaimedAmount=(BigInt(order.buyerClaimedAmount||"0")+1n).toString();});
        const report=await ReconciliationService.runReconciliation({fixedBlockNumber:body.blockNumber,projectionStore:state,customProvider:provider});
        compare("corruption.status",report.status,"DISCREPANCY_DETECTED");assert.equal(report.severity,"CRITICAL");
        return {status:report.status,critical:true};
      }finally{state.transaction(()=>{order.buyerClaimedAmount=amount;});}
    }
    case "REBUILD":{
      const state=requireStore(),shadowDirectory=fs.mkdtempSync(path.join(cache,"generated-projection-shadow-")),shadow=new TransactionalStore(shadowDirectory);
      try{
        shadow.transaction(()=>Object.assign(shadow.db,structuredClone(state.db)));
        const rebuilt=new IndexerProjection(shadow,false,true);rebuilt.setProvider(provider);
        await rebuilt.rebuildFromClean(config.deploymentBlock,body.blockNumber);
        const report=await ReconciliationService.runReconciliation({fixedBlockNumber:body.blockNumber,projectionStore:shadow,customProvider:provider});
        compare("rebuild.status",report.status,"HEALTHY");compare("rebuild.privateMarkers",digest(markers(shadow)),digest(markers(state)));
        const fields=["id","onchainOrderId","campaignId","buyerAccountId","campaignIdentity","buyerPrincipal","quantity","lockedUnitPrice","committedGross","rebateAllocated","buyerRefundAllocated","sellerAllocated","buyerClaimedAmount","sellerClaimedAmount","deliveryStatus"];
        const snapshot=(database:TransactionalStore)=>Object.values(database.db.orders).map(order=>fields.map(field=>(order as any)[field]));
        compare("rebuild.financialSnapshot",digest(snapshot(shadow)),digest(snapshot(state)));
        return {status:report.status,orders:report.totalOrdersCount,privateMarkersPreserved:true,sourceMutated:false};
      }finally{shadow.close();}
    }
    case "CLOSE":provider?.destroy();projection?.close();projection=undefined;provider=undefined;return {closed:true};
    default:throw new Error("Unknown isolated worker command");
  }
}
async function main(){
  assert.ok(process.argv.some(arg=>/[\\/]test[\\/].+\.test\.ts$/.test(arg)),"Worker requires a real test entrypoint");
  const reader=createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of reader){
    let id:any;
    try{assert.ok(line.length<2_000_000);const body=JSON.parse(line);id=body.id;property="worker";const result=await dispatch(body);process.stdout.write(JSON.stringify({id,ok:true,result})+"\n");if(body.type==="CLOSE")break;}
    catch(error){process.stdout.write(JSON.stringify({id,ok:false,error:{property,message:error instanceof Error?error.message:"Isolated worker failure"}})+"\n");}
  }
  provider?.destroy();projection?.close();
}
main().catch(()=>{console.error("Isolated generated projection worker could not start");process.exitCode=1;});
