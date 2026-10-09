import {z} from 'zod';

const digest=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().nonnegative().max(8640000000000000);
export const reviewIdSchema=z.string().regex(/^whr_[a-f0-9-]{36}$/).refine(v=>z.string().uuid().safeParse(v.slice(4)).success);
const binding={sellerId:z.string().min(1).max(128),subscriptionId:z.string().min(1).max(128),configurationSha256:digest,sourceSnapshotSha256:digest,authContextSha256:digest,chainId:z.number().int().positive(),hubAddress:z.string().regex(/^0x[a-f0-9]{40}$/),protocolVersion:z.number().int().positive()};
export const webhookApprovalSchema=z.object({version:z.literal(1),scope:z.literal('NEW_EVENTS_ONLY'),...binding,reviewId:reviewIdSchema,verifiedAt:time,responseSha256:digest,mac:digest}).strict();
export type WebhookSubscriptionApproval=z.infer<typeof webhookApprovalSchema>;
export const webhookReviewSchema=z.object({version:z.literal(1),id:reviewIdSchema,...binding,sessionId:z.string().min(1).max(128),createdAt:time,expiresAt:time,phase:z.enum(['PREPARED','VERIFYING','VERIFIED','FAILED','CANCELLED']),attempts:z.number().int().min(0).max(3),updatedAt:time,leaseToken:z.string().uuid().optional(),leaseExpiresAt:time.optional(),nonceEncrypted:z.string().max(4096).optional(),nonceSha256:digest.optional(),responseSha256:digest.optional(),failure:z.enum(['ENDPOINT_NOT_VERIFIED','BINDING_CHANGED','EXPIRED']).optional(),verifiedAt:time.optional()}).strict();
export type WebhookRecoveryReview=z.infer<typeof webhookReviewSchema>;
export type WebhookReviewBinding=Pick<WebhookRecoveryReview,keyof typeof binding>;
