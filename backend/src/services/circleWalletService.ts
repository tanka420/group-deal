import {circleFeeEstimate} from '../domain/circleTransactionPolicy';
import {circleStatusId,circleStatusBody,circleTransactionStatusBody,circleStatusReceipt,circleProviderStatusChallenge,circleProviderStatusTransaction,circleOperationBinding} from '../domain/circleStatus';
import {validateCirclePolicy,circlePolicyInput,circleTransactionInput,circleChallengeInput,type CircleTransactionIntent} from '../domain/circleTransactionPolicy';
export type {CircleTransactionIntent} from '../domain/circleTransactionPolicy';
import {SessionService,SessionError} from './sessionService';
import type {CircleTransactionState,CircleTransactionSelection} from '../db/rowPersistence';
import {circleChallengePayload,circleChallengeHash,circleChallengeReceipt,circleProviderChallengeId,circleChallengeRequestDigest,circleChallengeCompletionDigest,type CircleChallengeReceipt} from '../domain/circleChallenge';
import {circleBoundAccount} from '../domain/circleWalletAuthority';
import {AuthService} from './authService';
import type {SessionProof} from './sessionService';
import {circleWalletInput,circleWalletSelectInput,circleProviderWallets,sameCircleAuthority,type CircleWalletAuthority} from '../domain/circleWalletAuthority';
import {StorageConflict} from '../db/rowPersistence';
import {CircleAuthError,circleEmailInput,circleSessionInput,circleContext,circleAttempt,circleVerification,circleIdentityInput,type CircleVerification} from '../domain/circleAuthentication';
import {
  type AccountType,
  type Blockchain,
  type FeeLevel,
  type TestnetBlockchain,
  initiateUserControlledWalletsClient,
} from "@circle-fin/user-controlled-wallets";
import * as crypto from "crypto";
import { ethers } from "ethers";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { store } from "../db/store";
import { orderForChainId } from "./deploymentBindings";

// SDK 10.8.1 declares these enums in .d.ts but omits several runtime exports.
// Use API literals checked against SDK types, never declaration-only objects.
const ARC_BLOCKCHAIN = "ARC-TESTNET" satisfies Blockchain & TestnetBlockchain;
const MAX_APPROVAL_BASE_UNITS = BigInt(process.env.CIRCLE_MAX_APPROVAL_BASE_UNITS || "1000000000");

interface CircleIdentity {
  circleUserId: string;
  email: string | null;
}

function verifiedTokenEmail(token: string): string | null {
  // Call only AFTER Circle validates this exact token. Decoding is not validation.
  // An OTP request's email and a device-token subject are not authenticated user claims.
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string" || decoded.email_verified !== true) return null;
  return typeof decoded.email === "string" && decoded.email.includes("@")
    ? decoded.email.trim().toLowerCase() : null;
}

interface ArcWallet {
  walletId: string;
  address: string;
  blockchain: "ARC-TESTNET";
}

function stableUuid(input: string): string {
  const bytes = Buffer.from(crypto.createHash("sha256").update(input).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class CircleWalletService {
  private static client = config.circleApiKey
    ? initiateUserControlledWalletsClient({
        apiKey: config.circleApiKey,
        baseUrl: config.circleBaseUrl,
        userAgent: "groupdeal/1.0",
      })
    : null;

  public static isConfigured(): boolean {
    return Boolean(this.client);
  }

  private static requireClient() {
    if (!this.client) {
      throw new Error("Circle User-Controlled Wallets is not configured (missing CIRCLE_API_KEY)");
    }
    // Bound every provider request, including reads. Never automatically replay
    // timed-out writes: their outcome is unknown and needs reconciliation.
    const client = this.client;
    return new Proxy(client, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Circle không phản hồi trong 20 giây. Vui lòng thử lại.")), 20_000);
          Promise.resolve().then(() => value.apply(target, args)).then(resolve, reject)
            .finally(() => clearTimeout(timer));
        });
      },
    });
  }

  public static async requestArcTestnetTokens(address: string): Promise<void> {
    if (config.arcChainId !== 5042002) throw new Error("Faucet chỉ dùng cho Arc Testnet");
    await this.requireClient().requestTestnetTokens({
      address: ethers.getAddress(address), blockchain: ARC_BLOCKCHAIN,
      native: true, usdc: false, eurc: false,
    });
  }

  private static authFailure(e:unknown):never{if(e instanceof CircleAuthError||e instanceof SessionError)throw e;if(e instanceof StorageConflict||e instanceof Error&&e.message.startsWith('CONFLICT:'))throw new CircleAuthError('CIRCLE_AUTH_CONFLICT',409);throw new CircleAuthError('CIRCLE_AUTH_UNAVAILABLE',503)}
  private static readAuthentication(attemptId?:string){try{return store.readCircleAuthState({mode:attemptId?'CONSUME_ATTEMPT':'ISSUE_ATTEMPT',attemptId,rateKeys:[]})}catch(e){return this.authFailure(e)}}
  public static async requestEmailOtp(email:string,deviceId:string){
    const p=circleEmailInput.safeParse({email,deviceId});if(!p.success)throw new CircleAuthError('CIRCLE_AUTH_INVALID_INPUT');const initial=this.readAuthentication(),context=circleContext(initial.auth.authRecovery),createdAt=Date.now();
    const response=await this.requireClient().createDeviceTokenForEmailLogin({email:p.data.email,deviceId:p.data.deviceId,idempotencyKey:crypto.randomUUID(),xRequestId:crypto.randomUUID()});
    const data=response.data;if(!data||![data.deviceToken,data.otpToken,data.deviceEncryptionKey].every(v=>typeof v==='string'&&v.length>0&&v.length<=8192))throw new CircleAuthError('CIRCLE_AUTH_UNAVAILABLE',503);
    const id=crypto.randomUUID(),record={id,email:p.data.email,bindingVersion:2 as const,deviceIdHash:crypto.createHash('sha256').update(p.data.deviceId).digest('hex'),createdAt,expiresAt:createdAt+600000,...(context?{authRecoveryContext:context}:{})};
    try{return store.mutateCircleAuthentication({mode:'ISSUE_ATTEMPT',attemptId:id,rateKeys:[]},state=>{if(circleContext(state.auth.authRecovery)!==context)throw new CircleAuthError('CIRCLE_AUTH_ATTEMPT_INACTIVE',401);circleAttempt(record,state.auth.authRecovery);return{result:{deviceToken:data.deviceToken!,otpToken:data.otpToken!,deviceEncryptionKey:data.deviceEncryptionKey!,loginAttemptId:id},writes:[{collection:'circleLoginAttempts',key:id,value:record}]}})}catch(e){return this.authFailure(e)}
  }
  public static async verifyIdentity(userToken:string,loginAttemptId:string):Promise<CircleIdentity>;
  public static async verifyIdentity<T>(userToken:string,loginAttemptId:string,complete:(identity:CircleIdentity,verification:CircleVerification)=>T):Promise<T>;
  public static async verifyIdentity<T>(userToken:string,loginAttemptId:string,complete?:(identity:CircleIdentity,verification:CircleVerification)=>T):Promise<CircleIdentity|T>{
    const p=circleSessionInput.safeParse({userToken,loginAttemptId});if(!p.success)throw new CircleAuthError('CIRCLE_AUTH_INVALID_INPUT');const state=this.readAuthentication(p.data.loginAttemptId),attempt=circleAttempt(state.attempt,state.auth.authRecovery),verification=circleVerification(attempt);
    const response=await this.requireClient().getUserStatus({userToken:p.data.userToken,xRequestId:crypto.randomUUID()});if(response.data?.status!=='ENABLED')throw new CircleAuthError('CIRCLE_AUTH_IDENTITY_INACTIVE',401);
    const input=circleIdentityInput({email:verifiedTokenEmail(userToken),circleUserId:response.data?.id});if(input.email&&input.email!==attempt.email)throw new CircleAuthError('CIRCLE_AUTH_EMAIL_MISMATCH',403,'Circle user token does not match the requested email login');const current=this.readAuthentication(p.data.loginAttemptId);circleAttempt(current.attempt,current.auth.authRecovery,verification);
    const identity={circleUserId:input.circleUserId,email:input.email};if(complete){const result=complete(identity,verification);if(result&&typeof (result as any).then==='function')throw new CircleAuthError('CIRCLE_AUTH_UNAVAILABLE',503);return result}
    try{return store.mutateCircleAuthentication({mode:'CONSUME_ATTEMPT',attemptId:p.data.loginAttemptId,rateKeys:[]},s=>{const now=Date.now();circleAttempt(s.attempt,s.auth.authRecovery,verification,now);return{result:identity,writes:[],consumeAttemptAt:now}})}catch(e){return this.authFailure(e)}
  }

  private static async authenticatedWalletAuthority(userId:string,userToken:string,proof?:SessionProof){
    const p=circleWalletInput.safeParse({userToken});if(!p.success)throw new CircleAuthError('CIRCLE_WALLET_INVALID_INPUT');const initial=AuthService.circleWalletAuthority(userId,proof);
    const response=await this.requireClient().getUserStatus({userToken:p.data.userToken,xRequestId:crypto.randomUUID()}),current=AuthService.circleWalletAuthority(userId,proof);sameCircleAuthority(initial,current);
    if(response.data?.status!=='ENABLED'||response.data?.id!==current.circleUserId)throw new CircleAuthError('CIRCLE_WALLET_NOT_BOUND',403,'Circle session is not bound to this GroupDeal account');return current;
  }
  public static async assertBoundIdentity(userId:string,userToken:string,proof?:SessionProof):Promise<{circleUserId:string}>{const current=await this.authenticatedWalletAuthority(userId,userToken,proof);return{circleUserId:current.circleUserId}}
  public static async listArcWallets(userToken:string,authorize?:()=>CircleWalletAuthority):Promise<ArcWallet[]>{
    const p=circleWalletInput.safeParse({userToken});if(!p.success)throw new CircleAuthError('CIRCLE_WALLET_INVALID_INPUT');const initial=authorize?.(),response=await this.requireClient().listWallets({userToken:p.data.userToken,blockchain:ARC_BLOCKCHAIN,pageSize:100,xRequestId:crypto.randomUUID()}),current=authorize?.();if(initial&&current)sameCircleAuthority(initial,current);return circleProviderWallets(response.data?.wallets,current?.circleUserId);
  }
  private static chooseInventoryWallet(wallets:ArcWallet[],authority:CircleWalletAuthority){
    if(authority.wallet){const selected=wallets.find(w=>w.walletId===authority.wallet!.walletId&&w.address.toLowerCase()===authority.wallet!.address.toLowerCase());if(!selected)throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503);return selected}
    if(wallets.length!==1)throw new CircleAuthError('CIRCLE_WALLET_SELECTION_REQUIRED',409);return wallets[0];
  }
  public static async initializeArcWallet(userId:string,userToken:string,proof?:SessionProof){
    const initial=await this.authenticatedWalletAuthority(userId,userToken,proof),authorize=()=>{const current=AuthService.circleWalletAuthority(userId,proof);sameCircleAuthority(initial,current);return current},wallets=await this.listArcWallets(userToken,authorize);
    if(wallets.length>0)return{alreadyInitialized:true as const,wallet:this.chooseInventoryWallet(wallets,authorize())};if(initial.wallet)throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503);authorize();
    const idempotencyKey=stableUuid('arc-wallet-initialization:'+userId+':'+initial.circleUserId+':'+(initial.context??'normal'));
    const response=await this.requireClient().createUserPinWithWallets({userToken,blockchains:[ARC_BLOCKCHAIN],accountType:'EOA' satisfies AccountType,idempotencyKey,xRequestId:crypto.randomUUID()});authorize();const challengeId=response.data?.challengeId;
    try{circleIdentityInput({email:null,circleUserId:challengeId})}catch{throw new CircleAuthError('CIRCLE_WALLET_PROVIDER_RESULT_UNKNOWN',503)}return{alreadyInitialized:false as const,challengeId:challengeId!};
  }
  public static async syncArcWallets(userId:string,userToken:string,proof:SessionProof){
    const initial=await this.authenticatedWalletAuthority(userId,userToken,proof),authorize=()=>{const current=AuthService.circleWalletAuthority(userId,proof);sameCircleAuthority(initial,current);return current},wallets=await this.listArcWallets(userToken,authorize);if(!wallets.length)return{wallets};const current=authorize();if(!current.wallet&&wallets.length>1)return{userId,selectionRequired:true as const,wallets};const wallet=this.chooseInventoryWallet(wallets,current),user=AuthService.bindCircleWallet(userId,current.circleUserId,wallet,proof,current);return{wallets,user};
  }

  public static async selectInitialArcWallet(userId:string,raw:unknown,proof:SessionProof){
    if(!proof)throw new CircleAuthError('CIRCLE_WALLET_NOT_BOUND',403);
    const p=circleWalletSelectInput.safeParse(raw);if(!p.success)throw new CircleAuthError('CIRCLE_WALLET_INVALID_INPUT');const initial=await this.authenticatedWalletAuthority(userId,p.data.userToken,proof);if(initial.wallet&&initial.wallet.walletId!==p.data.walletId)throw new CircleAuthError('CIRCLE_WALLET_BINDING_REQUIRED',409);
    const authorize=()=>{const current=AuthService.circleWalletAuthority(userId,proof);sameCircleAuthority(initial,current);return current},wallets=await this.listArcWallets(p.data.userToken,authorize),current=authorize(),wallet=wallets.find(w=>w.walletId===p.data.walletId);if(!wallet)throw new CircleAuthError('CIRCLE_WALLET_UNAVAILABLE',503);const user=AuthService.bindCircleWallet(userId,current.circleUserId,wallet,proof,current);return{userId,wallet,user};
  }

  private static assertWalletOwnership(userId: string, walletId: string): void {
    const user = store.db.users[userId];
    if (!user?.circleWallet || user.circleWallet.walletId !== walletId) {
      throw new Error("Circle wallet is not bound to this GroupDeal account");
    }
    if (user.circleWallet.blockchain !== "ARC-TESTNET") {
      throw new Error("Only Arc Testnet Circle wallets are allowed");
    }
  }

  private static transactionSelection(userId:string,callData:string,intent:CircleTransactionIntent,proof?:SessionProof,circleOperationId?:string):CircleTransactionSelection{
    let chainOrderIds:string[]=[];if(intent.type==='CLAIM_BUYER'||intent.type==='CLAIM_SELLER')chainOrderIds=intent.orderIds;else if(['CONFIRM_RECEIPT','OPEN_DISPUTE','CLAIM_DELIVERY_BREACH','SETTLE_UNDISPUTED','RESOLVE_DISPUTE'].includes(intent.type))chainOrderIds=[(intent as {orderId:string}).orderId];return{actorId:userId,sessionKey:proof?.key,chainId:config.arcChainId,hubAddress:config.hubAddress,calldata:callData,...(intent.type==='CREATE_CAMPAIGN'?{draftId:intent.draftId}:{}),...(intent.type==='RECORD_DELIVERY'?{orderId:intent.orderId}:{}),chainOrderIds,...(circleOperationId?{circleOperationId}:{})};
  }
  private static readTransactionState(userId:string,callData:string,intent:CircleTransactionIntent,proof?:SessionProof,circleOperationId?:string){try{return store.readCircleTransactionState(this.transactionSelection(userId,callData,intent,proof,circleOperationId))}catch(e){return this.authFailure(e)}}
  private static transactionAuthority(input:{userId:string;walletId:string;contractAddress:string;callData:string;intent:CircleTransactionIntent;proof?:SessionProof},selected?:CircleTransactionState){
    if(config.arcChainId!==5042002)throw new CircleAuthError('CIRCLE_TRANSACTION_UNAVAILABLE',503);const p=circlePolicyInput.safeParse({contractAddress:input.contractAddress,callData:input.callData,intent:input.intent});if(!p.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');const state=selected??this.readTransactionState(input.userId,p.data.callData,p.data.intent,input.proof),context=circleContext(state.auth.authRecovery);
    if(input.proof){if(input.proof.account.id!==input.userId)throw new CircleAuthError('CIRCLE_TRANSACTION_FORBIDDEN',403);SessionService.assertCommitted(input.proof,state.auth)}else if(context!==undefined)throw new CircleAuthError('CIRCLE_TRANSACTION_FRESH_SESSION_REQUIRED',401);
    if(p.data.intent.type==='RESOLVE_DISPUTE')SessionService.assertOperatorCommitted(input.proof,state.auth);
    const user=state.auth.user,authority=circleBoundAccount(user,input.userId,state.circleOwner,state.auth.authRecovery);if(!user?.circleWallet||user.circleWallet.walletId!==input.walletId||state.walletOwner!==user.id||user.activeWallet?.toLowerCase()!==user.circleWallet.address.toLowerCase())throw new CircleAuthError('CIRCLE_TRANSACTION_WALLET_NOT_SELECTED',403);
    validateCirclePolicy(p.data.contractAddress,p.data.callData,p.data.intent,input.userId,state.graph);return{...authority,policy:crypto.createHash('sha256').update(JSON.stringify(state.graph)).digest('hex')};
  }
  private static sameTransactionAuthority(initial:ReturnType<typeof CircleWalletService.transactionAuthority>,current:ReturnType<typeof CircleWalletService.transactionAuthority>){sameCircleAuthority(initial,current);if(initial.policy!==current.policy)throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409)}
  public static validateTransactionPolicy(contractAddress:string,callData:string,intent:CircleTransactionIntent,userId?:string,proof?:SessionProof){const state=userId?this.readTransactionState(userId,callData,intent,proof):undefined;if(intent.type==='RESOLVE_DISPUTE'){if(!state)throw new SessionError('OPERATOR_ACCESS_REQUIRED',403);SessionService.assertOperatorCommitted(proof,state.auth)}return validateCirclePolicy(contractAddress,callData,intent,userId,state?.graph)}

  private static challengeFlights=new Map<string,Promise<{challengeId:string}>>();
  public static async createContractChallenge(raw:{userId:string;userToken:string;walletId:string;contractAddress:string;callData:string;intent:CircleTransactionIntent;operationId:string;proof?:SessionProof}){
    const p=circleChallengeInput.safeParse({userToken:raw.userToken,walletId:raw.walletId,contractAddress:raw.contractAddress,callData:raw.callData,intent:raw.intent,operationId:raw.operationId});if(!p.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');const input={...p.data,userId:raw.userId,proof:raw.proof},initial=this.transactionAuthority(input);await this.assertBoundIdentity(input.userId,input.userToken,input.proof);this.sameTransactionAuthority(initial,this.transactionAuthority(input));
    const selection=this.transactionSelection(input.userId,input.callData,input.intent,input.proof,input.operationId),authorize=(state:CircleTransactionState)=>{const current=this.transactionAuthority(input,state);this.sameTransactionAuthority(initial,current);if(['CONFIRM_RECEIPT','OPEN_DISPUTE','CLAIM_DELIVERY_BREACH','SETTLE_UNDISPUTED','RESOLVE_DISPUTE'].includes(input.intent.type)){const operation=Object.values(state.graph.operations).find(o=>['CONFIRM','DISPUTE','BREACH','SETTLE','RESOLVE'].includes(o.action)&&['AWAITING_SIGNATURE','SUBMITTED','UNKNOWN'].includes(o.phase));if(!operation||input.operationId!==`circle:${operation.id}`)throw new CircleAuthError('CIRCLE_TRANSACTION_INTENT_CONFLICT',409,'Circle operationId must match the reserved order action')}return current};
    let reserved:CircleChallengeReceipt;try{reserved=store.mutateCircleTransactionChallenge(selection,state=>{const authority=authorize(state);if(state.circleReceipt)return{result:circleChallengeReceipt(state.circleReceipt,input,authority,state.circleReceiptAudits)};const r:CircleChallengeReceipt={operationId:input.operationId,userId:input.userId,walletId:input.walletId,payloadHash:circleChallengePayload(input),idempotencyKey:stableUuid('groupdeal:'+input.operationId),createdAt:Date.now(),version:2,state:'REQUESTED',circleUserId:authority.circleUserId,walletAddress:authority.wallet!.address,chainId:5042002,contractAddress:ethers.getAddress(input.contractAddress),calldataHash:circleChallengeHash(input.callData.toLowerCase()),intentType:input.intent.type,authorityBase:authority.base,policyDigest:authority.policy,requestId:crypto.randomUUID(),...(authority.context?{authRecoveryContext:authority.context}:{})};return{result:r,record:r,audit:{action:'CIRCLE_TRANSACTION_CHALLENGE_REQUESTED',details:{operationId:r.operationId,requestId:r.requestId,payloadHash:r.payloadHash,receiptDigest:circleChallengeRequestDigest(r)}}}})}catch(e){return this.authFailure(e)}
    if(reserved.state==='READY')return{challengeId:reserved.challengeId!};
    const flightKey=JSON.stringify([reserved.operationId,reserved.requestId,reserved.payloadHash,reserved.authorityBase]),existingFlight=this.challengeFlights.get(flightKey);if(existingFlight){const result=await existingFlight;try{return store.mutateCircleTransactionChallenge(selection,state=>{const r=circleChallengeReceipt(state.circleReceipt,input,authorize(state),state.circleReceiptAudits);if(r.requestId!==reserved.requestId||r.state!=='READY'||r.challengeId!==result.challengeId)throw new CircleAuthError('CIRCLE_TRANSACTION_PROVIDER_RESULT_UNKNOWN',503);return{result:{challengeId:r.challengeId}}})}catch(e){return this.authFailure(e)}}
    const flight=Promise.resolve().then(async()=>{const beforeSend=this.readTransactionState(input.userId,input.callData,input.intent,input.proof,input.operationId),currentReceipt=circleChallengeReceipt(beforeSend.circleReceipt,input,authorize(beforeSend),beforeSend.circleReceiptAudits);if(currentReceipt.requestId!==reserved.requestId||currentReceipt.idempotencyKey!==reserved.idempotencyKey)throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409);if(currentReceipt.state==='READY')return{challengeId:currentReceipt.challengeId!};let challengeId:string;try{const response=await this.requireClient().createUserTransactionContractExecutionChallenge({userToken:input.userToken,walletId:input.walletId,contractAddress:ethers.getAddress(input.contractAddress),callData:input.callData as `0x${string}`,fee:{type:'level',config:{feeLevel:'MEDIUM' satisfies FeeLevel}},idempotencyKey:reserved.idempotencyKey,refId:input.operationId,xRequestId:crypto.randomUUID()});challengeId=circleProviderChallengeId(response.data?.challengeId)}catch{throw new CircleAuthError('CIRCLE_TRANSACTION_PROVIDER_RESULT_UNKNOWN',503)}
      try{return store.mutateCircleTransactionChallenge(selection,state=>{const current=circleChallengeReceipt(state.circleReceipt,input,authorize(state),state.circleReceiptAudits);if(current.requestId!==reserved.requestId||current.idempotencyKey!==reserved.idempotencyKey)throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409);if(current.state==='READY'){if(current.challengeId!==challengeId)throw new CircleAuthError('CIRCLE_TRANSACTION_PROVIDER_RESULT_UNKNOWN',503);return{result:{challengeId}}}const completed={...current,state:'READY' as const,challengeId,completedAt:Date.now()};return{result:{challengeId},patch:{state:'READY',challengeId,completedAt:completed.completedAt},audit:{action:'CIRCLE_TRANSACTION_CHALLENGE_CREATED',details:{operationId:current.operationId,requestId:current.requestId,payloadHash:current.payloadHash,target:current.contractAddress,intentType:current.intentType,challengeId,receiptDigest:circleChallengeCompletionDigest(completed)}}}})}catch(e){return this.authFailure(e)}
    });this.challengeFlights.set(flightKey,flight);try{return await flight}finally{if(this.challengeFlights.get(flightKey)===flight)this.challengeFlights.delete(flightKey)}
  }

  public static async estimateContractFee(input:{userId:string;userToken:string;walletId:string;contractAddress:string;callData:string;intent:CircleTransactionIntent;proof?:SessionProof}){
    const p=circleTransactionInput.safeParse({userToken:input.userToken,walletId:input.walletId,contractAddress:input.contractAddress,callData:input.callData,intent:input.intent});if(!p.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');const initial=this.transactionAuthority(input);await this.assertBoundIdentity(input.userId,input.userToken,input.proof);this.sameTransactionAuthority(initial,this.transactionAuthority(input));
    let fee:unknown;try{fee=(await this.requireClient().estimateContractExecutionFee({userToken:p.data.userToken,contractAddress:ethers.getAddress(p.data.contractAddress),callData:p.data.callData as `0x${string}`,source:{walletId:p.data.walletId},xRequestId:crypto.randomUUID()})).data}catch{throw new CircleAuthError('CIRCLE_TRANSACTION_FEE_UNAVAILABLE',503)}this.sameTransactionAuthority(initial,this.transactionAuthority(input));return circleFeeEstimate(fee);
  }

  private static statusAuthority(userId:string,proof:SessionProof|undefined,challengeId:string){
    if(!proof||proof.account.id!==userId)throw new CircleAuthError('CIRCLE_TRANSACTION_FRESH_SESSION_REQUIRED',401);
    if(config.arcChainId!==5042002)throw new CircleAuthError('CIRCLE_TRANSACTION_STATUS_UNAVAILABLE',503);
    let state:ReturnType<typeof store.readCircleStatusState>;try{state=store.readCircleStatusState(userId,proof.key,challengeId)}catch(e){return this.authFailure(e)}
    SessionService.assertCommitted(proof,state.auth);const user=state.auth.user,authority=circleBoundAccount(user,userId,state.circleOwner,state.auth.authRecovery);
    if(!authority.wallet||state.walletOwner!==userId||user?.activeWallet?.toLowerCase()!==authority.wallet.address.toLowerCase())throw new CircleAuthError('CIRCLE_TRANSACTION_WALLET_NOT_SELECTED',403);
    const receipt=circleStatusReceipt(state.circleReceipt,authority,state.circleReceiptAudits,challengeId);if(receipt.intentType==='RESOLVE_DISPUTE')SessionService.assertOperatorCommitted(proof,state.auth);return{authority,receipt};
  }
  private static sameStatusAuthority(initial:ReturnType<typeof CircleWalletService.statusAuthority>,current:ReturnType<typeof CircleWalletService.statusAuthority>){sameCircleAuthority(initial.authority,current.authority);if(circleChallengeCompletionDigest(initial.receipt)!==circleChallengeCompletionDigest(current.receipt))throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409)}
  private static async statusChallenge(userId:string,userToken:string,challengeId:string,proof:SessionProof|undefined,initial:ReturnType<typeof CircleWalletService.statusAuthority>){
    this.sameStatusAuthority(initial,this.statusAuthority(userId,proof,challengeId));let response:unknown;try{response=(await this.requireClient().getUserChallenge({userToken,challengeId,xRequestId:crypto.randomUUID()})).data?.challenge}catch{throw new CircleAuthError('CIRCLE_TRANSACTION_STATUS_UNAVAILABLE',503)}
    this.sameStatusAuthority(initial,this.statusAuthority(userId,proof,challengeId));return circleProviderStatusChallenge(response,challengeId);
  }
  public static async getChallenge(userId:string,userToken:string,challengeId:string,proof?:SessionProof){
    if(!circleStatusBody.safeParse({userToken}).success||!circleStatusId.safeParse(challengeId).success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');
    const initial=this.statusAuthority(userId,proof,challengeId);await this.assertBoundIdentity(userId,userToken,proof);this.sameStatusAuthority(initial,this.statusAuthority(userId,proof,challengeId));return this.statusChallenge(userId,userToken,challengeId,proof,initial);
  }
  public static async getTransaction(userId:string,userToken:string,transactionId:string,proof?:SessionProof,challengeId?:string){
    const p=circleTransactionStatusBody.safeParse({userToken,challengeId});if(!p.success||!circleStatusId.safeParse(transactionId).success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');
    const initial=this.statusAuthority(userId,proof,p.data.challengeId);await this.assertBoundIdentity(userId,userToken,proof);this.sameStatusAuthority(initial,this.statusAuthority(userId,proof,p.data.challengeId));
    const challenge=await this.statusChallenge(userId,userToken,p.data.challengeId,proof,initial);if(['FAILED','EXPIRED'].includes(challenge.status)||challenge.correlationIds?.length!==1||challenge.correlationIds[0]!==transactionId)throw new CircleAuthError('CIRCLE_TRANSACTION_NOT_CORRELATED',403);
    this.sameStatusAuthority(initial,this.statusAuthority(userId,proof,p.data.challengeId));let response:unknown;try{response=(await this.requireClient().getTransaction({userToken,id:transactionId,xRequestId:crypto.randomUUID()})).data?.transaction}catch{throw new CircleAuthError('CIRCLE_TRANSACTION_STATUS_UNAVAILABLE',503)}
    this.sameStatusAuthority(initial,this.statusAuthority(userId,proof,p.data.challengeId));return circleProviderStatusTransaction(response,transactionId,initial.receipt);
  }
  private static operationStatusAuthority(userId:string,operationId:string,proof:SessionProof|undefined){
    if(!proof||proof.account.id!==userId)throw new CircleAuthError('CIRCLE_TRANSACTION_FRESH_SESSION_REQUIRED',401);
    if(config.arcChainId!==5042002)throw new CircleAuthError('CIRCLE_TRANSACTION_STATUS_UNAVAILABLE',503);
    let state:ReturnType<typeof store.readCircleOperationStatusState>;try{state=store.readCircleOperationStatusState(userId,proof.key,operationId)}catch(e){return this.authFailure(e)}
    SessionService.assertCommitted(proof,state.auth);const authority=circleBoundAccount(state.auth.user,userId,state.circleOwner,state.auth.authRecovery);
    if(!authority.wallet||state.walletOwner!==userId||state.auth.user?.activeWallet?.toLowerCase()!==authority.wallet.address.toLowerCase())throw new CircleAuthError('CIRCLE_TRANSACTION_WALLET_NOT_SELECTED',403);
    if(!state.operation||!state.circleReceipt)throw new CircleAuthError('CIRCLE_TRANSACTION_NOT_FOUND',404);if(state.operation.action==='RESOLVE')SessionService.assertOperatorCommitted(proof,state.auth);
    const receipt=circleStatusReceipt(state.circleReceipt,authority,state.circleReceiptAudits,state.circleReceipt.challengeId),binding=circleOperationBinding(state.operation,operationId,authority,receipt,config.hubAddress);return{authority,receipt,binding};
  }
  private static sameOperationStatusAuthority(initial:ReturnType<typeof CircleWalletService.operationStatusAuthority>,current:ReturnType<typeof CircleWalletService.operationStatusAuthority>){
    sameCircleAuthority(initial.authority,current.authority);if(JSON.stringify(initial.binding)!==JSON.stringify(current.binding)||circleChallengeCompletionDigest(initial.receipt)!==circleChallengeCompletionDigest(current.receipt))throw new CircleAuthError('CIRCLE_TRANSACTION_AUTHORITY_CHANGED',409);
  }
  public static async getOperationStatus(userId:string,userToken:string,operationId:string,proof?:SessionProof){
    if(!circleStatusBody.safeParse({userToken}).success||!circleStatusId.safeParse(operationId).success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');
    const initial=this.operationStatusAuthority(userId,operationId,proof),assertCurrent=()=>this.sameOperationStatusAuthority(initial,this.operationStatusAuthority(userId,operationId,proof));
    await this.assertBoundIdentity(userId,userToken,proof);assertCurrent();let raw:unknown;try{raw=(await this.requireClient().getUserChallenge({userToken,challengeId:initial.receipt.challengeId!,xRequestId:crypto.randomUUID()})).data?.challenge}catch{throw new CircleAuthError('CIRCLE_TRANSACTION_STATUS_UNAVAILABLE',503)}assertCurrent();
    const challenge=circleProviderStatusChallenge(raw,initial.receipt.challengeId!),binding=initial.binding;
    if(['FAILED','EXPIRED'].includes(challenge.status)||!challenge.correlationIds?.length)return{...binding,challenge};
    const id=challenge.correlationIds[0];let value:unknown;try{value=(await this.requireClient().getTransaction({userToken,id,xRequestId:crypto.randomUUID()})).data?.transaction}catch{throw new CircleAuthError('CIRCLE_TRANSACTION_STATUS_UNAVAILABLE',503)}assertCurrent();
    return{...binding,challenge,transaction:circleProviderStatusTransaction(value,id,initial.receipt)};
  }

  public static async assertWalletBindingIdentity(userToken:string,authorize:()=>{userId:string;circleUserId:string;walletId:string;walletAddress:string;message:string}){
    if(!circleWalletInput.safeParse({userToken}).success)throw new Error('WALLET_BINDING_CIRCLE_UNAVAILABLE');
    const initial=authorize(),response=await this.requireClient().getUserStatus({userToken,xRequestId:crypto.randomUUID()}),current=authorize();
    if(initial.userId!==current.userId||initial.circleUserId!==current.circleUserId||initial.walletId!==current.walletId||initial.walletAddress!==current.walletAddress||initial.message!==current.message||response.data?.id!==current.circleUserId||response.data?.status!=='ENABLED')throw new Error('WALLET_BINDING_CIRCLE_UNAVAILABLE');return current;
  }

  /** Wallet/profile auth signing requires a current issued intent and the bound EOA. */
  public static async createWalletBindingSignatureChallenge(userId:string,userToken:string,walletId:string,message:string,authorize:()=>{userId:string;circleUserId:string;walletId:string;walletAddress:string;message:string}){
      if(typeof authorize!=='function')throw new Error('WALLET_BINDING_CIRCLE_UNAVAILABLE');
      const initial=await this.assertWalletBindingIdentity(userToken,authorize);if(initial.userId!==userId||initial.walletId!==walletId||initial.message!==message)throw new Error('WALLET_BINDING_CIRCLE_UNAVAILABLE');
      const walletResponse=await this.requireClient().getWallet({userToken,id:walletId}),wallet=walletResponse.data?.wallet,current=authorize();
      if(initial.userId!==current.userId||initial.circleUserId!==current.circleUserId||initial.walletId!==current.walletId||initial.walletAddress!==current.walletAddress||initial.message!==current.message||!wallet||wallet.id!==walletId||wallet.accountType!=='EOA'||wallet.blockchain!==ARC_BLOCKCHAIN||wallet.state!=='LIVE'||wallet.address.toLowerCase()!==current.walletAddress.toLowerCase())throw new Error('WALLET_BINDING_CIRCLE_UNAVAILABLE');
      const response=await this.requireClient().signMessage({userToken,walletId,message,encodedByHex:false,memo:'GroupDeal account wallet authorization',xRequestId:crypto.randomUUID()});authorize();if(!response.data?.challengeId)throw new Error('WALLET_BINDING_PROVIDER_RESULT_UNKNOWN');return response.data.challengeId;
  }
}
