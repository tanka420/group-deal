import {CircleBlockchain,ARC_CHAIN_ID} from '../../../shared/network.mjs';
import {circleWalletRecord,circleBoundAccount,sameCircleAuthority,faucetRate,type CircleWalletAuthority} from '../domain/circleWalletAuthority';
import {StorageConflict} from '../db/rowPersistence';
import type {CircleAuthWrite,CircleAuthPlan} from '../db/rowPersistence';
import {CircleAuthError,circleIdentityInput,circleContext,circleAttempt,circlePublicUser,circleRateKey,circleRate,type CircleRateScope,type CircleVerification} from '../domain/circleAuthentication';
import * as crypto from "crypto";
import {SessionService,SessionError} from "./sessionService";
import type {SessionProof} from './sessionService';
import { ethers } from "ethers";
import { store, UserRecord, WalletChallengeRecord,sanitizeUser, SanitizedUser } from "../db/store";
import { config } from "../config";
import { encryptEntitlement } from "../utils/crypto";
import {WalletAuthError,walletAddress as parseWallet,walletAuthMessage,walletAuthContext,assertWalletAuthChallenge,walletAuthAdmission,type WalletAuthBudget} from '../domain/walletAuthentication';
import type {WalletAuthWrite} from '../db/rowPersistence';

export class AuthService {
  /**
   * Create or refresh the local application session after Circle has verified
   * the email OTP and the backend has validated the Circle user token.
   * Circle tokens and encryption keys are deliberately never persisted.
   */
  public static consumeCircleRates(values:{scope:CircleRateScope;identifier:string}[]):void{
    const keys=values.map(v=>circleRateKey(v.scope,v.identifier));try{store.mutateCircleAuthentication({mode:'RATE',rateKeys:keys},state=>{const now=Date.now();circleContext(state.auth.authRecovery);return{result:undefined,writes:values.map((v,i)=>({collection:'rateLimits' as const,key:keys[i],value:circleRate(v.scope,state.rates[keys[i]],now)}))}})}catch(e){this.circleFailure(e)}
  }
  private static circleFailure(e:unknown):never{if(e instanceof CircleAuthError||e instanceof SessionError)throw e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))throw new CircleAuthError('CIRCLE_AUTH_CONFLICT',409);throw new CircleAuthError('CIRCLE_AUTH_UNAVAILABLE',503)}
  public static createCircleSession(email:string|null,circleUserId:string,circleWallet?:{walletId:string;address:string;blockchain:CircleBlockchain},verification?:CircleVerification):{token:string;user:SanitizedUser}{
    const input=circleIdentityInput({email,circleUserId,...(circleWallet?{circleWallet}:{})}),wallet=input.circleWallet?.address.toLowerCase();
    try{return store.mutateCircleAuthentication({mode:'LOGIN',circleUserId:input.circleUserId,email:input.email??undefined,wallet,attemptId:verification?.attemptId,rateKeys:[]},state=>{
      const now=Date.now(),context=circleContext(state.auth.authRecovery);let consumeAttemptAt:number|undefined;if(verification){const attempt=circleAttempt(state.attempt,state.auth.authRecovery,verification,now);if(input.email!==null&&attempt.email!==input.email)throw new CircleAuthError('CIRCLE_AUTH_EMAIL_MISMATCH',403,'Circle user token does not match the requested email login');consumeAttemptAt=now}else if(context!==undefined)throw new CircleAuthError('CIRCLE_AUTH_FRESH_LOGIN_REQUIRED',401);
      if(state.emailOwner&&state.emailOwner!==state.boundUserId)throw new CircleAuthError('CIRCLE_AUTH_IDENTITY_CONFLICT',409,'Circle identity is already bound to another GroupDeal account');
      const registration=state.boundUserId===undefined,writes:CircleAuthWrite[]=[],audit:NonNullable<CircleAuthPlan<unknown>['audit']>=[];let user:UserRecord,userPatch:CircleAuthPlan<unknown>['userPatch'],walletPatch:UserRecord['circleWallet'];
      if(registration){const id='usr_'+now+'_'+crypto.randomBytes(4).toString('hex');user={id,email:input.email??('circle-'+crypto.createHash('sha256').update(input.circleUserId).digest('hex')+'@circle.invalid'),emailVerified:input.email!==null,loginMethod:'CIRCLE_EMAIL',circleUserId:input.circleUserId,createdAt:now,roles:['buyer'],activeWallet:null};
        writes.push({collection:'users',key:id,value:user},{collection:'userByCircleId',key:input.circleUserId,value:id},{collection:'notificationPreferences',key:id,value:{inApp:true,email:false}});if(input.email)writes.push({collection:'userByEmail',key:input.email,value:id});audit.push({actor:id,role:'buyer',action:'CIRCLE_USER_REGISTERED',details:{circleUserId:input.circleUserId}});
      }else{if(!state.auth.user||state.auth.user.id!==state.boundUserId||state.auth.user.circleUserId!==input.circleUserId)throw new CircleAuthError('CIRCLE_AUTH_ACCOUNT_UNAVAILABLE',503);user=structuredClone(state.auth.user);circlePublicUser(user);
        if(input.email&&user.emailVerified!==false&&user.email!==input.email)throw new CircleAuthError('CIRCLE_AUTH_EMAIL_MISMATCH',403,'Circle email does not match the existing GroupDeal account');const patch:NonNullable<typeof userPatch>={};if(input.email&&(user.email!==input.email||user.emailVerified!==true)){patch.email=input.email;patch.emailVerified=true}if(user.loginMethod===undefined)patch.loginMethod='CIRCLE_EMAIL';if(Object.keys(patch).length){userPatch=patch;Object.assign(user,patch)}if(input.email&&!state.emailOwner)writes.push({collection:'userByEmail',key:input.email,value:user.id});
      }
      if(input.circleWallet){if(state.walletOwner&&state.walletOwner!==user.id)throw new CircleAuthError('CIRCLE_AUTH_IDENTITY_CONFLICT',409,'Circle wallet is already bound to another GroupDeal account');if(!state.walletOwner)writes.push({collection:'userByWallet',key:wallet!,value:user.id});if(user.activeWallet!==input.circleWallet.address){if(!registration)userPatch={...userPatch,activeWallet:input.circleWallet.address};user.activeWallet=input.circleWallet.address}if(!user.circleWallet||user.circleWallet.address!==input.circleWallet.address||user.circleWallet.walletId!==input.circleWallet.walletId||user.circleWallet.blockchain!==input.circleWallet.blockchain){if(!registration)walletPatch=input.circleWallet;user.circleWallet=input.circleWallet}}
      const publicUser=circlePublicUser(user),prepared=SessionService.prepareIssuedSession(user,state.auth.authRecovery,'CIRCLE_EMAIL');writes.push({collection:'authSessions',key:prepared.key,value:prepared.record});audit.push({actor:user.id,role:'user',action:'APP_SESSION_CREATED',details:{sessionId:prepared.record.id,loginMethod:'CIRCLE_EMAIL'}});
      return{result:{token:prepared.token,user:publicUser},writes,userId:registration?user.id:undefined,userPatch,circleWallet:walletPatch,consumeAttemptAt,audit};
    })}catch(e){return this.circleFailure(e)}
  }

  private static walletActor(state:import('../db/rowPersistence').CircleAuthState,userId:string,proof?:SessionProof){
    const context=circleContext(state.auth.authRecovery);if(proof){if(proof.account.id!==userId)throw new CircleAuthError('CIRCLE_WALLET_NOT_BOUND',403);return SessionService.assertCommitted(proof,state.auth)}if(context!==undefined)throw new CircleAuthError('CIRCLE_WALLET_FRESH_SESSION_REQUIRED',401);if(!state.auth.user||state.auth.user.id!==userId)throw new CircleAuthError('CIRCLE_WALLET_ACCOUNT_UNAVAILABLE',503);return state.auth.user;
  }
  public static circleWalletAuthority(userId:string,proof?:SessionProof):CircleWalletAuthority{
    try{const state=store.readCircleAuthState({mode:'BOUND',actorId:userId,sessionKey:proof?.key,rateKeys:[]}),user=this.walletActor(state,userId,proof);return circleBoundAccount(user,userId,state.boundUserId,state.auth.authRecovery)}catch(e){return this.circleFailure(e)}
  }
  /** Provider inventory may provision the first Circle EOA; explicit selections and existing bindings stay pinned. */
  public static bindCircleWallet(userId:string,circleUserId:string,input:{walletId:string;address:string;blockchain:CircleBlockchain},proof?:SessionProof,expected?:CircleWalletAuthority):SanitizedUser{
    const wallet=circleWalletRecord(input),key=wallet.address.toLowerCase();try{return store.mutateCircleAuthentication({mode:'BIND',actorId:userId,sessionKey:proof?.key,circleUserId,wallet:key,rateKeys:[]},state=>{
      const user=this.walletActor(state,userId,proof),authority=circleBoundAccount(user,userId,state.boundUserId,state.auth.authRecovery);if(authority.circleUserId!==circleUserId)throw new CircleAuthError('CIRCLE_WALLET_NOT_BOUND',403);if(expected)sameCircleAuthority(expected,authority);
      if(state.walletOwner&&state.walletOwner!==userId)throw new CircleAuthError('CIRCLE_WALLET_OWNER_CONFLICT',409);if(user.circleWallet&&(user.circleWallet.walletId!==wallet.walletId||user.circleWallet.address.toLowerCase()!==key))throw new CircleAuthError('CIRCLE_WALLET_BINDING_REQUIRED',409);
      const changed=!user.circleWallet||user.circleWallet.walletId!==wallet.walletId||user.circleWallet.address!==wallet.address||user.circleWallet.blockchain!==wallet.blockchain,newIndex=state.walletOwner===undefined,select=user.activeWallet===null,writes:CircleAuthWrite[]=newIndex?[{collection:'userByWallet',key,value:userId}]:[],result={...user,...(select?{activeWallet:wallet.address}:{}),circleWallet:wallet};
      return{result:circlePublicUser(result),writes,...(select?{userPatch:{activeWallet:wallet.address}}:{}),...(changed?{circleWallet:wallet}:{}),...((changed||newIndex||select)?{audit:[{actor:userId,role:'user' as const,action:'CIRCLE_WALLET_BOUND' as const,details:{walletId:wallet.walletId,address:wallet.address,selected:select}}]}:{})};
    })}catch(e){return this.circleFailure(e)}
  }
  public static assertFaucetAuthority(userId:string,address:string,proof:SessionProof){
    try{if(config.arcChainId!==5042002)throw new CircleAuthError('FAUCET_UNAVAILABLE',503);const wallet=ethers.getAddress(address).toLowerCase(),state=store.readCircleAuthState({mode:'FAUCET',actorId:userId,sessionKey:proof.key,wallet,rateKeys:[]}),user=this.walletActor(state,userId,proof);circlePublicUser(user);if(state.walletOwner!==userId||![user.activeWallet,user.circleWallet?.address].some(a=>typeof a==='string'&&a.toLowerCase()===wallet))throw new CircleAuthError('FAUCET_WALLET_NOT_OWNED',403);return user}catch(e){return this.circleFailure(e)}
  }
  public static reserveFaucet(userId:string,address:string,proof:SessionProof){
    const wallet=ethers.getAddress(address).toLowerCase(),key='arc-faucet:'+wallet;try{if(config.arcChainId!==5042002)throw new CircleAuthError('FAUCET_UNAVAILABLE',503);return store.mutateCircleAuthentication({mode:'FAUCET',actorId:userId,sessionKey:proof.key,wallet,rateKeys:[key]},state=>{const user=this.walletActor(state,userId,proof);circlePublicUser(user);if(state.walletOwner!==userId||![user.activeWallet,user.circleWallet?.address].some(a=>typeof a==='string'&&a.toLowerCase()===wallet))throw new CircleAuthError('FAUCET_WALLET_NOT_OWNED',403);return{result:undefined,writes:[{collection:'rateLimits',key,value:faucetRate(state.rates[key],Date.now())}],audit:[{actor:userId,role:'user',action:'ARC_FAUCET_REQUESTED',details:{recipient:ethers.getAddress(address),chainId:ARC_CHAIN_ID,asset:'NATIVE',confirmed:false}}]}})}catch(e){return this.circleFailure(e)}
  }
  /** Retired local OTP entrypoints remain callable only to return a finite denial.
   * Historical OTP rows are retained; Circle owns email verification. */
  public static requestOtp(_email: string): { success: boolean; message: string } {
    throw new SessionError("LEGACY_EMAIL_OTP_RETIRED",410);
  }

  public static verifyOtp(_email: string, _code: string): { token: string; user: SanitizedUser } {
    throw new SessionError("LEGACY_EMAIL_OTP_RETIRED",410);
  }

  /**
   * Issue a cryptographic, one-time, time-bound challenge to prevent signature replay (G1.1 & A11 mitigation).
   */
  public static issueWalletChallenge(
    userId: string,
    action: "LINK_WALLET" | "SELLER_PAYOUT" | "OPERATOR_ACTION",
    walletAddress: string,
    chainId?: number,
    origin?: string,
    proof?:SessionProof
  ): { challengeMessage: string; expiresAt: number; nonce: string } {
    if(action==='SELLER_PAYOUT')throw new WalletAuthError('SELLER_PROFILE_INTENT_REQUIRED',410);
    if(action==='LINK_WALLET'){
      const wallet=parseWallet(walletAddress),targetChainId=chainId??config.arcChainId,targetOrigin=origin??'groupdeal.app',nonce=crypto.randomBytes(16).toString('hex'),now=Math.floor(Date.now()/1000),expiresAt=now+300,key=userId+':LINK_WALLET:'+wallet.toLowerCase();
      if(targetChainId!==config.arcChainId||!targetOrigin||targetOrigin.length>2000||/[\u0000-\u001f\u007f]/.test(targetOrigin))throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');
      return store.mutateWalletAuth({mode:'ISSUE_LINK',actorId:userId,sessionKey:proof?.key,wallet:wallet.toLowerCase(),challengeKey:key,rateKeys:[]},state=>{
        const account=proof?SessionService.assertCommitted(proof,state.auth):state.auth.user,context=walletAuthContext(state.auth.authRecovery);
        if(!account||account.id!==userId||!Array.isArray(account.roles)||account.roles.some(r=>!['buyer','seller','operator'].includes(r))||!proof&&context!==undefined)throw new SessionError('AUTH_SESSION_INVALID');
        const value:WalletChallengeRecord={userId,action:'LINK_WALLET',walletAddress:wallet.toLowerCase(),message:'',expiresAt,nonce,chainId:targetChainId,origin:targetOrigin,...(context?{authRecoveryContext:context}:{})};value.message=walletAuthMessage(value,now);
        return{result:{challengeMessage:value.message,expiresAt,nonce},writes:[{collection:'walletChallenges',key,value}],audit:[{actor:userId,role:'user',action:'WALLET_AUTH_CHALLENGE_ISSUED',details:{action:'LINK_WALLET',wallet}}]};
      });
    }
    if(action!=='OPERATOR_ACTION')throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');
    const normalizedWallet = ethers.getAddress(walletAddress).toLowerCase();
    const nonce = crypto.randomBytes(16).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 300; // 5 minute validity window
    const targetChainId = chainId || config.arcChainId;
    const targetOrigin = origin || "groupdeal.app";

    const challengeMessage = [
      "=== GroupDeal Security Challenge ===",
      `Action: ${action}`,
      `User ID: ${userId}`,
      `Wallet: ${ethers.getAddress(walletAddress)}`,
      `Chain ID: ${targetChainId}`,
      `Origin: ${targetOrigin}`,
      `Nonce: ${nonce}`,
      `Timestamp: ${now}`,
      `Expires: ${expiresAt}`,
    ].join("\n");

    const key = `${userId}:${action}:${normalizedWallet}`;
    if(action==='OPERATOR_ACTION'){
      if(targetChainId!==config.arcChainId||!targetOrigin||targetOrigin.length>2000||/[\u0000-\u001f\u007f]/.test(targetOrigin)||normalizedWallet===ethers.ZeroAddress)throw Error('FORBIDDEN: operator challenge scope is invalid');
      const value:WalletChallengeRecord={userId,action,walletAddress:normalizedWallet,message:challengeMessage,expiresAt,nonce,chainId:targetChainId,origin:targetOrigin};
      return store.mutateProduct({actorId:userId,sessionKey:proof?.key,challengeKey:key},state=>{
        const account=SessionService.assertOperatorCommitted(proof,state.auth);
        if(!account||account.id!==userId||!Array.isArray(account.roles)||account.roles.some(r=>!['buyer','seller','operator'].includes(r))||!account.roles.includes('operator'))throw new SessionError('OPERATOR_ROLE_REQUIRED',403);
        if(account.activeWallet?.toLowerCase()!==normalizedWallet||normalizedWallet!==config.operatorAddress.toLowerCase())throw Error('FORBIDDEN: operator wallet is not actively bound');
        return{result:{challengeMessage,expiresAt,nonce},writes:[{kind:'OPERATOR_CHALLENGE',key,value}],audit:[{role:'operator',action:'OPERATOR_CHALLENGE_ISSUED',details:{wallet:normalizedWallet,action}}]};
      });
    }
    throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');
  }

  public static consumeWalletChallenge(
    userId: string,
    action: "LINK_WALLET" | "SELLER_PAYOUT",
    walletAddress: string,
    message: string
  ): void {
    if(!['LINK_WALLET','SELLER_PAYOUT'].includes(action))throw Error('FORBIDDEN: operator challenges require verified scoped consumption');
    if(action==='SELLER_PAYOUT')throw new WalletAuthError('SELLER_PROFILE_INTENT_REQUIRED',410);
    throw new WalletAuthError('WALLET_AUTH_VERIFIED_CONSUMPTION_REQUIRED',403);
  }

  /**
   * Issue a wallet-first login challenge without requiring an existing account.
   * The nonce is part of the storage key so a second requester cannot overwrite
   * another user's pending challenge for the same public address.
   */
  public static issueWalletLoginChallenge(walletAddress:string,origin='groupdeal.app',budgets:WalletAuthBudget[]=[],realm?:'ADMIN'):{challengeMessage:string;expiresAt:number;nonce:string}{
    const wallet=parseWallet(walletAddress),normalizedWallet=wallet.toLowerCase(),nonce=crypto.randomBytes(16).toString('hex'),now=Math.floor(Date.now()/1000),expiresAt=now+300,subject='wallet-login:'+normalizedWallet,key=subject+':WALLET_LOGIN:'+nonce;
    if(typeof origin!=='string'||!origin||origin.length>2000||/[\u0000-\u001f\u007f]/.test(origin))throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');
    const result=store.mutateWalletAuth<{challengeMessage:string;expiresAt:number;nonce:string}|{error:WalletAuthError}>({mode:'ISSUE_LOGIN',wallet:normalizedWallet,challengeKey:key,rateKeys:budgets.map(b=>b.key)},state=>{
      const admission=walletAuthAdmission(budgets,state.rates);if(admission.error)return{result:{error:admission.error},writes:admission.writes};
      const context=walletAuthContext(state.auth.authRecovery),value:WalletChallengeRecord={...(realm?{realm}:{}),userId:subject,action:'WALLET_LOGIN',walletAddress:normalizedWallet,message:'',expiresAt,nonce,chainId:config.arcChainId,origin,...(context?{authRecoveryContext:context}:{})};value.message=walletAuthMessage(value,now);
      return{result:{challengeMessage:value.message,expiresAt,nonce},writes:[...admission.writes,{collection:'walletChallenges',key,value}],audit:[{actor:subject,role:'user',action:'WALLET_AUTH_CHALLENGE_ISSUED',details:{action:'WALLET_LOGIN',wallet}}]};
    });if('error' in result)throw result.error;return result;
  }

  public static verifyWalletLogin(walletAddress:string,signature:string,message:string,nonce:string,budgets:WalletAuthBudget[]=[],realm?:'ADMIN'):{token:string;user:SanitizedUser}{
    const wallet=parseWallet(walletAddress),normalizedWallet=wallet.toLowerCase(),subject='wallet-login:'+normalizedWallet;
    if(typeof nonce!=='string'||! /^[a-f0-9]{32}$/.test(nonce)||typeof message!=='string'||message.length>4096||typeof signature!=='string')throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');
    const key=subject+':WALLET_LOGIN:'+nonce,result=store.mutateWalletAuth<{token:string;user:SanitizedUser}|{error:WalletAuthError}>({mode:'LOGIN',wallet:normalizedWallet,challengeKey:key,rateKeys:budgets.map(b=>b.key)},state=>{
      const admission=walletAuthAdmission(budgets,state.rates);if(admission.error)return{result:{error:admission.error},writes:admission.writes};
      try{assertWalletAuthChallenge(state.challenge,{realm,action:'WALLET_LOGIN',userId:subject,wallet,chainId:config.arcChainId,nonce,context:walletAuthContext(state.auth.authRecovery)},message,signature);}catch(e){if(e instanceof WalletAuthError&&e.status===400)return{result:{error:e},writes:admission.writes};throw e;}
      let user=state.auth.user;const isNew=state.boundUserId===undefined,writes:WalletAuthWrite[]=[...admission.writes];
      if(!isNew&&(!user||user.id!==state.boundUserId))throw new WalletAuthError('WALLET_ACCOUNT_BINDING_UNAVAILABLE',409);
      if(realm==='ADMIN'&&(isNew||!user||normalizedWallet!==config.operatorAddress.toLowerCase()||user.activeWallet?.toLowerCase()!==normalizedWallet))throw new WalletAuthError('ADMIN_WALLET_NOT_AUTHORIZED',403);
      if(isNew){if(state.emailOwner!==undefined)throw new WalletAuthError('WALLET_ACCOUNT_BINDING_UNAVAILABLE',409);const id='usr_wallet_'+crypto.randomUUID(),email='wallet+'+normalizedWallet.slice(2)+'@auth.groupdeal.invalid';user={id,email,loginMethod:'EVM_WALLET',createdAt:Date.now(),roles:['buyer'],activeWallet:wallet};writes.push({collection:'users',key:id,value:user},{collection:'userByEmail',key:email,value:id},{collection:'userByWallet',key:normalizedWallet,value:id},{collection:'notificationPreferences',key:id,value:{inApp:true,email:false}});
      }else user={...user!,activeWallet:wallet};
      const prepared=SessionService.prepareIssuedSession(user!,state.auth.authRecovery,'EVM_WALLET',realm);writes.push({collection:'authSessions',key:prepared.key,value:prepared.record});
      return{result:{token:prepared.token,user:sanitizeUser(user!)},userId:user!.id,writes,consumeChallenge:true,...(!isNew&&realm!=='ADMIN'?{activeWallet:wallet}:{}),audit:[{actor:user!.id,role:'buyer',action:isNew?'EVM_WALLET_USER_REGISTERED':'EVM_WALLET_LOGIN_VERIFIED',details:{wallet}},{actor:user!.id,role:'user',action:'APP_SESSION_CREATED',details:{sessionId:prepared.record.id,loginMethod:'EVM_WALLET'}}]};
    });if('error' in result)throw result.error;return result;
  }

  public static verifyStepUpSignature(
    userId: string,
    action: "OPERATOR_ACTION",
    walletAddress: string,
    signature: string,
    message: string,
    proof?:SessionProof
  ): void {
    if(action!=='OPERATOR_ACTION')throw Error('FORBIDDEN: operator action is unavailable');
    const wallet=ethers.getAddress(walletAddress).toLowerCase(),challengeKey=userId+':OPERATOR_ACTION:'+wallet;
    store.mutateOperatorStepUp({actorId:userId,sessionKey:proof?.key,challengeKey},state=>{
      const account=SessionService.assertOperatorCommitted(proof,state.auth);
      if(!proof&&state.auth.authRecovery!==undefined)throw Error('FORBIDDEN: committed operator session is required');
      this.assertCommittedStepUpSignature(account,state.challenge,walletAddress,signature,message);
      return{result:undefined};
    });
  }
  /** Pure verification for commands that consume the committed challenge in their own SQL transaction. */
  public static assertCommittedStepUpSignature(user:UserRecord|undefined,challenge:WalletChallengeRecord|undefined,walletAddress:string,signature:string,message:string):void {
    try{
      if(!user||!Array.isArray(user.roles)||user.roles.some(r=>!['buyer','seller','operator'].includes(r))||!user.roles.includes('operator')||typeof walletAddress!=='string'||typeof signature!=='string'||!/^0x[0-9a-fA-F]{128}(?:[0-9a-fA-F]{2})?$/.test(signature)||typeof message!=='string'||message.length>4096)throw Error();
      const wallet=ethers.getAddress(walletAddress),now=Math.floor(Date.now()/1000);
      if(wallet.toLowerCase()!==config.operatorAddress.toLowerCase()||user.activeWallet?.toLowerCase()!==wallet.toLowerCase()||!challenge||challenge.userId!==user.id||challenge.action!=='OPERATOR_ACTION'||challenge.walletAddress!==wallet.toLowerCase()||challenge.message!==message||!Number.isSafeInteger(challenge.expiresAt)||challenge.expiresAt<=now||challenge.chainId!==config.arcChainId||! /^[a-f0-9]{32}$/.test(challenge.nonce)||typeof challenge.origin!=='string'||!challenge.origin||challenge.origin.length>2000||/[\u0000-\u001f\u007f]/.test(challenge.origin))throw Error();
      const timestamp=Number(/\nTimestamp: (\d+)\nExpires:/.exec(message)?.[1]);
      const expected=['=== GroupDeal Security Challenge ===','Action: OPERATOR_ACTION',`User ID: ${user.id}`,`Wallet: ${wallet}`,`Chain ID: ${challenge.chainId}`,`Origin: ${challenge.origin}`,`Nonce: ${challenge.nonce}`,`Timestamp: ${timestamp}`,`Expires: ${challenge.expiresAt}`].join('\n');
      if(!Number.isSafeInteger(timestamp)||timestamp<0||timestamp>now+30||challenge.expiresAt!==timestamp+300||message!==expected||ethers.verifyMessage(message,signature).toLowerCase()!==wallet.toLowerCase())throw Error();
    }catch{throw Error('FORBIDDEN: committed operator step-up is unavailable');}
  }

  /**
   * Atomic binding of an external EVM wallet (MetaMask / injected).
   * Enforces that an external wallet can only be actively linked to ONE account at a time.
   */
  public static linkExternalWallet(userId:string,walletAddress:string,signature:string,message:string,proof?:SessionProof):SanitizedUser{
    const wallet=parseWallet(walletAddress),target=wallet.toLowerCase(),key=userId+':LINK_WALLET:'+target;
    if(typeof message!=='string'||message.length>4096||typeof signature!=='string')throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');
    return store.mutateWalletAuth({mode:'SELECT',actorId:userId,sessionKey:proof?.key,wallet:target,challengeKey:key,rateKeys:[]},state=>{
      const user=proof?SessionService.assertCommitted(proof,state.auth):state.auth.user,context=walletAuthContext(state.auth.authRecovery);
      if(!user||user.id!==userId||!Array.isArray(user.roles)||user.roles.some(r=>!['buyer','seller','operator'].includes(r))||!proof&&context!==undefined)throw new SessionError('AUTH_SESSION_INVALID');
      if(state.boundUserId!==userId)throw new WalletAuthError('WALLET_LINK_STEP_UP_REQUIRED',409);
      assertWalletAuthChallenge(state.challenge,{action:'LINK_WALLET',userId,wallet,chainId:config.arcChainId,context},message,signature);
      return{result:sanitizeUser({...user,activeWallet:wallet}),userId,activeWallet:wallet,consumeChallenge:true,writes:[],audit:[{actor:userId,role:'user',action:'WALLET_LINKED',details:{wallet}}]};
    });
  }

  /**
   * Register or update Seller Profile with proof of control of payout wallet
   */
  public static setupSellerProfile(
    userId: string,
    profileData: {
      displayName: string;
      bio: string;
      payoutWallet: string;
      proofSignature: string;
      challengeMessage: string;
    }
  ): SanitizedUser {
    // The legacy challenge did not bind profile fields or authorize an unlinked payout.
    // Retain a rejecting compatibility entry point so older callers cannot bypass intents.
    throw new Error("SELLER_PROFILE_INTENT_REQUIRED");
  }
}
