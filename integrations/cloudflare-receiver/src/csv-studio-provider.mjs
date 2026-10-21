import {randomBytes, createHash} from 'node:crypto';
import {packageBase64} from '../.cache/csv-studio-package.mjs';

const grantWindow = 30 * 86400000;
const key = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const wallet = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
const tx = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

export function providerEnabled(env) {
  if (env.CSV_STUDIO_CAMPAIGN_ID === undefined && env.CSV_STUDIO_HUB_ADDRESS === undefined) return false;
  if (!key(env.CSV_STUDIO_CAMPAIGN_ID) || !wallet(env.CSV_STUDIO_HUB_ADDRESS)) throw new Error('PROVIDER_CONFIGURATION');
  return true;
}

export async function providerHealth(env) {
  if (providerEnabled(env)) await env.DB.prepare('SELECT order_id FROM csv_studio_grants LIMIT 1').all();
}

export async function fulfillCsvStudio(env, eventId) {
  if (!providerEnabled(env)) return;
  // Use the canonical persisted event, including on duplicate delivery. A conflicting
  // body under the same event ID can never replace the first accepted business input.
  const row = await env.DB.prepare('SELECT event_json,state FROM webhook_inbox WHERE subscription_id=? AND event_id=?')
    .bind(env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID, eventId).first();
  if (!row) throw new Error('INBOX_NOT_FOUND');
  const e = JSON.parse(row.event_json), d = e.data;
  if (e.event !== 'order.committed' || d.campaignId !== env.CSV_STUDIO_CAMPAIGN_ID) return;
  if (!key(d.id) || !wallet(d.buyerPrincipal) || d.chainId !== 5042002
    || !wallet(d.hubAddress) || d.hubAddress.toLowerCase() !== env.CSV_STUDIO_HUB_ADDRESS.toLowerCase()
    || !Number.isSafeInteger(d.quantity) || d.quantity < 1 || d.quantity > 10
    || !tx(d.commitmentTxHash) || d.deliveryStatus !== 'PENDING'
    || !Number.isSafeInteger(e.createdAt) || e.createdAt > Date.now() + 30000
    || e.createdAt + grantWindow <= Date.now()) throw new Error('PROVIDER_ORDER_CONTEXT');
  const immutable = JSON.stringify([d.id, d.campaignId, d.chainId, d.hubAddress.toLowerCase(),
    d.buyerPrincipal.toLowerCase(), d.quantity, d.commitmentTxHash.toLowerCase()]);
  const fingerprint = createHash('sha256').update(immutable).digest('hex');
  const subscription = env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID;
  // A crash after allocation but before DONE is safe: the unique order key returns
  // the existing grant. Concurrent deliveries never replace its capability or expiry.
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO csv_studio_grants(subscription_id,order_id,campaign_id,buyer_principal,quantity,context_sha256,download_token,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(subscription, d.id, d.campaignId, d.buyerPrincipal.toLowerCase(), d.quantity,
      fingerprint, randomBytes(32).toString('hex'), e.createdAt, e.createdAt + grantWindow).run();
  if (!inserted.success) throw new Error('GRANT_UNCONFIRMED');
  const grant = await env.DB.prepare('SELECT context_sha256 FROM csv_studio_grants WHERE subscription_id=? AND order_id=?')
    .bind(subscription, d.id).first();
  if (grant?.context_sha256 !== fingerprint) throw new Error('PROVIDER_ORDER_CONFLICT');
  const done = await env.DB.prepare("UPDATE webhook_inbox SET state='DONE' WHERE subscription_id=? AND event_id=?")
    .bind(subscription, eventId).run();
  if (!done.success || done.meta?.changes !== 1) throw new Error('INBOX_EFFECT_UNCONFIRMED');
}

export async function downloadCsvStudio(request, env) {
  const url = new URL(request.url), match = /^\/entitlements\/([a-f0-9]{64})\/csv-studio\.zip$/.exec(url.pathname);
  const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; sandbox"};
  const fail = status => new Response(null, {status, headers});
  if (!match || url.search) return fail(404);
  if (!['GET', 'HEAD'].includes(request.method)) return fail(405);
  try {
    if (!providerEnabled(env)) return fail(404);
    const grant = await env.DB.prepare('SELECT campaign_id,state,expires_at FROM csv_studio_grants WHERE subscription_id=? AND download_token=?')
      .bind(env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID, match[1]).first();
    if (!grant || grant.campaign_id !== env.CSV_STUDIO_CAMPAIGN_ID
      || grant.state !== 'ACTIVE' || grant.expires_at <= Date.now()) return fail(404);
    const zip = Buffer.from(packageBase64, 'base64');
    return new Response(request.method === 'HEAD' ? null : zip, {headers: {...headers,
      'Content-Type': 'application/zip', 'Content-Length': String(zip.length),
      'Content-Disposition': 'attachment; filename="GroupDeal-CSV-Studio-1.0.zip"'}});
  } catch {return fail(503);}
}
