'use strict';
// Linux staging only. No application config, credentials, DB, network, workers or service activation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function inspect(root,archiveSha256){
 if(process.platform!=='linux'||process.arch!=='x64'||process.version!=='v24.21.0'||!/^[a-f0-9]{64}$/.test(archiveSha256||''))throw Error('MAINNET_PREFLIGHT_RUNTIME_OR_ARCHIVE_INVALID');
 const release=JSON.parse(fs.readFileSync(path.join(root,'RELEASE.json')));
 if(release.scope!=='MAINNET_INTERNAL_SERVICE_PREPARATION'||release.chainId!==5042||release.activationAuthorized!==false||release.productionCredentialsIncluded!==false||release.databaseIncluded!==false||!/^[a-f0-9]{40}$/.test(release.sourceCommit))throw Error('MAINNET_PREFLIGHT_SCOPE_INVALID');
 if(fs.existsSync(path.join(root,'backend/.env'))||fs.existsSync(path.join(root,'backend/data')))throw Error('MAINNET_PREFLIGHT_DATA_OR_ENV_PRESENT');
 for(const f of release.files){if(!/^[A-Za-z0-9_./@+-]+$/.test(f.path)||path.isAbsolute(f.path)||f.path.split('/').includes('..'))throw Error('MAINNET_PREFLIGHT_PATH_INVALID');const file=path.join(root,f.path),s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size!==f.byteLength||sha(fs.readFileSync(file))!==f.sha256)throw Error('MAINNET_PREFLIGHT_SOURCE_CHANGED');}
 const req=createRequire(path.join(root,'backend/package.json'));
 for(const name of ['ethers','express','jsonwebtoken','nodemailer','zod','cors','dotenv'])req(name);
 req.resolve('@circle-fin/user-controlled-wallets');
 const sqlite=require('node:sqlite'),db=new sqlite.DatabaseSync(':memory:');try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('MAINNET_PREFLIGHT_SQLITE_INVALID');}finally{db.close();}
 const dependencies=path.join(root,'backend/node_modules'),inventory=[];
 const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),relative=path.relative(dependencies,file).replaceAll(path.sep,'/');if(e.isDirectory())walk(file);else if(e.isSymbolicLink()){if(!fs.realpathSync(file).startsWith(dependencies+path.sep))throw Error('MAINNET_PREFLIGHT_DEPENDENCY_LINK_ESCAPE');inventory.push({path:relative,link:fs.readlinkSync(file)});}else if(e.isFile())inventory.push({path:relative,sha256:sha(fs.readFileSync(file))});else throw Error('MAINNET_PREFLIGHT_DEPENDENCY_TYPE');}};
 walk(dependencies);inventory.sort((a,b)=>a.path.localeCompare(b.path));
 return {result:'PASS_LINUX_MAINNET_STAGING',sourceCommit:release.sourceCommit,sourceFingerprint:release.sourceFingerprint,archiveSha256,nodeVersion:process.version,nodeBinarySha256:sha(fs.readFileSync(process.execPath)),codeFilesVerified:release.files.length,dependencyFiles:inventory.length,dependencyFingerprint:sha(JSON.stringify(inventory)),productionCredentialsConfigured:false,databaseOpened:false,persistentDatabaseCreated:false,sqliteMemoryCheck:true,backendStarted:false,activationAuthorized:false,transactionsSubmitted:0};
}
if(require.main===module){try{if(process.argv.length!==3)throw Error('MAINNET_PREFLIGHT_ARCHIVE_HASH_REQUIRED');const root=path.resolve(__dirname,'..'),result=inspect(root,process.argv[2]);fs.writeFileSync(path.join(root,'LINUX_PREFLIGHT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'MAINNET_PREFLIGHT_FAILED');process.exitCode=1;}}
module.exports={inspect};
