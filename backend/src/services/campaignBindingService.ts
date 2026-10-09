import type {SessionProof} from './sessionService';
import {OperationCompletionService} from './operationCompletionService';
import { ethers } from "ethers";
import { store, CampaignRecord } from "../db/store";
import { HUB_ABI } from "../contracts/hubAbi";
import { VerificationResult } from "./transactionVerifier";
import { config } from "../config";
import { inCurrentDeployment } from "./deploymentBindings";
import {notifyFollowedCampaignPublished} from './followNotifications';

export function campaignCalldata(c: CampaignRecord): string {
  return new ethers.Interface(HUB_ABI).encodeFunctionData("createCampaign", [{
    sellerPayoutWallet:c.sellerPayoutWallet, metric:c.metric === "BUYER_COUNT" ? 0 : 1,
    maxPerAccount:c.maxPerAccount, inventoryLimit:c.inventoryLimit, durationSeconds:c.durationSeconds, deliverySlaSeconds:c.deliverySlaSeconds,
    earlyRebateEnabled:c.earlyRebateEnabled, earlySlotsCount:c.earlySlotsCount, earlyRebateAmount:c.earlyRebateAmount,
    earlyRebateBps:c.earlyRebateBps, platformFeeBps:c.platformFeeBps, termsHash:c.termsHash,
  }, c.tiers]);
}

/** Bind a verified creation receipt without changing the draft ID or private metadata. */
export function bindVerifiedCampaign(draftId:string,verification:VerificationResult,expectedCalldata:string,actor?:string,proof?:SessionProof):CampaignRecord {return OperationCompletionService.bind(draftId,verification,expectedCalldata,actor,proof);}
