import type { CampaignRecord, DatabaseSchema, OrderRecord } from "../db/store";
import { config } from "../config";

export function inCurrentDeployment(record: {chainId?:number;hubAddress?:string}): boolean {
  return record.chainId===config.arcChainId && record.hubAddress?.toLowerCase()===config.hubAddress.toLowerCase();
}

const validId = (id: string): number => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("Invalid onchain identifier");
  return Number(id);
};

export function campaignForChainId(state:DatabaseSchema,id:string): CampaignRecord | undefined {
  const value=validId(id),matches=Object.values(state.campaigns).filter(record=>record.onchainCampaignId===value&&inCurrentDeployment(record));
  if(matches.length>1)throw new Error("Ambiguous campaign deployment binding");
  return matches[0];
}

export function orderForChainId(state:Pick<DatabaseSchema,"orders">,id:string): OrderRecord | undefined {
  const value=validId(id),matches=Object.values(state.orders).filter(record=>record.onchainOrderId===value&&inCurrentDeployment(record));
  if(matches.length>1)throw new Error("Ambiguous order deployment binding");
  return matches[0];
}

export function projectionId(state:DatabaseSchema,kind:"campaigns"|"orders",id:string): string {
  const mapped=kind==="campaigns"?campaignForChainId(state,id):orderForChainId(state,id);
  if(mapped)return mapped.id;
  if(!state[kind][id])return id;
  const namespaced=`chain-${config.arcChainId}-${config.hubAddress.toLowerCase()}-${id}`;
  if(state[kind][namespaced])throw new Error("Projection namespace is occupied by an unverified binding");
  return namespaced;
}
