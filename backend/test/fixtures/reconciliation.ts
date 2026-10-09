import { ethers } from "ethers";
import { config } from "../../src/config";
import { HUB_ABI } from "../../src/contracts/hubAbi";
import { DatabaseSchema } from "../../src/db/store";
import { CampaignStatus, DeliveryStatus } from "../../../shared/domain.cjs";

/** Immutable chain fixture. Capture BEFORE deliberately corrupting the local projection. */
export function reconciliationProvider(state: DatabaseSchema, balance: bigint, block = 125) {
  const truth: DatabaseSchema = JSON.parse(JSON.stringify(state));
  const iface = new ethers.Interface(HUB_ABI);
  const token = new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);
  const calls: string[] = [];
  const tuple = (fn: string, record: any) => (iface.getFunction(fn)!.outputs[0].components || iface.getFunction(fn)!.outputs).map(c =>
    record[c.name] ?? (c.type === "address" ? ethers.ZeroAddress : c.type === "bytes32" ? ethers.ZeroHash : c.type === "bool" ? false : 0));
  return {
    calls,
    getNetwork: async () => ({ chainId: BigInt(config.arcChainId) }),
    getBlockNumber: async () => block,
    getBlock: async (tag: number) => ({ number: tag, hash: ethers.id(`block-${tag}`), timestamp: 1700000000 + tag }),
    call: async (tx: any) => {
      if (tx.blockTag !== block) throw new Error("Read escaped fixed block");
      if (tx.to.toLowerCase() === config.usdcAddress.toLowerCase()) return token.encodeFunctionResult("balanceOf", [balance]);
      const parsed = iface.parseTransaction({ data: tx.data })!;
      calls.push(parsed.name);
      const id = parsed.args.length ? Number(parsed.args[0]) : 0;
      const c = Object.values(truth.campaigns).find(c => c.onchainCampaignId === id);
      const o = Object.values(truth.orders).find(order=>order.onchainOrderId===id)!;
      let result: any;
      switch (parsed.name) {
        case "nextOrderId": result = Math.max(0, ...Object.values(truth.orders).map(o => o.onchainOrderId)) + 1; break;
        case "nextCampaignId": result = Math.max(0, ...Object.values(truth.campaigns).map(c => c.onchainCampaignId || 0)) + 1; break;
        case "campaignTerms": result = tuple(parsed.name, { ...c, metric: c?.metric === "BUYER_COUNT" ? 0 : 1 }); return iface.encodeFunctionResult(parsed.name, result);
        case "campaignStates": result = tuple(parsed.name, { ...c, status: CampaignStatus.indexOf(c!.status === "PUBLISHED" ? "CREATED" : c!.status as any) }); return iface.encodeFunctionResult(parsed.name, result);
        case "getCampaignTiers": result = c!.tiers; break;
        case "getCampaignOrderIds": result = Object.values(truth.orders).filter(o => o.campaignId === c!.id).map(o => o.onchainOrderId); break;
        case "getOrderDetails": result = tuple(parsed.name, { ...o, orderId: o.onchainOrderId, campaignId: truth.campaigns[o.campaignId].onchainCampaignId, deliveryStatus: DeliveryStatus.indexOf(o.deliveryStatus), deliveryProofHash: o.deliveryProofHash }); break;
        case "buyerClaimedAmount": result = o.buyerClaimedAmount ?? "0"; break;
        default: throw new Error(`Unexpected fixture read ${parsed.name}`);
      }
      return iface.encodeFunctionResult(parsed.name, [result]);
    },
  };
}
