export interface DigitalResource {
  id:string; sellerId:string; productVersionId:string; fileName:string; mimeType:string;
  sha256:string; byteLength:number; encryptedPayload:string; createdAt:number;
}
export interface LicenseInventoryRecord {
  id:string; sellerId:string; productVersionId:string; resourceId:string; keyFingerprint:string; keyEncrypted:string;
  status:"AVAILABLE"|"RESERVED"|"ASSIGNED"; orderId?:string; operationId?:string; createdAt:number;
}
export interface ResourceGrant {
  id:string; orderId:string; buyerAccountId:string; buyerPrincipal:string; productVersionId:string;
  licenseVersionId:string; resourceId:string; unitIndex:number; seatsPerUnit:number;
  licenseKeyId?:string; state:"STAGED"|"ACTIVE"; activatedAt?:number; redeemedAt?:number;
}
export interface DeliveryProbe {
  id:string; sellerId:string; productVersionId:string; method:"FILE_LINK"|"LICENSE_KEY";
  resourceId:string; resourceSha256:string; checkedAt:number; evidenceHash:string;
}
interface ResourceCommandBase {
 id:string;schema:'GroupDealResourceCommandV1';actorId:string;commandId:string;inputHash:string;
 productVersionId?:string;resourceId?:string;createdAt:number;imported?:number;sha256?:string;byteLength?:number;
 probeId?:string;method?:'FILE_LINK'|'LICENSE_KEY';evidenceHash?:string;campaignId?:string;
}
export interface ResourceSuccessCommand extends ResourceCommandBase {
 kind:'UPLOAD'|'KEYS'|'PROBE';status:'SUCCEEDED';productVersionId:string;resourceId:string;
}
export interface ResourceCanceledCommand extends ResourceCommandBase {kind:'CANCEL';status:'CANCELED'}
export type ResourceCommand=ResourceSuccessCommand|ResourceCanceledCommand;
