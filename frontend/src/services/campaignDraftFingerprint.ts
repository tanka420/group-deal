import { ethers } from "ethers";

/** Equality of editable terms, including public metadata; not a financial/chain hash. */
export function campaignDraftFingerprint(input: Record<string, unknown>): string {
  const amount=(value:unknown)=>{try{return ethers.parseUnits(String(value),6).toString();}catch{return String(value);}};
  const normalized={...input,earlyRebateAmountUSDC:amount(input.earlyRebateAmountUSDC),tiers:Array.isArray(input.tiers)?input.tiers.map(tier=>({...tier,priceUSDC:amount(tier.priceUSDC)})):input.tiers};
  return JSON.stringify(normalized,Object.keys(normalized).concat("threshold","priceUSDC").sort());
}
