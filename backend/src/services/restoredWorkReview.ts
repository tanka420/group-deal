import type {DatabaseSchema} from '../db/store';

const emailStates=['QUEUED','PROCESSING','SENT','RETRY','DLQ','CANCELLED'] as const;
const webhookStates=['QUEUED','PROCESSING','COMPLETED','FAILED','DLQ'] as const;
function summarize(collection:Record<string,unknown>,states:readonly string[],terminal:readonly string[]){
 const counts=Object.fromEntries([...states,'UNKNOWN'].map(status=>[status,0]));
 for(const row of Object.values(collection)){const status=row&&typeof row==='object'?(row as {status?:unknown}).status:undefined;counts[typeof status==='string'&&states.includes(status)?status:'UNKNOWN']++;}
 const total=Object.values(counts).reduce((sum,n)=>sum+n,0),terminalCount=terminal.reduce((sum,status)=>sum+counts[status],0);
 return{total,counts,requiresReview:total-terminalCount,unknownStatus:counts.UNKNOWN};
}
/** Restore must never automatically resume jobs without provenance/operator review. Unknown states fail closed. */
export function restoredExternalWorkSummary(state:Pick<DatabaseSchema,'emailOutbox'|'webhookQueue'>){
 const email=summarize(state.emailOutbox,emailStates,['SENT','DLQ','CANCELLED']),webhooks=summarize(state.webhookQueue,webhookStates,['COMPLETED','DLQ']);
 return{email:email.requiresReview,webhooks:webhooks.requiresReview,unknownStatus:email.unknownStatus+webhooks.unknownStatus,requiresReview:email.requiresReview+webhooks.requiresReview>0,inventory:{email,webhooks}};
}
