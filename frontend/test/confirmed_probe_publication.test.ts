import assert from 'node:assert/strict';
import {confirmedProbePublication} from '../src/services/confirmedProbePublication';
import {campaignDraftFingerprint} from '../src/services/campaignDraftFingerprint';
import {productDigest} from '../src/services/productStudio';
import type {ProbePending} from '../src/services/campaignProbe';
import {sellerPath,sellerSection} from '../src/services/sellerNavigation';
import {parseAppPath,parseAppHash} from '../src/utils/appRoute';
async function main(){
 const wallet='0x1111111111111111111111111111111111111111',hub='0x2222222222222222222222222222222222222222',scope='5042002:'+hub+':1',terms='0x'+'34'.repeat(32);
 const input={title:'Fixture draft',productVersionId:'fixture-version',deliveryMethod:'FILE_LINK',tiers:[{threshold:1,priceUSDC:'1'},{threshold:2,priceUSDC:'0.8'}],earlyRebateAmountUSDC:'0'},fingerprint=campaignDraftFingerprint(input);
 const pending:ProbePending={schema:1,actorId:'fixture-seller',scope,commandId:'fixture-command',campaignId:'fixture-draft',draftVersion:3,productVersionId:'fixture-version',resourceId:'fixture-resource',method:'FILE_LINK',sha256:'cd'.repeat(32),inputDigest:await productDigest(fingerprint),publishKey:'publish:fixture-draft'};
 const value={draft:{id:pending.campaignId,version:3,protocolVersion:1,resourceId:pending.resourceId,input},publication:{campaign:{id:pending.campaignId,title:'Fixture draft',sellerPayoutWallet:wallet,termsHash:terms,tiers:[{threshold:1,price:'1000000'},{threshold:2,price:'800000'}],durationSeconds:86400},operation:{id:'fixture-operation',action:'PUBLISH',resourceId:pending.campaignId,idempotencyKey:pending.publishKey,chainId:5042002,hubAddress:hub,principal:wallet,phase:'PREPARED',expectedEventArgs:{termsHash:terms,sellerPayoutWallet:wallet}}}};
 let cases=0;assert.deepEqual(await confirmedProbePublication(value,pending,scope,fingerprint),value.publication);cases++;
 const empty=structuredClone(value) as any;empty.publication=null;assert.equal(await confirmedProbePublication(empty,pending,scope,fingerprint),null);cases++;
 const negative:Array<[string,(v:any)=>void]>=[['draft id',v=>v.draft.id='other'],['version',v=>v.draft.version++],['resource',v=>v.draft.resourceId='other'],['product',v=>v.draft.input.productVersionId='other'],['method',v=>v.draft.input.deliveryMethod='LICENSE_KEY'],['terms input',v=>v.draft.input.title='Changed'],['protocol',v=>v.draft.protocolVersion=2],['campaign',v=>v.publication.campaign.id='other'],['command kind',v=>v.publication.operation.action='BUY'],['command target',v=>v.publication.operation.resourceId='other'],['publish key',v=>v.publication.operation.idempotencyKey='publish:other'],['chain',v=>v.publication.operation.chainId=1],['hub',v=>v.publication.operation.hubAddress=wallet],['principal',v=>v.publication.operation.principal=hub],['terms hash',v=>v.publication.operation.expectedEventArgs.termsHash='0x'+'12'.repeat(32)],['payout',v=>v.publication.operation.expectedEventArgs.sellerPayoutWallet=hub],['final operation',v=>v.publication.operation.phase='PROJECTED'],['missing operation',v=>delete v.publication.operation],['partial response',v=>delete v.draft.input]];
 for(const [name,mutate]of negative){const changed=structuredClone(value);mutate(changed);await assert.rejects(()=>confirmedProbePublication(changed,pending,scope,fingerprint),undefined,name);cases++;}
 for(const field of ['tiers','durationSeconds','title']){const changed:any=structuredClone(value);delete changed.publication.campaign[field];await assert.rejects(()=>confirmedProbePublication(changed,pending,scope,fingerprint));cases++;}
 await assert.rejects(()=>confirmedProbePublication(value,pending,scope,fingerprint+'changed'));cases++;
 await assert.rejects(()=>confirmedProbePublication(value,pending,'1:'+hub+':1',fingerprint));cases++;
 assert.equal(sellerPath('TRANSACTIONS'),'/seller/transactions');assert.equal(sellerSection('/seller/transactions'),'TRANSACTIONS');assert.deepEqual(parseAppPath('/seller/transactions'),{kind:'seller-section',view:'transactions'});assert.deepEqual(parseAppHash('#seller/transactions'),{kind:'seller-section',view:'transactions'});cases++;
 console.log(JSON.stringify({result:'CONFIRMED_PROBE_PUBLICATION_AND_HISTORY_ROUTE_CHECKS_PASSED',cases,noNetworkOrStorageMutations:true}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
