import {OperationCompletionError} from '../domain/operationCompletion';
import {OperationCompletionService,operationCompletionFailure} from '../services/operationCompletionService';
import {OperationPreparationService,operationPreparationFailure} from '../services/operationPreparationService';
import express,{Router,ErrorRequestHandler} from "express";
import { authMiddleware,AuthenticatedRequest,requireRole } from "../middleware/auth";
import { ResourceDeliveryService } from "../services/resourceDeliveryService";
import { OperationService } from "../services/operationService";
import { DeliveryService } from "../services/deliveryService";
import { decryptEntitlement } from "../utils/crypto";
import { orderDto } from "../services/orderDto";
import { store } from "../db/store";
import {z} from "zod";
import {DeliveryRetryService} from "../services/deliveryRetryService";
import {ResourceAccessError} from '../services/buyerResourceView';
import {SessionError} from '../services/sessionService';
import {sellerResourceInventory,SellerResourceInventoryError} from '../services/sellerResourceInventory';
import {ResourceMutationService,resourceMutationFailure} from '../services/resourceMutationService';

export const resourceJsonErrorHandler:ErrorRequestHandler=(error,req,res,next)=>{if(/^\/api\/(?:delivery\/(?:versions\/[^/]+\/resources|resources\/[^/]+\/(?:keys|probe)|resource-commands\/[^/]+\/cancel)|campaigns\/(?:[^/]+\/)?test-delivery)$/.test(req.originalUrl.split('?')[0])&&(error?.type==='entity.parse.failed'||error?.type==='entity.too.large')){res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.status(error.type==='entity.too.large'?413:400).json({error:'RESOURCE_INPUT_INVALID'});return;}next(error);};

export const deliveryRouter=Router();
deliveryRouter.use((_req,res,next)=>{res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});next();});
deliveryRouter.use(authMiddleware);
deliveryRouter.get("/resources",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try{res.json(sellerResourceInventory(req.user!.userId,req.sessionProof!,req.query));}catch(error){if(error instanceof SellerResourceInventoryError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}res.status(503).json({error:'RESOURCE_INVENTORY_UNAVAILABLE'});}
});
function failure(res:any,error:unknown) {const message=error instanceof Error?error.message:"Delivery operation failed";res.status(message.startsWith("FORBIDDEN")?403:message.startsWith("CONFLICT")?409:400).json({error:message});}
const resourceQuery=(req:AuthenticatedRequest)=>{if(Object.keys(req.query).length)throw Error('VALIDATION: resource query is invalid');};
deliveryRouter.get('/resource-commands/:id',requireRole('seller'),(req:AuthenticatedRequest,res)=>{try{resourceQuery(req);res.json(ResourceMutationService.receipt(req.user!.userId,req.params.id,req.sessionProof!));}catch(error){resourceMutationFailure(res,error);}});
deliveryRouter.post('/resource-commands/:id/cancel',requireRole('seller'),(req:AuthenticatedRequest,res)=>{try{resourceQuery(req);z.object({}).strict().parse(req.body);res.json(ResourceMutationService.cancel(req.user!.userId,req.params.id,req.sessionProof!));}catch(error){resourceMutationFailure(res,error);}});
deliveryRouter.post("/versions/:id/resources",requireRole("seller"),express.raw({type:"application/octet-stream",limit:"16mb"}),(req:AuthenticatedRequest,res)=>{
  try {resourceQuery(req);if(!Buffer.isBuffer(req.body))throw new Error("VALIDATION: binary resource body is required");res.status(201).json(ResourceMutationService.upload(req.user!.userId,req.params.id,decodeURIComponent(String(req.headers['x-file-name']||'')),String(req.headers['x-resource-mime']||''),req.body,{proof:req.sessionProof!,commandId:req.get('Idempotency-Key')}));}catch(error){resourceMutationFailure(res,error);}
});
deliveryRouter.post("/resources/:id/keys",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try {resourceQuery(req);const {keys}=z.object({keys:z.unknown()}).strict().parse(req.body);res.json(ResourceMutationService.importKeys(req.user!.userId,req.params.id,keys,{proof:req.sessionProof!,commandId:req.get('Idempotency-Key')}));}catch(error){resourceMutationFailure(res,error);}
});
deliveryRouter.post("/resources/:id/probe",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try {resourceQuery(req);const {method}=z.object({method:z.enum(['FILE_LINK','LICENSE_KEY'])}).strict().parse(req.body);res.json(ResourceMutationService.probe(req.user!.userId,req.params.id,method,{proof:req.sessionProof!,commandId:req.get('Idempotency-Key')}));}catch(error){resourceMutationFailure(res,error);}
});
deliveryRouter.use(resourceJsonErrorHandler);
deliveryRouter.post("/orders/:id/prepare",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try {const {idempotencyKey}=z.object({idempotencyKey:z.string().regex(/^[-A-Za-z0-9:_]{8,180}$/)}).strict().parse(req.body);res.json({operation:ResourceDeliveryService.prepare(req.user!.userId,req.params.id,idempotencyKey,req.sessionProof)});}catch(error){operationPreparationFailure(res,error);}
});
deliveryRouter.post("/operations/:id/retry",requireRole("seller"),async(req:AuthenticatedRequest,res)=>{
  try{const {idempotencyKey}=z.object({idempotencyKey:z.string().regex(/^[a-zA-Z0-9:_-]{8,180}$/)}).strict().parse(req.body);res.json({operation:await DeliveryRetryService.retry(req.user!.userId,req.params.id,idempotencyKey,req.sessionProof)});}catch(error){operationPreparationFailure(res,error);}
});
deliveryRouter.post('/operations/:id/finish',requireRole('seller'),async(req:AuthenticatedRequest,res)=>{
 try{
  const {txHash}=z.object({txHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict().parse(req.body);if(Object.keys(req.query).length)throw new z.ZodError([]);
  const operation=OperationCompletionService.owned(req.user!.userId,req.params.id,req.sessionProof);if(operation.action!=='DELIVER')throw new OperationCompletionError('OPERATION_COMPLETION_FORBIDDEN',403);
  OperationService.submit(req.user!.userId,operation.id,txHash,req.sessionProof);
  const result=await OperationCompletionService.recover(req.user!.userId,operation.id,req.sessionProof),current=OperationCompletionService.result(req.user!.userId,operation.id,req.sessionProof);
  res.json({success:true,order:orderDto(current.order!),operation:result.operation});
 }catch(error){if(error instanceof z.ZodError){res.status(400).json({error:'Invalid delivery input',code:'OPERATION_COMPLETION_INPUT_INVALID'});return;}operationCompletionFailure(res,error);}
});
function resourceFailure(res:any,error:unknown){if(error instanceof ResourceAccessError||error instanceof SessionError){res.status(error.status).json({error:error.code});return;}res.status(503).json({error:'RESOURCE_UNAVAILABLE'});}
deliveryRouter.get("/orders/:id/grants",(req:AuthenticatedRequest,res)=>{try{res.json({orderId:req.params.id,buyerAccountId:req.user!.userId,grants:ResourceDeliveryService.list(req.user!.userId,req.params.id,req.sessionProof),serverTime:Date.now()});}catch(error){resourceFailure(res,error);}});
deliveryRouter.post("/grants/:id/redeem",(req:AuthenticatedRequest,res)=>{try{if(!req.body||Object.keys(req.body).length!==1||typeof req.body.key!=='string')throw new ResourceAccessError('RESOURCE_INPUT_INVALID',400);ResourceDeliveryService.redeem(req.user!.userId,req.params.id,req.body.key,req.sessionProof);res.json({success:true});}catch(error){resourceFailure(res,error);}});
deliveryRouter.get("/grants/:id/download-link",(req:AuthenticatedRequest,res)=>{try{res.json(ResourceDeliveryService.signedDownload(req.user!.userId,req.params.id,req.sessionProof));}catch(error){resourceFailure(res,error);}});
deliveryRouter.get("/grants/:id/download",(req:AuthenticatedRequest,res)=>{
  try{
    ResourceDeliveryService.verifyDownloadToken(req.user!.userId,req.params.id,String(req.query.expiresAt||""),String(req.query.keyId||""),String(req.query.signature||""));
    const file=ResourceDeliveryService.download(req.user!.userId,req.params.id,req.sessionProof);
    res.set({"Content-Type":file.mimeType,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Content-Length":String(file.bytes.length)}).send(file.bytes);
  }catch(error){resourceFailure(res,error);}
});
