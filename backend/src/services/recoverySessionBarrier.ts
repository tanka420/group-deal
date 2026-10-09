import crypto from 'node:crypto';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {TransactionalStore} from '../db/store';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {privateRecoveryDirectory} from './recoveryDrillService';
import {installRestoredWorkBarrier} from './restoredWorkBarrier';

export class RecoverySessionBarrierError extends Error{constructor(public readonly code:string){super(code);}}

/** Always stages new private databases. Active/source sessions and financial principals remain unchanged. */
export function stageRecoverySessionBarrier(source:TransactionalStore,privateParent:string){
 if(!source.isIsolated)throw new RecoverySessionBarrierError('RECOVERY_AUTH_ISOLATED_SOURCE_REQUIRED');
 const active=path.resolve(__dirname,'../../data'),parent=path.resolve(privateParent),relative=path.relative(active,parent);
 if(!relative||relative==='.'||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw new RecoverySessionBarrierError('RECOVERY_AUTH_ACTIVE_PARENT_DISABLED');
 const original=source.snapshot();
 if(!source.verifyAuditLogIntegrity().valid)throw new RecoverySessionBarrierError('RECOVERY_AUTH_SOURCE_AUDIT_INVALID');
 const directory=privateRecoveryDirectory(privateParent),retained=new TransactionalStore(path.join(directory,'retained-original')),candidate=new TransactionalStore(path.join(directory,'candidate'));
 const context=crypto.randomBytes(32).toString('base64url'),createdAt=Date.now(),cancelled={walletBindingIntents:0,sellerProfileIntents:0,contactChallenges:0};
 try{
  retained.initializeRecoverySnapshot(structuredClone(original));candidate.initializeRecoverySnapshot(structuredClone(original));
  candidate.transaction(()=>{
   // New context on every new staging job also rejects tokens issued in an older restored environment.
   candidate.db.authRecovery={current:{version:1,context,createdAt}};
   candidate.db.emailOtps={};candidate.db.walletChallenges={};candidate.db.circleLoginAttempts={};
   for(const name of ['walletBindingIntents','sellerProfileIntents'] as const)for(const intent of Object.values(candidate.db[name]))if(intent.state==='PENDING'){intent.state='CANCELLED';intent.cancelledAt=createdAt;cancelled[name]++;}
   for(const user of Object.values(candidate.db.users))if(user.contact?.pending?.state==='PENDING'){user.contact.pending.state='CANCELLED';cancelled.contactChallenges++;}
   const work=installRestoredWorkBarrier(candidate,original);
   candidate.addAuditLog('recovery','operator','RECOVERY_AUTH_BARRIER_STAGED',{oldSessionRowsPreserved:Object.keys(original.authSessions).length,oldCredentialsDisabled:true,financialPrincipalsChanged:false,restoredWorkHeld:work.heldCount});
  });
  readAuthRecoveryBarrier(candidate.db.authRecovery);
  if(!isDeepStrictEqual(source.snapshot(),original)||!isDeepStrictEqual(retained.snapshot(),original))throw new RecoverySessionBarrierError('RECOVERY_AUTH_SOURCE_CHANGED');
  for(const [key,value]of Object.entries(original))if(!['authRecovery','restoredWork','emailOtps','walletChallenges','circleLoginAttempts','walletBindingIntents','sellerProfileIntents','users','auditLogs'].includes(key)&&!isDeepStrictEqual((candidate.db as any)[key],value))throw new RecoverySessionBarrierError('RECOVERY_AUTH_FINANCIAL_OR_PRIVATE_RECORD_CHANGED');
  if(!candidate.verifyAuditLogIntegrity().valid)throw new RecoverySessionBarrierError('RECOVERY_AUTH_CANDIDATE_AUDIT_INVALID');
  return{directory,candidateDirectory:path.join(directory,'candidate'),retainedDirectory:path.join(directory,'retained-original'),metadata:{scope:'PRIVATE_RECOVERY_AUTH_PREPARATION',freshLoginRequired:true,oldSessionRowsPreserved:Object.keys(original.authSessions).length,disabledCredentials:{emailOtps:Object.keys(original.emailOtps).length,walletChallenges:Object.keys(original.walletChallenges).length,circleLoginAttempts:Object.keys(original.circleLoginAttempts).length,...cancelled},sourcePreserved:true,financialPrincipalsChanged:false,originalRightsRevoked:false,productAccessEnabled:false,authCutoverAllowed:false,acceptanceEligible:false}};
 }finally{candidate.close();retained.close();}
}
