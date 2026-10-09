import {z} from 'zod';

export const supportId=z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
export const supportTicketId=z.string().regex(/^tkt_[a-f0-9-]{36}$/);
export const supportMessageId=z.string().regex(/^tmsg_[a-f0-9-]{36}$/);
export const supportAttachmentId=z.string().regex(/^tatt_[a-f0-9-]{36}$/);
export const supportStates=['OPEN','WAITING_BUYER','WAITING_SELLER','RESOLVED','CLOSED'] as const;
const time=z.number().int().nonnegative().max(8640000000000000);
const revision=z.number().int().min(1).max(1000000000);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const cipher=z.string().min(1);
export const supportTicketSchema=z.object({
 version:z.literal(1),id:supportTicketId,kind:z.enum(['ACCOUNT','ORDER']),accountId:supportId,sellerId:supportId.nullable(),orderId:supportId.nullable(),createdBy:supportId,
 subjectEncrypted:cipher,state:z.enum(supportStates),assignedOperatorId:supportId.nullable(),revision,createdAt:time,updatedAt:time,closedAt:time.nullable(),
}).strict().refine(t=>t.updatedAt>=t.createdAt&&(t.kind==='ACCOUNT'?t.orderId===null&&t.sellerId===null&&t.createdBy===t.accountId:t.orderId!==null&&t.sellerId!==null)&&((t.state==='CLOSED')===(t.closedAt!==null))&&(t.closedAt===null||t.closedAt>=t.createdAt&&t.closedAt<=t.updatedAt)&&(t.kind==='ORDER'||t.state!=='WAITING_SELLER'));
export type SupportTicket=z.infer<typeof supportTicketSchema>;
export const supportMessageSchema=z.object({version:z.literal(1),id:supportMessageId,ticketId:supportTicketId,authorId:supportId,authorRole:z.enum(['buyer','seller','operator']),bodyEncrypted:cipher,attachmentIds:z.array(supportAttachmentId).max(3),createdAt:time}).strict();
export type SupportTicketMessage=z.infer<typeof supportMessageSchema>;
export const supportAttachmentSchema=z.object({version:z.literal(1),id:supportAttachmentId,ticketId:supportTicketId,messageId:supportMessageId,uploadedBy:supportId,filenameEncrypted:cipher,mimeType:z.enum(['application/pdf','image/png','image/jpeg','text/plain']),byteLength:z.number().int().min(1).max(1024*1024),sha256:digest,bytesEncrypted:z.string(),state:z.enum(['AVAILABLE','REMOVED','PURGED']),createdAt:time,removedAt:time.nullable(),purgedAt:time.nullable()}).strict().refine(a=>(a.state==='PURGED'?a.bytesEncrypted==='':!!a.bytesEncrypted)&&(a.state==='AVAILABLE'?a.removedAt===null&&a.purgedAt===null:a.state==='REMOVED'?a.removedAt!==null&&a.purgedAt===null:a.purgedAt!==null));
export type SupportAttachment=z.infer<typeof supportAttachmentSchema>;
export const supportCommandSchema=z.object({version:z.literal(1),id:z.string().uuid(),userId:supportId,action:z.enum(['CREATE','REPLY','STATUS','ASSIGN','REMOVE_ATTACHMENT']),ticketId:supportTicketId,requestHash:digest,appliedRevision:revision,messageId:supportMessageId.nullable(),attachmentId:supportAttachmentId.nullable(),createdAt:time}).strict();
export type SupportCommand=z.infer<typeof supportCommandSchema>;
const privateText=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const supportUploadSchema=z.object({filename:z.string().trim().min(1).max(120),mimeType:z.enum(['application/pdf','image/png','image/jpeg','text/plain']),dataBase64:z.string().min(4).max(4*Math.ceil(1024*1024/3))}).strict();
export const supportCreateInput=z.object({idempotencyKey:z.string().uuid(),kind:z.enum(['ACCOUNT','ORDER']),orderId:supportId.nullable(),subject:privateText(160),message:privateText(4000),attachments:z.array(supportUploadSchema).max(3).default([])}).strict().refine(v=>(v.kind==='ORDER')===(v.orderId!==null));
const command={idempotencyKey:z.string().uuid(),expectedRevision:z.number().int().min(1).max(999999999)};
export const supportReplyInput=z.object({...command,message:privateText(4000),attachments:z.array(supportUploadSchema).max(3).default([])}).strict();
export const supportStatusInput=z.object({...command,state:z.enum(supportStates)}).strict();
export const supportAssignInput=z.object({...command,assignedOperatorId:supportId.nullable()}).strict();
export const supportRemoveInput=z.object({...command,attachmentId:supportAttachmentId}).strict();
export const SUPPORT_CLOSED_RETENTION_MS=180*86400000;
export const SUPPORT_FILE_LIMIT=1024*1024;
export const SUPPORT_TICKET_FILE_LIMIT=8*1024*1024;
export const SUPPORT_ACCOUNT_FILE_LIMIT=16*1024*1024;
