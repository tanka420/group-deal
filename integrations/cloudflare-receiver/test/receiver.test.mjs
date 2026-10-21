import assert from 'node:assert/strict';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import {mkdtemp, readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {Miniflare} from 'miniflare';

// Public fixtures only. This test never reads application credentials or contacts GroupDeal.
const secret = 'synthetic-cloudflare-receiver-test-only-32';
const subscriptionId = 'wh_cloudflare_fixture';
const origin = 'https://receiver.example.test';
const event = (id = 'evt_cloudflare_fixture') => ({id, event: 'order.delivered',
  timestamp: Math.floor(Date.now() / 1000), createdAt: Date.now(),
  data: {value: 1, quantity: 2, deliveryStatus: 'DELIVERED', isEarlySupporter: false}});
const signed = (body, envelope) => ({'Content-Type': 'application/json',
  'X-GroupDeal-Signature': 'sha256=' + createHmac('sha256', secret)
    .update(String(envelope.timestamp) + '.' + body).digest('hex'),
  'X-GroupDeal-Timestamp': String(envelope.timestamp),
  'X-GroupDeal-Event-Id': envelope.id, 'X-GroupDeal-Event': envelope.event});

async function workerConfig(includeSecret = true) {
  return {config: {name: 'groupdeal-receiver-local-test', compatibilityDate: '2026-10-21',
    compatibilityFlags: ['nodejs_compat'], manifest: {mainModule: 'worker.js',
      modulesRoot: path.resolve('.cache/bundle'), modules: {
        'worker.js': {type: 'esm', contents: await readFile('.cache/bundle/worker.js', 'utf8')}}},
    env: {DB: {type: 'd1', id: '00000000-0000-0000-0000-000000000001'},
      GROUPDEAL_API_URL: {type: 'text', value: 'https://groupdeal.tech'},
      GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID: {type: 'text', value: subscriptionId},
      ...(includeSecret ? {GROUPDEAL_WEBHOOK_SECRET: {type: 'text', value: secret}} : {})}}};
}

test('bundled Worker verifies signed requests and persists its inbox in local D1', {timeout: 90000}, async t => {
  const persist = await mkdtemp(path.resolve('.cache/d1-test-'));
  const options = {host: '127.0.0.1', resourcePersistencePath: persist,
    telemetry: {enabled: false}, workers: [await workerConfig()]};
  let mf = new Miniflare(options);
  let db;
  t.after(async () => mf.dispose());
  const post = (body, headers) => mf.dispatchFetch(origin + '/webhooks/groupdeal',
    {method: 'POST', headers, body});
  const count = async () => (await db.prepare('SELECT COUNT(*) AS n FROM webhook_inbox').first()).n;

  await t.test('missing D1 schema returns retryable failure without acknowledging an event', async () => {
    assert.equal((await mf.dispatchFetch(origin + '/healthz')).status, 503);
    const e = event(); const body = JSON.stringify(e);
    assert.equal((await post(body, signed(body, e))).status, 503);
    db = await mf.getD1Database('DB');
    const migration = await readFile('migrations/0001_inbox.sql', 'utf8');
    await db.batch(migration.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
    assert.equal((await mf.dispatchFetch(origin + '/healthz')).status, 200);
    assert.equal(await count(), 0);
  });

  await t.test('tamper, stale signature, malformed and mismatched envelopes never enter D1', async () => {
    const e = event(); const body = JSON.stringify(e);
    const stale = {...e, timestamp: e.timestamp - 301}; const staleBody = JSON.stringify(stale);
    const overflow = body.replace('"value":1', '"value":1e400');
    const nested = JSON.stringify({...e, data: {value: {nested: 1}}});
    for (const [raw, headers] of [
      [body + ' ', signed(body, e)], [staleBody, signed(staleBody, stale)],
      [body, {...signed(body, e), 'X-GroupDeal-Event-Id': 'evt_foreign'}],
      ['{', signed('{', e)], [overflow, signed(overflow, e)], [nested, signed(nested, e)],
    ]) assert.equal((await post(raw, headers)).status, 401);
    assert.equal(await count(), 0);
  });

  let acceptedEvent;
  await t.test('concurrent redelivery inserts exactly one queued event', async () => {
    acceptedEvent = event(); const body = JSON.stringify(acceptedEvent);
    const responses = await Promise.all(Array.from({length: 6}, () => post(body, signed(body, acceptedEvent))));
    assert.ok(responses.every(r => r.status === 202));
    const acks = await Promise.all(responses.map(r => r.json()));
    assert.equal(acks.filter(r => r.accepted && !r.duplicate).length, 1);
    assert.equal(acks.filter(r => r.accepted && r.duplicate).length, 5);
    assert.equal(await count(), 1);
    const row = await db.prepare('SELECT * FROM webhook_inbox').first();
    assert.equal(row.subscription_id, subscriptionId);
    assert.equal(row.state, 'QUEUED');
    assert.deepEqual(JSON.parse(row.event_json), acceptedEvent);
  });

  await t.test('worker restart preserves the original payload and duplicate decision', async () => {
    await mf.dispose(); mf = new Miniflare(options); db = await mf.getD1Database('DB');
    const body = JSON.stringify(acceptedEvent);
    const response = await post(body, signed(body, acceptedEvent));
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {accepted: true, duplicate: true});
    assert.equal(await count(), 1);
    assert.deepEqual(JSON.parse((await db.prepare('SELECT event_json FROM webhook_inbox').first()).event_json), acceptedEvent);
  });

  await t.test('subscription review answers the SDK challenge without inserting an order event', async () => {
    const e = {...event('evt_review_fixture'), version: 1, event: 'subscription.review', data: {
      reviewId: 'whr_' + randomUUID(), subscriptionId,
      nonce: Buffer.alloc(32, 7).toString('base64url'), expiresAt: Date.now() + 25000,
      scope: 'NEW_EVENTS_ONLY', chainId: 5042002, hubAddress: '0x' + '1'.repeat(40)}};
    const body = JSON.stringify(e);
    const response = await post(body, signed(body, e));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).response, createHmac('sha256', secret)
      .update('groupdeal:webhook-recovery-response:v1:' + createHash('sha256').update(body).digest('hex')).digest('hex'));
    assert.equal(await count(), 1);
    assert.equal((await post(body + ' ', signed(body, e))).status, 401);
  });

  await t.test('routing, content type, invalid UTF-8 and body size are guarded', async () => {
    assert.equal((await mf.dispatchFetch(origin + '/webhooks/groupdeal')).status, 405);
    assert.equal((await mf.dispatchFetch(origin + '/healthz?details=true')).status, 404);
    assert.equal((await post('{}', {'Content-Type': 'text/plain'})).status, 415);
    assert.equal((await post(new Uint8Array([0xc3, 0x28]), {'Content-Type': 'application/json'})).status, 400);
    // A service-binding request avoids a client socket reset when the runtime
    // rejects an oversized HTTP upload before reading its complete body.
    const worker = await mf.getWorker();
    assert.equal((await worker.fetch(origin + '/webhooks/groupdeal', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: 'x'.repeat(1048577)})).status, 413);
    assert.equal(await count(), 1);
  });

  await t.test('a D1 outage after restart never returns a success acknowledgement', async () => {
    await db.prepare('DROP TABLE webhook_inbox').run();
    const e = event('evt_outage_fixture'); const body = JSON.stringify(e);
    assert.equal((await post(body, signed(body, e))).status, 503);
    assert.equal((await mf.dispatchFetch(origin + '/healthz')).status, 503);
  });
});

test('missing secret fails closed', {timeout: 30000}, async t => {
  const mf = new Miniflare({host: '127.0.0.1', telemetry: {enabled: false},
    resourcePersistencePath: await mkdtemp(path.resolve('.cache/d1-unconfigured-')),
    workers: [await workerConfig(false)]});
  t.after(async () => mf.dispose());
  assert.equal((await mf.dispatchFetch(origin + '/healthz')).status, 503);
  const e = event(); const body = JSON.stringify(e);
  assert.equal((await mf.dispatchFetch(origin + '/webhooks/groupdeal',
    {method: 'POST', headers: signed(body, e), body})).status, 503);
});
