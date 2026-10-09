import {OperatorEnrollmentError,assertOperatorAuthority,operatorEnrollmentDigest,type OperatorAuthority} from './operatorEnrollment';
import {readAuthRecoveryBarrier} from './authRecovery';
import type {SessionProof} from '../services/sessionService';
import type {UserRecord,AuthSessionRecord} from '../db/store';
type AuthState={user?:UserRecord;sessions:Record<string,AuthSessionRecord>;authRecovery?:unknown};
export type OperatorFrame={accountId:string;wallet:string|null;boundUserId:string|null;certificateDigest:string|null};
const frameKey=Symbol.for('groupdeal.committed.operator.frame.v1');
const capabilities=new WeakMap<SessionProof,{accountId:string;sessionKey:string;sessionId:string;wallet:string;certificateDigest:string;contextDigest:string;authority:OperatorAuthority}>();
/** Snapshot metadata is private/non-enumerable and comes from the same committed SQL read. */
export function captureOperatorFrame(auth:AuthState,frame:OperatorFrame){Object.defineProperty(auth,frameKey,{value:Object.freeze({...frame}),enumerable:false,writable:false,configurable:false});}
const frame=(auth:AuthState)=>(auth as any)[frameKey] as OperatorFrame|undefined;
function matches(proof:SessionProof,auth:AuthState,cap:NonNullable<ReturnType<typeof capabilities.get>>,now:number){
 const u=auth.user,r=auth.sessions[proof.key],f=frame(auth),context=readAuthRecoveryBarrier(auth.authRecovery)?.context;
 return !!u&&u.id===cap.accountId&&proof.account.id===cap.accountId&&proof.key===cap.sessionKey&&proof.record.id===cap.sessionId&&Array.isArray(u.roles)&&u.roles.includes('operator')&&u.activeWallet?.toLowerCase()===cap.wallet&&!!f&&f.accountId===u.id&&f.wallet===cap.wallet&&f.boundUserId===u.id&&f.certificateDigest===cap.certificateDigest&&operatorEnrollmentDigest(context??null)===cap.contextDigest&&context===proof.claims.authRecoveryContext&&!!r&&r.id===cap.sessionId&&r.userId===u.id&&r.kind===proof.record.kind&&r.issuedAt===proof.claims.iat&&r.expiresAt===proof.claims.exp&&r.authRecoveryContext===context&&r.state==='ACTIVE'&&Number.isSafeInteger(r.lastActivityAt)&&r.lastActivityAt<=now+30000&&now<Math.min(r.expiresAt*1000,r.lastActivityAt+1800000)&&!(r.kind==='LEGACY'&&r.legacyEpoch!==(u.legacySessionEpoch??0));
}
/** Called only after the enrollment service validates encrypted controller proof and fresh Hub authority. */
export function grantOperatorCapability(proof:SessionProof,auth:AuthState,authority:OperatorAuthority,certificateDigest:string){
 const f=frame(auth),wallet=authority.operatorAddress.toLowerCase(),context=readAuthRecoveryBarrier(auth.authRecovery)?.context;
 if(!f||f.wallet!==wallet||f.boundUserId!==proof.account.id||f.certificateDigest!==certificateDigest||!/^[a-f0-9]{64}$/.test(certificateDigest))throw new OperatorEnrollmentError('OPERATOR_ACCESS_CHANGED',409);
 const cap={accountId:proof.account.id,sessionKey:proof.key,sessionId:proof.record.id,wallet,certificateDigest,contextDigest:operatorEnrollmentDigest(context??null),authority:Object.freeze({...authority})};
 if(!matches(proof,auth,cap,Date.now()))throw new OperatorEnrollmentError('OPERATOR_ACCESS_CHANGED',409);capabilities.set(proof,Object.freeze(cap));
}
export function revokeOperatorCapability(proof:SessionProof){capabilities.delete(proof);}
export function requireOperatorCapability(proof:SessionProof|undefined,auth:AuthState){
 const cap=proof&&capabilities.get(proof);if(!proof||!cap)throw new OperatorEnrollmentError('OPERATOR_ACCESS_REQUIRED',403);
 assertOperatorAuthority(cap.authority,{chainId:cap.authority.chainId,hubAddress:cap.authority.hubAddress,protocolVersion:cap.authority.protocolVersion,operatorAddress:cap.authority.operatorAddress});
 if(!matches(proof,auth,cap,Date.now()))throw new OperatorEnrollmentError('OPERATOR_ACCESS_CHANGED',409);
 return auth.user!;
}
export function hasOperatorCapability(proof:SessionProof|undefined,auth:AuthState){try{requireOperatorCapability(proof,auth);return true;}catch{return false;}}
