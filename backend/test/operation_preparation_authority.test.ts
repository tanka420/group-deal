import { OperationService } from '../src/services/operationService';
import { OperationPreparationService } from '../src/services/operationPreparationService';
import { reviewedProductVerified } from './fixtures/product';
import { ResourceDeliveryService } from '../src/services/resourceDeliveryService';
import { CampaignEditorService } from '../src/services/campaignEditorService';
import assert from 'node:assert/strict';
import path from 'node:path';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ethers } from 'ethers';
import { store } from '../src/db/store';
import { config } from '../src/config';
import { OrderActionService } from '../src/services/orderActionService';
import { SessionService } from '../src/services/sessionService';
import { operationRouter } from '../src/routes/operationRoutes';
import { HUB_ABI } from '../src/contracts/hubAbi';
import { reconciliationProvider } from './fixtures/reconciliation';
const initial = structuredClone(store.db), iface = new ethers.Interface(HUB_ABI);
assert.ok(store.isIsolated && store.storageDirectory.includes('local-check-temp'));
const sql = new DatabaseSync(path.join(store.storageDirectory, 'groupdeal.sqlite'), { readOnly: true });
const row = (collection: string, key: string) => { const r = sql.prepare('SELECT record_json FROM domain_records WHERE collection=? AND record_key=?').get(collection, key) as {
    record_json: string;
} | undefined; return r ? JSON.parse(r.record_json) : undefined; };
let token: string, hook: (() => void) | undefined, called = false, stage = 'SETUP';
function setup(resolve = false, foreignOwner = false) {
    store.replace(structuredClone(initial));
    const buyer = ethers.getAddress('0x' + '1'.repeat(40)), seller = ethers.getAddress('0x' + '4'.repeat(40)), now = Math.floor(Date.now() / 1000);
    Object.assign(config, { arcChainId: 5042002, hubAddress: ethers.getAddress('0x' + '3'.repeat(40)), deploymentBlock: 1, operatorAddress: buyer });
    for (const [id, wallet, roles] of [['buyer', buyer, ['buyer']], ['other', ethers.getAddress('0x' + '2'.repeat(40)), ['buyer']], ['seller', seller, ['seller']]] as const)
        store.db.users[id] = { id, email: id + '@fixture.invalid', roles: [...roles], activeWallet: wallet, createdAt: 0 };
    store.db.campaigns.prepare = { id: 'prepare', sellerId: 'seller', sellerPayoutWallet: seller, status: 'FINALIZED', onchainCampaignId: 1, chainId: config.arcChainId, hubAddress: config.hubAddress, termsHash: ethers.id('preparation-terms'), metric: 'BUYER_COUNT', tiers: [{ threshold: 1, price: '100' }], deliverySlaSeconds: 86400 } as any;
    store.db.orders.order = { id: 'order', campaignId: 'prepare', onchainOrderId: 1, chainId: config.arcChainId, hubAddress: config.hubAddress, buyerAccountId: foreignOwner ? 'other' : 'buyer', buyerPrincipal: buyer, quantity: 1, lockedUnitPrice: '100', committedGross: '100', rebateAllocated: '0', buyerRefundAllocated: '0', sellerAllocated: '0', buyerClaimedAmount: '0', sellerClaimedAmount: '0', deliveryStatus: resolve ? 'DISPUTED' : 'DELIVERED', deliveryTimestamp: now - 10 } as any;
    store.save();
    const canonical = reconciliationProvider(structuredClone(store.db), 100n, 10);
    hook = undefined;
    called = false;
    OrderActionService.setProvider({ ...canonical, getBlock: async (n: number) => ({ number: n, hash: ethers.id('block-' + n), timestamp: now }), call: async (tx: any) => { if (!called) {
            called = true;
            hook?.();
        } const parsed = iface.parseTransaction({ data: tx.data })!; if (['confirmReceipt', 'resolveDispute'].includes(parsed.name))
            return iface.encodeFunctionResult(parsed.name, []); return canonical.call(tx); } });
    token = SessionService.issue(store.db.users.buyer);
}
async function main() {
    const reproduce = process.argv.includes('--reproduce'), app = express();
    app.use(express.json());
    app.use('/api/transactions', operationRouter);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + (server.address() as any).port;
    const post = (intent: unknown = { action: 'CONFIRM' }, key = 'preparation:fixture') => fetch(base + '/api/transactions/orders/prepare', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: 'order', idempotencyKey: key, intent }) });
    const observations: {
        id: string;
        status: number;
        defect: boolean;
    }[] = [];
    try {
        setup();
        stage = 'CONTROL';
        assert.equal((await post()).status, 200);
        for (const id of ['N373', 'N374', 'N375', 'N376']) {
            stage = id;
            setup(id === 'N376', id === 'N373');
            if (id === 'N373')
                store.db.orders.order.buyerAccountId = 'buyer';
            if (id === 'N374')
                store.db.users.other.roles = ['buyer', 'operator'];
            if (id === 'N375')
                hook = () => SessionService.logout(token, { idempotencyKey: randomUUID() });
            if (id === 'N376')
                store.db.users.buyer.roles = ['buyer', 'operator'];
            const res = await post(id === 'N376' ? { action: 'RESOLVE', buyerPercent: 40, notes: 'fixture-private-preparation-notes' } : { action: 'CONFIRM' });
            const operations = sql.prepare("SELECT count(*) AS n FROM domain_records WHERE collection='operations'").get() as {
                n: number;
            }, defect = id === 'N374' ? res.status === 200 && row('users', 'other').roles.includes('operator') : id === 'N376' ? res.status === 200 && row('users', 'buyer').roles.includes('operator') : res.status === 200 && operations.n === 1;
            observations.push({ id, status: res.status, defect });
            assert.equal(defect, reproduce, id);
            if (!reproduce) {
                if (id === 'N374') {
                    assert.equal(res.status, 200);
                    assert.deepEqual(store.db.users.other.roles, ['buyer', 'operator']);
                }
                else
                    assert.ok(res.status >= 400);
            }
        }
        if (!reproduce) {
            const rows = () => sql.prepare('SELECT collection,record_key,record_json FROM domain_records ORDER BY collection,record_key').all(), revision = () => Number((sql.prepare('SELECT revision FROM storage_revision WHERE id=1').get() as {
                revision: number;
            }).revision);
            const selectedCases=process.argv.find(a=>a.startsWith('--select='))?.slice(9).split(',');const check = async (id: string, fn: () => void | Promise<void>) => { if(selectedCases&&!selectedCases.includes(id))return;stage = id; setup(); await fn(); observations.push({ id, status: 200, defect: false }); console.log('PASS_PREPARATION_CASE: '+id); };
            const directInput = (key = 'direct:preparation') => ({ userId: 'buyer', action: 'CONFIRM' as const, resourceId: 'order', principal: store.db.users.buyer.activeWallet!, idempotencyKey: key, intentId: key, calldata: iface.encodeFunctionData('confirmReceipt', [1, 1]), expectedFunction: 'confirmReceipt', expectedEvent: 'OrderConfirmed', expectedEventArgs: { campaignId: 1, orderId: 1 } });
            await check('GENERIC_REQUIRES_COMMITTED_ACTOR', () => { const before = rows(); store.db.users.phantom = { ...store.db.users.buyer, id: 'phantom' }; assert.throws(() => OperationService.prepare({ ...directInput(), userId: 'phantom' }), /^Error: FORBIDDEN:/); assert.deepEqual(rows(), before); });
            await check('GENERIC_NO_UNRELATED_FLUSH', () => { store.db.notificationPreferences.pending = { inApp: true, email: false }; store.db.users.other.roles = ['operator']; OperationService.prepare(directInput()); assert.equal(row('notificationPreferences', 'pending'), undefined); assert.deepEqual(row('users', 'other').roles, ['buyer']); assert.deepEqual(store.db.users.other.roles, ['operator']); });
            await check('GENERIC_DUPLICATE_NO_REVISION_AUDIT_REWRITE', () => { const one = OperationService.prepare(directInput()), before = rows(), v = revision(); assert.equal(OperationService.prepare(directInput()).id, one.id); assert.deepEqual(rows(), before); assert.equal(revision(), v); assert.throws(() => OperationService.prepare({ ...directInput(), resourceId: 'another' }), /^Error: CONFLICT:/); });
            await check('GENERIC_PARENT_TRANSACTION_DENIED', () => { const before = rows(); assert.throws(() => store.transaction(() => OperationService.prepare(directInput())), /^Error: CONFLICT:/); assert.deepEqual(rows(), before); });
            await check('COMMITTED_OWNER_USED_DESPITE_CACHED_OWNER', async () => { store.db.orders.order.buyerAccountId = 'other'; assert.equal((await post()).status, 200); assert.equal(row('orders', 'order').buyerAccountId, 'buyer'); assert.equal(store.db.orders.order.buyerAccountId, 'other'); });
            await check('COMMITTED_PENDING_SURVIVES_CACHED_DELETION', async () => { const first = await (await post()).json() as any; delete store.db.operations[first.operation.id]; called = false; assert.equal((await post({ action: 'CONFIRM' }, 'preparation:other-key')).status, 409); assert.equal(called, false); assert.ok(row('operations', first.operation.id)); });
            await check('CONCURRENT_SAME_KEY_ONE_ENCRYPTED_INTENT', async () => { const responses = await Promise.all([post(), post()]); assert.deepEqual(responses.map(r => r.status), [200, 200]); const [a, b] = await Promise.all(responses.map(r => r.json())) as any[]; assert.equal(a.operation.id, b.operation.id); assert.equal(Object.keys(store.db.operations).length, 1); assert.equal(store.db.auditLogs.filter(v => v.action === 'TRANSACTION_PREPARED').length, 1); });
            await check('CONCURRENT_DIFFERENT_KEYS_ONE_INTENT', async () => { const responses = await Promise.all([post({ action: 'CONFIRM' }, 'prepare:concurrent-a'), post({ action: 'CONFIRM' }, 'prepare:concurrent-b')]); assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]); assert.equal(Object.keys(store.db.operations).length, 1); });
            await check('COMMITTED_OWNER_CHANGED_DURING_RPC_DENIED', async () => { hook = () => store.transaction(() => { store.db.orders.order.buyerAccountId = 'other'; }); assert.equal((await post()).status, 409); assert.equal(Object.keys(store.db.operations).length, 0); });
            await check('COMMITTED_RECOVERY_BARRIER_CHANGED_DURING_RPC', async () => { hook = () => { store.db.authRecovery = { current: { version: 1, context: 'A'.repeat(43), createdAt: Date.now() } }; store.save(); }; assert.equal((await post()).status, 401); assert.equal(Object.keys(store.db.operations).length, 0); });
            await check('PRIVATE_CONTEXT_EXTENSIONS_OMITTED_RETAINED', async () => { const marker = 'fixture-private-preparation-extension'; (store.db.users.buyer as any).privateExtension = marker; (store.db.orders.order as any).privateExtension = marker; (store.db.campaigns.prepare as any).privateExtension = marker; store.save(); const proof = SessionService.authenticate(token), parse = JSON.parse; try {
                JSON.parse = ((value: string, ...args: any[]) => { assert.ok(!value.includes(marker)); return parse(value, ...args); }) as typeof JSON.parse;
                await OrderActionService.prepare('buyer', 'order', { action: 'CONFIRM' }, 'prepare:private-context', proof);
            }
            finally {
                JSON.parse = parse;
            } assert.equal(row('orders', 'order').privateExtension, marker); assert.equal(row('users', 'buyer').privateExtension, marker); });
            await check('NATIVE_AUDIT_INSERT_ABORT_ROLLS_BACK_ALL', async () => { const db = new DatabaseSync(path.join(store.storageDirectory, 'groupdeal.sqlite')); db.exec("CREATE TRIGGER fixture_prepare_abort BEFORE INSERT ON domain_records WHEN NEW.collection='auditDedupe' BEGIN SELECT RAISE(ABORT,'fixture audit abort'); END"); const before = rows(), v = revision(); try {
                assert.equal((await post()).status, 503);
                assert.deepEqual(rows(), before);
                assert.equal(revision(), v);
                assert.equal(Object.keys(store.db.operations).length, 0);
            }
            finally {
                db.exec('DROP TRIGGER fixture_prepare_abort');
                db.close();
            } });
            await check('DIRTY_AUDIT_TARGET_DENIED_BEFORE_RPC', async () => { store.db.auditLogs.unshift({ id: 'pending', timestamp: 0, actor: 'buyer', role: 'user', action: 'PENDING', details: {}, prevHash: '0'.repeat(64), hash: '0'.repeat(64) }); const before = rows(); assert.equal((await post()).status, 409); assert.equal(called, false); assert.deepEqual(rows(), before); });
            const productScenario = async (delivery = false) => { const seller = store.db.users.seller.activeWallet!, product = await reviewedProductVerified('seller', seller), resource = ResourceDeliveryService.upload('seller', product.version.id, 'full.txt', 'text/plain', Buffer.from('Actual complete protected preparation fixture')), method = delivery ? 'LICENSE_KEY' as const : 'FILE_LINK' as const; if (delivery)
                ResourceDeliveryService.importKeys('seller', resource.id, [randomUUID().replaceAll('-', '')]); const probe = ResourceDeliveryService.probe('seller', resource.id, method), draft = CampaignEditorService.saveDraft('seller', { title: 'Native prepare fixture', description: 'Complete protected resource', thumbnailUrl: product.version.thumbnailUrl, productVersionId: product.version.id, metric: 'BUYER_COUNT', tiers: [{ threshold: 1, priceUSDC: '1' }, { threshold: 10, priceUSDC: '0.8' }], maxPerAccount: 10, inventoryLimit: 100, durationDays: 7, deliverySlaHours: 24, deliveryMethod: method }); store.transaction(() => { draft.deliveryProbeId = probe.id; if (delivery) {
                Object.assign(draft, { status: 'FINALIZED', onchainCampaignId: 2, chainId: config.arcChainId, hubAddress: config.hubAddress, productSnapshot: product.snapshot });
                draft.termsHash = CampaignEditorService.termsHash(draft);
                store.db.orders.productOrder = { ...store.db.orders.order, id: 'productOrder', onchainOrderId: 2, campaignId: draft.id, deliveryStatus: 'PENDING', campaignIdentity: ethers.id('fixture-product-identity') } as any;
            } }); return { draft, resource, product }; };
            await check('PUBLISH_NATIVE_PIN_INTENT_AUDIT_AND_NO_WRITE_RETRY', async () => { const { draft } = await productScenario(); (draft as any).privateExtension = 'fixture-private-publish'; store.save(); const first = OperationPreparationService.publish('seller', draft.id, 'prepare:publish-fixture'), before = rows(), v = revision(); assert.ok(row('campaigns', draft.id).productSnapshot); assert.equal(row('operations', first.operation.id).expectedEventArgs.termsHash, row('campaigns', draft.id).termsHash); assert.ok(!JSON.stringify(first).includes('fixture-private-publish')); assert.equal(OperationPreparationService.publish('seller', draft.id, 'prepare:publish-fixture').operation.id, first.operation.id); assert.deepEqual(rows(), before); assert.equal(revision(), v); assert.equal(row('campaigns', draft.id).privateExtension, 'fixture-private-publish'); });
            await check('PUBLISH_PIN_ABORT_ROLLS_BACK_OPERATION_AUDIT', async () => { const { draft } = await productScenario(), db = new DatabaseSync(path.join(store.storageDirectory, 'groupdeal.sqlite')); db.exec("CREATE TRIGGER fixture_publish_abort BEFORE UPDATE ON domain_records WHEN NEW.collection='campaigns' BEGIN SELECT RAISE(ABORT,'fixture pin abort'); END"); const before = rows(), v = revision(); try {
                assert.throws(() => OperationPreparationService.publish('seller', draft.id, 'prepare:publish-abort'), (e: any) => e.status === 503);
                assert.deepEqual(rows(), before);
                assert.equal(revision(), v);
                assert.equal(Object.keys(store.db.operations).length, 0);
                assert.equal(draft.productSnapshot, undefined);
            }
            finally {
                db.exec('DROP TRIGGER fixture_publish_abort');
                db.close();
            } });
            await check('DELIVERY_LICENSE_ABORT_ROLLS_BACK_INTENT_GRANTS_RESERVATION', async () => { await productScenario(true); const db = new DatabaseSync(path.join(store.storageDirectory, 'groupdeal.sqlite')); db.exec("CREATE TRIGGER fixture_license_abort BEFORE UPDATE ON domain_records WHEN NEW.collection='licenseInventory' BEGIN SELECT RAISE(ABORT,'fixture license abort'); END"); const before = rows(), v = revision(); try {
                assert.throws(() => ResourceDeliveryService.prepare('seller', 'productOrder', 'prepare:delivery-abort'), (e: any) => e.status === 503);
                assert.deepEqual(rows(), before);
                assert.equal(revision(), v);
                assert.equal(Object.keys(store.db.operations).length, 0);
                assert.equal(Object.keys(store.db.resourceGrants).length, 0);
                assert.ok(Object.values(store.db.licenseInventory).every(k => k.status === 'AVAILABLE'));
            }
            finally {
                db.exec('DROP TRIGGER fixture_license_abort');
                db.close();
            } });
            await check('DELIVERY_COMMITTED_LICENSE_AND_GRANT_ONE_RESERVATION', async () => { await productScenario(true); const one = ResourceDeliveryService.prepare('seller', 'productOrder', 'prepare:delivery-fixture'), before = rows(), v = revision(); assert.equal(ResourceDeliveryService.prepare('seller', 'productOrder', 'prepare:delivery-fixture').id, one.id); assert.deepEqual(rows(), before); assert.equal(revision(), v); const graph = store.readOperationReadinessState({ actorId: 'seller', operationId: one.id }).graph; assert.equal(ResourceDeliveryService.assertStage('seller', one.id, graph).grants.length, 1); assert.equal(Object.values(graph.licenseInventory)[0].operationId, one.id); assert.ok(!JSON.stringify(one).includes('stagedEntitlementEncrypted')); });
            await check('CROSS_PROCESS_REVISION_CONFLICT_WRITES_NOTHING', async () => { const db = new DatabaseSync(path.join(store.storageDirectory, 'groupdeal.sqlite')); db.exec('UPDATE storage_revision SET revision=revision+1 WHERE id=1'); const before = rows(); try {
                assert.equal((await post()).status, 409);
                assert.deepEqual(rows(), before);
                assert.equal(Object.keys(store.db.operations).length, 0);
            }
            finally {
                db.close();
            } });
        }
        console.log(JSON.stringify({ result: reproduce ? 'ORIGINAL_PREPARATION_REPRODUCTION' : 'PASS_PREPARATION_AUTHORITY', observations }));
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
        sql.close();
        store.close();
    }
}
main().catch(e => { console.error({ stage, code: e instanceof Error && typeof (e as any).code==='string' && /^[-A-Z_0-9]{1,80}$/.test((e as any).code) ? (e as any).code : e instanceof Error ? e.name : 'ERROR', status: Number((e as any).status)||undefined, assertionFailed: true }); process.exitCode = 1; });
