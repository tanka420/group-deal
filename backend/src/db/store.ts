import * as fs from "fs";
import * as path from "path";
import * as os from "node:os";
import { DatabaseSync } from "node:sqlite";
import {isDeepStrictEqual} from "node:util";
import { RowPersistence, StorageConflict, LegacyWriterConflict } from "./rowPersistence";
import type { ProductRecord, ProductVersionRecord, LicenseVersionRecord, RightsRecord, ProductSnapshot } from "../domain/product";
import type { TransactionOperation } from "../domain/operation";
import type { DigitalResource, LicenseInventoryRecord, ResourceGrant, DeliveryProbe,ResourceCommand } from "../domain/delivery";
import type { WalletBindingIntent } from "../domain/walletBinding";
import type { SellerProfileIntent } from "../domain/sellerProfile";
import type {SellerFollowRecord,SellerFollowCommand} from '../domain/sellerFollow';
import type {SupportTicket,SupportTicketMessage,SupportAttachment,SupportCommand} from '../domain/support';
import type {AuthRecoveryBarrier} from '../domain/authRecovery';
import type {RestoredWorkBarrier} from '../domain/restoredWork';
import type {WebhookRecoveryReview} from '../domain/webhookRecovery';

export interface UserRecord {
  accountAccess?:import('../domain/accountAccess').AccountAccess;
  id: string;
  email: string;
  emailVerified?: boolean;
  contact?: ContactRecord;
  operatorEnrollment?:import('../domain/operatorEnrollment').OperatorEnrollmentRecord;
  legacySessionEpoch?: number;
  loginMethod?: "CIRCLE_EMAIL" | "EVM_WALLET";
  createdAt: number;
  roles: ("buyer" | "seller" | "operator")[];
  activeWallet: string | null; // Selected wallet; verified sign-in bindings are retained separately.
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
    payoutProofIntentId?: string;
  };
}

export interface ContactChallengeRecord {
  id: string;
  requestKey: string;
  baseRevision: number;
  targetEncrypted: string;
  keyId: string;
  salt: string;
  codeDigest: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  state: "PENDING" | "VERIFIED" | "EXPIRED" | "LOCKED" | "CANCELLED";
  outboxId: string;
}

export interface ContactRecord {
  version: 1;
  revision: number;
  verified?: { payloadEncrypted: string; verifiedAt?: number; source: "LEGACY_VERIFIED_EMAIL" | "CONTACT_CHALLENGE" };
  pending?: ContactChallengeRecord;
  lastVerificationId?: string;
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
  realm?:"ADMIN";
  userId: string;
  action: "WALLET_LOGIN" | "LINK_WALLET" | "SELLER_PAYOUT" | "OPERATOR_ACTION" | "OPERATOR_SELLER_BADGE" | "OPERATOR_ENROLLMENT";
  enrollmentAuthority?:import('../domain/operatorEnrollment').OperatorAuthority;
  walletAddress: string;
  message: string;
  expiresAt: number;
  nonce: string;
  chainId: number;
  origin: string;
  purpose?:import('../domain/sellerBadge').BadgePurpose;
  authRecoveryContext?:string;
}

export interface ConsumedTxRecord {
  intentId: string;
  blockNumber: number;
  verifiedAt: number;
  bindingVersion?:1|2;
  receiptStatus?:0;
  nonce?:number;
  intentDigest?:string;
  chainId?:number;
  hubAddress?:string;
  blockHash?:string;
  blockTimestamp?:number;
  eventName?:string;
  eventDigest?:string;
  transactionIndex?:number;
  logIndex?:number;
}

export interface CircleOperationRecord {
  operationId: string;
  userId: string;
  walletId: string;
  payloadHash: string;
  idempotencyKey: string;
  challengeId?: string;
  createdAt: number;
  version?: 2;
  state?: 'REQUESTED' | 'READY';
  circleUserId?: string;
  walletAddress?: string;
  chainId?: number;
  contractAddress?: string;
  calldataHash?: string;
  intentType?: string;
  authorityBase?: string;
  policyDigest?: string;
  requestId?: string;
  authRecoveryContext?: string;
  completedAt?: number;
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
  createdAt?: number;
  authRecoveryContext?:string;
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
  /** Encrypted original indexer projection retained when binding to a stable draft. */
  mergedProjectionEncrypted?:string;
  protocolVersion?:number;
  id: string;
  onchainCampaignId?: number;
  chainId?: number;
  hubAddress?: string;
  projectionOrigin?: "VERIFIED_PUBLISH" | "CHAIN_UNBOUND";
  productSnapshot?: ProductSnapshot;
  draftProductVersionId?: string;
  draftVersion?: number;
  replacementFor?: {campaignId:string;onchainCampaignId:number;chainId:number;hubAddress:string;creationTermsHash:string;sourceProtocolVersion:number};
  deliveryProbeId?: string;
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
  /** Immutable hash in the verified creation receipt, distinct from current chain terms. */
  creationTermsHash?: string;
  /** A chain hash change cannot silently authorize unpublished product/license terms. */
  termsPolicyReviewRequired?: boolean;
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
  protocolVersion?:number;
  id: string; // "1", "2", ...
  onchainOrderId: number;
  chainId?: number;
  hubAddress?: string;
  campaignId: string;
  buyerAccountId: string;
  campaignIdentity: string; // pseudo-anonymous hash
  productSnapshot?: ProductSnapshot;
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
  commitmentTxHash?: string;
  deliveryTxHash?: string;
  buyerClaimedAmount?: string;
  sellerClaimedAmount?: string;
  financialProjectionBlock?: number;
  transactionHistory?: {
    action: string; txHash: string; blockNumber: number; blockHash: string; logIndex: number; chainId: number; hubAddress: string;
  }[];
  disputeResolution?: { txHash: string; notes: string; operatorId: string };
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
  secret: string; // Legacy plaintext read compatibility; new records keep this empty.
  secretEncrypted?: string;
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
  subscriptionReviewId?:string;
  eventId?: string;
  eventCreatedAt?: number;
  sellerId: string;
  targetUrl: string;
  secret: string; // Legacy plaintext read compatibility; new records keep this empty.
  secretEncrypted?: string;
  eventName: string;
  payload: any;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DLQ";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lastError?: string;
  leaseToken?: string;
  leaseExpiresAt?: number;
  createdAt: number;
  completedAt?: number;
}

export interface WebhookDLQRecord {
  id: string;
  eventId?: string;
  eventCreatedAt?: number;
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
  evidenceVersion?: 2;
  eventDigest?: string;
  blockTimestamp?: number;
}

export interface SyncState {
  lastIndexedBlock: number;
  lastSyncTimestamp: number;
  lastIndexedBlockHash?: string;
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
  inAppEnabled?: boolean;
  translations?: { en: {title:string;message:string} };
  source?: NotificationSource;
}

export type NotificationSource =
  | {kind:'SUPPORT_TICKET';eventId:string;ticketId:string;occurredAt:number}
  | {kind:"CHAIN_EVENT";eventId:string;eventName:string;chainId:number;hubAddress:string;txHash:string;blockNumber:number;blockHash:string;logIndex:number;occurredAt:number}
  | {kind:"SELLER_FOLLOW_EVENT";campaignId:string;sellerId:string;eventId:string;eventName:string;chainId:number;hubAddress:string;txHash:string;blockNumber:number;blockHash:string;logIndex:number;occurredAt:number}
  | {kind:"SUPPORT_MESSAGE";eventId:string;orderId:string;occurredAt:number};

export interface NotificationPreferenceRecord {
  inApp: boolean;
  email: boolean;
}

export interface EmailOutboxRecord {
  id: string;
  notificationId: string;
  userId: string;
  status: "QUEUED" | "PROCESSING" | "SENT" | "RETRY" | "DLQ" | "CANCELLED";
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
  sentAt?: number;
  payloadEncrypted?: string;
  leaseToken?: string;
  leaseExpiresAt?: number;
  purpose?: "CONTACT_VERIFICATION";
  contactChallengeId?: string;
  redrives?: {requestId:string;actorId:string;createdAt:number}[];
}

export interface AuthSessionRecord {
  realm?:"ADMIN";
  id:string; // Public management ID, separate from the JWT token ID and hashed storage key.
  userId:string;
  kind:"MANAGED"|"LEGACY";
  loginMethod:"CIRCLE_EMAIL"|"EVM_WALLET"|"UNKNOWN";
  issuedAt:number;
  expiresAt:number;
  createdAt:number;
  lastActivityAt:number;
  legacyEpoch?:number;
  authRecoveryContext?:string;
  state:"ACTIVE"|"REVOKED";
  revokedAt?:number;
  revokeReason?:"LOGOUT"|"USER_REVOKED"|"OTHER_SESSIONS"|"ALL_SESSIONS";
  revokeRequestId?:string;
}

export interface AuthSessionCommandRecord {
  id:string;
  userId:string;
  initiatorId:string;
  scope:"ONE"|"OTHERS"|"ALL";
  targetId?:string;
  createdAt:number;
  affectedCount:number;
  currentRevoked:boolean;
}

export interface DatabaseSchema {
  users: Record<string, UserRecord>;
  authSessions: Record<string, AuthSessionRecord>;
  authSessionCommands:Record<string,AuthSessionCommandRecord>;
  authRecovery?:Record<string,AuthRecoveryBarrier>;
  restoredWork?:Record<string,RestoredWorkBarrier>;
  webhookRecoveryReviews?:Record<string,WebhookRecoveryReview>;
  walletBindingIntents:Record<string,WalletBindingIntent>;
  sellerProfileIntents:Record<string,SellerProfileIntent>;
  sellerFollows:Record<string,SellerFollowRecord>;
  sellerFollowCommands:Record<string,SellerFollowCommand>;
  supportTickets:Record<string,SupportTicket>;
  supportTicketMessages:Record<string,SupportTicketMessage>;
  supportAttachments:Record<string,SupportAttachment>;
  supportCommands:Record<string,SupportCommand>;
  userByEmail: Record<string, string>; // email -> userId
  userByWallet: Record<string, string>; // wallet -> userId (atomic unique index)
  userByCircleId: Record<string, string>; // Circle user id -> userId (atomic unique index)
  emailOtps: Record<string, OtpRecord>;
  walletChallenges: Record<string, WalletChallengeRecord>;
  consumedTxHashes: Record<string, ConsumedTxRecord>;
  circleOperations: Record<string, CircleOperationRecord>;
  operations: Record<string, TransactionOperation>;
  bridgeTransfers?:Record<string,import('../domain/bridgeTransfer').BridgeTransferRecord>;
  signerReservations?:Record<string,import('../domain/signerReservation').SignerReservation>;
  walletFlows?:Record<string,import('../domain/walletFlow').WalletFlowRecord>;
  campaignDraftKeys: Record<string, {sellerId:string;idempotencyKey:string;payloadHash:string;campaignId:string;writeKind?:"CREATE"|"UPDATE";expectedVersion?:number;committedVersion?:number}>;
  circleLoginAttempts: Record<string, CircleLoginAttemptRecord>;
  campaignIdentities: Record<string, { accountId: string; campaignId: string; identity: string; derivationVersion: number; createdAt: number }>;
  rateLimits: Record<string, RateLimitRecord>;
  notifications: Record<string, NotificationRecord>;
  notificationPreferences: Record<string, NotificationPreferenceRecord>;
  emailOutbox: Record<string, EmailOutboxRecord>;
  campaigns: Record<string, CampaignRecord>;
  products: Record<string, ProductRecord>;
  productVersions: Record<string, ProductVersionRecord>;
  licenseVersions: Record<string, LicenseVersionRecord>;
  rights: Record<string, RightsRecord>;
  resources: Record<string, DigitalResource>;
  licenseInventory: Record<string, LicenseInventoryRecord>;
  resourceGrants: Record<string, ResourceGrant>;
  deliveryProbes: Record<string, DeliveryProbe>;
  resourceCommands?:Record<string,ResourceCommand>;
  productCommands?:Record<string,import('../domain/product').ProductCommandRecord>;
  operatorBadgeCommands?:Record<string,import('../domain/sellerBadge').BadgeCommand>;
  operatorAccountCommands?:Record<string,import('../domain/accountAccess').AccountAccessCommand>;
  orders: Record<string, OrderRecord>;
  supportMessages: Record<string, SupportMessageRecord[]>; // orderId -> messages
  webhooks: Record<string, WebhookSubscription>;
  webhookQueue: Record<string, WebhookJobRecord>;
  webhookDLQ: Record<string, WebhookDLQRecord>;
  auditLogs: AuditLogRecord[];
  auditDedupe: Record<string, string>;
  eventJournal: Record<string, EventJournalRecord>;
  syncState: SyncState;
  migrationState: MigrationState;
}

export class TransactionalStore {
  public readonly isIsolated:boolean;
  public readonly storageDirectory:string;
  private filePath: string;
  private legacyFilePath: string;
  private sqlite: DatabaseSync;
  private data: DatabaseSchema;
  private batchDepth = 0;
  private rows: RowPersistence;

  constructor(storageDir?: string) {
    const activeDir=path.resolve(__dirname,"../../data");
    const dir = path.resolve(storageDir || activeDir);
    this.storageDirectory=dir;
    this.isIsolated=dir.toLowerCase()!==activeDir.toLowerCase();
    if (!this.isIsolated && (process.env.NODE_ENV === 'test' || process.argv.some(arg => /[\\/]test[\\/].+\.test\.ts$/.test(arg)))) {
      throw new Error('TEST_STORAGE_DIRECTORY_REQUIRED');
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "groupdeal.sqlite");
    this.legacyFilePath = path.join(dir, "groupdeal_db.json");
    if (!this.isIsolated && fs.existsSync(this.filePath)) {
      const probe=new DatabaseSync(this.filePath,{readOnly:true});
      try {
        const hasRows=probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='storage_revision'").get();
        const marker=hasRows && probe.prepare("SELECT revision FROM storage_revision WHERE id=1").get();
        if (!marker) throw new Error("MIGRATION_REQUIRED: active legacy storage requires a verified shadow candidate and a stopped legacy writer before cutover");
      } finally { probe.close(); }
    }
    this.sqlite = new DatabaseSync(this.filePath);
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    this.applySqlMigrations();
    this.rows = new RowPersistence(this.sqlite);
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
      authSessions: {},
      authSessionCommands:{},
      walletBindingIntents:{},
      sellerProfileIntents:{},
      sellerFollows:{},
      sellerFollowCommands:{},
      userByEmail: {},
      userByWallet: {},
      userByCircleId: {},
      emailOtps: {},
      walletChallenges: {},
      consumedTxHashes: {},
      circleOperations: {},
      operations: {},
      campaignDraftKeys: {},
      circleLoginAttempts: {},
      campaignIdentities: {},
      rateLimits: {},
      notifications: {},
      notificationPreferences: {},
      emailOutbox: {},
      campaigns: {},
      products: {},
      productVersions: {},
      licenseVersions: {},
      rights: {},
      resources: {},
      licenseInventory: {},
      resourceGrants: {},
      deliveryProbes: {},
      orders: {},
      supportMessages: {},
      supportTickets:{},supportTicketMessages:{},supportAttachments:{},supportCommands:{},
      webhooks: {},
      webhookQueue: {},
      webhookDLQ: {},
      auditLogs: [],
      auditDedupe: {},
      eventJournal: {},
      syncState: { lastIndexedBlock: 0, lastSyncTimestamp: 0 },
      migrationState: { currentVersion: 1, appliedMigrations: ["v1_initial_schema"] },
    };
  }

  private normalize(parsed: Partial<DatabaseSchema>): DatabaseSchema {
    const normalized = { ...this.emptySchema(), ...parsed } as DatabaseSchema;
    normalized.userByCircleId ||= {};
    normalized.authSessions ||= {};
    normalized.authSessionCommands ||= {};
    normalized.walletBindingIntents ||= {};
    normalized.sellerProfileIntents ||= {};
    normalized.sellerFollows ||= {};
    normalized.sellerFollowCommands ||= {};
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
      const records = this.rows.read();
      if (records) return this.normalize(records);
      const row = this.sqlite.prepare("SELECT state_json FROM app_state WHERE id = 1").get() as
        | { state_json: string }
        | undefined;
      if (row) {
        this.data = this.normalize(JSON.parse(row.state_json));
        this.save(); // Preserve app_state as the original migration snapshot.
        return this.data;
      }

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
      if (error instanceof LegacyWriterConflict) { this.sqlite.close(); throw error; }
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
    if (this.batchDepth > 0) return;
    try {
      this.rows.commit(this.data);
    } catch (error) {
      if (error instanceof StorageConflict) this.data = this.normalize(this.rows.read()!);
      throw error;
    }
  }

  /** Synchronous domain mutation only: journal/projection/outbox commit or roll back together. */
  public transaction<T>(mutation: () => T): T {
    if (this.batchDepth > 0) return mutation();
    const before = JSON.parse(JSON.stringify(this.data, (_key, value) => typeof value === "bigint" ? value.toString() : value));
    this.batchDepth++;
    try {
      const result = mutation();
      if (result && typeof (result as any).then === "function") throw new Error("Store transactions must not await network work");
      this.batchDepth--;
      this.save();
      return result;
    } catch (error) {
      this.batchDepth = 0;
      if (!(error instanceof StorageConflict)) this.data = before;
      throw error;
    }
  }

  /** Seed a new isolated recovery candidate once. This never authorizes signing or promotion. */
  public initializeRecoverySnapshot(next: DatabaseSchema): void {
    if(!this.isIsolated||this.batchDepth>0||!isDeepStrictEqual(this.data,this.emptySchema()))throw new Error('RECOVERY_SNAPSHOT_TARGET_NOT_EMPTY');
    const normalized=this.normalize(next);
    this.rows.initializeRecoverySnapshot(normalized,this.emptySchema());
    this.data=normalized;
  }

  public replace(next: DatabaseSchema): void {
    const previous = this.data;
    this.data = this.normalize(next);
    try {
      this.save();
    } catch (error) {
      if (!(error instanceof StorageConflict)) this.data = previous;
      throw error;
    }
  }

  /** Persist pending local mutations, then capture committed rows from one SQLite read snapshot. */
  public snapshot():DatabaseSchema {
    if(this.batchDepth>0)throw new Error("A backup cannot capture an unfinished domain transaction");
    this.save();
    this.data=this.normalize(this.rows.read()!);
    return structuredClone(this.data);
  }

  public close(): void {
    this.sqlite.close();
  }

  public get db(): DatabaseSchema {
    return this.data;
  }

  /** One committed auth snapshot; does not replace pending domain state or its CAS revision. */
  public mutateSignerReservation<T>(selection:Parameters<RowPersistence['mutateSignerReservation']>[0],verify:(state:Parameters<Parameters<RowPersistence['mutateSignerReservation']>[1]>[0])=>{result:T;plan?:import('../domain/signerReservation').PreparedSignerMutation}):T{if(this.batchDepth>0)throw Error('CONFLICT: signer ledger cannot join an unfinished transaction');const out=this.rows.mutateSignerReservation(selection,verify);if(out.records.length){this.data.signerReservations??={};for(const record of out.records)this.data.signerReservations[record.id]=structuredClone(record);}return out.result;}
  public mutateBridgeTransfer<T>(selection:Parameters<RowPersistence['mutateBridgeTransfer']>[0],verify:(state:Parameters<Parameters<RowPersistence['mutateBridgeTransfer']>[1]>[0])=>{result:T;record?:import('../domain/bridgeTransfer').BridgeTransferRecord;history?:import('../domain/bridgeReceipt').ServerBridgeInspection[];request?:import('../domain/bridgeRequest').PreparedServerBridgeRequest;signerPlan?:import('../domain/signerReservation').PreparedSignerMutation}):T{
    if(this.batchDepth>0)throw Error('CONFLICT: bridge ledger cannot join an unfinished transaction');const committed=this.rows.mutateBridgeTransfer(selection,verify);if(committed.record){this.data.bridgeTransfers??={};this.data.bridgeTransfers[committed.record.id]=structuredClone(committed.record);}if(committed.signerReservations?.length){this.data.signerReservations??={};for(const record of committed.signerReservations)this.data.signerReservations[record.id]=structuredClone(record);}return committed.result;
  }
  public readAuthState(userId:string,key?:string,commandKey?:string):{user?:UserRecord;sessions:Record<string,AuthSessionRecord>;command?:AuthSessionCommandRecord;authRecovery?:unknown} {
    return this.rows.readAuthState(userId,key,commandKey);
  }
  public readSessionPage(actorId:string,sessionKey:string,limit:number,before?:{createdAt:number;id:string}){return this.rows.readSessionPage(actorId,sessionKey,limit,before);}
  public readCircleAuthState(selection:import('./rowPersistence').CircleAuthSelection){return this.rows.readCircleAuthState(selection);}
  public readCircleStatusState(actorId:string,sessionKey:string,challengeId:string){return this.rows.readCircleStatusState(actorId,sessionKey,challengeId);}
  public readCircleOperationStatusState(actorId:string,sessionKey:string,operationId:string){return this.rows.readCircleOperationStatusState(actorId,sessionKey,operationId);}
  public readCircleTransactionState(selection:Parameters<import('./rowPersistence').RowPersistence['readCircleTransactionState']>[0]){return this.rows.readCircleTransactionState(selection);}
  public mutateCircleTransactionChallenge<T>(selection:import('./rowPersistence').CircleTransactionSelection,dataPlan:(state:import('./rowPersistence').CircleTransactionState)=>import('./rowPersistence').CircleChallengePlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: Circle challenge cannot join an unfinished transaction');
    const committed=this.rows.mutateCircleTransactionChallenge(selection,this.data,dataPlan);
    if(committed.record)this.data.circleOperations[selection.circleOperationId!]=committed.record;
    if(committed.patch)Object.assign(this.data.circleOperations[selection.circleOperationId!],committed.patch);
    this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public mutateCircleAuthentication<T>(selection:import('./rowPersistence').CircleAuthSelection,verify:(state:import('./rowPersistence').CircleAuthState)=>import('./rowPersistence').CircleAuthPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: Circle authentication cannot join an unfinished transaction');const committed=this.rows.mutateCircleAuthentication(selection,this.data,verify);for(const r of committed.records){const collection=(this.data as any)[r.collection];if(r.collection==='rateLimits'&&collection[r.key]){Object.assign(collection[r.key],r.value);delete collection[r.key].blockedUntil;}else collection[r.key]=r.value;}if(committed.userPatch)Object.assign(this.data.users[committed.actorId!],committed.userPatch);if(committed.circleWallet)Object.assign(this.data.users[committed.actorId!].circleWallet??={} as NonNullable<UserRecord['circleWallet']>,committed.circleWallet);if(committed.consumeAttemptAt!==undefined)this.data.circleLoginAttempts[selection.attemptId!].consumedAt=committed.consumeAttemptAt;this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public mutateSessionManagement<T>(selection:import('./rowPersistence').SessionManagementSelection,verify:(state:import('./rowPersistence').SessionManagementState)=>import('./rowPersistence').SessionManagementPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: session management cannot join an unfinished transaction');const committed=this.rows.mutateSessionManagement(selection,this.data,verify);
    for(const r of committed.patches)Object.assign(this.data.authSessions[r.key],r.patch);for(const r of committed.records){const collection=(this.data as any)[r.collection];if(r.collection==='rateLimits'&&collection[r.key])Object.assign(collection[r.key],r.value);else collection[r.key]=r.value;}if(committed.legacyEpoch!==undefined)this.data.users[selection.actorId].legacySessionEpoch=committed.legacyEpoch;this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public materializeLegacySession(key:string,record:AuthSessionRecord):void {
    if(this.batchDepth>0||Object.prototype.hasOwnProperty.call(this.data.authSessions,key))throw Error('Legacy session creation cannot join an unfinished mutation');
    const committed=structuredClone(record);
    this.rows.materializeLegacySession(key,committed);
    this.data.authSessions[key]=committed;
  }
  public readOperatorLegacyState(userId:string,key:string){return this.rows.readOperatorLegacyState(userId,key);}
  public readSellerWebhookState(userId:string,key?:string,reviewId?:string|null){return this.rows.readSellerWebhookState(userId,key,reviewId);}
  public readBuyerResourceState(userId:string,key:string,orderId?:string,grantId?:string,includeResourceBytes=false){return this.rows.readBuyerResourceState(userId,key,orderId,grantId,includeResourceBytes);}
  public mutateBuyerResourceRedemption(userId:string,key:string|undefined,grantId:string,redeem:Parameters<RowPersistence['mutateBuyerResourceRedemption']>[4]):void{
    if(this.batchDepth>0)throw Error('CONFLICT: redemption cannot join an unfinished transaction');const committed=this.rows.mutateBuyerResourceRedemption(userId,key,grantId,this.data,redeem);
    if(committed.redeemedAt!==undefined)this.data.resourceGrants[grantId].redeemedAt=committed.redeemedAt;if(committed.audit){this.data.auditLogs.unshift(committed.audit);this.data.auditDedupe[committed.dedupeKey!]=committed.audit.id;}
  }
  public readBuyerOrderState(userId:string,key:string){return this.rows.readBuyerOrderState(userId,key);}
  public readCampaignAmendmentState(selection:import('./rowPersistence').CampaignAmendmentSelection){return this.rows.readCampaignAmendmentState(selection);}
  public mutateCampaignAmendment<T>(selection:import('./rowPersistence').CampaignAmendmentSelection,command:(state:import('./rowPersistence').CampaignAmendmentState)=>import('./rowPersistence').CampaignAmendmentPlan<T>):T {
    if(this.batchDepth>0)throw Error('CONFLICT: amendment cannot join an unfinished transaction');const committed=this.rows.mutateCampaignAmendment(selection,this.data,command);if(committed.amendment)this.data.campaigns[selection.campaignId].amendments.push(committed.amendment);this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public readCampaignReplacementState(selection:import('./rowPersistence').CampaignReplacementSelection){return this.rows.readCampaignReplacementState(selection);}
  public mutateCampaignReplacement<T>(selection:import('./rowPersistence').CampaignReplacementSelection,command:(state:import('./rowPersistence').CampaignReplacementState)=>import('./rowPersistence').CampaignReplacementPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: replacement cannot join an unfinished transaction');const committed=this.rows.mutateCampaignReplacement(selection,this.data,command);for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public readSellerInventoryState(userId:string,key:string,includeOrders=true){return this.rows.readSellerInventoryState(userId,key,includeOrders);}
  public readProductInventoryState(userId:string,key:string,review=false){return this.rows.readProductInventoryState(userId,key,review);}
  public readPublicProjectionState(selection:import('./rowPersistence').PublicProjectionSelection,chainId:number,hubAddress:string){return this.rows.readPublicProjectionState(selection,chainId,hubAddress);}
  public readSellerResourceState(userId:string,key:string,versionId?:string){return this.rows.readSellerResourceState(userId,key,versionId);}
  public readResourceCommandState(userId:string,key:string,commandKey:string){return this.rows.readResourceCommandState(userId,key,commandKey);}
  public readProductCommandState(userId:string,key:string,commandKey:string){return this.rows.readProductCommandState(userId,key,commandKey);}
  public mutateResource<T>(selection:import('./rowPersistence').ResourceMutationSelection,command:(state:import('./rowPersistence').ResourceMutationState)=>import('./rowPersistence').ResourceMutationPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: resource command cannot join an unfinished transaction');const committed=this.rows.mutateResource(selection,this.data,command);
    for(const row of committed.records){const collection=(this.data as any)[row.collection]??={},existing=collection[row.key];if(existing&&typeof existing==='object')Object.assign(existing,row.value);else collection[row.key]=row.value;}this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public readProductPolicyState(sellerId:string,versionId:string){return this.rows.readProductPolicyState(sellerId,versionId,this.data);}
  public readOperatorAdministration<T>(actorId:string,sessionKey:string,verify:(state:import('./rowPersistence').OperatorAdministrationState)=>T):T{return this.rows.readOperatorAdministration(actorId,sessionKey,verify);}
  public readSellerBadgeState(actorId:string,sessionKey:string,options:Parameters<RowPersistence['readSellerBadgeState']>[2]={}){return this.rows.readSellerBadgeState(actorId,sessionKey,options);}
  public mutateSellerBadge<T>(selection:import('./rowPersistence').SellerBadgeSelection,verify:(state:import('./rowPersistence').SellerBadgeState)=>import('./rowPersistence').SellerBadgePlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: seller badge cannot join an unfinished transaction');const committed=this.rows.mutateSellerBadge(selection,this.data,verify);
    if(committed.verifiedSellerBadge!==undefined)this.data.users[selection.targetSellerId!].sellerProfile!.verifiedSellerBadge=committed.verifiedSellerBadge;
    for(const r of committed.records){const collection=(this.data as any)[r.collection]??={};collection[r.key]=r.value;}for(const r of committed.deleted)delete (this.data as any)[r.collection][r.key];this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public mutateOperatorStepUp<T>(selection:import('./rowPersistence').OperatorStepUpSelection,verify:(state:import('./rowPersistence').OperatorStepUpState)=>import('./rowPersistence').OperatorStepUpPlan<T>):T {
    if(this.batchDepth>0)throw Error('CONFLICT: operator mutation cannot join an unfinished transaction');
    const committed=this.rows.mutateOperatorStepUp(selection,this.data,verify);
    if(selection.targetSellerId!==undefined)this.data.users[selection.targetSellerId].sellerProfile!.verifiedSellerBadge=committed.verifiedSellerBadge!;
    delete this.data.walletChallenges[selection.challengeKey];this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public mutateWalletAuth<T>(selection:import('./rowPersistence').WalletAuthSelection,verify:(state:import('./rowPersistence').WalletAuthState)=>import('./rowPersistence').WalletAuthPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: wallet authentication cannot join an unfinished transaction');const committed=this.rows.mutateWalletAuth(selection,this.data,verify);
    for(const r of committed.records){const collection=(this.data as any)[r.collection]??={};if(r.collection==='users'&&collection[r.key])Object.assign(collection[r.key],r.value);else collection[r.key]=r.value;}for(const r of committed.deleted)delete (this.data as any)[r.collection][r.key];this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public mutateProduct<T>(selection:import('./rowPersistence').ProductMutationSelection,command:(state:import('./rowPersistence').ProductMutationState)=>import('./rowPersistence').ProductMutationPlan<T>):T {
    if(this.batchDepth>0)throw Error('CONFLICT: product command cannot join an unfinished transaction');
    const committed=this.rows.mutateProduct(selection,this.data,command);
    for(const row of committed.records){const collection=(this.data as any)[row.collection]??={},existing=collection[row.key];if(existing&&typeof existing==='object')Object.assign(existing,row.value);else collection[row.key]=row.value;}
    for(const row of committed.deleted)delete (this.data as any)[row.collection][row.key];this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }

  public readWalletState(userId:string,intentKey?:string) {
    return this.rows.readWalletState(userId,intentKey);
  }
  public readWalletBindingState(actorId:string,sessionKey:string,intentKey:string,options:Parameters<RowPersistence['readWalletBindingState']>[3]={}){return this.rows.readWalletBindingState(actorId,sessionKey,intentKey,options);}
  public mutateWalletBinding<T>(selection:import('./rowPersistence').WalletBindingSelection,verify:(state:import('./rowPersistence').WalletBindingState)=>import('./rowPersistence').WalletBindingPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: wallet binding cannot join an unfinished transaction');const committed=this.rows.mutateWalletBinding(selection,this.data,verify);for(const r of committed.records){const collection=(this.data as any)[r.collection]??={},existing=collection[r.key];if(r.collection==='walletBindingIntents'&&existing){const value={...r.value};delete value.circleSigning;for(const field of ['state','attempts','cancelledAt','committedAt','bindingWasNew'])delete value[field];Object.assign(existing,value);for(const field of ['state','attempts','cancelledAt','committedAt','bindingWasNew'])if(r.value[field]!==undefined)existing[field]=r.value[field];if(r.value.circleSigning){existing.circleSigning??={};for(const role of ['SOURCE','TARGET'])if(r.value.circleSigning[role])Object.assign(existing.circleSigning[role]??={},r.value.circleSigning[role]);}}else collection[r.key]=r.value;}if(committed.activeWallet!==undefined)this.data.users[selection.actorId].activeWallet=committed.activeWallet;this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }

  public readSellerProfileState(actorId:string,sessionKey:string,intentKey:string){return this.rows.readSellerProfileState(actorId,sessionKey,intentKey);}
  public mutateSellerProfile<T>(selection:import('./rowPersistence').SellerProfileSelection,verify:(state:import('./rowPersistence').SellerProfileState)=>import('./rowPersistence').SellerProfilePlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: seller profile cannot join an unfinished transaction');const committed=this.rows.mutateSellerProfile(selection,this.data,verify);
    for(const r of committed.records){const collection=(this.data as any)[r.collection]??={},existing=collection[r.key];if(r.collection==='sellerProfileIntents'&&existing){const value={...r.value};delete value.circleSigning;for(const field of ['state','attempts','cancelledAt','committedAt'])delete value[field];Object.assign(existing,value);for(const field of ['state','attempts','cancelledAt','committedAt'])if(r.value[field]!==undefined)existing[field]=r.value[field];if(r.value.circleSigning)Object.assign(existing.circleSigning??={},r.value.circleSigning);}else collection[r.key]=r.value;}
    if(committed.profile){const user=this.data.users[selection.actorId];user.sellerProfile??={} as NonNullable<UserRecord['sellerProfile']>;for(const field of ['displayName','bio','payoutWallet','verifiedSellerBadge','verifiedRightsBadge','payoutProofSignature','payoutProofIntentId'])(user.sellerProfile as any)[field]=(committed.profile as any)[field];user.roles=committed.roles!;}this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public mutateNotificationProducer<T>(selection:import('./rowPersistence').NotificationProducerSelection,prepare:(graph:DatabaseSchema)=>T):T {if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateNotificationProducer(selection,this.data,prepare);for(const row of committed.records)(this.data as any)[row.collection][row.key]=row.value;return committed.result;}
  public readMailWorkerDue<T>(now:number,verify:(state:import('./rowPersistence').OperatorMailFrame&{due:(exclude:string[])=>string[]})=>T):T{return this.rows.readMailWorkerDue(now,verify);}
  public mutateMailWorker<T>(selection:import('./rowPersistence').MailWorkerSelection,verify:(state:import('./rowPersistence').MailWorkerState)=>import('./rowPersistence').MailWorkerPlan<T>):T {if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateMailWorker(selection,this.data,verify);if(committed.job)this.data.emailOutbox[selection.jobId]=committed.job;this.data.auditLogs.unshift(...committed.audit);Object.assign(this.data.auditDedupe,committed.dedupe);return committed.result;}
  public readOperatorMail<T>(actorId:string,sessionKey:string,jobId:string|undefined,verify:(state:import('./rowPersistence').OperatorMailState)=>T):T{return this.rows.readOperatorMail(actorId,sessionKey,jobId,verify);}
  public mutateOperatorMail<T>(selection:import('./rowPersistence').OperatorMailSelection,verify:(state:import('./rowPersistence').OperatorMailState)=>import('./rowPersistence').OperatorMailPlan<T>):T {if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateOperatorMail(selection,this.data,verify);if(committed.job)this.data.emailOutbox[selection.jobId]=committed.job;this.data.auditLogs.unshift(...committed.audit);Object.assign(this.data.auditDedupe,committed.dedupe);return committed.result;}
  public readOperatorAccountAccess<T>(selection:import('./rowPersistence').OperatorAccountAccessSelection,verify:(state:import('./rowPersistence').OperatorAccountAccessState)=>T):T{return this.rows.readOperatorAccountAccess(selection,verify);}
  public mutateOperatorAccountAccess<T>(selection:import('./rowPersistence').OperatorAccountAccessSelection,verify:(state:import('./rowPersistence').OperatorAccountAccessState)=>import('./rowPersistence').OperatorAccountAccessPlan<T>):T{if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateOperatorAccountAccess(selection,this.data,verify);if(committed.target)this.data.users[selection.targetId]=committed.target;if(committed.command)(this.data.operatorAccountCommands??={})[committed.command.id]=committed.command;this.data.auditLogs.unshift(...committed.audit);return committed.result;}
  public mutateWalletFlow<T>(selection:import('./rowPersistence').WalletFlowSelection,verify:(state:import('./rowPersistence').WalletFlowState)=>import('./rowPersistence').WalletFlowPlan<T>):T {if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateWalletFlow({...selection,cached:selection.id?this.data.walletFlows?.[selection.id]:undefined},verify);if(committed.record)(this.data.walletFlows??={})[committed.record.id]=structuredClone(committed.record);for(const record of committed.reservations)(this.data.signerReservations??={})[record.id]=structuredClone(record);if(committed.budget)this.data.rateLimits[committed.rateKey]=structuredClone(committed.budget);this.data.auditLogs.unshift(...committed.audit);return committed.result;}
  public readContact<T>(actorId:string,sessionKey:string,verify:(state:import('./rowPersistence').ContactState)=>T):T{return this.rows.readContact(actorId,sessionKey,verify);}
  public mutateContact<T>(selection:import('./rowPersistence').ContactSelection,verify:(state:import('./rowPersistence').ContactState)=>import('./rowPersistence').ContactPlan<T>):T {if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateContact(selection,this.data,verify);if(committed.contact)this.data.users[selection.actorId].contact=committed.contact;for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;this.data.auditLogs.unshift(...committed.audit);return committed.result;}
  public readNotificationInbox<T>(actorId:string,sessionKey:string,verify:(state:import('./rowPersistence').NotificationInboxState)=>T):T{return this.rows.readNotificationInbox(actorId,sessionKey,verify);}
  public mutateNotificationInbox<T>(selection:import('./rowPersistence').NotificationInboxSelection,verify:(state:import('./rowPersistence').NotificationInboxState)=>import('./rowPersistence').NotificationInboxPlan<T>):T {
    if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateNotificationInbox(selection,this.data,verify);for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public readSellerFollowState(userId:string,sellerId?:string,followKey?:string,commandKey?:string,sessionKey?:string){return this.rows.readSellerFollowState(userId,sellerId,followKey,commandKey,sessionKey);}
  public mutateSellerFollow<T>(selection:import('./rowPersistence').SellerFollowSelection,verify:(state:import('./rowPersistence').SellerFollowState)=>import('./rowPersistence').SellerFollowPlan<T>):T {
    if(this.batchDepth>0)throw new StorageConflict();const committed=this.rows.mutateSellerFollow(selection,this.data,verify);for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }


  public readOperationReplacementState(selection:import('../domain/operationReplacement').ReplacementSelection){if(this.batchDepth>0)throw Error('CONFLICT: replacement tracking cannot join an unfinished transaction');return this.rows.readOperationReplacementState(selection,this.data);}
  public mutateOperationReplacement(selection:import('../domain/operationReplacement').ReplacementSelection,verify:(state:import('./rowPersistence').OperationReplacementState)=>import('../domain/operationReplacement').ReplacementPlan|undefined,signerPlan?:import('../domain/signerReservation').PreparedSignerMutation){if(this.batchDepth>0)throw Error('CONFLICT: replacement tracking cannot join an unfinished transaction');const result=this.rows.mutateOperationReplacement(selection,this.data,verify,signerPlan),op=this.data.operations[selection.operationId];for(const record of result.signerReservations)(this.data.signerReservations??={})[record.id]=record;if(result.patch){const {witness,replacement,audit,clearError,...leaves}=result.patch;if(witness)(op.broadcastWitnesses??=[]).push(witness);if(replacement)(op.replacements??=[]).push(replacement);for(const [key,value] of Object.entries(leaves))if(value!==undefined)(op as any)[key]=value;if(clearError)delete op.errorCode;}this.data.auditLogs.unshift(...result.audit);Object.assign(this.data.auditDedupe,result.dedupe);return op;}

  public readOperationPreparationState(selection:import('../domain/operationPreparation').PreparationSelection){if(this.batchDepth>0)throw Error('CONFLICT: operation preparation cannot join an unfinished transaction');return this.rows.readOperationPreparationState(selection,this.data);}
  public mutateOperationPreparation(selection:import('../domain/operationPreparation').PreparationSelection,verify:(state:import('./rowPersistence').OperationPreparationState)=>import('../domain/operationPreparation').PreparationPlan){if(this.batchDepth>0)throw Error('CONFLICT: operation preparation cannot join an unfinished transaction');const result=this.rows.mutateOperationPreparation(selection,this.data,verify);if(result.created){this.data.operations[result.operation.id]=result.operation;if(result.campaignPatch)Object.assign(this.data.campaigns[selection.resourceId],result.campaignPatch);for(const grant of result.grants)this.data.resourceGrants[grant.id]=grant;for(const patch of result.keyPatches){const {id,...leaves}=patch;Object.assign(this.data.licenseInventory[id],leaves)}this.data.auditLogs.unshift(...result.audit);Object.assign(this.data.auditDedupe,result.dedupe);}return result.operation;}

  public readCampaignPublicationOwner(campaignId:string,payout:string){if(this.batchDepth>0)throw Error('CONFLICT: publication ownership cannot join an unfinished transaction');return this.rows.readCampaignPublicationOwner(campaignId,payout);}
  public readFinancialProjectionState(selection:import('../domain/financialProjection').FinancialProjectionSelection={}){if(this.batchDepth>0)throw Error('FINANCIAL_PROJECTION_CONFLICT');return this.rows.readFinancialProjectionState(selection);}
  public mutateFinancialProjection(selection:import('../domain/financialProjection').FinancialProjectionSelection,project:(graph:DatabaseSchema)=>void,cursor?:import('../domain/financialProjection').FinancialCursor){
    if(this.batchDepth>0)throw Error('FINANCIAL_PROJECTION_CONFLICT');const result=this.rows.mutateFinancialProjection(selection,this.data,project,cursor);
    for(const item of result.inserts)(this.data[item.collection] as any)[item.key]=item.value;
    for(const patch of result.patches){const target=patch.collection==='syncState'?this.data.syncState:(this.data[patch.collection] as any)[patch.key];Object.assign(target,patch.leaves);if(patch.history?.length){target.transactionHistory??=[];target.transactionHistory.push(...patch.history);}}
  }

  public readOperationCompletionState(selection:import('../domain/operationCompletion').CompletionSelection){if(this.batchDepth>0)throw Error('CONFLICT: completion cannot join an unfinished transaction');return this.rows.readOperationCompletionState(selection,this.data);}
  public mutateOperationCompletion(selection:import('../domain/operationCompletion').CompletionSelection,verify:(state:import('./rowPersistence').OperationCompletionState)=>import('../domain/operationCompletion').CompletionPlan){
    if(this.batchDepth>0)throw Error('CONFLICT: completion cannot join an unfinished transaction');const result=this.rows.mutateOperationCompletion(selection,this.data,verify);
    for(const patch of result.patches)Object.assign((this.data[patch.collection] as any)[patch.key],patch.leaves);
    if(result.removeCampaignId)delete this.data.campaigns[result.removeCampaignId];for(const notice of result.notices)this.data.notifications[notice.id]=notice;
    this.data.auditLogs.unshift(...result.audit);Object.assign(this.data.auditDedupe,result.dedupe);
  }
  public readOperationReadinessState(selection:import('../domain/operationReadiness').OperationReadinessSelection){if(this.batchDepth>0)throw Error('CONFLICT: signature readiness cannot join an unfinished transaction');return this.rows.readOperationReadinessState(selection,this.data);}
  public mutateOperationReadiness(selection:import('../domain/operationReadiness').OperationReadinessSelection,verify:(state:import('./rowPersistence').OperationReadinessState)=>import('../domain/operationReadiness').OperationReadinessPatch,signerPlan?:import('../domain/signerReservation').PreparedSignerMutation){if(this.batchDepth>0)throw Error('CONFLICT: signature readiness cannot join an unfinished transaction');const committed=this.rows.mutateOperationReadiness(selection,this.data,verify,signerPlan),patch=committed.patch;this.data.signerReservations??={};for(const record of committed.signerReservations)this.data.signerReservations[record.id]=structuredClone(record);const operation=this.data.operations[selection.operationId];operation.phase='AWAITING_SIGNATURE';operation.updatedAt=patch.updatedAt;for(const field of ['financialQuote','purchaseQuote','orderQuote','deliveryQuote'] as const)if(patch[field])Object.assign(operation[field]??((operation as any)[field]={}),patch[field]);return operation;}

  public readOperationTrackingState(selection:import('../domain/operationTracking').OperationTrackingSelection){if(this.batchDepth>0)throw Error('CONFLICT: operation tracking cannot join an unfinished transaction');return this.rows.readOperationTrackingState(selection,this.data);}
  public mutateOperationSubmission(selection:import('../domain/operationTracking').OperationTrackingSelection,verify:(state:import('./rowPersistence').OperationTrackingState)=>import('../domain/operationTracking').OperationSubmitPatch|undefined){if(this.batchDepth>0)throw Error('CONFLICT: operation submission cannot join an unfinished transaction');const patch=this.rows.mutateOperationSubmission(selection,this.data,verify);if(patch)Object.assign(this.data.operations[selection.operationId!],patch);return this.data.operations[selection.operationId!];}

  public readOperationVerificationState(selection:import('../domain/operationVerification').OperationVerificationSelection){if(this.batchDepth>0)throw Error('CONFLICT: operation verification cannot join an unfinished transaction');return this.rows.readOperationVerificationState(selection,this.data);}
  public mutateOperationVerification(selection:import('../domain/operationVerification').OperationVerificationSelection,verify:(state:import('./rowPersistence').OperationVerificationState)=>import('../domain/operationVerification').OperationVerificationPlan){if(this.batchDepth>0)throw Error('CONFLICT: operation verification cannot join an unfinished transaction');const result=this.rows.mutateOperationVerification(selection,this.data,verify);const op=this.data.operations[selection.operationId];if(result.patch){const {clearError,...patch}=result.patch;Object.assign(op,patch);if(clearError)delete op.errorCode;}if(result.consumption&&op.txHash){if(this.data.consumedTxHashes[op.txHash])Object.assign(this.data.consumedTxHashes[op.txHash],result.consumption);else this.data.consumedTxHashes[op.txHash]=result.consumption;}this.data.auditLogs.unshift(...result.audit);Object.assign(this.data.auditDedupe,result.dedupe);}
  public readReceiptConsumption(hash:string){
    if(this.batchDepth>0)throw Error('CONFLICT: receipt verification cannot join an unfinished transaction');return this.rows.readReceiptConsumption(hash);
  }
  public consumeReceiptConsumption(hash:string,proof:import('../domain/receiptConsumption').ReceiptConsumptionBinding){
    if(this.batchDepth>0)throw Error('CONFLICT: receipt consumption cannot join an unfinished transaction');const result=this.rows.consumeReceiptConsumption(hash,proof,this.data);
    if(result.written){if(this.data.consumedTxHashes[hash])Object.assign(this.data.consumedTxHashes[hash],result.record);else this.data.consumedTxHashes[hash]=result.record;}return result.record;
  }

  public readDisputeMetadataState(selection:import('./rowPersistence').DisputeMetadataSelection){return this.rows.readDisputeMetadataState(selection);}
  public mutateDisputeMetadata<T>(selection:import('./rowPersistence').DisputeMetadataSelection,verify:(state:import('./rowPersistence').DisputeMetadataState)=>import('./rowPersistence').DisputeMetadataPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: dispute metadata cannot join an unfinished transaction');
    const committed=this.rows.mutateDisputeMetadata(selection,this.data,verify);
    if(Object.keys(committed.patch).length)Object.assign(this.data.orders[selection.orderId],committed.patch);
    if(committed.operationPatch&&selection.operationId)Object.assign(this.data.operations[selection.operationId],{phase:'PROJECTED',updatedAt:committed.operationPatch.updatedAt});
    for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;
    this.data.auditLogs.unshift(...committed.audit);Object.assign(this.data.auditDedupe,committed.dedupe);return committed.result;
  }

  public mutateOrderReview<T>(selection:import('./rowPersistence').OrderReviewSelection,verify:(state:import('./rowPersistence').OrderReviewState)=>import('./rowPersistence').OrderReviewPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: review cannot join an unfinished transaction');const committed=this.rows.mutateOrderReview(selection,this.data,verify);
    if(committed.review){this.data.orders[selection.orderId].review=committed.review;if(committed.audit.length)this.data.auditDedupe['review:'+selection.orderId]=committed.audit[0].id;}
    if(committed.sellerResponse!==undefined)this.data.orders[selection.orderId].review!.sellerResponse=committed.sellerResponse;
    this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public readOrderThreadState(selection:import('./rowPersistence').OrderThreadSelection){return this.rows.readOrderThreadState(selection);}
  public readOrderThreadNoticeState(userId:string,orderId:string,messageId:string){return this.rows.readOrderThreadNoticeState(userId,orderId,messageId);}
  public mutateOrderThread<T>(selection:import('./rowPersistence').OrderThreadSelection,verify:(state:import('./rowPersistence').OrderThreadState)=>import('./rowPersistence').OrderThreadPlan<T>):T{
    if(this.batchDepth>0)throw Error('CONFLICT: order thread cannot join an unfinished transaction');
    const committed=this.rows.mutateOrderThread(selection,this.data,verify);
    for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;
    return committed.result;
  }
  public purgeSupportAttachments(limit:number,now:number){
    if(this.batchDepth>0)throw new StorageConflict();if(!this.isIsolated&&now>Date.now()+30000)throw Error('SUPPORT_RETENTION_INVALID_INPUT');const committed=this.rows.purgeSupportAttachments(limit,now,this.data);for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;this.data.auditLogs.unshift(...committed.audit);return{purged:committed.purged};
  }
  public mutateSupport<T>(selection:import('./rowPersistence').SupportMutationSelection,verify:(state:import('./rowPersistence').SupportState)=>import('./rowPersistence').SupportMutationPlan<T>):T {
    if(this.batchDepth>0)throw Error('CONFLICT: support cannot join an unfinished transaction');const committed=this.rows.mutateSupport(selection,this.data,verify);for(const r of committed.records)(this.data as any)[r.collection][r.key]=r.value;this.data.auditLogs.unshift(...committed.audit);return committed.result;
  }
  public readSupportState(userId:string,options:Parameters<RowPersistence['readSupportState']>[1]={}){
    return this.rows.readSupportState(userId,options);
  }
  public readOperationalState(now=Date.now(),userId?:string){
    if(this.batchDepth>0)throw Error('Operational read cannot observe an unfinished transaction');
    return this.rows.readOperationalState(now,userId);
  }

  public addAuditLog(actor: string, role: string, action: string, details: any, dedupeKey?: string): AuditLogRecord {
    if (dedupeKey && this.data.auditDedupe[dedupeKey]) {
      const existing = this.data.auditLogs.find(log => log.id === this.data.auditDedupe[dedupeKey]);
      if (!existing || existing.actor !== actor || existing.action !== action) throw new Error("Audit deduplication conflict");
      return existing;
    }
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
    if (dedupeKey) this.data.auditDedupe[dedupeKey] = entry.id;
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
let defaultStore: TransactionalStore | undefined;
/** Called only after recovery admission and before any singleton has opened storage. */
export function admitDefaultRecoveryStore(candidate:TransactionalStore):void{
  if(defaultStore||process.env.GROUPDEAL_RECOVERY_MODE!=="1"||!(candidate instanceof TransactionalStore)||!candidate.isIsolated)throw new Error("RECOVERY_STORAGE_ADMISSION_REJECTED");
  defaultStore=candidate;
}
// Importing the persistence class for a shadow migration must not open the active database.
export const store: TransactionalStore = new Proxy({} as TransactionalStore, {
  get(_target, key) {
    if(!defaultStore&&process.env.GROUPDEAL_RECOVERY_MODE!==undefined)throw new Error("RECOVERY_STORAGE_NOT_ADMITTED");
    if(!defaultStore&&process.env.NODE_ENV==='test'&&!isTestEntrypoint)throw new Error('TEST_STORAGE_ENTRYPOINT_REQUIRED');
    defaultStore ||= new TransactionalStore(isTestEntrypoint ? fs.mkdtempSync(path.join(os.tmpdir(), "groupdeal-test-")) : undefined);
    const value = Reflect.get(defaultStore, key, defaultStore);
    return typeof value === "function" ? value.bind(defaultStore) : value;
  },
});
