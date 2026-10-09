import {OrderRecord,SupportMessageRecord} from '../db/store';
import {VerificationResult,TransactionVerifier} from './transactionVerifier';
import {config} from '../config';
import {IndexerService} from './indexerService';
import {ethers} from 'ethers';
import {cleanHttpsEvidenceUrl} from '../../../shared/evidence.mjs';
import {OrderThreadService} from './orderThreadService';
import type {SessionProof} from './sessionService';
import {OrderReviewService,OrderReviewError} from './orderReviewService';
import {DisputeMetadataService} from './disputeMetadataService';
export class DisputeService{
 public static async openDispute(userId:string,orderId:string,reason:string,evidenceUrls:string[],txHash:string,proof?:SessionProof){
  if(typeof reason!=='string'||!reason.trim()||reason.length>4000||!Array.isArray(evidenceUrls)||evidenceUrls.length>10||evidenceUrls.some(url=>!cleanHttpsEvidenceUrl(url)))throw new Error('Invalid dispute metadata: bounded reason and credential-free HTTPS evidence links required');
  if(!txHash)throw new Error('Missing required onchain transaction hash for openDispute');
  const {order,campaign}=DisputeMetadataService.context(proof,userId,orderId,'OPEN');
  const verification=await TransactionVerifier.verifyExpectedTransaction({intentId:'dispute_'+order.id+'_'+txHash,expectedTo:config.hubAddress,expectedSender:order.buyerPrincipal,expectedFunction:'openDispute',expectedEvent:'OrderDisputed',expectedEventArgs:{campaignId:campaign.onchainCampaignId!,orderId:order.onchainOrderId,reasonHash:ethers.keccak256(ethers.toUtf8Bytes(reason))}},txHash);
  await IndexerService.projectVerifiedReceipt(verification);return this.recordOpenedMetadata(userId,orderId,reason,evidenceUrls,verification,proof);
 }
 public static recordOpenedMetadata(userId:string,orderId:string,reason:string,evidenceUrls:string[],verification:VerificationResult,proof?:SessionProof,operationId?:string){return DisputeMetadataService.record(proof,userId,orderId,'OPEN',{reason,evidenceUrls},verification,operationId);}
 public static async resolveDispute(operatorId:string,orderId:string,buyerShareBaseUSDC:string,sellerShareBaseUSDC:string,notes:string,txHash:string,proof?:SessionProof){
  if(typeof notes!=='string'||!notes.trim()||notes.length>4000)throw new Error('Resolution notes must contain 1–4000 characters');
  if(typeof buyerShareBaseUSDC!=='string'||typeof sellerShareBaseUSDC!=='string'||!/^\d{1,78}$/.test(buyerShareBaseUSDC)||!/^\d{1,78}$/.test(sellerShareBaseUSDC))throw new Error('Phần phân bổ cho buyer và seller phải là số không âm');
  if(!txHash)throw new Error('Missing required onchain transaction hash for resolveDispute');
  buyerShareBaseUSDC=BigInt(buyerShareBaseUSDC).toString();sellerShareBaseUSDC=BigInt(sellerShareBaseUSDC).toString();
  const {order,campaign}=DisputeMetadataService.context(proof,operatorId,orderId,'RESOLVE');
  // Successful onchain resolution enforces conservation; a corrupt cached allocation cannot veto its receipt.
  const verification=await TransactionVerifier.verifyExpectedTransaction({intentId:'resolve_'+order.id+'_'+txHash,expectedTo:config.hubAddress,expectedSender:config.operatorAddress,expectedFunction:'resolveDispute',expectedEvent:'DisputeResolved',expectedEventArgs:{campaignId:campaign.onchainCampaignId!,orderId:order.onchainOrderId,buyerShare:buyerShareBaseUSDC,sellerShare:sellerShareBaseUSDC}},txHash);
  await IndexerService.projectVerifiedReceipt(verification);return this.recordResolvedMetadata(operatorId,orderId,buyerShareBaseUSDC,sellerShareBaseUSDC,notes,verification,proof);
 }
 public static recordResolvedMetadata(operatorId:string,orderId:string,buyerShareBaseUSDC:string,sellerShareBaseUSDC:string,notes:string,verification:VerificationResult,proof?:SessionProof,operationId?:string){return DisputeMetadataService.record(proof,operatorId,orderId,'RESOLVE',{buyerShare:buyerShareBaseUSDC,sellerShare:sellerShareBaseUSDC,notes},verification,operationId);}
 public static getMessages(orderId:string,proof?:SessionProof):SupportMessageRecord[]{return OrderThreadService.list(proof,orderId);}
 public static addMessage(orderId:string,_senderRole:'buyer'|'seller'|'operator',_senderWallet:string,text:string,proof?:SessionProof):SupportMessageRecord{return OrderThreadService.send(proof,orderId,{text});}
 public static addReview(userId:string,orderId:string,score:number,comment:string,proof?:SessionProof):OrderRecord{if(proof&&proof.account.id!==userId)throw new OrderReviewError('ORDER_REVIEW_FORBIDDEN',403);return OrderReviewService.submit(proof,orderId,{score,comment}).order;}
 public static replyToReview(sellerId:string,orderId:string,sellerResponse:string,proof?:SessionProof):OrderRecord{if(proof&&proof.account.id!==sellerId)throw new OrderReviewError('ORDER_REVIEW_FORBIDDEN',403);return OrderReviewService.reply(proof,orderId,{sellerResponse}).order;}
}
