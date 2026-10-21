import {GroupDealSDK} from '@groupdeal/sdk';
import {downloadCsvStudio, fulfillCsvStudio, providerHealth} from './csv-studio-provider.mjs';
import {providerControl} from './provider-control.mjs';

const MAX_BODY = 1048576;
const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});

function configured(env) {
  return env.DB && typeof env.DB.prepare === 'function'
    && typeof env.GROUPDEAL_WEBHOOK_SECRET === 'string'
    && env.GROUPDEAL_WEBHOOK_SECRET.length >= 32
    && env.GROUPDEAL_WEBHOOK_SECRET.length <= 4096
    && typeof env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID === 'string'
    && /^[A-Za-z0-9_-]{1,180}$/.test(env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID)
    && env.GROUPDEAL_API_URL === 'https://groupdeal.tech';
}

async function rawBody(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) {
    throw Object.assign(new Error('BODY_LIMIT'), {status: 413});
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > MAX_BODY) throw Object.assign(new Error('BODY_LIMIT'), {status: 413});
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
  try {return new TextDecoder('utf-8', {fatal: true}).decode(bytes);}
  catch {throw Object.assign(new Error('BODY_ENCODING'), {status: 400});}
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/entitlements/')) return downloadCsvStudio(request, env);
    if (url.search || !['/healthz', '/webhooks/groupdeal'].includes(url.pathname)) return reply(404, {error: 'NOT_FOUND'});
    if (url.pathname === '/healthz') {
      if (request.method !== 'GET') return reply(405, {error: 'METHOD_NOT_ALLOWED'});
      if (!configured(env)) return reply(503, {status: 'NOT_READY'});
      try {
        await env.DB.prepare('SELECT event_id FROM webhook_inbox LIMIT 1').all();
        await providerHealth(env);
        return reply(200, {status: 'READY'});
      } catch {return reply(503, {status: 'NOT_READY'});}
    }
    if (request.method !== 'POST') return reply(405, {error: 'METHOD_NOT_ALLOWED'});
    if (!configured(env)) return reply(503, {error: 'NOT_READY'});
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || !['identity', null].includes(request.headers.get('content-encoding'))) return reply(415, {error: 'UNSUPPORTED_MEDIA_TYPE'});
    try {
      const body = await rawBody(request);
      if (request.headers.has('x-groupdeal-provider-signature')) return providerControl(request, env, body);
      const headers = {
        signature: request.headers.get('x-groupdeal-signature') || '',
        timestamp: request.headers.get('x-groupdeal-timestamp') || '',
        eventId: request.headers.get('x-groupdeal-event-id') || '',
        event: request.headers.get('x-groupdeal-event') || '',
      };
      const sdk = new GroupDealSDK({baseUrl: env.GROUPDEAL_API_URL,
        webhookSecret: env.GROUPDEAL_WEBHOOK_SECRET,
        webhookSubscriptionId: env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID});
      if (headers.event === 'subscription.review') {
        const acknowledgement = sdk.answerWebhookRecoveryChallenge(body, headers);
        return reply(acknowledgement ? 200 : 401, acknowledgement || {accepted: false});
      }
      const inbox = {persist: async (subscriptionId, event) => {
        const result = await env.DB.prepare('INSERT OR IGNORE INTO webhook_inbox(subscription_id,event_id,event_name,event_json,received_at) VALUES(?,?,?,?,?)')
          .bind(subscriptionId, event.id, event.event, JSON.stringify(event), Date.now()).run();
        if (!result.success || ![0, 1].includes(result.meta?.changes)) throw new Error('INBOX_UNCONFIRMED');
        return result.meta.changes === 1;
      }};
      const result = await sdk.receiveWebhook(body, headers, inbox);
      if (result.accepted) await fulfillCsvStudio(env, headers.eventId);
      return reply(result.accepted ? 202 : 401, {accepted: result.accepted, duplicate: result.duplicate});
    } catch (error) {
      return reply([400, 413].includes(error?.status) ? error.status : 503, {error: 'REQUEST_NOT_ACCEPTED'});
    }
  },
};
