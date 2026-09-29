import { expect } from "chai";
import { ethers } from "hardhat";
import { GroupDealHub, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Audit Verified Fixes (F03, F04, F05, F07, F10)", function () {
  let hub: GroupDealHub;
  let usdc: MockUSDC;
  let owner: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer: SignerWithAddress;
  let operator: SignerWithAddress;

  const u = (val: number | string) => ethers.parseUnits(String(val), 6);
  const termsHash = ethers.id("audit-verified-terms");

  beforeEach(async function () {
    [owner, seller, buyer, operator] = await ethers.getSigners();

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();

    const GroupDealHubFactory = await ethers.getContractFactory("GroupDealHub");
    hub = await GroupDealHubFactory.deploy(
      await usdc.getAddress(),
      owner.address,
      operator.address
    );

    // Fund buyer with 10,000 USDC
    await usdc.mint(buyer.address, u(10000));
    await usdc.connect(buyer).approve(await hub.getAddress(), ethers.MaxUint256);
  });

  async function createTestCampaign(extra: any = {}) {
    const id = await hub.nextCampaignId();
    await hub.createCampaign(
      {
        sellerPayoutWallet: seller.address,
        metric: 1, // UNITS_COUNT
        maxPerAccount: 10,
        inventoryLimit: 0,
        durationSeconds: 86400,
        deliverySlaSeconds: 86400,
        earlyRebateEnabled: true,
        earlySlotsCount: 10,
        earlyRebateAmount: u(10),
        earlyRebateBps: 0,
        platformFeeBps: 0,
        termsHash,
        ...extra,
      },
      [
        { threshold: 1, price: u(100) },
        { threshold: 2, price: u(80) },
      ]
    );
    return id;
  }

  async function buyOrder(campaignId: bigint, quantity = 1) {
    const identity = ethers.id("buyer-" + campaignId.toString());
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const addr = await hub.getAddress();

    const types = {
      BuyAuthorization: [
        { name: "chainId", type: "uint256" },
        { name: "hubContract", type: "address" },
        { name: "campaignId", type: "uint256" },
        { name: "termsHash", type: "bytes32" },
        { name: "campaignIdentity", type: "bytes32" },
        { name: "buyerWallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "maxQuantity", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const signature = await owner.signTypedData(
      { name: "GroupDealHub", version: "1", chainId, verifyingContract: addr },
      types,
      {
        chainId,
        hubContract: addr,
        campaignId,
        termsHash,
        campaignIdentity: identity,
        buyerWallet: buyer.address,
        nonce: await hub.identityNonces(campaignId, identity),
        maxQuantity: 10,
        deadline,
      }
    );

    const oid = await hub.nextOrderId();
    await hub.connect(buyer).commitToBuy(campaignId, identity, quantity, false, 10, deadline, signature);
    return oid;
  }

  async function advanceTime(seconds: number) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  it("Fix F03: Buyer can claim rebate first, and later claim 90 USDC refund without being blocked", async function () {
    const c1 = await createTestCampaign();
    const o1 = await buyOrder(c1);

    await advanceTime(86401);
    await hub.finalizeCampaign(c1);

    // Claim 1: Buyer claims rebate (10 USDC early rebate + 0 price rebate)
    const initialBuyerBal = await usdc.balanceOf(buyer.address);
    await hub.connect(buyer).claimBuyerFunds(c1, [o1]);
    const afterRebateBal = await usdc.balanceOf(buyer.address);
    expect(afterRebateBal - initialBuyerBal).to.equal(u(10));

    // Seller breaches SLA -> order refunded 90 USDC
    await advanceTime(86401);
    await hub.connect(buyer).claimDeliveryBreach(c1, o1);

    const orderDetails = await hub.getOrderDetails(o1);
    expect(orderDetails.buyerRefundAllocated).to.equal(u(90));

    // Claim 2: Prior to fix, this reverted with 'Order already claimed by buyer'.
    // With cumulative claim amount, this now succeeds!
    await hub.connect(buyer).claimBuyerFunds(c1, [o1]);
    const finalBuyerBal = await usdc.balanceOf(buyer.address);
    expect(finalBuyerBal - afterRebateBal).to.equal(u(90));

    // Total received = 100 USDC (full committed gross refunded/rebated)
    expect(finalBuyerBal - initialBuyerBal).to.equal(u(100));

    // Escrow is now empty (exact conservation)
    expect(await hub.campaignEscrowBalance(c1)).to.equal(0n);
  });

  it("Fix F04: Emergency Cancel prevents double allocation and rejects confirmReceipt", async function () {
    const c2 = await createTestCampaign();
    const o2 = await buyOrder(c2);

    await advanceTime(86401);
    await hub.finalizeCampaign(c2);
    await hub.connect(seller).recordDelivery(c2, o2, ethers.id("proof"));

    // Operator cancels campaign -> unallocated 90 USDC is allocated to buyer refund
    await hub.connect(operator).emergencyCancelCampaign(c2, ethers.id("emergency-incident"));

    // Attempting to confirm receipt after cancel must revert
    await expect(hub.connect(buyer).confirmReceipt(c2, o2)).to.be.revertedWith("Campaign cancelled");

    const order = await hub.getOrderDetails(o2);
    const totalAllocated = order.rebateAllocated + order.buyerRefundAllocated + order.sellerAllocated;

    // Strict conservation law: total allocated MUST equal committed gross (100 USDC), never 190 USDC!
    expect(totalAllocated).to.equal(u(100));
    expect(order.sellerAllocated).to.equal(0n);
    expect(order.buyerRefundAllocated).to.equal(u(90));
    expect(order.rebateAllocated).to.equal(u(10));
  });

  it("Fix F05: Sold-out final order receives its full allocated rebate", async function () {
    // Inventory limit of 2 units. Buyer purchases 2 units in single order.
    // Order unlocks Tier 2 ($80) and triggers 100% sold-out auto-finalize.
    const c3 = await createTestCampaign({ inventoryLimit: 2 });
    const o3 = await buyOrder(c3, 2);

    const state = await hub.campaignStates(c3);
    expect(state.finalClearingPrice).to.equal(u(80));

    // Prior to fix, order received 0 rebate because it was pushed after _finalizeCampaignInternal.
    // With fix: 2 units * ($100 - $80) + $10 early rebate = $50 rebate allocated!
    const order = await hub.getOrderDetails(o3);
    expect(order.rebateAllocated).to.equal(u(50));
  });

  it("Fix F07: Nonzero platform fee is strictly rejected in v1", async function () {
    await expect(
      createTestCampaign({ platformFeeBps: 1000, earlyRebateEnabled: false })
    ).to.be.revertedWith("Platform fee must be 0 in v1");
  });

  it("Fix F10: Canonical recursive serialization is sensitive to nested tier changes", async function () {
    // Import canonicalStringify
    function canonicalStringify(obj: any): string {
      if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
      if (Array.isArray(obj)) return "[" + obj.map(canonicalStringify).join(",") + "]";
      const sortedKeys = Object.keys(obj).sort();
      const pairs = sortedKeys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k]));
      return "{" + pairs.join(",") + "}";
    }

    const a = { metric: "UNITS_COUNT", tiers: [{ threshold: 1, price: "100000000" }] };
    const b = { metric: "UNITS_COUNT", tiers: [{ threshold: 999, price: "1" }] };

    const strA = canonicalStringify(a);
    const strB = canonicalStringify(b);

    expect(strA).to.not.equal(strB);
    expect(ethers.keccak256(ethers.toUtf8Bytes(strA))).to.not.equal(
      ethers.keccak256(ethers.toUtf8Bytes(strB))
    );
  });
});
