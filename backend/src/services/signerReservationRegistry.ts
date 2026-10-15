import {TransactionalStore} from '../db/store';
import {SessionRegistry,type SessionProof} from './sessionService';
import {readServerBridgeRpc} from './bridgeReadRpc';
import {SignerReservationError,prepareSignerAcquisition,prepareSignerRelease,type SignerPurpose,type SignerState} from '../domain/signerReservation';
import type {ServerBridgeRead} from '../domain/bridgeReceipt';
/** Internal foundation. A reservation records exclusivity; it is not a signing or dispatch permit. Ready integration must consume it atomically with each owner. */
export class SignerReservationRegistry {
 private readonly sessions:SessionRegistry;
 constructor(private readonly database:TransactionalStore){this.sessions=new SessionRegistry(database)}
 private selection(proof:SessionProof,reference:{purpose:SignerPurpose;chainId:number;principal:string}){return{actorId:proof.account.id,sessionKey:proof.key,...reference}}
 private authority(proof:SessionProof,state:Parameters<Parameters<TransactionalStore['mutateSignerReservation']>[1]>[0]){
  const account=this.sessions.assertCommitted(proof,state.auth),owner=state.signer.target;if(!owner||owner.accountId!==account.id)throw new SignerReservationError('SIGNER_OWNER_FORBIDDEN',403);if((owner.hub||owner.call)&&owner.principal!==account.activeWallet?.toLowerCase()||owner.wallet&&owner.wallet.authRecoveryContext!==proof.claims.authRecoveryContext||owner.bridge&&(owner.bridge.scope.recipient!==account.activeWallet?.toLowerCase()||owner.bridge.authRecoveryContext!==proof.claims.authRecoveryContext))throw new SignerReservationError('SIGNER_OWNER_FORBIDDEN',403);return account;
 }
 private read(proof:SessionProof,reference:{purpose:SignerPurpose;chainId:number;principal:string}):SignerState {return this.database.mutateSignerReservation(this.selection(proof,reference),state=>{this.authority(proof,state);return{result:state.signer}})}
 async acquire(proof:SessionProof,reference:{purpose:SignerPurpose;chainId:number;principal:string},read:ServerBridgeRead=readServerBridgeRpc){const state=this.read(proof,reference),plan=await prepareSignerAcquisition(state,proof.claims.authRecoveryContext,read);return this.database.mutateSignerReservation(this.selection(proof,reference),current=>{this.authority(proof,current);return{result:{record:structuredClone(plan.record),reservedNew:plan.reservedNew},plan}})}
 async release(proof:SessionProof,reference:{purpose:SignerPurpose;chainId:number;principal:string},id:string,read:ServerBridgeRead=readServerBridgeRpc){const state=this.read(proof,reference),entry=state.entries.find(e=>e.record.id===id);if(!entry||entry.record.accountId!==proof.account.id||entry.record.authRecoveryContext!==proof.claims.authRecoveryContext)throw new SignerReservationError('SIGNER_RESERVATION_NOT_FOUND',404);const plan=await prepareSignerRelease(state,id,read);return this.database.mutateSignerReservation(this.selection(proof,reference),current=>{this.authority(proof,current);return{result:structuredClone(plan.record),plan}})}
}
