import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {assertLegacyDeploymentAllowed} from './candidatePreparation';

const ARC_PREDEPLOY_USDC = "0x3600000000000000000000000000000000000000";
const ARC_BLOCKLIST_TEST_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const PUBLIC_DEVELOPMENT_ADDRESSES = new Set(
  [
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
    "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
    "0x976ea74026e726554db657fa54763abd0c3a0aa9",
    "0x14dc79964da2c08b23698b3d3cc7ca32193d9955",
    "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f",
    "0xa0ee7a142d267c1f36714e4a8f75612f20a79720",
  ].map((address) => address.toLowerCase())
);

function requireAddressEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[Deploy Fail-Closed] ${name} is required for Arc Testnet deployment.`);
  }
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) {
    throw new Error(`[Deploy Fail-Closed] ${name} must be a non-zero EVM address.`);
  }
  const address = ethers.getAddress(value);
  if (PUBLIC_DEVELOPMENT_ADDRESSES.has(address.toLowerCase())) {
    throw new Error(`[Deploy Fail-Closed] ${name} cannot use a public development account.`);
  }
  return address;
}

function requireDistinctRoles(roles: Record<string, string>) {
  const seen = new Map<string, string>();
  for (const [name, address] of Object.entries(roles)) {
    const normalized = address.toLowerCase();
    const previous = seen.get(normalized);
    if (previous) {
      throw new Error(
        `[Deploy Fail-Closed] ${name} must be distinct from ${previous}; both resolve to ${address}.`
      );
    }
    seen.set(normalized, name);
  }
}

async function main() {
  assertLegacyDeploymentAllowed(network.name);
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "[Deploy Fail-Closed] No deployer signer configured. Set DEPLOYER_PRIVATE_KEY in .env."
    );
  }

  const deployer = signers[0];
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  if (network.name === "arcTestnet" && PUBLIC_DEVELOPMENT_ADDRESSES.has(deployer.address.toLowerCase())) {
    throw new Error("[Deploy Fail-Closed] Deployer cannot use a public development account.");
  }

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

    // Every live role is explicit. Arc deployment must never fall back to local/public test accounts.
    authorizedSigner = requireAddressEnv("AUTHORIZED_SIGNER_ADDRESS");
    operatorAddress = requireAddressEnv("OPERATOR_ADDRESS");
    securityAuthority = requireAddressEnv("SECURITY_MULTISIG_ADDRESS");

    if (operatorAddress.toLowerCase() === ARC_BLOCKLIST_TEST_ADDRESS.toLowerCase()) {
      throw new Error("[Deploy Fail-Closed] Operator cannot be the Arc blocklist test address.");
    }

    requireDistinctRoles({
      deployer: deployer.address,
      authorizedSigner,
      operator: operatorAddress,
      securityMultisig: securityAuthority,
    });

    // A security authority must be a deployed multisig contract, not an EOA or EIP-7702 delegation marker.
    const securityCode = await ethers.provider.getCode(securityAuthority);
    if (securityCode === "0x") {
      throw new Error(
        "[Deploy Fail-Closed] SECURITY_MULTISIG_ADDRESS has no contract bytecode on Arc Testnet."
      );
    }
    if (securityCode.toLowerCase().startsWith("0xef0100")) {
      throw new Error(
        "[Deploy Fail-Closed] SECURITY_MULTISIG_ADDRESS is an EIP-7702 delegated account, not accepted as proof of a 2-of-3 multisig."
      );
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

    const deployedOwner = await hub.owner();
    const deployedSigner = await hub.authorizedSigner();
    const deployedOperator = await hub.operatorAddress();
    const deployedSecurityAuthority = await hub.securityAuthority();
    if (
      deployedOwner.toLowerCase() !== deployer.address.toLowerCase() ||
      deployedSigner.toLowerCase() !== authorizedSigner.toLowerCase() ||
      deployedOperator.toLowerCase() !== operatorAddress.toLowerCase() ||
      deployedSecurityAuthority.toLowerCase() !== securityAuthority.toLowerCase()
    ) {
      throw new Error("[Deploy Fail-Closed] On-chain roles do not match the requested deployment roles.");
    }

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
      arcManifest.roles.owner = {
        address: deployer.address,
        description: "GroupDealHub owner/deployer for Arc Testnet candidate",
      };
      arcManifest.roles.operator = {
        address: operatorAddress,
        description: "Dedicated GroupDeal operational wallet",
      };
      arcManifest.roles.securityAuthority = {
        type: "safe-multisig",
        address: securityAuthority,
        safeVersion: "1.5.0",
        quorum: "2-of-3",
        description: "Verified Safe emergency security multisig for Arc Testnet",
      };
      arcManifest.roles.authorizedSigner = {
        address: authorizedSigner,
        description: "Dedicated backend EIP-712 Buy Authorization signer",
      };
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
        owner: deployer.address,
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
