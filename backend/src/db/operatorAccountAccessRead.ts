import type {DatabaseSync} from 'node:sqlite';
import type {AccountAccessTarget} from '../domain/accountAccess';
import {AccountAccessError,readAccountAccess} from '../domain/accountAccess';

export function operatorAccountAccessRead(sql:DatabaseSync,targetId:string,controller:string):AccountAccessTarget|undefined{
 const row=sql.prepare("SELECT json_extract(record_json,'$.id') AS id,json_extract(record_json,'$.roles') AS roles,json_extract(record_json,'$.accountAccess') AS access,json_type(record_json,'$.accountAccess') AS accessType,json_type(record_json,'$.sellerProfile') AS profile FROM domain_records WHERE collection='users' AND record_key=?").get(targetId) as {id:string;roles:string;access:string|null;accessType:string|null;profile:string|null}|undefined;
 if(!row)return undefined;
 const roles=JSON.parse(row.roles);
 if(row.id!==targetId||!Array.isArray(roles)||roles.some(v=>!['buyer','seller','operator'].includes(v))||new Set(roles).size!==roles.length)throw new AccountAccessError('ACCOUNT_ACCESS_UNAVAILABLE',503);
 const accountAccess=readAccountAccess(row.accessType===null?undefined:row.access===null?null:JSON.parse(row.access));
 const protectedAccount=roles.includes('operator')||!!sql.prepare("SELECT 1 FROM domain_records WHERE collection='userByWallet' AND lower(record_key)=? AND json_extract(record_json,'$')=?").get(controller.toLowerCase(),targetId);
 // Refuse seller revocation while a campaign, outstanding delivery/claim, or unsigned command remains.
 const campaigns=Number((sql.prepare("SELECT count(*) AS n FROM domain_records WHERE collection='campaigns' AND json_extract(record_json,'$.sellerId')=? AND coalesce(json_extract(record_json,'$.status'),'UNKNOWN') NOT IN ('CANCELLED','FINALIZED','ARCHIVED','DRAFT')").get(targetId) as {n:number}).n);
 const orders=Number((sql.prepare("SELECT count(*) AS n FROM domain_records o JOIN domain_records c ON c.collection='campaigns' AND c.record_key=json_extract(o.record_json,'$.campaignId') WHERE o.collection='orders' AND json_extract(c.record_json,'$.sellerId')=? AND (coalesce(json_extract(o.record_json,'$.deliveryStatus'),'UNKNOWN') NOT IN ('CONFIRMED','BREACHED_REFUNDED','CANCELLED') OR CAST(coalesce(json_extract(o.record_json,'$.sellerAllocated'),'0') AS TEXT)<>CAST(coalesce(json_extract(o.record_json,'$.sellerClaimedAmount'),'0') AS TEXT))").get(targetId) as {n:number}).n);
 const operations=Number((sql.prepare("SELECT count(*) AS n FROM domain_records WHERE collection='operations' AND json_extract(record_json,'$.userId')=? AND coalesce(json_extract(record_json,'$.phase'),'UNKNOWN') NOT IN ('PROJECTED','REVERTED','SUPERSEDED','EXPIRED')").get(targetId) as {n:number}).n);
 return{id:targetId,roles,accountAccess,sellerProfilePresent:row.profile==='object',protected:protectedAccount,openObligations:campaigns+orders+operations};
}
