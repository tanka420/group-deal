import {OperationCompletionService,operationCompletionFailure} from '../services/operationCompletionService';
import {OperationPreparationService,operationPreparationFailure} from '../services/operationPreparationService';
import {z as disputeZ} from 'zod';
import {DisputeMetadataError,openMetadata} from '../domain/disputeMetadata';
import { Router } from "express";
import {workspaceList,workspaceFailure,buyerSummary} from '../services/workspaceView';
import { store } from "../db/store";
import { authMiddleware, optionalOperator, AuthenticatedRequest } from "../middleware/auth";
import { BuyOperationService } from "../services/buyOperationService";
import { OperationService } from "../services/operationService";
import { DeliveryService } from "../services/deliveryService";
import { DisputeService } from "../services/disputeService";
import { orderDto,projectedOrderDto } from "../services/orderDto";
import {ResourceAccessError} from '../services/buyerResourceView';
import {SessionError,SessionService} from '../services/sessionService';

import {OrderThreadService,OrderThreadError} from '../services/orderThreadService';

import {OrderReviewService,OrderReviewError} from '../services/orderReviewService';

export const orderRouter = Router();
orderRouter.use(['/buyer','/:id/entitlement','/:id/messages','/:id/review'],(_req,res,next)=>{res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});next();});

// POST buy authorization
orderRouter.post("/authorize", (_req,res,next)=>{res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});next();}, authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result=await BuyOperationService.prepare(req.user!.userId,req.body,req.sessionProof);
    res.json({...result.authorization,operation:OperationService.dto(result.operation)});
  } catch (err: any) {
    operationPreparationFailure(res,err);
  }
});

// GET buyer's orders
orderRouter.get('/summary',authMiddleware,(req:AuthenticatedRequest,res)=>{res.setHeader('Cache-Control','private, no-store');try{if(Object.keys(req.query).length){res.status(400).json({error:'WORKSPACE_INPUT_INVALID'});return;}res.json(buyerSummary(req.sessionProof!));}catch(error){workspaceFailure(res,error);}});
orderRouter.get("/buyer", authMiddleware, (req: AuthenticatedRequest, res) => {
  try{
    if(Object.keys(req.query).length){try{res.setHeader('Cache-Control','private, no-store');res.json(workspaceList(req.sessionProof!,req.query,'buyer-orders'));}catch(error){workspaceFailure(res,error);}return;}
    const userId=req.user!.userId,proof=req.sessionProof!;const state=store.readBuyerOrderState(userId,proof.key);if(SessionService.assertCommitted(proof,state.auth).id!==userId)throw new SessionError('AUTH_SESSION_INACTIVE',401);
    const orders=state.orders.map(({order,campaign,hasEntitlement,managedResourceDelivery})=>({...orderDto(order),hasEntitlement,managedResourceDelivery,campaignTitle:campaign?.title||'Campaign',campaignThumbnail:campaign?.thumbnailUrl||'',campaignStatus:campaign?.status||'UNKNOWN',sellerPayoutWallet:campaign?.sellerPayoutWallet,onchainCampaignId:campaign?.onchainCampaignId,finalizedAt:campaign?.finalizedAt,deliverySlaSeconds:campaign?.deliverySlaSeconds}));
    res.json({buyerAccountId:userId,serverTime:Date.now(),projection:{source:'INDEXER',financialStateChainVerified:false},orders});
  }catch(err){if(err instanceof SessionError){res.status(err.status).json({error:err.code});return;}res.status(503).json({error:'ORDER_VIEW_UNAVAILABLE'});}
});

// GET decrypted entitlement
orderRouter.get("/:id/entitlement", authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const content = DeliveryService.accessEntitlement(req.user!.userId, req.params.id,req.sessionProof);
    res.json({ success: true, entitlement: content });
  } catch (err: any) {
    if(err instanceof ResourceAccessError||err instanceof SessionError){res.status(err.status).json({error:err.code});return;}
    res.status(400).json({ error: 'RESOURCE_ENTITLEMENT_UNAVAILABLE' });
  }
});

// POST confirm receipt early
orderRouter.post('/:id/confirm',authMiddleware,async(req:AuthenticatedRequest,res)=>{
 res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
 try{const {txHash}=disputeZ.object({txHash:disputeZ.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict().parse(req.body);if(Object.keys(req.query).length)throw new disputeZ.ZodError([]);res.json(await DeliveryService.confirmReceipt(req.user!.userId,req.params.id,txHash,req.sessionProof));}
 catch(error){if(error instanceof disputeZ.ZodError){res.status(400).json({error:'Invalid confirmation input',code:'OPERATION_COMPLETION_INPUT_INVALID'});return;}operationCompletionFailure(res,error);}
});

function disputeMetadataFailure(error:unknown,res:import('express').Response){res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');if(error instanceof DisputeMetadataError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}if(error instanceof disputeZ.ZodError){res.status(400).json({error:'DISPUTE_METADATA_INPUT_INVALID'});return;}res.status(503).json({error:'DISPUTE_METADATA_UNAVAILABLE'});}
orderRouter.post('/:id/dispute',authMiddleware,async(req:AuthenticatedRequest,res)=>{
 res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
 try{if(Object.keys(req.query).length)throw new DisputeMetadataError('DISPUTE_METADATA_INPUT_INVALID',400);const input=disputeZ.object({reason:openMetadata.shape.reason,evidenceUrls:openMetadata.shape.evidenceUrls.default([]),txHash:disputeZ.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict().parse(req.body);
 const result=await DisputeService.openDispute(req.user!.userId,req.params.id,input.reason,input.evidenceUrls,input.txHash,req.sessionProof);
 res.json({success:true,txHash:result.txHash,blockNumber:result.blockNumber,order:projectedOrderDto(result.order,result.hasEntitlement)});
 }catch(error){disputeMetadataFailure(error,res)}
});

function threadFailure(error:unknown,res:import('express').Response){
  if(error instanceof OrderThreadError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}
  res.status(503).json({error:'ORDER_THREAD_UNAVAILABLE'});
}
// Order thread reads and writes derive current parties/sender from the same committed snapshot.
orderRouter.get('/:id/messages',authMiddleware,optionalOperator,(req:AuthenticatedRequest,res)=>{
  try{if(Object.keys(req.query).length)throw new OrderThreadError('ORDER_THREAD_INPUT_INVALID',400);res.json({messages:OrderThreadService.list(req.sessionProof,req.params.id)});}catch(e){threadFailure(e,res)}
});
orderRouter.post('/:id/messages',authMiddleware,optionalOperator,(req:AuthenticatedRequest,res)=>{
  try{if(Object.keys(req.query).length)throw new OrderThreadError('ORDER_THREAD_INPUT_INVALID',400);res.json({success:true,message:OrderThreadService.send(req.sessionProof,req.params.id,req.body)});}catch(e){threadFailure(e,res)}
});

// POST leave review
orderRouter.post('/:id/review',authMiddleware,(req:AuthenticatedRequest,res)=>{
 try{if(Object.keys(req.query).length)throw new OrderReviewError('ORDER_REVIEW_INPUT_INVALID',400);const result=OrderReviewService.submit(req.sessionProof,req.params.id,req.body);res.json({success:true,order:projectedOrderDto(result.order,result.hasEntitlement)});}catch(e){res.status(e instanceof SessionError||e instanceof OrderReviewError?e.status:503).json({error:e instanceof SessionError||e instanceof OrderReviewError?e.code:'ORDER_REVIEW_UNAVAILABLE'});}
});
