import {OperationCompletionService,operationCompletionFailure} from '../services/operationCompletionService';
import {OperationPreparationService,operationPreparationFailure} from '../services/operationPreparationService';
import { Router } from "express";
import { ethers } from "ethers";
import * as crypto from "crypto";
import { store, CampaignRecord } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { DeliveryService } from "../services/deliveryService";
import { computeTermsHash, decryptEntitlement } from "../utils/crypto";
import { TransactionVerifier } from "../services/transactionVerifier";
import { config } from "../config";
import { bindVerifiedCampaign, campaignCalldata } from "../services/campaignBindingService";
import { IndexerService } from "../services/indexerService";
import { campaignDto } from "../services/campaignDto";
import {accessiblePublicCampaign,validPublicCampaignId} from "../services/publicCampaign";
import {publicSellerLink} from '../services/publicSellerIdentity';
import { CampaignEditorService } from "../services/campaignEditorService";
import { ResourceDeliveryService } from "../services/resourceDeliveryService";
import { OperationService } from "../services/operationService";
import {publicLeaf} from '../services/publicMetadata';
import {z} from 'zod';
import {ResourceMutationService,resourceMutationFailure} from '../services/resourceMutationService';
import {CampaignAmendmentService,campaignAmendmentFailure} from '../services/campaignAmendmentService';
import {ProviderDeliveryService,providerFailure} from '../services/providerDeliveryService';

export const campaignRouter = Router();
campaignRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});

function assertDraftDeployment(scope:string|undefined){
  if(scope!==undefined&&scope!==`${config.arcChainId}:${config.hubAddress.toLowerCase()}:${config.protocolVersion}`)throw new Error("CONFLICT: editor deployment changed; recover the draft in its original environment");
}

// GET all public campaigns
campaignRouter.get("/", (req, res) => {
  try {
  const state=store.readPublicProjectionState({},config.arcChainId,config.hubAddress),campaigns = Object.values(state.campaigns)
    .filter(c=>c.visibility==='PUBLIC'&&accessiblePublicCampaign(c.id,state))
    .map(c=>campaignDto(c,state));
  res.json({ campaigns });
  }catch{res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'Public campaign projection unavailable'});}
});

// GET single campaign by ID
campaignRouter.get("/:id", (req, res) => {
  try {
  if(!validPublicCampaignId(req.params.id)){res.status(404).json({error:'Campaign not found'});return;}const state=store.readPublicProjectionState({campaignId:req.params.id},config.arcChainId,config.hubAddress),campaign = accessiblePublicCampaign(req.params.id,state);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Drafts are only exposed through authenticated seller-specific endpoints.
  if (campaign.status === "DRAFT" || campaign.projectionOrigin === "CHAIN_UNBOUND") {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Lookup seller profile & badges (never expose raw payoutProofSignature)
  const seller = state.users[campaign.sellerId];
  const sellerInfo = {
    ...publicSellerLink(campaign,state),
    displayName: publicLeaf(seller?.sellerProfile?.displayName,'text') || "Seller",
    bio: publicLeaf(seller?.sellerProfile?.bio,'text') || "",
    payoutWallet: publicLeaf(campaign.sellerPayoutWallet,'text'),
    verifiedSellerBadge: publicLeaf(seller?.sellerProfile?.verifiedSellerBadge??false,'boolean'),
    verifiedRightsBadge: campaignDto(campaign,state).rights.status === "APPROVED",
  };

  // Do not leak secret fulfillment template to public callers
  const safeCampaign = campaignDto(campaign,state);

  res.json({
    campaign: safeCampaign,
    seller: sellerInfo,
  });
  }catch{res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'Public campaign projection unavailable'});}
});

// POST create campaign draft (Seller only)
campaignRouter.post("/draft", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    assertDraftDeployment(req.get("X-GroupDeal-Deployment"));
    const campaign=CampaignEditorService.saveDraft(req.user!.userId,req.body,undefined,undefined,req.get("Idempotency-Key"));
    res.status(201).json({success:true,campaign});
  } catch (err: any) {
    res.status(err.message?.startsWith("CONFLICT")?409:err.message?.startsWith("FORBIDDEN")?403:400).json({ error: err.message });
  }
});

// Managed probes and campaign attachment commit under the same selected SQL authority.
const privateProbe=(req:any,res:any,next:any)=>{res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});next();};
campaignRouter.post('/:id/provider-probe',privateProbe,authMiddleware,requireRole('seller'),async(req:AuthenticatedRequest,res)=>{
  try{if(Object.keys(req.query).length)throw new z.ZodError([]);res.json(await ProviderDeliveryService.probe(req.sessionProof!,req.params.id,req.body,req.get('Idempotency-Key')??''));}catch(error){providerFailure(res,error);}
});
campaignRouter.get('/:id/provider-probes/:commandId',privateProbe,authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{
  try{if(Object.keys(req.query).length)throw new z.ZodError([]);res.json(ProviderDeliveryService.receipt(req.sessionProof!,req.params.id,req.params.commandId));}catch(error){providerFailure(res,error);}
});
campaignRouter.post("/test-delivery",privateProbe,authMiddleware,requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try{if(Object.keys(req.query).length)throw Error('VALIDATION: resource query is invalid');const {resourceId,deliveryMethod}=z.object({resourceId:z.string(),deliveryMethod:z.enum(['FILE_LINK','LICENSE_KEY'])}).strict().parse(req.body);const result=ResourceMutationService.probe(req.user!.userId,resourceId,deliveryMethod,{proof:req.sessionProof!,commandId:req.get('Idempotency-Key')});res.json({success:true,result:{success:true,probe:result.probe},receipt:result.receipt});}catch(error){resourceMutationFailure(res,error);}
});
campaignRouter.post("/:id/test-delivery",privateProbe,authMiddleware,requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try{if(Object.keys(req.query).length)throw Error('VALIDATION: resource query is invalid');const {resourceId}=z.object({resourceId:z.string()}).strict().parse(req.body);const result=ResourceMutationService.probe(req.user!.userId,resourceId,undefined,{proof:req.sessionProof!,commandId:req.get('Idempotency-Key'),campaignId:req.params.id});res.json({success:true,result:{success:true,probe:result.probe},receipt:result.receipt});}catch(error){resourceMutationFailure(res,error);}
});

// PUT update campaign (Only allowed when in DRAFT status)
campaignRouter.put("/:id", authMiddleware, requireRole("seller"), (req: AuthenticatedRequest, res) => {
  try {
    assertDraftDeployment(req.get("X-GroupDeal-Deployment"));
    const campaign = store.db.campaigns[req.params.id];
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (campaign.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    if (campaign.status !== "DRAFT") {
      res.status(400).json({
        error: "Cannot modify immutable campaign terms once active or finalized!",
      });
      return;
    }

    const {expectedVersion,...input}=req.body;
    const updated=CampaignEditorService.saveDraft(req.user!.userId,input,campaign.id,expectedVersion,req.get("Idempotency-Key"));
    res.json({success:true,campaign:updated});
  } catch (err: any) {
    res.status(err.message?.startsWith("CONFLICT")?409:400).json({ error: err.message });
  }
});

// Validate business prerequisites and persist the immutable payload before wallet signing.
campaignRouter.post("/:id/prepare-publish",authMiddleware,requireRole("seller"),(req:AuthenticatedRequest,res)=>{try{const {idempotencyKey}=z.object({idempotencyKey:z.string().regex(/^[-A-Za-z0-9:_]{8,180}$/)}).strict().parse(req.body);res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.json(OperationPreparationService.publish(req.user!.userId,req.params.id,idempotencyKey,req.sessionProof));}catch(error){operationPreparationFailure(res,error)}});

// POST publish campaign onchain (Seller)
campaignRouter.post('/:id/publish',authMiddleware,requireRole('seller'),async(req:AuthenticatedRequest,res)=>{
 res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
 try{
  const {txHash}=z.object({txHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict().parse(req.body);if(Object.keys(req.query).length)throw new z.ZodError([]);
  const result=await OperationCompletionService.publish(req.user!.userId,req.params.id,txHash,req.sessionProof),state=store.readPublicProjectionState({campaignId:result.campaign.id},config.arcChainId,config.hubAddress);
  res.json({success:true,campaign:campaignDto(state.campaigns[result.campaign.id],state)});
 }catch(error){if(error instanceof z.ZodError){res.status(400).json({error:'Invalid publication input',code:'OPERATION_COMPLETION_INPUT_INVALID'});return;}operationCompletionFailure(res,error);}
});

// Public clarification history is immutable; financial/material terms remain pinned.
campaignRouter.get('/:id/amendments',privateProbe,authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{
 try{if(Object.keys(req.query).length)throw new Error('CONFLICT: query override');res.json(CampaignAmendmentService.list(req.sessionProof,req.params.id));}catch(e){campaignAmendmentFailure(res,e)}
});
campaignRouter.post('/:id/amend',privateProbe,authMiddleware,requireRole('seller'),(req:AuthenticatedRequest,res)=>{
 try{if(Object.keys(req.query).length)throw new Error('CONFLICT: query override');res.json(CampaignAmendmentService.append(req.sessionProof,req.params.id,req.body,req.get('Idempotency-Key')));}catch(e){campaignAmendmentFailure(res,e)}
});
