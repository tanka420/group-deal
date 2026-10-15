import type {DatabaseSync} from 'node:sqlite';

export const accountSections=['orders','campaigns','support','audit'] as const;
export type AccountSection=typeof accountSections[number];
/** All reads run inside the caller's committed authorization snapshot. No encrypted payloads are selected. */
export function operatorAccountRead(sql:DatabaseSync,assertActive:()=>void){
 return (id:string,section:AccountSection,limit:number,after:string|number)=>{
  assertActive();if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!accountSections.includes(section)||!Number.isSafeInteger(limit)||limit<1||limit>51)throw Error('OPERATOR_ACCOUNT_READ_INVALID');
  const row=sql.prepare("SELECT json_object('id',record_key,'roles',json_extract(record_json,'$.roles'),'createdAt',json_extract(record_json,'$.createdAt'),'loginMethod',json_extract(record_json,'$.loginMethod'),'activeWallet',json_extract(record_json,'$.activeWallet'),'displayName',json_extract(record_json,'$.sellerProfile.displayName')) AS value FROM domain_records WHERE collection='users' AND record_key=? AND json_extract(record_json,'$.id')=record_key").get(id) as {value:string}|undefined;
  if(!row)return null;
  const wallets=(sql.prepare("SELECT record_key AS address FROM domain_records WHERE collection='userByWallet' AND json_type(record_json)='text' AND json_extract(record_json,'$')=? ORDER BY record_key").all(id) as {address:string}[]).map(r=>r.address);
  const specs={
   orders:{from:"domain_records d LEFT JOIN domain_records c ON c.collection='campaigns' AND c.record_key=json_extract(d.record_json,'$.campaignId')",where:"d.collection='orders' AND (json_extract(d.record_json,'$.buyerAccountId')=? OR json_extract(c.record_json,'$.sellerId')=?)",args:[id,id],projection:"json_object('id',d.record_key,'campaignId',json_extract(d.record_json,'$.campaignId'),'title',json_extract(c.record_json,'$.title'),'state',json_extract(d.record_json,'$.deliveryStatus'),'timestamp',json_extract(d.record_json,'$.createdAt'))"},
   campaigns:{from:'domain_records d',where:"d.collection='campaigns' AND json_extract(d.record_json,'$.sellerId')=?",args:[id],projection:"json_object('id',d.record_key,'title',json_extract(d.record_json,'$.title'),'state',json_extract(d.record_json,'$.status'),'timestamp',json_extract(d.record_json,'$.createdAt'))"},
   support:{from:'domain_records d',where:"d.collection='supportTickets' AND (json_extract(d.record_json,'$.accountId')=? OR json_extract(d.record_json,'$.sellerId')=? OR json_extract(d.record_json,'$.assignedOperatorId')=?)",args:[id,id,id],projection:"json_object('id',d.record_key,'orderId',json_extract(d.record_json,'$.orderId'),'state',json_extract(d.record_json,'$.state'),'timestamp',json_extract(d.record_json,'$.createdAt'))"},
  };
  const counts=Object.fromEntries(Object.entries(specs).map(([key,s])=>[key,Number((sql.prepare('SELECT count(*) AS n FROM '+s.from+' WHERE '+s.where).get(...s.args) as {n:number}).n)]));
  counts.audit=Number((sql.prepare("SELECT count(*) AS n FROM domain_records d,json_each(d.record_json) a WHERE d.collection='auditLogs' AND d.record_key='state' AND json_extract(a.value,'$.actor')=?").get(id) as {n:number}).n);
  let rows:unknown[];
  if(section==='audit'){
   if(typeof after!=='number'||!Number.isSafeInteger(after)||after< -1)throw Error('OPERATOR_ACCOUNT_BOUNDARY_INVALID');
   rows=(sql.prepare("SELECT json_object('id',json_extract(a.value,'$.id'),'state',json_extract(a.value,'$.action'),'timestamp',json_extract(a.value,'$.timestamp'),'position',CAST(a.key AS INTEGER)) AS value FROM domain_records d,json_each(d.record_json) a WHERE d.collection='auditLogs' AND d.record_key='state' AND json_extract(a.value,'$.actor')=? AND CAST(a.key AS INTEGER)>? ORDER BY CAST(a.key AS INTEGER) LIMIT ?").all(id,after,limit) as {value:string}[]).map(r=>JSON.parse(r.value));
  }else{
   if(typeof after!=='string')throw Error('OPERATOR_ACCOUNT_BOUNDARY_INVALID');const s=specs[section];
   rows=(sql.prepare('SELECT '+s.projection+' AS value FROM '+s.from+' WHERE '+s.where+' AND d.record_key>? ORDER BY d.record_key LIMIT ?').all(...s.args,after,limit) as {value:string}[]).map(r=>JSON.parse(r.value));
  }
  return {account:JSON.parse(row.value),wallets,counts,rows};
 };
}
