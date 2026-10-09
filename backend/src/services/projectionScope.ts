import { ethers } from "ethers";
import type { DatabaseSchema } from "../db/store";
import { config } from "../config";

/** Reject a cursor/journal from another deployment rather than silently rewind or repair it. */
export function assertProjectionScope(state: DatabaseSchema): void {
  const checkpoint = state.syncState.lastIndexedBlock;
  if (!Number.isSafeInteger(checkpoint) || checkpoint < 0 || (checkpoint > 0 && checkpoint < Math.max(0,config.deploymentBlock-1))) throw new Error("PROJECTION_SCOPE_INVALID: checkpoint precedes the manifest deployment; prepare a shadow rebuild");
  for (const entry of Object.values(state.eventJournal)) {
    if (entry.chainId !== config.arcChainId || entry.contractAddress.toLowerCase() !== config.hubAddress.toLowerCase()
      || entry.blockNumber < config.deploymentBlock || !ethers.isHexString(entry.txHash,32) || !ethers.isHexString(entry.blockHash,32)
      || entry.evidenceVersion!==2 || !ethers.isHexString(entry.eventDigest,32)) throw new Error("PROJECTION_SCOPE_INVALID: journal provenance does not match the deployment");
  }
  for (const order of Object.values(state.orders)) {
    if (!ethers.isHexString(order.commitmentTxHash || order.txHash,32)) throw new Error("PROJECTION_SCOPE_INVALID: an order lacks a valid commitment receipt; prepare a shadow rebuild");
    if (order.chainId!==config.arcChainId || order.hubAddress?.toLowerCase()!==config.hubAddress.toLowerCase()) throw new Error("PROJECTION_SCOPE_INVALID: order chain/deployment binding is unverified");
    if((order.protocolVersion||1)!==config.protocolVersion)throw new Error("PROJECTION_SCOPE_INVALID: order financial protocol differs from deployment");
  }
  for(const campaign of Object.values(state.campaigns))if(campaign.onchainCampaignId!==undefined&&(campaign.protocolVersion||1)!==config.protocolVersion)throw new Error("PROJECTION_SCOPE_INVALID: campaign financial protocol differs from deployment");
}
