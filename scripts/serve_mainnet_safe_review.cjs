'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {prepareMainnet}=require('./prepare_mainnet.cjs'),{currentQuote}=require('./quote_mainnet_safe.cjs');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function createReviewServer({packet,files,quoteLoader,attemptDirectory,assertContext=()=>{}}){
 const quotes=new Map(),journalFile=path.join(attemptDirectory,'ATTEMPT.json');
 const readJournal=()=>fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):null;
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  const port=server.address().port,origin='http://127.0.0.1:'+port;
  const headers={'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'};
  const reply=(status,value,type='application/json')=>{res.writeHead(status,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(type==='application/json'?JSON.stringify(value):value);};
  try{
   if(req.headers.host!=='127.0.0.1:'+port||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site']))return reply(403,{code:'ORIGIN_REJECTED'});
   if(req.method==='GET'&&Object.hasOwn(files,req.url)){const item=files[req.url];return reply(200,item.bytes,item.type);}
   if(req.method==='GET'&&req.url==='/quote'){
    assertContext();
    const {report}=await quoteLoader();
    if(report.sourceFingerprint!==packet.sourceFingerprint||report.signingAuthorized!==packet.signingAuthorized||report.broadcastAuthorized!==packet.broadcastAuthorized)throw Error('SOURCE_CHANGED');
    const quoteId=crypto.randomBytes(16).toString('hex');quotes.clear();quotes.set(quoteId,report);
    return reply(200,{...report,quoteId,attemptRecorded:readJournal()!==null});
   }
   if(req.method!=='POST'||!['/attempt','/result'].includes(req.url))return reply(405,{code:'METHOD_NOT_ALLOWED'});
   if(packet.signingAuthorized!==true||packet.broadcastAuthorized!==true)return reply(403,{code:'SIGNING_AND_BROADCAST_NOT_AUTHORIZED'});
   if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return reply(403,{code:'REQUEST_REJECTED'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024)return reply(413,{code:'REQUEST_TOO_LARGE'});chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString());
   if(!body||typeof body.quoteId!=='string'||!/^[a-f0-9]{32}$/.test(body.quoteId))return reply(400,{code:'INPUT_INVALID'});
   if(req.url==='/attempt'){
    assertContext();
    if(Object.keys(body).join(',')!=='quoteId')return reply(400,{code:'INPUT_INVALID'});
    const q=quotes.get(body.quoteId);if(!q||Date.now()<Date.parse(q.createdAt)||Date.now()>=Date.parse(q.expiresAt))return reply(409,{code:'QUOTE_EXPIRED'});
    fs.mkdirSync(attemptDirectory,{recursive:true});
    const record={schemaVersion:1,status:'ATTEMPTING',quoteId:body.quoteId,recordedAt:new Date().toISOString(),sourceFingerprint:packet.sourceFingerprint,dataHash:packet.dataHash,transaction:q.unsignedTransaction,hash:null,actualDeployment:false};
    try{const fd=fs.openSync(journalFile,'wx');try{fs.writeFileSync(fd,JSON.stringify(record,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}catch(e){if(e.code==='EEXIST')return reply(409,{code:'ATTEMPT_ALREADY_RECORDED'});throw e;}
    return reply(200,{result:'ATTEMPT_RECORDED'});
   }
   if(Object.keys(body).sort().join(',')!=='hash,outcome,quoteId'||!['HASH_RETURNED','REJECTED','UNKNOWN'].includes(body.outcome)
    ||body.outcome==='HASH_RETURNED'&&!/^0x[a-f0-9]{64}$/i.test(body.hash)||body.outcome!=='HASH_RETURNED'&&body.hash!==null)return reply(400,{code:'INPUT_INVALID'});
   const record=readJournal();if(!record||record.quoteId!==body.quoteId)return reply(409,{code:'ATTEMPT_MISMATCH'});
   if(record.hash&&body.hash&&record.hash!==body.hash)return reply(409,{code:'HASH_MISMATCH'});
   const updated={...record,status:record.hash?'HASH_RETURNED':body.outcome,hash:record.hash||body.hash,updatedAt:new Date().toISOString()};
   const temp=journalFile+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(updated,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,journalFile);
   return reply(200,{result:'OUTCOME_RECORDED',actualDeployment:false});
  }catch{return reply(503,{code:'SAFE_REVIEW_UNAVAILABLE'});}
 });
 server.requestTimeout=50000;server.headersTimeout=10000;server.keepAliveTimeout=1000;return server;
}
async function main(){
 if(process.argv.length>2)throw Error('SAFE_REVIEW_ACCEPTS_NO_WALLET_OR_TRANSACTION_ARGUMENTS');
 const before=prepareMainnet(),budget=JSON.parse(fs.readFileSync(path.join(root,'config/mainnet-safe-budget.json'),'utf8'));
 // The budget is validated against canonical Safe setup during the initial quote, before opening the server.
 const initial=await currentQuote();if(initial.report.sourceFingerprint!==before.sourceFingerprint)throw Error('SAFE_REVIEW_SOURCE_CHANGED');
 const packet={...budget,sourceCommit:before.sourceCommit,sourceFingerprint:before.sourceFingerprint};
 const esbuild=require('../backend/node_modules/esbuild'),built=await esbuild.build({entryPoints:[path.join(__dirname,'mainnet-safe-page/client.mjs')],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minify:true,nodePaths:[path.join(root,'backend/node_modules')],define:{__SAFE_REVIEW_PACKET__:JSON.stringify(packet)}});
 if(built.outputFiles.length!==1||prepareMainnet().sourceFingerprint!==before.sourceFingerprint)throw Error('SAFE_REVIEW_BUILD_CHANGED');
 const files={
  '/':{bytes:fs.readFileSync(path.join(__dirname,'mainnet-safe-page/index.html')),type:'text/html'},
  '/client.js':{bytes:built.outputFiles[0].contents,type:'text/javascript'},
  '/style.css':{bytes:fs.readFileSync(path.join(__dirname,'mainnet-safe-page/style.css')),type:'text/css'},
 };
 const attemptDirectory=path.join(root,'.cache/mainnet-safe-attempts',budget.dataHash.slice(2));
 const assertContext=()=>{if(prepareMainnet().sourceFingerprint!==packet.sourceFingerprint)throw Error('SAFE_REVIEW_SOURCE_CHANGED');};
 const server=createReviewServer({packet,files,quoteLoader:currentQuote,attemptDirectory,assertContext});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port,reportDirectory=path.join(root,'.cache/mainnet-safe-review',crypto.randomUUID());fs.mkdirSync(reportDirectory,{recursive:true});
 const artifactDirectory=path.join(reportDirectory,'page');fs.mkdirSync(artifactDirectory);
 for(const [route,item] of Object.entries(files))fs.writeFileSync(path.join(artifactDirectory,route==='/'?'index.html':route.slice(1)),item.bytes,{flag:'wx'});
 const report={schemaVersion:1,result:'LOCAL_SAFE_REVIEW_READY',recordedAt:new Date().toISOString(),url,sourceCommit:before.sourceCommit,sourceFingerprint:before.sourceFingerprint,
  files:Object.entries(files).map(([route,item])=>({route,sha256:sha(item.bytes)})),budgetApproved:true,maximumGasCostUsdc:'0.02',signingAuthorized:packet.signingAuthorized,broadcastAuthorized:packet.broadcastAuthorized,backendActivated:false,transactionSubmitted:false,initialQuote:initial.file,artifactDirectory,attemptDirectory};
 const reportPath=path.join(reportDirectory,'SERVE.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({url,reportPath,sourceCommit:before.sourceCommit,budgetApproved:true,maximumGasCostUsdc:'0.02',signingAuthorized:packet.signingAuthorized,broadcastAuthorized:packet.broadcastAuthorized}));
}
module.exports={createReviewServer};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
