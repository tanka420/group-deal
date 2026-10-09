import express,{Router} from 'express';
import {z} from 'zod';
import {store,type TransactionalStore} from '../db/store';
import {config} from '../config';
import {publicRateLimit} from '../middleware/publicRateLimit';
import type {AuthenticatedRequest} from '../middleware/auth';
import {SessionRegistry,SessionError} from '../services/sessionService';
import {BridgeTransferRegistry} from '../services/bridgeTransferRegistry';
import {readServerBridgeRpc} from '../services/bridgeReadRpc';
import {BridgeTransferError,bridgeTransferOrigin,bridgeTransferScope} from '../domain/bridgeTransfer';
import type {ServerBridgeRead} from '../domain/bridgeReceipt';
import {SignerReservationError} from '../domain/signerReservation';
const defaults={requests:120,expensiveRequests:24,ipRequests:240,concurrentAccounts:8,reads:128,readWindowMs:25000};
type Limits=typeof defaults;
const empty=z.object({}).strict(),id=z.string().uuid(),hash=z.string().regex(/^0x[0-9a-f]{64}$/i).transform(v=>v.toLowerCase());
function invalid():never{throw new BridgeTransferError('BRIDGE_TRANSFER_INPUT_INVALID',400)}
function failure(res:express.Response,error:unknown){const e=error instanceof BridgeTransferError||error instanceof SessionError||error instanceof SignerReservationError?error:undefined;if(e?.status===429)res.setHeader('Retry-After','60');res.status(e?.status??503).json({code:e?.code??'BRIDGE_TRANSFER_UNAVAILABLE'});}
/** One bounded transport per API action; no arbitrary URL or RPC method enters from the request. */
function boundedRead(read:ServerBridgeRead,limits:Limits):ServerBridgeRead{const started=Date.now();let count=0;return async<T>(chain:Parameters<ServerBridgeRead>[0],method:string,params:unknown[])=>{if(++count>limits.reads||Date.now()<started||Date.now()-started>limits.readWindowMs)throw new BridgeTransferError('BRIDGE_READ_BUDGET_EXHAUSTED',503);return await read<T>(chain,method,params);};}
export function createBridgeRouter(options:{database:TransactionalStore;origins:string[];read?:ServerBridgeRead;limits?:Partial<Limits>}){
 const router=Router(),origins=[...new Set(options.origins.map(bridgeTransferOrigin))],sessions=new SessionRegistry(options.database),limits={...defaults,...options.limits},read=options.read??readServerBridgeRpc;
 if(!origins.length||Object.values(limits).some(v=>!Number.isSafeInteger(v)||v<1))throw Error('Invalid bridge API configuration');
 const buckets=new Map<string,{count:number;expensive:number;expiresAt:number}>(),busy=new Set<string>();
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
 router.use(publicRateLimit(limits.ipRequests));
 router.use((req:AuthenticatedRequest,res,next)=>{try{const auth=req.get('authorization');if(!auth||!/^Bearer [^\s]+$/.test(auth))throw new SessionError('AUTH_SESSION_INACTIVE',401);const proof=sessions.authenticate(auth.slice(7));req.sessionProof=proof;const origin=req.get('origin');if(origin!==undefined&&!origins.includes(origin)||req.method!=='GET'&&(!origin||!origins.includes(origin)))throw new BridgeTransferError('BRIDGE_TRANSFER_ORIGIN_INVALID',403);const now=Date.now();let b=buckets.get(proof.account.id);if(!b||b.expiresAt<=now){for(const [k,v]of buckets)if(v.expiresAt<=now)buckets.delete(k);if(buckets.size>=2048&&!b)throw new BridgeTransferError('BRIDGE_RATE_LIMITED',429);b={count:0,expensive:0,expiresAt:now+60000};buckets.set(proof.account.id,b);}if(++b.count>limits.requests)throw new BridgeTransferError('BRIDGE_RATE_LIMITED',429);next();}catch(e){failure(res,e);}});
 router.use(express.json({limit:'24kb',strict:true}));
 const registry=(req:AuthenticatedRequest)=>new BridgeTransferRegistry(options.database,req.get('origin')??origins[0]);
 const strict=(req:AuthenticatedRequest)=>{if(Object.keys(req.query).length)invalid();};
 const owned=(req:AuthenticatedRequest)=>{strict(req);const record=registry(req).get(req.sessionProof!,id.parse(req.params.id));if(!record)throw new BridgeTransferError('BRIDGE_TRANSFER_NOT_FOUND',404);if(req.method!=='GET'&&record.origin!==req.get('origin'))throw new BridgeTransferError('BRIDGE_TRANSFER_ORIGIN_INVALID',403);return record;};
 async function execute(req:AuthenticatedRequest,res:express.Response,expensive:boolean,work:(registry:BridgeTransferRegistry,read:ServerBridgeRead)=>unknown,status=200){const actor=req.sessionProof!.account.id;let held=false;try{strict(req);if(expensive){const b=buckets.get(actor)!;if(++b.expensive>limits.expensiveRequests)throw new BridgeTransferError('BRIDGE_RATE_LIMITED',429);if(busy.has(actor)||busy.size>=limits.concurrentAccounts)throw new BridgeTransferError('BRIDGE_TRANSFER_BUSY',429);busy.add(actor);held=true;}const result=await work(registry(req),boundedRead(read,limits));res.status(status).json(result);}catch(e){failure(res,e instanceof z.ZodError?new BridgeTransferError('BRIDGE_TRANSFER_INPUT_INVALID',400):e);}finally{if(held)busy.delete(actor);}}
 router.get('/current',(req:AuthenticatedRequest,res)=>{try{const query=z.object({recipient:z.string().regex(/^0x[0-9a-f]{40}$/)}).strict().parse(req.query);res.json({record:registry(req).current(req.sessionProof!,query.recipient)});}catch(e){failure(res,e instanceof z.ZodError?new BridgeTransferError('BRIDGE_TRANSFER_INPUT_INVALID',400):e);}});
 router.get('/:id',(req:AuthenticatedRequest,res)=>execute(req,res,false,()=>{const record=owned(req);return{record,sourceMessage:registry(req).sourceMessage(record)};}));
 router.post('/',(req:AuthenticatedRequest,res)=>execute(req,res,false,r=>{const p=z.object({idempotencyKey:id,scope:z.unknown()}).strict().parse(req.body),record=r.create(req.sessionProof!,bridgeTransferScope(p.scope),p.idempotencyKey);return{record,sourceMessage:r.sourceMessage(record)};},201));
 router.post('/:id/authorize',(req:AuthenticatedRequest,res)=>execute(req,res,true,async(r,read)=>{const record=owned(req),p=z.object({signature:z.string().max(132)}).strict().parse(req.body);return{record:await r.authorizeFresh(req.sessionProof!,record.id,p.signature,read)};}));
 router.post('/:id/mint-recovery-challenge',(req:AuthenticatedRequest,res)=>execute(req,res,false,r=>{const record=owned(req);return{challenge:r.mintRecoveryChallenge(req.sessionProof!,record.id,req.body)};}));
 router.post('/:id/ready',(req:AuthenticatedRequest,res)=>execute(req,res,true,async(r,read)=>{const record=owned(req);return await r.ready(req.sessionProof!,record.id,req.body,read);}));
 router.post('/:id/writes/:writeId/hash',(req:AuthenticatedRequest,res)=>execute(req,res,true,async(r,read)=>{const record=owned(req),p=z.object({txHash:hash,expectedRevision:z.number().int().nonnegative().safe()}).strict().parse(req.body);return{record:await r.attachObserved(req.sessionProof!,record.id,id.parse(req.params.writeId),p.txHash,p.expectedRevision,read)};},202));
 router.post('/:id/inspect',(req:AuthenticatedRequest,res)=>execute(req,res,true,async(r,read)=>{const record=owned(req);empty.parse(req.body);return{inspection:await r.inspect(req.sessionProof!,record.id,read)};}));
 router.post('/:id/close',(req:AuthenticatedRequest,res)=>execute(req,res,true,async(r,read)=>{const record=owned(req),p=z.object({mode:z.enum(['complete','stop-before-burn'])}).strict().parse(req.body);return{record:await r.close(req.sessionProof!,record.id,p.mode,read)};}));
 router.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const p=error as {type?:unknown};if(p?.type==='entity.too.large')res.status(413).json({code:'BRIDGE_TRANSFER_INPUT_TOO_LARGE'});else if(p?.type==='entity.parse.failed')res.status(400).json({code:'BRIDGE_TRANSFER_INPUT_INVALID'});else failure(res,error);});
 return router;
}
export const bridgeRouter=createBridgeRouter({database:store,origins:[...config.allowedOrigins,...(config.publicAppUrl?[new URL(config.publicAppUrl).origin]:[])]});