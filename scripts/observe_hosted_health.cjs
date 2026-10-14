'use strict';
const path=require('node:path'),{observeBackup}=require('./hosted_backup.cjs');
const endpoint='https://groupdeal.thanhtan.top/api/health';
const deployment={chainId:5042002,protocolVersion:1,hub:'0x2a7aecd1ce90f1284eb060488c8ddef4b1be0574',usdc:'0x3600000000000000000000000000000000000000'};
/** Only public liveness fields are inspected. Provider bodies and errors never enter output. */
async function observe(fetchRequest=globalThis.fetch,test404=false,backupStateFile=null){
 const started=Date.now();let code='HTTP_REQUEST_UNAVAILABLE',httpStatus=null;
 try{
  const response=await fetchRequest(test404?'https://groupdeal.thanhtan.top/api/__groupdeal_alert_probe__':endpoint,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
  httpStatus=response.status;
  if(httpStatus!==200)code='HTTP_STATUS_UNEXPECTED';
  else{
   const body=await response.json();
   if(body.chainId!==deployment.chainId||body.protocolVersion!==deployment.protocolVersion||body.hubAddress?.toLowerCase()!==deployment.hub||body.usdcAddress?.toLowerCase()!==deployment.usdc)code='DEPLOYMENT_MISMATCH';
   else if(body.status!=='OK'||body.scope!=='PROCESS_LIVENESS_ONLY'||body.financialAccountingVerified!==false)code='LIVENESS_CONTRACT_INVALID';
   else code='LIVENESS_OBSERVED';
  }
 }catch{ /* Do not expose a URL, response body, exception or credential. */ }
 const backup=backupStateFile===null?null:observeBackup(backupStateFile);
 return{schemaVersion:1,observedAt:new Date().toISOString(),scope:backup?'HOSTED_PUBLIC_LIVENESS_AND_BACKUP_FRESHNESS':'HOSTED_PUBLIC_LIVENESS',endpoint,status:code==='LIVENESS_OBSERVED'&&(!backup||backup.status==='UP')?'UP':'ATTENTION',code:code==='LIVENESS_OBSERVED'&&backup?.status==='ATTENTION'?backup.code:code,httpStatus,backup,durationMs:Date.now()-started,test404,financialAccountingVerified:false,credentialsRead:false,emailSent:false};
}
async function main(){
 const args=process.argv.slice(2);let test404=false,backupStateFile=null;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--test-404'&&!test404)test404=true;
  else if(args[i]==='--backup-state-file'&&backupStateFile===null&&typeof args[i+1]==='string'&&path.isAbsolute(args[i+1])&&path.basename(args[i+1])==='LATEST.json')backupStateFile=args[++i];
  else{console.error(JSON.stringify({code:'PROBE_ARGUMENTS_INVALID'}));process.exitCode=2;return;}
 }
 const result=await observe(globalThis.fetch,test404,backupStateFile);console.log(JSON.stringify(result));if(result.status!=='UP')process.exitCode=1;
}
if(require.main===module)void main();module.exports={observe};
