import assert from 'node:assert/strict';
import path from 'node:path';
import {ethers} from 'ethers';

/** Full source/emitted index.ts startup and HTTP routes; chain/manifest remain explicit local fixtures. */
async function main(){
 let input='';for await(const chunk of process.stdin)input+=chunk;const data=JSON.parse(input),root=path.resolve(__dirname,'../..'),prefix=path.join(root,'backend',data.built?'dist':'src'),load=(name:string)=>require(path.join(prefix,name));
 if(process.env.NODE_ENV!=='test'||process.env.GROUPDEAL_RECOVERY_MODE!=='1')throw Error('Fixture scope required');
 const runtimeConfig=load('config').config;Object.assign(runtimeConfig,{arcChainId:31337,deploymentBlock:1,protocolVersion:1,arcWsUrl:'',port:data.occupiedPort||0,isProduction:false});
 Object.assign(require('../src/config').config,{arcChainId:31337,deploymentBlock:1,protocolVersion:1,arcWsUrl:''});
 const recovery=load('services/recoveryApplication');
 const storeModule=load('db/store'),empty=new storeModule.TransactionalStore(data.chainFixtureDirectory),truth=empty.snapshot();empty.close();
 const {eventProvider}=require('./fixtures/events'),{reconciliationProvider}=require('./fixtures/reconciliation'),provider={...eventProvider([]),...reconciliationProvider(truth,0n,3),getLogs:async()=>[]};
 let workerStarts=0;const options={verifyManifest:async()=>({valid:true,chainId:31337,fixture:true}),selectRecovery:()=>recovery.admitRecoveryApplication(data.admission),readProvider:provider,startWorkers:()=>{workerStarts++;return()=>{};}};
 const app=load('index');let runtime:any;
 if(data.occupiedPort){try{runtime=await app.startServer(options);assert.fail('Occupied API port started');}catch(error){assert.equal((error as NodeJS.ErrnoException).code,'EADDRINUSE');assert.equal(workerStarts,0);assert.equal(load('services/indexerService').IndexerService.getObservations().running,false);console.log('PASS NORMAL_RECOVERY_OCCUPIED '+(data.built?'emitted':'source'));return;}finally{await runtime?.stop();}}
 runtime=await app.startServer(options);
 try{
  const address=runtime.server.address(),url='http://127.0.0.1:'+address.port;
  const request=async(route:string,method='GET',body?:unknown,token?:string)=>{const response=await fetch(url+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});return{status:response.status,data:await response.json() as any};};
  assert.equal((await request('/api/health')).status,200);assert.equal((await request('/api/auth/me','GET',undefined,data.oldToken)).status,401);
  const wallet=new ethers.Wallet(data.fixturePrivateKey),challenge=await request('/api/auth/wallet/login/challenge','POST',{walletAddress:wallet.address});assert.equal(challenge.status,200);const signature=await wallet.signMessage(challenge.data.challengeMessage),login=await request('/api/auth/wallet/login/verify','POST',{walletAddress:wallet.address,signature,message:challenge.data.challengeMessage,nonce:challenge.data.nonce});assert.equal(login.status,200);assert.equal(login.data.user.id,'buyer');
  const me=await request('/api/auth/me','GET',undefined,login.data.token);assert.equal(me.status,200);assert.equal(me.data.user.id,'buyer');
  const sessions=await request('/api/auth/sessions','GET',undefined,login.data.token);assert.equal(sessions.status,200);assert.equal(sessions.data.sessions.filter((s:any)=>s.state==='ACTIVE').length,1);
  const preferences=await request('/api/notifications/preferences','PUT',{email:false,inApp:true},login.data.token);assert.equal(preferences.status,200);assert.equal(storeModule.store.db.notificationPreferences.buyer.email,false);
  assert.ok(storeModule.store.isIsolated);assert.equal(workerStarts,1);console.log('PASS NORMAL_RECOVERY_HTTP '+(data.built?'emitted':'source')+' 7 boundaries; fixture wallet/chain/workers only, no real principal/provider');
 }finally{await runtime.stop();}
}
void main().catch(error=>{console.error('FAIL NORMAL_RECOVERY_HTTP; private values withheld');console.error(JSON.stringify({kind:error instanceof assert.AssertionError?'ASSERTION':'STARTUP_OR_STORAGE',frames:error instanceof Error?error.stack?.split(/\r?\n/).filter(l=>/^\s+at /.test(l)).slice(0,3):[]}));process.exitCode=1;});
