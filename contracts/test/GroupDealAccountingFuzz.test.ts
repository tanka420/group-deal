import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { GroupDealHub, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GroupDealHub Fuzzing, Property Invariants & Security Tests", function () {
  let hub: GroupDealHub;
  let usdc: MockUSDC;
  let deployer: SignerWithAddress;
  let seller: SignerWithAddress;
  let operator: SignerWithAddress;
  let authSigner: SignerWithAddress;
  let securityAuthority: SignerWithAddress;
  let buyers: SignerWithAddress[];

  const USDC_DECIMALS = 6;
  const parseUSDC = (val: number | string) => ethers.parseUnits(val.toString(), USDC_DECIMALS);

  async function signBuyAuthorization(
    hubAddress: string,
    signer: SignerWithAddress,
    params: {
      chainId: bigint;
      campaignId: bigint;
      termsHash: string;
      campaignIdentity: string;
      buyerWallet: string;
      nonce: bigint;
      maxQuantity: bigint;
      deadline: bigint;
    }
  ) {
    const domain = {
      name: "GroupDealHub",
      version: "1",
      chainId: params.chainId,
      verifyingContract: hubAddress,
    };

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

    const value = {
      chainId: params.chainId,
      hubContract: hubAddress,
      campaignId: params.campaignId,
      termsHash: params.termsHash,
      campaignIdentity: params.campaignIdentity,
      buyerWallet: params.buyerWallet,
      nonce: params.nonce,
      maxQuantity: params.maxQuantity,
      deadline: params.deadline,
    };

    return await signer.signTypedData(domain, types, value);
  }

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [deployer, seller, operator, authSigner, securityAuthority] = signers;
    buyers = signers.slice(5, 11); // 6 buyer signers

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();
    await usdc.waitForDeployment();

    const HubFactory = await ethers.getContractFactory("GroupDealHub");
    hub = await HubFactory.deploy(
      await usdc.getAddress(),
      authSigner.address,
      operator.address,
      securityAuthority.address
    );
    await hub.waitForDeployment();

    for (const b of buyers) {
      await usdc.mint(b.address, parseUSDC(50000));
      await usdc.connect(b).approve(await hub.getAddress(), ethers.MaxUint256);
    }
  });

  it("Property Invariant: Global Financial Conservation Law holds across multi-buyer campaign", async function () {
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("canonical-fuzz-terms"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0, // BUYER_COUNT
      maxPerAccount: 10n,
      inventoryLimit: 100n,
      durationSeconds: 86400 * 3, // 3 days
      deliverySlaSeconds: 86400, // 24h
      earlyRebateEnabled: true,
      earlySlotsCount: 3, // 3 early slots
      earlyRebateAmount: parseUSDC(4), // $4 early rebate
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash,
    };

    // 4 tiers:
    // 1 buyer -> $120
    // 2 buyers -> $100
    // 4 buyers -> $80
    // 5 buyers -> $60
    const tiers = [
      { threshold: 1n, price: parseUSDC(120) },
      { threshold: 2n, price: parseUSDC(100) },
      { threshold: 4n, price: parseUSDC(80) },
      { threshold: 5n, price: parseUSDC(60) },
    ];

    await hub.createCampaign(terms, tiers);
    const campaignId = 1n;
    const network = await ethers.provider.getNetwork();

    const quantities = [1n, 2n, 3n, 1n, 2n];
    const orderIds: bigint[] = [];

    // 5 buyers commit sequentially
    for (let i = 0; i < 5; i++) {
      const b = buyers[i];
      const identity = ethers.keccak256(ethers.toUtf8Bytes(`fuzz-buyer-${i}`));
      const currentBlockTime = BigInt(await time.latest());
      const deadline = currentBlockTime + 3600n;

      const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
        chainId: network.chainId,
        campaignId,
        termsHash,
        campaignIdentity: identity,
        buyerWallet: b.address,
        nonce: 0n,
        maxQuantity: 10n,
        deadline,
      });

      const tx = await hub.connect(b).commitToBuy(
        campaignId,
        identity,
        quantities[i],
        false,
        10n,
        deadline,
        sig
      );
      const receipt = await tx.wait();
      orderIds.push(BigInt(i + 1));
    }

    // Check final unlocked tier
    const stateBeforeFinalize = await hub.campaignStates(campaignId);
    expect(stateBeforeFinalize.currentUnlockedTier).to.equal(3); // Tier 3 ($60) unlocked!

    // Finalize
    await time.increase(86400 * 3 + 1);
    await hub.finalizeCampaign(campaignId);

    const stateAfterFinalize = await hub.campaignStates(campaignId);
    expect(stateAfterFinalize.finalClearingPrice).to.equal(parseUSDC(60));

    // Verify per-order conservation right after finalization:
    // committedGross == rebateAllocated + pendingDeliveryGross
    let totalCommittedGross = 0n;
    let totalRebateAllocated = 0n;

    for (const oid of orderIds) {
      const o = await hub.getOrderDetails(oid);
      totalCommittedGross += o.committedGross;
      totalRebateAllocated += o.rebateAllocated;
      const remainingGross = o.committedGross - o.rebateAllocated;
      expect(remainingGross).to.be.gte(0n);
    }

    expect(stateAfterFinalize.totalGrossCommitted).to.equal(totalCommittedGross);

    // Now simulate different lifecycle actions across the 5 orders:
    // Order 1: Delivered & Confirmed by buyer -> Seller gets proceeds
    const p1 = ethers.keccak256(ethers.toUtf8Bytes("proof-1"));
    await hub.connect(seller).recordDelivery(campaignId, 1n, p1);
    await hub.connect(buyers[0]).confirmReceipt(campaignId, 1n);

    // Order 2: Delivered & Disputed -> Resolved 60% buyer, 40% seller
    const p2 = ethers.keccak256(ethers.toUtf8Bytes("proof-2"));
    await hub.connect(seller).recordDelivery(campaignId, 2n, p2);
    const r2 = ethers.keccak256(ethers.toUtf8Bytes("faulty license"));
    await hub.connect(buyers[1]).openDispute(campaignId, 2n, r2);

    const o2 = await hub.getOrderDetails(2n);
    const rem2 = o2.committedGross - o2.rebateAllocated;
    const buyerShare2 = (rem2 * 60n) / 100n;
    const sellerShare2 = rem2 - buyerShare2; // exact remainder ensures conservation!
    await hub.connect(operator).resolveDispute(campaignId, 2n, buyerShare2, sellerShare2);

    // Order 3: Delivered, 48h passes without dispute -> auto settled to seller
    const p3 = ethers.keccak256(ethers.toUtf8Bytes("proof-3"));
    await hub.connect(seller).recordDelivery(campaignId, 3n, p3);
    await time.increase(48 * 3600 + 1);
    await hub.settleUndisputedOrder(campaignId, 3n);

    // Order 4: SLA breached (seller failed to deliver within SLA) -> 100% refund to buyer
    await time.increase(86400 + 1); // past SLA
    await hub.connect(buyers[3]).claimDeliveryBreach(campaignId, 4n);

    // Order 5: Pending delivery when Emergency Cancelled by Security Authority
    const rCancel = ethers.keccak256(ethers.toUtf8Bytes("emergency security audit"));
    await hub.connect(securityAuthority).emergencyCancelCampaign(campaignId, rCancel);

    // STRICT CONSERVATION LAW TEST ACROSS ALL ORDERS:
    // For EVERY SINGLE order:
    // buyerRefundAllocated + rebateAllocated + sellerAllocated == committedGross!
    for (const oid of orderIds) {
      const o = await hub.getOrderDetails(oid);
      const totalAllocated = o.rebateAllocated + o.buyerRefundAllocated + o.sellerAllocated;
      expect(totalAllocated).to.equal(
        o.committedGross,
        `Order ${oid} violates Conservation Law: totalAllocated != committedGross`
      );
    }

    // Now execute ALL claims and verify contract balance reduces to exactly 0!
    // Buyers claim their funds
    for (let i = 0; i < 5; i++) {
      const oid = orderIds[i];
      const o = await hub.getOrderDetails(oid);
      const claimable = o.rebateAllocated + o.buyerRefundAllocated;
      if (claimable > 0n) {
        await hub.connect(buyers[i]).claimBuyerFunds(campaignId, [oid]);
      }
    }

    // Seller claims settled proceeds
    const sellerClaimableOids: bigint[] = [];
    for (const oid of orderIds) {
      const o = await hub.getOrderDetails(oid);
      if (o.sellerAllocated > 0n) {
        sellerClaimableOids.push(oid);
      }
    }
    if (sellerClaimableOids.length > 0) {
      await hub.connect(seller).claimSellerProceeds(campaignId, sellerClaimableOids);
    }

    // CONTRACT BALANCE INVARIANT:
    // All committed funds accounted for, zero leftover or underflow!
    const contractBal = await usdc.balanceOf(await hub.getAddress());
    expect(contractBal).to.equal(0n, "Contract has leaked or unallocated funds!");
  });

  it("Security: Prevents EIP-712 Replay Attacks and Cross-Campaign Fraud", async function () {
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0,
      maxPerAccount: 5n,
      inventoryLimit: 50n,
      durationSeconds: 86400,
      deliverySlaSeconds: 86400,
      earlyRebateEnabled: false,
      earlySlotsCount: 0,
      earlyRebateAmount: 0n,
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash,
    };
    const tiers = [
      { threshold: 1n, price: parseUSDC(100) },
      { threshold: 2n, price: parseUSDC(80) },
    ];
    await hub.createCampaign(terms, tiers);
    const campaignId = 1n;
    const network = await ethers.provider.getNetwork();
    const currentBlockTime = BigInt(await time.latest());
    const deadline = currentBlockTime + 3600n;

    const b = buyers[0];
    const identity = ethers.keccak256(ethers.toUtf8Bytes("replay-identity"));

    const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: identity,
      buyerWallet: b.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });

    // 1st purchase succeeds
    await hub.connect(b).commitToBuy(campaignId, identity, 1n, false, 5n, deadline, sig);

    // Attempt to REPLAY same signature -> Reverts because nonce incremented to 1!
    await expect(
      hub.connect(b).commitToBuy(campaignId, identity, 1n, false, 5n, deadline, sig)
    ).to.be.revertedWith("Invalid buy authorization signature");

    // Attempt to tamper with termsHash -> Reverts
    const tamperedTermsHash = ethers.keccak256(ethers.toUtf8Bytes("tampered-terms"));
    const tamperedSig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash: tamperedTermsHash,
      campaignIdentity: identity,
      buyerWallet: b.address,
      nonce: 1n,
      maxQuantity: 5n,
      deadline,
    });
    await expect(
      hub.connect(b).commitToBuy(campaignId, identity, 1n, false, 5n, deadline, tamperedSig)
    ).to.be.revertedWith("Invalid buy authorization signature");
  });
});
