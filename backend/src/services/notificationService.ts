import * as crypto from "crypto";
import nodemailer from "nodemailer";
import { config } from "../config";
import { store, NotificationPreferenceRecord, NotificationRecord } from "../db/store";

type EmailSender = (input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}) => Promise<void>;

export class NotificationService {
  public static preferences(userId: string): NotificationPreferenceRecord {
    return store.db.notificationPreferences[userId] || { inApp: true, email: true };
  }

  public static updatePreferences(
    userId: string,
    input: Partial<NotificationPreferenceRecord>
  ): NotificationPreferenceRecord {
    const current = this.preferences(userId);
    const next = {
      inApp: typeof input.inApp === "boolean" ? input.inApp : current.inApp,
      email: typeof input.email === "boolean" ? input.email : current.email,
    };
    store.db.notificationPreferences[userId] = next;
    store.addAuditLog(userId, "user", "NOTIFICATION_PREFERENCES_UPDATED", next);
    store.save();
    return next;
  }

  public static create(
    userId: string,
    input: Pick<NotificationRecord, "type" | "title" | "message" | "link"> & { dedupeKey?: string }
  ): NotificationRecord | null {
    if (!store.db.users[userId]) return null;
    const preferences = this.preferences(userId);
    const id = input.dedupeKey
      ? `ntf_${crypto.createHash("sha256").update(`${userId}:${input.dedupeKey}`).digest("hex")}`
      : `ntf_${crypto.randomUUID()}`;
    const existing = store.db.notifications[id];
    if (existing) return preferences.inApp ? existing : null;
    const notification: NotificationRecord = {
      id,
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      createdAt: Date.now(),
    };
    store.db.notifications[id] = notification;
    if (preferences.email && store.db.users[userId].emailVerified !== false) {
      const outboxId = `mail_${id}`;
      store.db.emailOutbox[outboxId] = {
        id: outboxId,
        notificationId: id,
        userId,
        status: "QUEUED",
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
      };
    }
    store.save();
    return preferences.inApp ? notification : null;
  }

  public static list(userId: string): NotificationRecord[] {
    return Object.values(store.db.notifications)
      .filter((notification) => notification.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);
  }

  public static markRead(userId: string, notificationId: string): NotificationRecord {
    const notification = store.db.notifications[notificationId];
    if (!notification || notification.userId !== userId) throw new Error("Notification not found");
    notification.readAt ||= Date.now();
    store.save();
    return notification;
  }

  private static defaultEmailSender: EmailSender = async ({
    to,
    subject,
    text,
    idempotencyKey,
  }) => {
    if (config.smtpConfigured) {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        requireTLS: !config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpAppPassword,
        },
        tls: { minVersion: "TLSv1.2" },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      await transporter.sendMail({
        from: config.smtpFrom,
        to,
        subject,
        text,
        headers: { "X-GroupDeal-Idempotency-Key": idempotencyKey },
      });
      return;
    }

    if (!config.emailProviderUrl || !config.emailProviderToken) {
      throw new Error("Transactional email is not configured");
    }
    const response = await fetch(config.emailProviderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.emailProviderToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
  };

  public static async processEmailOutbox(sender: EmailSender = this.defaultEmailSender): Promise<number> {
    if (!config.smtpConfigured && !config.emailProviderUrl && sender === this.defaultEmailSender) {
      return 0;
    }
    const now = Date.now();
    const candidates = Object.values(store.db.emailOutbox)
      .filter((job) => ["QUEUED", "RETRY"].includes(job.status) && job.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 20);

    for (const job of candidates) {
      const notification = store.db.notifications[job.notificationId];
      const user = store.db.users[job.userId];
      if (!notification || !user || user.emailVerified === false) {
        job.status = "DLQ";
        job.lastError = "Notification or user no longer exists";
        store.save();
        continue;
      }
      job.status = "PROCESSING";
      job.attempts += 1;
      store.save();
      try {
        await sender({
          to: user.email,
          subject: notification.title,
          text: notification.message,
          idempotencyKey: job.id,
        });
        job.status = "SENT";
        job.sentAt = Date.now();
        delete job.lastError;
      } catch (error) {
        job.lastError = error instanceof Error ? error.message : "Unknown email delivery error";
        if (job.attempts >= 5) {
          job.status = "DLQ";
          store.addAuditLog("system", "operator", "EMAIL_NOTIFICATION_DLQ", {
            outboxId: job.id,
            notificationId: job.notificationId,
            attempts: job.attempts,
          });
        } else {
          job.status = "RETRY";
          job.nextAttemptAt = Date.now() + Math.min(60_000 * 2 ** job.attempts, 3_600_000);
        }
      }
      store.save();
    }
    return candidates.length;
  }
}
