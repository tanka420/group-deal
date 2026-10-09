import { randomUUID } from 'node:crypto';
import { ethers } from 'ethers';
import { config } from '../config';
import { computeTermsHash } from '../utils/crypto';
import type { TransactionOperation } from './operation';
import type { DatabaseSchema } from '../db/store';
export class OperationPreparationError extends Error {
    constructor(public code: string, public status = 409, message?: string) { super(message ?? (status === 403 ? 'FORBIDDEN: ' : status === 400 ? 'VALIDATION: ' : 'CONFLICT: ') + code); }
}
export type PreparedOperation = Pick<TransactionOperation, 'userId' | 'action' | 'resourceId' | 'principal' | 'idempotencyKey' | 'calldata' | 'intentId' | 'expectedFunction' | 'expectedEvent' | 'expectedEventArgs'> & Pick<TransactionOperation, 'stagedEntitlementEncrypted' | 'financialQuote' | 'purchaseQuote' | 'stagedOrderMetadataEncrypted' | 'orderMetadataHash' | 'orderTermsHash' | 'orderQuote'>;
export type PreparationSelection = {
    actorId: string;
    action: TransactionOperation['action'];
    resourceId: string;
    idempotencyKey: string;
    sessionKey?: string;
    orderIds?: string[];
    previousId?: string;
    direct?: true;
};
export type PreparationPlan = {
    existing?: TransactionOperation;
    operation?: TransactionOperation;
    campaignPatch?: Pick<DatabaseSchema['campaigns'][string], 'productSnapshot' | 'termsHash'>;
    grants?: DatabaseSchema['resourceGrants'][string][];
    keyPatches?: {
        id: string;
        operationId: string;
        status?: 'RESERVED';
        orderId?: string;
    }[];
    audit?: {
        role: 'buyer' | 'seller';
        action: 'BUY_AUTHORIZATION_ISSUED' | 'DELIVERY_RETRY_PREPARED';
        details: Record<string, unknown>;
    }[];
};
export function preparationSelection(s: PreparationSelection) { const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 180 && !['__proto__', 'prototype', 'constructor'].includes(v); if (!id(s.actorId) || !id(s.resourceId) || !/^[-A-Za-z0-9:_]{8,180}$/.test(s.idempotencyKey) || !['PUBLISH', 'BUY', 'DELIVER', 'BUYER_CLAIM', 'SELLER_CLAIM', 'CONFIRM', 'DISPUTE', 'BREACH', 'SETTLE', 'RESOLVE'].includes(s.action) || s.previousId !== undefined && !id(s.previousId) || s.orderIds !== undefined && (!Array.isArray(s.orderIds) || s.orderIds.length < 1 || s.orderIds.length > 50 || new Set(s.orderIds).size !== s.orderIds.length || !s.orderIds.every(id)))
    throw new OperationPreparationError('OPERATION_PREPARATION_INPUT_INVALID', 400); }
export function buildOperation(input: PreparedOperation): TransactionOperation {
    preparationSelection({ actorId: input.userId, action: input.action, resourceId: input.resourceId, idempotencyKey: input.idempotencyKey });
    if (!ethers.isAddress(input.principal) || !ethers.isHexString(input.calldata) || typeof input.intentId !== 'string' || !input.intentId || typeof input.expectedFunction !== 'string' || typeof input.expectedEvent !== 'string' || !input.expectedEventArgs || Array.isArray(input.expectedEventArgs) || Object.values(input.expectedEventArgs).some(v => typeof v !== 'string' && !(typeof v === 'number' && Number.isSafeInteger(v))))
        throw new OperationPreparationError('OPERATION_PREPARATION_INPUT_INVALID', 400);
    const immutable = { ...input, principal: input.principal.toLowerCase(), chainId: config.arcChainId, hubAddress: config.hubAddress.toLowerCase() };
    const { stagedEntitlementEncrypted, stagedOrderMetadataEncrypted, financialQuote, purchaseQuote, orderQuote, ...call } = immutable;
    const payloadHash = computeTermsHash({ ...call, ...(purchaseQuote ? { purchaseLimits: { maxGrossAmount: purchaseQuote.maxGrossAmount, authorizationNonce: purchaseQuote.authorizationNonce, termsHash: purchaseQuote.termsHash } } : {}) }), now = Date.now();
    return { ...immutable, id: 'op_' + randomUUID(), payloadHash, phase: 'PREPARED', createdAt: now, updatedAt: now };
}
