import * as crypto from "crypto";
import * as dns from "dns";
import { store, WebhookSubscription, WebhookJobRecord, WebhookDLQRecord } from "../db/store";
import { signWebhookPayload } from "../utils/crypto";
import { config } from "../config";

export class WebhookService {
  /**
   * Validate webhook URL against SSRF vulnerabilities with DNS resolution,
   * port policies, and private network rejection.
   */
  public static async validateWebhookUrl(targetUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new Error("Invalid webhook URL format");
    }

    if (config.isProduction && parsed.protocol !== "https:") {
      throw new Error("SSRF Protection: Production webhooks strictly require HTTPS protocol");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid protocol: only http and https are allowed for webhooks");
    }

    // Port check
    const port = parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === "https:" ? 443 : 80;
    if (config.isProduction && port !== 443) {
      throw new Error(`SSRF Protection: Production webhooks only permit port 443 (got ${port})`);
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

    // Helper to evaluate IPv4 address
    const checkIPv4 = (ip: string) => {
      const parts = ip.split(".").map((p) => parseInt(p, 10));
      if (parts.length !== 4 || parts.some(isNaN)) return;
      const [b0, b1] = parts;

      if (
        b0 === 0 || // 0.0.0.0/8
        b0 === 10 || // 10.0.0.0/8 (Private)
        b0 === 127 || // 127.0.0.0/8 (Loopback)
        (b0 === 100 && b1 >= 64 && b1 <= 127) || // 100.64.0.0/10 (Carrier NAT)
        (b0 === 169 && b1 === 254) || // 169.254.0.0/16 (Link Local / Cloud Metadata)
        (b0 === 172 && b1 >= 16 && b1 <= 31) || // 172.16.0.0/12 (Private)
        (b0 === 192 && b1 === 168) || // 192.168.0.0/16 (Private)
        (b0 === 198 && (b1 === 18 || b1 === 19)) || // 198.18.0.0/15 (Benchmarking)
        b0 >= 224 // Multicast and reserved (224.0.0.0/4, 240.0.0.0/4)
      ) {
        throw new Error(`SSRF Protection: Target IP '${ip}' is within a forbidden or private network`);
      }
    };

    // Helper to evaluate IPv6 address
    const checkIPv6 = (ip: string) => {
      const clean = ip.toLowerCase().replace(/[\[\]]/g, "");
      if (
        clean === "::1" ||
        clean === "::" ||
        clean.startsWith("fe80:") || // Link-local
        clean.startsWith("fc00:") || // Unique local
        clean.startsWith("fd00:") // Unique local
      ) {
        throw new Error(`SSRF Protection: Target IPv6 '${ip}' is within a private network`);
      }
      // Check IPv4-mapped IPv6 (::ffff:x.x.x.x)
      if (clean.startsWith("::ffff:")) {
        const v4 = clean.replace("::ffff:", "");
        checkIPv4(v4);
      }
    };

    // Check raw IP if provided as hostname
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      checkIPv4(host);
    } else if (host.includes(":")) {
      checkIPv6(host);
    }

    // Resolve DNS records to prevent DNS Rebinding / Private IP mappings
    try {
      const records = await dns.promises.lookup(host, { all: true });
      for (const rec of records) {
        if (rec.family === 4) {
          checkIPv4(rec.address);
        } else if (rec.family === 6) {
          checkIPv6(rec.address);
        }
      }
    } catch (dnsErr: any) {
      // If error was thrown from our own checks, rethrow it
      if (dnsErr.message.includes("SSRF Protection")) {
        throw dnsErr;
      }
      // If hostname cannot be resolved in offline/test environment, don't fail unless production
      if (config.isProduction) {
        throw new Error(`SSRF Protection: Failed to resolve hostname '${host}': ${dnsErr.message}`);
      }
    }
  }

  /**
   * Register or update a seller webhook endpoint with SSRF check
   */
  public static async registerWebhook(
    sellerId: string,
    targetUrl: string,
    events: string[]
  ): Promise<WebhookSubscription> {
    await this.validateWebhookUrl(targetUrl);

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
   * Enqueue event to persistent queue
   */
  public static enqueueEvent(
    sellerId: string,
    eventName: string,
    payload: any
  ): WebhookJobRecord | null {
    const sub = store.db.webhooks[sellerId];
    if (!sub || !sub.targetUrl) return null;

    if (!sub.events.includes(eventName) && !sub.events.includes("*")) {
      return null;
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: WebhookJobRecord = {
      id: jobId,
      sellerId,
      targetUrl: sub.targetUrl,
      secret: sub.secret,
      eventName,
      payload,
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
    };

    if (!store.db.webhookQueue) store.db.webhookQueue = {};
    store.db.webhookQueue[jobId] = job;
    store.save();

    return job;
  }

  /**
   * Dispatch event directly or via queue
   */
  public static async dispatchEvent(
    sellerId: string,
    eventName: string,
    payload: any
  ): Promise<void> {
    const job = this.enqueueEvent(sellerId, eventName, payload);
    if (job) {
      await this.processQueue();
    }
  }

  /**
   * Process persistent queue with retry schedule, redirect protection, and DLQ
   */
  public static async processQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (!store.db.webhookQueue) store.db.webhookQueue = {};
    if (!store.db.webhookDLQ) store.db.webhookDLQ = {};

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const now = Date.now();

    for (const job of Object.values(store.db.webhookQueue)) {
      if (job.status !== "QUEUED" || job.nextAttemptAt > now) {
        continue;
      }

      processed++;
      job.status = "PROCESSING";
      job.attempts++;

      let success = false;
      let lastError = "";
      let statusCode: number | undefined;

      try {
        await this.validateWebhookUrl(job.targetUrl);

        const timestamp = Math.floor(Date.now() / 1000);
        const jsonBody = JSON.stringify({
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          event: job.eventName,
          timestamp,
          data: job.payload,
        });

        const signature = signWebhookPayload(jsonBody, job.secret, timestamp);

        let currentUrl = job.targetUrl;
        let redirectCount = 0;
        const maxRedirects = 3;

        while (redirectCount <= maxRedirects) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const res = await fetch(currentUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-GroupDeal-Signature": `sha256=${signature}`,
              "X-GroupDeal-Timestamp": timestamp.toString(),
              "X-GroupDeal-Event": job.eventName,
              "User-Agent": "GroupDeal-Webhook-Dispatcher/1.0",
            },
            body: jsonBody,
            redirect: "manual",
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          statusCode = res.status;

          // Handle manual redirect with SSRF validation
          if ([301, 302, 303, 307, 308].includes(res.status)) {
            const location = res.headers.get("location");
            if (!location) {
              throw new Error(`Redirect status ${res.status} missing Location header`);
            }
            const nextUrl = new URL(location, currentUrl).toString();
            // Validate redirect destination against SSRF!
            await this.validateWebhookUrl(nextUrl);
            currentUrl = nextUrl;
            redirectCount++;
            continue;
          }

          if (res.ok) {
            success = true;
            break;
          } else {
            lastError = `Target returned HTTP status ${res.status}`;
            break;
          }
        }
      } catch (err: any) {
        lastError = err.message;
      }

      if (success) {
        job.status = "COMPLETED";
        job.completedAt = Date.now();
        succeeded++;
      } else {
        job.lastError = lastError;
        failed++;
        if (job.attempts >= job.maxAttempts) {
          // Move to Dead Letter Queue (DLQ)
          job.status = "DLQ";
          const dlqId = `dlq_${job.id}`;
          const dlqRecord: WebhookDLQRecord = {
            id: dlqId,
            jobId: job.id,
            sellerId: job.sellerId,
            targetUrl: job.targetUrl,
            eventName: job.eventName,
            payload: job.payload,
            error: lastError,
            failedAt: Date.now(),
            replayed: false,
          };
          store.db.webhookDLQ[dlqId] = dlqRecord;
          store.addAuditLog("system", "operator", "WEBHOOK_MOVED_TO_DLQ", {
            jobId: job.id,
            dlqId,
            sellerId: job.sellerId,
            error: lastError,
          });
        } else {
          // Schedule retry with exponential backoff
          job.status = "QUEUED";
          job.nextAttemptAt = Date.now() + job.attempts * 1000;
        }
      }

      // Record in subscription logs
      const sub = store.db.webhooks[job.sellerId];
      if (sub) {
        const logEntry: WebhookSubscription["logs"][0] = {
          id: `log_${Date.now()}`,
          event: job.eventName,
          payload: job.payload,
          status: success ? "SUCCESS" : job.status === "DLQ" ? "FAILED" : "PENDING",
          statusCode,
          timestamp: Date.now(),
          attempts: job.attempts,
          error: success ? undefined : lastError,
        };
        sub.logs.unshift(logEntry);
        if (sub.logs.length > 50) sub.logs.pop();
      }

      store.save();
    }

    return { processed, succeeded, failed };
  }

  /**
   * Replay a failed job from the Dead Letter Queue (DLQ)
   */
  public static async replayDLQ(dlqId: string): Promise<boolean> {
    if (!store.db.webhookDLQ || !store.db.webhookDLQ[dlqId]) {
      return false;
    }

    const dlq = store.db.webhookDLQ[dlqId];
    if (dlq.replayed) {
      return false;
    }

    dlq.replayed = true;
    dlq.replayedAt = Date.now();

    const newJob = this.enqueueEvent(dlq.sellerId, dlq.eventName, dlq.payload);
    store.addAuditLog("system", "operator", "WEBHOOK_DLQ_REPLAYED", {
      dlqId,
      originalJobId: dlq.jobId,
      newJobId: newJob?.id,
    });
    store.save();

    if (newJob) {
      await this.processQueue();
    }
    return true;
  }
}
