import * as fs from "fs";
import * as path from "path";
import * as os from "node:os";
import { DatabaseSync } from "node:sqlite";

export interface UserRecord {
  id: string;
  email: string;
  emailVerified?: boolean;
  loginMethod?: "CIRCLE_EMAIL" | "EVM_WALLET";
  createdAt: number;
  roles: ("buyer" | "seller" | "operator")[];
  activeWallet: string | null; // 1-to-1 atomic binding
  circleUserId?: string;
  circleWallet?: {
    address: string;
    walletId: string;
    blockchain: "ARC-TESTNET";
  };
  sellerProfile?: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    verifiedSellerBadge: boolean;
    verifiedRightsBadge: boolean;
    payoutProofSignature?: string;
  };
}

export interface SanitizedUser {
  id: string;
  email: string | null;
  loginMethod: "CIRCLE_EMAIL" | "EVM_WALLET";
  createdAt: number;
  roles: ("buyer" | "seller" | "operator")[];
  activeWallet: string | null;
  circleWallet?: {
    address: string;
    walletId: string;
    blockchain: "ARC-TESTNET";
  };
  sellerProfile?: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    verifiedSellerBadge: boolean;
    verifiedRightsBadge: boolean;
  };
}

export interface WalletChallengeRecord {
  userId: string;
  action: "WALLET_LOGIN" | "LINK_WALLET" | "SELLER_PAYOUT" | "OPERATOR_ACTION";
  walletAddress: string;
  message: string;
  expiresAt: number;
  nonce: string;
  chainId: number;
  origin: string;
}

export interface ConsumedTxRecord {
  intentId: string;
  blockNumber: number;
  verifiedAt: number;
}

export interface CircleOperationRecord {
  operationId: string;
  userId: string;
  walletId: string;
  payloadHash: string;
  idempotencyKey: string;
  challengeId?: string;
  createdAt: number;
}

export interface CircleLoginAttemptRecord {
  id: string;
  email: string;
  // Legacy records incorrectly stored the device-token subject as a user ID.
  circleUserId?: string;
  bindingVersion?: 2;
  deviceIdHash: string;
  expiresAt: number;
  consumedAt?: number;
}

export function sanitizeUser(user: UserRecord): SanitizedUser {
  const loginMethod = user.loginMethod || "CIRCLE_EMAIL";
  return {
    id: user.id,
    email: loginMethod === "EVM_WALLET" || user.emailVerified === false ? null : user.email,
    loginMethod,
    createdAt: user.createdAt,
    roles: user.roles,
    activeWallet: user.activeWallet,
    circleWallet: user.circleWallet
      ? {
          address: user.circleWallet.address,
          walletId: user.circleWallet.walletId,
          blockchain: user.circleWallet.blockchain,
        }
      : undefined,
    sellerProfile: user.sellerProfile
      ? {
          displayName: user.sellerProfile.displayName,
          bio: user.sellerProfile.bio,
          payoutWallet: user.sellerProfile.payoutWallet,
          verifiedSellerBadge: user.sellerProfile.verifiedSellerBadge,
          verifiedRightsBadge: user.sellerProfile.verifiedRightsBadge,
        }
      : undefined,
  };
}

export interface OtpRecord {
  code?: string;
  hashedCode?: string;
  salt?: string;
  expiresAt: number;
  attempts?: number;
  requestedAt?: number;
}

export interface CampaignRecord {
  id: string;
  onchainCampaignId?: number;
  title: string;
  description: string;
  category: string;
  thumbnailUrl: string;
  sellerId: string;
  sellerPayoutWallet: string;
  status: "DRAFT" | "PUBLISHED" | "ACTIVE" | "FINALIZED" | "CANCELLED";
  visibility: "PUBLIC" | "UNLISTED";
  metric: "BUYER_COUNT" | "UNITS_COUNT";
  tiers: { threshold: number; price: string }[]; // price in base USDC string
  currentUnlockedTier: number;
  maxPerAccount: number;
  inventoryLimit: number;
  durationSeconds: number;
  deliverySlaSeconds: number; // 24h or 48h
  earlyRebateEnabled: boolean;
  earlySlotsCount: number;
  earlyRebateAmount: string;
  earlyRebateBps: number;
  platformFeeBps: number;
  termsHash: string;
  startTime: number;
  endTime: number;
  finalizedAt?: number;
  finalClearingPrice?: string;
  totalBuyerCount: number;
  totalUnitsCommitted: number;
  totalGrossCommitted: string;
  deliveryMethod: "LICENSE_KEY" | "FILE_LINK" | "ACCOUNT_INVITE" | "WEBHOOK";
  deliveryContentTemplate: string;
  dryRunDeliveryVerified: boolean;
  txHash?: string;
  amendments: { id: string; timestamp: number; note: string; hash: string }[];
}

export interface OrderRecord {
  id: string; // "1", "2", ...
  onchainOrderId: number;
  campaignId: string;
  buyerAccountId: string;
  campaignIdentity: string; // pseudo-anonymous hash
  buyerPrincipal: string; // pinned wallet
  quantity: number;
  lockedUnitPrice: string;
  committedGross: string;
  isEarlySupporter: boolean;
  earlyRebateValue: string;
  rebateAllocated: string;
  sellerAllocated: string;
  buyerRefundAllocated: string;
  deliveryStatus:
    | "PENDING"
    | "DELIVERED"
    | "CONFIRMED"
    | "DISPUTED"
    | "BREACHED_REFUNDED"
    | "RESOLVED";
  deliveredEntitlementEncrypted?: string;
  deliveryProofHash?: string;
  deliveryTimestamp?: number;
  disputeDeadline?: number;
  disputeReason?: string;
  disputeEvidence?: string[];
  txHash: string;
  createdAt: number;
  buyerClaimed: boolean;
  sellerClaimed: boolean;
  review?: {
    score: number;
    comment: string;
    createdAt: number;
    sellerResponse?: string;
  };
}

export interface SupportMessageRecord {
  id: string;
  orderId: string;
  senderRole: "buyer" | "seller" | "operator";
  senderWallet: string;
  text: string;
  timestamp: number;
}

export interface WebhookSubscription {
  id: string;
  sellerId: string;
  targetUrl: string;
  secret: string;
  events: string[];
  logs: {
    id: string;
    event: string;
    payload: any;
    statusCode?: number;
    status: "SUCCESS" | "FAILED" | "PENDING";
    timestamp: number;
    attempts: number;
    error?: string;
  }[];
}

import * as crypto from "crypto";

export interface AuditLogRecord {
  id: string;
  timestamp: number;
  actor: string;
  role: string;
  action: string;
  details: any;
  prevHash: string;
  hash: string;
}

export interface WebhookJobRecord {
  id: string;
  sellerId: string;
  targetUrl: string;
  secret: string;
  eventName: string;
  payload: any;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DLQ";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
  completedAt?: number;
}

export interface WebhookDLQRecord {
  id: string;
  jobId: string;
  sellerId: string;
  targetUrl: string;
  eventName: string;
  payload: any;
  error: string;
  failedAt: number;
  replayed: boolean;
  replayedAt?: number;
}

export interface EventJournalRecord {
  id: string; // `${chainId}_${emitter}_${txHash}_${logIndex}`
  chainId: number;
  contractAddress: string;
  blockNumber: number;
  blockHash: string;
  transactionIndex: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  payload: any;
  processedAt: number;
}

export interface SyncState {
  lastIndexedBlock: number;
  lastSyncTimestamp: number;
}

export interface MigrationState {
  currentVersion: number;
  appliedMigrations: string[];
}

export interface RateLimitRecord {
  windowStartedAt: number;
  count: number;
  lastAttemptAt: number;
  blockedUntil?: number;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  createdAt: number;
  readAt?: number;
}

export interface NotificationPreferenceRecord {
  inApp: boolean;
  email: boolean;
}

export interface EmailOutboxRecord {
  id: string;
  notificationId: string;
  userId: string;
  status: "QUEUED" | "PROCESSING" | "SENT" | "RETRY" | "DLQ";
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
  sentAt?: number;
}

export interface DatabaseSchema {
  users: Record<string, UserRecord>;
  userByEmail: Record<string, string>; // email -> userId
  userByWallet: Record<string, string>; // wallet -> userId (atomic unique index)
  userByCircleId: Record<string, string>; // Circle user id -> userId (atomic unique index)
  emailOtps: Record<string, OtpRecord>;
  walletChallenges: Record<string, WalletChallengeRecord>;
  consumedTxHashes: Record<string, ConsumedTxRecord>;
  circleOperations: Record<string, CircleOperationRecord>;
  circleLoginAttempts: Record<string, CircleLoginAttemptRecord>;
  rateLimits: Record<string, RateLimitRecord>;
  notifications: Record<string, NotificationRecord>;
  notificationPreferences: Record<string, NotificationPreferenceRecord>;
  emailOutbox: Record<string, EmailOutboxRecord>;
  campaigns: Record<string, CampaignRecord>;
  orders: Record<string, OrderRecord>;
  supportMessages: Record<string, SupportMessageRecord[]>; // orderId -> messages
  webhooks: Record<string, WebhookSubscription>;
  webhookQueue: Record<string, WebhookJobRecord>;
  webhookDLQ: Record<string, WebhookDLQRecord>;
  auditLogs: AuditLogRecord[];
  eventJournal: Record<string, EventJournalRecord>;
  syncState: SyncState;
  migrationState: MigrationState;
}

export class TransactionalStore {
  private filePath: string;
  private legacyFilePath: string;
  private sqlite: DatabaseSync;
  private data: DatabaseSchema;

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(__dirname, "../../data");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "groupdeal.sqlite");
    this.legacyFilePath = path.join(dir, "groupdeal_db.json");
    this.sqlite = new DatabaseSync(this.filePath);
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    this.applySqlMigrations();
    this.data = this.load();
  }

  private applySqlMigrations(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS unique_users (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        wallet TEXT UNIQUE,
        circle_user_id TEXT UNIQUE,
        circle_wallet_id TEXT UNIQUE
      );
      CREATE TABLE IF NOT EXISTS unique_event_journal (
        event_key TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        UNIQUE(chain_id, tx_hash, log_index)
      );
      CREATE TABLE IF NOT EXISTS unique_circle_operations (
        operation_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload_hash TEXT NOT NULL
      );
      INSERT OR IGNORE INTO schema_migrations(version, name, applied_at)
      VALUES (1, 'v1_transactional_state_and_uniqueness', unixepoch() * 1000);
    `);
  }

  private emptySchema(): DatabaseSchema {
    return {
      users: {},
      userByEmail: {},
      userByWallet: {},
      userByCircleId: {},
      emailOtps: {},
      walletChallenges: {},
      consumedTxHashes: {},
      circleOperations: {},
      circleLoginAttempts: {},
      rateLimits: {},
      notifications: {},
      notificationPreferences: {},
      emailOutbox: {},
      campaigns: {},
      orders: {},
      supportMessages: {},
      webhooks: {},
      webhookQueue: {},
      webhookDLQ: {},
      auditLogs: [],
      eventJournal: {},
      syncState: { lastIndexedBlock: 0, lastSyncTimestamp: 0 },
      migrationState: { currentVersion: 1, appliedMigrations: ["v1_initial_schema"] },
    };
  }

  private normalize(parsed: Partial<DatabaseSchema>): DatabaseSchema {
    const normalized = { ...this.emptySchema(), ...parsed } as DatabaseSchema;
    normalized.userByCircleId ||= {};
    normalized.circleOperations ||= {};
    normalized.circleLoginAttempts ||= {};
    normalized.rateLimits ||= {};
    normalized.notifications ||= {};
    normalized.notificationPreferences ||= {};
    normalized.emailOutbox ||= {};
    normalized.eventJournal ||= {};
    normalized.walletChallenges ||= {};
    normalized.consumedTxHashes ||= {};
    normalized.webhookQueue ||= {};
    normalized.webhookDLQ ||= {};
    normalized.syncState ||= { lastIndexedBlock: 0, lastSyncTimestamp: 0 };
    normalized.migrationState ||= {
      currentVersion: 1,
      appliedMigrations: ["v1_initial_schema"],
    };
    return normalized;
  }

  private load(): DatabaseSchema {
    try {
      const row = this.sqlite.prepare("SELECT state_json FROM app_state WHERE id = 1").get() as
        | { state_json: string }
        | undefined;
      if (row) return this.normalize(JSON.parse(row.state_json));

      if (fs.existsSync(this.legacyFilePath)) {
        const imported = this.normalize(JSON.parse(fs.readFileSync(this.legacyFilePath, "utf8")));
        this.data = imported;
        this.save();
        console.warn(`[DB MIGRATION] Imported legacy JSON data into SQLite: ${this.legacyFilePath}`);
        return imported;
      }
      const empty = this.emptySchema();
      this.data = empty;
      this.save();
      return empty;
    } catch (error) {
      const backupPath = `${this.filePath}.corrupted.${Date.now()}`;
      try {
        this.sqlite.close();
        if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, backupPath);
      } catch (backupError) {
        console.error("[DB CRITICAL] Failed to preserve the unreadable SQLite database:", backupError);
      }
      throw new Error(
        `[DB CRITICAL] Unable to load transactional database ${this.filePath}. Snapshot: ${backupPath}. Cause: ${String(error)}`
      );
    }
  }

  public save(): void {
    const serialized = JSON.stringify(
      this.data,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      0
    );
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.exec(
        "DELETE FROM unique_users; DELETE FROM unique_event_journal; DELETE FROM unique_circle_operations;"
      );
      const insertUser = this.sqlite.prepare(
        "INSERT INTO unique_users(user_id, email, wallet, circle_user_id, circle_wallet_id) VALUES (?, ?, ?, ?, ?)"
      );
      for (const user of Object.values(this.data.users)) {
        insertUser.run(
          user.id,
          user.email.trim().toLowerCase(),
          user.activeWallet?.toLowerCase() || null,
          user.circleUserId || null,
          user.circleWallet?.walletId || null
        );
      }

      const insertEvent = this.sqlite.prepare(
        "INSERT INTO unique_event_journal(event_key, chain_id, tx_hash, log_index) VALUES (?, ?, ?, ?)"
      );
      for (const [key, event] of Object.entries(this.data.eventJournal)) {
        insertEvent.run(key, event.chainId, event.txHash.toLowerCase(), event.logIndex);
      }

      const insertCircleOperation = this.sqlite.prepare(
        "INSERT INTO unique_circle_operations(operation_id, idempotency_key, payload_hash) VALUES (?, ?, ?)"
      );
      for (const operation of Object.values(this.data.circleOperations)) {
        insertCircleOperation.run(operation.operationId, operation.idempotencyKey, operation.payloadHash);
      }

      this.sqlite
        .prepare(
          "INSERT INTO app_state(id, state_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at"
        )
        .run(serialized, Date.now());
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw new Error(`[DB TRANSACTION] Atomic persistence failed: ${String(error)}`);
    }
  }

  public replace(next: DatabaseSchema): void {
    const previous = this.data;
    this.data = this.normalize(next);
    try {
      this.save();
    } catch (error) {
      this.data = previous;
      throw error;
    }
  }

  public close(): void {
    this.sqlite.close();
  }

  public get db(): DatabaseSchema {
    return this.data;
  }

  public addAuditLog(actor: string, role: string, action: string, details: any): AuditLogRecord {
    const timestamp = Date.now();
    const prevHash =
      this.data.auditLogs.length > 0
        ? this.data.auditLogs[0].hash
        : "0000000000000000000000000000000000000000000000000000000000000000";
    const payloadToHash = `${prevHash}:${timestamp}:${actor}:${role}:${action}:${JSON.stringify(details)}`;
    const hash = crypto.createHash("sha256").update(payloadToHash).digest("hex");

    const entry: AuditLogRecord = {
      id: `audit_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      actor,
      role,
      action,
      details,
      prevHash,
      hash,
    };
    this.data.auditLogs.unshift(entry);
    // keep latest 1000 logs
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 1000);
    }
    this.save();
    return entry;
  }

  public verifyAuditLogIntegrity(): { valid: boolean; brokenAtId?: string } {
    const logs = this.data.auditLogs;
    for (let i = 0; i < logs.length; i++) {
      const entry = logs[i];
      const expectedPrevHash =
        i + 1 < logs.length
          ? logs[i + 1].hash
          : "0000000000000000000000000000000000000000000000000000000000000000";

      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAtId: entry.id };
      }

      const payload = `${entry.prevHash}:${entry.timestamp}:${entry.actor}:${entry.role}:${entry.action}:${JSON.stringify(entry.details)}`;
      const computedHash = crypto.createHash("sha256").update(payload).digest("hex");
      if (computedHash !== entry.hash) {
        return { valid: false, brokenAtId: entry.id };
      }
    }
    return { valid: true };
  }

  public runMigrations(): { appliedCount: number; currentVersion: number } {
    let appliedCount = 0;
    if (!this.data.migrationState) {
      this.data.migrationState = { currentVersion: 1, appliedMigrations: ["v1_initial_schema"] };
      appliedCount++;
    }
    if (this.data.migrationState.currentVersion < 2) {
      if (!this.data.webhookQueue) this.data.webhookQueue = {};
      if (!this.data.webhookDLQ) this.data.webhookDLQ = {};
      this.data.migrationState.currentVersion = 2;
      this.data.migrationState.appliedMigrations.push("v2_webhook_queue_and_dlq");
      appliedCount++;
    }
    if (this.data.migrationState.currentVersion < 3) {
      this.data.migrationState.currentVersion = 3;
      this.data.migrationState.appliedMigrations.push("v3_audit_hash_chain");
      appliedCount++;
    }
    if (appliedCount > 0) {
      this.save();
    }
    return { appliedCount, currentVersion: this.data.migrationState.currentVersion };
  }
}

// Compatibility alias for existing imports. Persistence is SQLite, never JSON.
export { TransactionalStore as JsonStore };
// Test entrypoints must never write backend/data used by a running server.
// Separate process = separate SQLite directory, including the default test suite.
const isTestEntrypoint = process.argv.some((arg) => /[\\/]test[\\/].+\.test\.ts$/.test(arg));
export const store = new TransactionalStore(isTestEntrypoint
  ? fs.mkdtempSync(path.join(os.tmpdir(), "groupdeal-test-"))
  : undefined);
