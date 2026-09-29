import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { GroupDealHub, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GroupDeal Full Lifecycle E2E Simulation on Arc Network", function () {
  let hub: GroupDealHub;
  let usdc: MockUSDC;
  let deployer: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer1: SignerWithAddress;
  let buyer2: SignerWithAddress;
  let buyer3: SignerWithAddress;
  let operator: SignerWithAddress;
  let authSigner: SignerWithAddress;
  let securityAuthority: SignerWithAddress;

  const parseUSDC = (val: number | string) => ethers.parseUnits(val.toString(), 6);

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
    [deployer, seller, buyer1, buyer2, buyer3, operator, authSigner, securityAuthority] = await ethers.getSigners();

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

    // Fund buyers
    await usdc.mint(buyer1.address, parseUSDC(1000));
    await usdc.mint(buyer2.address, parseUSDC(1000));
    await usdc.mint(buyer3.address, parseUSDC(1000));

    await usdc.connect(buyer1).approve(await hub.getAddress(), ethers.MaxUint256);
    await usdc.connect(buyer2).approve(await hub.getAddress(), ethers.MaxUint256);
    await usdc.connect(buyer3).approve(await hub.getAddress(), ethers.MaxUint256);
  });

  it("Executes complete end-to-end journey from creation to settlement and claims", async function () {
    console.log("\n--- Step 1: Seller Creates Digital Campaign ---");
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("fullstack-ai-campaign-terms"));
    const terms = {
      sellerPayoutWallet: seller.address,
      metric: 0, // BUYER_COUNT
      maxPerAccount: 3n,
      inventoryLimit: 50n,
      durationSeconds: 86400 * 2, // 2 days
      deliverySlaSeconds: 86400, // 24h delivery SLA
      earlyRebateEnabled: true,
      earlySlotsCount: 2, // 2 early slots
      earlyRebateAmount: parseUSDC(10), // $10 early supporter rebate
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash,
    };

    // 3 Tiers: 1 buyer -> $150, 2 buyers -> $130, 3 buyers -> $110
    const tiers = [
      { threshold: 1n, price: parseUSDC(150) },
      { threshold: 2n, price: parseUSDC(130) },
      { threshold: 3n, price: parseUSDC(110) },
    ];

    const createTx = await hub.connect(seller).createCampaign(terms, tiers);
    await createTx.wait();
    const campaignId = 1n;
    const network = await ethers.provider.getNetwork();

    console.log("✔ Campaign #1 successfully published on Arc Network");

    console.log("\n--- Step 2: Buyer 1 Commits with EIP-712 Auth ---");
    const id1 = ethers.keccak256(ethers.toUtf8Bytes("account-buyer-1-salt"));
    let now = BigInt(await time.latest());
    let deadline = now + 3600n;

    const sig1 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id1,
      buyerWallet: buyer1.address,
      nonce: 0n,
      maxQuantity: 3n,
      deadline,
    });

    // Buyer 1 commits 1 unit at $150
    await hub.connect(buyer1).commitToBuy(campaignId, id1, 1n, false, 3n, deadline, sig1);
    const o1 = await hub.getOrderDetails(1n);
    expect(o1.buyerPrincipal).to.equal(buyer1.address);
    expect(o1.isEarlySupporter).to.be.true; // 1st early slot granted
    expect(o1.earlyRebateValue).to.equal(parseUSDC(10));
    console.log("✔ Buyer 1 committed $150 USDC and secured Early Supporter slot #1");

    console.log("\n--- Step 3: Buyer 2 Commits ---");
    const id2 = ethers.keccak256(ethers.toUtf8Bytes("account-buyer-2-salt"));
    now = BigInt(await time.latest());
    deadline = now + 3600n;

    const sig2 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id2,
      buyerWallet: buyer2.address,
      nonce: 0n,
      maxQuantity: 3n,
      deadline,
    });

    await hub.connect(buyer2).commitToBuy(campaignId, id2, 1n, false, 3n, deadline, sig2);
    const o2 = await hub.getOrderDetails(2n);
    expect(o2.isEarlySupporter).to.be.true; // 2nd early slot granted
    console.log("✔ Buyer 2 committed $150 USDC and secured Early Supporter slot #2");

    console.log("\n--- Step 4: Buyer 3 Commits and Unlocks Tier 3 ($110) ---");
    const id3 = ethers.keccak256(ethers.toUtf8Bytes("account-buyer-3-salt"));
    now = BigInt(await time.latest());
    deadline = now + 3600n;

    const sig3 = await signBuyAuthorization(await hub.getAddress(), authSigner, {
      chainId: network.chainId,
      campaignId,
      termsHash,
      campaignIdentity: id3,
      buyerWallet: buyer3.address,
      nonce: 0n,
      maxQuantity: 3n,
      deadline,
    });

    await hub.connect(buyer3).commitToBuy(campaignId, id3, 1n, false, 3n, deadline, sig3);
    const stateAtCommit3 = await hub.campaignStates(campaignId);
    expect(stateAtCommit3.currentUnlockedTier).to.equal(2); // Tier 3 ($110) unlocked!
    console.log("✔ Buyer 3 committed; Tier 3 ($110 USDC) unlocked for all buyers!");

    console.log("\n--- Step 5: Campaign Closes and Finalizes ---");
    await time.increase(86400 * 2 + 1);
    await hub.finalizeCampaign(campaignId);

    const finalState = await hub.campaignStates(campaignId);
    expect(finalState.finalClearingPrice).to.equal(parseUSDC(110));
    console.log("✔ Campaign finalized at clearing price: $110 USDC");

    // Check rebates
    const o1Final = await hub.getOrderDetails(1n);
    // ($150 - $110) + $10 early = $50 rebate
    expect(o1Final.rebateAllocated).to.equal(parseUSDC(50));

    const o2Final = await hub.getOrderDetails(2n);
    // ($150 - $110) + $10 early = $50 rebate
    expect(o2Final.rebateAllocated).to.equal(parseUSDC(50));

    console.log("✔ Rebates accurately calculated and allocated onchain");

    console.log("\n--- Step 6: Delivery, Confirmations & Dispute Arbitration ---");
    // Order 1: Seller fulfills within SLA -> Buyer confirms early
    const proof1 = ethers.keccak256(ethers.toUtf8Bytes("license-key-buyer1-ai"));
    await hub.connect(seller).recordDelivery(campaignId, 1n, proof1);
    await hub.connect(buyer1).confirmReceipt(campaignId, 1n);
    console.log("✔ Order 1 delivered and confirmed; seller proceeds unlocked");

    // Order 2: Seller delivers -> Buyer 2 opens onchain dispute within 48h
    const proof2 = ethers.keccak256(ethers.toUtf8Bytes("license-key-buyer2-ai"));
    await hub.connect(seller).recordDelivery(campaignId, 2n, proof2);
    const reason2 = ethers.keccak256(ethers.toUtf8Bytes("Invalid key code"));
    await hub.connect(buyer2).openDispute(campaignId, 2n, reason2);

    // Operator arbitrates 50/50 split of the remaining $100 delivery gross
    await hub.connect(operator).resolveDispute(campaignId, 2n, parseUSDC(50), parseUSDC(50));
    console.log("✔ Order 2 disputed onchain and arbitrated 50/50 by Operator");

    // Order 3: Seller fails to deliver -> Past 24h SLA -> Buyer claims breach refund
    await time.increase(86400 + 1);
    await hub.connect(buyer3).claimDeliveryBreach(campaignId, 3n);
    console.log("✔ Order 3 SLA breached; 100% committed funds refunded to Buyer 3");

    console.log("\n--- Step 7: Pull Claims Execution ---");
    // Buyer 1 pulls $50 rebate
    const b1Before = await usdc.balanceOf(buyer1.address);
    await hub.connect(buyer1).claimBuyerFunds(campaignId, [1n]);
    const b1After = await usdc.balanceOf(buyer1.address);
    expect(b1After - b1Before).to.equal(parseUSDC(50));

    // Buyer 2 pulls $50 rebate + $50 refund = $100
    const b2Before = await usdc.balanceOf(buyer2.address);
    await hub.connect(buyer2).claimBuyerFunds(campaignId, [2n]);
    const b2After = await usdc.balanceOf(buyer2.address);
    expect(b2After - b2Before).to.equal(parseUSDC(100));

    // Buyer 3 pulls $20 rebate + $110 breach refund = $130 total committed
    const b3Before = await usdc.balanceOf(buyer3.address);
    await hub.connect(buyer3).claimBuyerFunds(campaignId, [3n]);
    const b3After = await usdc.balanceOf(buyer3.address);
    expect(b3After - b3Before).to.equal(parseUSDC(130));

    // Seller pulls proceeds ($100 from Order 1 + $50 from Order 2 = $150)
    const sBefore = await usdc.balanceOf(seller.address);
    await hub.connect(seller).claimSellerProceeds(campaignId, [1n, 2n]);
    const sAfter = await usdc.balanceOf(seller.address);
    expect(sAfter - sBefore).to.equal(parseUSDC(150));

    console.log("✔ All buyers and sellers successfully pulled their claimable balances");

    console.log("\n--- Step 8: Strict Conservation Verification ---");
    const contractBalance = await usdc.balanceOf(await hub.getAddress());
    expect(contractBalance).to.equal(0n);
    console.log("✔ Perfect Conservation: Smart Contract balance returned to exactly 0 USDC (zero leak)");
  });
});
