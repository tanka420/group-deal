import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {initiateUserControlledWalletsClient,type FeeConfiguration,type FeeLevel} from '@circle-fin/user-controlled-wallets';
import {config} from '../config';
import type {SessionProof} from './sessionService';
import type {WalletFeeBudget} from '../domain/walletFlow';
import type {WalletCall} from '../domain/walletQuote';
import {WalletFlowError} from '../domain/walletQuote';
import {CircleWalletService} from './circleWalletService';
import {circleProviderChallengeId} from '../domain/circleChallenge';
import {circleProviderStatusChallenge} from '../domain/circleStatus';

export type WalletCircleScope={walletId:string;circleUserId:string;principal:string};
export interface WalletCircleTransport{
 verify(proof:SessionProof,userToken:string,scope:WalletCircleScope):Promise<void>;
 create(userToken:string,scope:WalletCircleScope,call:WalletCall,fee:WalletFeeBudget,requestId:string,refId:string,feeMode?:'EIP1559'):Promise<string>;
 challenge(userToken:string,id:string):Promise<ReturnType<typeof circleProviderStatusChallenge>>;
 transaction(userToken:string,id:string):Promise<unknown>;
 findTransaction?(userToken:string,scope:WalletCircleScope,refId:string):Promise<unknown|undefined>;
}
const bounded=async<T>(work:()=>Promise<T>):Promise<T>=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([Promise.resolve().then(work),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new WalletFlowError('WALLET_CIRCLE_RESULT_UNKNOWN',503)),20000);})]);}finally{if(timer)clearTimeout(timer);}};
/** Existing user-controlled EOA only. Exact stored calldata and an absolute reviewed fee cap. */
export class WalletCircleProvider implements WalletCircleTransport{
 private readonly client=config.circleApiKey?initiateUserControlledWalletsClient({apiKey:config.circleApiKey,baseUrl:config.circleBaseUrl,userAgent:'groupdeal/1.0'}):undefined;
 private required(){if(!this.client)throw new WalletFlowError('WALLET_CIRCLE_UNAVAILABLE',503);return this.client;}
 async verify(proof:SessionProof,userToken:string,scope:WalletCircleScope){try{const identity=await CircleWalletService.assertBoundIdentity(proof.account.id,userToken,proof);if(identity.circleUserId!==scope.circleUserId)throw new WalletFlowError('WALLET_CIRCLE_BINDING_CHANGED',403);const wallets=await CircleWalletService.listArcWallets(userToken),wallet=wallets.find(w=>w.walletId===scope.walletId&&w.address.toLowerCase()===scope.principal);if(!wallet)throw new WalletFlowError('WALLET_CIRCLE_EOA_REQUIRED',403);}catch(error){const e=error as {status?:unknown;response?:{status?:unknown}};if(e?.status===401||e?.response?.status===401)throw new WalletFlowError('WALLET_CIRCLE_REAUTH_REQUIRED',401);throw error;}}
 async create(userToken:string,scope:WalletCircleScope,call:WalletCall,fee:WalletFeeBudget,requestId:string,refId:string,feeMode?:'EIP1559'){
  const xRequestId=crypto.randomUUID();
  // A reserved legacy request must retain its original payload and idempotency key.
  // New requests use EIP-1559. The tip is bounded by the reviewed gas price
  // (half our 2x gas-price cap); total liability remains gasLimit * maxFee.
  const feeConfig:FeeConfiguration<FeeLevel>=feeMode==='EIP1559'?{type:'absolute',config:{gasLimit:fee.gasLimit,maxFee:ethers.formatUnits(fee.maxFeePerGas,9),priorityFee:ethers.formatUnits(BigInt(fee.maxFeePerGas)/2n,9)}}:{type:'gas',config:{gasLimit:fee.gasLimit,gasPrice:ethers.formatUnits(fee.maxFeePerGas,9)}};
  try{const response=await bounded(()=>this.required().createUserTransactionContractExecutionChallenge({userToken,walletId:scope.walletId,contractAddress:ethers.getAddress(call.to),callData:call.data as `0x${string}`,fee:feeConfig,idempotencyKey:requestId,refId,xRequestId}));return circleProviderChallengeId(response.data?.challengeId);}
  catch(error){
   const e=error as {status?:unknown;code?:unknown;response?:{status?:unknown;data?:{code?:unknown}}},status=e?.status??e?.response?.status,rawCode=e?.code??e?.response?.data?.code;
   const providerCode=typeof rawCode==='number'&&Number.isSafeInteger(rawCode)?String(rawCode):typeof rawCode==='string'&&/^[A-Z0-9_\-]{1,48}$/i.test(rawCode)?rawCode:undefined;
   // Never log the SDK error object: it can contain API keys and user tokens.
   console.warn(JSON.stringify({event:'WALLET_CIRCLE_CREATE_RESULT',requestId:xRequestId,stepId:refId,...(Number.isInteger(status)?{httpStatus:status}:{}),...(providerCode?{providerCode}:{}),outcome:status===400||status===422?'REJECTED':'UNKNOWN'}));
   if(status===401||status===403)throw new WalletFlowError('WALLET_CIRCLE_REAUTH_REQUIRED',401);
   if(status===400||status===422)throw new WalletFlowError('WALLET_CIRCLE_REQUEST_REJECTED',409);
   if(error instanceof WalletFlowError)throw error;
   throw new WalletFlowError('WALLET_CIRCLE_RESULT_UNKNOWN',503);
  }
 }
 async challenge(userToken:string,id:string){const response=await bounded(()=>this.required().getUserChallenge({userToken,challengeId:id,xRequestId:crypto.randomUUID()}));return circleProviderStatusChallenge(response.data?.challenge,id);}
 async transaction(userToken:string,id:string){const response=await bounded(()=>this.required().getTransaction({userToken,id,xRequestId:crypto.randomUUID()}));return response.data?.transaction;}
 async findTransaction(userToken:string,scope:WalletCircleScope,refId:string){
  const response=await bounded(()=>this.required().listTransactions({userToken,walletIds:[scope.walletId],blockchain:'ARC-TESTNET',pageSize:50,xRequestId:crypto.randomUUID()}));
  const rows=response.data?.transactions;if(!Array.isArray(rows))throw new WalletFlowError('WALLET_CIRCLE_RESULT_UNKNOWN',503);
  const matches=rows.filter(t=>t.refId===refId);if(matches.length>1)throw new WalletFlowError('WALLET_CIRCLE_RESULT_UNKNOWN',503);
  // No match in a bounded page is never proof that a request was not submitted.
  return matches[0];
 }
}
