'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {observeBackup}=require('./hosted_backup.cjs');
const {layoutFor,remoteManifest,ownerPattern,legacyArchivePattern}=require('./offhost_backup_layout.cjs');
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
  return {exists:remote=>run(['lsjson','--stat','--files-only',remote],'exists'),copy:(file,remote)=>run(['copyto','--immutable',file,remote]),copyRemote:(source,remote)=>run(['copyto','--immutable',source,remote]),read:(remote,maximum)=>run(['cat','--head',String(maximum+1),remote],'json',maximum),list:remote=>run(['lsjson','--files-only','--max-depth','1',remote],'json',2*1024*1024),digest:(remote,maximum)=>run(['cat','--head',String(maximum+1),remote],'digest',maximum)};
}
function stageManifest(offhostDirectory,metadata,sourceBytes){const file=path.join(offhostDirectory,'.layout-'+crypto.randomUUID()+'.enc.json');fs.writeFileSync(file,remoteManifest(metadata,sourceBytes),{flag:'wx',mode:0o600});return file;}
function commitReceipt(dir,name,value){const target=path.join(dir,name),temp=path.join(dir,'.receipt-'+crypto.randomUUID()+'.json');if(fs.existsSync(target))regular(target);const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,target);}
function checkDirectories(stateDirectory,offhostDirectory){directory(stateDirectory);directory(offhostDirectory);if(path.dirname(stateDirectory)!==path.dirname(offhostDirectory)||path.basename(offhostDirectory)!=='offhost')fail('OFFHOST_DIRECTORY_SCOPE');}
async function publishLatest({stateDirectory,offhostDirectory,configFile,transport,now=Date.now()}){
  checkDirectories(stateDirectory,offhostDirectory);
  const driveBinding=configuration(configFile),latestFile=path.join(stateDirectory,'LATEST.json');
  if(observeBackup(latestFile,now).code!=='BACKUP_CURRENT')fail('OFFHOST_SOURCE_BACKUP_UNVERIFIED');
  const metadata=json(latestFile),archive=path.join(stateDirectory,'archives',metadata.archive),manifest=archive+'.json';
  if(!ownerPattern.test(metadata.ownerId??'')||metadata.heldWork!==95||!/^[a-f0-9]{40}$/.test(metadata.sourceCommit)||metadata.financialAccountingVerified!==false)fail('OFFHOST_SOURCE_SCOPE');
  const originals=[{file:archive,byteLength:metadata.byteLength,sha256:metadata.sha256},{file:manifest,byteLength:regular(manifest).size,sha256:sha(fs.readFileSync(manifest))}];
  const layout=layoutFor(metadata),staged=stageManifest(offhostDirectory,metadata,fs.readFileSync(manifest)),client=transport??rcloneTransport(configFile),started=Date.now();let uploaded=0;
  try{
    const objects=[{...originals[0],name:layout.archive},{file:staged,name:layout.manifest,byteLength:regular(staged).size,sha256:sha(fs.readFileSync(staged))}];
    for(const f of objects){
      if(configuration(configFile)!==driveBinding)fail('OFFHOST_DRIVE_CHANGED');
      if(regular(f.file).size!==f.byteLength||sha(fs.readFileSync(f.file))!==f.sha256)fail('OFFHOST_SOURCE_CHANGED');
      if(!await client.exists(layout.directory+f.name)){await client.copy(f.file,layout.directory+f.name);uploaded++;}
      const received=await client.digest(layout.directory+f.name,f.byteLength);
      if(received.byteLength!==f.byteLength||received.sha256!==f.sha256)fail('OFFHOST_ROUNDTRIP_MISMATCH');
    }
    // Same lock as local retention. Original manifest/ciphertext must still match.
    if(JSON.stringify(json(latestFile))!==JSON.stringify(metadata)||originals.some(f=>sha(fs.readFileSync(f.file))!==f.sha256))fail('OFFHOST_SOURCE_CHANGED');
    if(configuration(configFile)!==driveBinding)fail('OFFHOST_DRIVE_CHANGED');
    const receipt={schemaVersion:2,layoutVersion:2,result:'ENCRYPTED_BACKUP_OFFHOST_ROUNDTRIP_VERIFIED',recordedAt:new Date().toISOString(),backupTimestamp:metadata.timestamp,sourceCommit:metadata.sourceCommit,ownerId:metadata.ownerId,archive:metadata.archive,remoteArchive:layout.archive,sha256:metadata.sha256,byteLength:metadata.byteLength,remoteDirectory:layout.directory,remoteObjects:objects.map(({name,sha256,byteLength})=>({name,sha256,byteLength})),uploadedObjects:uploaded,durationMs:Date.now()-started,localMinimumRetained:3,remotePolicy:'APPEND_ONLY_NO_AUTOMATIC_DELETION',databaseOpened:false,credentialsUploaded:false,financialAccountingVerified:false,rpoMeasured:false,rtoMeasured:false,acceptanceEligible:false};
    commitReceipt(offhostDirectory,'LATEST.json',receipt);return receipt;
  }finally{fs.unlinkSync(staged);}
}
async function organizeExisting({stateDirectory,offhostDirectory,configFile,transport,onProgress,resume=false,concurrency=4,retryDelays=[1000,3000,10000]}){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4||!Array.isArray(retryDelays)||retryDelays.length>3||retryDelays.some(v=>!Number.isInteger(v)||v<0||v>10000))fail('OFFHOST_MIGRATION_OPTIONS_INVALID');
  async function retry(action){for(let attempt=0;;attempt++)try{return await action();}catch(error){if(error?.message!=='OFFHOST_TRANSPORT_UNAVAILABLE'||attempt>=retryDelays.length)throw error;await new Promise(resolve=>setTimeout(resolve,retryDelays[attempt]));}}
  checkDirectories(stateDirectory,offhostDirectory);
  const owner=json(path.join(stateDirectory,'OWNER.json'));if(owner.schema!=='GroupDealManagedBackupV1'||!ownerPattern.test(owner.ownerId??''))fail('OFFHOST_SOURCE_SCOPE');
  const binding=configuration(configFile),base='gd_onedrive:GroupDeal/ArcTestnet/'+owner.ownerId+'/',client=transport??rcloneTransport(configFile),files=JSON.parse((await retry(()=>client.list(base))).toString('utf8'));
  if(!Array.isArray(files)||files.length>10000||files.some(f=>!f||f.IsDir!==false||typeof f.Name!=='string'||f.Name.includes('/')||f.Name.includes('\\')||!Number.isSafeInteger(f.Size)||f.Size<0)||new Set(files.map(f=>f.Name)).size!==files.length)fail('OFFHOST_REMOTE_LIST_INVALID');
  const names=new Set(files.map(f=>f.Name)),records=new Map(),unpaired=[],archives=files.filter(f=>legacyArchivePattern.test(f.Name)).sort((a,b)=>a.Name.localeCompare(b.Name)),progressFile=path.join(offhostDirectory,'LAYOUT-PROGRESS.json');let uploadedObjects=0,resumedVerifiedArchives=0;
  if(resume&&fs.existsSync(progressFile)){
    const prior=json(progressFile);if(prior.schemaVersion!==1||prior.layoutVersion!==2||prior.ownerId!==owner.ownerId||!Array.isArray(prior.records)||prior.records.length>1000||new Set(prior.records.map(r=>r.sourceArchive)).size!==prior.records.length)fail('OFFHOST_MIGRATION_CHECKPOINT_INVALID');
    for(const record of prior.records){if(!legacyArchivePattern.test(record.sourceArchive??'')||!/^[a-f0-9]{64}$/.test(record.sourceManifestSha256??'')||!Number.isFinite(Date.parse(record.verifiedAt)))fail('OFFHOST_MIGRATION_CHECKPOINT_INVALID');records.set(record.sourceArchive,record);}
  }
  function checkpoint(){commitReceipt(offhostDirectory,'LAYOUT-PROGRESS.json',{schemaVersion:1,layoutVersion:2,result:'OFFHOST_LAYOUT_PROGRESS_ONLY',ownerId:owner.ownerId,recordedAt:new Date().toISOString(),records:[...records.values()]});}
  async function organize(file){
    if(configuration(configFile)!==binding)fail('OFFHOST_DRIVE_CHANGED');
    if(!names.has(file.Name+'.json')){unpaired.push(file.Name);return;}
    const sourceBytes=await retry(()=>client.read(base+file.Name+'.json',65536)),metadata=JSON.parse(sourceBytes.toString('utf8'));
    if(metadata.schema!=='GroupDealManagedBackupV1'||metadata.ownerId!==owner.ownerId||metadata.archive!==file.Name||metadata.byteLength!==file.Size||file.Size>256*1024*1024||metadata.verified!==true||metadata.privateRestoreVerified!==true||metadata.sourceReadOnly!==true||metadata.auditAndSqliteIntegrity!==true||metadata.sourceRowsPreserved!==true||!/^[a-f0-9]{40}$/.test(metadata.sourceCommit??''))fail('OFFHOST_LEGACY_METADATA_INVALID');
    const layout=layoutFor(metadata),prior=records.get(file.Name);
    if(resume&&prior){
      if(prior.directory!==layout.directory||prior.archive!==layout.archive||prior.manifest!==layout.manifest||prior.sha256!==metadata.sha256||prior.byteLength!==file.Size||prior.sourceManifestSha256!==sha(sourceBytes))fail('OFFHOST_MIGRATION_CHECKPOINT_INVALID');
      resumedVerifiedArchives++;onProgress?.({archivesOrganized:records.size,legacyArchives:archives.length,resumedVerifiedArchives});return;
    }
    await retry(async()=>{
      const staged=stageManifest(offhostDirectory,metadata,sourceBytes);
      try{
        const objects=[{name:layout.archive,source:base+file.Name,byteLength:file.Size,sha256:metadata.sha256},{name:layout.manifest,file:staged,byteLength:regular(staged).size,sha256:sha(fs.readFileSync(staged))}];
        for(const object of objects){
          if(configuration(configFile)!==binding)fail('OFFHOST_DRIVE_CHANGED');
          if(!await client.exists(layout.directory+object.name)){if(object.source)await client.copyRemote(object.source,layout.directory+object.name);else await client.copy(object.file,layout.directory+object.name);uploadedObjects++;}
          const received=await client.digest(layout.directory+object.name,object.byteLength);
          if(received.byteLength!==object.byteLength||received.sha256!==object.sha256)fail('OFFHOST_ROUNDTRIP_MISMATCH');
        }
      }finally{fs.unlinkSync(staged);}
    });
    records.set(file.Name,{sourceArchive:file.Name,directory:layout.directory,archive:layout.archive,manifest:layout.manifest,sha256:metadata.sha256,byteLength:file.Size,sourceManifestSha256:sha(sourceBytes),verifiedAt:new Date().toISOString()});checkpoint();
    onProgress?.({archivesOrganized:records.size,legacyArchives:archives.length,resumedVerifiedArchives});
  }
  let next=0,failure;
  async function worker(){while(!failure&&next<archives.length){const file=archives[next++];try{await organize(file);}catch(error){failure=error;}}}
  await Promise.all(Array.from({length:Math.min(concurrency,archives.length)},worker));if(failure)throw failure;
  if(configuration(configFile)!==binding)fail('OFFHOST_DRIVE_CHANGED');
  const receipt={schemaVersion:1,result:'OFFHOST_LAYOUT_ORGANIZED',layoutVersion:2,recordedAt:new Date().toISOString(),ownerId:owner.ownerId,archivesOrganized:records.size,uploadedObjects,resumedVerifiedArchives,records:[...records.values()].sort((a,b)=>a.sourceArchive.localeCompare(b.sourceArchive)),unpairedArchivesPreserved:unpaired.sort(),legacyObjectsDeleted:0,databaseOpened:false,credentialsUploaded:false,restorationPerformed:false};
  commitReceipt(offhostDirectory,'LAYOUT-MIGRATION.json',receipt);return receipt;
}
function observeOffhost(file,now=Date.now()){
  try{const v=json(file),recorded=Date.parse(v.recordedAt);if(![1,2].includes(v.schemaVersion)||v.result!=='ENCRYPTED_BACKUP_OFFHOST_ROUNDTRIP_VERIFIED'||!Number.isFinite(recorded)||recorded>now+30000||!Number.isSafeInteger(v.backupTimestamp)||v.backupTimestamp>recorded||!/^[a-f0-9]{64}$/.test(v.sha256)||v.credentialsUploaded!==false)return{status:'ATTENTION',code:'OFFHOST_RECEIPT_INVALID'};
    if(v.schemaVersion===2){const layout=layoutFor({ownerId:v.ownerId,timestamp:v.backupTimestamp,sha256:v.sha256,archive:v.archive});if(v.layoutVersion!==2||v.remoteDirectory!==layout.directory||v.remoteArchive!==layout.archive||!Array.isArray(v.remoteObjects)||v.remoteObjects.length!==2||v.remoteObjects[0]?.name!==layout.archive||v.remoteObjects[0]?.sha256!==v.sha256||v.remoteObjects[0]?.byteLength!==v.byteLength||v.remoteObjects[1]?.name!==layout.manifest||!/^[a-f0-9]{64}$/.test(v.remoteObjects[1]?.sha256)||!Number.isSafeInteger(v.remoteObjects[1]?.byteLength)||v.remoteObjects[1].byteLength<=0)return{status:'ATTENTION',code:'OFFHOST_RECEIPT_INVALID'};}
    return now-v.backupTimestamp<=150*60000&&now-recorded<=150*60000?{status:'UP',code:'OFFHOST_BACKUP_CURRENT',backupTimestamp:v.backupTimestamp,recordedAt:v.recordedAt}:{status:'ATTENTION',code:'OFFHOST_BACKUP_STALE'};
  }catch{return{status:'ATTENTION',code:'OFFHOST_BACKUP_UNAVAILABLE'};}
}
async function main(){
  const args=process.argv.slice(2),organize=args.length===7&&args[6]==='--organize-existing';if(process.platform!=='linux'||(!organize&&args.length!==6)||args[0]!=='--state-directory'||args[2]!=='--offhost-directory'||args[4]!=='--config-file')fail('OFFHOST_ARGUMENTS_INVALID');
  const r=await(organize?organizeExisting:publishLatest)({stateDirectory:args[1],offhostDirectory:args[3],configFile:args[5],resume:true,onProgress:progress=>console.error(JSON.stringify({stage:'OFFHOST_LAYOUT_PROGRESS',...progress}))});console.log(JSON.stringify(r));
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({status:'ATTENTION',code:/^OFFHOST_[A-Z_]+$/.test(e.message??'')?e.message:'OFFHOST_STAGE_UNAVAILABLE',privateValuesLogged:false}));process.exitCode=1;});
module.exports={publishLatest,organizeExisting,observeOffhost,remoteStatExists};
