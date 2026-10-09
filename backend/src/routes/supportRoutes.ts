import express,{Router} from 'express';
import {authMiddleware,optionalOperator,AuthenticatedRequest} from '../middleware/auth';
import {SupportService,SupportError} from '../services/supportService';
import {SessionError} from '../services/sessionService';

export const supportRouter=Router();
supportRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
supportRouter.use(authMiddleware,optionalOperator);
// Mounted before the application's default JSON parser; bounded attachment input after authentication.
supportRouter.use(express.json({limit:'4500kb',strict:true}));
function execute(req:AuthenticatedRequest,res:express.Response,work:()=>unknown){try{res.json(work());}catch(e){const known=e instanceof SupportError||e instanceof SessionError;const status=known?e.status:503;if(e instanceof SupportError&&e.retryAfter)res.setHeader('Retry-After',e.retryAfter);res.status(status).json({code:known?e.code:'SUPPORT_UNAVAILABLE'});}}
const noQuery=(req:express.Request)=>{if(Object.keys(req.query).length)throw new SupportError('SUPPORT_INVALID_QUERY',400);};
supportRouter.get('/tickets',(req:AuthenticatedRequest,res)=>execute(req,res,()=>SupportService.list(req.user!.userId,req.query,req.sessionProof)));
supportRouter.get('/operators',(req:AuthenticatedRequest,res)=>execute(req,res,()=>{noQuery(req);return SupportService.operators(req.user!.userId,req.sessionProof);}));
supportRouter.post('/tickets',(req:AuthenticatedRequest,res)=>execute(req,res,()=>{noQuery(req);return SupportService.create(req.user!.userId,req.body,req.sessionProof);}));
supportRouter.get('/commands/:id',(req:AuthenticatedRequest,res)=>execute(req,res,()=>{noQuery(req);return SupportService.command(req.user!.userId,req.params.id,req.sessionProof);}));
supportRouter.get('/tickets/:id',(req:AuthenticatedRequest,res)=>execute(req,res,()=>{noQuery(req);return SupportService.detail(req.user!.userId,req.params.id,req.sessionProof);}));
for(const [path,method] of [['messages','reply'],['status','status'],['assignment','assign'],['attachments/remove','removeAttachment']] as const)supportRouter.post('/tickets/:id/'+path,(req:AuthenticatedRequest,res)=>execute(req,res,()=>{noQuery(req);return SupportService[method](req.user!.userId,req.params.id,req.body,req.sessionProof);}));
supportRouter.get('/tickets/:id/attachments/:attachmentId',(req:AuthenticatedRequest,res)=>{
 try{noQuery(req);const file=SupportService.download(req.user!.userId,req.params.id,req.params.attachmentId,req.sessionProof),name=encodeURIComponent(file.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="support-attachment"; filename*=UTF-8''${name}`);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Content-Length',file.bytes.length);res.send(file.bytes);}catch(e){const known=e instanceof SupportError||e instanceof SessionError;res.status(known?e.status:503).json({code:known?e.code:'SUPPORT_UNAVAILABLE'});}
});
supportRouter.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error?.type==='entity.too.large'?413:400).json({code:error?.type==='entity.too.large'?'SUPPORT_BODY_TOO_LARGE':'SUPPORT_INVALID_JSON'}));
