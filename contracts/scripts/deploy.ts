import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`[Deploy] Deploying from: ${deployer.address} on network ${network.name} (Chain ID: ${(await ethers.provider.getNetwork()).chainId})`);

  let usdcAddress: string;

  // On Arc Testnet (5042002), the system ERC-20 USDC address is 0x3600000000000000000000000000000000000000
  // For local development and testnet simulation, deploy MockUSDC
  if (network.name === "arcTestnet" && process.env.USE_SYSTEM_USDC === "true") {
    usdcAddress = "0x3600000000000000000000000000000000000000";
    console.log(`[Deploy] Using Arc System USDC: ${usdcAddress}`);
  } else {
    console.log("[Deploy] Deploying MockUSDC with public faucet...");
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDCFactory.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log(`[Deploy] MockUSDC deployed at: ${usdcAddress}`);
  }

  const authorizedSigner = process.env.AUTHORIZED_SIGNER_ADDRESS || deployer.address;
  const operatorAddress = process.env.OPERATOR_ADDRESS || deployer.address;
  const securityAuthority = process.env.SECURITY_AUTHORITY_ADDRESS || "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

  console.log(`[Deploy] Authorized Signer: ${authorizedSigner}`);
  console.log(`[Deploy] Operator Address: ${operatorAddress}`);
  console.log(`[Deploy] Security Authority: ${securityAuthority}`);

  console.log("[Deploy] Deploying GroupDealHub...");
  const HubFactory = await ethers.getContractFactory("GroupDealHub");
  const hub = await HubFactory.deploy(usdcAddress, authorizedSigner, operatorAddress, securityAuthority);
  await hub.waitForDeployment();
  const hubAddress = await hub.getAddress();
  console.log(`[Deploy] GroupDealHub deployed at: ${hubAddress}`);

  // Save contract artifact and addresses to shared/contracts.json
  const hubArtifact = await import("../artifacts/contracts/GroupDealHub.sol/GroupDealHub.json");
  const usdcArtifact = await import("../artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json");

  const deploymentData = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contracts: {
      GroupDealHub: {
        address: hubAddress,
        abi: hubArtifact.abi,
      },
      USDC: {
        address: usdcAddress,
        abi: usdcArtifact.abi,
      },
    },
    deployedAt: new Date().toISOString(),
  };

  const sharedDir = path.resolve(__dirname, "../../shared");
  if (!fs.existsSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true });
  }

  const outputPath = path.join(sharedDir, "contracts.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log(`[Deploy] Saved deployment metadata to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
