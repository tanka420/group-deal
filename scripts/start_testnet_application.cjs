/* Run the prepared Arc Testnet application. Credentials stay in backend/.env. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),net=require('node:net'),{fork}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),origin='http://127.0.0.1:5173';
const fail=code=>{throw Object.assign(new Error(code),{code});};
function contained(relative,parent=root){const file=path.resolve(root,relative),real=fs.realpathSync(file),base=fs.realpathSync(parent),part=path.relative(base,real);if(!part||part==='..'||part.startsWith('..'+path.sep)||path.isAbsolute(part)||!fs.lstatSync(file).isFile())fail('APPLICATION_PATH_REJECTED');return file;}
function json(relative){return JSON.parse(fs.readFileSync(contained(relative),'utf8'));}
function verified(ref){if(!ref||typeof ref.path!=='string'||!Number.isSafeInteger(ref.byteLength)||!/^[a-f0-9]{64}$/.test(ref.sha256))fail('APPLICATION_REFERENCE_INVALID');const bytes=fs.readFileSync(contained(ref.path));if(bytes.length!==ref.byteLength||sha(bytes)!==ref.sha256)fail('APPLICATION_REFERENCE_CHANGED');return JSON.parse(bytes.toString());}
async function free(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Object.assign(Error('APPLICATION_PORT_OCCUPIED'),{code:'APPLICATION_PORT_OCCUPIED'})));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
function originalGuard(){
 const sqlite=require('node:sqlite'),NativeDatabase=sqlite.DatabaseSync,cache=fs.realpathSync(path.join(root,'.cache'));
 sqlite.DatabaseSync=class extends NativeDatabase{constructor(file,...args){if(file!==':memory:'){if(typeof file!=='string')fail('APPLICATION_DATABASE_PATH_REJECTED');const absolute=path.resolve(file),parent=fs.realpathSync(path.dirname(absolute)),part=path.relative(cache,parent);if(part==='..'||part.startsWith('..'+path.sep)||path.isAbsolute(part))fail('APPLICATION_ORIGINAL_DATABASE_DRIVER_DENIED');if(fs.existsSync(absolute)&&fs.lstatSync(absolute).isSymbolicLink())fail('APPLICATION_DATABASE_SYMLINK_REJECTED');}super(file,...args);}};
 const listen=net.Server.prototype.listen;net.Server.prototype.listen=function(...args){if(args[0]&&typeof args[0]==='object')args[0]={...args[0],host:'127.0.0.1'};else if(typeof args[0]==='number'){if(typeof args[1]==='string')args[1]='127.0.0.1';else args.splice(1,0,'127.0.0.1');}return listen.apply(this,args);};
}
async function backend(){
 if(!process.send||process.env.NODE_ENV!=='production'||process.env.GROUPDEAL_RECOVERY_MODE!=='1')fail('APPLICATION_CHILD_SCOPE_REQUIRED');
 originalGuard();const {config}=require('../backend/dist/config');if(config.arcChainId!==5042002||!config.allowedOrigins.includes(origin))fail('APPLICATION_TESTNET_ORIGIN_UNCONFIRMED');
 let runtime,stopRequested=false,stopped=false;
 const stop=async()=>{stopRequested=true;if(!runtime||stopped)return;stopped=true;try{await runtime.stop();process.send?.({type:'STOPPED'});}catch{process.exitCode=1;}finally{if(process.connected)process.disconnect();}};
 process.on('message',message=>{if(message?.type==='STOP')void stop();});process.once('disconnect',()=>{void stop();});process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
 runtime=await require('../backend/dist/index').startServer();if(stopRequested){await stop();return;}
 const address=runtime.server.address(),{store}=require('../backend/dist/db/store');if(!address||typeof address==='string'||address.address!=='127.0.0.1'||!store.isIsolated){await stop();fail('APPLICATION_RUNTIME_SCOPE_UNCONFIRMED');}
 process.send({type:'READY',port:address.port,chainId:config.arcChainId,hubAddress:config.hubAddress,nativeDirectory:path.relative(root,store.storageDirectory).replaceAll(path.sep,'/')});
}
function publicPackage(){
 const pointer=json('.cache/testnet-frontend-package-latest.json'),record=verified(pointer),checks=verified(json('reports/evidence/CURRENT_TESTNET_FRONTEND_CHECKS_LATEST.json'));
 if(checks.result!=='CONFIGURED_TESTNET_FRONTEND_PACKAGE_AND_REAL_REOWN_OPEN_CANCEL_PASS'||checks.privateStagedPackage.sha256!==pointer.sha256||record.chainId!==5042002||record.reown.status!=='COMPATIBLE'||!record.publicIdentifiersMatchConfiguredInput||!record.isolatedTestIdentifiersAbsent||record.privateKeysOrEnvFilesIncluded||record.sourceMapsIncluded||record.publicSecretFindings.length)fail('APPLICATION_FRONTEND_NOT_PREPARED');
 for(const input of checks.source.filter(f=>/^frontend\/(?:src|build)\//.test(f.path)||/^frontend\/(?:index\.html|fallback\.html|vite\.config\.ts|package(?:-lock)?\.json)$/.test(f.path)||f.path.startsWith('shared/'))){if(sha(fs.readFileSync(contained(input.path)))!==input.sha256)fail('APPLICATION_FRONTEND_SOURCE_CHANGED');}
 const manifest=json('shared/manifests/arc-testnet.json');if(record.manifestSha256!==sha(fs.readFileSync(contained('shared/manifests/arc-testnet.json')))||record.hubAddress.toLowerCase()!==manifest.contracts.GroupDealHub.address.toLowerCase())fail('APPLICATION_DEPLOYMENT_CHANGED');
 const directory=path.resolve(root,record.applicationDirectory),base=path.join(root,'.cache/testnet-frontend-packages');if(!directory.startsWith(base+path.sep))fail('APPLICATION_FRONTEND_DIRECTORY_REJECTED');
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'},files=new Map();
 for(const item of record.files){if(typeof item.path!=='string'||files.has('/'+item.path))fail('APPLICATION_FRONTEND_INVENTORY_INVALID');const file=contained(record.applicationDirectory+'/'+item.path,directory),bytes=fs.readFileSync(file);if(bytes.length!==item.byteLength||sha(bytes)!==item.sha256)fail('APPLICATION_FRONTEND_BYTES_CHANGED');files.set('/'+item.path,{bytes,type:types[path.extname(file)]||'application/octet-stream'});}
 const configured=require('../backend/node_modules/dotenv').parse(fs.readFileSync(contained('frontend/.env'))),scripts=[...files].filter(([name])=>name.endsWith('.js')).map(([,f])=>f.bytes.toString()).join('\n');if(!configured.VITE_CIRCLE_APP_ID||!configured.VITE_REOWN_PROJECT_ID||!scripts.includes(configured.VITE_CIRCLE_APP_ID)||!scripts.includes(configured.VITE_REOWN_PROJECT_ID))fail('APPLICATION_PUBLIC_CONFIGURATION_CHANGED');
 if(!files.has('/index.html'))fail('APPLICATION_INDEX_MISSING');return{pointer,record,files};
}
function serve(files,backendPort){
 const hop=new Set(['host','connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
 return http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['127.0.0.1:5173','localhost:5173'].includes(req.headers.host)||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
  let url;try{url=new URL(req.url,origin);}catch{res.writeHead(400);res.end();return;}
  if(url.pathname.startsWith('/api/')||url.pathname==='/health'){
   const headers=Object.fromEntries(Object.entries(req.headers).filter(([key])=>!hop.has(key)));headers.host='127.0.0.1:'+backendPort;
   const upstream=http.request({host:'127.0.0.1',port:backendPort,path:url.pathname+url.search,method:req.method,headers},response=>{res.writeHead(response.statusCode||502,Object.fromEntries(Object.entries(response.headers).filter(([key])=>!hop.has(key))));response.pipe(res);});
   upstream.setTimeout(90000,()=>upstream.destroy());upstream.once('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"APPLICATION_BACKEND_UNAVAILABLE"}');});req.once('aborted',()=>upstream.destroy());res.once('close',()=>{if(!res.writableEnded)upstream.destroy();});req.pipe(upstream);return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  const item=files.get(url.pathname==='/'?'/index.html':url.pathname);if(!item){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':item.type,'Content-Length':item.bytes.length});res.end(req.method==='HEAD'?undefined:item.bytes);
 });
}
async function main(){
 if(process.argv.length!==2)fail('APPLICATION_ARGUMENTS_UNSUPPORTED');const pack=publicPackage();await free(5173);
 const preparation=verified(json('reports/evidence/RECOVERY_APPLICATION_LATEST.json'));if(preparation.status!=='RECOVERY_APPLICATION_PREPARED'||!preparation.applicationBootEligible||preparation.deployment.chainId!==5042002)fail('APPLICATION_NATIVE_NOT_PREPARED');
 for(const input of preparation.runtimeInputs){if(sha(fs.readFileSync(contained(input.path)))!==input.sha256)fail('APPLICATION_NATIVE_SOURCE_CHANGED');}
 const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID(),directory=path.join(root,'.cache/testnet-application-runs',id);fs.mkdirSync(directory,{recursive:true});
 const log=fs.openSync(path.join(directory,'BACKEND.log'),'wx',0o600),env={...process.env,NODE_ENV:'production',GROUPDEAL_RECOVERY_MODE:'1',PORT:'0'};delete env.NODE_OPTIONS;delete env.GROUPDEAL_ENABLE_LOCAL_FIXTURES;
 const child=fork(__filename,['--backend-child'],{cwd:path.join(root,'backend'),env,stdio:['ignore',log,log,'ipc'],windowsHide:true});fs.closeSync(log);
 let server,stopping=false,ready=false;
 const stop=async()=>{if(stopping)return;stopping=true;if(server?.listening){server.closeIdleConnections();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(child.connected)child.send({type:'STOP'});console.log(JSON.stringify({status:'TESTNET_APPLICATION_STOPPING',run:id}));};
 process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='STOP_APPLICATION')void stop();});
 const timeout=setTimeout(()=>{if(!ready){console.error(JSON.stringify({status:'REJECTED',code:'APPLICATION_STARTUP_TIMEOUT',run:id}));process.exitCode=1;void stop();}},120000);
 child.on('message',async message=>{
  if(message?.type!=='READY'||ready)return;ready=true;clearTimeout(timeout);if(stopping){if(child.connected)child.send({type:'STOP'});return;}
  try{if(message.chainId!==5042002||message.hubAddress.toLowerCase()!==pack.record.hubAddress.toLowerCase())fail('APPLICATION_BACKEND_DEPLOYMENT_MISMATCH');server=serve(pack.files,message.port);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5173,'127.0.0.1',resolve);});
   const record={schemaVersion:1,recordedAt:new Date().toISOString(),status:'RUNNING_TESTNET_APPLICATION',pid:process.pid,backendPid:child.pid,url:origin,backendPort:message.port,chainId:message.chainId,hubAddress:message.hubAddress,nativeDirectory:message.nativeDirectory,package:pack.pointer,publicFiles:pack.files.size,originalStoreDriverBlocked:true,localFixturesEnabled:false,acceptanceEligible:false};fs.writeFileSync(path.join(directory,'RUN.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:record.status,run:id,url:origin,backendPort:message.port,chainId:5042002,hubAddress:message.hubAddress,publicFiles:pack.files.size}));
  }catch(error){process.exitCode=1;console.error(JSON.stringify({status:'REJECTED',code:error.code||'APPLICATION_FRONTEND_START_FAILED',run:id}));void stop();}
 });
 child.once('error',()=>{process.exitCode=1;clearTimeout(timeout);void stop();});
 child.once('exit',async(code,signal)=>{clearTimeout(timeout);if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}const terminal={schemaVersion:1,recordedAt:new Date().toISOString(),exitCode:code,signal,ready,stopRequested:stopping,frontendStopped:true};fs.writeFileSync(path.join(directory,'TERMINAL.json'),JSON.stringify(terminal,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:code===0&&ready?'TESTNET_APPLICATION_STOPPED':'REJECTED',run:id,exitCode:code,signal}));if(code!==0||signal||!ready)process.exitCode=1;process.stdin.pause();});
}
if(process.argv[2]==='--backend-child')backend().catch(error=>{console.error(JSON.stringify({status:'REJECTED',code:error.code||'APPLICATION_NATIVE_START_FAILED'}));process.exitCode=1;if(process.connected)process.disconnect();});
else main().catch(error=>{console.error(JSON.stringify({status:'REJECTED',code:error.code||'APPLICATION_START_UNCONFIRMED'}));process.exitCode=1;});
