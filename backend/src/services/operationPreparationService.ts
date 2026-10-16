import {assertNewBusinessAction,AccountAccessError} from '../domain/accountAccess';
import { ethers } from 'ethers';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { store } from '../db/store';
import { StorageConflict } from '../db/rowPersistence';
import { config } from '../config';
import { HUB_ABI } from '../contracts/hubAbi';
import { buildOperation, OperationPreparationError, type PreparedOperation, type PreparationSelection, type PreparationPlan } from '../domain/operationPreparation';
import { readinessFingerprint, type OperationReadinessGraph } from '../domain/operationReadiness';
import { readAuthRecoveryBarrier } from '../domain/authRecovery';
import { SessionService, SessionError, type SessionProof } from './sessionService';
import { ClaimOperationService } from './claimOperationService';
import { BuyOperationService } from './buyOperationService';
import { OrderActionService, orderActionSchema, type OrderActionInput } from './orderActionService';
import { AuthorizationService } from './authorizationService';
import { ProductService } from './productService';
import { CampaignEditorService } from './campaignEditorService';
import { campaignCalldata } from './campaignBindingService';
import { ResourceDeliveryService } from './resourceDeliveryService';
import { DeliveryRetryService } from './deliveryRetryService';
import { OperationReplacementService } from './operationReplacementService';
import { OperationTrackingService } from './operationTrackingService';
import { OperationTrackingError } from '../domain/operationTracking';
import { operationPublicDto } from '../domain/operationTracking';
import { computeTermsHash, encryptEntitlement, decryptEntitlement } from '../utils/crypto';
import type { TransactionOperation } from '../domain/operation';
import type { ResourceGrant } from '../domain/delivery';
type State = ReturnType<typeof store.readOperationPreparationState>;
const iface = new ethers.Interface(HUB_ABI), buyInput = z.object({ campaignId: z.string().min(1).max(180), quantity: z.number().int().positive().safe(), walletAddress: z.string(), requireEarlySlot: z.boolean(), maxGrossAmount: z.string().regex(/^\d{1,78}$/), idempotencyKey: z.string().regex(/^[-A-Za-z0-9:_]{8,180}$/) }).strict();
export class OperationPreparationService {
    static safe(e: unknown): Error { if(e instanceof AccountAccessError)return new OperationPreparationError(e.code,e.status); if (e instanceof OperationPreparationError || e instanceof SessionError)
        return e; if (e instanceof OperationTrackingError) {
        if (e.status === 403 || e.status === 404) return new OperationPreparationError('OPERATION_PREPARATION_FORBIDDEN', 403);
        if (e.status === 400) return new OperationPreparationError('OPERATION_PREPARATION_INPUT_INVALID', 400);
        if (e.status === 409) return new OperationPreparationError('OPERATION_PREPARATION_CONFLICT');
        return new OperationPreparationError('OPERATION_PREPARATION_UNAVAILABLE', 503);
    } if (e instanceof z.ZodError)
        return new OperationPreparationError('OPERATION_PREPARATION_INPUT_INVALID', 400); if (e instanceof StorageConflict || e instanceof Error && e.message.startsWith('CONFLICT:'))
        return new OperationPreparationError('OPERATION_PREPARATION_CONFLICT'); if (e instanceof Error && e.message.startsWith('FORBIDDEN:'))
        return new OperationPreparationError('OPERATION_PREPARATION_FORBIDDEN', 403); if (e instanceof Error && e.message.startsWith('VALIDATION:'))
        return new OperationPreparationError('OPERATION_PREPARATION_INPUT_INVALID', 400); if (e instanceof Error && /^(RPC_UNAVAILABLE|\[Security Fail-Closed\])/.test(e.message))
        return new OperationPreparationError('OPERATION_QUOTE_UNAVAILABLE', 503); if (e instanceof Error && /^(PRODUCT_REQUIRED|RIGHTS_REQUIRED|DELIVERY_PROBE_REQUIRED|RESOURCE_INTEGRITY_FAILED|INVENTORY_REQUIRED|Exceeds|Onchain principal|Campaign is closed|CHAIN_TERMS_MISMATCH)/.test(e.message))
        return new OperationPreparationError('OPERATION_POLICY_UNAVAILABLE'); return new OperationPreparationError('OPERATION_PREPARATION_UNAVAILABLE', 503); }
    private static authority(state: State, actor: string, proof?: SessionProof, action?: string) { if (proof) {
        if (proof.account.id !== actor || SessionService.assertCommitted(proof, state.auth).id !== actor)
            throw new OperationPreparationError('OPERATION_PREPARATION_FORBIDDEN', 403);
    }
    else {
        if (readAuthRecoveryBarrier(state.auth.authRecovery))
            throw new SessionError('AUTH_SESSION_INACTIVE');
        const u = state.auth.user;
        if (!u || u.id !== actor || !Array.isArray(u.roles) || u.roles.some(r => !['buyer', 'seller', 'operator'].includes(r)))
            throw new OperationPreparationError('OPERATION_PREPARATION_FORBIDDEN', 403);
    } if(!state.prior&&(action==='BUY'||action==='PUBLISH'))assertNewBusinessAction(state.auth.user,action==='BUY'?'BUY':'SELLER'); if(action==='RESOLVE')SessionService.assertOperatorCommitted(proof,state.auth); if (state.priorDirty || !state.prior && state.targetsDirty)
        throw new OperationPreparationError('OPERATION_PREPARATION_CONFLICT'); }
    private static begin(selection: PreparationSelection, proof?: SessionProof) { if (proof)
        selection = { ...selection, sessionKey: proof.key }; const state = store.readOperationPreparationState(selection); this.authority(state, selection.actorId, proof,selection.action); const fingerprint = readinessFingerprint(state.graph), fresh = () => { const current = store.readOperationPreparationState(selection); this.authority(current, selection.actorId, proof,selection.action); if (readinessFingerprint(current.graph) !== fingerprint)
        throw new OperationPreparationError('OPERATION_CONTEXT_CHANGED'); return current.graph; }; return { selection, state, fingerprint, fresh, commit: (make: (state: State) => PreparationPlan) => store.mutateOperationPreparation(selection, current => { this.authority(current, selection.actorId, proof,selection.action); const plan = make(current); if (!plan.existing && readinessFingerprint(current.graph) !== fingerprint)
            throw new OperationPreparationError('OPERATION_CONTEXT_CHANGED'); return plan; }) }; }
    private static base(prior: TransactionOperation, s: PreparationSelection, principal: string) { if (prior.userId !== s.actorId || prior.action !== s.action || prior.resourceId !== s.resourceId || prior.idempotencyKey !== s.idempotencyKey || prior.principal !== principal.toLowerCase() || prior.chainId !== config.arcChainId || prior.hubAddress.toLowerCase() !== config.hubAddress.toLowerCase())
        throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT'); return prior; }
    private static pending(state: State, s: PreparationSelection) { if (state.pending.length)
        throw new OperationPreparationError('OPERATION_PREPARATION_PENDING', 409, s.action === 'PUBLISH' ? 'CONFLICT: this draft already has a publication intent; recover it before preparing another key' : s.action === 'DELIVER' ? 'CONFLICT: another staged delivery already reserves this order; recover that operation' : undefined); }
    static direct(input: PreparedOperation, proof?: SessionProof) { try {
        const op = buildOperation(input), s: PreparationSelection = { actorId: input.userId, action: input.action, resourceId: input.resourceId, idempotencyKey: input.idempotencyKey, direct: true }, b = this.begin(s, proof);
        return b.commit(current => { if (current.prior) {
            if (current.prior.payloadHash !== op.payloadHash)
                throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT');
            return { existing: current.prior };
        } ; this.pending(current, s); return { operation: op }; });
    }
    catch (e) {
        throw this.safe(e);
    } }
    static async claim(actor: string, campaignId: string, action: 'BUYER_CLAIM' | 'SELLER_CLAIM', orderIds: string[], key: string, proof?: SessionProof) { try {
        const s: PreparationSelection = { actorId: actor, action, resourceId: campaignId, idempotencyKey: key, orderIds }, b = this.begin(s, proof), initial = ClaimOperationService.preparationIntent(actor, campaignId, action, orderIds, b.state.graph), match = (p: TransactionOperation) => { this.base(p, s, initial.principal); if (p.calldata !== initial.calldata)
            throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT'); return p; };
        if (b.state.prior)
            return match(b.state.prior);
        this.pending(b.state, s);
        const { intent, financialQuote } = await ClaimOperationService.quote(actor, campaignId, action, orderIds, b.state.graph);
        b.fresh();
        return b.commit(current => { if (current.prior)
            return { existing: match(current.prior) }; this.pending(current, s); return { operation: buildOperation({ userId: actor, action, resourceId: campaignId, principal: intent.principal, idempotencyKey: key, calldata: intent.calldata, intentId: `claim:${actor}:${campaignId}:${action}:${key}`, expectedFunction: intent.expectedFunction, expectedEvent: 'FundsClaimed', expectedEventArgs: { campaignId: intent.campaign.onchainCampaignId!, recipient: intent.principal, claimType: action === 'BUYER_CLAIM' ? 0 : 2 }, financialQuote }) }; });
    }
    catch (e) {
        throw this.safe(e);
    } }
    static async buy(actor: string, body: unknown, proof?: SessionProof) { try {
        const input = buyInput.parse(body), s: PreparationSelection = { actorId: actor, action: 'BUY', resourceId: input.campaignId, idempotencyKey: input.idempotencyKey }, b = this.begin(s, proof);
        BuyOperationService.preparationIdentity(actor, input, b.state.graph);
        const match = (p: TransactionOperation) => { this.base(p, s, input.walletAddress); const call = iface.parseTransaction({ data: p.calldata }); if (call?.name !== 'commitToBuy' || call.args.quantity !== BigInt(input.quantity) || call.args.requireEarlySlot !== input.requireEarlySlot || p.purchaseQuote?.maxGrossAmount !== input.maxGrossAmount)
            throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT'); return p; };
        if (b.state.prior) {
            const op = match(b.state.prior);
            return { operation: op, authorization: BuyOperationService.authorization(op) };
        }
        ;
        this.pending(b.state, s);
        const authorization = await AuthorizationService.generateBuyAuthorization(actor, input.campaignId, input.quantity, input.walletAddress, input, b.state.graph, b.fresh), calldata = iface.encodeFunctionData('commitToBuy', [authorization.campaignId, authorization.campaignIdentity, input.quantity, input.requireEarlySlot, authorization.maxQuantity, authorization.deadline, authorization.signature]);
        b.fresh();
        const op = b.commit(current => { if (current.prior)
            return { existing: match(current.prior) }; this.pending(current, s); return { operation: buildOperation({ userId: actor, action: 'BUY', resourceId: input.campaignId, principal: input.walletAddress, idempotencyKey: input.idempotencyKey, calldata, intentId: `buy:${actor}:${input.campaignId}:${input.idempotencyKey}`, expectedFunction: 'commitToBuy', expectedEvent: 'CommitmentMade', expectedEventArgs: { campaignId: authorization.campaignId, campaignIdentity: authorization.campaignIdentity, buyerPrincipal: input.walletAddress, quantity: input.quantity }, purchaseQuote: { ...authorization.quote, maxGrossAmount: input.maxGrossAmount, authorizationNonce: authorization.nonce, termsHash: authorization.termsHash } }), audit: [{ role: 'buyer', action: 'BUY_AUTHORIZATION_ISSUED', details: { campaignId: input.campaignId, campaignIdentity: authorization.campaignIdentity, buyerWallet: input.walletAddress, quantity: input.quantity, nonce: authorization.nonce, quoteBlock: authorization.quote.blockNumber } }] }; });
        return { operation: op, authorization: BuyOperationService.authorization(op) };
    }
    catch (e) {
        throw this.safe(e);
    } }
    static async order(actor: string, orderId: string, input: OrderActionInput, key: string, proof?: SessionProof) { try {
        input = orderActionSchema.parse(input);
        const s: PreparationSelection = { actorId: actor, action: input.action, resourceId: orderId, idempotencyKey: key }, b = this.begin(s, proof), identity = OrderActionService.preparationIdentity(actor, orderId, input.action, b.state.graph), orderMetadataHash = computeTermsHash(input), match = (p: TransactionOperation) => { this.base(p, s, identity.principal); if (p.orderMetadataHash !== orderMetadataHash)
            throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT'); return p; };
        if (b.state.prior)
            return match(b.state.prior);
        this.pending(b.state, s);
        const quote = await OrderActionService.quote(actor, orderId, input, b.state.graph);
        b.fresh();
        return b.commit(current => { if (current.prior)
            return { existing: match(current.prior) }; this.pending(current, s); return { operation: buildOperation({ userId: actor, action: input.action, resourceId: orderId, principal: identity.principal, idempotencyKey: key, calldata: quote.calldata, intentId: `order:${actor}:${orderId}:${key}`, expectedFunction: quote.expectedFunction, expectedEvent: quote.expectedEvent, expectedEventArgs: quote.expectedEventArgs, orderTermsHash: identity.campaign.termsHash, orderMetadataHash, orderQuote: quote.orderQuote, stagedOrderMetadataEncrypted: encryptEntitlement(JSON.stringify({ userId: actor, orderId, input })) }) }; });
    }
    catch (e) {
        throw this.safe(e);
    } }
    static publish(actor: string, id: string, key: string, proof?: SessionProof) { try {
        const s: PreparationSelection = { actorId: actor, action: 'PUBLISH', resourceId: id, idempotencyKey: key }, b = this.begin(s, proof), campaign = b.state.graph.campaigns[id];
        if (!campaign || campaign.sellerId !== actor || !b.state.auth.user?.roles.includes('seller'))
            throw new OperationPreparationError('OPERATION_PREPARATION_FORBIDDEN', 403);
        const match = (p: TransactionOperation, g: OperationReadinessGraph = b.state.graph) => { const bound = g.campaigns[id]; this.base(p, s, bound.sellerPayoutWallet); if (p.calldata !== campaignCalldata(bound))
            throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT'); return p; };
        if (b.state.prior)
            return { campaign, operation: operationPublicDto(match(b.state.prior)) };
        this.pending(b.state, s);
        if (campaign.status !== 'DRAFT' || campaign.onchainCampaignId !== undefined || !campaign.draftProductVersionId)
            throw new OperationPreparationError('OPERATION_POLICY_UNAVAILABLE');
        ResourceDeliveryService.assertProbe(actor, campaign.draftProductVersionId, campaign.deliveryMethod, campaign.deliveryProbeId, b.state.graph);
        const expiry = Math.floor(Date.now() / 1000) + campaign.durationSeconds + campaign.deliverySlaSeconds, policy = b.state.graph.productPolicies?.[campaign.draftProductVersionId], snapshot = ProductService.snapshot(actor, campaign.draftProductVersionId, expiry, policy);
        if (campaign.productSnapshot)
            ProductService.assertPublishable(actor, campaign.productSnapshot, expiry, policy);
        const pinned = { ...campaign, productSnapshot: snapshot };
        pinned.termsHash = CampaignEditorService.termsHash(pinned);
        const operation = b.commit(current => { if (current.prior)
            return { existing: match(current.prior, current.graph) }; this.pending(current, s); return { operation: buildOperation({ userId: actor, action: 'PUBLISH', resourceId: id, principal: campaign.sellerPayoutWallet, idempotencyKey: key, calldata: campaignCalldata(pinned), intentId: 'campaign_publish_' + id, expectedFunction: 'createCampaign', expectedEvent: 'CampaignCreated', expectedEventArgs: { sellerPayoutWallet: campaign.sellerPayoutWallet, termsHash: pinned.termsHash } }), campaignPatch: { productSnapshot: snapshot, termsHash: pinned.termsHash } }; });
        return { campaign: store.readOperationPreparationState(b.selection).graph.campaigns[id], operation: operationPublicDto(operation) };
    }
    catch (e) {
        throw this.safe(e);
    } }
    static deliver(actor: string, orderId: string, key: string, proof?: SessionProof) {
        try {
            const s: PreparationSelection = { actorId: actor, action: 'DELIVER', resourceId: orderId, idempotencyKey: key }, b = this.begin(s, proof), graph = b.state.graph, order = graph.orders[orderId], campaign = order && graph.campaigns[order.campaignId];
            if (!order || !campaign || campaign.sellerId !== actor || !b.state.auth.user?.roles.includes('seller'))
                throw new OperationPreparationError('OPERATION_PREPARATION_FORBIDDEN', 403);
            if (b.state.prior) {
                this.base(b.state.prior, s, campaign.sellerPayoutWallet);
                if (b.state.prior.deliveryRetry)
                    throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT');
                return operationPublicDto(b.state.prior);
            }
            ;
            this.pending(b.state, s);
            if (order.chainId !== config.arcChainId || campaign.chainId !== config.arcChainId || order.hubAddress?.toLowerCase() !== config.hubAddress.toLowerCase() || campaign.hubAddress?.toLowerCase() !== config.hubAddress.toLowerCase() || !campaign.onchainCampaignId || !Number.isSafeInteger(order.onchainOrderId) || order.onchainOrderId < 1 || order.deliveryStatus !== 'PENDING' || campaign.status !== 'FINALIZED' || !campaign.productSnapshot)
                throw new OperationPreparationError('OPERATION_POLICY_UNAVAILABLE');
            const probe = ResourceDeliveryService.assertProbe(actor, campaign.productSnapshot.productVersionId, campaign.deliveryMethod, campaign.deliveryProbeId, graph), license = graph.licenseVersions[campaign.productSnapshot.licenseVersionId];
            if (!license || Object.keys(graph.resourceGrants).length)
                throw new OperationPreparationError('OPERATION_PREPARATION_PENDING');
            const keys = campaign.deliveryMethod === 'LICENSE_KEY' ? Object.values(graph.licenseInventory).filter(k => k.resourceId === probe.resourceId && k.status === 'AVAILABLE').sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(0, order.quantity) : [];
            if (campaign.deliveryMethod === 'LICENSE_KEY' && keys.length !== order.quantity)
                throw new OperationPreparationError('OPERATION_INVENTORY_UNAVAILABLE');
            if (!['FILE_LINK', 'LICENSE_KEY'].includes(campaign.deliveryMethod))
                throw new OperationPreparationError('OPERATION_POLICY_UNAVAILABLE');
            const grants: ResourceGrant[] = Array.from({ length: order.quantity }, (_, unitIndex) => ({ id: 'grant_' + randomUUID(), orderId, buyerAccountId: order.buyerAccountId, buyerPrincipal: order.buyerPrincipal, productVersionId: campaign.productSnapshot!.productVersionId, licenseVersionId: license.id, resourceId: probe.resourceId, unitIndex, seatsPerUnit: license.seatsPerUnit, ...(keys[unitIndex] ? { licenseKeyId: keys[unitIndex].id } : {}), state: 'STAGED' }));
            const payload = JSON.stringify({ version: 1, method: campaign.deliveryMethod, nonce: randomBytes(32).toString('hex'), grants: grants.map(g => ({ id: g.id, unitIndex: g.unitIndex, seatsPerUnit: g.seatsPerUnit, ...(g.licenseKeyId ? { licenseKey: decryptEntitlement(graph.licenseInventory[g.licenseKeyId].keyEncrypted) } : {}) })) }), proofHash = ethers.keccak256(ethers.toUtf8Bytes(payload)), operation = buildOperation({ userId: actor, action: 'DELIVER', resourceId: orderId, principal: campaign.sellerPayoutWallet, idempotencyKey: key, calldata: iface.encodeFunctionData('recordDelivery', [campaign.onchainCampaignId, order.onchainOrderId, proofHash]), intentId: `delivery_${orderId}_${proofHash}`, expectedFunction: 'recordDelivery', expectedEvent: 'DeliveryRecorded', expectedEventArgs: { campaignId: campaign.onchainCampaignId, orderId: order.onchainOrderId, proofHash }, stagedEntitlementEncrypted: encryptEntitlement(payload) }), keyPatches = keys.map(k => ({ id: k.id, status: 'RESERVED' as const, orderId, operationId: operation.id }));
            const staged: OperationReadinessGraph = { ...graph, operations: { [operation.id]: operation }, resourceGrants: Object.fromEntries(grants.map(g => [g.id, g])), licenseInventory: { ...graph.licenseInventory, ...Object.fromEntries(keys.map(k => [k.id, { ...k, status: 'RESERVED' as const, orderId, operationId: operation.id }])) } };
            ResourceDeliveryService.assertStage(actor, operation.id, staged);
            return operationPublicDto(b.commit(current => { if (current.prior) {
                this.base(current.prior, s, campaign.sellerPayoutWallet);
                if (current.prior.deliveryRetry)
                    throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT');
                return { existing: current.prior };
            } ; this.pending(current, s); return { operation, grants, keyPatches }; }));
        }
        catch (e) {
            throw this.safe(e);
        }
    }
    private static retained(selection:PreparationSelection,proof?:SessionProof){const state=store.readOperationPreparationState(selection);this.authority(state,selection.actorId,proof,selection.action);return state;}
    static async retry(actor: string, previousId: string, key: string, proof?: SessionProof) { try {
        const previous = OperationTrackingService.owned(actor, previousId, proof), s: PreparationSelection = { actorId: actor, action: 'DELIVER', resourceId: previous.resourceId, idempotencyKey: key, previousId }, b = this.begin(s, proof), priorSource = DeliveryRetryService.preparationScope(actor,previousId,b.state.graph).operation, match = (p: TransactionOperation) => { this.base(p, s, priorSource.principal); if (p.deliveryRetry?.previousOperationId !== previousId || p.calldata !== priorSource.calldata)
            throw new OperationPreparationError('OPERATION_PREPARATION_KEY_CONFLICT'); return p; };
        if (!priorSource || priorSource.action !== 'DELIVER')
            throw new OperationPreparationError('OPERATION_PREPARATION_FORBIDDEN', 403);
        if (b.state.prior)
            return operationPublicDto(match(b.state.prior));
        const source = DeliveryRetryService.assertReadyStage(actor, previousId, b.state.graph);
        this.pending(b.state, s);
        const terminal = await OperationReplacementService.confirmTerminal(actor, previousId, proof);
        const retained=this.retained(b.selection,proof);if(retained.prior){DeliveryRetryService.preparationScope(actor,previousId,retained.graph);return operationPublicDto(match(retained.prior));}
        b.fresh();
        const capability = await DeliveryRetryService.capability(structuredClone(source.operation), terminal.blockNumber, b.state.graph);
        const afterCapability=this.retained(b.selection,proof);if(afterCapability.prior){DeliveryRetryService.preparationScope(actor,previousId,afterCapability.graph);return operationPublicDto(match(afterCapability.prior));}
        b.fresh();
        const operation = buildOperation({ userId: actor, action: 'DELIVER', resourceId: s.resourceId, principal: source.operation.principal, idempotencyKey: key, intentId: `delivery-retry:${previousId}:${key}`, calldata: source.operation.calldata, expectedFunction: source.operation.expectedFunction, expectedEvent: source.operation.expectedEvent, expectedEventArgs: source.operation.expectedEventArgs, stagedEntitlementEncrypted: source.operation.stagedEntitlementEncrypted });
        operation.deliveryRetry = { previousOperationId: previousId, terminal, capability };
        return operationPublicDto(b.commit(current => { if (current.prior)
            return { existing: match(current.prior) }; this.pending(current, s); return { operation, keyPatches: source.grants.filter(g => g.licenseKeyId).map(g => ({ id: g.licenseKeyId!, operationId: operation.id })), audit: [{ role: 'seller', action: 'DELIVERY_RETRY_PREPARED', details: { previousOperationId: previousId, operationId: operation.id, orderId: s.resourceId, blockNumber: capability.blockNumber, blockHash: capability.blockHash } }] }; }));
    }
    catch (e) {
        throw this.safe(e);
    } }
}
export function operationPreparationFailure(res: import('express').Response, e: unknown) { const error = OperationPreparationService.safe(e); res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); if (error instanceof SessionError)
    res.status(error.status).json({ error: 'Session unavailable', code: error.code });
else {
    const v = error as OperationPreparationError;
    res.status(v.status).json({ error: 'Intent preparation unavailable', code: v.code });
} }
