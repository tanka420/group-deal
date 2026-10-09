import crypto from 'node:crypto';
import {config} from '../config';
import type {DatabaseSchema,WebhookSubscription,WebhookJobRecord} from '../db/store';
import {readAuthRecoveryBarrier} from '../domain/authRecovery';
import {readRestoredWorkBarrier,restoredWorkKey,isRestoredWorkHeld} from '../domain/restoredWork';
import {webhookApprovalSchema,WebhookSubscriptionApproval,WebhookReviewBinding} from '../domain/webhookRecovery';

export const webhookReviewDigest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const approvalPurpose='groupdeal:webhook-recovery-approval:v1:';
export function webhookConfigurationSha256(sub:WebhookSubscription){
 return webhookReviewDigest(JSON.stringify([sub.id,sub.sellerId,sub.targetUrl,sub.events,sub.secret,sub.secretEncrypted??null]));
}
export function webhookReviewBinding(state:Pick<DatabaseSchema,'authRecovery'|'restoredWork'>,sellerId:string,sub:WebhookSubscription):WebhookReviewBinding{
 const barrier=readRestoredWorkBarrier(state),auth=readAuthRecoveryBarrier(state.authRecovery);
 if(!barrier?.entries[restoredWorkKey('webhooks',sellerId)]||!auth||sub.sellerId!==sellerId)throw Error('WEBHOOK_RECOVERY_BINDING_REQUIRED');
 return {sellerId,subscriptionId:sub.id,configurationSha256:webhookConfigurationSha256(sub),sourceSnapshotSha256:barrier.sourceSnapshotSha256,authContextSha256:webhookReviewDigest(auth.context),chainId:config.arcChainId,hubAddress:config.hubAddress.toLowerCase(),protocolVersion:config.protocolVersion};
}
function approvalBody(a:Omit<WebhookSubscriptionApproval,'mac'>){return JSON.stringify([a.version,a.scope,a.sellerId,a.subscriptionId,a.configurationSha256,a.sourceSnapshotSha256,a.authContextSha256,a.chainId,a.hubAddress,a.protocolVersion,a.reviewId,a.verifiedAt,a.responseSha256]);}
export function signWebhookApproval(a:Omit<WebhookSubscriptionApproval,'mac'>):WebhookSubscriptionApproval{
 return webhookApprovalSchema.parse({...a,mac:crypto.createHmac('sha256',config.campaignIdentitySecret).update(approvalPurpose+approvalBody(a)).digest('hex')});
}
export function approvedRestoredSubscription(state:Pick<DatabaseSchema,'authRecovery'|'restoredWork'>,sellerId:string,sub?:WebhookSubscription):WebhookSubscriptionApproval|undefined{
 const barrier=readRestoredWorkBarrier(state);if(!barrier?.entries[restoredWorkKey('webhooks',sellerId)])return undefined;
 if(!sub||sub.sellerId!==sellerId)return undefined;
 const parsed=webhookApprovalSchema.safeParse(barrier.subscriptionApprovals?.[restoredWorkKey('webhooks',sellerId)]);if(!parsed.success)return undefined;
 const a=parsed.data,binding=webhookReviewBinding(state,sellerId,sub);
 if(a.verifiedAt>Date.now()+30000||Object.entries(binding).some(([k,v])=>a[k as keyof typeof binding]!==v))return undefined;
 const expected=signWebhookApproval(a).mac;
 return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(a.mac,'hex'))?a:undefined;
}
export function isRestoredSubscriptionHeld(state:Pick<DatabaseSchema,'authRecovery'|'restoredWork'>,sellerId:string,sub?:WebhookSubscription){return isRestoredWorkHeld(state,'webhooks',sellerId)&&!approvedRestoredSubscription(state,sellerId,sub);}
/** A verified endpoint grants delivery only to jobs atomically stamped after that review. */
export function restoredWebhookJobCanSend(state:DatabaseSchema,job:WebhookJobRecord){
 if(isRestoredWorkHeld(state,'webhookQueue',job.id))return false;
 if(!isRestoredWorkHeld(state,'webhooks',job.sellerId))return true;
 const sub=state.webhooks[job.sellerId],approval=approvedRestoredSubscription(state,job.sellerId,sub);
 return !!approval&&state.users[job.sellerId]?.id===job.sellerId&&state.users[job.sellerId].roles.includes('seller')&&job.subscriptionReviewId===approval.reviewId&&job.targetUrl===sub.targetUrl;
}
