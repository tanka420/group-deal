import {campaignDraftFingerprint} from './campaignDraftFingerprint';
import {productDigest} from './productStudio';
import {probeChanged,type ProbePending} from './campaignProbe';
import type {CampaignDraftForChain} from '../context/Web3Context';
import type {TransactionOperation} from './transactionOperations';

type Publication={campaign:CampaignDraftForChain&{title:string};operation:TransactionOperation};
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** A completed probe may reopen only its existing, bound publication. This function never writes. */
export async function confirmedProbePublication(value:unknown,pending:ProbePending,scope:string,editorFingerprint:string):Promise<Publication|null>{
 const [chain,hub,protocol]=scope.split(':'),v=object(value)?value:null,d=v?.draft;
 if(pending.scope!==scope||!object(d)||d.id!==pending.campaignId||d.version!==pending.draftVersion||(d.protocolVersion??1)!==Number(protocol)||d.resourceId!==pending.resourceId||!object(d.input)||d.input.productVersionId!==pending.productVersionId||d.input.deliveryMethod!==pending.method||await productDigest(campaignDraftFingerprint(d.input))!==pending.inputDigest||await productDigest(editorFingerprint)!==pending.inputDigest)throw probeChanged();
 if(v?.publication===null)return null;
 const publication=v?.publication,c=object(publication)&&publication.campaign,o=object(publication)&&publication.operation;
 if(!object(c)||typeof c.title!=='string'||!c.title.trim()||!Array.isArray(c.tiers)||c.tiers.length<2||c.tiers.length>5||c.tiers.some((t:unknown)=>!object(t)||!Number.isSafeInteger(t.threshold)||t.threshold<1||typeof t.price!=='string'||!/^\d{1,78}$/.test(t.price))||!Number.isSafeInteger(c.durationSeconds)||c.durationSeconds<86400)throw probeChanged();
 if(!object(c)||!object(o)||c.id!==pending.campaignId||typeof c.sellerPayoutWallet!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(c.sellerPayoutWallet)||typeof c.termsHash!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(c.termsHash)||typeof o.id!=='string'||!/^[-A-Za-z0-9:_]{1,180}$/.test(o.id)||o.action!=='PUBLISH'||o.resourceId!==pending.campaignId||o.idempotencyKey!==pending.publishKey||o.chainId!==Number(chain)||typeof o.hubAddress!=='string'||o.hubAddress.toLowerCase()!==hub||typeof o.principal!=='string'||o.principal.toLowerCase()!==c.sellerPayoutWallet.toLowerCase()||!['PREPARED','AWAITING_SIGNATURE','SUBMITTED','UNKNOWN','RECEIPT_VERIFIED'].includes(o.phase)||!object(o.expectedEventArgs)||o.expectedEventArgs.termsHash!==c.termsHash||typeof o.expectedEventArgs.sellerPayoutWallet!=='string'||o.expectedEventArgs.sellerPayoutWallet.toLowerCase()!==o.principal.toLowerCase())throw probeChanged();
 return publication as Publication;
}
