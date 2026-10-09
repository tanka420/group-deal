import {operatorEnrollmentService} from '../services/operatorEnrollment';
import {OperatorEnrollmentError} from '../domain/operatorEnrollment';
import { Router } from "express";
import * as crypto from "crypto";
import { AuthService } from "../services/authService";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { store, sanitizeUser } from "../db/store";
import {SessionService,SessionError} from "../services/sessionService";
import {WalletBindingService,WalletBindingError} from "../services/walletBindingService";
import {CircleWalletService} from "../services/circleWalletService";
import {config} from "../config";
import {z,ZodError} from "zod";
import {StorageConflict,LegacyWriterConflict} from '../db/rowPersistence';
import { SellerProfileService, SellerProfileError } from "../services/sellerProfileService";

import {WalletAuthError,walletAddress as parseWallet} from '../domain/walletAuthentication';
export const authRouter = Router();

const walletAuthHeaders=(res:import('express').Response)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');};
const walletAuthError=(res:import('express').Response,error:unknown)=>{
 const e=error instanceof WalletAuthError||error instanceof SessionError||error instanceof OperatorEnrollmentError?error:error instanceof ZodError?new WalletAuthError('WALLET_AUTH_INPUT_INVALID'):error instanceof WalletBindingError?new WalletAuthError('WALLET_AUTH_ORIGIN_INVALID',403):error instanceof StorageConflict||error instanceof LegacyWriterConflict||error instanceof Error&&error.message.startsWith('CONFLICT')?new WalletAuthError('WALLET_AUTH_CONFLICT',409):new WalletAuthError('WALLET_AUTH_UNAVAILABLE',503);res.status(e.status).json({error:e.code});
};
// Preserve the existing budget namespace so this patch cannot reset an active limit.
const walletAuthRateKey=(scope:string,value:string)=>scope+':'+crypto.createHash('sha256').update(value).digest('hex');
const walletAuthInput=(req:import('express').Request)=>{if(Object.keys(req.query).length)throw new WalletAuthError('WALLET_AUTH_INPUT_INVALID');};
authRouter.use(['/operator/enrollment','/operator/enrollment/challenge','/operator/enrollment/verify','/wallet/login/challenge','/wallet/login/verify','/wallet/challenge','/wallet/bind'],(_req,res,next)=>{walletAuthHeaders(res);next();});

authRouter.post("/otp/request", (req, res) => {
  res.status(410).json({
    error: "Legacy local OTP is disabled. Use /api/circle/email/token and Circle hosted verification.",
  });
});

authRouter.post("/otp/verify", (req, res) => {
  res.status(410).json({
    error: "Legacy local OTP is disabled. Use Circle hosted verification.",
  });
});


authRouter.get('/operator/enrollment',authMiddleware,async(req:AuthenticatedRequest,res)=>{walletAuthHeaders(res);try{walletAuthInput(req);if(req.body&&Object.keys(req.body).length)throw new OperatorEnrollmentError('OPERATOR_ENROLLMENT_INPUT_INVALID');res.json(await operatorEnrollmentService.status(req.sessionProof!));}catch(error){walletAuthError(res,error);}});
authRouter.post('/operator/enrollment/challenge',authMiddleware,async(req:AuthenticatedRequest,res)=>{walletAuthHeaders(res);try{walletAuthInput(req);const input=z.object({walletAddress:z.string()}).strict().parse(req.body),origin=walletOrigin(req.get('origin'));res.json(await operatorEnrollmentService.issue(req.sessionProof!,input.walletAddress,origin));}catch(error){walletAuthError(res,error);}});
authRouter.post('/operator/enrollment/verify',authMiddleware,async(req:AuthenticatedRequest,res)=>{walletAuthHeaders(res);try{walletAuthInput(req);const input=z.object({walletAddress:z.string(),signature:z.string().max(132),message:z.string().min(1).max(4096),nonce:z.string().regex(/^[a-f0-9]{32}$/)}).strict().parse(req.body),origin=walletOrigin(req.get('origin'));res.json(await operatorEnrollmentService.verify(req.sessionProof!,input,origin));}catch(error){walletAuthError(res,error);}});

// Wallet-first authentication: budget, committed nonce, credential and session are scoped writes.
authRouter.post('/wallet/login/challenge',(req,res)=>{walletAuthHeaders(res);try{
 walletAuthInput(req);const input=z.object({walletAddress:z.string()}).strict().parse(req.body),wallet=parseWallet(input.walletAddress),origin=walletOrigin(req.get('origin'));
 res.json(AuthService.issueWalletLoginChallenge(wallet,origin,[{key:walletAuthRateKey('wallet-login-address',wallet.toLowerCase()),limit:10,minimumIntervalMs:2000},{key:walletAuthRateKey('wallet-login-ip',req.ip||req.socket.remoteAddress||'unknown'),limit:30}]));
}catch(e){walletAuthError(res,e);}});
authRouter.post('/wallet/login/verify',(req,res)=>{walletAuthHeaders(res);try{
 walletAuthInput(req);walletOrigin(req.get('origin'));const input=z.object({walletAddress:z.string(),signature:z.string().max(132),message:z.string().min(1).max(4096),nonce:z.string().regex(/^[a-f0-9]{32}$/)}).strict().parse(req.body);
 res.json(AuthService.verifyWalletLogin(input.walletAddress,input.signature,input.message,input.nonce,[{key:walletAuthRateKey('wallet-login-verify-ip',req.ip||req.socket.remoteAddress||'unknown'),limit:60}]));
}catch(e){walletAuthError(res,e);}});

// Request cryptographic time-bound challenge nonce to bind wallet or payout
authRouter.post("/wallet/challenge", authMiddleware, async (req: AuthenticatedRequest, res) => {
  walletAuthHeaders(res);try {
    const { action, walletAddress } = req.body || {};
    if(action==='OPERATOR_ACTION'){
      res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
      if(Object.keys(req.query).length)throw new SessionError('OPERATOR_CHALLENGE_INPUT_INVALID',400);
      const parsed=z.object({action:z.literal('OPERATOR_ACTION'),walletAddress:z.string().regex(/^0x[a-fA-F0-9]{40}$/)}).strict().parse(req.body);
      await operatorEnrollmentService.authorize(req.sessionProof!);const challenge=AuthService.issueWalletChallenge(req.user!.userId,parsed.action,parsed.walletAddress,undefined,undefined,req.sessionProof!);res.json({success:true,...challenge});return;
    }
    if (action === "SELLER_PAYOUT") {
      res.status(410).json({ error: "SELLER_PROFILE_INTENT_REQUIRED" });
      return;
    }
    walletAuthInput(req);const input=z.object({action:z.literal('LINK_WALLET'),walletAddress:z.string()}).strict().parse(req.body);
    const challenge=AuthService.issueWalletChallenge(req.user!.userId,input.action,input.walletAddress,undefined,walletOrigin(req.get('origin')),req.sessionProof!);
    res.json({ success: true, ...challenge });
  } catch (err: any) {
    if(req.body?.action==='OPERATOR_ACTION'){
      const message=err instanceof Error?err.message:'';
      if(err instanceof SessionError||err instanceof OperatorEnrollmentError){res.status(err.status).json({error:err.code});return;}
      const [status,code]=err instanceof ZodError?[400,'OPERATOR_CHALLENGE_INPUT_INVALID']:err instanceof StorageConflict||err instanceof LegacyWriterConflict||message.startsWith('CONFLICT')?[409,'OPERATOR_CHALLENGE_CONFLICT']:message.startsWith('FORBIDDEN')?[403,'OPERATOR_CHALLENGE_FORBIDDEN']:[503,'OPERATOR_CHALLENGE_UNAVAILABLE'];res.status(status).json({error:code});return;
    }
    walletAuthError(res,err);
  }
});

authRouter.post('/wallet/bind',authMiddleware,(req:AuthenticatedRequest,res)=>{walletAuthHeaders(res);try{
 walletAuthInput(req);walletOrigin(req.get('origin'));const input=z.object({walletAddress:z.string(),signature:z.string().max(132),message:z.string().min(1).max(4096)}).strict().parse(req.body);
 const user=AuthService.linkExternalWallet(req.user!.userId,input.walletAddress,input.signature,input.message,req.sessionProof!);res.json({success:true,user});
}catch(e){walletAuthError(res,e);}});

authRouter.post("/seller/profile", authMiddleware, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({ error: "SELLER_PROFILE_INTENT_REQUIRED" });
});

// Private headers apply before authentication and input rejection on session routes.
authRouter.use((req,res,next)=>{if(!/^\/(?:me|logout|sessions|session\/activity|session-actions)(?:\/|$)/.test(req.path)){next();return}res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(Object.keys(req.query).length&&!(req.method==='GET'&&req.path==='/sessions')){res.status(400).json({error:'AUTH_SESSION_INVALID_QUERY'});return}next()});
authRouter.get("/me", authMiddleware, (req: AuthenticatedRequest, res) => {
  res.setHeader("Cache-Control","no-store");
  const user = req.sessionProof!.account;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: sanitizeUser(user),...SessionService.current(req.sessionProof!) });
});

const bearer=(req:AuthenticatedRequest)=>{const h=req.headers.authorization;if(typeof h!=="string"||!/^Bearer [^\s]+$/.test(h))throw new SessionError("AUTH_SESSION_INVALID");return h.slice(7);};
const sessionError=(res:import("express").Response,error:unknown)=>{const e=error instanceof SessionError?error:new SessionError("AUTH_SESSION_UNAVAILABLE",503);res.status(e.status).json({error:e.code});};
authRouter.post("/logout",(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(SessionService.logout(bearer(req),req.body));}catch(error){sessionError(res,error);}});
authRouter.get("/sessions",authMiddleware,(req:AuthenticatedRequest,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(SessionService.list(req.sessionProof!,req.query));}catch(error){sessionError(res,error);}});
authRouter.post("/session/activity",authMiddleware,(req,res)=>{try{if(!req.body||typeof req.body!=="object"||Array.isArray(req.body)||Object.keys(req.body).length)throw new SessionError("AUTH_SESSION_INVALID_INPUT",400);res.setHeader("Cache-Control","no-store");res.json(SessionService.activity(bearer(req)));}catch(error){sessionError(res,error);}});
// Only a previously committed command may be replayed/read with its own revoked bearer.
// This exception never opens normal protected APIs or lets an inactive session start a new command.
authRouter.post("/sessions/revoke-others",(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(SessionService.command(bearer(req),"OTHERS",undefined,req.body));}catch(error){sessionError(res,error);}});
authRouter.post("/sessions/revoke-all",(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(SessionService.command(bearer(req),"ALL",undefined,req.body));}catch(error){sessionError(res,error);}});
authRouter.post("/sessions/:id/revoke",(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(SessionService.command(bearer(req),"ONE",req.params.id,req.body));}catch(error){sessionError(res,error);}});
authRouter.get("/session-actions/:requestId",(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(SessionService.commandStatus(bearer(req),req.params.requestId));}catch(error){sessionError(res,error);}});

const walletError=(res:import("express").Response,error:unknown)=>{const e=error instanceof SessionError||error instanceof WalletBindingError?error:new WalletBindingError("WALLET_BINDING_UNAVAILABLE",503);res.status(e.status).json({error:e.code});};
function walletOrigin(origin:string|undefined){
  const configured=config.publicAppUrl?new URL(config.publicAppUrl).origin:undefined;
  if(origin&&origin!==configured&&!config.allowedOrigins.includes(origin))throw new WalletBindingError("WALLET_BINDING_INVALID_ORIGIN",403);
  return origin||configured||"groupdeal.app";
}
authRouter.get("/wallets",authMiddleware,(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(WalletBindingService.inventory(bearer(req),req.query));}catch(e){walletError(res,e);}});
authRouter.post("/wallet-intents",authMiddleware,(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(WalletBindingService.prepare(bearer(req),req.body,walletOrigin(req.get("origin"))));}catch(e){walletError(res,e);}});
authRouter.get("/wallet-intents/:id",authMiddleware,(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(WalletBindingService.status(bearer(req),req.params.id));}catch(e){walletError(res,e);}});
authRouter.post("/wallet-intents/:id/commit",authMiddleware,(req,res)=>{try{res.setHeader("Cache-Control","no-store");res.json(WalletBindingService.commit(bearer(req),req.params.id,req.body));}catch(e){walletError(res,e);}});
authRouter.post("/wallet-intents/:id/cancel",authMiddleware,(req,res)=>{try{res.setHeader("Cache-Control","no-store");if(!z.object({}).strict().safeParse(req.body).success)throw new WalletBindingError("WALLET_BINDING_INVALID_INPUT");res.json(WalletBindingService.cancel(bearer(req),req.params.id));}catch(e){walletError(res,e);}});
authRouter.post("/wallet-intents/:id/circle/:role",authMiddleware,async(req,res)=>{try{
  res.setHeader("Cache-Control","no-store");const p=z.object({userToken:z.string().min(32).max(8192)}).strict().safeParse(req.body),role=req.params.role;
  if(!p.success||!["SOURCE","TARGET"].includes(role))throw new WalletBindingError("WALLET_BINDING_INVALID_INPUT");
  const token=bearer(req),typedRole=role as 'SOURCE'|'TARGET',authorize=()=>WalletBindingService.authorizeCircleSigning(token,req.params.id,typedRole);
  await CircleWalletService.assertWalletBindingIdentity(p.data.userToken,authorize);
  const signing=WalletBindingService.beginCircleSigning(token,req.params.id,typedRole);
  const challengeId=signing.challengeId||await CircleWalletService.createWalletBindingSignatureChallenge(signing.userId,p.data.userToken,signing.walletId,signing.message,authorize);
  res.json(WalletBindingService.finishCircleSigning(token,req.params.id,role as "SOURCE"|"TARGET",signing.walletId,challengeId));
 }catch(e){walletError(res,e);}});

const profileError = (res: import("express").Response, error: unknown) => {
  const e = error instanceof SessionError || error instanceof SellerProfileError ? error : new SellerProfileError("SELLER_PROFILE_UNAVAILABLE", 503);
  res.status(e.status).json({ error: e.code });
};
function profileOrigin(origin: string | undefined) {
  const configured = config.publicAppUrl ? new URL(config.publicAppUrl).origin : undefined;
  if (origin && origin !== configured && !config.allowedOrigins.includes(origin)) throw new SellerProfileError("SELLER_PROFILE_INVALID_ORIGIN", 403);
  return origin || configured || "groupdeal.app";
}
authRouter.use('/seller/profile-intents',(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(Object.keys(req.query).length){res.status(400).json({error:'SELLER_PROFILE_INVALID_INPUT'});return;}
  next();
});
authRouter.post("/seller/profile-intents", authMiddleware, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(SellerProfileService.prepare(bearer(req), req.body, profileOrigin(req.get("origin")))); } catch (e) { profileError(res, e); }
});
authRouter.get("/seller/profile-intents/:id", authMiddleware, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(SellerProfileService.status(bearer(req), req.params.id)); } catch (e) { profileError(res, e); }
});
authRouter.post("/seller/profile-intents/:id/commit", authMiddleware, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(SellerProfileService.commit(bearer(req), req.params.id, req.body)); } catch (e) { profileError(res, e); }
});
authRouter.post("/seller/profile-intents/:id/cancel", authMiddleware, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!z.object({}).strict().safeParse(req.body).success) throw new SellerProfileError("SELLER_PROFILE_INVALID_INPUT");
    res.json(SellerProfileService.cancel(bearer(req), req.params.id));
  } catch (e) { profileError(res, e); }
});
authRouter.post("/seller/profile-intents/:id/circle", authMiddleware, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const input = z.object({ userToken: z.string().min(32).max(8192) }).strict().safeParse(req.body);
    if (!input.success) throw new SellerProfileError("SELLER_PROFILE_INVALID_INPUT");
    const token = bearer(req), authorize = () => SellerProfileService.authorizeCircleSigning(token, req.params.id);
    await CircleWalletService.assertWalletBindingIdentity(input.data.userToken, authorize);
    const signing = SellerProfileService.beginCircleSigning(token, req.params.id);
    const challengeId = signing.challengeId || await CircleWalletService.createWalletBindingSignatureChallenge(signing.userId, input.data.userToken, signing.walletId, signing.message, authorize);
    res.json(SellerProfileService.finishCircleSigning(token, req.params.id, signing.walletId, challengeId));
  } catch (e) { profileError(res, e); }
});
