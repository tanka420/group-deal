const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.cache/local-workspace-run');
const free=port=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('LOCAL_PORT_OCCUPIED_'+port)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
async function main(){
 if(process.argv.length!==2)throw Error('LOCAL_ARGUMENTS_UNSUPPORTED');
 for(const file of ['backend/dist/index.js','frontend/dist/index.html'])if(!fs.existsSync(path.join(root,file)))throw Error('LOCAL_BUILD_REQUIRED');
 await free(4000);await free(5173);fs.mkdirSync(directory,{recursive:true});
 const dotenv=require('../backend/node_modules/dotenv'),configured=dotenv.parse(fs.readFileSync(path.join(root,'backend/.env'))),env={...process.env,...configured,NODE_ENV:'development',GROUPDEAL_LOCAL_DEVELOPMENT:'1',PORT:'4000',ALLOWED_ORIGINS:'http://127.0.0.1:5173,http://localhost:5173',SMTP_HOST:'',SMTP_USER:'',SMTP_APP_PASSWORD:''};
 delete env.GROUPDEAL_RECOVERY_MODE;delete env.GROUPDEAL_ENABLE_LOCAL_FIXTURES;
 const log=fs.openSync(path.join(directory,'backend.log'),'a'),backend=cp.spawn(process.execPath,[path.join(root,'backend/dist/index.js')],{cwd:path.join(root,'backend'),env,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
 let frontend,stopping=false;const stop=()=>{if(stopping)return;stopping=true;frontend?.closeAllConnections();frontend?.close();if(backend.exitCode===null)backend.kill('SIGTERM');};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 backend.once('exit',code=>{stop();if(code)process.exitCode=code;});
 let ready=false;for(let i=0;i<240;i++){if(backend.exitCode!==null)throw Error('LOCAL_API_START_FAILED');try{const r=await fetch('http://127.0.0.1:4000/api/auth/me',{signal:AbortSignal.timeout(1000)});if(r.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready){stop();throw Error('LOCAL_API_START_TIMEOUT');}
 const express=require('../backend/node_modules/express'),app=express();
 app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');if(req.path==='/health'||req.path.startsWith('/api/')){
  const headers={...req.headers,host:'127.0.0.1:4000'},upstream=http.request({host:'127.0.0.1',port:4000,path:req.originalUrl,method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.once('error',()=>{if(!res.headersSent)res.status(503);res.end();});req.pipe(upstream);return;
 }next();});
 app.use(express.static(path.join(root,'frontend/dist'),{index:'index.html'}));app.get('*',(req,res)=>{if(req.path.startsWith('/assets/')){res.status(404).end();return;}res.sendFile(path.join(root,'frontend/dist/index.html'));});
 frontend=app.listen(5173,'127.0.0.1');await new Promise(r=>frontend.once('listening',r));
 const commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
 fs.writeFileSync(path.join(directory,'run.json'),JSON.stringify({pid:process.pid,backendPid:backend.pid,url:'http://127.0.0.1:5173',commit,mode:'LOCAL_API_AND_ISOLATED_SQLITE',dataDirectory:'.cache/local-workspace',sampleData:false,externalOutboxWorkers:false},null,2));
 console.log('Local GroupDeal: http://127.0.0.1:5173 · isolated SQLite · no sample data · '+commit);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
