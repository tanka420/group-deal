import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ARC_PREDEPLOY_USDC = "0x3600000000000000000000000000000000000000";
const ARC_BLOCKLIST_TEST_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "[Deploy Fail-Closed] No deployer signer configured. Set DEPLOYER_PRIVATE_KEY in .env."
    );
  }

  const deployer = signers[0];
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  console.log(`[Deploy] Initiating deployment...`);
  console.log(`[Deploy] Network: ${network.name} (Chain ID: ${chainId})`);
  console.log(`[Deploy] Deployer Address: ${deployer.address}`);

  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`[Deploy] Deployer Gas Balance: ${ethers.formatEther(deployerBalance)} ETH/USDC`);

  let usdcAddress: string;
  let authorizedSigner: string;
  let operatorAddress: string;
  let securityAuthority: string;

  if (network.name === "arcTestnet") {
    // G5.1 Fail-Closed Enforcements for Arc Testnet
    if (chainId !== 5042002) {
      throw new Error(`[Deploy Fail-Closed] Expected Arc Testnet chain ID 5042002, got ${chainId}`);
    }

    if (deployerBalance === 0n) {
      throw new Error(
        `[Deploy Fail-Closed] Deployer ${deployer.address} has 0 balance on Arc Testnet.\n` +
        `Please fund this wallet via Circle Faucet: https://faucet.circle.com (select Arc Testnet).`
      );
    }

    // Arc Testnet MUST use official predeploy USDC, never MockUSDC
    usdcAddress = ARC_PREDEPLOY_USDC;
    console.log(`[Deploy] Strict Arc Predeploy USDC: ${usdcAddress}`);

    // Roles validation
    authorizedSigner = process.env.AUTHORIZED_SIGNER_ADDRESS || deployer.address;

    // Operator must not be the Arc blocklist test address
    operatorAddress = process.env.OPERATOR_ADDRESS || "";
    if (!operatorAddress || operatorAddress.toLowerCase() === ARC_BLOCKLIST_TEST_ADDRESS.toLowerCase()) {
      // Derive a deterministic fallback address if not provided in env, distinct from deployer
      const fallbackWallet = ethers.Wallet.createRandom();
      operatorAddress = process.env.OPERATOR_ADDRESS && process.env.OPERATOR_ADDRESS.toLowerCase() !== ARC_BLOCKLIST_TEST_ADDRESS.toLowerCase()
        ? process.env.OPERATOR_ADDRESS
        : "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
    }

    // Security Authority MUST be distinct from operator and deployer
    securityAuthority = process.env.SECURITY_AUTHORITY_ADDRESS || "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

    if (securityAuthority.toLowerCase() === operatorAddress.toLowerCase()) {
      throw new Error("[Deploy Fail-Closed] Security authority MUST NOT equal operator address.");
    }
    if (securityAuthority.toLowerCase() === deployer.address.toLowerCase()) {
      throw new Error("[Deploy Fail-Closed] Security authority MUST NOT equal deployer address.");
    }

    console.log(`[Deploy] Authorized Signer: ${authorizedSigner}`);
    console.log(`[Deploy] Operator Address: ${operatorAddress}`);
    console.log(`[Deploy] Security Authority: ${securityAuthority}`);

    console.log("[Deploy] Deploying GroupDealHub on Arc Testnet (min base fee: 25 Gwei)...");
    const HubFactory = await ethers.getContractFactory("GroupDealHub");

    // Gas settings for Arc Testnet (20 Gwei floor)
    const hub = await HubFactory.deploy(
      usdcAddress,
      authorizedSigner,
      operatorAddress,
      securityAuthority,
      {
        gasPrice: 25_000_000_000n, // 25 Gwei
      }
    );

    const deployTx = hub.deploymentTransaction();
    console.log(`[Deploy] Broadcasted tx: ${deployTx?.hash}`);
    console.log("[Deploy] Waiting for 2 block confirmations on Arc Testnet...");

    const receipt = await deployTx?.wait(2);
    const hubAddress = await hub.getAddress();
    const deploymentBlock = receipt?.blockNumber ?? (await ethers.provider.getBlockNumber());

    console.log(`[Deploy] GroupDealHub confirmed at: ${hubAddress}`);
    console.log(`[Deploy] Confirmed in block: ${deploymentBlock}`);
    console.log(`[Deploy] Gas used: ${receipt?.gasUsed?.toString()}`);

    const runtimeBytecode = await ethers.provider.getCode(hubAddress);
    const bytecodeHash = ethers.keccak256(runtimeBytecode);
    console.log(`[Deploy] Runtime Bytecode Hash: ${bytecodeHash}`);

    // Update shared/manifests/arc-testnet.json
    const arcManifestPath = path.resolve(__dirname, "../../shared/manifests/arc-testnet.json");
    if (fs.existsSync(arcManifestPath)) {
      const arcManifest = JSON.parse(fs.readFileSync(arcManifestPath, "utf8"));
      arcManifest.contracts.GroupDealHub = {
        address: hubAddress,
        deploymentBlock: deploymentBlock,
        bytecodeHash: bytecodeHash,
        txHash: deployTx?.hash,
        deployedAt: new Date().toISOString(),
      };
      arcManifest.roles.operator.address = operatorAddress;
      arcManifest.roles.securityAuthority.address = securityAuthority;
      arcManifest.roles.authorizedSigner.address = authorizedSigner;
      fs.writeFileSync(arcManifestPath, JSON.stringify(arcManifest, null, 2) + "\n");
      console.log(`[Deploy] Updated Arc manifest at: ${arcManifestPath}`);
    }

    // Update shared/contracts.json
    const hubArtifact = await import("../artifacts/contracts/GroupDealHub.sol/GroupDealHub.json");
    const contractsJson = {
      network: network.name,
      chainId: chainId,
      deploymentBlock: deploymentBlock,
      contracts: {
        GroupDealHub: {
          address: hubAddress,
          abi: hubArtifact.abi,
          bytecodeHash: bytecodeHash,
          txHash: deployTx?.hash,
        },
        USDC: {
          address: usdcAddress,
          symbol: "USDC",
          decimals: 6,
        },
      },
      roles: {
        operator: operatorAddress,
        securityAuthority: securityAuthority,
        authorizedSigner: authorizedSigner,
      },
      deployedAt: new Date().toISOString(),
    };

    const contractsJsonPath = path.resolve(__dirname, "../../shared/contracts.json");
    fs.writeFileSync(contractsJsonPath, JSON.stringify(contractsJson, null, 2) + "\n");
    console.log(`[Deploy] Updated shared contracts config at: ${contractsJsonPath}`);

  } else {
    // Local / Hardhat Simulation
    console.log("[Deploy] Deploying MockUSDC for local development...");
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDCFactory.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log(`[Deploy] MockUSDC deployed at: ${usdcAddress}`);

    authorizedSigner = signers.length > 1 ? signers[1].address : deployer.address;
    operatorAddress = signers.length > 2 ? signers[2].address : deployer.address;
    securityAuthority = signers.length > 3 ? signers[3].address : "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

    console.log("[Deploy] Deploying GroupDealHub for local development...");
    const HubFactory = await ethers.getContractFactory("GroupDealHub");
    const hub = await HubFactory.deploy(usdcAddress, authorizedSigner, operatorAddress, securityAuthority);
    await hub.waitForDeployment();
    const hubAddress = await hub.getAddress();
    const deployTx = hub.deploymentTransaction();
    const receipt = await deployTx?.wait(1);
    const deploymentBlock = receipt?.blockNumber ?? 1;

    console.log(`[Deploy] GroupDealHub deployed at: ${hubAddress}`);

    const runtimeBytecode = await ethers.provider.getCode(hubAddress);
    const bytecodeHash = ethers.keccak256(runtimeBytecode);

    // Update shared/manifests/local.json
    const localManifestPath = path.resolve(__dirname, "../../shared/manifests/local.json");
    if (fs.existsSync(localManifestPath)) {
      const localManifest = JSON.parse(fs.readFileSync(localManifestPath, "utf8"));
      localManifest.contracts.GroupDealHub = {
        address: hubAddress,
        deploymentBlock: deploymentBlock,
        bytecodeHash: bytecodeHash,
        txHash: deployTx?.hash,
      };
      localManifest.contracts.USDC.address = usdcAddress;
      fs.writeFileSync(localManifestPath, JSON.stringify(localManifest, null, 2) + "\n");
    }

    // Update shared/contracts.json
    const hubArtifact = await import("../artifacts/contracts/GroupDealHub.sol/GroupDealHub.json");
    const usdcArtifact = await import("../artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json");
    const contractsJson = {
      network: network.name,
      chainId: chainId,
      deploymentBlock: deploymentBlock,
      contracts: {
        GroupDealHub: {
          address: hubAddress,
          abi: hubArtifact.abi,
          bytecodeHash: bytecodeHash,
        },
        USDC: {
          address: usdcAddress,
          abi: usdcArtifact.abi,
        },
      },
      roles: {
        operator: operatorAddress,
        securityAuthority: securityAuthority,
        authorizedSigner: authorizedSigner,
      },
      deployedAt: new Date().toISOString(),
    };

    const contractsJsonPath = path.resolve(__dirname, "../../shared/contracts.json");
    fs.writeFileSync(contractsJsonPath, JSON.stringify(contractsJson, null, 2) + "\n");
    console.log(`[Deploy] Saved deployment metadata to: ${contractsJsonPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
