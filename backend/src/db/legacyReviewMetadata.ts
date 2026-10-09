import type {DatabaseSync} from 'node:sqlite';
import type {DatabaseSchema} from './store';

/** SQL projects dependency metadata only. This facade is never a financial projection or writable store. */
export function readLegacyReviewMetadata(sqlite:DatabaseSync):DatabaseSchema{
 const state:Record<string,any>=Object.create(null);
 const fields:Record<string,string[]>={users:['id'],campaigns:['id','onchainCampaignId','protocolVersion','chainId','hubAddress','txHash','sellerId'],orders:['id','onchainOrderId','protocolVersion','chainId','hubAddress','txHash','commitmentTxHash','campaignId','buyerAccountId','buyerPrincipal'],campaignIdentities:[],resources:['id'],productVersions:['id'],licenseVersions:['id'],resourceGrants:['id','orderId','buyerAccountId','buyerPrincipal','resourceId','productVersionId','licenseVersionId','licenseKeyId','state'],licenseInventory:['id','orderId'],supportTickets:['id','orderId'],supportAttachments:['ticketId'],emailOutbox:['id','userId','notificationId','status'],notifications:['id'],webhookQueue:['id','sellerId','status'],webhooks:['id'],eventJournal:['evidenceVersion','txHash','blockHash','eventDigest','blockNumber','chainId','contractAddress']};
 const numeric=new Set(['onchainCampaignId','onchainOrderId','protocolVersion','chainId','evidenceVersion','blockNumber']);
 for(const [collection,names]of Object.entries(fields)){
  state[collection]=Object.create(null);
  if(collection==='campaignIdentities')continue;
  const selectors=names.flatMap(name=>[`'${name}',CASE WHEN json_type(record_json,'$.${name}')='${numeric.has(name)?'integer':'text'}' THEN json_extract(record_json,'$.${name}') ELSE NULL END`,`'__present_${name}',json_type(record_json,'$.${name}') IS NOT NULL`]);
  if(collection==='orders'||collection==='campaigns')selectors.push("'snapshotPresent',CASE WHEN json_extract(record_json,'$.productSnapshot') IS NOT NULL AND json_extract(record_json,'$.productSnapshot') NOT IN (0,'') THEN 1 ELSE 0 END");
  if(collection==='orders')selectors.push("'entitlementPresent',CASE WHEN json_type(record_json,'$.deliveredEntitlementEncrypted')='text' AND length(json_extract(record_json,'$.deliveredEntitlementEncrypted'))>0 THEN 1 ELSE 0 END");
  if(collection==='webhooks')for(const name of ['secret','secretEncrypted'])selectors.push(`'${name}Present',CASE WHEN json_type(record_json,'$.${name}')='text' AND length(json_extract(record_json,'$.${name}'))>0 THEN 1 ELSE 0 END`);
  if(collection==='webhookQueue')for(const name of ['orderId','campaignId','id'])selectors.push(`'payload_${name}',CASE WHEN json_type(record_json,'$.payload.${name}') IN ('text','integer') THEN json_extract(record_json,'$.payload.${name}') ELSE NULL END`);
  const rows=sqlite.prepare('SELECT record_key,json_object('+selectors.join(',')+') AS metadata FROM domain_records WHERE collection=?').all(collection) as {record_key:string;metadata:string}[];
  for(const row of rows){const metadata=JSON.parse(row.metadata);for(const name of names){if(!metadata['__present_'+name])delete metadata[name];delete metadata['__present_'+name];}if(metadata.snapshotPresent)metadata.productSnapshot={};if(metadata.entitlementPresent)metadata.deliveredEntitlementEncrypted='METADATA_PRESENCE_ONLY';if(metadata.secretPresent)metadata.secret='METADATA_PRESENCE_ONLY';if(metadata.secretEncryptedPresent)metadata.secretEncrypted='METADATA_PRESENCE_ONLY';if(collection==='webhookQueue')metadata.payload={orderId:metadata.payload_orderId,campaignId:metadata.payload_campaignId,id:metadata.payload_id};state[collection][row.record_key]=metadata;}
 }
 state.userByWallet=Object.create(null);for(const row of sqlite.prepare("SELECT record_key,CASE WHEN json_type(record_json)='text' THEN json_extract(record_json,'$') ELSE NULL END AS owner FROM domain_records WHERE collection='userByWallet'").all() as {record_key:string;owner:unknown}[])state.userByWallet[row.record_key]=row.owner;
 state.supportMessages=Object.create(null);for(const row of sqlite.prepare("SELECT record_key,json_type(record_json) AS kind,json_array_length(record_json) AS count FROM domain_records WHERE collection='supportMessages'").all() as {record_key:string;kind:string;count:number}[]){if(row.kind!=='array'||!Number.isSafeInteger(row.count)||row.count<0)throw Error('LEGACY_REVIEW_METADATA_INVALID');state.supportMessages[row.record_key]={length:row.count};}
 return state as DatabaseSchema;
}
