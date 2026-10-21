'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {observeBackup}=require('./hosted_backup.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Error(code);};
function regular(file){if(!path.isAbsolute(file)||fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile())fail('OFFHOST_FILE_SCOPE');return fs.statSync(file);}
function directory(dir){if(!path.isAbsolute(dir)||fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())fail('OFFHOST_DIRECTORY_SCOPE');return dir;}
function json(file){if(regular(file).size>65536)fail('OFFHOST_METADATA_SIZE');return JSON.parse(fs.readFileSync(file,'utf8'));}
function configuration(file){
  if(regular(file).size>1024*1024)fail('OFFHOST_CONFIG_SIZE');if(process.platform!=='win32'&&(fs.statSync(file).mode&0o077))fail('OFFHOST_CONFIG_PERMISSIONS');
  const sections=fs.readFileSync(file,'utf8').split(/^\s*\[/m).slice(1),selected=sections.filter(s=>/^gd_onedrive\]\s*(?:\r?\n|$)/.test(s));if(selected.length!==1)fail('OFFHOST_ONEDRIVE_NOT_CONFIGURED');
  const values=new Map();for(const line of selected[0].split(/\r?\n/).slice(1)){const m=/^\s*([a-z_]+)\s*=\s*(.*?)\s*$/.exec(line);if(!m)continue;if(values.has(m[1]))fail('OFFHOST_CONFIG_AMBIGUOUS');values.set(m[1],m[2]);}
  if(values.get('type')!=='onedrive'||!/^[-A-Za-z0-9!_]{1,160}$/.test(values.get('drive_id')??''))fail('OFFHOST_ONEDRIVE_NOT_CONFIGURED');
  return sha(JSON.stringify(['type','drive_id','drive_type','root_folder_id'].map(k=>[k,values.get(k)??''])));
}
function remoteStatExists(bytes,expectedName){
  let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{fail('OFFHOST_REMOTE_STAT_INVALID');}
  // rclone 1.60 OneDrive can return exit 0 with JSON null for a missing file.
  if(value===null)return false;
  if(!value||Array.isArray(value)||typeof value!=='object'||value.IsDir!==false||value.Name!==expectedName||!Number.isSafeInteger(value.Size)||value.Size<0)fail('OFFHOST_REMOTE_STAT_INVALID');
  return true;
}
function rcloneTransport(configFile){
  // Ignore process-level rclone backend/credential overrides; the private file
  // selected by the operator is the only remote configuration for this job.
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^RCLONE_/i.test(k)));
  function run(args,mode='none',maximum=65536){return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/rclone',['--config',configFile,'--log-level','ERROR','--retries','1','--low-level-retries','1','--contimeout','10s','--timeout','60s',...args],{env,stdio:['ignore','pipe','ignore'],windowsHide:true});
    let bytes=0,buffer=[],invalid=false;const hash=crypto.createHash('sha256'),timer=setTimeout(()=>{invalid=true;child.kill('SIGKILL');},240000);
    child.stdout.on('data',b=>{if(mode==='none')return;bytes+=b.length;if(bytes>maximum){invalid=true;child.kill('SIGKILL');return;}if(mode==='digest')hash.update(b);else buffer.push(b);});
    child.once('error',()=>{clearTimeout(timer);reject(Error('OFFHOST_TRANSPORT_UNAVAILABLE'));});
    child.once('close',code=>{clearTimeout(timer);if(invalid)return reject(Error('OFFHOST_TRANSPORT_LIMIT'));if(mode==='exists'&&(code===3||code===4))return resolve(false);if(code!==0)return reject(Error('OFFHOST_TRANSPORT_UNAVAILABLE'));if(mode==='exists'){try{return resolve(remoteStatExists(Buffer.concat(buffer),args.at(-1).split('/').at(-1)));}catch(e){return reject(e);}}resolve(mode==='digest'?{byteLength:bytes,sha256:hash.digest('hex')}:mode==='json'?Buffer.concat(buffer):undefined);});
  });}
  return {exists:remote=>run(['lsjson','--stat','--files-only',remote],'exists'),copy:(file,remote)=>run(['copyto','--immutable',file,remote]),digest:(remote,maximum)=>run(['cat','--head',String(maximum+1),remote],'digest',maximum)};
}
async function publishLatest({stateDirectory,offhostDirectory,configFile,transport,now=Date.now()}){
  directory(stateDirectory);directory(offhostDirectory);
  if(path.dirname(stateDirectory)!==path.dirname(offhostDirectory)||path.basename(offhostDirectory)!=='offhost')fail('OFFHOST_DIRECTORY_SCOPE');
  const driveBinding=configuration(configFile);
  const latestFile=path.join(stateDirectory,'LATEST.json');if(observeBackup(latestFile,now).code!=='BACKUP_CURRENT')fail('OFFHOST_SOURCE_BACKUP_UNVERIFIED');
  const metadata=json(latestFile),archive=path.join(stateDirectory,'archives',metadata.archive),manifest=archive+'.json';
  if(!/^[a-f0-9-]{36}$/.test(metadata.ownerId)||metadata.heldWork!==95||!/^[a-f0-9]{40}$/.test(metadata.sourceCommit)||metadata.financialAccountingVerified!==false)fail('OFFHOST_SOURCE_SCOPE');
  const originals=[{file:archive,name:metadata.archive,byteLength:metadata.byteLength,sha256:metadata.sha256},{file:manifest,name:metadata.archive+'.json',byteLength:regular(manifest).size,sha256:sha(fs.readFileSync(manifest))}];
  const remote='gd_onedrive:GroupDeal/ArcTestnet/'+metadata.ownerId+'/',client=transport??rcloneTransport(configFile),started=Date.now();let uploaded=0;
  // Append-only names. A conflicting remote object is never replaced or deleted.
  for(const f of originals){
    if(configuration(configFile)!==driveBinding)fail('OFFHOST_DRIVE_CHANGED');
    if(regular(f.file).size!==f.byteLength||sha(fs.readFileSync(f.file))!==f.sha256)fail('OFFHOST_SOURCE_CHANGED');
    if(!await client.exists(remote+f.name)){await client.copy(f.file,remote+f.name);uploaded++;}
    const received=await client.digest(remote+f.name,f.byteLength);
    if(received.byteLength!==f.byteLength||received.sha256!==f.sha256)fail('OFFHOST_ROUNDTRIP_MISMATCH');
  }
  // Local retention shares backup.lock with this service. Also reject any
  // concurrent metadata/configuration edit before committing a success receipt.
  if(JSON.stringify(json(latestFile))!==JSON.stringify(metadata)||originals.some(f=>sha(fs.readFileSync(f.file))!==f.sha256))fail('OFFHOST_SOURCE_CHANGED');
  if(configuration(configFile)!==driveBinding)fail('OFFHOST_DRIVE_CHANGED');
  const receipt={schemaVersion:1,result:'ENCRYPTED_BACKUP_OFFHOST_ROUNDTRIP_VERIFIED',recordedAt:new Date().toISOString(),backupTimestamp:metadata.timestamp,sourceCommit:metadata.sourceCommit,ownerId:metadata.ownerId,archive:metadata.archive,sha256:metadata.sha256,byteLength:metadata.byteLength,remoteDirectory:remote,remoteObjects:originals.map(({name,sha256,byteLength})=>({name,sha256,byteLength})),uploadedObjects:uploaded,durationMs:Date.now()-started,localMinimumRetained:3,remotePolicy:'APPEND_ONLY_NO_AUTOMATIC_DELETION',databaseOpened:false,credentialsUploaded:false,financialAccountingVerified:false,rpoMeasured:false,rtoMeasured:false,acceptanceEligible:false};
  const target=path.join(offhostDirectory,'LATEST.json'),temp=path.join(offhostDirectory,'.receipt-'+crypto.randomUUID()+'.json');if(fs.existsSync(target))regular(target);const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(receipt,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,target);return receipt;
}
function observeOffhost(file,now=Date.now()){
  try{const v=json(file),recorded=Date.parse(v.recordedAt);if(v.schemaVersion!==1||v.result!=='ENCRYPTED_BACKUP_OFFHOST_ROUNDTRIP_VERIFIED'||!Number.isFinite(recorded)||recorded>now+30000||!Number.isSafeInteger(v.backupTimestamp)||v.backupTimestamp>recorded||!/^[a-f0-9]{64}$/.test(v.sha256)||v.credentialsUploaded!==false)return{status:'ATTENTION',code:'OFFHOST_RECEIPT_INVALID'};
    return now-v.backupTimestamp<=150*60000&&now-recorded<=150*60000?{status:'UP',code:'OFFHOST_BACKUP_CURRENT',backupTimestamp:v.backupTimestamp,recordedAt:v.recordedAt}:{status:'ATTENTION',code:'OFFHOST_BACKUP_STALE'};
  }catch{return{status:'ATTENTION',code:'OFFHOST_BACKUP_UNAVAILABLE'};}
}
async function main(){
  const args=process.argv.slice(2);if(process.platform!=='linux'||args.length!==6||args[0]!=='--state-directory'||args[2]!=='--offhost-directory'||args[4]!=='--config-file')fail('OFFHOST_ARGUMENTS_INVALID');
  const r=await publishLatest({stateDirectory:args[1],offhostDirectory:args[3],configFile:args[5]});console.log(JSON.stringify(r));
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({status:'ATTENTION',code:/^OFFHOST_[A-Z_]+$/.test(e.message??'')?e.message:'OFFHOST_STAGE_UNAVAILABLE',privateValuesLogged:false}));process.exitCode=1;});
module.exports={publishLatest,observeOffhost,remoteStatExists};
