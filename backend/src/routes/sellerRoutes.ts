import { Router } from "express";
import { orderDto,projectedOrderDto } from "../services/orderDto";
import { store } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { DeliveryService } from "../services/deliveryService";
import { DisputeService } from "../services/disputeService";
import { WebhookService,RestoredSubscriptionError } from "../services/webhookService";
import {SessionService,SessionError} from '../services/sessionService';
import {WebhookRecoveryService,WebhookRecoveryError} from '../services/webhookRecoveryService';
import { campaignDraftView, listCampaignDrafts } from "../services/campaignDraftView";
import {sellerCampaignOverview} from '../domain/sellerInventory';
import {CampaignReplacementService,campaignReplacementFailure,CampaignReplacementError} from '../services/campaignReplacementService';

import {OrderReviewService,OrderReviewError} from '../services/orderReviewService';
import {workspaceList,workspaceFailure,sellerOverview} from '../services/workspaceView';

export const sellerRouter = Router();
sellerRouter.use(['/campaigns','/orders'],(_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
const inventoryFailure=(res:any,error:unknown)=>{if(error instanceof SessionError){res.status(error.status).json({error:error.code});return;}res.status(503).json({error:'SELLER_INVENTORY_UNAVAILABLE'});};
const inventory=(req:AuthenticatedRequest,includeOrders:boolean)=>{const proof=req.sessionProof!,snapshot=store.readSellerInventoryState(req.user!.userId,proof.key,includeOrders),account=SessionService.assertCommitted(proof,snapshot.auth);if(!account.roles.includes('seller'))throw new SessionError('SELLER_ROLE_REQUIRED',403);return {snapshot,account};};

const draftFailure=(res:any,error:unknown)=>{const message=error instanceof Error?error.message:"Draft unavailable";res.status(message.startsWith("FORBIDDEN")?403:message.startsWith("NOT_FOUND")?404:message.startsWith("CONFLICT")?409:400).json({error:message});};
sellerRouter.get("/campaign-drafts",authMiddleware,requireRole("seller"),(req:AuthenticatedRequest,res)=>{try{res.json(listCampaignDrafts(req.user!.userId,req.query));}catch(error){draftFailure(res,error);}});
sellerRouter.get("/campaign-drafts/:id",authMiddleware,requireRole("seller"),(req:AuthenticatedRequest,res)=>{try{res.json(campaignDraftView(req.user!.userId,req.params.id,req.query));}catch(error){draftFailure(res,error);}});

sellerRouter.get('/campaigns/:id/replacement-template',authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{try{if(Object.keys(req.query).length)throw new CampaignReplacementError('REPLACEMENT_INPUT_INVALID',400);res.json(CampaignReplacementService.template(req.sessionProof!,req.params.id));}catch(error){campaignReplacementFailure(res,error);}});
sellerRouter.post('/campaigns/:id/replacement-draft',authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{try{if(Object.keys(req.query).length)throw new CampaignReplacementError('REPLACEMENT_INPUT_INVALID',400);const result=CampaignReplacementService.create(req.sessionProof!,req.params.id,req.body,req.get('Idempotency-Key'));res.status(result.replayed?200:201).json(result);}catch(error){campaignReplacementFailure(res,error);}});
// GET seller's campaigns
sellerRouter.get("/campaigns", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  if(Object.keys(req.query).length){try{res.json(workspaceList(req.sessionProof!,req.query,'seller-campaigns'));}catch(error){workspaceFailure(res,error);}return;}
  try{const {snapshot,account}=inventory(req,false);res.json({sellerAccountId:account.id,serverTime:Date.now(),revision:snapshot.revision,projection:{source:'INDEXER',financialStateChainVerified:false},campaigns:snapshot.campaigns.map(sellerCampaignOverview)});}catch(error){inventoryFailure(res,error);}
});

// GET seller's orders
sellerRouter.get("/orders", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  if(Object.keys(req.query).length){try{res.json(workspaceList(req.sessionProof!,req.query,'seller-orders'));}catch(error){workspaceFailure(res,error);}return;}
  try{const {snapshot,account}=inventory(req,true),orders=snapshot.orders.map(({order,campaign,hasEntitlement})=>({...orderDto(order),hasEntitlement,sellerAccountId:account.id,sellerPayoutWallet:campaign.sellerPayoutWallet,campaignTitle:campaign.title,campaignStatus:campaign.status??'UNKNOWN'}));res.json({sellerAccountId:account.id,serverTime:Date.now(),revision:snapshot.revision,projection:{source:'INDEXER',financialStateChainVerified:false},orders});}catch(error){inventoryFailure(res,error);}
});

sellerRouter.get('/overview',authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{res.setHeader('Cache-Control','private, no-store');try{if(Object.keys(req.query).length){res.status(400).json({error:'WORKSPACE_INPUT_INVALID'});return;}res.json(sellerOverview(req.sessionProof!));}catch(error){workspaceFailure(res,error);}});
// POST fulfill order with encrypted entitlement
sellerRouter.post("/orders/:id/deliver", authMiddleware, requireRole("seller"), async (req: AuthenticatedRequest, res) => {
  try {
    const { secretContent, txHash } = req.body;
    if (!secretContent) {
      res.status(400).json({ error: "Digital entitlement secret content is required" });
      return;
    }
    const result = await DeliveryService.fulfillOrder(
      req.user!.userId,
      req.params.id,
      secretContent,
      txHash
    );
    res.json({ success: true, ...result,order:orderDto(result.order) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST reply to buyer review
sellerRouter.post('/orders/:id/reply-review',authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{
 try{if(Object.keys(req.query).length)throw new OrderReviewError('ORDER_REVIEW_INPUT_INVALID',400);const result=OrderReviewService.reply(req.sessionProof,req.params.id,req.body);res.json({success:true,order:projectedOrderDto(result.order,result.hasEntitlement)});}catch(e){res.status(e instanceof SessionError||e instanceof OrderReviewError?e.status:503).json({error:e instanceof SessionError||e instanceof OrderReviewError?e.code:'ORDER_REVIEW_UNAVAILABLE'});}
});

// GET webhook settings & logs
sellerRouter.use('/webhooks',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
const webhookFailure=(res:any,error:unknown)=>{
  if(error instanceof RestoredSubscriptionError||error instanceof SessionError||error instanceof WebhookRecoveryError){res.status(error.status).json({error:error.code});return;}
  res.status(503).json({error:'WEBHOOK_SUBSCRIPTION_UNAVAILABLE'});
};
sellerRouter.get("/webhooks", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  if(Object.keys(req.query).length){res.status(400).json({error:'WEBHOOK_QUERY_INVALID'});return;}
  try{
    const proof=req.sessionProof!,snapshot=store.readSellerWebhookState(req.user!.userId,proof.key),account=SessionService.assertCommitted(proof,snapshot.auth);
    if(!account.roles.includes('seller'))throw new SessionError('WEBHOOK_SELLER_REQUIRED',403);
    res.json({webhook:snapshot.webhook?WebhookService.subscriptionDto(snapshot.webhook,{authRecovery:snapshot.auth.authRecovery as typeof store.db.authRecovery,restoredWork:snapshot.restoredWork},account.id):null});
  }catch(error){webhookFailure(res,error);}
});

// POST save webhook endpoint
sellerRouter.post("/webhooks", authMiddleware, requireRole("seller"), async (req: AuthenticatedRequest, res) => {
  try {
    const { targetUrl, events } = req.body;
    if (typeof targetUrl!=='string'||!targetUrl||targetUrl.length>2048||Object.keys(req.body).some(k=>!['targetUrl','events'].includes(k))||events!==undefined&&(!Array.isArray(events)||!events.length||events.length>12||events.some(e=>typeof e!=='string'))) {
      res.status(400).json({ error: "WEBHOOK_INPUT_INVALID" });
      return;
    }
    const sub = await WebhookService.registerWebhook(
      req.user!.userId,
      targetUrl,
      events || ["order.committed", "order.delivered", "order.disputed"],
      req.sessionProof
    );
    res.json({ success: true, webhook: WebhookService.subscriptionDto(sub) });
  } catch (err) {
    if(err instanceof RestoredSubscriptionError||err instanceof SessionError)webhookFailure(res,err);
    else res.status(400).json({error:'WEBHOOK_SETUP_REJECTED'});
  }
});

sellerRouter.post('/webhooks/recovery-reviews',authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{try{res.json({review:WebhookRecoveryService.prepare(req.sessionProof!,req.body)});}catch(e){webhookFailure(res,e);}});
sellerRouter.get('/webhooks/recovery-reviews',authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{if(Object.keys(req.query).length){res.status(400).json({error:'WEBHOOK_REVIEW_INPUT_INVALID'});return;}try{res.json(WebhookRecoveryService.get(req.sessionProof!));}catch(e){webhookFailure(res,e);}});
sellerRouter.get('/webhooks/recovery-reviews/:id',authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{if(Object.keys(req.query).length){res.status(400).json({error:'WEBHOOK_REVIEW_INPUT_INVALID'});return;}try{res.json(WebhookRecoveryService.get(req.sessionProof!,req.params.id));}catch(e){webhookFailure(res,e);}});
sellerRouter.post('/webhooks/recovery-reviews/:id/verify',authMiddleware,requireRole('seller'),async(req:AuthenticatedRequest,res)=>{if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length){res.status(400).json({error:'WEBHOOK_REVIEW_INPUT_INVALID'});return;}try{res.json({review:await WebhookRecoveryService.verify(req.sessionProof!,req.params.id)});}catch(e){webhookFailure(res,e);}});

// GET seller DLQ
sellerRouter.get("/webhooks/dlq", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  const sellerId = req.user!.userId;
  const dlqRecords = Object.values(store.db.webhookDLQ || {}).filter((d) => d.sellerId === sellerId);
  res.json({ dlq: dlqRecords });
});

// POST replay DLQ item
sellerRouter.post("/webhooks/dlq/:dlqId/replay", authMiddleware, requireRole("seller"), async (req: AuthenticatedRequest, res) => {
  const { dlqId } = req.params;
  const sellerId = req.user!.userId;
  const record = store.db.webhookDLQ?.[dlqId];
  if (!record || record.sellerId !== sellerId) {
    res.status(404).json({ error: "DLQ record not found" });
    return;
  }
  try{const success = await WebhookService.replayDLQ(dlqId);res.json({ success });}catch(error){webhookFailure(res,error);}
});
