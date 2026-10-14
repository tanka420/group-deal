'use strict';
const endpoint='https://groupdeal.thanhtan.top/api/health';
const deployment={chainId:5042002,protocolVersion:1,hub:'0x2a7aecd1ce90f1284eb060488c8ddef4b1be0574',usdc:'0x3600000000000000000000000000000000000000'};
/** Only public liveness fields are inspected. Provider bodies and errors never enter output. */
async function observe(fetchRequest=globalThis.fetch,test404=false){
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
 return{schemaVersion:1,observedAt:new Date().toISOString(),scope:'HOSTED_PUBLIC_LIVENESS',endpoint,status:code==='LIVENESS_OBSERVED'?'UP':'ATTENTION',code,httpStatus,durationMs:Date.now()-started,test404,financialAccountingVerified:false,credentialsRead:false,emailSent:false};
}
async function main(){
 const args=process.argv.slice(2);if(args.length>1||args.length===1&&args[0]!=='--test-404'){console.error(JSON.stringify({code:'PROBE_ARGUMENTS_INVALID'}));process.exitCode=2;return;}
 const result=await observe(globalThis.fetch,args[0]==='--test-404');console.log(JSON.stringify(result));if(result.status!=='UP')process.exitCode=1;
}
if(require.main===module)void main();module.exports={observe};
