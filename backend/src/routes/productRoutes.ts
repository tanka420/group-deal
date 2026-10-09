import { Router,ErrorRequestHandler } from "express";
import { store } from "../db/store";
import { authMiddleware, AuthenticatedRequest, requireRole } from "../middleware/auth";
import { ProductService } from "../services/productService";
import {z,ZodError} from 'zod';
import {StorageConflict,LegacyWriterConflict} from '../db/rowPersistence';
import {SessionService,SessionError} from '../services/sessionService';
import {productInventory,productVersionInventory,licenseVersionInventory,rightsInventory,reviewedProductInventory} from '../domain/product';

export const productRouter = Router();
/** Install after the application's JSON parser; upstream parser errors skip a mounted normal router. */
export const productJsonErrorHandler:ErrorRequestHandler=(error,req,res,next)=>{if(/^\/api\/products(?:\/|$)/.test(req.path)&&(error?.type==='entity.parse.failed'||error?.type==='entity.too.large')){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.status(error.type==='entity.too.large'?413:400).json({error:'PRODUCT_INPUT_INVALID'});return;}next(error)};
productRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');next()});
productRouter.use(authMiddleware);
productRouter.use((req,res,next)=>{if(req.method==='POST'&&Object.keys(req.query).length){res.status(400).json({error:'PRODUCT_INPUT_INVALID'});return;}next()});
const inventoryFailure=(res:any,error:unknown)=>{if(error instanceof SessionError){res.status(error.status).json({error:error.code});return;}res.status(503).json({error:'PRODUCT_INVENTORY_UNAVAILABLE'})};
const inventory=(req:AuthenticatedRequest,review:boolean)=>{const proof=req.sessionProof!,snapshot=store.readProductInventoryState(req.user!.userId,proof.key,review),account=review?SessionService.assertOperatorCommitted(proof,snapshot.auth):SessionService.assertCommitted(proof,snapshot.auth);if(!account.roles.includes(review?'operator':'seller'))throw new SessionError(review?'OPERATOR_ROLE_REQUIRED':'SELLER_ROLE_REQUIRED',403);return {snapshot,account}};
productRouter.get("/mine",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  if(Object.keys(req.query).length){res.status(400).json({error:'PRODUCT_INVENTORY_INPUT_INVALID'});return;}
  try{const {snapshot,account}=inventory(req,false),products=snapshot.products.map(p=>({...productInventory(p.product),version:productVersionInventory(p.version),license:licenseVersionInventory(p.license),rights:p.rights.map(rightsInventory)}));res.json({sellerAccountId:account.id,serverTime:Date.now(),revision:snapshot.revision,products})}catch(error){inventoryFailure(res,error)}
});
function failure(res:any,error:unknown) {
  if(error instanceof SessionError){res.status(error.status).json({error:error.code});return;}
  const message=error instanceof Error?error.message:'';
  if(message==='PRODUCT_COMMAND_CANCELED'){res.status(409).json({error:'PRODUCT_COMMAND_CANCELED'});return;}
  if(message==='PRODUCT_COMMAND_UNAVAILABLE'){res.status(503).json({error:'PRODUCT_COMMAND_UNAVAILABLE'});return;}
  const [status,code]=error instanceof ZodError||message.startsWith('VALIDATION')?[400,'PRODUCT_INPUT_INVALID']:message.startsWith('FORBIDDEN')?[403,'PRODUCT_FORBIDDEN']:message.startsWith('NOT_FOUND')?[404,'PRODUCT_NOT_FOUND']:error instanceof StorageConflict||error instanceof LegacyWriterConflict||message.startsWith('CONFLICT')?[409,'PRODUCT_STATE_CONFLICT']:[503,'PRODUCT_MUTATION_UNAVAILABLE'];
  res.status(status).json({error:code});
}
const bodyObject=(body:unknown)=>{if(!body||typeof body!=='object'||Array.isArray(body))throw Error('VALIDATION: product body is invalid');return body as Record<string,unknown>};
const mutationCommandId=(req:AuthenticatedRequest)=>z.string().min(8).max(180).regex(/^[-A-Za-z0-9:_]+$/).refine(v=>!['__proto__','prototype','constructor'].includes(v)).parse(req.get('Idempotency-Key'));
productRouter.get('/commands/:id',requireRole('seller'),(req:AuthenticatedRequest,res)=>{if(Object.keys(req.query).length){res.status(400).json({error:'PRODUCT_INPUT_INVALID'});return;}try{res.json(ProductService.commandReceipt(req.user!.userId,req.params.id,req.sessionProof!))}catch(error){failure(res,error)}});
productRouter.post('/commands/:id/cancel',requireRole('seller'),(req:AuthenticatedRequest,res)=>{try{z.object({}).strict().parse(req.body);res.json(ProductService.cancelCommand(req.user!.userId,req.params.id,req.sessionProof!))}catch(error){failure(res,error)}});
productRouter.post("/",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try { res.status(201).json(ProductService.createVersion(req.user!.userId,req.body,undefined,undefined,req.sessionProof!,mutationCommandId(req))); } catch(error) {failure(res,error);}
});
productRouter.post("/:id/versions",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try { const {expectedVersionId,...input}=bodyObject(req.body);res.status(201).json(ProductService.createVersion(req.user!.userId,input,req.params.id,expectedVersionId as string,req.sessionProof!,mutationCommandId(req))); } catch(error) {failure(res,error);}
});
productRouter.post("/versions/:id/rights",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try {res.status(201).json(ProductService.submitRights(req.user!.userId,req.params.id,req.body,req.sessionProof!,mutationCommandId(req)));} catch(error) {failure(res,error);}
});
productRouter.post("/:id/archive",requireRole("seller"),(req:AuthenticatedRequest,res)=>{
  try {const {expectedVersionId}=z.object({expectedVersionId:z.string().min(1).max(180).refine(v=>!['__proto__','prototype','constructor'].includes(v))}).strict().parse(req.body);res.json(ProductService.archive(req.user!.userId,req.params.id,req.sessionProof!,mutationCommandId(req),expectedVersionId));} catch(error) {failure(res,error);}
});
productRouter.get("/rights/review",requireRole("operator"),(req:AuthenticatedRequest,res)=>{
  if(Object.keys(req.query).length){res.status(400).json({error:'PRODUCT_INVENTORY_INPUT_INVALID'});return;}
  try{const {snapshot,account}=inventory(req,true),rights=snapshot.rights.map(r=>({...rightsInventory(r.rights),product:r.version&&r.license?reviewedProductInventory(r.version,r.license):null}));res.json({operatorAccountId:account.id,serverTime:Date.now(),revision:snapshot.revision,rights})}catch(error){inventoryFailure(res,error)}
});
productRouter.post("/rights/:id/review",requireRole("operator"),(req:AuthenticatedRequest,res)=>{
  try {
    const {walletAddress,signature,challengeMessage,...decision}=bodyObject(req.body);
    res.json({rights:ProductService.reviewRights(req.user!.userId,req.params.id,decision,{proof:req.sessionProof!,stepUp:{walletAddress:walletAddress as string,signature:signature as string,challengeMessage:challengeMessage as string}})});
  } catch(error) {failure(res,error);}
});
