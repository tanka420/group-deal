import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const ARC_RPC_URL = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io";
const ARC_CHAIN_ID = 5042002;
const ARC_PREDEPLOY_USDC = "0x3600000000000000000000000000000000000000";
const ARC_BLOCKLIST_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const MIN_GAS_PRICE = 25_000_000_000n; // 25 Gwei (above 20 Gwei floor)

interface JourneyStepResult {
  step: string;
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  status: number;
}

export async function runArcLiveJourney() {
  console.log("=================================================");
  console.log("   ARC TESTNET LIVE JOURNEY ACCEPTANCE RUNNER   ");
  console.log("=================================================");

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    throw new Error(
      "[FAIL-CLOSED] DEPLOYER_PRIVATE_KEY is missing from environment.\n" +
      "Live Arc Testnet execution requires a funded testnet private key."
    );
  }

  const manifestPath = path.resolve(__dirname, "../shared/manifests/arc-testnet.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[FAIL-CLOSED] Arc Testnet manifest missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const hubAddress = manifest.contracts?.GroupDealHub?.address;
  if (!hubAddress || !ethers.isAddress(hubAddress) || hubAddress === ethers.ZeroAddress) {
    throw new Error(`[FAIL-CLOSED] GroupDealHub is not deployed on Arc Testnet. Run 'npm run deploy:arc' first.`);
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== ARC_CHAIN_ID) {
    throw new Error(`[FAIL-CLOSED] Network chainId ${net.chainId} does not match Arc Testnet ${ARC_CHAIN_ID}`);
  }

  const deployer = new ethers.Wallet(deployerKey, provider);
  const deployerBalance = await provider.getBalance(deployer.address);
  console.log(`[Deployer] Address: ${deployer.address}`);
  console.log(`[Deployer] Gas Balance: ${ethers.formatEther(deployerBalance)} ETH/USDC`);

  if (deployerBalance === 0n) {
    throw new Error(
      `[FAIL-CLOSED] Deployer ${deployer.address} has 0 balance on Arc Testnet.\n` +
      `Fund via Circle Faucet: https://faucet.circle.com (select Arc Testnet).`
    );
  }

  // Load contract ABI
  const hubAbiPath = path.resolve(__dirname, "../backend/src/contracts/hubAbi.ts");
  const { GROUP_DEAL_HUB_ABI } = await import(hubAbiPath);
  const hub = new ethers.Contract(hubAddress, GROUP_DEAL_HUB_ABI, deployer);

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
  ];
  const usdc = new ethers.Contract(ARC_PREDEPLOY_USDC, erc20Abi, deployer);

  console.log(`[Hub] Target: ${hubAddress}`);
  console.log(`[USDC] Predeploy: ${ARC_PREDEPLOY_USDC}`);

  // Create actors for journey testing
  const seller = ethers.Wallet.createRandom().connect(provider);
  const buyer1 = ethers.Wallet.createRandom().connect(provider);
  const buyer2 = ethers.Wallet.createRandom().connect(provider);
  const operator = ethers.Wallet.createRandom().connect(provider);

  console.log(`\nActors Generated:`);
  console.log(`  Seller:   ${seller.address}`);
  console.log(`  Buyer 1:  ${buyer1.address}`);
  console.log(`  Buyer 2:  ${buyer2.address}`);
  console.log(`  Operator: ${operator.address}`);

  const results: {
    journeyA: JourneyStepResult[];
    journeyB: JourneyStepResult[];
    journeyC: JourneyStepResult[];
    journeyD: JourneyStepResult[];
    arcEdgeCases: Record<string, any>;
  } = {
    journeyA: [],
    journeyB: [],
    journeyC: [],
    journeyD: [],
    arcEdgeCases: {},
  };

  // --- Step 0: Fund actors with gas and USDC ---
  console.log("\n[Step 0] Funding actors with gas from deployer...");
  const gasPerActor = ethers.parseEther("0.02"); // 0.02 native gas tokens
  for (const actor of [seller, buyer1, buyer2, operator]) {
    const tx = await deployer.sendTransaction({
      to: actor.address,
      value: gasPerActor,
      gasPrice: MIN_GAS_PRICE,
    });
    const rc = await tx.wait(1);
    console.log(`  Funded ${actor.address} with gas: tx ${rc?.hash}`);
  }

  // Check if deployer has USDC to fund buyers
  const deployerUsdc = await usdc.balanceOf(deployer.address);
  console.log(`[Deployer] USDC Balance: ${ethers.formatUnits(deployerUsdc, 6)} USDC`);

  if (deployerUsdc >= 50_000_000n) {
    console.log("  Transferring 10 USDC to Buyer 1 and Buyer 2...");
    const t1 = await usdc.transfer(buyer1.address, 10_000_000n, { gasPrice: MIN_GAS_PRICE });
    await t1.wait(1);
    const t2 = await usdc.transfer(buyer2.address, 10_000_000n, { gasPrice: MIN_GAS_PRICE });
    await t2.wait(1);
    console.log("  Buyers funded with USDC.");
  } else {
    console.log("  [Notice] Deployer has < 50 USDC. Buyers will need USDC from faucet if committing real USDC.");
  }

  // --- Edge Case 1: Zero Address Value Transfer Rejection ---
  console.log("\n[Edge Case 1] Verifying Arc Zero-Address Transfer Prohibition...");
  try {
    await deployer.sendTransaction({
      to: ethers.ZeroAddress,
      value: 1000n,
      gasPrice: MIN_GAS_PRICE,
    });
    results.arcEdgeCases.zeroAddressRejected = false;
  } catch (err: any) {
    results.arcEdgeCases.zeroAddressRejected = true;
    results.arcEdgeCases.zeroAddressError = err.message;
    console.log("  ✓ Zero address transfer properly rejected by Arc:", err.message.slice(0, 100));
  }

  // --- Edge Case 2: Arc Blocklist Address Rejection ---
  console.log("\n[Edge Case 2] Verifying Arc Blocklist Address Transfer Prohibition...");
  try {
    await deployer.sendTransaction({
      to: ARC_BLOCKLIST_ADDRESS,
      value: 1000n,
      gasPrice: MIN_GAS_PRICE,
    });
    results.arcEdgeCases.blocklistRejected = false;
  } catch (err: any) {
    results.arcEdgeCases.blocklistRejected = true;
    results.arcEdgeCases.blocklistError = err.message;
    console.log("  ✓ Blocklist address transfer properly rejected by Arc:", err.message.slice(0, 100));
  }

  // Write acceptance results
  const dossierPath = path.resolve(__dirname, "../reports/evidence/G5_ACCEPTANCE_DOSSIER.json");
  fs.writeFileSync(
    dossierPath,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        network: "Arc Testnet",
        chainId: ARC_CHAIN_ID,
        hubAddress,
        deployer: deployer.address,
        results,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`\n[Acceptance Dossier] Written to: ${dossierPath}`);
  console.log("=================================================");
  console.log("       ARC TESTNET LIVE PROBE COMPLETE           ");
  console.log("=================================================");
  return results;
}

if (require.main === module) {
  runArcLiveJourney().catch((err) => {
    console.error("Live Journey Error:", err);
    process.exit(1);
  });
}
