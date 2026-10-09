import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {SessionService,type SessionProof} from '../src/services/sessionService';
import {AuthService} from '../src/services/authService';
import {buildOperation} from '../src/domain/operationPreparation';
import {OperationPreparationService} from '../src/services/operationPreparationService';
import {OperationReadinessService} from '../src/services/operationReadinessService';
import {OperationTrackingService} from '../src/services/operationTrackingService';
import {OperationVerificationService} from '../src/services/operationVerificationService';
import {OperationReplacementService} from '../src/services/operationReplacementService';
import {OperationCompletionService} from '../src/services/operationCompletionService';
import {OrderActionService} from '../src/services/orderActionService';
import {DisputeMetadataService} from '../src/services/disputeMetadataService';
import {CircleWalletService} from '../src/services/circleWalletService';
import {operationRouter} from '../src/routes/operationRoutes';
import {authRouter} from '../src/routes/authRoutes';
import {circleRouter} from '../src/routes/circleRoutes';
import {HUB_ABI} from '../src/contracts/hubAbi';
import {computeTermsHash,encryptEntitlement} from '../src/utils/crypto';
import {enrollFixtureOperator} from './helpers/operatorFixture';
import {reconciliationProvider} from './fixtures/reconciliation';
const initial=store.snapshot(),iface=new ethers.Interface(HUB_ABI),providerToken='fixture-provider-token-only-resolve-authority';let cases=0,current='setup',parentClosed=false;const selectedCase=process.argv.find(a=>a.startsWith('--case='))?.slice(7);const originalClient=(CircleWalletService as any).client;
async function setup(enroll=false){
 assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);store.replace(structuredClone(initial));const wallet=ethers.Wallet.createRandom(),seller=ethers.Wallet.createRandom(),other=ethers.Wallet.createRandom();Object.assign(config,{arcChainId:5042002,deploymentBlock:1,protocolVersion:1,operatorAddress:wallet.address});
 store.transaction(()=>{store.db.users.actor={id:'actor',email:'actor@resolve-fixture.example.test',emailVerified:true,roles:['buyer','operator'],activeWallet:wallet.address,circleUserId:'fixture-circle-actor',circleWallet:{walletId:'fixture-wallet',address:wallet.address,blockchain:'ARC-TESTNET'},createdAt:Date.now()};store.db.userByWallet[wallet.address.toLowerCase()]='actor';store.db.userByCircleId['fixture-circle-actor']='actor';store.db.users.seller={id:'seller',email:'seller@resolve-fixture.example.test',roles:['seller'],activeWallet:seller.address,createdAt:Date.now()};store.db.users.other={id:'other',email:'other@resolve-fixture.example.test',roles:['buyer'],activeWallet:other.address,createdAt:Date.now()};
  store.db.campaigns.deal={id:'deal',sellerId:'seller',sellerPayoutWallet:seller.address,status:'FINALIZED',onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:1,termsHash:ethers.id('resolve-terms'),metric:'BUYER_COUNT',tiers:[{threshold:1,price:'100'}],deliverySlaSeconds:100} as any;
  store.db.orders.order={id:'order',campaignId:'deal',onchainOrderId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:1,buyerAccountId:'other',buyerPrincipal:other.address,quantity:1,lockedUnitPrice:'100',committedGross:'100',rebateAllocated:'0',buyerRefundAllocated:'0',sellerAllocated:'0',buyerClaimedAmount:'0',sellerClaimedAmount:'0',deliveryStatus:'DISPUTED',deliveryTimestamp:Math.floor(Date.now()/1000)-10,privateExtension:'preserve-financial-entitlement'} as any;
 });
 const token=SessionService.issue(store.db.users.actor),proof=SessionService.authenticate(token),enrollment=enroll?await enrollFixtureOperator('actor',proof,{wallet,chainId:5042002}):undefined;
 const intent={action:'RESOLVE' as const,buyerPercent:40,notes:'Private fixture resolution'},calldata=iface.encodeFunctionData('resolveDispute',[1,1,40,60]);const input={userId:'actor',action:'RESOLVE' as const,resourceId:'order',principal:wallet.address,idempotencyKey:'resolve:fixture',intentId:'resolve:fixture',calldata,expectedFunction:'resolveDispute',expectedEvent:'DisputeResolved',expectedEventArgs:{campaignId:1,orderId:1,buyerShare:'40',sellerShare:'60'},orderTermsHash:store.db.campaigns.deal.termsHash,orderMetadataHash:computeTermsHash(intent),stagedOrderMetadataEncrypted:encryptEntitlement(JSON.stringify({userId:'actor',orderId:'order',input:intent}))};const operation=buildOperation(input);
 store.transaction(()=>{store.db.operations[operation.id]=operation;});const counters={rpc:0,identity:0,estimate:0,challenge:0,callback:undefined as (()=>void)|undefined};const truth=reconciliationProvider(store.snapshot(),100n,10);OrderActionService.setProvider({...truth,getBlock:async(n:number)=>({number:n,hash:ethers.id('block-'+n),timestamp:Math.floor(Date.now()/1000)}),call:async(tx:any)=>{counters.rpc++;counters.callback?.();counters.callback=undefined;const parsed=iface.parseTransaction({data:tx.data});if(parsed?.name==='resolveDispute')return iface.encodeFunctionResult('resolveDispute',[]);return truth.call(tx);}});
 (CircleWalletService as any).client={getUserStatus:async()=>{counters.identity++;return{data:{id:'fixture-circle-actor',status:'ENABLED'}};},estimateContractExecutionFee:async()=>{counters.estimate++;counters.callback?.();counters.callback=undefined;return{data:{high:{gasLimit:'21000',baseFee:'1',priorityFee:'1',maxFee:'2'}}};},createUserTransactionContractExecutionChallenge:async()=>{counters.challenge++;counters.callback?.();counters.callback=undefined;return{data:{challengeId:'fixture-challenge'}};}};
 const circle={userId:'actor',proof,userToken:providerToken,walletId:'fixture-wallet',contractAddress:config.hubAddress,callData:calldata,intent:{type:'RESOLVE_DISPUTE' as const,campaignId:'1',orderId:'1',buyerShare:'40',sellerShare:'60'},operationId:'circle:'+operation.id};return{wallet,token,proof,enrollment,input,intent,operation,counters,circle};
}
async function check(name:string,enrolled:boolean,work:(f:Awaited<ReturnType<typeof setup>>)=>unknown){if(selectedCase&&selectedCase!==name)return;current=name;const f=await setup(enrolled);await work(f);cases++;console.log('PASS resolve operator: '+name);}
const denied=(e:unknown)=>e instanceof Error&&/^OPERATOR_ACCESS_/.test(e.message)&&(e as any).status===403;
async function noWrite(work:()=>unknown){const before=store.snapshot();await assert.rejects(async()=>work(),denied);assert.deepEqual(store.snapshot(),before);}
async function server(){const app=express();app.use(express.json());app.use('/operations',operationRouter);app.use('/auth',authRouter);app.use('/circle',circleRouter);const listener=await new Promise<import('http').Server>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});return{base:'http://127.0.0.1:'+(listener.address() as any).port,close:()=>new Promise<void>(r=>listener.close(()=>r()))};}
async function post(base:string,path:string,token:string,body:unknown){return fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}
async function main(){
 if(!selectedCase){const {localCheckEnvironment}=require('../../scripts/local_check_runtime.cjs'),names=[...fs.readFileSync(__filename,'utf8').matchAll(/await check\('([^']+)'/g)].map(m=>m[1]);store.close();parentClosed=true;for(const name of names){const r=spawnSync(process.execPath,[...process.execArgv,__filename,'--case='+name],{cwd:process.cwd(),env:localCheckEnvironment(path.resolve(__dirname,'../..')),encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:2*1024*1024});if(r.status!==0||r.signal||r.error){process.stdout.write((r.stdout??'')+(r.stderr??''));throw Error('Isolated resolve case failed: '+name);}assert.ok((r.stdout??'').includes('PASS 1 resolve operator cases'));cases++;console.log('PASS resolve operator: '+name);}console.log('PASS '+cases+' resolve operator cases; fresh isolated process per case, no signer ledger reset.');return;}

 await check('role-only proof cannot prepare, reserve, submit, verify, replace, complete or resolve metadata',false,async f=>{
  for(const work of [()=>OperationPreparationService.direct({...f.input,idempotencyKey:'resolve:second'},f.proof),()=>OperationPreparationService.order('actor','order',f.intent,'resolve:second',f.proof),()=>OperationReadinessService.ready('actor',f.operation.id,f.proof),()=>OperationTrackingService.submit('actor',f.operation.id,ethers.id('fixture-hash'),f.proof),()=>OperationVerificationService.verify('actor',f.operation.id,f.proof),()=>OperationReplacementService.observe('actor',f.operation.id,ethers.id('fixture-hash'),undefined,f.proof),()=>OperationCompletionService.owned('actor',f.operation.id,f.proof),()=>DisputeMetadataService.context(f.proof,'actor','order','RESOLVE')])await noWrite(work);assert.equal(f.counters.rpc,0);assert.ok(store.db.users.actor.roles.includes('operator'));
 });
 await check('read-only own operation history remains available without an operator grant',false,f=>{assert.equal(OperationTrackingService.owned('actor',f.operation.id,f.proof).action,'RESOLVE');assert.ok(!JSON.stringify(OperationTrackingService.owned('actor',f.operation.id,f.proof)).includes('Private fixture'));});
 await check('role-only Circle RESOLVE and operator step-up are denied before provider or challenge writes',false,async f=>{
  store.transaction(()=>{const wallet=f.wallet.address.toLowerCase();store.db.walletChallenges['actor:OPERATOR_ACTION:'+wallet]={userId:'actor',action:'OPERATOR_ACTION',walletAddress:wallet,message:'fixture',expiresAt:Math.floor(Date.now()/1000)+300,nonce:'ab'.repeat(16),chainId:config.arcChainId,origin:'groupdeal.app'};});
  for(const work of [()=>CircleWalletService.validateTransactionPolicy(config.hubAddress,f.circle.callData,f.circle.intent,'actor',f.proof),()=>CircleWalletService.estimateContractFee(f.circle),()=>CircleWalletService.createContractChallenge(f.circle),()=>AuthService.issueWalletChallenge('actor','OPERATOR_ACTION',f.wallet.address,undefined,undefined,f.proof),()=>AuthService.verifyStepUpSignature('actor','OPERATOR_ACTION',f.wallet.address,'0x'+'00'.repeat(65),'fixture',f.proof)])await noWrite(work);assert.deepEqual([f.counters.identity,f.counters.estimate,f.counters.challenge],[0,0,0]);
 });
 await check('enrolled controller reaches prepare/ready/submit and signs a committed step-up challenge',true,async f=>{
  store.transaction(()=>{delete store.db.operations[f.operation.id];});const prepared=await OperationPreparationService.order('actor','order',f.intent,'resolve:actual',f.proof);assert.equal(prepared.action,'RESOLVE');assert.equal(prepared.orderQuote!.buyerShare,'40');const ready=await OperationReadinessService.ready('actor',prepared.id,f.proof);assert.equal(ready.operation.phase,'AWAITING_SIGNATURE');assert.equal(OperationTrackingService.submit('actor',prepared.id,ethers.id('fixture-broadcast-hash'),f.proof).phase,'SUBMITTED');
  const challenge=AuthService.issueWalletChallenge('actor','OPERATOR_ACTION',f.wallet.address,undefined,undefined,f.proof);AuthService.verifyStepUpSignature('actor','OPERATOR_ACTION',f.wallet.address,await f.wallet.signMessage(challenge.challengeMessage),challenge.challengeMessage,f.proof);assert.equal(store.db.orders.order.privateExtension,'preserve-financial-entitlement');
 });
 await check('certificate replacement during quote cannot reserve an operation or emit operator metadata',true,async f=>{
  store.transaction(()=>{delete store.db.operations[f.operation.id];});f.counters.callback=()=>store.transaction(()=>{store.db.users.actor.operatorEnrollment!.signatureEncrypted+='changed';});await assert.rejects(OperationPreparationService.order('actor','order',f.intent,'resolve:race',f.proof),e=>e instanceof Error&&e.message==='OPERATOR_ACCESS_CHANGED');assert.equal(Object.keys(store.db.operations).length,0);assert.equal(store.db.orders.order.disputeResolution,undefined);
 });
 await check('Circle fee/challenge callbacks recheck current enrollment and retain unknown provider evidence',true,async f=>{
  store.transaction(()=>{store.db.operations[f.operation.id].phase='AWAITING_SIGNATURE';});assert.ok((await CircleWalletService.estimateContractFee(f.circle)).high);f.counters.callback=()=>store.transaction(()=>{store.db.users.actor.operatorEnrollment!.signatureEncrypted+='changed';});await assert.rejects(CircleWalletService.createContractChallenge(f.circle),e=>e instanceof Error&&e.message==='OPERATOR_ACCESS_CHANGED');assert.equal(f.counters.challenge,1);const receipt=store.db.circleOperations[f.circle.operationId];assert.equal(receipt.state,'REQUESTED');assert.equal(receipt.challengeId,undefined);
 });
 await check('HTTP financial entrypoints reject legacy role and forged request privilege',false,async f=>{
  const http=await server();try{const cases:[string,unknown][]=[['/operations/orders/prepare',{orderId:'order',idempotencyKey:'resolve:http',intent:f.intent}],['/operations/'+f.operation.id+'/ready',{}],['/operations/'+f.operation.id+'/submit',{txHash:ethers.id('fixture-http-hash')}],['/operations/'+f.operation.id+'/observe',{txHash:ethers.id('fixture-http-hash')}],['/operations/'+f.operation.id+'/recover',{}],['/auth/wallet/challenge',{action:'OPERATOR_ACTION',walletAddress:f.wallet.address}],['/circle/transactions/estimate',{userToken:providerToken,walletId:'fixture-wallet',contractAddress:config.hubAddress,callData:f.circle.callData,intent:f.circle.intent}]];for(const [path,body]of cases){const r=await post(http.base,path,f.token,body);assert.equal(r.status,403,path);assert.ok((r.headers.get('cache-control')??'').includes('no-store'));assert.ok(!(await r.text()).includes('Private fixture'));}assert.equal(f.counters.rpc+f.counters.identity+f.counters.estimate+f.counters.challenge,0);}finally{await http.close();}
 });
 await check('fresh HTTP authority prevents revoked enrollment from signing a stored RESOLVE intent',true,async f=>{
  const http=await server();try{f.enrollment!.truth.callback=()=>store.transaction(()=>{store.db.authSessions[f.proof.key].state='REVOKED';});const r=await post(http.base,'/operations/'+f.operation.id+'/ready',f.token,{});assert.equal(r.status,401);assert.equal(store.db.operations[f.operation.id].phase,'PREPARED');assert.equal(f.counters.rpc,0);}finally{await http.close();}
 });
 console.log('PASS '+cases+' resolve operator cases; isolated generated controller, local RPC/SDK fixtures and HTTP only; no financial broadcast/native principal.');
}
main().catch(e=>{console.error('FAIL resolve operator: '+current);console.error(e);process.exitCode=1;}).finally(()=>{(CircleWalletService as any).client=originalClient;OrderActionService.setProvider(undefined);if(!parentClosed)store.close();});
