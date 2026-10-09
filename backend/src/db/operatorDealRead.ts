import type {DatabaseSync} from 'node:sqlite';
import {config} from '../config';
export type OperatorDealRead={
 deal:(id:string)=>unknown;
 disputePage:(id:string,limit:number,after:string,status:'ALL'|'OPEN'|'RESOLVED')=>unknown[];
};
export const operatorDealScopeArgs=(id:string)=>[id,config.arcChainId,config.hubAddress.toLowerCase(),config.protocolVersion];
/** Explicit committed references; shared products, seller IDs and free text do not identify a deal. */
export const operatorDealAuditScope=`WITH
 selected_campaign AS (SELECT record_key AS id,json_extract(record_json,'$.chainId') AS chain,lower(json_extract(record_json,'$.hubAddress')) AS hub,coalesce(json_extract(record_json,'$.protocolVersion'),1) AS protocol FROM domain_records WHERE collection='campaigns' AND record_key=? AND json_extract(record_json,'$.id')=record_key AND json_extract(record_json,'$.chainId')=? AND lower(json_extract(record_json,'$.hubAddress'))=? AND coalesce(json_extract(record_json,'$.protocolVersion'),1)=?),
 deal_orders AS (SELECT o.record_key AS id FROM domain_records o JOIN selected_campaign c ON json_extract(o.record_json,'$.campaignId')=c.id WHERE o.collection='orders' AND json_extract(o.record_json,'$.id')=o.record_key AND json_extract(o.record_json,'$.chainId')=c.chain AND lower(json_extract(o.record_json,'$.hubAddress'))=c.hub AND coalesce(json_extract(o.record_json,'$.protocolVersion'),1)=c.protocol),
 deal_operations AS (SELECT o.record_key AS id FROM domain_records o JOIN selected_campaign c ON json_extract(o.record_json,'$.chainId')=c.chain AND lower(json_extract(o.record_json,'$.hubAddress'))=c.hub WHERE o.collection='operations' AND json_extract(o.record_json,'$.id')=o.record_key AND ((json_extract(o.record_json,'$.action') IN ('PUBLISH','BUY','BUYER_CLAIM','SELLER_CLAIM','SETTLE') AND json_extract(o.record_json,'$.resourceId')=c.id) OR (json_extract(o.record_json,'$.action') IN ('DELIVER','CONFIRM','DISPUTE','BREACH','RESOLVE') AND json_extract(o.record_json,'$.resourceId') IN (SELECT id FROM deal_orders)))),
 deal_tickets AS (SELECT record_key AS id FROM domain_records WHERE collection='supportTickets' AND json_extract(record_json,'$.id')=record_key AND json_extract(record_json,'$.kind')='ORDER' AND json_extract(record_json,'$.orderId') IN (SELECT id FROM deal_orders)),
 deal_notifications AS (SELECT record_key AS id FROM domain_records WHERE collection='notifications' AND json_extract(record_json,'$.id')=record_key AND ((json_extract(record_json,'$.source.kind')='SUPPORT_TICKET' AND json_extract(record_json,'$.source.ticketId') IN (SELECT id FROM deal_tickets)) OR (json_extract(record_json,'$.source.kind')='SUPPORT_MESSAGE' AND json_extract(record_json,'$.source.orderId') IN (SELECT id FROM deal_orders)) OR (json_extract(record_json,'$.source.kind')='SELLER_FOLLOW_EVENT' AND json_extract(record_json,'$.source.campaignId') IN (SELECT id FROM selected_campaign)))),
 deal_refs(kind,id) AS (
  SELECT 'campaignId',id FROM selected_campaign UNION ALL SELECT 'orderId',id FROM deal_orders UNION ALL SELECT 'operationId',id FROM deal_operations UNION ALL SELECT 'previousOperationId',id FROM deal_operations
  UNION ALL SELECT 'grantId',record_key FROM domain_records WHERE collection='resourceGrants' AND json_extract(record_json,'$.id')=record_key AND json_extract(record_json,'$.orderId') IN (SELECT id FROM deal_orders)
  UNION ALL SELECT 'ticketId',id FROM deal_tickets UNION ALL SELECT 'notificationId',id FROM deal_notifications
  UNION ALL SELECT 'outboxId',record_key FROM domain_records WHERE collection='emailOutbox' AND json_extract(record_json,'$.id')=record_key AND json_extract(record_json,'$.notificationId') IN (SELECT id FROM deal_notifications)
 ) `;
export const operatorDealAuditFilter=" AND EXISTS(SELECT 1 FROM deal_refs r WHERE json_type(a.value,'$.details.'||r.kind)='text' AND json_extract(a.value,'$.details.'||r.kind)=r.id)";
/** Closures expire with the committed authorization/read transaction. */
export function operatorDealRead(sql:DatabaseSync,assertActive:()=>void):OperatorDealRead{
 const deal=(id:string)=>{assertActive();const row=sql.prepare("SELECT record_key,json_object('id',json_extract(record_json,'$.id'),'chainId',json_extract(record_json,'$.chainId'),'hubAddress',json_extract(record_json,'$.hubAddress'),'protocolVersion',coalesce(json_extract(record_json,'$.protocolVersion'),1),'status',json_extract(record_json,'$.status')) AS record_json FROM domain_records WHERE collection='campaigns' AND record_key=?").get(id) as {record_key:string;record_json:string}|undefined;if(!row)return null;const value=JSON.parse(row.record_json);if(value.id!==row.record_key)throw Error('OPERATOR_DEAL_STORAGE_INVALID');return value;};
 const disputePage:OperatorDealRead['disputePage']=(id,limit,after,status)=>{
  assertActive();if(!Number.isSafeInteger(limit)||limit<1||limit>51)throw Error('OPERATOR_DEAL_STORAGE_INVALID');
  const fields=['id','campaignId','chainId','hubAddress','protocolVersion','onchainOrderId','buyerPrincipal','committedGross','deliveryStatus','disputeReason','disputeEvidence'];
  const projection="json_object("+fields.flatMap(f=>["'"+f+"'","json_extract(record_json,'$."+f+"')"]).concat(["'disputeResolution'","CASE WHEN json_type(record_json,'$.disputeResolution')='object' THEN json_object('txHash',json_extract(record_json,'$.disputeResolution.txHash'),'notes',json_extract(record_json,'$.disputeResolution.notes'),'operatorId',json_extract(record_json,'$.disputeResolution.operatorId')) ELSE NULL END"]).join(',')+")";
  const statuses=status==='OPEN'?'DISPUTED':status==='RESOLVED'?'RESOLVED':null;
  const rows=sql.prepare('SELECT record_key,'+projection+" AS record_json FROM domain_records WHERE collection='orders' AND json_extract(record_json,'$.campaignId')=? AND record_key>? AND json_extract(record_json,'$.deliveryStatus') IN ('DISPUTED','RESOLVED')"+(statuses?" AND json_extract(record_json,'$.deliveryStatus')=?":'')+' ORDER BY record_key LIMIT CAST(? AS INTEGER)').all(id,after,...(statuses?[statuses]:[]),limit) as {record_key:string;record_json:string}[];
  return rows.map(r=>{const value=JSON.parse(r.record_json);if(value.id!==r.record_key)throw Error('OPERATOR_DEAL_STORAGE_INVALID');return value;});
 };
 return{deal,disputePage};
}
