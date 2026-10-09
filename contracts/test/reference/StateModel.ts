/** Independent business model. No contract imports, getters, ABI or implementation helpers. */
export type Kind = "COMMIT" | "ADVANCE" | "FINALIZE" | "DELIVER" | "CONFIRM" | "SETTLE" | "DISPUTE" | "EMERGENCY_DISPUTE" | "RESOLVE" | "BREACH" | "BUYER_CLAIM" | "SELLER_CLAIM" | "CANCEL" | "REBATES" | "TERMS";
export interface Command {
  kind: Kind; campaign: number; caller: number; buyer?: number; quantity?: number;
  orderSlots?: number[]; requireEarly?: boolean; buyerPercent?: number; jump?: number;
  expiredAuth?: boolean; replayNonce?: boolean; wrongSignature?: boolean; wrongSum?: boolean; start?: number; count?: number; newTermsHash?: string;
}
export interface Terms {
  seller: number; metric: 0 | 1; prices: bigint[]; thresholds: bigint[]; maxUnits: bigint;
  inventory: bigint; duration: number; sla: number; earlySlots: number; fixed: bigint; bps: number; termsHash: string;
}
export interface Campaign {
  terms: Terms; status: number; start: number; end: number; finalizedAt: number;
  finalPrice: bigint; tier: number; finalTier: number; earlySlotsUsed: number;
  units: bigint; buyers: bigint; gross: bigint; firstCommitment: number;
  accounts: Map<number, { units: bigint; nonce: bigint; principal: number }>;
  orders: number[];
}
export interface Order {
  id: number; campaign: number; buyer: number; principal: number; quantity: bigint;
  locked: bigint; gross: bigint; early: bigint; isEarly: boolean; rebate: bigint;
  refund: bigint; seller: bigint; buyerPaid: bigint; sellerPaid: bigint;
  buyerClaimed: boolean; sellerClaimed: boolean; status: number; deliveredAt: number;
}
export interface Model {
  now: number; owner: number; operator: number; security: number;
  campaigns: Campaign[]; orders: Order[];
}

export function newCampaign(terms: Terms, start: number): Campaign {
  return { terms, status: 0, start, end: start + terms.duration, finalizedAt: 0, finalPrice: terms.prices[0],
    tier: 0, finalTier: 0, earlySlotsUsed: 0, units: 0n, buyers: 0n, gross: 0n, firstCommitment: 0, accounts: new Map(), orders: [] };
}

/** Clearing price is paid by every unit; only the first early unit can cost less. */
function clearingRebate(order: Order, campaign: Campaign): bigint {
  const firstCost = campaign.finalPrice > order.early ? campaign.finalPrice - order.early : 0n;
  const totalCost = firstCost + campaign.finalPrice * (order.quantity - 1n);
  return order.gross - totalCost;
}
function applyRebate(model: Model, order: Order): void {
  const campaign = model.campaigns[order.campaign];
  if (campaign.finalizedAt && order.rebate === 0n) order.rebate = clearingRebate(order, campaign);
}
function remaining(order: Order): bigint { return order.gross - order.rebate - order.refund - order.seller; }
export function viewOrder(model: Model, original: Order): Order {
  const order = structuredClone(original); applyRebate(model, order);
  if (model.campaigns[order.campaign].status === 3) {
    order.refund += remaining(order);
    if (![2, 4, 5].includes(order.status)) order.status = 4;
  }
  return order;
}
function finalize(campaign: Campaign, now: number): void {
  campaign.status = 2; campaign.finalizedAt = now; campaign.finalTier = campaign.tier; campaign.finalPrice = campaign.terms.prices[campaign.tier];
}
function requirePolicy(value: unknown): asserts value { if (!value) throw new Error("POLICY_REJECTED"); }

/** Atomic prediction: rejected batches cannot persist partial allocations or withdrawals. */
export function predict(original: Model, command: Command, at: number): { accepted: boolean; model: Model } {
  const model: Model = structuredClone(original); model.now = at;
  const campaign = model.campaigns[command.campaign], terms = campaign.terms;
  const order = command.orderSlots?.length ? model.orders[command.orderSlots[0]] : undefined;
  const buyer = command.buyer ?? 0;
  try {
    switch (command.kind) {
      case "ADVANCE": break;
      case "COMMIT": {
        const quantity = BigInt(command.quantity ?? 1), account = campaign.accounts.get(buyer);
        requirePolicy(quantity > 0n && !command.expiredAuth && !command.replayNonce);
        requirePolicy([0, 1].includes(campaign.status) && at >= campaign.start && at <= campaign.end);
        const oldUnits = account?.units ?? 0n;
        requirePolicy(oldUnits + quantity <= terms.maxUnits && (!terms.inventory || campaign.units + quantity <= terms.inventory));
        requirePolicy(!account || account.principal === command.caller);
        const isEarly = terms.earlySlots > 0 && oldUnits === 0n && campaign.earlySlotsUsed < terms.earlySlots;
        requirePolicy(!terms.earlySlots || !command.requireEarly || isEarly);
        const locked = terms.prices[campaign.tier];
        let early = isEarly ? terms.fixed || locked * BigInt(terms.bps) / 10000n : 0n;
        if (early > locked) early = locked;
        const id = model.orders.length + 1;
        model.orders.push({ id, campaign: command.campaign, buyer, principal: command.caller, quantity, locked, gross: locked * quantity,
          early, isEarly, rebate: 0n, refund: 0n, seller: 0n, buyerPaid: 0n, sellerPaid: 0n,
          buyerClaimed: false, sellerClaimed: false, status: 0, deliveredAt: 0 });
        campaign.orders.push(id - 1); campaign.accounts.set(buyer, { units: oldUnits + quantity, nonce: (account?.nonce ?? 0n) + 1n, principal: command.caller });
        campaign.units += quantity; if (oldUnits === 0n) campaign.buyers++;
        campaign.gross += locked * quantity; if (isEarly) campaign.earlySlotsUsed++;
        if (!campaign.firstCommitment) { campaign.firstCommitment = at; campaign.status = 1; }
        const progress = terms.metric === 0 ? campaign.buyers : campaign.units;
        campaign.tier = terms.thresholds.reduce((best, threshold, index) => progress >= threshold ? index : best, campaign.tier);
        if (terms.inventory && campaign.units === terms.inventory) finalize(campaign, at);
        break;
      }
      case "FINALIZE": requirePolicy([0, 1].includes(campaign.status) && at > campaign.end); finalize(campaign, at); break;
      case "TERMS":
        requirePolicy([terms.seller, model.owner].includes(command.caller) && campaign.status === 0 && campaign.firstCommitment === 0);
        requirePolicy(command.newTermsHash); terms.termsHash = command.newTermsHash; break;
      case "CANCEL": requirePolicy(command.caller === model.security && campaign.status !== 3); campaign.status = 3; break;
      case "REBATES":
        requirePolicy(campaign.status === 2);
        for (const slot of campaign.orders.slice(command.start ?? 0, (command.start ?? 0) + (command.count ?? 1))) applyRebate(model, model.orders[slot]);
        break;
      case "DELIVER":
        requirePolicy(order && order.campaign === command.campaign && [terms.seller, model.operator, model.owner].includes(command.caller));
        requirePolicy(campaign.status === 2 && order.status === 0 && at <= campaign.finalizedAt + terms.sla);
        order.status = 1; order.deliveredAt = at; break;
      case "CONFIRM":
        requirePolicy(order && order.campaign === command.campaign && command.caller === order.principal && campaign.status !== 3 && order.status === 1);
        applyRebate(model, order); order.seller += remaining(order); order.status = 2; break;
      case "SETTLE":
        requirePolicy(order && order.campaign === command.campaign && campaign.status !== 3 && order.status === 1 && at > order.deliveredAt + 172800);
        applyRebate(model, order); order.seller += remaining(order); order.status = 2; break;
      case "DISPUTE":
        requirePolicy(order && order.campaign === command.campaign && command.caller === order.principal && order.status === 1 && at <= order.deliveredAt + 172800);
        order.status = 3; break;
      case "EMERGENCY_DISPUTE":
        requirePolicy(order && order.campaign === command.campaign && order.status === 1 && at <= order.deliveredAt + 172800 && !command.expiredAuth && !command.wrongSignature);
        order.status = 3; break;
      case "RESOLVE":
        requirePolicy(order && order.campaign === command.campaign && [model.operator, model.owner].includes(command.caller) && campaign.status !== 3 && order.status === 3 && !command.wrongSum);
        applyRebate(model, order);
        { const available = remaining(order), refund = available * BigInt(command.buyerPercent ?? 50) / 100n; order.refund += refund; order.seller += available - refund; }
        order.status = 5; break;
      case "BREACH":
        requirePolicy(order && order.campaign === command.campaign && [order.principal, model.operator, model.owner].includes(command.caller));
        requirePolicy(campaign.status === 2 && order.status === 0 && at > campaign.finalizedAt + terms.sla);
        applyRebate(model, order); order.refund += remaining(order); order.status = 4; break;
      case "BUYER_CLAIM": {
        let withdrawn = 0n;
        for (const slot of command.orderSlots ?? []) {
          const candidate = model.orders[slot]; requirePolicy(candidate && candidate.campaign === command.campaign && candidate.principal === command.caller);
          applyRebate(model, candidate);
          if (campaign.status === 3) {
            candidate.refund += remaining(candidate); if (![2, 4, 5].includes(candidate.status)) candidate.status = 4;
          }
          const due = candidate.rebate + candidate.refund - candidate.buyerPaid; requirePolicy(due > 0n);
          candidate.buyerPaid += due; candidate.buyerClaimed = true; withdrawn += due;
        }
        requirePolicy(withdrawn > 0n); break;
      }
      case "SELLER_CLAIM": {
        requirePolicy(command.caller === terms.seller); let withdrawn = 0n;
        for (const slot of command.orderSlots ?? []) {
          const candidate = model.orders[slot]; requirePolicy(candidate && candidate.campaign === command.campaign && !candidate.sellerClaimed && [2, 5].includes(candidate.status));
          if (candidate.seller > 0n) { candidate.sellerPaid = candidate.seller; candidate.sellerClaimed = true; withdrawn += candidate.seller; }
        }
        requirePolicy(withdrawn > 0n); break;
      }
    }
    return { accepted: true, model };
  } catch (error) {
    if ((error as Error).message !== "POLICY_REJECTED") throw error;
    const unchanged = structuredClone(original); unchanged.now = at; return { accepted: false, model: unchanged };
  }
}

export function escrow(model: Model, campaign: number): bigint {
  return model.orders.filter(order => order.campaign === campaign).reduce((sum, order) => sum + order.gross - order.buyerPaid - order.sellerPaid, 0n);
}
