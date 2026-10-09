import deployment from '../../../shared/contracts.json';
export type AuditFilters={action:string|null;actor:string|null};
type Metadata={version:'1.0';operatorAccountId:string;chainId:number;hubAddress:string;revision:number;observedAt:number};
export type AuditRow={id:string;position:number;timestamp:number;actorId:string|null;actorDigest:string;role:string;action:string;hash:string;prevHash:string};
export type AuditPage=Metadata&{scope:'OPERATOR_AUDIT_PAGE';filters:AuditFilters&{dealId?:string};limit:20;logs:AuditRow[];pagination:{nextCursor:string|null};integrityChecked:false};
export type AuditIntegrity=Metadata&{scope:'OPERATOR_AUDIT_INTEGRITY';valid:boolean;checked:number;reason:'AUDIT_RECORD_INVALID'|'HASH_MISMATCH'|'CHAIN_LINK_MISMATCH'|null;brokenPosition:number|null};
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128&&!['constructor','prototype','__proto__'].includes(v);
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const action=(v:unknown):v is string=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,127}$/.test(v);
function metadata(v:any,userId:string):Metadata{
 if(!v||v.version!=='1.0'||v.operatorAccountId!==userId||v.chainId!==deployment.chainId||typeof v.hubAddress!=='string'||v.hubAddress.toLowerCase()!==deployment.contracts.GroupDealHub.address.toLowerCase()||!integer(v.revision)||!integer(v.observedAt)||v.observedAt>8640000000000000)throw Error('OPERATOR_AUDIT_RESPONSE_INVALID');
 return{version:'1.0',operatorAccountId:userId,chainId:v.chainId,hubAddress:v.hubAddress,revision:v.revision,observedAt:v.observedAt};
}
export function parseAuditPage(value:unknown,userId:string,filters:AuditFilters,dealId?:string):AuditPage{
 const v=value as any,meta=metadata(v,userId);
 if(v.scope!=='OPERATOR_AUDIT_PAGE'||v.limit!==20||v.integrityChecked!==false||!v.filters||v.filters.action!==filters.action||v.filters.actor!==filters.actor||v.filters.dealId!==dealId||!Array.isArray(v.logs)||v.logs.length>20||!v.pagination||!(v.pagination.nextCursor===null||typeof v.pagination.nextCursor==='string'&&/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(v.pagination.nextCursor)&&v.pagination.nextCursor.length<=2048&&v.logs.length===20))throw Error('OPERATOR_AUDIT_RESPONSE_INVALID');
 let previous=-1;const logs:AuditRow[]=v.logs.map((r:any)=>{if(!r||!id(r.id)||!integer(r.position)||r.position<=previous||!integer(r.timestamp)||r.timestamp>8640000000000000||!(r.actorId===null||id(r.actorId))||!digest(r.actorDigest)||typeof r.role!=='string'||! /^[A-Za-z][A-Za-z0-9:_-]{0,63}$/.test(r.role)||!action(r.action)||!digest(r.hash)||!digest(r.prevHash)||filters.action!==null&&r.action!==filters.action||filters.actor!==null&&r.actorId!==filters.actor)throw Error('OPERATOR_AUDIT_RESPONSE_INVALID');previous=r.position;return{id:r.id,position:r.position,timestamp:r.timestamp,actorId:r.actorId,actorDigest:r.actorDigest,role:r.role,action:r.action,hash:r.hash,prevHash:r.prevHash};});
 if(new Set(logs.map(r=>r.id)).size!==logs.length)throw Error('OPERATOR_AUDIT_RESPONSE_INVALID');return{...meta,scope:'OPERATOR_AUDIT_PAGE',filters:{...filters,...(dealId?{dealId}:{})},limit:20,logs,pagination:{nextCursor:v.pagination.nextCursor},integrityChecked:false};
}
export function parseAuditIntegrity(value:unknown,userId:string,revision:number):AuditIntegrity{
 const v=value as any,meta=metadata(v,userId);if(meta.revision!==revision)throw 409;
 if(v.scope!=='OPERATOR_AUDIT_INTEGRITY'||typeof v.valid!=='boolean'||!integer(v.checked)||!(v.brokenPosition===null||integer(v.brokenPosition))||!(v.valid?v.reason===null&&v.brokenPosition===null:['AUDIT_RECORD_INVALID','HASH_MISMATCH','CHAIN_LINK_MISMATCH'].includes(v.reason)&&integer(v.brokenPosition)))throw Error('OPERATOR_AUDIT_RESPONSE_INVALID');
 return{...meta,scope:'OPERATOR_AUDIT_INTEGRITY',valid:v.valid,checked:v.checked,reason:v.reason,brokenPosition:v.brokenPosition};
}
