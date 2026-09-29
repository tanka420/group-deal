import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { GroupDealHub, MockUSDC } from "../typechain-types";

describe("Gate G2 Verification: O(1) Gas Invariance, Security Authority & Authorization", function () {
  let hub: GroupDealHub;
  let usdc: MockUSDC;
  let deployer: SignerWithAddress;
  let seller: SignerWithAddress;
  let operator: SignerWithAddress;
  let authSigner: SignerWithAddress;
  let securityAuthority: SignerWithAddress;
  let newSecurityAuthority: SignerWithAddress;
  let buyer: SignerWithAddress;

  const u = (val: number | string) => ethers.parseUnits(String(val), 6);
  const termsHash = ethers.id("gate-g2-terms-canonical-v1");

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
    [deployer, seller, operator, authSigner, securityAuthority, newSecurityAuthority, buyer] =
      await ethers.getSigners();

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();

    const GroupDealHubFactory = await ethers.getContractFactory("GroupDealHub");
    hub = await GroupDealHubFactory.deploy(
      await usdc.getAddress(),
      authSigner.address,
      operator.address,
      securityAuthority.address
    );

    // Fund buyer with 1,000,000 USDC
    await usdc.mint(buyer.address, u(1000000));
    await usdc.connect(buyer).approve(await hub.getAddress(), ethers.MaxUint256);
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: G2.2 Security Authority & Two-Step Rotation
  // ---------------------------------------------------------------------------
  describe("G2.2 Security Authority Access Control & Two-Step Rotation", function () {
    it("Rejects deployment if security authority is zero address or identical to operator", async function () {
      const HubFactory = await ethers.getContractFactory("GroupDealHub");

      await expect(
        HubFactory.deploy(await usdc.getAddress(), authSigner.address, operator.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid security authority address");

      await expect(
        HubFactory.deploy(await usdc.getAddress(), authSigner.address, operator.address, operator.address)
      ).to.be.revertedWith("Security authority must be distinct from operator");
    });

    it("Enforces two-step rotation for Security Authority", async function () {
      // Step 1: Unauthorized account cannot start transfer
      await expect(
        hub.connect(operator).transferSecurityAuthority(newSecurityAuthority.address)
      ).to.be.revertedWith("Unauthorized security authority: only designated security authority can execute");

      await expect(
        hub.connect(deployer).transferSecurityAuthority(newSecurityAuthority.address)
      ).to.be.revertedWith("Unauthorized security authority: only designated security authority can execute");

      // Step 2: Cannot transfer to operator
      await expect(
        hub.connect(securityAuthority).transferSecurityAuthority(operator.address)
      ).to.be.revertedWith("Security authority cannot be operator");

      // Step 3: Current authority proposes new authority
      await expect(hub.connect(securityAuthority).transferSecurityAuthority(newSecurityAuthority.address))
        .to.emit(hub, "SecurityAuthorityTransferStarted")
        .withArgs(securityAuthority.address, newSecurityAuthority.address);

      expect(await hub.securityAuthority()).to.equal(securityAuthority.address);
      expect(await hub.pendingSecurityAuthority()).to.equal(newSecurityAuthority.address);

      // Step 4: Unauthorized account cannot accept
      await expect(
        hub.connect(securityAuthority).acceptSecurityAuthority()
      ).to.be.revertedWith("Only pending security authority can accept");

      // Step 5: New authority accepts
      await expect(hub.connect(newSecurityAuthority).acceptSecurityAuthority())
        .to.emit(hub, "SecurityAuthorityTransferred")
        .withArgs(securityAuthority.address, newSecurityAuthority.address);

      expect(await hub.securityAuthority()).to.equal(newSecurityAuthority.address);
      expect(await hub.pendingSecurityAuthority()).to.equal(ethers.ZeroAddress);
    });

    it("Rejects emergency cancellation from owner and operator; only Security Authority can cancel", async function () {
      const cId = await hub.nextCampaignId();
      await hub.createCampaign(
        {
          sellerPayoutWallet: seller.address,
          metric: 1,
          maxPerAccount: 10,
          inventoryLimit: 100,
          durationSeconds: 86400,
          deliverySlaSeconds: 86400,
          earlyRebateEnabled: false,
          earlySlotsCount: 0,
          earlyRebateAmount: 0n,
          earlyRebateBps: 0,
          platformFeeBps: 0,
          termsHash,
        },
        [
          { threshold: 1, price: u(100) },
          { threshold: 2, price: u(80) },
        ]
      );

      const incidentHash = ethers.id("incident-report-01");

      // Operator cannot cancel
      await expect(
        hub.connect(operator).emergencyCancelCampaign(cId, incidentHash)
      ).to.be.revertedWith("Unauthorized security authority: only designated security authority can execute");

      // Owner/deployer cannot cancel
      await expect(
        hub.connect(deployer).emergencyCancelCampaign(cId, incidentHash)
      ).to.be.revertedWith("Unauthorized security authority: only designated security authority can execute");

      // Designated security authority CAN cancel
      await expect(hub.connect(securityAuthority).emergencyCancelCampaign(cId, incidentHash))
        .to.emit(hub, "EmergencyCancelled")
        .withArgs(cId, incidentHash, 0n);
    });
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: G2.4 Authorization Verification & Rejection Tests
  // ---------------------------------------------------------------------------
  describe("G2.4 Authorization Verification & Fail-Closed Checks", function () {
    let campaignId: bigint;
    const chainId = 31337n;

    beforeEach(async function () {
      campaignId = await hub.nextCampaignId();
      await hub.createCampaign(
        {
          sellerPayoutWallet: seller.address,
          metric: 1,
          maxPerAccount: 5,
          inventoryLimit: 100,
          durationSeconds: 86400,
          deliverySlaSeconds: 86400,
          earlyRebateEnabled: false,
          earlySlotsCount: 0,
          earlyRebateAmount: 0n,
          earlyRebateBps: 0,
          platformFeeBps: 0,
          termsHash,
        },
        [
          { threshold: 1, price: u(100) },
          { threshold: 2, price: u(80) },
        ]
      );
    });

    it("Reverts when authorized quantity is exceeded", async function () {
      const identity = ethers.id("identity-buyer-1");
      const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
      const authorizedQty = 2n;

      const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
        chainId,
        campaignId,
        termsHash,
        campaignIdentity: identity,
        buyerWallet: buyer.address,
        nonce: 0n,
        maxQuantity: authorizedQty,
        deadline,
      });

      // Attempting to buy 3 units with authorization for 2 units must revert
      await expect(
        hub.connect(buyer).commitToBuy(campaignId, identity, 3n, false, authorizedQty, deadline, sig)
      ).to.be.revertedWith("Exceeds authorized quantity");
    });

    it("Reverts with mismatched termsHash in authorization signature", async function () {
      const identity = ethers.id("identity-buyer-2");
      const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
      const wrongTermsHash = ethers.id("tampered-terms");

      const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
        chainId,
        campaignId,
        termsHash: wrongTermsHash,
        campaignIdentity: identity,
        buyerWallet: buyer.address,
        nonce: 0n,
        maxQuantity: 1n,
        deadline,
      });

      await expect(
        hub.connect(buyer).commitToBuy(campaignId, identity, 1n, false, 1n, deadline, sig)
      ).to.be.revertedWith("Invalid buy authorization signature");
    });

    it("Reverts with expired authorization deadline", async function () {
      const identity = ethers.id("identity-buyer-3");
      const pastDeadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp - 10);

      const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
        chainId,
        campaignId,
        termsHash,
        campaignIdentity: identity,
        buyerWallet: buyer.address,
        nonce: 0n,
        maxQuantity: 1n,
        deadline: pastDeadline,
      });

      await expect(
        hub.connect(buyer).commitToBuy(campaignId, identity, 1n, false, 1n, pastDeadline, sig)
      ).to.be.revertedWith("Authorization expired");
    });

    it("Reverts on signature replay with same nonce", async function () {
      const identity = ethers.id("identity-buyer-4");
      const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

      const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
        chainId,
        campaignId,
        termsHash,
        campaignIdentity: identity,
        buyerWallet: buyer.address,
        nonce: 0n,
        maxQuantity: 1n,
        deadline,
      });

      // First commitment succeeds
      await hub.connect(buyer).commitToBuy(campaignId, identity, 1n, false, 1n, deadline, sig);

      // Replaying the exact same signature must revert because onchain nonce incremented to 1
      await expect(
        hub.connect(buyer).commitToBuy(campaignId, identity, 1n, false, 1n, deadline, sig)
      ).to.be.revertedWith("Invalid buy authorization signature");
    });
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: G2.1 O(1) Gas Invariance for finalizeCampaign and emergencyCancel
  // ---------------------------------------------------------------------------
  describe("G2.1 O(1) Gas Invariance Across Campaign Sizes", function () {
    const chainId = 31337n;

    async function setupCampaignWithOrders(orderCount: number): Promise<{ campaignId: bigint; orderIds: bigint[] }> {
      const cId = await hub.nextCampaignId();
      await hub.createCampaign(
        {
          sellerPayoutWallet: seller.address,
          metric: 1, // UNITS_COUNT
          maxPerAccount: 100000,
          inventoryLimit: 0,
          durationSeconds: 86400,
          deliverySlaSeconds: 86400,
          earlyRebateEnabled: false,
          earlySlotsCount: 0,
          earlyRebateAmount: 0n,
          earlyRebateBps: 0,
          platformFeeBps: 0,
          termsHash,
        },
        [
          { threshold: 1, price: u(100) },
          { threshold: 1000, price: u(80) },
        ]
      );

      const orderIds: bigint[] = [];
      const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 86400);

      for (let i = 0; i < orderCount; i++) {
        const identity = ethers.id(`buyer-batch-${cId}-${i}`);
        const sig = await signBuyAuthorization(await hub.getAddress(), authSigner, {
          chainId,
          campaignId: cId,
          termsHash,
          campaignIdentity: identity,
          buyerWallet: buyer.address,
          nonce: 0n,
          maxQuantity: 1n,
          deadline,
        });

        const tx = await hub.connect(buyer).commitToBuy(cId, identity, 1n, false, 1n, deadline, sig);
        const receipt = await tx.wait();
        orderIds.push(BigInt(i + 1));
      }

      return { campaignId: cId, orderIds };
    }

    it("Proves finalizeCampaign gas consumption is strictly O(1) invariant to order count", async function () {
      // Test across 1 order, 5 orders, 20 orders
      const sizes = [1, 5, 20];
      const gasUsedMap: Record<number, bigint> = {};

      for (const size of sizes) {
        const { campaignId } = await setupCampaignWithOrders(size);

        // Advance time past campaign duration
        await ethers.provider.send("evm_increaseTime", [86401]);
        await ethers.provider.send("evm_mine", []);

        const tx = await hub.finalizeCampaign(campaignId);
        const receipt = await tx.wait();
        gasUsedMap[size] = receipt!.gasUsed;
      }

      console.log("\n  [G2.1 Gas Benchmark] finalizeCampaign Gas Invariance:");
      for (const size of sizes) {
        console.log(`    - Orders: ${size} => Gas Used: ${gasUsedMap[size].toString()}`);
      }

      // Invariance proof: Gas with 20 orders must NOT grow with order count compared to 1 order
      // Allow minor jitter (< 2000 gas difference for state updates), proving ZERO linear loops!
      const gasDiff = gasUsedMap[20] > gasUsedMap[1] ? gasUsedMap[20] - gasUsedMap[1] : gasUsedMap[1] - gasUsedMap[20];
      expect(Number(gasDiff)).to.be.lessThan(2000, "finalizeCampaign gas grew with order count! Must be O(1).");
    });

    it("Proves emergencyCancelCampaign gas consumption is strictly O(1) invariant to order count", async function () {
      const sizes = [1, 5, 20];
      const gasUsedMap: Record<number, bigint> = {};

      for (const size of sizes) {
        const { campaignId } = await setupCampaignWithOrders(size);

        const tx = await hub.connect(securityAuthority).emergencyCancelCampaign(campaignId, ethers.id("audit-cancel"));
        const receipt = await tx.wait();
        gasUsedMap[size] = receipt!.gasUsed;
      }

      console.log("\n  [G2.1 Gas Benchmark] emergencyCancelCampaign Gas Invariance:");
      for (const size of sizes) {
        console.log(`    - Orders: ${size} => Gas Used: ${gasUsedMap[size].toString()}`);
      }

      // Invariance proof: Gas with 20 orders must NOT grow with order count compared to 1 order
      const gasDiff = gasUsedMap[20] > gasUsedMap[1] ? gasUsedMap[20] - gasUsedMap[1] : gasUsedMap[1] - gasUsedMap[20];
      expect(Number(gasDiff)).to.be.lessThan(2000, "emergencyCancelCampaign gas grew with order count! Must be O(1).");
    });
  });
});
