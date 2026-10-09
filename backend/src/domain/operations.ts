export const emailStatuses=['QUEUED','PROCESSING','SENT','RETRY','DLQ','CANCELLED'] as const;
export const webhookStatuses=['QUEUED','PROCESSING','COMPLETED','FAILED','DLQ'] as const;
export type QueueObservation={counts:Record<string,number>;unknownCount:number;invalidScheduleCount:number;overdueCount:number;oldestDueAt:number|null;expiredLeases:number};
export type OperationalStorageSnapshot={revision:number;authorizedOperator:boolean;sync:{lastIndexedBlock:number;lastIndexedBlockHash?:string;lastSyncTimestamp:number};email:QueueObservation;webhook:QueueObservation};
export const alertCodes=['STORAGE_UNAVAILABLE','INDEXER_STOPPED','INDEXER_HEAD_UNOBSERVED','INDEXER_OBSERVATION_STALE','INDEXER_SYNC_FAILED','INDEXER_LAG','PROJECTION_AHEAD_OF_HEAD','RECONCILIATION_UNOBSERVED','RECONCILIATION_UNVERIFIED','RECONCILIATION_STALE','RECONCILIATION_DISCREPANCY','EMAIL_DLQ','WEBHOOK_DLQ','EMAIL_OVERDUE','WEBHOOK_OVERDUE','EMAIL_LEASE_EXPIRED','WEBHOOK_LEASE_EXPIRED','QUEUE_METADATA_INVALID'] as const;
export type AlertCode=typeof alertCodes[number];
