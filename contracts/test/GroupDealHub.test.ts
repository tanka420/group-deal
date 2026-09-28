import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { GroupDealHub, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GroupDealHub Core & Conservation Tests", function () {
  let hub: GroupDealHub;
  let usdc: MockUSDC;
  let deployer: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer1: SignerWithAddress;
  let buyer2: SignerWithAddress;
  let buyer3: SignerWithAddress;
  let operator: SignerWithAddress;
  let authSigner: SignerWithAddress;

  const USDC_DECIMALS = 6;
  const parseUSDC = (val: number | string) => ethers.parseUnits(val.toString(), USDC_DECIMALS);

  // EIP-712 helper
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
    [deployer, seller, buyer1, buyer2, buyer3, operator, authSigner] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();
    await usdc.waitForDeployment();

    // Deploy GroupDealHub
    const HubFactory = await ethers.getContractFactory("GroupDealHub");
    hub = await HubFactory.deploy(
      await usdc.getAddress(),
      authSigner.address,
      operator.address
    );
    await hub.waitForDeployment();

    // Fund buyers with USDC
    await usdc.mint(buyer1.address, parseUSDC(10000));
    await usdc.mint(buyer2.address, parseUSDC(10000));
    await usdc.mint(buyer3.address, parseUSDC(10000));

    // Approve Hub
    await usdc.connect(buyer1).approve(await hub.getAddress(), ethers.MaxUint256);
    await usdc.connect(buyer2).approve(await hub.getAddress(), ethers.MaxUint256);
    await usdc.connect(buyer3).approve(await hub.getAddress(), ethers.MaxUint256);
  });

  it("1. Should enforce campaign tier validation rules", async function () {
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0, // BUYER_COUNT
      maxPerAccount: 5n,
      inventoryLimit: 100n,
      durationSeconds: 7 * 86400, // 7 days
      deliverySlaSeconds: 86400, // 24h
      earlyRebateEnabled: true,
      earlySlotsCount: 2,
      earlyRebateAmount: parseUSDC(5),
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash: ethers.keccak256(ethers.toUtf8Bytes("canonical-terms-v1")),
    };

    // Invalid: only 1 tier (must be 2-5)
    await expect(
      hub.createCampaign(terms, [{ threshold: 1n, price: parseUSDC(50) }])
    ).to.be.revertedWith("Tiers must be 2 to 5");

    // Invalid: prices not strictly decreasing
    await expect(
      hub.createCampaign(terms, [
        { threshold: 1n, price: parseUSDC(50) },
        { threshold: 10n, price: parseUSDC(55) },
      ])
    ).to.be.revertedWith("Prices must strictly decrease");

    // Invalid: thresholds not strictly increasing
    await expect(
      hub.createCampaign(terms, [
        { threshold: 10n, price: parseUSDC(50) },
        { threshold: 5n, price: parseUSDC(40) },
      ])
    ).to.be.revertedWith("Thresholds must strictly increase");

    // Valid: 3 tiers, increasing thresholds (1, 5, 10), decreasing prices ($50, $40, $30)
    const validTiers = [
      { threshold: 1n, price: parseUSDC(50) },
      { threshold: 5n, price: parseUSDC(40) },
      { threshold: 10n, price: parseUSDC(30) },
    ];

    const tx = await hub.createCampaign(terms, validTiers);
    await expect(tx).to.emit(hub, "CampaignCreated");
  });

  it("2. Should allow terms update before 1st commitment, but lock permanently after 1st commitment", async function () {
    const termsHash1 = ethers.keccak256(ethers.toUtf8Bytes("canonical-terms-v1"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0, // BUYER_COUNT
      maxPerAccount: 5n,
      inventoryLimit: 50n,
      durationSeconds: 7 * 86400,
      deliverySlaSeconds: 86400,
      earlyRebateEnabled: true,
      earlySlotsCount: 2,
      earlyRebateAmount: parseUSDC(5),
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash: termsHash1,
    };

    const tiers = [
      { threshold: 1n, price: parseUSDC(100) },
      { threshold: 2n, price: parseUSDC(80) },
    ];

    await hub.createCampaign(terms, tiers);
    const campaignId = 1n;

    // Update terms hash before any commitment -> Allowed
    const termsHash2 = ethers.keccak256(ethers.toUtf8Bytes("canonical-terms-v2"));
    await hub.connect(seller).updateTermsBeforeFirstCommitment(campaignId, termsHash2);

    const updatedTerms = await hub.campaignTerms(campaignId);
    expect(updatedTerms.termsHash).to.equal(termsHash2);

    // Make first commitment
    const network = await ethers.provider.getNetwork();
    const campaignIdentity1 = ethers.keccak256(ethers.toUtf8Bytes("user-1-campaign-1"));
    const deadline = BigInt(await time.latest()) + 3600n;

    const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId: campaignId,
      termsHash: termsHash2,
      campaignIdentity: campaignIdentity1,
      buyerWallet: buyer1.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });

    await hub.connect(buyer1).commitToBuy(
      campaignId,
      campaignIdentity1,
      1n,
      false,
      5n,
      deadline,
      sig
    );

    // Attempt to update terms after first commitment -> REVERTS
    const termsHash3 = ethers.keccak256(ethers.toUtf8Bytes("canonical-terms-v3"));
    await expect(
      hub.connect(seller).updateTermsBeforeFirstCommitment(campaignId, termsHash3)
    ).to.be.revertedWith("Terms locked after first commitment");
  });

  it("3. Should enforce Buyer Principal Pinning and reject other wallets for same campaign identity", async function () {
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0,
      maxPerAccount: 5n,
      inventoryLimit: 50n,
      durationSeconds: 7 * 86400,
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
    const campaignIdentity = ethers.keccak256(ethers.toUtf8Bytes("user-alice-campaign-1"));
    const deadline = BigInt(await time.latest()) + 3600n;

    // 1st commitment pins buyer1 as principal
    const sig1 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity,
      buyerWallet: buyer1.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });
    await hub.connect(buyer1).commitToBuy(campaignId, campaignIdentity, 1n, false, 5n, deadline, sig1);

    const pinned = await hub.campaignIdentityPrincipals(campaignId, campaignIdentity);
    expect(pinned).to.equal(buyer1.address);

    // Now try to buy using buyer2 for the SAME campaignIdentity -> Reverts
    const sig2 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity,
      buyerWallet: buyer2.address,
      nonce: 1n,
      maxQuantity: 5n,
      deadline,
    });
    await expect(
      hub.connect(buyer2).commitToBuy(campaignId, campaignIdentity, 1n, false, 5n, deadline, sig2)
    ).to.be.revertedWith("Wallet not principal for this identity");
  });

  it("4. Should manage early supporter slots and revert if requireEarlySlot is true and slots are full", async function () {
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0,
      maxPerAccount: 5n,
      inventoryLimit: 50n,
      durationSeconds: 7 * 86400,
      deliverySlaSeconds: 86400,
      earlyRebateEnabled: true,
      earlySlotsCount: 1, // Only 1 slot!
      earlyRebateAmount: parseUSDC(10), // $10 early rebate
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
    const deadline = BigInt(await time.latest()) + 3600n;

    // Buyer 1 takes slot 1
    const id1 = ethers.keccak256(ethers.toUtf8Bytes("id1"));
    const sig1 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id1,
      buyerWallet: buyer1.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });
    await hub.connect(buyer1).commitToBuy(campaignId, id1, 1n, false, 5n, deadline, sig1);
    const order1 = await hub.getOrderDetails(1n);
    expect(order1.isEarlySupporter).to.be.true;
    expect(order1.earlyRebateValue).to.equal(parseUSDC(10));

    // Buyer 2 specifies requireEarlySlot = true -> Reverts because slots are full
    const id2 = ethers.keccak256(ethers.toUtf8Bytes("id2"));
    const sig2 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id2,
      buyerWallet: buyer2.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });
    await expect(
      hub.connect(buyer2).commitToBuy(campaignId, id2, 1n, true, 5n, deadline, sig2)
    ).to.be.revertedWith("Early slot exhausted");
  });

  it("5. Should unlock tier 2, calculate final clearing price, rebates, and maintain exact financial conservation", async function () {
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0, // BUYER_COUNT
      maxPerAccount: 5n,
      inventoryLimit: 50n,
      durationSeconds: 86400, // 24 hours
      deliverySlaSeconds: 86400,
      earlyRebateEnabled: true,
      earlySlotsCount: 5,
      earlyRebateAmount: parseUSDC(5), // $5 early discount on 1st unit
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash,
    };
    // Tier 0: 1 buyer -> $100
    // Tier 1: 2 buyers -> $70 (clearing price if 2 buyers join)
    const tiers = [
      { threshold: 1n, price: parseUSDC(100) },
      { threshold: 2n, price: parseUSDC(70) },
    ];
    await hub.createCampaign(terms, tiers);
    const campaignId = 1n;
    const network = await ethers.provider.getNetwork();
    const currentBlockTime = BigInt(await time.latest());
    const deadline = currentBlockTime + 3600n;

    // Buyer 1 joins when current tier is Tier 0 ($100). Buys 2 units.
    // Committed gross = 2 * $100 = $200. Early supporter rebate = $5.
    const id1 = ethers.keccak256(ethers.toUtf8Bytes("buyer1"));
    const sig1 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id1,
      buyerWallet: buyer1.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });
    await hub.connect(buyer1).commitToBuy(campaignId, id1, 2n, false, 5n, deadline, sig1);

    // Buyer 2 joins: locks at Tier 0 ($100), unlocks Tier 1 ($70)! Buys 1 unit.
    // Committed gross = 1 * $100 = $100.
    // Rebate = ($100 - $70) + $5 early rebate = $35!
    const id2 = ethers.keccak256(ethers.toUtf8Bytes("buyer2"));
    const sig2 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id2,
      buyerWallet: buyer2.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });
    await hub.connect(buyer2).commitToBuy(campaignId, id2, 1n, false, 5n, deadline, sig2);

    const stateBeforeFinalize = await hub.campaignStates(campaignId);
    expect(stateBeforeFinalize.currentUnlockedTier).to.equal(1); // Tier 1 unlocked!

    // Fast-forward past campaign duration and finalize
    await time.increase(86401);
    await hub.finalizeCampaign(campaignId);

    const stateAfterFinalize = await hub.campaignStates(campaignId);
    expect(stateAfterFinalize.finalClearingPrice).to.equal(parseUSDC(70));

    // Order 1 (buyer 1):
    // Locked price: $100, Final clearing price: $70.
    // Quantity: 2 units.
    // Unit rebate: ($100 - $70) * 2 = $60.
    // Early supporter rebate: $5.
    // Total rebate allocated = $65.
    // Remaining gross pending delivery = $200 - $65 = $135.
    const o1 = await hub.getOrderDetails(1n);
    expect(o1.rebateAllocated).to.equal(parseUSDC(65));

    // Order 2 (buyer 2):
    // Locked price: $100, Final clearing price: $70.
    // Quantity: 1 unit.
    // Unit rebate: ($100 - $70) * 1 = $30.
    // Early supporter rebate: $5.
    // Total rebate allocated = $35.
    // Remaining gross pending delivery = $100 - $35 = $65.
    const o2 = await hub.getOrderDetails(2n);
    expect(o2.rebateAllocated).to.equal(parseUSDC(35));

    // Seller delivers Order 1 within SLA
    const proofHash1 = ethers.keccak256(ethers.toUtf8Bytes("license-keys-batch-1"));
    await hub.connect(seller).recordDelivery(campaignId, 1n, proofHash1);

    // Buyer 1 confirms receipt
    await hub.connect(buyer1).confirmReceipt(campaignId, 1n);

    // Check seller proceeds on Order 1 = $135
    const o1Confirmed = await hub.getOrderDetails(1n);
    expect(o1Confirmed.sellerAllocated).to.equal(parseUSDC(135));

    // CONSERVATION CHECK for Order 1:
    // buyerAllocated ($65 rebate) + sellerAllocated ($135) + unallocated ($0) == committedGross ($200)
    expect(o1Confirmed.rebateAllocated + o1Confirmed.sellerAllocated).to.equal(o1Confirmed.committedGross);

    // Buyer 1 pulls their claimable funds ($65 rebate)
    const buyer1BalBefore = await usdc.balanceOf(buyer1.address);
    await hub.connect(buyer1).claimBuyerFunds(campaignId, [1n]);
    const buyer1BalAfter = await usdc.balanceOf(buyer1.address);
    expect(buyer1BalAfter - buyer1BalBefore).to.equal(parseUSDC(65));

    // Seller pulls their proceeds ($135)
    const sellerBalBefore = await usdc.balanceOf(seller.address);
    await hub.connect(seller).claimSellerProceeds(campaignId, [1n]);
    const sellerBalAfter = await usdc.balanceOf(seller.address);
    expect(sellerBalAfter - sellerBalBefore).to.equal(parseUSDC(135));
  });

  it("6. Should support direct onchain dispute fallback and operator resolution preserving conservation", async function () {
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
      { threshold: 2n, price: parseUSDC(90) },
    ];
    await hub.createCampaign(terms, tiers);
    const campaignId = 1n;
    const network = await ethers.provider.getNetwork();
    const currentBlockTime = BigInt(await time.latest());
    const deadline = currentBlockTime + 3600n;

    const id1 = ethers.keccak256(ethers.toUtf8Bytes("buyer1"));
    const sig1 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id1,
      buyerWallet: buyer1.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });
    await hub.connect(buyer1).commitToBuy(campaignId, id1, 1n, false, 5n, deadline, sig1);

    // Finalize
    await time.increase(86401);
    await hub.finalizeCampaign(campaignId);

    // Seller delivers
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("delivery-proof"));
    await hub.connect(seller).recordDelivery(campaignId, 1n, proofHash);

    // DIRECT ONCHAIN DISPUTE FALLBACK:
    // Buyer principal opens dispute directly onchain!
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("Invalid key code provided"));
    await hub.connect(buyer1).openDispute(campaignId, 1n, reasonHash);

    const orderDisputed = await hub.getOrderDetails(1n);
    expect(orderDisputed.deliveryStatus).to.equal(3); // DISPUTED

    // Operator resolves dispute with a 50/50 split of the $100 delivery gross
    // Attempting invalid split that violates conservation reverts:
    await expect(
      hub.connect(operator).resolveDispute(campaignId, 1n, parseUSDC(60), parseUSDC(60))
    ).to.be.revertedWith("Conservation violated: sum != remainingGross");

    // Valid split: $50 buyer refund, $50 seller proceeds
    await hub.connect(operator).resolveDispute(campaignId, 1n, parseUSDC(50), parseUSDC(50));

    const orderResolved = await hub.getOrderDetails(1n);
    expect(orderResolved.deliveryStatus).to.equal(5); // RESOLVED
    expect(orderResolved.buyerRefundAllocated).to.equal(parseUSDC(50));
    expect(orderResolved.sellerAllocated).to.equal(parseUSDC(50));

    // Both parties claim their allocated shares
    await hub.connect(buyer1).claimBuyerFunds(campaignId, [1n]);
    await hub.connect(seller).claimSellerProceeds(campaignId, [1n]);
  });

  it("7. Should refund buyer on delivery SLA breach", async function () {
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0,
      maxPerAccount: 5n,
      inventoryLimit: 50n,
      durationSeconds: 86400,
      deliverySlaSeconds: 86400, // 24h SLA
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

    const id1 = ethers.keccak256(ethers.toUtf8Bytes("buyer1"));
    const sig1 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id1,
      buyerWallet: buyer1.address,
      nonce: 0n,
      maxQuantity: 5n,
      deadline,
    });
    await hub.connect(buyer1).commitToBuy(campaignId, id1, 1n, false, 5n, deadline, sig1);

    await time.increase(86401);
    await hub.finalizeCampaign(campaignId);

    // Fast forward past delivery SLA (24h + 1s) without seller recording delivery
    await time.increase(86401);

    // Buyer claims breach refund
    await hub.connect(buyer1).claimDeliveryBreach(campaignId, 1n);

    const orderBreached = await hub.getOrderDetails(1n);
    expect(orderBreached.deliveryStatus).to.equal(4); // BREACHED_REFUNDED
    expect(orderBreached.buyerRefundAllocated).to.equal(parseUSDC(100));

    // Buyer claims 100% refund
    const balBefore = await usdc.balanceOf(buyer1.address);
    await hub.connect(buyer1).claimBuyerFunds(campaignId, [1n]);
    const balAfter = await usdc.balanceOf(buyer1.address);
    expect(balAfter - balBefore).to.equal(parseUSDC(100));
  });
});
