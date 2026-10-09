import http from "node:http";
import path from "node:path";
import {spawn,ChildProcessWithoutNullStreams} from "node:child_process";
import {createInterface} from "node:readline";
import {ethers} from "ethers";
import {Model,viewOrder} from "./StateModel";

const root=path.resolve(__dirname,"../../.."),readMethods=new Set(["eth_chainId","eth_call","eth_blockNumber","eth_getLogs","eth_getBlockByNumber","eth_getBlockByHash","eth_getTransactionByHash","eth_getTransactionReceipt","eth_getCode"]);
type Settings={seed:number;hub:string;token:string;deploymentBlock:number;actors:string[];campaigns:number};
export class BackendDifference extends Error {constructor(public property:string,message:string){super(message);}}
/** The HTTP transport forwards actual local EVM reads, never synthesized financial responses. */
export class BackendProjection {
  private server!:http.Server;private child?:ChildProcessWithoutNullStreams;private sequence=0;private directory?:string;private closed=false;private outage=false;
  private url="";private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  readonly stats={checkpoints:0,duplicateChecks:0,restarts:0,outageChecks:0,corruptionChecks:0,rebuilds:0,rpcReads:0,methods:{} as Record<string,number>};
  constructor(private readonly rpc:(method:string,params:any[])=>Promise<any>,private readonly settings:Settings){}
  async start(){
    this.server=http.createServer(async(request,response)=>{
      if(request.method!=="POST"||request.url!=="/"){response.writeHead(404);response.end();return;}
      if(this.outage){response.writeHead(503);response.end();return;}
      try{
        let content="";for await(const chunk of request){content+=chunk;if(content.length>2_000_000)throw new Error("RPC body too large");}
        const body=JSON.parse(content),requests=Array.isArray(body)?body:[body];
        const replies=await Promise.all(requests.map(async(input:any)=>{
          if(input.jsonrpc!=="2.0"||!readMethods.has(input.method)||!Array.isArray(input.params))return {jsonrpc:"2.0",id:input.id,error:{code:-32601,message:"Read-only local EVM proxy rejects this method"}};
          try{this.stats.rpcReads++;this.stats.methods[input.method]=(this.stats.methods[input.method]||0)+1;return {jsonrpc:"2.0",id:input.id,result:await this.rpc(input.method,input.params)};}
          catch(error){const failure=error as any;return {jsonrpc:"2.0",id:input.id,error:{code:typeof failure.code==="number"?failure.code:3,message:"Local EVM read reverted",data:failure.data}};}
        }));
        response.writeHead(200,{"Content-Type":"application/json"});response.end(JSON.stringify(Array.isArray(body)?replies:replies[0]));
      }catch{response.writeHead(400);response.end();}
    });
    await new Promise<void>(resolve=>this.server.listen(0,"127.0.0.1",resolve));const address=this.server.address();if(!address||typeof address==="string")throw new Error("Owned RPC proxy did not bind");
    this.url=`http://127.0.0.1:${address.port}`;await this.spawnWorker();return this;
  }
  private async spawnWorker(){
    this.closed=false;
    this.child=spawn(process.execPath,[path.join(root,"backend/node_modules/tsx/dist/cli.mjs"),path.join(root,"backend/test/generated_projection_worker.test.ts")],{cwd:path.join(root,"backend"),stdio:["pipe","pipe","pipe"],env:{...process.env,NODE_ENV:"test"}});
    // No environment/credentials or private staged data are forwarded to test output.
    this.child.stderr.on("data",()=>{});
    this.child.on("error",()=>this.rejectPending(new Error("Isolated backend worker could not start")));
    this.child.on("exit",code=>{if(!this.closed)this.rejectPending(new Error(`Isolated backend worker exited before completion (${code})`));});
    const reader=createInterface({input:this.child.stdout});reader.on("line",line=>{
      let reply:any;try{reply=JSON.parse(line);}catch{return;}const waiting=this.pending.get(reply.id);if(!waiting)return;
      clearTimeout(waiting.timer);this.pending.delete(reply.id);
      if(reply.ok)waiting.resolve(reply.result);else waiting.reject(new BackendDifference(reply.error?.property||"worker",reply.error?.message||"Backend differential failure"));
    });
    const initialized=await this.request({type:"INIT",...this.settings,chainId:31337,protocolVersion:2,rpcUrl:this.url,directory:this.directory});this.directory=initialized.directory;
    if(!initialized.isolated||initialized.activeDatabaseOpened!==false)throw new Error("Backend worker did not prove test isolation");
  }
  private rejectPending(error:Error){for(const waiting of this.pending.values()){clearTimeout(waiting.timer);waiting.reject(error);}this.pending.clear();}
  private request(body:any):Promise<any>{
    const id=++this.sequence;return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error("Isolated backend worker response timed out; its handle must be checked, not restarted automatically"));},30_000);
      this.pending.set(id,{resolve,reject,timer});this.child!.stdin.write(JSON.stringify({...body,id})+"\n");
    });
  }
  async check(model:Model){
    const blockNumber=Number(BigInt(await this.rpc("eth_blockNumber",[]))),block=await this.rpc("eth_getBlockByNumber",[ethers.toQuantity(blockNumber),false]);
    const body={type:"CHECK",blockNumber,blockHash:block.hash,campaigns:model.campaigns.map((campaign,index)=>({id:index+1,fields:{
      status:["PUBLISHED","ACTIVE","FINALIZED","CANCELLED"][campaign.status],protocolVersion:2,termsHash:campaign.terms.termsHash,
      currentUnlockedTier:campaign.tier,startTime:campaign.start,endTime:campaign.end,finalizedAt:campaign.finalizedAt,
      finalClearingPrice:String(campaign.finalPrice),totalUnitsCommitted:String(campaign.units),totalBuyerCount:String(campaign.buyers),totalGrossCommitted:String(campaign.gross),
    }})),orders:model.orders.map(stored=>{
      const order=viewOrder(model,stored),buyer=order.rebate+order.refund;
      return {id:stored.id,fields:{protocolVersion:2,onchainOrderId:stored.id,campaignId:String(order.campaign+1),buyerAccountId:`generated_buyer_${stored.buyer}`,
        campaignIdentity:ethers.id(`generated-account:${order.campaign}:${order.buyer}`),buyerPrincipal:this.settings.actors[order.principal],quantity:String(order.quantity),
        lockedUnitPrice:String(order.locked),committedGross:String(order.gross),isEarlySupporter:order.isEarly,earlyRebateValue:String(order.early),rebateAllocated:String(order.rebate),buyerRefundAllocated:String(order.refund),sellerAllocated:String(order.seller),
        buyerClaimedAmount:String(stored.buyerPaid),sellerClaimedAmount:String(stored.sellerPaid),buyerClaimed:stored.buyerClaimed,sellerClaimed:stored.sellerClaimed,deliveryStatus:["PENDING","DELIVERED","CONFIRMED","DISPUTED","BREACHED_REFUNDED","RESOLVED"][order.status]},
        funds:{accountingVerified:true,unallocated:String(order.gross-buyer-order.seller),buyerClaimable:String(buyer-stored.buyerPaid),sellerClaimable:String(order.seller-stored.sellerPaid)}};
    })};
    const result=await this.request(body);this.stats.checkpoints++;
    if(this.stats.checkpoints%12===0){await this.request({type:"DUPLICATE",blockNumber});this.stats.duplicateChecks++;}
    if(this.stats.checkpoints===24||this.stats.checkpoints===72){await this.closeWorker();await this.spawnWorker();const restored=await this.request(body);if(restored.markerDigest!==result.markerDigest)throw new BackendDifference("restart.privateMarkers","Fixture evidence changed after a process restart");this.stats.restarts++;}
    if(this.stats.checkpoints===40){
      this.outage=true;try{await this.request({type:"OUTAGE",blockNumber});this.stats.outageChecks++;}finally{this.outage=false;}
      await this.request(body);await this.request({type:"CORRUPT",blockNumber});this.stats.corruptionChecks++;
    }
    return result;
  }
  async rebuild(){const blockNumber=Number(BigInt(await this.rpc("eth_blockNumber",[])));await this.request({type:"REBUILD",blockNumber});this.stats.rebuilds++;}
  private async closeWorker(){
    const child=this.child;if(!child)return;
    const exited=new Promise<void>((resolve,reject)=>{child.once("exit",code=>code===0?resolve():reject(new Error(`Owned backend worker exit ${code}`)));});
    try{await this.request({type:"CLOSE"});this.closed=true;child.stdin.end();await exited;}finally{this.child=undefined;}
  }
  async close(){
    try{await this.closeWorker();}catch(error){if(this.child&&!this.child.killed)this.child.kill();throw error;}
    finally{this.server?.closeAllConnections();await new Promise<void>(resolve=>this.server?this.server.close(()=>resolve()):resolve());}
  }
}
