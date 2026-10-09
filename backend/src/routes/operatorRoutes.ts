import {listOperatorDealDisputes,OperatorDealSectionError} from '../services/operatorDealSections';
import {z as disputeZ} from 'zod';
import {DisputeMetadataError,resolveMetadata} from '../domain/disputeMetadata';
import { Router } from "express";
import { store, sanitizeUser } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { DisputeService } from "../services/disputeService";
import { ReconciliationService } from "../services/reconciliationService";
import {updateOperatorSellerBadge,listOperatorSellers,issueSellerBadgeChallenge,readSellerBadgeCommand,cancelSellerBadgeCommand,OperatorBadgeError} from '../services/operatorBadgeService';
import {StorageConflict} from '../db/rowPersistence';
import {orderDto,projectedOrderDto} from "../services/orderDto";
import {listOperatorDeals,operatorDealView} from "../services/operatorDealView";
import { NotificationService, OutboxError } from "../services/notificationService";
import {IndexerService} from '../services/indexerService';
import {reconciliationSignals} from '../services/operationalSignals';
import {operationalHealth,operationalMetrics} from '../services/operationalHealth';
import {operatorLegacyReview,OperatorLegacyReviewError,SessionError} from '../services/operatorLegacyReview';

import {SessionService} from '../services/sessionService';
import {OrderThreadError} from '../services/orderThreadService';
import {listOperatorUsers,operatorSettings,OperatorAdministrationError} from '../services/operatorAdministrationService';
import {listOperatorAudit,verifyOperatorAudit,OperatorAuditError} from '../services/operatorAuditService';

export const operatorRouter = Router();

// Require operator role for all operator routes
operatorRouter.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');next();});
operatorRouter.use(authMiddleware);
operatorRouter.use(requireRole("operator"));
for(const [path,read] of [['users',listOperatorUsers],['settings',operatorSettings]] as const)operatorRouter.get('/'+path,(req:AuthenticatedRequest,res)=>{
  try{if(!req.sessionProof){res.status(401).json({error:'AUTH_SESSION_INACTIVE'});return;}res.json(read(req.sessionProof,req.query));}
  catch(error){res.status(error instanceof OperatorAdministrationError||error instanceof SessionError?error.status:503).json({error:error instanceof OperatorAdministrationError||error instanceof SessionError?error.code:'OPERATOR_ADMINISTRATION_UNAVAILABLE'});}
});
operatorRouter.get('/legacy-review',(req:AuthenticatedRequest,res)=>{
  try{if(!req.sessionProof){res.status(401).json({error:'AUTH_SESSION_INACTIVE'});return;}res.json(operatorLegacyReview.list(req.sessionProof,req.query));}
  catch(error){res.status(error instanceof OperatorLegacyReviewError||error instanceof SessionError?error.status:503).json({error:error instanceof OperatorLegacyReviewError||error instanceof SessionError?error.code:'LEGACY_REVIEW_UNAVAILABLE'});}
});

for(const endpoint of ['operations-health','metrics'])operatorRouter.get('/'+endpoint,(req:AuthenticatedRequest,res)=>{
  if(Object.keys(req.query).length){res.status(400).json({error:'OPERATIONAL_QUERY_INVALID'});return;}
  const now=Date.now();let snapshot=null;
  try{snapshot=store.readOperationalState(now,req.user!.userId);if(!snapshot.authorizedOperator){res.status(403).json({error:'OPERATIONAL_ROLE_REQUIRED'});return;}}catch{ /* No private SQLite/provider diagnostics in health or metrics. */ }
  const view=operationalHealth(snapshot,IndexerService.getObservations(),reconciliationSignals.snapshot(),now);
  if(endpoint==='metrics'){res.type('text/plain; version=0.0.4; charset=utf-8').send(operationalMetrics(view));return;}
  res.status(snapshot?200:503).json(view);
});

operatorRouter.get("/email-outbox", (req: AuthenticatedRequest,res) => {
  try{res.json(NotificationService.listEmailOutbox(req.user!.userId,req.query,req.sessionProof));}
  catch(error){res.status(error instanceof OutboxError||error instanceof SessionError?error.status:503).json({error:error instanceof OutboxError||error instanceof SessionError?error.code:"OUTBOX_UNAVAILABLE"});}
});
operatorRouter.post("/email-outbox/:id/redrive",(req:AuthenticatedRequest,res)=>{
  try{res.status(202).json(NotificationService.redriveEmail(req.user!.userId,req.params.id,req.body,req.sessionProof));}
  catch(error){res.status(error instanceof OutboxError||error instanceof SessionError?error.status:503).json({error:error instanceof OutboxError||error instanceof SessionError?error.code:"OUTBOX_UNAVAILABLE"});}
});
operatorRouter.post("/email-outbox/:id/cancel",(req:AuthenticatedRequest,res)=>{
  try{if(!req.body||typeof req.body!=="object"||Array.isArray(req.body)||Object.keys(req.body).length){res.status(400).json({error:"OUTBOX_INVALID_INPUT"});return;}res.json(NotificationService.cancelEmail(req.user!.userId,req.params.id,req.sessionProof));}
  catch(error){res.status(error instanceof OutboxError||error instanceof SessionError?error.status:503).json({error:error instanceof OutboxError||error instanceof SessionError?error.code:"OUTBOX_UNAVAILABLE"});}
});
operatorRouter.get("/email-outbox/:id",(req:AuthenticatedRequest,res)=>{
  try{res.json(NotificationService.outboxJob(req.user!.userId,req.params.id,req.sessionProof));}
  catch(error){res.status(error instanceof OutboxError||error instanceof SessionError?error.status:503).json({error:error instanceof OutboxError||error instanceof SessionError?error.code:"OUTBOX_UNAVAILABLE"});}
});

operatorRouter.get("/deals", (req,res) => {
  try { res.json(listOperatorDeals(req.query)); } catch { res.status(400).json({error:"VALIDATION"}); }
});
operatorRouter.get("/deals/:id", (req,res) => {
  try {
    const view=operatorDealView(req.params.id,req.query);
    if (!view) { res.status(404).json({error:"Deal not found"}); return; }
    res.json(view);
  } catch { res.status(400).json({error:"VALIDATION"}); }
});

operatorRouter.get('/deals/:id/disputes',(req:AuthenticatedRequest,res)=>{
  try{if(!req.sessionProof){res.status(401).json({error:'AUTH_SESSION_INACTIVE'});return;}res.json(listOperatorDealDisputes(req.sessionProof,req.params.id,req.query));}
  catch(error){res.status(error instanceof OperatorDealSectionError||error instanceof SessionError?error.status:503).json({error:error instanceof OperatorDealSectionError||error instanceof SessionError?error.code:'OPERATOR_DEAL_UNAVAILABLE'});}
});

// GET all active disputes
operatorRouter.get("/disputes", (req:AuthenticatedRequest, res) => {
  try{
  const disputedOrders = Object.values(store.db.orders).filter(
    (o) => o.deliveryStatus === "DISPUTED"
  );

  const enriched = disputedOrders.map((o) => {
    const campaign = store.db.campaigns[o.campaignId];
    const buyer = store.db.users[o.buyerAccountId];
    const seller = campaign ? store.db.users[campaign.sellerId] : null;

    return {
      ...orderDto(o),
      campaignTitle: campaign?.title || "Campaign",
      buyerEmail: buyer?.email,
      sellerDisplayName: seller?.sellerProfile?.displayName,
      sellerPayoutWallet: campaign?.sellerPayoutWallet,
      onchainCampaignId: campaign?.onchainCampaignId,
      messages: DisputeService.getMessages(o.id,req.sessionProof),
    };
  });

  res.json({ disputes: enriched });
  }catch(e){res.status(e instanceof SessionError||e instanceof OrderThreadError?e.status:503).json({error:e instanceof SessionError||e instanceof OrderThreadError?e.code:"ORDER_THREAD_UNAVAILABLE"});}
});

function operatorDisputeMetadataFailure(error:unknown,res:import('express').Response){res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');if(error instanceof DisputeMetadataError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}if(error instanceof disputeZ.ZodError){res.status(400).json({error:'DISPUTE_METADATA_INPUT_INVALID'});return;}res.status(503).json({error:'DISPUTE_METADATA_UNAVAILABLE'});}
operatorRouter.post('/disputes/:id/resolve',async(req:AuthenticatedRequest,res)=>{
 res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
 try{if(Object.keys(req.query).length)throw new DisputeMetadataError('DISPUTE_METADATA_INPUT_INVALID',400);const input=disputeZ.object({buyerShareBaseUSDC:resolveMetadata.shape.buyerShare,sellerShareBaseUSDC:resolveMetadata.shape.sellerShare,notes:resolveMetadata.shape.notes.default('Arbitrated by GroupDeal Operator'),txHash:disputeZ.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict().parse(req.body);
 const result=await DisputeService.resolveDispute(req.user!.userId,req.params.id,input.buyerShareBaseUSDC,input.sellerShareBaseUSDC,input.notes,input.txHash,req.sessionProof);
 res.json({success:true,txHash:result.txHash,blockNumber:result.blockNumber,order:projectedOrderDto(result.order,result.hasEntitlement)});
 }catch(error){operatorDisputeMetadataFailure(error,res)}
});

// GET sellers for verification
function badgeFailure(res:import('express').Response,error:unknown){if(error instanceof OperatorBadgeError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}if(error instanceof StorageConflict||error instanceof Error&&error.message.startsWith('CONFLICT:')){res.status(409).json({error:'OPERATOR_BADGE_CONFLICT'});return;}if(error instanceof Error&&error.message.startsWith('FORBIDDEN:')){res.status(403).json({error:'OPERATOR_STEP_UP_REQUIRED'});return;}res.status(503).json({error:'OPERATOR_BADGE_UNAVAILABLE'});}
operatorRouter.get('/sellers',(req:AuthenticatedRequest,res)=>{try{if(!req.sessionProof)throw new SessionError('AUTH_SESSION_INACTIVE');res.json(listOperatorSellers(req.sessionProof,req.query))}catch(error){badgeFailure(res,error)}});
operatorRouter.post('/sellers/:id/badge/challenge',(req:AuthenticatedRequest,res)=>{try{if(!req.sessionProof)throw new SessionError('AUTH_SESSION_INACTIVE');if(req.get('Idempotency-Key')!==req.body?.commandId)throw new OperatorBadgeError('OPERATOR_BADGE_INPUT_INVALID',400);res.json(issueSellerBadgeChallenge(req.sessionProof,req.params.id,req.body))}catch(error){badgeFailure(res,error)}});
operatorRouter.get('/seller-badge-commands/:id',(req:AuthenticatedRequest,res)=>{try{if(!req.sessionProof)throw new SessionError('AUTH_SESSION_INACTIVE');res.json(readSellerBadgeCommand(req.sessionProof,req.params.id,req.query))}catch(error){badgeFailure(res,error)}});
operatorRouter.post('/seller-badge-commands/:id/cancel',(req:AuthenticatedRequest,res)=>{try{if(!req.sessionProof)throw new SessionError('AUTH_SESSION_INACTIVE');if(req.get('Idempotency-Key')!==req.params.id)throw new OperatorBadgeError('OPERATOR_BADGE_INPUT_INVALID',400);res.json(cancelSellerBadgeCommand(req.sessionProof,req.params.id,req.body))}catch(error){badgeFailure(res,error)}});

// POST update verification badges
operatorRouter.post("/sellers/:id/badge", (req: AuthenticatedRequest, res) => {
  try {
    if(!req.sessionProof){res.status(401).json({error:'AUTH_SESSION_INACTIVE'});return;}
    res.json(updateOperatorSellerBadge(req.sessionProof,req.params.id,req.body,req.get('Idempotency-Key')));
  } catch (error) {
    if(error instanceof OperatorBadgeError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}
    if(error instanceof StorageConflict||error instanceof Error&&error.message.startsWith('CONFLICT:')){res.status(409).json({error:'OPERATOR_BADGE_CONFLICT'});return;}
    if(error instanceof Error&&error.message.startsWith('FORBIDDEN:')){res.status(403).json({error:'OPERATOR_STEP_UP_REQUIRED'});return;}
    res.status(503).json({error:'OPERATOR_BADGE_UNAVAILABLE'});
  }
});

// GET reconciliation report (supports optional fixedBlockNumber query)
operatorRouter.get("/reconciliation", async (req:AuthenticatedRequest, res) => {
  try {
    const blockNum = req.query.blockNumber ? parseInt(req.query.blockNumber as string, 10) : undefined;
    const report = await ReconciliationService.runReconciliation({ fixedBlockNumber: blockNum });
    SessionService.assertOperatorCommitted(req.sessionProof,store.readAuthState(req.user!.userId,req.sessionProof!.key));res.json({ report });
  } catch (err: any) {
    res.status(err instanceof SessionError?err.status:503).json({error:err instanceof SessionError?err.code:'OPERATOR_RECONCILIATION_UNAVAILABLE'});
  }
});


// Committed audit reads share the session/role snapshot and never expose raw details.
for(const [path,read] of [['audit-logs',listOperatorAudit],['audit-logs/verify',verifyOperatorAudit]] as const)operatorRouter.get('/'+path,(req:AuthenticatedRequest,res)=>{
 try{if(!req.sessionProof){res.status(401).json({error:'AUTH_SESSION_INACTIVE'});return;}res.json(read(req.sessionProof,req.query));}
 catch(e){res.status(e instanceof OperatorAuditError||e instanceof OperatorDealSectionError||e instanceof SessionError?e.status:503).json({error:e instanceof OperatorAuditError||e instanceof OperatorDealSectionError||e instanceof SessionError?e.code:'OPERATOR_AUDIT_UNAVAILABLE'});}
});
