import {Router,raw,ErrorRequestHandler} from 'express';
import {authMiddleware,requireRole,AuthenticatedRequest} from '../middleware/auth';
import {SessionError} from '../services/sessionService';
import {AccountAccessError} from '../domain/accountAccess';
import {productImageLimit} from '../domain/productMedia';
import {readPublicProductImage,uploadProductImage} from '../services/productMediaService';

export const productMediaRouter=Router();
productMediaRouter.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});next()});
productMediaRouter.post('/',authMiddleware,requireRole('seller'),raw({type:'application/octet-stream',limit:productImageLimit}),(req:AuthenticatedRequest,res)=>{
 try{
  if(Object.keys(req.query).length||!Buffer.isBuffer(req.body)||!req.sessionProof)throw Error('MEDIA_INPUT_INVALID');
  res.status(201).json(uploadProductImage(req.sessionProof,req.body));
 }catch(error){if(error instanceof SessionError||error instanceof AccountAccessError){res.status(error.status).json({error:error.code});return;}const message=error instanceof Error?error.message:'';res.status(message==='MEDIA_INPUT_INVALID'?400:message==='MEDIA_QUOTA_EXCEEDED'?413:503).json({error:message==='MEDIA_INPUT_INVALID'||message==='MEDIA_QUOTA_EXCEEDED'?message:'MEDIA_UNAVAILABLE'});}
});
productMediaRouter.get('/:id',(req,res)=>{
 try{
  if(Object.keys(req.query).length){res.status(400).end();return;}
  const image=readPublicProductImage(req.params.id);if(!image){res.status(404).end();return;}
  res.set({'Content-Type':image.mimeType,'Content-Length':String(image.bytes.length),'Cache-Control':'public, max-age=31536000, immutable','Content-Security-Policy':"default-src 'none'; sandbox",'ETag':'"'+image.sha256+'"'}).end(image.bytes);
 }catch{res.status(503).end();}
});
const bodyError:ErrorRequestHandler=(error,_req,res,_next)=>{res.status(error?.type==='entity.too.large'?413:400).json({error:'MEDIA_INPUT_INVALID'})};
productMediaRouter.use(bodyError);
