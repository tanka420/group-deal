import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer, seller1, seller2] = await ethers.getSigners();
  const sharedPath = path.resolve(__dirname, "../../shared/contracts.json");
  if (!fs.existsSync(sharedPath)) {
    throw new Error("contracts.json not found. Run deploy.ts first.");
  }
  const deployment = JSON.parse(fs.readFileSync(sharedPath, "utf8"));
  const hubAddress = deployment.contracts.GroupDealHub.address;
  const usdcAddress = deployment.contracts.USDC.address;

  const HubFactory = await ethers.getContractFactory("GroupDealHub");
  const hub = HubFactory.attach(hubAddress) as any;

  console.log(`[Seed] Seeding campaigns on Hub at: ${hubAddress}`);

  const parseUSDC = (val: number) => ethers.parseUnits(val.toString(), 6);

  // Campaign 1: Full-Stack AI Engineer 2026 Lifetime Access
  const terms1 = {
    sellerPayoutWallet: seller1 ? seller1.address : deployer.address,
    metric: 0, // BUYER_COUNT
    maxPerAccount: 3n,
    inventoryLimit: 100n,
    durationSeconds: 7 * 86400, // 7 days
    deliverySlaSeconds: 86400, // 24h
    earlyRebateEnabled: true,
    earlySlotsCount: 10,
    earlyRebateAmount: parseUSDC(10), // $10 early supporter rebate
    earlyRebateBps: 0,
    platformFeeBps: 0,
    termsHash: ethers.keccak256(ethers.toUtf8Bytes("campaign-ai-engineer-2026")),
  };
  const tiers1 = [
    { threshold: 1n, price: parseUSDC(199) },
    { threshold: 10n, price: parseUSDC(149) },
    { threshold: 25n, price: parseUSDC(99) },
  ];
  const tx1 = await hub.createCampaign(terms1, tiers1);
  await tx1.wait();
  console.log("[Seed] Campaign 1 Created: Khóa học Full-Stack AI Engineer 2026");

  // Campaign 2: Cursor Pro & Claude 3.5 Sonnet Team Seat 1 Year
  const terms2 = {
    sellerPayoutWallet: seller2 ? seller2.address : deployer.address,
    metric: 1, // UNITS_COUNT
    maxPerAccount: 5n,
    inventoryLimit: 50n,
    durationSeconds: 14 * 86400, // 14 days
    deliverySlaSeconds: 86400, // 24h
    earlyRebateEnabled: true,
    earlySlotsCount: 5,
    earlyRebateAmount: parseUSDC(15),
    earlyRebateBps: 0,
    platformFeeBps: 0,
    termsHash: ethers.keccak256(ethers.toUtf8Bytes("campaign-cursor-claude-seat")),
  };
  const tiers2 = [
    { threshold: 5n, price: parseUSDC(240) },
    { threshold: 15n, price: parseUSDC(180) },
    { threshold: 30n, price: parseUSDC(120) },
  ];
  const tx2 = await hub.createCampaign(terms2, tiers2);
  await tx2.wait();
  console.log("[Seed] Campaign 2 Created: Cursor Pro & Claude 3.5 Sonnet Team Seat");

  // Campaign 3: Design System Figma + React Enterprise Kit
  const terms3 = {
    sellerPayoutWallet: deployer.address,
    metric: 0, // BUYER_COUNT
    maxPerAccount: 2n,
    inventoryLimit: 80n,
    durationSeconds: 5 * 86400, // 5 days
    deliverySlaSeconds: 48 * 3600, // 48h
    earlyRebateEnabled: false,
    earlySlotsCount: 0,
    earlyRebateAmount: 0n,
    earlyRebateBps: 0,
    platformFeeBps: 0,
    termsHash: ethers.keccak256(ethers.toUtf8Bytes("campaign-design-system-figma")),
  };
  const tiers3 = [
    { threshold: 1n, price: parseUSDC(89) },
    { threshold: 8n, price: parseUSDC(59) },
    { threshold: 20n, price: parseUSDC(39) },
  ];
  const tx3 = await hub.createCampaign(terms3, tiers3);
  await tx3.wait();
  console.log("[Seed] Campaign 3 Created: Design System Figma & React Enterprise Kit");

  console.log("[Seed] Seeding completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
