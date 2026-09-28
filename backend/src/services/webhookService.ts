import * as crypto from "crypto";
import { store, WebhookSubscription } from "../db/store";
import { signWebhookPayload } from "../utils/crypto";

export class WebhookService {
  /**
   * Register or update a seller webhook endpoint
   */
  public static registerWebhook(
    sellerId: string,
    targetUrl: string,
    events: string[]
  ): WebhookSubscription {
    let sub = store.db.webhooks[sellerId];
    if (!sub) {
      sub = {
        id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sellerId,
        targetUrl,
        secret: `whsec_${crypto.randomBytes(24).toString("hex")}`,
        events: events || ["order.committed", "order.delivered", "order.disputed"],
        logs: [],
      };
      store.db.webhooks[sellerId] = sub;
    } else {
      sub.targetUrl = targetUrl;
      sub.events = events;
    }

    store.save();
    return sub;
  }

  /**
   * Dispatch event to seller webhook endpoint
   */
  public static async dispatchEvent(
    sellerId: string,
    eventName: string,
    payload: any
  ): Promise<void> {
    const sub = store.db.webhooks[sellerId];
    if (!sub || !sub.targetUrl) return;

    if (!sub.events.includes(eventName) && !sub.events.includes("*")) {
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const jsonBody = JSON.stringify({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      event: eventName,
      timestamp,
      data: payload,
    });

    const signature = signWebhookPayload(jsonBody, sub.secret, timestamp);

    const logEntry: WebhookSubscription["logs"][0] = {
      id: `log_${Date.now()}`,
      event: eventName,
      payload,
      status: "PENDING",
      timestamp: Date.now(),
      attempts: 1,
    };
    sub.logs.unshift(logEntry);
    if (sub.logs.length > 50) sub.logs.pop();
    store.save();

    // Async attempt delivery
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(sub.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GroupDeal-Signature": `sha256=${signature}`,
          "X-GroupDeal-Timestamp": timestamp.toString(),
          "X-GroupDeal-Event": eventName,
          "User-Agent": "GroupDeal-Webhook-Dispatcher/1.0",
        },
        body: jsonBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      logEntry.statusCode = res.status;
      logEntry.status = res.ok ? "SUCCESS" : "FAILED";
    } catch (err: any) {
      logEntry.status = "FAILED";
      logEntry.error = err.message;
    }

    store.save();
  }
}
