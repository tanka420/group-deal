import * as fs from "fs";
import * as path from "path";

export interface UserRecord {
  id: string;
  email: string;
  createdAt: number;
  roles: ("buyer" | "seller" | "operator")[];
  activeWallet: string | null; // 1-to-1 atomic binding
  circleWallet?: {
    address: string;
    encryptedPrivateKey?: string;
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
  email: string;
  createdAt: number;
  roles: ("buyer" | "seller" | "operator")[];
  activeWallet: string | null;
  circleWallet?: {
    address: string;
  };
  sellerProfile?: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    verifiedSellerBadge: boolean;
    verifiedRightsBadge: boolean;
  };
}

export function sanitizeUser(user: UserRecord): SanitizedUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    roles: user.roles,
    activeWallet: user.activeWallet,
    circleWallet: user.circleWallet ? { address: user.circleWallet.address } : undefined,
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
  id: string; // "1", "2", ...
  onchainCampaignId: number;
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

export interface AuditLogRecord {
  id: string;
  timestamp: number;
  actor: string;
  role: string;
  action: string;
  details: any;
}

export interface EventJournalRecord {
  id: string; // `${txHash}_${logIndex}`
  blockNumber: number;
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

export interface DatabaseSchema {
  users: Record<string, UserRecord>;
  userByEmail: Record<string, string>; // email -> userId
  userByWallet: Record<string, string>; // wallet -> userId (atomic unique index)
  emailOtps: Record<string, OtpRecord>;
  campaigns: Record<string, CampaignRecord>;
  orders: Record<string, OrderRecord>;
  supportMessages: Record<string, SupportMessageRecord[]>; // orderId -> messages
  webhooks: Record<string, WebhookSubscription>;
  auditLogs: AuditLogRecord[];
  eventJournal: Record<string, EventJournalRecord>;
  syncState: SyncState;
}

export class JsonStore {
  private filePath: string;
  private data: DatabaseSchema;

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(__dirname, "../../data");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "groupdeal_db.json");
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed.eventJournal) parsed.eventJournal = {};
        if (!parsed.syncState) parsed.syncState = { lastIndexedBlock: 0, lastSyncTimestamp: 0 };
        return parsed;
      } catch (e) {
        console.error("[DB CRITICAL] Failed to parse db file! Preserving corrupted copy to avoid silent data loss.", e);
        const backupPath = `${this.filePath}.corrupted.${Date.now()}`;
        try {
          fs.copyFileSync(this.filePath, backupPath);
          console.error(`[DB CRITICAL] Corrupted database preserved at: ${backupPath}`);
        } catch (backupErr) {
          console.error("[DB CRITICAL] Failed to create backup of corrupted file:", backupErr);
        }
        throw new Error(
          `[DB CRITICAL] Fatal corruption in database file ${this.filePath}. Preserved at ${backupPath}. System will not wipe data!`
        );
      }
    }
    return {
      users: {},
      userByEmail: {},
      userByWallet: {},
      emailOtps: {},
      campaigns: {},
      orders: {},
      supportMessages: {},
      webhooks: {},
      auditLogs: [],
      eventJournal: {},
      syncState: { lastIndexedBlock: 0, lastSyncTimestamp: 0 },
    };
  }

  public save(): void {
    const tempPath = `${this.filePath}.tmp`;
    const serialized = JSON.stringify(
      this.data,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    );
    fs.writeFileSync(tempPath, serialized, "utf8");
    fs.renameSync(tempPath, this.filePath);
  }

  public get db(): DatabaseSchema {
    return this.data;
  }

  public addAuditLog(actor: string, role: string, action: string, details: any): void {
    const entry: AuditLogRecord = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      actor,
      role,
      action,
      details,
    };
    this.data.auditLogs.unshift(entry);
    // keep latest 1000 logs
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 1000);
    }
    this.save();
  }
}

export const store = new JsonStore();
