import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {initiateUserControlledWalletsClient} from '@circle-fin/user-controlled-wallets';
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
 create(userToken:string,scope:WalletCircleScope,call:WalletCall,fee:WalletFeeBudget,requestId:string,refId:string):Promise<string>;
 challenge(userToken:string,id:string):Promise<ReturnType<typeof circleProviderStatusChallenge>>;
 transaction(userToken:string,id:string):Promise<unknown>;
}
const bounded=async<T>(work:()=>Promise<T>):Promise<T>=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([Promise.resolve().then(work),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new WalletFlowError('WALLET_CIRCLE_RESULT_UNKNOWN',503)),20000);})]);}finally{if(timer)clearTimeout(timer);}};
/** Existing user-controlled EOA only. Exact stored calldata and an absolute reviewed fee cap. */
export class WalletCircleProvider implements WalletCircleTransport{
 private readonly client=config.circleApiKey?initiateUserControlledWalletsClient({apiKey:config.circleApiKey,userAgent:'groupdeal/1.0'}):undefined;
 private required(){if(!this.client)throw new WalletFlowError('WALLET_CIRCLE_UNAVAILABLE',503);return this.client;}
 async verify(proof:SessionProof,userToken:string,scope:WalletCircleScope){const identity=await CircleWalletService.assertBoundIdentity(proof.account.id,userToken,proof);if(identity.circleUserId!==scope.circleUserId)throw new WalletFlowError('WALLET_CIRCLE_BINDING_CHANGED',403);const wallets=await CircleWalletService.listArcWallets(userToken),wallet=wallets.find(w=>w.walletId===scope.walletId&&w.address.toLowerCase()===scope.principal);if(!wallet)throw new WalletFlowError('WALLET_CIRCLE_EOA_REQUIRED',403);}
 async create(userToken:string,scope:WalletCircleScope,call:WalletCall,fee:WalletFeeBudget,requestId:string,refId:string){const response=await bounded(()=>this.required().createUserTransactionContractExecutionChallenge({userToken,walletId:scope.walletId,contractAddress:ethers.getAddress(call.to),callData:call.data as `0x${string}`,fee:{type:'gas',config:{gasLimit:fee.gasLimit,gasPrice:ethers.formatUnits(fee.maxFeePerGas,9)}},idempotencyKey:requestId,refId,xRequestId:crypto.randomUUID()}));return circleProviderChallengeId(response.data?.challengeId);}
 async challenge(userToken:string,id:string){const response=await bounded(()=>this.required().getUserChallenge({userToken,challengeId:id,xRequestId:crypto.randomUUID()}));return circleProviderStatusChallenge(response.data?.challenge,id);}
 async transaction(userToken:string,id:string){const response=await bounded(()=>this.required().getTransaction({userToken,id,xRequestId:crypto.randomUUID()}));return response.data?.transaction;}
}
