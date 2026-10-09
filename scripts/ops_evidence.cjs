const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
class OpsCheckError extends Error {constructor(code){super(code);this.code=code;}}
function writeOpsEvidence(root,kind,record){
 const names={readiness:'LIVE_READINESS_LATEST.json',deployment:'ARC_DEPLOYMENT_LATEST.json'};
 if(!names[kind]||!['PASS','FAIL'].includes(record.status))throw new OpsCheckError('OPS_EVIDENCE_SCHEMA_INVALID');
 const directory=path.join(root,'reports','evidence'),runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID();
 fs.mkdirSync(path.join(directory,'ops-'+kind),{recursive:true});
 const file=path.join(directory,'ops-'+kind,runId+'.json'),value=Buffer.from(JSON.stringify(record,null,2)+'\n');
 const fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,value);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const reference={schemaVersion:1,path:path.relative(root,file).replaceAll(path.sep,'/'),sha256:sha256(value),byteLength:value.length,status:record.status,acceptanceEligible:false};
 const pointer=path.join(directory,names[kind]),temporary=pointer+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(temporary,JSON.stringify(reference,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,pointer);
 return reference;
}
function toolInputs(root,names){return names.map(name=>({path:name,sha256:sha256(fs.readFileSync(path.join(root,name)))}));}
module.exports={OpsCheckError,writeOpsEvidence,toolInputs,sha256};
