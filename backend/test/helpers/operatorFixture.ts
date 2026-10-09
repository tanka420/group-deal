import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {config} from '../../src/config';
import {store} from '../../src/db/store';
import type {SessionProof} from '../../src/services/sessionService';
import type {OperatorEnrollmentService as EnrollmentService} from '../../src/services/operatorEnrollment';
import type {OperatorAuthority} from '../../src/domain/operatorEnrollment';
/** Generated controller and local authority only. Uses the real challenge/signature/commit path. */
export async function enrollFixtureOperator(accountId:string,proof?:SessionProof,options:{wallet?:ethers.HDNodeWallet;chainId?:number;runtime?:'SOURCE'|'EMITTED'}={}){
 assert.equal(process.env.NODE_ENV,'test');const runtime=options.runtime??'SOURCE';assert.ok(['SOURCE','EMITTED'].includes(runtime));
 const base=runtime==='EMITTED'?'../../dist':'../../src',{config}=require(base+'/config'),{store}=require(base+'/db/store'),{SessionService}=require(base+'/services/sessionService'),{OperatorEnrollmentService,operatorEnrollmentService}=require(base+'/services/operatorEnrollment');
 assert.ok(store.isIsolated&&store.storageDirectory.includes('local-check-temp'));
 const wallet=options.wallet??ethers.Wallet.createRandom(),chainId=options.chainId??31337;Object.assign(config,{arcChainId:chainId,deploymentBlock:1,protocolVersion:1,operatorAddress:wallet.address});
 store.transaction(()=>{const user=store.db.users[accountId];assert.ok(user);if(user.activeWallet&&store.db.userByWallet[user.activeWallet.toLowerCase()]===accountId)delete store.db.userByWallet[user.activeWallet.toLowerCase()];user.activeWallet=wallet.address;store.db.userByWallet[wallet.address.toLowerCase()]=accountId;});
 const current:SessionProof=proof??SessionService.authenticate(SessionService.issue(store.db.users[accountId]));
 const truth={calls:0,callback:undefined as (()=>void)|undefined,unavailable:false,authority:{chainId,hubAddress:config.hubAddress,protocolVersion:1,operatorAddress:wallet.address,authorizedSigner:new ethers.Wallet(config.authorizedSignerPrivateKey).address,ownerAddress:ethers.Wallet.createRandom().address,securityAuthority:ethers.Wallet.createRandom().address,bytecodeHash:ethers.keccak256('0x6000'),blockNumber:3,blockHash:ethers.id('mixed-operator-fixture'),observedAt:Date.now()} as OperatorAuthority};
 const authority=async()=>{truth.calls++;truth.callback?.();truth.callback=undefined;if(truth.unavailable)throw Error('Fixture authority unavailable');return {...truth.authority,observedAt:Date.now()};};
 const service:EnrollmentService=chainId===31337?new OperatorEnrollmentService({database:store,readAuthority:authority}):new OperatorEnrollmentService();if(chainId!==31337)(service as any).authority=authority;(operatorEnrollmentService as any).authority=authority;
 const origin='http://localhost:5173',ch=await service.issue(current,wallet.address,origin);await service.verify(current,{walletAddress:wallet.address,message:ch.challengeMessage,nonce:ch.nonce,signature:await wallet.signMessage(ch.challengeMessage)},origin);await service.authorize(current);
 const authorization=async()=>{await service.authorize(current);const {AuthService}=require(base+'/services/authService'),challenge=AuthService.issueWalletChallenge(accountId,'OPERATOR_ACTION',wallet.address,undefined,undefined,current);return{proof:current,stepUp:{walletAddress:wallet.address,signature:await wallet.signMessage(challenge.challengeMessage),challengeMessage:challenge.challengeMessage}};};
 return {wallet,proof:current,service,truth,authorization};
}
