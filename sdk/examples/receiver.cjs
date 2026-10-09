const http = require("node:http");
const { DatabaseSync } = require("node:sqlite");
const { GroupDealSDK } = require("@groupdeal/sdk");

// Configure through the environment; never put a token or webhook secret in a command/log.
if (!process.env.GROUPDEAL_API_URL || !process.env.GROUPDEAL_WEBHOOK_SECRET || !process.env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID || !process.env.GROUPDEAL_INBOX_DB) {
  throw new Error("Configure API origin, webhook secret/subscription ID and an explicit inbox database path");
}
const sdk = new GroupDealSDK({ baseUrl: process.env.GROUPDEAL_API_URL, webhookSecret: process.env.GROUPDEAL_WEBHOOK_SECRET, webhookSubscriptionId: process.env.GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID });
const database = new DatabaseSync(process.env.GROUPDEAL_INBOX_DB);
database.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS webhook_inbox(subscription_id TEXT NOT NULL,event_id TEXT NOT NULL,event_json TEXT NOT NULL,received_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'QUEUED',PRIMARY KEY(subscription_id,event_id));");
const inbox = { persist: async (subscriptionId, event) => database.prepare("INSERT OR IGNORE INTO webhook_inbox(subscription_id,event_id,event_json,received_at) VALUES(?,?,?,?)").run(subscriptionId,event.id,JSON.stringify(event),Date.now()).changes === 1 };

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/webhooks/groupdeal") { response.writeHead(404).end(); return; }
  const chunks = []; let length = 0;
  try {
    for await (const chunk of request) { length += chunk.length; if (length > 1048576) { response.writeHead(413).end(); return; } chunks.push(chunk); }
    const header = name => typeof request.headers[name] === "string" ? request.headers[name] : "";
    const rawBody=Buffer.concat(chunks).toString('utf8'),headers={signature:header("x-groupdeal-signature"),timestamp:header("x-groupdeal-timestamp"),eventId:header("x-groupdeal-event-id"),event:header("x-groupdeal-event")};
    if(headers.event==='subscription.review'){
      const acknowledgement=sdk.answerWebhookRecoveryChallenge(rawBody,headers);
      response.writeHead(acknowledgement?200:401,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(acknowledgement??{accepted:false}));return;
    }
    const result = await sdk.receiveWebhook(rawBody,headers,inbox);
    response.writeHead(result.accepted ? 202 : 401, {"Content-Type":"application/json"}).end(JSON.stringify({accepted:result.accepted,duplicate:result.duplicate}));
  } catch { response.writeHead(503).end(); } // Producer retries when the durable inbox is unavailable.
});
server.listen(Number(process.env.PORT || 8080), "127.0.0.1", () => { if (process.send) process.send({ready:true,port:server.address().port}); });
process.on("SIGTERM", () => server.close(() => {database.close();process.exit(0);}));

// Process QUEUED inbox rows with a separate worker. Commit the business effect and inbox completion atomically,
// or use an idempotency key at the resource provider. HMAC/inbox insertion alone never delivers an entitlement.
