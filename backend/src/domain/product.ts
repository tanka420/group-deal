import {createHash} from 'node:crypto';

export type ProductCommandKind='CREATE'|'VERSION'|'RIGHTS'|'ARCHIVE'|'CANCEL';
export interface ProductCommandRecord {id:string;schema:'GroupDealProductCommandV1';actorId:string;commandId:string;kind:ProductCommandKind;status:'SUCCEEDED'|'CANCELED';createdAt:number;inputHash:string;contentDigest?:string;productId?:string;productVersionId?:string;licenseVersionId?:string;previousVersionId?:string;rightsId?:string}
export const productCommandFields=['id','schema','actorId','commandId','kind','status','createdAt','contentDigest','productId','productVersionId','licenseVersionId','previousVersionId','rightsId'] as const;
export const productCommandKey=(actorId:string,commandId:string)=>'product_cmd_'+createHash('sha256').update(actorId+'\0'+commandId).digest('hex');
export const productContentDigest=(input:unknown)=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
export const productCommandInputHash=(kind:ProductCommandKind,contentDigest:string,targetId?:string,expectedVersionId?:string)=>productContentDigest({schema:'GroupDealProductInputV1',kind,contentDigest,targetId:targetId??null,expectedVersionId:expectedVersionId??null});
export const productCommandDigest=(r:Record<string,any>)=>productContentDigest(Object.fromEntries([...productCommandFields,'inputHash'].map(f=>[f,r[f]??null])));
export const productCommandAction=(kind:unknown)=>kind==='CREATE'||kind==='VERSION'?'PRODUCT_VERSION_CREATED':kind==='RIGHTS'?'RIGHTS_SUBMITTED':kind==='ARCHIVE'?'PRODUCT_ARCHIVED':kind==='CANCEL'?'PRODUCT_COMMAND_CANCELED':undefined;
export function productCommandReceipt(r:Record<string,any>){
 const validId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=180&&!['__proto__','prototype','constructor'].includes(v),hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(!r||r.schema!=='GroupDealProductCommandV1'||!validId(r.actorId)||typeof r.commandId!=='string'||!/^[-A-Za-z0-9:_]{8,180}$/.test(r.commandId)||r.id!==productCommandKey(r.actorId,r.commandId)||!Number.isSafeInteger(r.createdAt)||r.createdAt<0||r.createdAt>8640000000000000)throw Error('CONFLICT: product command identity is invalid');
 const identity={schema:'GroupDealProductCommandV1' as const,commandId:r.commandId as string,sellerAccountId:r.actorId as string,committedAt:r.createdAt as number};
 if(r.status==='CANCELED'){if(r.kind!=='CANCEL'||['contentDigest','productId','productVersionId','licenseVersionId','previousVersionId','rightsId'].some(f=>r[f]!==null&&r[f]!==undefined))throw Error('CONFLICT: canceled product command is invalid');return{...identity,kind:'CANCEL' as const,status:'CANCELED' as const};}
 if(r.status!=='SUCCEEDED'||!['CREATE','VERSION','RIGHTS','ARCHIVE'].includes(r.kind)||!hash(r.contentDigest)||!['productId','productVersionId','licenseVersionId'].every(f=>validId(r[f]))||r.kind==='VERSION'&&(!validId(r.previousVersionId)||r.previousVersionId===r.productVersionId)||r.kind!=='VERSION'&&r.previousVersionId!==null&&r.previousVersionId!==undefined||r.kind==='RIGHTS'&&!validId(r.rightsId)||r.kind!=='RIGHTS'&&r.rightsId!==null&&r.rightsId!==undefined)throw Error('CONFLICT: product command result is invalid');
 return{...identity,kind:r.kind as Exclude<ProductCommandKind,'CANCEL'>,status:'SUCCEEDED' as const,contentDigest:r.contentDigest as string,productId:r.productId as string,productVersionId:r.productVersionId as string,licenseVersionId:r.licenseVersionId as string,...(r.kind==='VERSION'?{previousVersionId:r.previousVersionId as string}:r.kind==='RIGHTS'?{rightsId:r.rightsId as string}:{})};
}

export interface ProductRecord {
  id: string; sellerId: string; latestVersionId: string; activeVersionId?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; createdAt: number;
}
export interface LicenseVersionRecord {
  id: string; productId: string; edition: string; seatsPerUnit: number;
  usageScope: "PERSONAL" | "COMMERCIAL"; durationDays: number | null;
  activationWindowDays: number | null; regions: string[]; transferable: boolean;
  supportDays: number; usageTerms: string; contentHash: string; createdAt: number;
}
export interface ProductVersionRecord {
  id: string; productId: string; version: number; sellerId: string;
  title: string; description: string; category: string; vendor: string;
  thumbnailUrl: string; media: {url: string; alt: string}[];
  requirements: string[]; supportPolicy: string; licenseVersionId: string;
  contentHash: string; createdAt: number;
}
export interface RightsRecord {
  id: string; productVersionId: string; licenseVersionId: string; sellerId: string;
  declaration: "OWNER" | "AUTHORIZED_RESELLER"; declarationText: string;
  evidenceRefs: string[]; status: "SUBMITTED" | "APPROVED" | "REQUESTED_INFO" | "REJECTED" | "REVOKED";
  validUntil?: number; createdAt: number;
  decisions: {actorId: string; decision: RightsRecord["status"]; reason: string; timestamp: number}[];
}
export interface ProductSnapshot {
  schema: "GroupDealProductSnapshotV1";
  productId: string; productVersionId: string; licenseVersionId: string;
  productContentHash: string; licenseContentHash: string; rightsId: string;
  rightsApprovedAt: number; rightsValidUntil: number;
}

/** Private metadata inventories expose declared fields, never arbitrary storage extensions. */
export const productInventoryFields={
 product:['id','sellerId','latestVersionId','activeVersionId','status','createdAt'],
 version:['id','productId','version','sellerId','title','description','category','vendor','thumbnailUrl','media','requirements','supportPolicy','licenseVersionId','contentHash','createdAt'],
 license:['id','productId','edition','seatsPerUnit','usageScope','durationDays','activationWindowDays','regions','transferable','supportDays','usageTerms','contentHash','createdAt'],
 rights:['id','productVersionId','licenseVersionId','sellerId','declaration','declarationText','evidenceRefs','status','validUntil','createdAt','decisions'],
} as const;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=180&&!['__proto__','prototype','constructor'].includes(v);
const texts=(v:unknown)=>Array.isArray(v)&&v.every(x=>typeof x==='string');
const time=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000;
const pick=(v:Record<string,any>,fields:readonly string[],nullable:readonly string[]=[])=>Object.fromEntries(fields.filter(f=>Object.hasOwn(v,f)&&(v[f]!==null||nullable.includes(f))).map(f=>[f,v[f]]));
export function productVersionInventory(v:unknown){
 if(!object(v)||!['id','productId','sellerId','licenseVersionId'].every(k=>id(v[k]))||!Number.isSafeInteger(v.version)||v.version<1||!['title','description','category','vendor','thumbnailUrl','supportPolicy','contentHash'].every(k=>typeof v[k]==='string')||!time(v.createdAt)||!texts(v.requirements)||!Array.isArray(v.media)||v.media.some(m=>!object(m)||typeof m.url!=='string'||typeof m.alt!=='string'))throw Error('Product version metadata invalid');
 return {...pick(v,productInventoryFields.version),media:v.media.map(m=>pick(m,['url','alt'])),requirements:[...v.requirements]} as ProductVersionRecord;
}
export function licenseVersionInventory(v:unknown){
 if(!object(v)||!id(v.id)||!id(v.productId)||!['edition','usageTerms','contentHash'].every(k=>typeof v[k]==='string')||!['PERSONAL','COMMERCIAL'].includes(v.usageScope)||!Number.isSafeInteger(v.seatsPerUnit)||v.seatsPerUnit<1||v.seatsPerUnit>10000||!texts(v.regions)||typeof v.transferable!=='boolean'||!Number.isSafeInteger(v.supportDays)||v.supportDays<0||v.supportDays>36500||!time(v.createdAt)||[v.durationDays,v.activationWindowDays].some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1))||v.durationDays>36500||v.activationWindowDays>3650)throw Error('License metadata invalid');
 return {...pick(v,productInventoryFields.license,['durationDays','activationWindowDays']),regions:[...v.regions]} as LicenseVersionRecord;
}
export function rightsInventory(v:unknown){
 const statuses=['SUBMITTED','APPROVED','REQUESTED_INFO','REJECTED','REVOKED'];
 if(!object(v)||!['id','productVersionId','licenseVersionId','sellerId'].every(k=>id(v[k]))||!['OWNER','AUTHORIZED_RESELLER'].includes(v.declaration)||typeof v.declarationText!=='string'||!texts(v.evidenceRefs)||!statuses.includes(v.status)||!time(v.createdAt)||v.validUntil!==undefined&&v.validUntil!==null&&(!Number.isSafeInteger(v.validUntil)||v.validUntil<1||v.validUntil>8640000000000)||!Array.isArray(v.decisions)||v.decisions.some(d=>!object(d)||!id(d.actorId)||!statuses.includes(d.decision)||typeof d.reason!=='string'||!time(d.timestamp)))throw Error('Rights metadata invalid');
 return {...pick(v,productInventoryFields.rights),evidenceRefs:[...v.evidenceRefs],decisions:v.decisions.map(d=>pick(d,['actorId','decision','reason','timestamp']))} as RightsRecord;
}
export function productInventory(v:unknown){
 if(!object(v)||!id(v.id)||!id(v.sellerId)||!id(v.latestVersionId)||v.activeVersionId!==undefined&&v.activeVersionId!==null&&!id(v.activeVersionId)||!['DRAFT','PUBLISHED','ARCHIVED'].includes(v.status)||!time(v.createdAt))throw Error('Product metadata invalid');
 return pick(v,productInventoryFields.product) as unknown as ProductRecord;
}
/** Operator review uses the same public version fields, with private rights kept alongside. */
export type PublicProductVersion=Pick<ProductVersionRecord,'id'|'productId'|'title'|'description'|'category'|'vendor'|'thumbnailUrl'|'media'|'requirements'|'supportPolicy'|'contentHash'>&{license:Pick<LicenseVersionRecord,'id'|'edition'|'seatsPerUnit'|'usageScope'|'durationDays'|'activationWindowDays'|'regions'|'transferable'|'supportDays'|'usageTerms'|'contentHash'>};
export function reviewedProductInventory(version:unknown,license:unknown):PublicProductVersion{
 const v=productVersionInventory(version),l=licenseVersionInventory(license);
 return {...pick(v,['id','productId','title','description','category','vendor','thumbnailUrl','media','requirements','supportPolicy','contentHash']),license:pick(l,['id','edition','seatsPerUnit','usageScope','durationDays','activationWindowDays','regions','transferable','supportDays','usageTerms','contentHash'],['durationDays','activationWindowDays'])} as PublicProductVersion;
}
