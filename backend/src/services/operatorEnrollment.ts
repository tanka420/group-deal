import crypto from 'node:crypto';
import {grantOperatorCapability,revokeOperatorCapability} from '../domain/operatorCapability';
import {config} from '../config';
import {store,TransactionalStore,sanitizeUser} from '../db/store';
import {SessionRegistry,SessionError,type SessionProof} from './sessionService';
import {StorageConflict,LegacyWriterConflict} from '../db/rowPersistence';
import {WalletAuthError,walletAddress,walletAuthContext,walletAuthAdmission,type WalletAuthBudget} from '../domain/walletAuthentication';
import {encryptEntitlement,decryptEntitlement} from '../utils/crypto';
import {readCurrentOperatorAuthority} from './operatorAuthority';
import {OperatorEnrollmentError,assertOperatorAuthority,sameOperatorAuthority,parseOperatorAuthority,operatorEnrollmentMessage,assertOperatorEnrollmentSignature,assertOperatorEnrollmentAccount,operatorEnrollmentDigest,readOperatorEnrollmentRecord,type OperatorAuthority,type OperatorEnrollmentChallenge,type OperatorEnrollmentRecord} from '../domain/operatorEnrollment';
export class OperatorEnrollmentService{
 private readonly database:TransactionalStore;private readonly sessions:SessionRegistry;private readonly authority:(previous?:OperatorAuthority)=>Promise<OperatorAuthority>;
 constructor(fixture?:{database:TransactionalStore;readAuthority:(previous?:OperatorAuthority)=>Promise<OperatorAuthority>}){
  if(fixture&&(process.env.NODE_ENV!=='test'||config.arcChainId!==31337||!fixture.database.isIsolated))throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_FIXTURE_DISABLED',503);
  this.database=fixture?.database??store;this.sessions=new SessionRegistry(this.database);this.authority=fixture?.readAuthority??readCurrentOperatorAuthority;
 }
 private key(id:string,nonce:string){return id+':OPERATOR_ENROLLMENT:'+nonce;}
 private scope(){return{chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,operatorAddress:config.operatorAddress};}
 private wallet(value:string){const wallet=walletAddress(value).toLowerCase();if(wallet!==config.operatorAddress.toLowerCase())throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_WALLET_MISMATCH',403);return wallet;}
 private proof(proof:SessionProof){if(!proof?.account?.id||typeof proof.key!=='string')throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_SESSION_REQUIRED',401);return proof;}
 private failure(error:unknown):never{if(error instanceof OperatorEnrollmentError||error instanceof SessionError||error instanceof WalletAuthError)throw error;if(error instanceof StorageConflict||error instanceof LegacyWriterConflict||error instanceof Error&&error.message.startsWith('CONFLICT:'))throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_CONFLICT',409);throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_UNAVAILABLE',503);}
 private actor(proof:SessionProof,wallet:string,key:string,budgets:WalletAuthBudget[]=[]){
  const result=this.database.mutateWalletAuth<{error:Error}|{user:ReturnType<SessionRegistry['assertCommitted']>;challenge:import('../db/store').WalletChallengeRecord|undefined;context:string|undefined}>({mode:'OPERATOR_STATUS',actorId:proof.account.id,sessionKey:proof.key,wallet,challengeKey:key,rateKeys:budgets.map(b=>b.key)},state=>{
   const user=this.sessions.assertCommitted(proof,state.auth);assertOperatorEnrollmentAccount(user,proof.account.id,wallet,state.boundUserId);
   const admission=walletAuthAdmission(budgets,state.rates);if(admission.error)return{result:{error:admission.error},writes:admission.writes};
   return{result:{user,challenge:state.challenge,context:walletAuthContext(state.auth.authRecovery)},writes:admission.writes};
  });if('error' in result)throw result.error;return result;
 }
 private budget(id:string,phase:'issue'|'verify'):WalletAuthBudget{return{key:'operator-enrollment-'+phase+':'+operatorEnrollmentDigest(id),limit:phase==='issue'?10:60,...(phase==='issue'?{minimumIntervalMs:2000}:{})};}
 private statusActor(proof:SessionProof,wallet:string){
  return this.database.mutateWalletAuth({mode:'OPERATOR_STATUS',actorId:proof.account.id,sessionKey:proof.key,wallet,challengeKey:this.key(proof.account.id,'status'),rateKeys:[]},s=>({result:{user:this.sessions.assertCommitted(proof,s.auth),boundUserId:s.boundUserId,enrollment:s.operatorEnrollment,auth:s.auth},writes:[]}));
 }
 private async observe(proof:SessionProof,required=false){
  try{
   this.proof(proof);const wallet=config.operatorAddress.toLowerCase(),initial=this.statusActor(proof,wallet);if(required&&(!initial.enrollment||!initial.user.roles.includes('operator')||initial.user.activeWallet?.toLowerCase()!==wallet||initial.boundUserId!==initial.user.id))throw new OperatorEnrollmentError('OPERATOR_ACCESS_REQUIRED',403);
   const authority=assertOperatorAuthority(await this.authority(),this.scope()),state=this.statusActor(proof,wallet),bound=state.user.activeWallet?.toLowerCase()===wallet&&state.boundUserId===state.user.id;
   let enrollment:OperatorEnrollmentRecord|undefined;if(state.enrollment!==undefined&&state.enrollment!==null)enrollment=readOperatorEnrollmentRecord(state.enrollment);
   let authorityMatches=false;
   if(enrollment){
    const c=JSON.parse(decryptEntitlement(enrollment.challengeEncrypted)),message=decryptEntitlement(enrollment.messageEncrypted),signature=decryptEntitlement(enrollment.signatureEncrypted);
    if(enrollment.accountId!==state.user.id||enrollment.nonceDigest!==operatorEnrollmentDigest(c.nonce)||enrollment.messageDigest!==operatorEnrollmentDigest(message)||enrollment.signatureDigest!==operatorEnrollmentDigest(signature)||enrollment.authContextSha256!==operatorEnrollmentDigest(c.authRecoveryContext??null))throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_RECORD_INVALID',503);
    assertOperatorEnrollmentSignature(c,{accountId:state.user.id,wallet:enrollment.walletAddress,nonce:c.nonce,origin:c.origin,context:c.authRecoveryContext,authority:enrollment.authority},message,signature,enrollment.verifiedAt);
    try{sameOperatorAuthority(enrollment.authority,authority);authorityMatches=true;}catch(error){if(!(error instanceof OperatorEnrollmentError)||error.code!=='OPERATOR_AUTHORITY_CHANGED')throw error;}
   }
   const enrolled=bound&&state.user.roles.includes('operator')&&!!enrollment&&enrollment.accountId===state.user.id&&enrollment.walletAddress.toLowerCase()===wallet&&authorityMatches;
   return{state,view:{accountId:state.user.id,status:enrolled?'ENROLLED':bound?'READY':'WALLET_MISMATCH',expectedWallet:authority.operatorAddress,activeWallet:state.user.activeWallet??null,chainId:authority.chainId,hubAddress:authority.hubAddress,authority,eligible:bound,operatorRolePresent:state.user.roles.includes('operator'),enrolled,enrollmentNonceDigest:enrolled?enrollment!.nonceDigest:null,controllerSignatureRequired:!enrolled}};
  }catch(error){return this.failure(error);}
 }
 public async status(proof:SessionProof){return(await this.observe(proof)).view;}
 public async authorize(proof:SessionProof){
  revokeOperatorCapability(proof);const {state,view}=await this.observe(proof,true);if(!view.enrolled)throw new OperatorEnrollmentError('OPERATOR_ACCESS_REQUIRED',403);grantOperatorCapability(proof,state.auth,view.authority,operatorEnrollmentDigest(state.enrollment));return view;
 }
 public async issue(proof:SessionProof,walletAddress:string,origin:string){
  try{
   this.proof(proof);const wallet=this.wallet(walletAddress),nonce=crypto.randomBytes(16).toString('hex'),key=this.key(proof.account.id,nonce);
   if(typeof origin!=='string'||!origin||origin.length>2000||/[\u0000-\u001f\u007f]/.test(origin))throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_ORIGIN_INVALID',403);
   this.actor(proof,wallet,key,[this.budget(proof.account.id,'issue')]);
   const authority=assertOperatorAuthority(await this.authority(),this.scope());
   return this.database.mutateWalletAuth({mode:'ISSUE_OPERATOR',actorId:proof.account.id,sessionKey:proof.key,wallet,challengeKey:key,rateKeys:[]},state=>{
    const user=this.sessions.assertCommitted(proof,state.auth);assertOperatorEnrollmentAccount(user,proof.account.id,wallet,state.boundUserId);
    const now=Math.floor(Date.now()/1000),context=walletAuthContext(state.auth.authRecovery),body={userId:user.id,action:'OPERATOR_ENROLLMENT' as const,walletAddress:wallet,expiresAt:now+300,nonce,chainId:config.arcChainId,origin,...(context?{authRecoveryContext:context}:{}),enrollmentAuthority:assertOperatorAuthority(authority,this.scope())},value:OperatorEnrollmentChallenge={...body,message:operatorEnrollmentMessage(body,now)};
    return{result:{challengeMessage:value.message,expiresAt:value.expiresAt,nonce,authority},writes:[{collection:'walletChallenges',key,value}],audit:[{actor:user.id,role:'user',action:'OPERATOR_ENROLLMENT_CHALLENGE_ISSUED',details:{wallet,chainId:authority.chainId,hubAddress:authority.hubAddress,blockNumber:authority.blockNumber,blockHash:authority.blockHash,nonceDigest:operatorEnrollmentDigest(nonce)}}]};
   });
  }catch(error){return this.failure(error);}
 }
 public async verify(proof:SessionProof,input:{walletAddress:string;signature:string;message:string;nonce:string},origin:string){
  try{
   this.proof(proof);const wallet=this.wallet(input.walletAddress);
   if(typeof input.nonce!=='string'||! /^[a-f0-9]{32}$/.test(input.nonce)||typeof input.message!=='string'||!input.message||input.message.length>4096)throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_INPUT_INVALID');
   const key=this.key(proof.account.id,input.nonce),initial=this.actor(proof,wallet,key,[this.budget(proof.account.id,'verify')]),before=initial.challenge?.enrollmentAuthority;
   if(!before)throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_CHALLENGE_INVALID');
   assertOperatorEnrollmentSignature(initial.challenge,{accountId:proof.account.id,wallet,nonce:input.nonce,origin,context:initial.context,authority:parseOperatorAuthority(before)},input.message,input.signature);
   const authority=assertOperatorAuthority(await this.authority(parseOperatorAuthority(before)),this.scope()),record:OperatorEnrollmentRecord={version:1,purpose:'ONCHAIN_OPERATOR_SELF_ENROLLMENT',role:'operator',accountId:proof.account.id,walletAddress:walletAddress(wallet),authority,nonceDigest:operatorEnrollmentDigest(input.nonce),messageDigest:operatorEnrollmentDigest(input.message),signatureDigest:operatorEnrollmentDigest(input.signature),signatureEncrypted:encryptEntitlement(input.signature),messageEncrypted:encryptEntitlement(input.message),challengeEncrypted:encryptEntitlement(JSON.stringify(initial.challenge)),authContextSha256:operatorEnrollmentDigest(initial.context??null),verifiedAt:Date.now()};
   return this.database.mutateWalletAuth({mode:'ENROLL_OPERATOR',actorId:proof.account.id,sessionKey:proof.key,wallet,challengeKey:key,rateKeys:[]},state=>{
    const user=this.sessions.assertCommitted(proof,state.auth);assertOperatorEnrollmentAccount(user,proof.account.id,wallet,state.boundUserId);
    const context=walletAuthContext(state.auth.authRecovery);assertOperatorEnrollmentSignature(state.challenge,{accountId:user.id,wallet,nonce:input.nonce,origin,context,authority:assertOperatorAuthority(authority,this.scope())},input.message,input.signature);
    if(record.authContextSha256!==operatorEnrollmentDigest(context??null))throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_SESSION_CHANGED',409);
    const roles=user.roles.includes('operator')?user.roles:[...user.roles,'operator' as const];
    return{result:{success:true,status:'ENROLLED',user:sanitizeUser({...user,roles}),authority,transactionSubmitted:false,financialPrincipalsChanged:false,heldWorkReleased:false},writes:[],consumeChallenge:true,operatorEnrollment:{record,signature:input.signature,message:input.message,origin,nonce:input.nonce},audit:[{actor:user.id,role:'operator',action:'OPERATOR_SELF_ENROLLED',details:{wallet,chainId:authority.chainId,hubAddress:authority.hubAddress,blockNumber:authority.blockNumber,blockHash:authority.blockHash,certificateDigest:operatorEnrollmentDigest(record),nonceDigest:record.nonceDigest}}]};
   });
  }catch(error){return this.failure(error);}
 }
}
export const operatorEnrollmentService=new OperatorEnrollmentService();
