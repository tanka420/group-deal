'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const schema='GroupDealOpsAlertsV1',endpoint='https://groupdeal.thanhtan.top/api/health';
const attentionCodes=new Set(['HTTP_REQUEST_UNAVAILABLE','HTTP_STATUS_UNEXPECTED','DEPLOYMENT_MISMATCH','LIVENESS_CONTRACT_INVALID','BACKUP_METADATA_INVALID','BACKUP_METADATA_UNAVAILABLE','BACKUP_STALE','PROBE_RESULT_UNAVAILABLE','OFFHOST_RECEIPT_INVALID','OFFHOST_BACKUP_STALE','OFFHOST_BACKUP_UNAVAILABLE']);
const fail=code=>{throw Error(code);};
function freshState(){return{schema,lastObservationId:null,failureCount:0,incident:null};}
/** Only the bounded public probe contract enters the alert state or email. */
function selectObservation(journal,now=Date.now()){
 if(typeof journal!=='string'||Buffer.byteLength(journal)>256*1024||!Number.isSafeInteger(now))fail('ALERT_OBSERVATION_INPUT');
 let selected;
 for(const line of journal.split('\n').filter(Boolean)){
  try{const entry=JSON.parse(line),r=JSON.parse(entry.MESSAGE),time=Date.parse(r.observedAt),id=entry.__REALTIME_TIMESTAMP;
   if(r.schemaVersion!==1||!['HOSTED_PUBLIC_LIVENESS_AND_BACKUP_FRESHNESS','HOSTED_PUBLIC_LIVENESS_BACKUP_AND_OFFHOST_FRESHNESS'].includes(r.scope)||r.endpoint!==endpoint||r.test404!==false||r.financialAccountingVerified!==false||r.credentialsRead!==false||r.emailSent!==false||!/^\d{13,20}$/.test(id)||!Number.isFinite(time)||time>now+30000||now-time>180000)continue;
   const up=r.status==='UP'&&r.code==='LIVENESS_OBSERVED'&&r.httpStatus===200&&r.backup?.status==='UP'&&r.backup?.code==='BACKUP_CURRENT'&&(r.scope!=='HOSTED_PUBLIC_LIVENESS_BACKUP_AND_OFFHOST_FRESHNESS'||r.offhost?.status==='UP'&&r.offhost?.code==='OFFHOST_BACKUP_CURRENT');
   const attention=r.status==='ATTENTION'&&attentionCodes.has(r.code);if(!up&&!attention)continue;
   if(!selected||BigInt(id)>BigInt(selected.id))selected={id,status:up?'UP':'ATTENTION',code:r.code,observedAt:new Date(time).toISOString()};
  }catch{ /* Journal/provider diagnostics never enter output. */ }
 }
 return selected||{id:'missing_'+Math.floor(now/60000),status:'ATTENTION',code:'PROBE_RESULT_UNAVAILABLE',observedAt:new Date(now).toISOString()};
}
function validateState(s){
 if(!s||s.schema!==schema||!Number.isSafeInteger(s.failureCount)||s.failureCount<0||s.failureCount>2||!(s.lastObservationId===null||typeof s.lastObservationId==='string'&&/^(?:\d{13,20}|missing_\d+)$/.test(s.lastObservationId)))fail('ALERT_STATE_INVALID');
 if(s.incident!==null){const i=s.incident;if(!i||!/^[a-f0-9-]{36}$/.test(i.id)||!attentionCodes.has(i.code)||!Number.isFinite(Date.parse(i.openedAt))||!['NOT_ATTEMPTED','ATTEMPTING','ACCEPTED','REVIEW_REQUIRED'].includes(i.alertDelivery)||!['NOT_ATTEMPTED','ATTEMPTING','REVIEW_REQUIRED'].includes(i.recoveryDelivery))fail('ALERT_STATE_INVALID');}
}
function transition(state,observation,newId=()=>crypto.randomUUID()){
 validateState(state);if(!observation||!['UP','ATTENTION'].includes(observation.status)||typeof observation.id!=='string'||observation.status==='ATTENTION'&&!attentionCodes.has(observation.code))fail('ALERT_OBSERVATION_INVALID');
 const next=structuredClone(state),i=next.incident;
 if(i&&(i.alertDelivery==='ATTEMPTING'||i.alertDelivery==='REVIEW_REQUIRED'||i.recoveryDelivery!=='NOT_ATTEMPTED'))return{state:next,action:null,status:'ATTENTION',code:'ALERT_DELIVERY_REVIEW_REQUIRED'};
 if(next.lastObservationId===observation.id||/^\d+$/.test(next.lastObservationId||'')&&/^\d+$/.test(observation.id)&&BigInt(observation.id)<BigInt(next.lastObservationId))return{state:next,action:null,status:'UP',code:'ALERT_OBSERVATION_ALREADY_PROCESSED'};
 next.lastObservationId=observation.id;
 if(observation.status==='ATTENTION'){
  next.failureCount=Math.min(2,next.failureCount+1);
  if(next.failureCount===2&&!i){next.incident={id:newId(),code:observation.code,openedAt:observation.observedAt,alertDelivery:'ATTEMPTING',recoveryDelivery:'NOT_ATTEMPTED'};return{state:next,action:{kind:'INCIDENT',incidentId:next.incident.id,code:observation.code,observedAt:observation.observedAt},status:'UP',code:'ALERT_INCIDENT_READY'};}
 }else{
  next.failureCount=0;
  if(i&&i.alertDelivery==='ACCEPTED'){i.recoveryDelivery='ATTEMPTING';return{state:next,action:{kind:'RECOVERY',incidentId:i.id,code:'LIVENESS_OBSERVED',observedAt:observation.observedAt},status:'UP',code:'ALERT_RECOVERY_READY'};}
 }
 return{state:next,action:null,status:'UP',code:next.incident?'ALERT_INCIDENT_ALREADY_NOTIFIED':'ALERT_OBSERVATION_RECORDED'};
}
/** Persist the attempted action before SMTP. Lost ACK or crashes require review, never blind resend. */
async function deliver(decision,recipient,smtp,transportFactory,persist){
 persist(decision.state);if(!decision.action)return{status:decision.status,code:decision.code,emailSent:false};
 if(typeof recipient!=='string'||!/^[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient))fail('ALERT_RECIPIENT_INVALID');
 const a=decision.action,kind=a.kind==='INCIDENT'?'cảnh báo vận hành':'đã phục hồi',message={from:smtp.from,to:recipient,messageId:`<groupdeal-${a.incidentId}-${a.kind.toLowerCase()}@groupdeal.thanhtan.top>`,subject:'GroupDeal Arc Testnet — '+kind,text:`GroupDeal Arc Testnet\nTrạng thái: ${a.kind}\nMã: ${a.code}\nThời điểm: ${a.observedAt}\nMã sự cố: ${a.incidentId}\nPhạm vi: HTTPS liveness và độ mới của backup.\nKết quả này không xác minh tài chính.\n`};
 let transport;
 try{
  transport=transportFactory({host:smtp.host,port:smtp.port,secure:smtp.secure,requireTLS:!smtp.secure,auth:{user:smtp.user,pass:smtp.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,logger:false,debug:false});
  const info=await transport.sendMail(message);if(!Array.isArray(info.accepted)||info.accepted.length!==1||String(info.accepted[0]).toLowerCase()!==recipient.toLowerCase()||info.rejected?.length)fail('ALERT_SMTP_NOT_ACCEPTED');
  if(a.kind==='INCIDENT')decision.state.incident.alertDelivery='ACCEPTED';else decision.state.incident=null;persist(decision.state);
  return{status:'UP',code:a.kind==='INCIDENT'?'ALERT_INCIDENT_SMTP_ACCEPTED':'ALERT_RECOVERY_SMTP_ACCEPTED',emailSent:true,recipientLogged:false};
 }catch{
  // Keep the persisted ATTEMPTING marker even if acknowledgement or final persistence is lost.
  const pending=structuredClone(decision.state);if(pending.incident){pending.incident[a.kind==='INCIDENT'?'alertDelivery':'recoveryDelivery']='REVIEW_REQUIRED';try{persist(pending);}catch{}}
  return{status:'ATTENTION',code:'ALERT_DELIVERY_REVIEW_REQUIRED',emailSent:false,deliveryMayHaveBeenAccepted:true,privateDiagnosticsLogged:false};
 }finally{try{transport?.close?.();}catch{}}
}
function regular(p){if(fs.realpathSync(p)!==p||!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())fail('ALERT_FILE_SCOPE');return fs.statSync(p);}
function directory(p){if(fs.realpathSync(p)!==p||!fs.lstatSync(p).isDirectory()||fs.lstatSync(p).isSymbolicLink())fail('ALERT_DIRECTORY_SCOPE');}
function json(p){if(regular(p).size>65536)fail('ALERT_METADATA_SIZE');return JSON.parse(fs.readFileSync(p,'utf8'));}
function persistState(dir,state){validateState(state);const target=path.join(dir,'STATE.json'),temp=path.join(dir,'.state-'+crypto.randomUUID());if(fs.existsSync(target))regular(target);const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(state)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,target);}
function smtpConfiguration(app){
 const envFile=path.join(app,'backend/.env');regular(envFile);const env=require(path.join(app,'backend/node_modules/dotenv')).parse(fs.readFileSync(envFile)),smtp={host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:(env.SMTP_SECURE||'false').toLowerCase()==='true',user:env.SMTP_USER,password:(env.SMTP_APP_PASSWORD||'').replace(/\s+/g,''),from:env.SMTP_FROM||env.SMTP_USER};
 if(typeof smtp.host!=='string'||!smtp.host||!Number.isInteger(smtp.port)||smtp.port<1||smtp.port>65535||!smtp.user||!smtp.password||!smtp.from||/[\r\n]/.test(smtp.from))fail('ALERT_SMTP_CONFIG_INVALID');return smtp;
}
async function main(){
 let phase='ARGUMENTS';try{
  const args=process.argv.slice(2);if(![6,7].includes(args.length)||args[0]!=='--app-root'||args[2]!=='--state-directory'||args[4]!=='--config-file'||args.length===7&&args[6]!=='--check')fail('ALERT_ARGUMENTS_INVALID');if(process.platform!=='linux')fail('HOSTED_LINUX_REQUIRED');process.umask(0o077);
  const app=path.resolve(args[1]),state=path.resolve(args[3]),configFile=path.resolve(args[5]);directory(app);directory(state);regular(configFile);if((fs.statSync(state).mode&0o077)!==0||(fs.statSync(configFile).mode&0o077)!==0)fail('ALERT_PRIVATE_PERMISSIONS');if(state===app||state.startsWith(app+path.sep)||app.startsWith(state+path.sep))fail('ALERT_STATE_SOURCE_OVERLAP');
  phase='CONFIGURATION';const config=json(configFile);if(config.schema!==schema||typeof config.enabled!=='boolean'||typeof config.recipient!=='string'||!/^[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(config.recipient))fail('ALERT_CONFIG_INVALID');
  if(args[6]==='--check'){smtpConfiguration(app);require(path.join(app,'backend/node_modules/nodemailer'));console.log(JSON.stringify({status:'READY_PENDING_APPROVAL',code:'ALERT_PRIVATE_CONFIG_AND_TRANSPORT_READY',enabled:config.enabled,smtpConnectionOpened:false,emailSent:false,credentialOrRecipientLogged:false}));return;}
  if(!config.enabled){console.log(JSON.stringify({status:'DISABLED',code:'ALERT_HUMAN_AUTHORIZATION_REQUIRED',emailSent:false}));return;}
  phase='OBSERVATION';const journal=cp.execFileSync('journalctl',['-u','groupdeal-health-probe.service','-n','100','-o','json','--no-pager'],{encoding:'utf8',timeout:5000,maxBuffer:256*1024});const observation=selectObservation(journal),stateFile=path.join(state,'STATE.json'),current=fs.existsSync(stateFile)?json(stateFile):freshState(),decision=transition(current,observation);
  phase='DELIVERY';const smtp=decision.action?smtpConfiguration(app):null,result=await deliver(decision,config.recipient,smtp,options=>require(path.join(app,'backend/node_modules/nodemailer')).createTransport(options),s=>persistState(state,s));console.log(JSON.stringify({schemaVersion:1,...result,financialAccountingVerified:false,businessDatabaseRead:false,heldJobsProcessed:false}));if(result.status!=='UP')process.exitCode=1;
 }catch(e){console.log(JSON.stringify({status:'ATTENTION',phase,code:/^[A-Z_]+$/.test(e.message||'')?e.message:'ALERT_STAGE_UNAVAILABLE',privateDiagnosticsLogged:false}));process.exitCode=1;}
}
if(require.main===module)void main();module.exports={schema,freshState,selectObservation,transition,deliver};
