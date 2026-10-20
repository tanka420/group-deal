import { Router } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { SellerIdentityService } from '../services/sellerIdentityService';
import { SellerIdentityError, socialProvider } from '../domain/sellerIdentity';
import { SessionError } from '../services/sessionService';
import { AccountAccessError } from '../domain/accountAccess';
export const sellerIdentityRouter = Router();
sellerIdentityRouter.use((_req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next(); });
const failure = (res: any, e: unknown) => res.status(e instanceof SellerIdentityError || e instanceof SessionError || e instanceof AccountAccessError ? e.status : e instanceof ZodError ? 400 : 503).json({ error: e instanceof SellerIdentityError || e instanceof SessionError || e instanceof AccountAccessError ? e.code : e instanceof ZodError ? 'SELLER_IDENTITY_INPUT_INVALID' : 'SELLER_IDENTITY_UNAVAILABLE' });
sellerIdentityRouter.get('/public/:id', (req, res) => { try {
    if (Object.keys(req.query).length)
        throw new SellerIdentityError('SELLER_IDENTITY_INPUT_INVALID', 400);
    res.json(SellerIdentityService.publicIdentity(req.params.id));
}
catch (e) {
    failure(res, e);
} });
sellerIdentityRouter.use(authMiddleware);
sellerIdentityRouter.use((req, res, next) => { if (Object.keys(req.query).length)
    return failure(res, new SellerIdentityError('SELLER_IDENTITY_INPUT_INVALID', 400)); next(); });
sellerIdentityRouter.get('/', (req: AuthenticatedRequest, res) => { try {
    res.json(SellerIdentityService.status(req.sessionProof!));
}
catch (e) {
    failure(res, e);
} });
sellerIdentityRouter.post('/username', (req: AuthenticatedRequest, res) => { try {
    res.json(SellerIdentityService.username(req.sessionProof!, req.body));
}
catch (e) {
    failure(res, e);
} });
sellerIdentityRouter.post('/social/:provider/start', (req: AuthenticatedRequest, res) => { try {
    if (!req.body || Object.keys(req.body).length)
        throw new SellerIdentityError('SELLER_IDENTITY_INPUT_INVALID', 400);
    res.json(SellerIdentityService.start(req.sessionProof!, socialProvider.parse(req.params.provider), req.get('origin') ?? ''));
}
catch (e) {
    failure(res, e);
} });
sellerIdentityRouter.post('/social/:provider/complete', async (req: AuthenticatedRequest, res) => { try {
    res.json(await SellerIdentityService.complete(req.sessionProof!, socialProvider.parse(req.params.provider), req.body, req.get('origin') ?? ''));
}
catch (e) {
    failure(res, e);
} });
sellerIdentityRouter.post('/social/:provider/unlink', (req: AuthenticatedRequest, res) => { try {
    res.json(SellerIdentityService.unlink(req.sessionProof!, socialProvider.parse(req.params.provider), req.body));
}
catch (e) {
    failure(res, e);
} });
