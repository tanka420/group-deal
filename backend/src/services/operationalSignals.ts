/** Process observations only. No payload, URL, exception, identifier, financial write or persistence. */
export class IndexerSignals {
 private state={running:false,headBlock:null as number|null,headObservedAt:null as number|null,lastSyncAt:null as number|null,lastSyncSucceeded:null as boolean|null,consecutiveFailures:0,attempts:0,failures:0,lastDurationMs:null as number|null};
 constructor(private readonly now=Date.now){}
 setRunning(running:boolean){this.state.running=running;}
 begin(){this.state.attempts=Math.min(Number.MAX_SAFE_INTEGER,this.state.attempts+1);return this.now();}
 head(block:number){if(Number.isSafeInteger(block)&&block>=0){this.state.headBlock=block;this.state.headObservedAt=this.now();}}
 finish(start:number,succeeded:boolean){this.state.lastSyncAt=this.now();this.state.lastSyncSucceeded=succeeded;this.state.lastDurationMs=Math.max(0,this.now()-start);this.state.consecutiveFailures=succeeded?0:Math.min(Number.MAX_SAFE_INTEGER,this.state.consecutiveFailures+1);if(!succeeded)this.state.failures=Math.min(Number.MAX_SAFE_INTEGER,this.state.failures+1);}
 snapshot(){return {...this.state};}
}
type ReportInput={timestamp:number;blockNumber:number;blockHash:string;projectionBlock:number;headBlockNumber:number;status:string;conservationLawPassed:boolean;perOrderVerified:boolean;coverageVerified:boolean;onchainBalanceVerified:boolean};
export class ReconciliationSignals {
 private latest:{observedAt:number;blockNumber:number;blockHash:string;projectionBlock:number;headBlockNumber:number;status:'HEALTHY'|'DISCREPANCY_DETECTED'|'UNVERIFIED'|'STALE'|'ERROR';completeProof:boolean}|null=null;
 private unresolvedDiscrepancy:{observedAt:number;blockNumber:number;blockHash:string}|null=null;
 constructor(private readonly now=Date.now){}
 record(report:ReportInput){
  if(!report||!['HEALTHY','DISCREPANCY_DETECTED','UNVERIFIED','STALE','ERROR'].includes(report.status)||![report.timestamp,report.blockNumber,report.projectionBlock,report.headBlockNumber].every(n=>Number.isSafeInteger(n)&&n>=0)||report.timestamp>this.now()+30000||!/^0x[a-fA-F0-9]{64}$/.test(report.blockHash)){this.latest=null;return;}
  // The allowlist prevents report details/provider diagnostics entering monitoring.
  this.latest={observedAt:report.timestamp,blockNumber:report.blockNumber,blockHash:report.blockHash,projectionBlock:report.projectionBlock,headBlockNumber:report.headBlockNumber,status:report.status as NonNullable<typeof this.latest>['status'],completeProof:report.conservationLawPassed===true&&report.perOrderVerified===true&&report.coverageVerified===true&&report.onchainBalanceVerified===true};
  if(report.status==='DISCREPANCY_DETECTED')this.unresolvedDiscrepancy={observedAt:report.timestamp,blockNumber:report.blockNumber,blockHash:report.blockHash};
  else if(report.status==='HEALTHY'&&this.latest.completeProof&&report.blockNumber===report.projectionBlock&&report.blockNumber===report.headBlockNumber&&report.timestamp<=this.now()&&this.now()-report.timestamp<=60000&&(!this.unresolvedDiscrepancy||report.blockNumber>=this.unresolvedDiscrepancy.blockNumber&&report.timestamp>=this.unresolvedDiscrepancy.observedAt))this.unresolvedDiscrepancy=null;
 }
 snapshot(){return{latest:this.latest?{...this.latest}:null,unresolvedDiscrepancy:this.unresolvedDiscrepancy?{...this.unresolvedDiscrepancy}:null};}
}
export const reconciliationSignals=new ReconciliationSignals();
