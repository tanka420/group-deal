import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {mkdtemp, readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {Miniflare} from 'miniflare';

const secret = 'synthetic-provider-fixture-no-real-secret';
const subscription = 'wh_provider_fixture', campaign = 'campaign_new_uat_fixture';
const origin = 'https://provider.example.test', hub = '0x' + '1'.repeat(40);
const committed = id => ({id, event: 'order.committed', timestamp: Math.floor(Date.now() / 1000),
  createdAt: Date.now(), data: {id: 'order_new_fixture', campaignId: campaign, chainId: 5042002,
    hubAddress: hub, buyerPrincipal: '0x' + '2'.repeat(40), quantity: 2,
    commitmentTxHash: '0x' + '3'.repeat(64), deliveryStatus: 'PENDING'}});

test('provider grants an actual protected CSV Studio package from a signed durable order event', {timeout: 90000}, async t => {
  const worker = {config: {name: 'csv-studio-provider-local', compatibilityDate: '2026-10-21',
    compatibilityFlags: ['nodejs_compat'], manifest: {mainModule: 'worker.js', modulesRoot: path.resolve('.cache/bundle'),
      modules: {'worker.js': {type: 'esm', contents: await readFile('.cache/bundle/worker.js', 'utf8')}}},
    env: {DB: {type: 'd1', id: '00000000-0000-0000-0000-000000000002'},
      GROUPDEAL_API_URL: {type: 'text', value: 'https://groupdeal.tech'},
      GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID: {type: 'text', value: subscription},
      GROUPDEAL_WEBHOOK_SECRET: {type: 'text', value: secret},
      CSV_STUDIO_CAMPAIGN_ID: {type: 'text', value: campaign},
      CSV_STUDIO_HUB_ADDRESS: {type: 'text', value: hub}}}};
  const options = {host: '127.0.0.1', telemetry: {enabled: false}, workers: [worker],
    resourcePersistencePath: await mkdtemp(path.resolve('.cache/provider-test-'))};
  let mf = new Miniflare(options), db = await mf.getD1Database('DB');
  t.after(async () => mf.dispose());
  const migrate = async file => db.batch((await readFile(file, 'utf8')).split(';').map(x => x.trim()).filter(Boolean).map(x => db.prepare(x)));
  const post = (event, raw = JSON.stringify(event)) => mf.dispatchFetch(origin + '/webhooks/groupdeal', {method: 'POST', body: raw,
    headers: {'Content-Type': 'application/json', 'X-GroupDeal-Timestamp': String(event.timestamp),
      'X-GroupDeal-Event': event.event, 'X-GroupDeal-Event-Id': event.id,
      'X-GroupDeal-Signature': 'sha256=' + createHmac('sha256', secret).update(event.timestamp + '.' + raw).digest('hex')}});
  const grants = () => db.prepare('SELECT * FROM csv_studio_grants').all();
  const event = committed('evt_provider_order');
  let token, download;

  await t.test('missing business schema returns 503 after durable inbox insert; retry creates the effect', async () => {
    await migrate('migrations/0001_inbox.sql');
    assert.equal((await mf.dispatchFetch(origin + '/healthz')).status, 503);
    assert.equal((await post(event)).status, 503);
    assert.equal((await db.prepare('SELECT state FROM webhook_inbox').first()).state, 'QUEUED');
    await migrate('migrations/0002_csv_studio.sql');
    assert.equal((await post(event)).status, 202);
    assert.equal((await db.prepare('SELECT state FROM webhook_inbox').first()).state, 'DONE');
    const rows = (await grants()).results; assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 2);
    token = rows[0].download_token; assert.match(token, /^[a-f0-9]{64}$/);
    download = origin + '/entitlements/' + token + '/csv-studio.zip';
  });

  await t.test('concurrent duplicate deliveries and a second event for the same order preserve one grant', async () => {
    const responses = await Promise.all(Array.from({length: 5}, () => post(event)));
    assert.ok(responses.every(r => r.status === 202));
    const newer = {...event, id: 'evt_provider_order_second'};
    assert.equal((await post(newer)).status, 202);
    const rows = (await grants()).results; assert.equal(rows.length, 1); assert.equal(rows[0].download_token, token);
  });

  await t.test('download is a real ZIP with private headers; unknown tokens, queries and mutations fail', async () => {
    const response = await mf.dispatchFetch(download); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer()), expected = await readFile('.cache/csv-studio.zip');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(expected).digest('hex'));
    assert.equal(bytes.readUInt32LE(0), 0x04034b50); assert.ok(bytes.includes(Buffer.from('CSV_STUDIO.html')));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    assert.equal((await mf.dispatchFetch(download, {method: 'HEAD'})).status, 200);
    assert.equal((await mf.dispatchFetch(download, {method: 'POST'})).status, 405);
    assert.equal((await mf.dispatchFetch(download + '?token=leak')).status, 404);
    assert.equal((await mf.dispatchFetch(download.replace(token, '0'.repeat(64)))).status, 404);
    assert.equal((await mf.dispatchFetch(origin + '/entitlements')).status, 404);
  });

  await t.test('foreign campaigns and invalid buyer/chain/quantity cannot create rights; changed order context cannot replace rights', async () => {
    const foreign = committed('evt_foreign'); foreign.data.campaignId = 'other_campaign';
    assert.equal((await post(foreign)).status, 202);
    for (const [field, value] of [['chainId', 1], ['quantity', 0], ['quantity', 11], ['buyerPrincipal', 'bad'], ['hubAddress', '0x' + '9'.repeat(40)]]) {
      const e = committed('evt_bad_' + field + String(value).replace(/\W/g, '')); e.data[field] = value;
      assert.equal((await post(e)).status, 503);
    }
    const conflict = committed('evt_order_conflict'); conflict.data.buyerPrincipal = '0x' + '4'.repeat(40);
    assert.equal((await post(conflict)).status, 503);
    // Same event ID with changed data uses the first persisted body, never the replacement.
    const duplicateConflict = {...event, data: {...event.data, quantity: 7}};
    assert.equal((await post(duplicateConflict)).status, 202);
    assert.equal((await grants()).results.length, 1); assert.equal((await grants()).results[0].quantity, 2);
  });

  await t.test('restart preserves the protected entitlement and stable capability', async () => {
    await mf.dispose(); mf = new Miniflare(options); db = await mf.getD1Database('DB');
    assert.equal((await post(event)).status, 202);
    assert.equal((await grants()).results[0].download_token, token);
    assert.equal((await mf.dispatchFetch(download)).status, 200);
  });

  await t.test('revoked and expired grants cannot download; redelivery never reactivates them', async () => {
    await db.prepare("UPDATE csv_studio_grants SET state='REVOKED'").run();
    assert.equal((await mf.dispatchFetch(download)).status, 404);
    assert.equal((await post(event)).status, 202);
    assert.equal((await mf.dispatchFetch(download)).status, 404);
    await db.prepare("UPDATE csv_studio_grants SET state='ACTIVE',expires_at=1").run();
    assert.equal((await mf.dispatchFetch(download)).status, 404);
    await db.prepare('DROP TABLE csv_studio_grants').run();
    assert.equal((await mf.dispatchFetch(download)).status, 503);
    assert.equal((await post({...event, id: 'evt_business_outage'})).status, 503);
  });
});
