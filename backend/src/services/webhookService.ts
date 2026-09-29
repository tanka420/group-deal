import * as crypto from "crypto";
import { store, WebhookSubscription } from "../db/store";
import { signWebhookPayload } from "../utils/crypto";

export class WebhookService {
  /**
   * Validate webhook URL against SSRF vulnerabilities
   */
  public static validateWebhookUrl(targetUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new Error("Invalid webhook URL format");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid protocol: only http and https are allowed for webhooks");
    }

    const host = parsed.hostname.toLowerCase();

    // Block loopback and local domain names
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      throw new Error(`SSRF Protection: Webhook target host '${host}' is not permitted`);
    }

    // Block IPv4 private ranges (RFC 1918, RFC 3927, loopback)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = host.match(ipv4Regex);
    if (ipMatch) {
      const b0 = parseInt(ipMatch[1], 10);
      const b1 = parseInt(ipMatch[2], 10);

      if (
        b0 === 127 || // 127.0.0.0/8 (Loopback)
        b0 === 10 || // 10.0.0.0/8 (Private)
        b0 === 0 || // 0.0.0.0/8 (Broadcast/this network)
        (b0 === 172 && b1 >= 16 && b1 <= 31) || // 172.16.0.0/12 (Private)
        (b0 === 192 && b1 === 168) || // 192.168.0.0/16 (Private)
        (b0 === 169 && b1 === 254) || // 169.254.0.0/16 (Link Local / Cloud Metadata)
        (b0 === 100 && b1 >= 64 && b1 <= 127) // 100.64.0.0/10 (Carrier NAT)
      ) {
        throw new Error(`SSRF Protection: Webhook target IP '${host}' is within a private network`);
      }
    }

    // Block IPv6 local/private ranges
    const cleanHost = host.replace(/[\[\]]/g, "");
    if (
      cleanHost === "::1" ||
      cleanHost.startsWith("fe80:") ||
      cleanHost.startsWith("fc00:") ||
      cleanHost.startsWith("fd00:")
    ) {
      throw new Error(`SSRF Protection: Webhook target IPv6 '${host}' is within a private network`);
    }
  }

  /**
   * Register or update a seller webhook endpoint with SSRF check
   */
  public static registerWebhook(
    sellerId: string,
    targetUrl: string,
    events: string[]
  ): WebhookSubscription {
    this.validateWebhookUrl(targetUrl);

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
   * Dispatch event to seller webhook endpoint with retry mechanism
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

    try {
      this.validateWebhookUrl(sub.targetUrl);
    } catch (e: any) {
      console.warn(`[WEBHOOK] Blocked dispatch to invalid target '${sub.targetUrl}': ${e.message}`);
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
      attempts: 0,
    };
    sub.logs.unshift(logEntry);
    if (sub.logs.length > 50) sub.logs.pop();
    store.save();

    // Retry loop with exponential backoff (up to 3 attempts)
    const maxAttempts = 3;
    let attempt = 0;
    let success = false;
    let lastError = "";
    let statusCode: number | undefined;

    while (attempt < maxAttempts && !success) {
      attempt++;
      logEntry.attempts = attempt;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

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
        statusCode = res.status;
        if (res.ok) {
          success = true;
          logEntry.status = "SUCCESS";
          logEntry.statusCode = statusCode;
          break;
        } else {
          lastError = `Server responded with status HTTP ${res.status}`;
        }
      } catch (err: any) {
        lastError = err.message;
      }

      if (!success && attempt < maxAttempts) {
        // Backoff delay before retry
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }

    if (!success) {
      logEntry.status = "FAILED";
      logEntry.error = lastError;
      logEntry.statusCode = statusCode;
    }

    store.save();
  }
}
