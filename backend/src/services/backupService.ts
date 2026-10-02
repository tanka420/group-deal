import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { store, DatabaseSchema } from "../db/store";
import { config } from "../config";

export interface BackupEnvelope {
  version: number;
  timestamp: number;
  checksum: string;
  ivHex: string;
  authTagHex: string;
  encryptedDataHex: string;
}

export class BackupService {
  private static getBackupDir(customDir?: string): string {
    const dir = customDir || path.resolve(__dirname, "../../data/backups");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private static deriveKey(): Buffer {
    return crypto.scryptSync(config.masterEncryptionKey, "groupdeal-backup-salt-2026", 32);
  }

  /**
   * Create encrypted AES-256-GCM backup of entire database store
   */
  public static createEncryptedBackup(customDir?: string): {
    backupPath: string;
    checksum: string;
    timestamp: number;
  } {
    const dir = this.getBackupDir(customDir);
    const timestamp = Date.now();
    const backupPath = path.join(dir, `backup_${timestamp}.enc`);

    const plainData = JSON.stringify(
      store.db,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );

    // Compute cryptographic integrity checksum
    const checksum = crypto.createHash("sha256").update(plainData).digest("hex");

    // AES-256-GCM authenticated encryption
    const key = this.deriveKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([cipher.update(plainData, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelope: BackupEnvelope = {
      version: 1,
      timestamp,
      checksum,
      ivHex: iv.toString("hex"),
      authTagHex: authTag.toString("hex"),
      encryptedDataHex: encrypted.toString("hex"),
    };

    fs.writeFileSync(backupPath, JSON.stringify(envelope, null, 2), "utf8");

    store.addAuditLog("system", "operator", "BACKUP_CREATED", {
      backupPath,
      timestamp,
      checksum,
    });

    return { backupPath, checksum, timestamp };
  }

  /**
   * Decrypt and restore backup into database store
   */
  public static restoreEncryptedBackup(backupPath: string): {
    restored: boolean;
    timestamp: number;
    checksum: string;
  } {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found at: ${backupPath}`);
    }

    const envelopeRaw = fs.readFileSync(backupPath, "utf8");
    const envelope: BackupEnvelope = JSON.parse(envelopeRaw);

    const key = this.deriveKey();
    const iv = Buffer.from(envelope.ivHex, "hex");
    const authTag = Buffer.from(envelope.authTagHex, "hex");
    const encrypted = Buffer.from(envelope.encryptedDataHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

    // Verify cryptographic integrity checksum
    const computedChecksum = crypto.createHash("sha256").update(decrypted).digest("hex");
    if (computedChecksum !== envelope.checksum) {
      throw new Error(
        `[BACKUP CORRUPTION] Integrity check failed! Expected ${envelope.checksum}, computed ${computedChecksum}`
      );
    }

    const parsed: DatabaseSchema = JSON.parse(decrypted);

    // Validate all database uniqueness constraints and restore atomically.
    store.replace(parsed);

    store.addAuditLog("system", "operator", "BACKUP_RESTORED", {
      backupPath,
      timestamp: envelope.timestamp,
      checksum: envelope.checksum,
    });

    return {
      restored: true,
      timestamp: envelope.timestamp,
      checksum: envelope.checksum,
    };
  }

  /**
   * Prune backups older than specified retention days
   */
  public static pruneBackups(maxRetentionDays = 30, customDir?: string): number {
    const dir = this.getBackupDir(customDir);
    const files = fs.readdirSync(dir);
    const cutoff = Date.now() - maxRetentionDays * 86400000;
    let pruned = 0;

    for (const f of files) {
      if (f.startsWith("backup_") && f.endsWith(".enc")) {
        const fullPath = path.join(dir, f);
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
          pruned++;
        }
      }
    }
    return pruned;
  }
}
