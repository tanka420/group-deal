import deployment from '../../../shared/contracts.json';
export type DealDisputeStatus='ALL'|'OPEN'|'RESOLVED';
export type DealDispute={id:string;campaignId:string;onchainOrderId:number;buyerPrincipal:string;committedGross:string;deliveryStatus:'DISPUTED'|'RESOLVED';disputeReason:string|null;disputeEvidence:string[];disputeResolution:{txHash:string;notes:string;operatorId:string}|null};
export type DealDisputePage={version:'1.0';scope:'OPERATOR_DEAL_DISPUTES';operatorAccountId:string;dealId:string;chainId:number;hubAddress:string;revision:number;observedAt:number;status:DealDisputeStatus;limit:20;disputes:DealDispute[];pagination:{nextCursor:string|null};chainVerified:false};
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v);
const url=(v:unknown):v is string=>{if(typeof v!=='string'||v.length>2048)return false;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
export function parseDealDisputes(value:unknown,userId:string,dealId:string,status:DealDisputeStatus):DealDisputePage{
 const v=value as any;
 if(!v||v.version!=='1.0'||v.scope!=='OPERATOR_DEAL_DISPUTES'||v.operatorAccountId!==userId||v.dealId!==dealId||v.chainId!==deployment.chainId||!address(v.hubAddress)||v.hubAddress.toLowerCase()!==deployment.contracts.GroupDealHub.address.toLowerCase()||!uint(v.revision)||!uint(v.observedAt)||v.observedAt>8640000000000000||v.status!==status||v.limit!==20||v.chainVerified!==false||!Array.isArray(v.disputes)||v.disputes.length>20||!v.pagination||!(v.pagination.nextCursor===null||typeof v.pagination.nextCursor==='string'&&/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(v.pagination.nextCursor)&&v.pagination.nextCursor.length<=2048&&v.disputes.length===20))throw Error('OPERATOR_DEAL_RESPONSE_INVALID');
 let previous='';const disputes:DealDispute[]=v.disputes.map((r:any)=>{
  if(!r||!id(r.id)||r.id<=previous||r.campaignId!==dealId||!uint(r.onchainOrderId)||!address(r.buyerPrincipal)||typeof r.committedGross!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(r.committedGross)||!['DISPUTED','RESOLVED'].includes(r.deliveryStatus)||status==='OPEN'&&r.deliveryStatus!=='DISPUTED'||status==='RESOLVED'&&r.deliveryStatus!=='RESOLVED'||!(r.disputeReason===null||text(r.disputeReason))||!Array.isArray(r.disputeEvidence)||r.disputeEvidence.length>100||!r.disputeEvidence.every(url))throw Error('OPERATOR_DEAL_RESPONSE_INVALID');
  const resolution=r.disputeResolution;if(resolution!==null&&(!resolution||typeof resolution.txHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(resolution.txHash)||!text(resolution.notes)||typeof resolution.operatorId!=='string'||!resolution.operatorId||resolution.operatorId.length>128))throw Error('OPERATOR_DEAL_RESPONSE_INVALID');previous=r.id;
  return{id:r.id,campaignId:dealId,onchainOrderId:r.onchainOrderId,buyerPrincipal:r.buyerPrincipal,committedGross:r.committedGross,deliveryStatus:r.deliveryStatus,disputeReason:r.disputeReason,disputeEvidence:[...r.disputeEvidence],disputeResolution:resolution===null?null:{txHash:resolution.txHash,notes:resolution.notes,operatorId:resolution.operatorId}};
 });
 return{version:'1.0',scope:'OPERATOR_DEAL_DISPUTES',operatorAccountId:userId,dealId,chainId:v.chainId,hubAddress:v.hubAddress,revision:v.revision,observedAt:v.observedAt,status,limit:20,disputes,pagination:{nextCursor:v.pagination.nextCursor},chainVerified:false};
}
