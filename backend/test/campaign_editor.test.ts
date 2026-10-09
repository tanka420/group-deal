import {OperationCompletionError} from '../src/domain/operationCompletion';
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { store } from "../src/db/store";
import { CampaignEditorService } from "../src/services/campaignEditorService";
import { OperationService } from "../src/services/operationService";
import { campaignCalldata } from "../src/services/campaignBindingService";
import { reviewedProductVerified } from "./fixtures/product";
import { config } from "../src/config";

async function main(){
const product=await reviewedProductVerified("seller",ethers.Wallet.createRandom().address);
const input={title:"Campaign fixture",description:"Immutable resource terms",thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:"UNITS_COUNT",tiers:[{threshold:1,priceUSDC:"105"},{threshold:10,priceUSDC:"89"}],maxPerAccount:3,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:"FILE_LINK"};
try {
  const first=CampaignEditorService.saveDraft("seller",input,undefined,undefined,"draft:fixture1");
  assert.match(first.id,/^draft_[0-9a-f-]{36}$/);assert.equal(first.onchainCampaignId,undefined);assert.equal(first.startTime,0);
  const count=Object.keys(store.db.campaigns).length,audits=store.db.auditLogs.length;
  const retry=CampaignEditorService.saveDraft("seller",structuredClone(input),undefined,undefined,"draft:fixture1");
  assert.equal(first.id,retry.id);assert.equal(Object.keys(store.db.campaigns).length,count);assert.equal(store.db.auditLogs.length,audits);
  assert.throws(()=>CampaignEditorService.saveDraft("seller",{...input,title:"Changed"},undefined,undefined,"draft:fixture1"),/CONFLICT/);
  assert.throws(()=>CampaignEditorService.saveDraft("seller",{...input,tiers:[{threshold:1,priceUSDC:ethers.formatUnits(ethers.MaxUint256+1n,6)},{threshold:10,priceUSDC:"89"}]}),/uint256/);
  const second=CampaignEditorService.saveDraft("seller",input);assert.notEqual(first.id,second.id);
  for(const invalid of [{tiers:[{threshold:1,priceUSDC:"89"},{threshold:10,priceUSDC:"105"}]},{tiers:[{threshold:2,priceUSDC:"105"},{threshold:10,priceUSDC:"89"}]},{inventoryLimit:2},{earlyRebateEnabled:true,earlySlotsCount:1,earlyRebateAmountUSDC:"89.000001"},{tiers:[{threshold:1,priceUSDC:"105.0000001"},{threshold:10,priceUSDC:"89"}]},{deliveryContentTemplate:"Secret content must be staged in encrypted storage"}])assert.throws(()=>CampaignEditorService.saveDraft("seller",{...input,...invalid}));
  assert.throws(()=>CampaignEditorService.saveDraft("seller",input,first.id,0),/expectedVersion/);
  const edited=CampaignEditorService.saveDraft("seller",{...input,title:"Edited"},first.id,1);assert.equal(edited.draftVersion,2);assert.equal(edited.termsHash,second.termsHash,"Title is descriptive metadata outside the financial/product hash");
  const version=config.protocolVersion;
  try {
    assert.throws(()=>CampaignEditorService.saveDraft("seller",{...input,earlyRebateEnabled:true,earlySlotsCount:1,earlyRebateBps:1000}),/v2 deployment/);
    config.protocolVersion=2;
    const percent=CampaignEditorService.saveDraft("seller",{...input,earlyRebateEnabled:true,earlySlotsCount:1,earlyRebateBps:1000});assert.equal(percent.earlyRebateBps,1000);assert.equal(percent.protocolVersion,2);
    const fixed=CampaignEditorService.saveDraft("seller",{...input,earlyRebateEnabled:true,earlySlotsCount:1,earlyRebateAmountUSDC:"100"});assert.equal(fixed.earlyRebateAmount,"100000000");
    assert.throws(()=>CampaignEditorService.saveDraft("seller",{...input,earlyRebateEnabled:true,earlySlotsCount:1,earlyRebateAmountUSDC:"10",earlyRebateBps:1000}),/choose fixed or percentage/);
    assert.throws(()=>CampaignEditorService.saveDraft("seller",{...input,earlyRebateEnabled:false,earlySlotsCount:1}),/disabled/);
  } finally {config.protocolVersion=version;}
} catch(error) {store.close();throw error;}
// Pin a product snapshot and durable intent; subsequent edits and duplicate intent payloads are refused.
try {
  const draft=CampaignEditorService.saveDraft("seller",input);
  store.transaction(()=>CampaignEditorService.pinProduct("seller",draft));
  const intent={userId:"seller",action:"PUBLISH" as const,resourceId:draft.id,principal:draft.sellerPayoutWallet,idempotencyKey:"publish:fixture1",calldata:campaignCalldata(draft),intentId:"publish_"+draft.id,expectedFunction:"createCampaign",expectedEvent:"CampaignCreated",expectedEventArgs:{termsHash:draft.termsHash}};
  const operation=OperationService.prepare(intent);
  assert.equal(OperationService.prepare({...intent}).id,operation.id);
  assert.throws(()=>OperationService.prepare({...intent,resourceId:"different"}),/CONFLICT/);
  assert.throws(()=>CampaignEditorService.saveDraft("seller",input,draft.id,1),/pins this draft/);
  const hash=ethers.id("broadcast fixture");OperationService.submit("seller",operation.id,hash);OperationService.submit("seller",operation.id,hash);
  assert.throws(()=>OperationService.submit("seller",operation.id,ethers.id("unverified replacement")),/replacement/);
  assert.throws(()=>OperationService.owned("other",operation.id),/FORBIDDEN/);
  assert.throws(()=>OperationService.projected("seller",operation.id),(e:unknown)=>e instanceof OperationCompletionError&&e.code==="OPERATION_CANONICAL_PROJECTION_REQUIRED"&&e.status===409);assert.equal(OperationService.publicOwned("seller",operation.id).phase,"SUBMITTED");
  assert.ok(!JSON.stringify(OperationService.dto(operation)).includes("stagedEntitlementEncrypted"));
  console.log("PASS draft UUIDs, retry idempotency, validation/version races, reviewed snapshot pinning and immutable transaction intents");
} finally {store.close();}

}
void main().catch(()=>{try{store.close();}catch{}console.error("CAMPAIGN_EDITOR_FIXTURE_OR_ASSERTION_FAILED");process.exitCode=1;});
