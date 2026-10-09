import {z} from 'zod';
export const sellerFollowId=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const time=z.number().int().nonnegative().max(8640000000000000),revision=z.number().int().min(1).max(1000000000);
export const sellerFollowSchema=z.object({version:z.literal(1),id:z.string().regex(/^follow_[a-f0-9]{64}$/),userId:sellerFollowId,sellerId:sellerFollowId,revision,following:z.boolean(),notifyNewDeals:z.boolean(),notifyDealUpdates:z.boolean(),createdAt:time,changedAt:time,newDealsSince:time,dealUpdatesSince:time}).strict().refine(r=>r.changedAt>=r.createdAt&&r.newDealsSince<=r.changedAt&&r.dealUpdatesSince<=r.changedAt&&(r.following||!r.notifyNewDeals&&!r.notifyDealUpdates));
export type SellerFollowRecord=z.infer<typeof sellerFollowSchema>;
export const sellerFollowInput=z.object({idempotencyKey:z.string().uuid(),expectedRevision:z.number().int().min(0).max(999999999),following:z.boolean(),notifyNewDeals:z.boolean(),notifyDealUpdates:z.boolean()}).strict().refine(r=>r.following||!r.notifyNewDeals&&!r.notifyDealUpdates);
export const sellerFollowCommandSchema=z.object({version:z.literal(1),id:z.string().uuid(),userId:sellerFollowId,sellerId:sellerFollowId,requestHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:time,result:sellerFollowSchema}).strict().refine(c=>c.userId===c.result.userId&&c.sellerId===c.result.sellerId&&c.createdAt===c.result.changedAt);
export type SellerFollowCommand=z.infer<typeof sellerFollowCommandSchema>;
