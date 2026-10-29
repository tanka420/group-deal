import express,{Router} from 'express';
import {z} from 'zod';
import {config} from '../config';
import {store,type TransactionalStore} from '../db/store';
import {SessionRegistry,SessionError} from '../services/sessionService';
import {WalletFlowService} from '../services/walletFlowService';
import {WalletFlowError} from '../domain/walletQuote';
import {WalletCircleRejectedError} from '../domain/walletCircleRejection';
import {CircleAuthError} from '../domain/circleAuthentication';
import {SignerReservationError} from '../domain/signerReservation';
import {publicRateLimit} from '../middleware/publicRateLimit';
import type {AuthenticatedRequest} from '../middleware/auth';

const id=z.string().regex(/^wop_[a-f0-9]{64}$/),stepId=z.string().regex(/^wrt_[a-f0-9]{64}$/),empty=z.object({}).strict();
function failure(res:express.Response,error:unknown){const e=error instanceof WalletFlowError||error instanceof SessionError||error instanceof CircleAuthError||error instanceof SignerReservationError?error:undefined;const status=error instanceof z.ZodError?400:e?.status??503;if(status===429)res.setHeader('Retry-After','60');res.status(status).json({code:e?.code??(status===400?'WALLET_REQUEST_INVALID':'WALLET_SERVICE_UNAVAILABLE'),...(error instanceof WalletCircleRejectedError?{diagnosticId:error.rejection.diagnosticId}:{})});}
export function createWalletFlowRouter(options:{database:TransactionalStore;origins:string[];service?:WalletFlowService}){
 const router=Router(),sessions=new SessionRegistry(options.database),service=options.service??new WalletFlowService(options.database),origins=new Set(options.origins),buckets=new Map<string,{expiresAt:number;count:number}>(),busy=new Set<string>();
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});router.use(publicRateLimit(240));
 router.use((req:AuthenticatedRequest,res,next)=>{try{const auth=req.get('authorization');if(!auth||!/^Bearer [^\s]+$/.test(auth))throw new SessionError('AUTH_SESSION_INACTIVE',401);const proof=sessions.authenticate(auth.slice(7));if(proof.record.realm==='ADMIN')throw new WalletFlowError('WALLET_APP_SESSION_REQUIRED',403);req.sessionProof=proof;const origin=req.get('origin');if(origin!==undefined&&!origins.has(origin)||req.method!=='GET'&&(!origin||!origins.has(origin)))throw new WalletFlowError('WALLET_ORIGIN_INVALID',403);const now=Date.now();for(const [key,b]of buckets)if(b.expiresAt<=now)buckets.delete(key);let bucket=buckets.get(proof.account.id);if(!bucket){if(buckets.size>=2048)throw new WalletFlowError('WALLET_RATE_LIMITED',429);bucket={expiresAt:now+60000,count:0};buckets.set(proof.account.id,bucket);}if(++bucket.count>120)throw new WalletFlowError('WALLET_RATE_LIMITED',429);next();}catch(e){failure(res,e);}});
 router.use(express.json({limit:'12kb'}));
 const run=(work:(req:AuthenticatedRequest)=>unknown|Promise<unknown>,allowQuery=false)=>async(req:AuthenticatedRequest,res:express.Response)=>{const account=req.sessionProof!.account.id;try{if(!allowQuery&&Object.keys(req.query).length)throw new WalletFlowError('WALLET_QUERY_INVALID',400);if(req.method!=='GET'){if(busy.has(account)||busy.size>=16)throw new WalletFlowError('WALLET_REQUEST_IN_PROGRESS',429);busy.add(account);}try{res.json(await work(req));}finally{if(req.method!=='GET')busy.delete(account);}}catch(e){failure(res,e);}};
 router.get('/holdings',run(req=>service.holdings(req.sessionProof!,req.query),true));
 router.get('/balances',run(req=>service.balances(req.sessionProof!)));
 router.get('/',run(req=>service.list(req.sessionProof!,req.query),true));
 router.post('/quote',run(req=>service.quote(req.sessionProof!,req.body)));
 router.post('/preview',run(req=>service.preview(req.sessionProof!,req.body)));
 router.post('/start',run(req=>service.start(req.sessionProof!,req.body)));
 router.get('/:id',run(req=>service.read(req.sessionProof!,id.parse(req.params.id))));
 const reference=(req:AuthenticatedRequest)=>[req.sessionProof!,id.parse(req.params.id),stepId.parse(req.params.stepId)] as const;
 router.post('/:id/steps/:stepId/ready',run(req=>service.ready(...reference(req),req.body)));
 router.post('/:id/steps/:stepId/hash',run(req=>service.observe(...reference(req),req.body)));
 router.post('/:id/steps/:stepId/recover',run(req=>{empty.parse(req.body);return service.recover(...reference(req));}));
 router.post('/:id/steps/:stepId/circle/challenge',run(req=>service.circleChallenge(...reference(req),req.body)));
 router.post('/:id/steps/:stepId/circle/resume',run(req=>service.resumeCircleChallenge(...reference(req),req.body)));
 router.post('/:id/steps/:stepId/circle/repair',run(req=>service.repairCircleFee(...reference(req),req.body)));
 router.post('/:id/steps/:stepId/circle/status',run(req=>service.circleStatus(...reference(req),req.body)));
 router.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(error?.type==='entity.too.large')res.status(413).json({code:'WALLET_REQUEST_TOO_LARGE'});else if(error?.type==='entity.parse.failed')res.status(400).json({code:'WALLET_REQUEST_INVALID'});else failure(res,error);});return router;
}
export const walletFlowRouter=createWalletFlowRouter({database:store,origins:[...config.allowedOrigins,...(config.publicAppUrl?[new URL(config.publicAppUrl).origin]:[])]});
