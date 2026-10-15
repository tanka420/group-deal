import {OperationCompletionService,operationCompletionFailure} from '../services/operationCompletionService';
import {OperationPreparationService,operationPreparationFailure} from '../services/operationPreparationService';
import {OperationReplacementError} from '../services/operationReplacementService';
import {OperationReadinessError} from '../services/operationReadinessService';
import {ClaimOperationService} from "../services/claimOperationService";
import {BuyOperationService} from "../services/buyOperationService";
import {operationHistory} from "../services/operationHistory";
import {OrderActionService,orderActionSchema,isOrderAction} from "../services/orderActionService";
import {z} from "zod";
import { Router } from "express";
import { store } from "../db/store";
import { authMiddleware,optionalOperator,AuthenticatedRequest } from "../middleware/auth";
import { OperationService } from "../services/operationService";
import { bindVerifiedCampaign } from "../services/campaignBindingService";
import { IndexerService } from "../services/indexerService";
import { DeliveryService } from "../services/deliveryService";
import { ResourceDeliveryService } from "../services/resourceDeliveryService";
import { decryptEntitlement } from "../utils/crypto";
import { ProductService } from "../services/productService";
import { campaignCalldata } from "../services/campaignBindingService";
import { config } from "../config";
import { OperationReplacementService } from "../services/operationReplacementService";
import { BuyExpiryService } from "../services/buyExpiryService";
import {DeliveryRetryService} from "../services/deliveryRetryService";

import {OperationTrackingError} from '../services/operationTrackingService';
import {SessionError} from '../services/sessionService';
function trackingFailure(res:import('express').Response,error:unknown){if(error instanceof OperationTrackingError||error instanceof SessionError){res.status(error.status).json({error:error instanceof SessionError?'Session unavailable':'Operation tracking unavailable',code:error.code});}else res.status(503).json({error:'Operation tracking unavailable',code:'OPERATION_TRACKING_UNAVAILABLE'});}
export const operationRouter=Router();
operationRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');next()});
operationRouter.use(authMiddleware);
operationRouter.use((req:AuthenticatedRequest,res,next)=>{
 if(req.sessionProof?.record.realm!=='ADMIN'){next();return;}
 try{
  if(req.method==='POST'&&req.path==='/orders/prepare'){if(req.body?.intent?.action!=='RESOLVE')throw new SessionError('ADMIN_OPERATION_SCOPE_REQUIRED',403);}
  else if(req.path==='/'&&req.method==='GET'){}
  else {const match=/^\/([A-Za-z0-9_-]+)(?:\/(ready|submit|observe|replace|recover))?$/.exec(req.path);if(!match||req.method!==(match[2]?'POST':'GET'))throw new SessionError('ADMIN_OPERATION_SCOPE_REQUIRED',403);const operation=OperationService.publicOwned(req.user!.userId,match[1],req.sessionProof);if(operation.action!=='RESOLVE')throw new SessionError('ADMIN_OPERATION_SCOPE_REQUIRED',403);}
  next();
 }catch(e){res.status(e instanceof SessionError?e.status:403).json({error:'ADMIN_OPERATION_SCOPE_REQUIRED'});}
});
operationRouter.get("/",(req:AuthenticatedRequest,res)=>{
  try{res.json(operationHistory(req.user!.userId,req.query,req.sessionProof));}catch(error){if(error instanceof OperationTrackingError||error instanceof SessionError)trackingFailure(res,error);else res.status(400).json({error:"Invalid history query or cursor",code:"VALIDATION"});}
});
operationRouter.get("/:id",(req:AuthenticatedRequest,res)=>{
  try{res.json({operation:OperationService.publicOwned(req.user!.userId,req.params.id,req.sessionProof)});}catch(error){if(error instanceof OperationTrackingError&&error.status===404)res.status(404).json({error:"Operation unavailable",code:"NOT_FOUND"});else trackingFailure(res,error);}
});
operationRouter.post("/claims/prepare",async(req:AuthenticatedRequest,res)=>{
  try{const {campaignId,action,orderIds,idempotencyKey}=req.body;
    if(typeof campaignId!=="string"||typeof idempotencyKey!=="string"||!/^[a-zA-Z0-9:_-]{8,180}$/.test(idempotencyKey)||!["BUYER_CLAIM","SELLER_CLAIM"].includes(action))throw new Error("VALIDATION: campaign, claim action and immutable retry key required");
    const operation=await ClaimOperationService.prepare(req.user!.userId,campaignId,action,orderIds,idempotencyKey,req.sessionProof);res.json({operation:OperationService.dto(operation)});
  }catch(error){operationPreparationFailure(res,error);}
});
operationRouter.post("/orders/prepare",optionalOperator,async(req:AuthenticatedRequest,res)=>{
  try{
    const {orderId,idempotencyKey,intent}=z.object({orderId:z.string().min(1).max(180),idempotencyKey:z.string().regex(/^[a-zA-Z0-9:_-]{8,180}$/),intent:orderActionSchema}).strict().parse(req.body);
    const operation=await OrderActionService.prepare(req.user!.userId,orderId,intent,idempotencyKey,req.sessionProof);res.json({operation:OperationService.dto(operation)});
  }catch(error){operationPreparationFailure(res,error);}
});
// Recheck a prepared intent immediately before an explicit wallet signature.
operationRouter.post("/:id/ready",optionalOperator,async(req:AuthenticatedRequest,res)=>{
  try{const result=await OperationService.ready(req.user!.userId,req.params.id,req.sessionProof);res.json({...result,operation:OperationService.dto(result.operation)});}
  catch(error){if(error instanceof SessionError)res.status(error.status).json({error:'Session unavailable',code:error.code});else if(error instanceof OperationReadinessError)res.status(error.status===503?503:409).json({error:'Intent requires recovery before signing',code:error.code});else res.status(503).json({error:'Intent verification unavailable',code:'OPERATION_READINESS_UNAVAILABLE'});}
});
operationRouter.post("/:id/submit",optionalOperator,(req:AuthenticatedRequest,res)=>{
  try {res.status(202).json({operation:OperationService.dto(OperationService.submit(req.user!.userId,req.params.id,req.body?.txHash,req.sessionProof))});}
  catch(error) {trackingFailure(res,error);}
});
operationRouter.post("/:id/observe",optionalOperator,async(req:AuthenticatedRequest,res)=>{
  try{const input=z.object({txHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/),rawTransaction:z.string().max(131074).optional()}).strict().parse(req.body);res.json({operation:OperationService.dto(await OperationReplacementService.observe(req.user!.userId,req.params.id,input.txHash,input.rawTransaction,req.sessionProof))});}
  catch(error){if(error instanceof SessionError)res.status(error.status).json({error:'Session unavailable',code:error.code});else res.status(error instanceof OperationReplacementError&&error.status===503?503:409).json({error:'Transaction lineage requires verification',code:error instanceof OperationReplacementError?error.code:error instanceof z.ZodError?'OPERATION_REPLACEMENT_INPUT_INVALID':'OPERATION_REPLACEMENT_UNAVAILABLE'});}
});
operationRouter.post("/:id/expire",async(req:AuthenticatedRequest,res)=>{
  try{z.object({}).strict().parse(req.body);res.json({operation:OperationService.dto(await BuyExpiryService.expire(req.user!.userId,req.params.id))});}
  catch(error){res.status(409).json({error:error instanceof z.ZodError?"VALIDATION: expiry accepts no client financial state":error instanceof Error?error.message:"BUY expiry verification unavailable"});}
});
operationRouter.post("/:id/replace",optionalOperator,async(req:AuthenticatedRequest,res)=>{
  try{const input=z.object({previousTxHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/),txHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/),rawOriginalTransaction:z.string().max(131074).optional()}).strict().parse(req.body);res.json({operation:OperationService.dto(await OperationReplacementService.replace(req.user!.userId,req.params.id,input.previousTxHash,input.txHash,input.rawOriginalTransaction,req.sessionProof))});}
  catch(error){if(error instanceof SessionError)res.status(error.status).json({error:'Session unavailable',code:error.code});else res.status(error instanceof OperationReplacementError&&error.status===503?503:409).json({error:'Transaction lineage requires verification',code:error instanceof OperationReplacementError?error.code:error instanceof z.ZodError?'OPERATION_REPLACEMENT_INPUT_INVALID':'OPERATION_REPLACEMENT_UNAVAILABLE'});}
});
operationRouter.post('/:id/recover',optionalOperator,async(req:AuthenticatedRequest,res)=>{
 try{
  const input=z.object({txHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional()}).strict().parse(req.body);if(Object.keys(req.query).length)throw new z.ZodError([]);
  OperationCompletionService.owned(req.user!.userId,req.params.id,req.sessionProof);
  if(input.txHash)OperationService.submit(req.user!.userId,req.params.id,input.txHash,req.sessionProof);
  res.json(await OperationCompletionService.recover(req.user!.userId,req.params.id,req.sessionProof));
 }catch(error){if(error instanceof z.ZodError){res.status(400).json({error:'Invalid recovery input',code:'OPERATION_COMPLETION_INPUT_INVALID'});return;}operationCompletionFailure(res,error);}
});
