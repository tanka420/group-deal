const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {localCheckEnvironment}=require('./local_check_runtime.cjs');
const root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stop(child){if(!child||child.exitCode!==null||child.signalCode)return;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');const timer=setTimeout(()=>{if(child.exitCode===null&&!child.signalCode)child.kill('SIGKILL');},5000);await ended;clearTimeout(timer);}
async function main(){
  const separator=process.argv.indexOf('--'),own=process.argv.slice(2,separator<0?undefined:separator),tests=separator<0?[]:process.argv.slice(separator+1);
  const artifact=own.includes('--artifact'),preview=own.includes('--preview'),configuredReown=own.includes('--reown-fixture'),portArg=own.find(a=>a.startsWith('--port=')),port=portArg?Number(portArg.slice(7)):artifact?4175:4173;
  if(artifact&&(preview||configuredReown)||own.some(a=>!['--artifact','--preview','--reown-fixture'].includes(a)&&!a.startsWith('--port='))||own.filter(a=>a.startsWith('--port=')).length>1||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid browser runner options');
  await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(new Error('Requested browser port is already occupied; no process will be stopped or reused')));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
  if(tests.some(arg=>arg==='--output'||arg.startsWith('--output=')))throw new Error('Owned runner manages its artifact directory; do not pass --output');
  const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID();
  const outputDirectory='.cache/browser-artifacts-'+runId,reportPath=path.join(root,'.cache/browser-run-'+runId+'.json');
  fs.mkdirSync(path.join(root,outputDirectory),{recursive:true});
  const maxFailures=process.env.CI==='true'?0:1;
  const runRecord={schemaVersion:1,startedAt:new Date().toISOString(),mode:artifact?'artifact':preview?'preview':'dev',configuredReownFixture:configuredReown,testArguments:tests,port,outputDirectory,result:'RUNNING',acceptanceEligible:false,maxFailures};
  fs.writeFileSync(reportPath,JSON.stringify(runRecord,null,2)+'\n',{flag:'wx'});
  const environment={...localCheckEnvironment(root,{configuredReown}),PLAYWRIGHT_REUSE_SERVER:'1',GROUPDEAL_REOWN_CONFIGURED_FIXTURE:configuredReown?'1':'',GROUPDEAL_BROWSER_PORT:String(port),GROUPDEAL_BROWSER_MODE:preview?'preview':'dev',GROUPDEAL_FALLBACK_BASE_URL:artifact?'http://127.0.0.1:'+port:''};
  const frontend=path.join(root,'frontend');
  let serverArgs,cwd=frontend,packageManifest;
  if(artifact){packageManifest=JSON.parse(fs.readFileSync(path.join(root,'.cache/fallback-latest-package.json'),'utf8'));const directory=path.resolve(root,packageManifest.artifactDirectory);if(!directory.startsWith(path.join(root,'.cache')+path.sep)||packageManifest.entry!=='fallback.html')throw new Error('Fallback package is outside the workspace cache');serverArgs=[path.join(root,'scripts/serve_fallback.cjs'),directory,String(port)];cwd=root;}
  else {if(preview&&!fs.existsSync(path.join(frontend,'dist/index.html')))throw new Error('Built application is missing');serverArgs=[path.join(frontend,'node_modules/vite/bin/vite.js'),...(preview?['preview']:[]),'--host','127.0.0.1','--port',String(port),'--strictPort'];}
  let server,runner,serverFailed=false;
  const abort=()=>{void stop(runner).then(()=>stop(server));};process.once('SIGINT',abort);process.once('SIGTERM',abort);
  try{
    server=spawn(process.execPath,serverArgs,{cwd,env:environment,stdio:['ignore','ignore','ignore']});server.on('error',()=>{serverFailed=true;});
    const url='http://127.0.0.1:'+port+(artifact?'/fallback.html':'/');let ready=false;
    for(let attempt=0;attempt<80;attempt++){if(serverFailed||server.exitCode!==null||server.signalCode)throw new Error('Owned browser server exited during startup');try{const response=await fetch(url,{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break;}}catch{}await delay(250);}
    if(!ready)throw new Error('Owned browser server did not become ready');
    console.log('Owned '+(artifact?'static fallback':preview?'built application preview':'Vite')+' server ready at '+url);
    if(artifact){
      const base='http://127.0.0.1:'+port,files=[];
      for(const file of packageManifest.files){const response=await fetch(base+'/'+file.path,{signal:AbortSignal.timeout(3000)}),bytes=Buffer.from(await response.arrayBuffer()),hash=crypto.createHash('sha256').update(bytes).digest('hex');if(response.status!==200||hash!==file.sha256||bytes.length!==file.byteLength)throw new Error('Served fallback bytes differ from the package');files.push({path:file.path,sha256:hash,byteLength:bytes.length});}
      for(const route of ['/index.html','/api/health','/src/App.tsx'])if((await fetch(base+route,{signal:AbortSignal.timeout(3000)})).status!==404)throw new Error('Static fallback exposes an application or API route');
      const post=await fetch(base+'/fallback.html',{method:'POST',signal:AbortSignal.timeout(3000)}),head=await fetch(base+'/fallback.html',{method:'HEAD',signal:AbortSignal.timeout(3000)});
      if(post.status!==405||head.status!==200||(await head.arrayBuffer()).byteLength!==0)throw new Error('Static fallback method boundary failed');
      const report='.cache/fallback-http-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';fs.writeFileSync(path.join(root,report),JSON.stringify({schemaVersion:1,layer:'LOCAL_STATIC_HTTP',result:'PASS',acceptanceEligible:false,package:packageManifest.artifactDirectory+'/PACKAGE.json',files,boundary:{appAndApi404:true,post405:true,headEmpty:true}},null,2)+'\n');console.log('PASS static HTTP package hashes and method/application boundary; '+report);
    }
    const args=[path.join(frontend,'node_modules/@playwright/test/cli.js'),'test','--max-failures='+maxFailures,...(artifact?['fallback.spec.ts']:[]),...tests,'--output='+path.join(root,outputDirectory)];
    console.log('Owned browser artifacts: '+outputDirectory);
    runner=spawn(process.execPath,args,{cwd:frontend,env:environment,stdio:'inherit'});
    const result=await new Promise((resolve,reject)=>{runner.once('error',()=>reject(new Error('Browser check process could not start')));runner.once('exit',(code,signal)=>resolve({code,signal}));});
    process.exitCode=result.code===0?0:result.code||1;
    Object.assign(runRecord,{result:result.code===0?'PASS':'FAIL',exitCode:result.code,signal:result.signal||null});
  }finally{await stop(runner);await stop(server);process.off('SIGINT',abort);process.off('SIGTERM',abort);
    if(runRecord.result==='RUNNING')runRecord.result='FAIL';
    Object.assign(runRecord,{finishedAt:new Date().toISOString(),ownedServerStopped:!!server&&(server.exitCode!==null||!!server.signalCode),ownedRunnerStopped:!!runner&&(runner.exitCode!==null||!!runner.signalCode)});
    fs.writeFileSync(reportPath,JSON.stringify(runRecord,null,2)+'\n');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
