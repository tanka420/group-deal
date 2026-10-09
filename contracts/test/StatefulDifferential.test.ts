import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import fs from "node:fs";
import path from "node:path";
import { Campaign, Command, Kind, Model, Terms, newCampaign, predict, escrow, viewOrder } from "./reference/StateModel";
import {BackendProjection,BackendDifference} from "./reference/BackendProjection";

const UNIT = 1_000_000n, FUNDING = 1_000_000n * UNIT;
const buyTypes = { BuyAuthorization: [{ name: "chainId", type: "uint256" }, { name: "hubContract", type: "address" }, { name: "campaignId", type: "uint256" }, { name: "termsHash", type: "bytes32" }, { name: "campaignIdentity", type: "bytes32" }, { name: "buyerWallet", type: "address" }, { name: "nonce", type: "uint256" }, { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" }] };
const directory = path.resolve(__dirname, "../../.cache/stateful-fuzz");
const json = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2) + "\n";
const identity = (campaign: number, buyer: number) => ethers.id(`generated-account:${campaign}:${buyer}`);
class DifferentialFailure extends Error {
  constructor(public property: string, detail: string) { super(`${property}: ${detail}`); }
}
function equal(property: string, actual: unknown, expected: unknown): void {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) throw new DifferentialFailure(property, `got ${actual}; expected ${expected}`);
}
function random(seed: number) {
  let state = seed >>> 0 || 1;
  return (max: number) => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % max; };
}
function generatedTerms(seed: number): Terms[] {
  const next = random(seed);
  return [0, 1, 2].map(campaign => {
    const first = BigInt(50 + next(151)) * UNIT + BigInt(next(17));
    const last = first / BigInt(3 + next(4)), middle = (first + last) / 2n;
    const enabled = campaign !== 2 || seed % 2 === 0, percentage = seed % 3 === campaign;
    return { seller: 4 + campaign % 2, metric: (campaign % 2) as 0 | 1, prices: [first, middle, last], thresholds: [1n, 2n, 4n],
      maxUnits: 5n, inventory: campaign === 0 ? 0n : BigInt(6 + next(5)), duration: 86400, sla: campaign === 1 ? 172800 : 86400,
      earlySlots: enabled ? 1 + next(3) : 0, fixed: enabled && !percentage ? first * BigInt(50 + next(51)) / 100n : 0n,
      bps: enabled && percentage ? 1 + next(10000) : 0, termsHash: ethers.id(`stateful-terms:${seed}:${campaign}`) };
  });
}
async function fixture(seed: number, actualVersion = 2, override?: Terms[]) {
  if (network.name !== "hardhat" || (await ethers.provider.getNetwork()).chainId !== 31337n) throw new Error("Stateful tests require the isolated Hardhat chain; live networks are refused");
  const actors = (await ethers.getSigners()).slice(0, 11);
  const token: any = await (await ethers.getContractFactory("MockUSDC")).deploy();
  const hub: any = await (await ethers.getContractFactory(actualVersion === 2 ? "GroupDealHubV2" : "GroupDealHub")).deploy(await token.getAddress(), actors[7].address, actors[8].address, actors[9].address);
  // MockUSDC's constructor already funds the deployer with exactly FUNDING.
  for (let index = 0; index < actors.length; index++) { if (index !== 0) await token.mint(actors[index].address, FUNDING); await token.connect(actors[index]).approve(await hub.getAddress(), ethers.MaxUint256); }
  const campaigns: Campaign[] = [];
  for (const terms of override ?? generatedTerms(seed)) {
    const transaction = await hub.connect(actors[terms.seller]).createCampaign({ sellerPayoutWallet: actors[terms.seller].address, metric: terms.metric,
      maxPerAccount: terms.maxUnits, inventoryLimit: terms.inventory, durationSeconds: terms.duration, deliverySlaSeconds: terms.sla,
      earlyRebateEnabled: terms.earlySlots > 0, earlySlotsCount: terms.earlySlots, earlyRebateAmount: terms.fixed, earlyRebateBps: terms.bps, platformFeeBps: 0, termsHash: terms.termsHash },
    terms.prices.map((price, index) => ({ threshold: terms.thresholds[index], price })));
    const receipt = await transaction.wait(), block = await ethers.provider.getBlock(receipt.blockNumber);
    if (!block) throw new Error("Fixture block missing");
    // Only transaction time comes from the chain. Financial expectations come from the independent model.
    campaigns.push(newCampaign(terms, block.timestamp));
  }
  const model: Model = { now: await time.latest(), owner: 0, operator: 8, security: 9, campaigns, orders: [] };
  return { seed, actors, token, hub, model };
}
type Context = Awaited<ReturnType<typeof fixture>> & {backend?:BackendProjection};
async function backendFor(context:Context){
  const deployment=await context.hub.deploymentTransaction().wait();
  return new BackendProjection((method,params)=>ethers.provider.send(method,params),{seed:context.seed,hub:await context.hub.getAddress(),token:await context.token.getAddress(),deploymentBlock:deployment.blockNumber,actors:context.actors.map(actor=>actor.address),campaigns:context.model.campaigns.length}).start();
}
type Coverage = { accepted: Record<string, number>; rejected: Record<string, number>; transitions: number; additionalBuyerClaims: number; cancelledAfterAllocation: number; maximumOrders: number };
const coverage = (): Coverage => ({ accepted: {}, rejected: {}, transitions: 0, additionalBuyerClaims: 0, cancelledAfterAllocation: 0, maximumOrders: 0 });

async function check(context: Context): Promise<void> {
  const { model, hub, token, actors } = context;
  let balance = 0n;
  for (let index = 0; index < model.campaigns.length; index++) {
    const campaign = model.campaigns[index], state = await hub.campaignStates(index + 1), terms = await hub.campaignTerms(index + 1);
    for (const [field, expected] of Object.entries({ status: campaign.status, startTime: campaign.start, endTime: campaign.end, finalizedAt: campaign.finalizedAt,
      finalClearingPrice: campaign.finalPrice, currentUnlockedTier: campaign.tier, finalTierIndex: campaign.finalTier, totalUnitsCommitted: campaign.units,
      totalBuyerCount: campaign.buyers, totalGrossCommitted: campaign.gross, earlySlotsTaken: campaign.earlySlotsUsed, firstCommitmentTime: campaign.firstCommitment,
      totalSellerClaimable: model.orders.filter(order => order.campaign === index).reduce((sum, order) => sum + order.seller, 0n),
      totalSellerClaimed: model.orders.filter(order => order.campaign === index).reduce((sum, order) => sum + order.sellerPaid, 0n) })) equal("campaign." + field, state[field], expected);
    equal("campaign.termsHash", terms.termsHash, campaign.terms.termsHash);
    equal("campaign.seller", terms.sellerPayoutWallet, actors[campaign.terms.seller].address);
    const ids = await hub.getCampaignOrderIds(index + 1); equal("campaign.orderIds", ids.map(String).join(), campaign.orders.map(slot => slot + 1).join());
    for (let buyer = 0; buyer < 4; buyer++) {
      const account = campaign.accounts.get(buyer), key = identity(index, buyer);
      equal("identity.units", await hub.buyerUnitsCommitted(index + 1, key), account?.units ?? 0n);
      equal("identity.nonce", await hub.identityNonces(index + 1, key), account?.nonce ?? 0n);
      equal("identity.principal", await hub.campaignIdentityPrincipals(index + 1, key), account ? actors[account.principal].address : ethers.ZeroAddress);
    }
    const expectedEscrow = escrow(model, index); equal("campaign.escrow", await hub.campaignEscrowBalance(index + 1), expectedEscrow);
    if (expectedEscrow < 0n) throw new DifferentialFailure("campaign.nonnegative", "negative escrow"); balance += expectedEscrow;
  }
  for (const stored of model.orders) {
    const expected = viewOrder(model, stored), actual = await hub.getOrderDetails(stored.id);
    for (const [field, value] of Object.entries({ campaignId: expected.campaign + 1, orderId: expected.id, campaignIdentity: identity(expected.campaign, expected.buyer),
      buyerPrincipal: actors[expected.principal].address, quantity: expected.quantity, lockedUnitPrice: expected.locked, committedGross: expected.gross,
      isEarlySupporter: expected.isEarly, earlyRebateValue: expected.early, rebateAllocated: expected.rebate, buyerRefundAllocated: expected.refund,
      sellerAllocated: expected.seller, deliveryStatus: expected.status, deliveryTimestamp: expected.deliveredAt, buyerClaimed: expected.buyerClaimed, sellerClaimed: expected.sellerClaimed })) equal("order." + field, actual[field], value);
    equal("order.buyerCumulativeClaim", await hub.buyerClaimedAmount(stored.id), stored.buyerPaid);
    const unallocated = expected.gross - expected.rebate - expected.refund - expected.seller;
    if ([unallocated, expected.rebate, expected.refund, expected.seller, expected.rebate + expected.refund - stored.buyerPaid, expected.seller - stored.sellerPaid].some(value => value < 0n)) throw new DifferentialFailure("order.nonnegative", "allocation/claim exceeds remaining funds");
  }
  equal("global.solvency", await token.balanceOf(await hub.getAddress()), balance);
  for (let actor = 0; actor < actors.length; actor++) {
    const buyerDelta = model.orders.filter(order => order.principal === actor).reduce((sum, order) => sum - order.gross + order.buyerPaid, 0n);
    const sellerDelta = model.orders.filter(order => model.campaigns[order.campaign].terms.seller === actor).reduce((sum, order) => sum + order.sellerPaid, 0n);
    equal("wallet.tokenBalance", await token.balanceOf(actors[actor].address), FUNDING + buyerDelta + sellerDelta);
  }
  equal("clock", await time.latest(), model.now);
  if(context.backend)try{await context.backend.check(model);}catch(error){if(error instanceof BackendDifference)throw new DifferentialFailure(error.property,error.message);throw error;}
}

async function perform(context: Context, command: Command, stats: Coverage): Promise<void> {
  const before = context.model, at = before.now + (command.kind === "ADVANCE" ? command.jump ?? 1 : 1);
  const predicted = predict(before, command, at), { hub, actors } = context, signer = actors[command.caller], campaignId = command.campaign + 1;
  const orderId = (command.orderSlots?.[0] ?? 999) + 1, options = { gasLimit: 5_000_000 };
  let receipt: any, accepted = false;
  if (command.kind === "ADVANCE") { await time.increaseTo(at); accepted = true; }
  else {
    await time.setNextBlockTimestamp(at);
    try {
      let transaction: any;
      switch (command.kind) {
        case "COMMIT": {
          const campaign = before.campaigns[command.campaign], buyer = command.buyer ?? 0, account = campaign.accounts.get(buyer);
          const nonce = account?.nonce ?? 0n, signedNonce = command.replayNonce ? nonce === 0n ? 1n : nonce - 1n : nonce;
          const maximum = (account?.units ?? 0n) + BigInt(command.quantity ?? 1), deadline = command.expiredAuth ? at - 1 : at + 3600;
          const address = await hub.getAddress(), signature = await actors[7].signTypedData({ name: "GroupDealHub", version: "1", chainId: 31337n, verifyingContract: address }, buyTypes,
            { chainId: 31337n, hubContract: address, campaignId, termsHash: campaign.terms.termsHash, campaignIdentity: identity(command.campaign, buyer), buyerWallet: signer.address, nonce: signedNonce, maxQuantity: maximum, deadline });
          transaction = await hub.connect(signer).commitToBuy(campaignId, identity(command.campaign, buyer), command.quantity ?? 1, command.requireEarly ?? false, maximum, deadline, signature, options); break;
        }
        case "FINALIZE": transaction = await hub.connect(signer).finalizeCampaign(campaignId, options); break;
        case "DELIVER": transaction = await hub.connect(signer).recordDelivery(campaignId, orderId, ethers.id("generated delivery proof"), options); break;
        case "CONFIRM": transaction = await hub.connect(signer).confirmReceipt(campaignId, orderId, options); break;
        case "SETTLE": transaction = await hub.connect(signer).settleUndisputedOrder(campaignId, orderId, options); break;
        case "DISPUTE": transaction = await hub.connect(signer).openDispute(campaignId, orderId, ethers.id("generated dispute reason"), options); break;
        case "EMERGENCY_DISPUTE": {
          const order = before.orders[command.orderSlots?.[0] ?? 999], principal = command.wrongSignature ? actors[order?.principal === 10 ? 6 : 10] : actors[order?.principal ?? 1];
          const address = await hub.getAddress(), deadline = command.expiredAuth ? at - 1 : at + 3600, reasonHash = ethers.id("generated emergency reason");
          const signature = await principal.signTypedData({ name: "GroupDealHub", version: "1", chainId: 31337n, verifyingContract: address },
            { EmergencyDispute: [{ name: "chainId", type: "uint256" }, { name: "hubContract", type: "address" }, { name: "campaignId", type: "uint256" }, { name: "orderId", type: "uint256" }, { name: "reasonHash", type: "bytes32" }, { name: "deadline", type: "uint256" }] },
            { chainId: 31337n, hubContract: address, campaignId, orderId, reasonHash, deadline });
          transaction = await hub.connect(signer).emergencyOpenDisputeWithSignature(campaignId, orderId, reasonHash, deadline, signature, options); break;
        }
        case "RESOLVE": {
          const order = before.orders[command.orderSlots?.[0] ?? 999], view = order ? viewOrder(before, order) : undefined;
          const available = view ? view.gross - view.rebate - view.refund - view.seller : 0n, refund = available * BigInt(command.buyerPercent ?? 50) / 100n;
          transaction = await hub.connect(signer).resolveDispute(campaignId, orderId, refund, available - refund + (command.wrongSum ? 1n : 0n), options); break;
        }
        case "BREACH": transaction = await hub.connect(signer).claimDeliveryBreach(campaignId, orderId, options); break;
        case "BUYER_CLAIM": transaction = await hub.connect(signer).claimBuyerFunds(campaignId, (command.orderSlots ?? []).map(slot => slot + 1), options); break;
        case "SELLER_CLAIM": transaction = await hub.connect(signer).claimSellerProceeds(campaignId, (command.orderSlots ?? []).map(slot => slot + 1), options); break;
        case "CANCEL": transaction = await hub.connect(signer).emergencyCancelCampaign(campaignId, ethers.id("generated cancellation"), options); break;
        case "REBATES": transaction = await hub.connect(signer).allocateRebatesBatch(campaignId, command.start ?? 0, command.count ?? 1, options); break;
        case "TERMS": transaction = await hub.connect(signer).updateTermsBeforeFirstCommitment(campaignId, command.newTermsHash ?? ethers.ZeroHash, options); break;
      }
      receipt = await transaction.wait(); accepted = true;
    } catch (error) {
      if (!/revert|VM Exception/i.test((error as Error).message)) throw error;
      if (predicted.accepted) throw new DifferentialFailure("transition.acceptance", `${command.kind} unexpectedly reverted: ${(error as Error).message}`);
    }
  }
  if (accepted !== predicted.accepted) throw new DifferentialFailure("transition.rejection", `${command.kind} unexpectedly accepted`);
  context.model = predicted.model;
  stats.transitions++; stats.maximumOrders = Math.max(stats.maximumOrders, context.model.orders.length);
  const counts = accepted ? stats.accepted : stats.rejected; counts[command.kind] = (counts[command.kind] ?? 0) + 1;
  if (accepted && command.kind === "BUYER_CLAIM" && (command.orderSlots ?? []).some(slot => before.orders[slot].buyerPaid > 0n && context.model.orders[slot].buyerPaid > before.orders[slot].buyerPaid)) stats.additionalBuyerClaims++;
  if (accepted && command.kind === "CANCEL" && before.orders.some(order => order.campaign === command.campaign && order.seller + order.rebate + order.refund > 0n)) stats.cancelledAfterAllocation++;
  if (receipt && ["BUYER_CLAIM", "SELLER_CLAIM"].includes(command.kind)) {
    const events = receipt.logs.map((log: any) => { try { return hub.interface.parseLog(log); } catch { return null; } }).filter((event: any) => event?.name === "FundsClaimed");
    equal("claim.eventCount", events.length, 1); const event = events[0];
    const buyer = command.kind === "BUYER_CLAIM", sum = context.model.orders.reduce((total, order, index) => total + (buyer ? order.buyerPaid - before.orders[index].buyerPaid : order.sellerPaid - before.orders[index].sellerPaid), 0n);
    equal("claim.eventAmount", event.args.amount, sum); equal("claim.eventType", event.args.claimType, buyer ? 0 : 2); equal("claim.eventRecipient", event.args.recipient, signer.address);
  }
  await check(context);
}

function nextCommand(model: Model, next: (max: number) => number): Command {
  const choices: Kind[] = ["DELIVER", "DELIVER", "CONFIRM", "SETTLE", "DISPUTE", "EMERGENCY_DISPUTE", "RESOLVE", "RESOLVE", "BREACH", "BUYER_CLAIM", "BUYER_CLAIM", "SELLER_CLAIM", "REBATES", "TERMS", "COMMIT"];
  const kind = choices[next(choices.length)], candidates = model.orders.filter(order => kind === "DELIVER" || kind === "BREACH" ? order.status === 0 : ["CONFIRM", "SETTLE", "DISPUTE", "EMERGENCY_DISPUTE"].includes(kind) ? order.status === 1 : kind === "RESOLVE" ? order.status === 3 : kind === "SELLER_CLAIM" ? [2, 5].includes(order.status) : true);
  const order = candidates.length ? candidates[next(candidates.length)] : model.orders.length ? model.orders[next(model.orders.length)] : undefined;
  const campaign = order?.campaign ?? next(model.campaigns.length), terms = model.campaigns[campaign].terms;
  let caller = kind === "DELIVER" || kind === "SELLER_CLAIM" || kind === "TERMS" ? terms.seller : kind === "RESOLVE" ? model.operator : ["SETTLE", "EMERGENCY_DISPUTE"].includes(kind) ? 10 : order?.principal ?? next(4);
  if (next(5) === 0) caller = 10;
  const slots = [order ? order.id - 1 : 999];
  // Invalid repeated/wrong-campaign claim lists must roll back the whole batch.
  if (kind.includes("CLAIM") && next(4) === 0) { const foreign = model.orders.find(candidate => candidate.campaign !== campaign); slots.push(next(2) ? slots[0] : foreign ? foreign.id - 1 : 999); }
  return { kind, campaign, caller, buyer: order?.buyer ?? next(4), orderSlots: slots, quantity: 1 + next(4), requireEarly: next(3) === 0,
    buyerPercent: next(101), wrongSum: next(5) === 0, wrongSignature: next(5) === 0, expiredAuth: next(6) === 0, replayNonce: next(6) === 0,
    start: next(Math.max(1, model.campaigns[campaign].orders.length + 1)), count: next(6), newTermsHash: ethers.id("generated changed terms") };
}
async function generated(context: Context, seed: number, steps: number, trace: Command[]): Promise<{ trace: Command[]; stats: Coverage }> {
  const next = random(seed), stats = coverage();
  const step = async (command: Command) => { trace.push(command); await perform(context, command, stats); };
  for (let campaign = 0; campaign < 3; campaign++) await step({ kind: "TERMS", campaign, caller: context.model.campaigns[campaign].terms.seller, newTermsHash: ethers.id(`generated revised terms:${seed}:${campaign}`) });
  for (let index = 0; index < 18; index++) {
    const campaign = next(3), buyer = next(4);
    await step({ kind: "COMMIT", campaign, caller: next(8) ? buyer : 10, buyer, quantity: 1 + next(4), requireEarly: next(4) === 0, expiredAuth: next(12) === 0, replayNonce: next(12) === 0 });
  }
  await step({ kind: "ADVANCE", campaign: 0, caller: 0, jump: 86401 });
  for (let campaign = 0; campaign < 3; campaign++) await step({ kind: "FINALIZE", campaign, caller: 10 });
  // Withdraw generated rebates first; later resolutions/cancel/breach can add another refund.
  for (const order of context.model.orders) await step({ kind: "BUYER_CLAIM", campaign: order.campaign, caller: order.principal, orderSlots: [order.id - 1] });
  for (let index = 0; index < steps; index++) await step(nextCommand(context.model, next));
  const cancelCampaign = next(3); await step({ kind: "CANCEL", campaign: cancelCampaign, caller: context.model.security });
  await step({ kind: "ADVANCE", campaign: 0, caller: 0, jump: 172801 });
  for (let index = 0; index < steps; index++) await step(nextCommand(context.model, next));
  // Drain whatever the specification now permits, and retry to exercise atomic rejection.
  for (const order of context.model.orders) {
    await step({ kind: "BREACH", campaign: order.campaign, caller: order.principal, orderSlots: [order.id - 1] });
    await step({ kind: "BUYER_CLAIM", campaign: order.campaign, caller: order.principal, orderSlots: [order.id - 1] });
    await step({ kind: "SELLER_CLAIM", campaign: order.campaign, caller: context.model.campaigns[order.campaign].terms.seller, orderSlots: [order.id - 1] });
  }
  return { trace, stats };
}

/** Delta debugging plus individual deletion: result is 1-minimal for the same property. */
async function minimize(trace: Command[], fails: (candidate: Command[]) => Promise<boolean>): Promise<Command[]> {
  let result = [...trace], chunk = Math.max(1, Math.floor(result.length / 2));
  while (chunk >= 1) {
    let reduced = false;
    for (let start = 0; start < result.length; start += chunk) {
      const candidate = result.slice(0, start).concat(result.slice(start + chunk));
      if (await fails(candidate)) { result = candidate; reduced = true; break; }
    }
    if (!reduced) chunk = Math.floor(chunk / 2);
  }
  return result;
}
function emit(name: string, record: unknown): void { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, name), json(record)); }

describe("WP26 local stateful differential generator", function () {
  this.timeout(180_000);
  const supplied = process.env.GROUPDEAL_FUZZ_SEED, steps = Number(process.env.GROUPDEAL_FUZZ_STEPS ?? 28);
  if (!Number.isSafeInteger(steps) || steps < 16 || steps > 256 || supplied && !/^\d{1,10}$/.test(supplied)) throw new Error("Use an integer seed and 16–256 steps per phase");
  const seeds = supplied ? [Number(supplied)] : [1, 7, 19, 73, 311, 7331, 65537, 0x79b1];
  for (const seed of seeds) it(`replays seed ${seed} against three campaigns, four identities and independent financial state`, async () => {
    const context:Context = await fixture(seed), snapshot = await takeSnapshot(), initial = structuredClone(context.model),integrated=process.env.GROUPDEAL_FUZZ_BACKEND==="1";
    let trace: Command[] = [];
    try {
      if(integrated)context.backend=await backendFor(context);
      await check(context); const result = await generated(context, seed, steps, trace);
      if(context.backend)await context.backend.rebuild();
      emit(`${integrated?"projection-":""}seed-${seed}.json`, { schemaVersion: 1, layer: integrated?"LOCAL_CONTRACT_BACKEND_DIFFERENTIAL":"LOCAL_STATEFUL_DIFFERENTIAL", acceptanceEligible: false, seed, stepsPerPhase: steps, result: "PASS", stats: result.stats, backend:context.backend?.stats, terms: initial.campaigns.map(campaign => campaign.terms), trace });
      console.log(`PASS LOCAL_STATEFUL seed=${seed} transitions=${result.stats.transitions} orders=${result.stats.maximumOrders} additionalBuyerClaims=${result.stats.additionalBuyerClaims}`);
    } catch (error) {
      if(context.backend){await context.backend.close();context.backend=undefined;}
      let minimal: Command[] | undefined;
      if (error instanceof DifferentialFailure) {
        const property = error.property;
        minimal = await minimize(trace, async candidate => {
          await snapshot.restore(); context.model = structuredClone(initial);
          try {if(integrated)context.backend=await backendFor(context);await check(context); for (const command of candidate) await perform(context, command, coverage()); return false; }
          catch (replayError) { if (replayError instanceof DifferentialFailure) return replayError.property === property; throw replayError; }
          finally{if(context.backend){await context.backend.close();context.backend=undefined;}}
        });
      }
      emit(`${integrated?"projection-":""}seed-${seed}-failed.json`, { layer: integrated?"LOCAL_CONTRACT_BACKEND_DIFFERENTIAL":"LOCAL_STATEFUL_DIFFERENTIAL", acceptanceEligible: false, seed, stepsPerPhase: steps, result: "FAIL", property: error instanceof DifferentialFailure ? error.property : "infrastructure", message: (error as Error).message, terms: initial.campaigns.map(campaign => campaign.terms), trace, minimalTrace: minimal });
      await snapshot.restore(); context.model = structuredClone(initial); throw error;
    }finally{if(context.backend)await context.backend.close();}
  });
  it("detects the deliberate first-unit cap bug in v1 code and shrinks to a 1-minimal counterexample", async () => {
    const terms: Terms = { seller: 4, metric: 1, prices: [100n * UNIT, 20n * UNIT], thresholds: [1n, 2n], maxUnits: 5n, inventory: 0n, duration: 86400, sla: 86400, earlySlots: 1, fixed: 90n * UNIT, bps: 0, termsHash: ethers.id("cap mutation fixture") };
    // Executable wrong implementation: v1 allows the early benefit to discount a second unit.
    const context = await fixture(0x79b1, 1, [terms]), initial = structuredClone(context.model), snapshot = await takeSnapshot();
    const noisy: Command[] = [{ kind: "REBATES", campaign: 0, caller: 10, start: 0, count: 1 },
      { kind: "COMMIT", campaign: 0, caller: 1, buyer: 1, quantity: 2 }, { kind: "ADVANCE", campaign: 0, caller: 0, jump: 86401 },
      { kind: "TERMS", campaign: 0, caller: 10, newTermsHash: ethers.id("irrelevant noise") }, { kind: "FINALIZE", campaign: 0, caller: 10 }];
    const fails = async (candidate: Command[]) => {
      await snapshot.restore(); context.model = structuredClone(initial);
      try { for (const command of candidate) await perform(context, command, coverage()); return false; }
      catch (error) { if (error instanceof DifferentialFailure) return error.property === "order.rebateAllocated"; throw error; }
    };
    expect(await fails(noisy)).to.equal(true);
    const minimal = await minimize(noisy, fails); expect(minimal.length).to.equal(3); expect(await fails(minimal)).to.equal(true);
    for (let index = 0; index < minimal.length; index++) expect(await fails(minimal.filter((_, slot) => slot !== index))).to.equal(false);
    emit("deliberate-cap-bug-minimal.json", { layer: "LOCAL_DELIBERATE_BUG", acceptanceEligible: false, expectedDetection: true, seed: 0x79b1, actualVersion: 1, terms: initial.campaigns.map(campaign => campaign.terms), mutation: "v1 implementation compared to v2 first-unit business model", property: "order.rebateAllocated", originalLength: noisy.length, minimalLength: minimal.length, deletionMinimal: true, trace: minimal });
    console.log("PASS LOCAL_DELIBERATE_BUG first-unit-cap detected; 5 commands shrunk to 3; every single deletion stops the same failure");
  });
});
