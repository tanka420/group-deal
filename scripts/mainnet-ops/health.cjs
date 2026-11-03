'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function observe(request=fetch,read=fs.readFileSync){
 try{
  const response=await request('http://127.0.0.1:4100/api/health',{redirect:'error',signal:AbortSignal.timeout(10000)}),v=await response.json();
  if(response.status!==200||v.status!=='OK'||v.scope!=='PROCESS_LIVENESS_ONLY'||v.financialAccountingVerified!==false||v.chainId!==5042||v.protocolVersion!==2||v.hubAddress?.toLowerCase()!=='0x52a893b45c1beabdce04f58705d7812ea2519ff8')throw Error();
  const b=JSON.parse(read('/var/lib/groupdeal-mainnet/backups/LATEST.json'));
  if(b.chainId!==5042||b.hubAddress?.toLowerCase()!==v.hubAddress.toLowerCase()||b.verified!==true||b.sourceReadOnly!==true||b.privateRestoreVerified!==true||!/^backup_\d{13}_[a-f0-9-]{36}\.enc$/.test(b.archive)||!/^[a-f0-9]{64}$/.test(b.sha256)||!Number.isSafeInteger(b.timestamp)||Date.now()-b.timestamp>90*60000||b.timestamp>Date.now()+30000)throw Error();
  const bytes=read(path.join('/var/lib/groupdeal-mainnet/backups/archives',b.archive));if(bytes.length!==b.byteLength||crypto.createHash('sha256').update(bytes).digest('hex')!==b.sha256)throw Error();
  return {status:'UP',scope:'INTERNAL_MAINNET_LIVENESS_AND_LOCAL_BACKUP',chainId:5042,publicHttpsVerified:false,offhostVerified:false,financialAccountingVerified:false};
 }catch{return {status:'ATTENTION',scope:'INTERNAL_MAINNET_LIVENESS_AND_LOCAL_BACKUP',financialAccountingVerified:false};}
}
if(require.main===module)observe().then(r=>{console.log(JSON.stringify(r));if(r.status!=='UP')process.exitCode=1;});
module.exports={observe};
