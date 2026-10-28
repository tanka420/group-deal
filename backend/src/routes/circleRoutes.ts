import {ARC_CIRCLE_BLOCKCHAIN,ARC_CHAIN_ID} from '../../../shared/network.mjs';
import {circleStatusId,circleStatusBody,circleTransactionStatusBody} from '../domain/circleStatus';
import {circleTransactionInput,circleChallengeInput} from '../domain/circleTransactionPolicy';
import {circleWalletInput,circleWalletSelectInput} from '../domain/circleWalletAuthority';
import {CircleAuthError,circleEmailInput,circleSessionInput} from '../domain/circleAuthentication';
import {SessionError} from '../services/sessionService';
import {config} from '../config';
import { Router } from "express";
import * as crypto from "crypto";
import { AuthService } from "../services/authService";
import { CircleTransactionIntent, CircleWalletService } from "../services/circleWalletService";
import { authMiddleware, optionalOperator, AuthenticatedRequest } from "../middleware/auth";
import { store } from "../db/store";

export const circleRouter = Router();

circleRouter.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => console.info(JSON.stringify({
    event: "CIRCLE_API", requestId, method: req.method, path: req.path,
    status: res.statusCode, durationMs: Date.now() - startedAt,
  })));
  next();
});

function sendCircleAuthError(res:import('express').Response,error:unknown){const e=error instanceof CircleAuthError||error instanceof SessionError?error:new CircleAuthError('CIRCLE_AUTH_UNAVAILABLE',503);res.status(e.status).json({error:e.code})}
circleRouter.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');try{if(Object.keys(req.query).length)throw new CircleAuthError('CIRCLE_AUTH_INVALID_QUERY');const origin=req.headers.origin,configured=config.publicAppUrl?new URL(config.publicAppUrl).origin:undefined;if(origin&&origin!==configured&&!config.allowedOrigins.includes(origin))throw new CircleAuthError('CIRCLE_AUTH_INVALID_ORIGIN',403);next()}catch(e){sendCircleAuthError(res,e)}});

circleRouter.get("/status", (_req, res) => {
  res.json({
    configured: CircleWalletService.isConfigured(),
    blockchain: ARC_CIRCLE_BLOCKCHAIN,
    chainId: ARC_CHAIN_ID,
    custody: "USER_CONTROLLED",
  });
});

circleRouter.post('/email/token',async(req,res)=>{try{const p=circleEmailInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_AUTH_INVALID_INPUT');AuthService.consumeCircleRates([{scope:'circle-email',identifier:p.data.email},{scope:'circle-device',identifier:p.data.deviceId},{scope:'circle-ip',identifier:req.ip||req.socket.remoteAddress||'unknown'}]);res.json(await CircleWalletService.requestEmailOtp(p.data.email,p.data.deviceId))}catch(e){sendCircleAuthError(res,e)}});
circleRouter.post('/session',async(req,res)=>{try{const p=circleSessionInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_AUTH_INVALID_INPUT');AuthService.consumeCircleRates([{scope:'circle-session-ip',identifier:req.ip||req.socket.remoteAddress||'unknown'},{scope:'circle-session-token',identifier:p.data.userToken}]);const result=await CircleWalletService.verifyIdentity(p.data.userToken,p.data.loginAttemptId,(identity,verification)=>AuthService.createCircleSession(identity.email,identity.circleUserId,undefined,verification));res.json({...result,walletInitialized:Boolean(result.user.circleWallet)})}catch(e){sendCircleAuthError(res,e)}});

circleRouter.post('/reauth',authMiddleware,async(req:AuthenticatedRequest,res)=>{try{const p=circleSessionInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_AUTH_INVALID_INPUT');AuthService.consumeCircleRates([{scope:'circle-session-ip',identifier:req.ip||req.socket.remoteAddress||'unknown'},{scope:'circle-session-token',identifier:p.data.userToken}]);res.json(await CircleWalletService.reauthenticate(p.data.userToken,p.data.loginAttemptId,req.sessionProof!))}catch(e){sendCircleAuthError(res,e)}});
circleRouter.post('/wallet/initialize',authMiddleware,async(req:AuthenticatedRequest,res)=>{try{const p=circleWalletInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_WALLET_INVALID_INPUT');res.json(await CircleWalletService.initializeArcWallet(req.user!.userId,p.data.userToken,req.sessionProof!))}catch(e){sendCircleAuthError(res,e)}});
circleRouter.post('/wallets',authMiddleware,async(req:AuthenticatedRequest,res)=>{try{const p=circleWalletInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_WALLET_INVALID_INPUT');res.json(await CircleWalletService.syncArcWallets(req.user!.userId,p.data.userToken,req.sessionProof!))}catch(e){sendCircleAuthError(res,e)}});
circleRouter.post('/wallet/select',authMiddleware,async(req:AuthenticatedRequest,res)=>{try{const p=circleWalletSelectInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_WALLET_INVALID_INPUT');res.json(await CircleWalletService.selectInitialArcWallet(req.user!.userId,p.data,req.sessionProof!))}catch(e){sendCircleAuthError(res,e)}});

circleRouter.post('/transactions/estimate',authMiddleware,optionalOperator,async(req:AuthenticatedRequest,res)=>{try{const p=circleTransactionInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');const estimate=await CircleWalletService.estimateContractFee({...p.data,userId:req.user!.userId,proof:req.sessionProof!});res.json({estimate})}catch(e){sendCircleAuthError(res,e)}});
circleRouter.post('/transactions/challenge',authMiddleware,optionalOperator,async(req:AuthenticatedRequest,res)=>{try{const p=circleChallengeInput.safeParse(req.body);if(!p.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');res.json(await CircleWalletService.createContractChallenge({...p.data,userId:req.user!.userId,proof:req.sessionProof!}))}catch(e){sendCircleAuthError(res,e)}});
circleRouter.post('/operations/:id/status',authMiddleware,optionalOperator,async(req:AuthenticatedRequest,res)=>{try{const p=circleStatusBody.safeParse(req.body),id=circleStatusId.safeParse(req.params.id);if(!p.success||!id.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');res.json(await CircleWalletService.getOperationStatus(req.user!.userId,p.data.userToken,id.data,req.sessionProof!))}catch(e){sendCircleAuthError(res,e)}});

circleRouter.post('/transactions/:id',authMiddleware,optionalOperator,async(req:AuthenticatedRequest,res)=>{try{const p=circleTransactionStatusBody.safeParse(req.body),id=circleStatusId.safeParse(req.params.id);if(!p.success||!id.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');const transaction=await CircleWalletService.getTransaction(req.user!.userId,p.data.userToken,id.data,req.sessionProof!,p.data.challengeId);res.json({transaction})}catch(e){sendCircleAuthError(res,e)}});
circleRouter.post('/challenges/:id',authMiddleware,optionalOperator,async(req:AuthenticatedRequest,res)=>{try{const p=circleStatusBody.safeParse(req.body),id=circleStatusId.safeParse(req.params.id);if(!p.success||!id.success)throw new CircleAuthError('CIRCLE_TRANSACTION_INVALID_INPUT');const challenge=await CircleWalletService.getChallenge(req.user!.userId,p.data.userToken,id.data,req.sessionProof!);res.json({challenge})}catch(e){sendCircleAuthError(res,e)}});
