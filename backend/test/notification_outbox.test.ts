import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { store } from "../src/db/store";
import { NotificationService } from "../src/services/notificationService";

async function runNotificationTests() {
  console.log("=== Running Notification & Email Outbox Tests ===");
  const userId = `usr_notification_${crypto.randomUUID()}`;
  store.db.users[userId] = {
    id: userId,
    email: `${userId}@example.test`,
    emailVerified: true,
    createdAt: Date.now(),
    roles: ["buyer"],
    activeWallet: null,
  };
  store.db.userByEmail[store.db.users[userId].email] = userId;
  NotificationService.updatePreferences(userId, { inApp: true, email: true });

  const first = NotificationService.create(userId, {
    type: "TEST",
    title: "Deterministic notification",
    message: "No duplicate email should be queued.",
    dedupeKey: "event:1",
  });
  const duplicate = NotificationService.create(userId, {
    type: "TEST",
    title: "Deterministic notification",
    message: "No duplicate email should be queued.",
    dedupeKey: "event:1",
  });
  assert.ok(first);
  assert.equal(duplicate?.id, first.id);
  assert.equal(
    Object.values(store.db.notifications).filter((item) => item.userId === userId).length,
    1
  );
  assert.equal(
    Object.values(store.db.emailOutbox).filter((item) => item.userId === userId).length,
    1
  );
  console.log("✔ Event-level idempotency prevents duplicate in-app and email notifications");

  const sent: string[] = [];
  await NotificationService.processEmailOutbox(async ({ idempotencyKey }) => {
    sent.push(idempotencyKey);
  });
  assert.equal(sent.length, 1);
  const outbox = Object.values(store.db.emailOutbox).find((item) => item.userId === userId);
  assert.equal(outbox?.status, "SENT");
  console.log("✔ Persistent outbox delivers with an idempotency key and records SENT state");

  NotificationService.markRead(userId, first.id);
  assert.ok(store.db.notifications[first.id].readAt);
  assert.throws(() => NotificationService.markRead("another-user", first.id), /not found/);
  console.log("✔ Read state is scoped to the authenticated notification owner");
}

runNotificationTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
