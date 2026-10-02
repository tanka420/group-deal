import { ethers, network } from "hardhat";
import Safe from "@safe-global/protocol-kit";
import * as fs from "fs";
import * as path from "path";

const ARC_CHAIN_ID = 5042002;
const SAFE_VERSION = "1.5.0" as const;
const THRESHOLD = 2;
const GAS_PRICE = 25_000_000_000n;
const EXPECTED_DEPLOYER = "0x73307Bdd39d875F98857FfCE0FED1Cdc62F50b6d";
const EXECUTION_ACK = "I_UNDERSTAND_THIS_DEPLOYS_A_SAFE_ON_ARC_TESTNET";
const OWNERS = [
  "0x73307bdd39d875f98857ffce0fed1cdc62f50b6d",
  "0xc289b853d90f2c604fd38458b1ce4b991156d18b",
  "0x7366adbf19e511095e7737138498f625d737db22",
].map((address) => ethers.getAddress(address));

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function assertExpectedOwners(actualOwners: string[]) {
  const actual = new Set(actualOwners.map((address) => address.toLowerCase()));
  const expected = new Set(OWNERS.map((address) => address.toLowerCase()));
  if (actual.size !== expected.size || [...expected].some((address) => !actual.has(address))) {
    throw new Error(
      `[FAIL-CLOSED] Safe owners mismatch. Expected ${OWNERS.join(", ")}; got ${actualOwners.join(", ")}.`
    );
  }
}

async function main() {
  const execute =
    process.argv.includes("--execute") || process.env.SECURITY_MULTISIG_EXECUTE === "true";
  if (execute && process.env.ALLOW_SECURITY_MULTISIG_DEPLOY !== EXECUTION_ACK) {
    throw new Error(
      `[FAIL-CLOSED] Live mode requires ALLOW_SECURITY_MULTISIG_DEPLOY=${EXECUTION_ACK}.`
    );
  }

  if (network.name !== "arcTestnet") {
    throw new Error(`[FAIL-CLOSED] Expected arcTestnet, got ${network.name}.`);
  }
  const providerNetwork = await ethers.provider.getNetwork();
  if (Number(providerNetwork.chainId) !== ARC_CHAIN_ID) {
    throw new Error(`[FAIL-CLOSED] Expected chain ${ARC_CHAIN_ID}, got ${providerNetwork.chainId}.`);
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer || !sameAddress(deployer.address, EXPECTED_DEPLOYER)) {
    throw new Error(
      `[FAIL-CLOSED] Deployer must be ${EXPECTED_DEPLOYER}; got ${deployer?.address ?? "none"}.`
    );
  }
  if (new Set(OWNERS.map((address) => address.toLowerCase())).size !== 3) {
    throw new Error("[FAIL-CLOSED] Safe owners must be three distinct addresses.");
  }

  const rpcUrl = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io";
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) throw new Error("[FAIL-CLOSED] DEPLOYER_PRIVATE_KEY is missing.");

  const saltNonce = BigInt(
    ethers.keccak256(
      ethers.toUtf8Bytes(`groupdeal:arc-testnet:security-safe:v1:${OWNERS.join(":")}:${THRESHOLD}`)
    )
  ).toString();

  const predictedSafe = await Safe.init({
    provider: rpcUrl,
    signer: deployerKey,
    predictedSafe: {
      safeAccountConfig: { owners: OWNERS, threshold: THRESHOLD },
      safeDeploymentConfig: {
        safeVersion: SAFE_VERSION,
        saltNonce,
        deploymentType: "canonical",
      },
    },
  });
  const safeAddress = ethers.getAddress(await predictedSafe.getAddress());
  const existingCode = await ethers.provider.getCode(safeAddress);

  console.log("=== ARC SECURITY MULTISIG PREFLIGHT ===");
  console.log(`Mode: ${execute ? "LIVE EXECUTION" : "READ-ONLY DRY RUN"}`);
  console.log(`Chain: ${providerNetwork.chainId}`);
  console.log(`Safe version: ${SAFE_VERSION}`);
  console.log(`Predicted Safe: ${safeAddress}`);
  console.log(`Owners: ${OWNERS.join(", ")}`);
  console.log(`Threshold: ${THRESHOLD}-of-${OWNERS.length}`);
  console.log(`Already deployed: ${existingCode !== "0x"}`);

  let deploymentReceipt: Awaited<ReturnType<Awaited<ReturnType<typeof deployer.sendTransaction>>["wait"]>> | null = null;
  if (existingCode === "0x") {
    if (!execute) {
      console.log("DRY RUN COMPLETE: no Safe deployment transaction was signed or broadcast.");
      return;
    }
    const deploymentTransaction = await predictedSafe.createSafeDeploymentTransaction();
    const transaction = await deployer.sendTransaction({
      to: deploymentTransaction.to,
      data: deploymentTransaction.data,
      value: BigInt(deploymentTransaction.value || "0"),
      gasPrice: GAS_PRICE,
    });
    console.log(`[BROADCAST] Safe deployment: ${transaction.hash}`);
    deploymentReceipt = await transaction.wait(2);
    if (!deploymentReceipt || deploymentReceipt.status !== 1) {
      throw new Error("[FAIL-CLOSED] Safe deployment transaction did not confirm successfully.");
    }
  }

  const deployedCode = await ethers.provider.getCode(safeAddress);
  if (deployedCode === "0x" || deployedCode.toLowerCase().startsWith("0xef0100")) {
    throw new Error("[FAIL-CLOSED] Safe address does not contain accepted contract bytecode.");
  }

  const deployedSafe = await Safe.init({ provider: rpcUrl, safeAddress });
  const [actualOwners, actualThreshold] = await Promise.all([
    deployedSafe.getOwners(),
    deployedSafe.getThreshold(),
  ]);
  assertExpectedOwners(actualOwners);
  if (actualThreshold !== THRESHOLD) {
    throw new Error(`[FAIL-CLOSED] Safe threshold mismatch: expected ${THRESHOLD}, got ${actualThreshold}.`);
  }
  if (deployedSafe.getContractVersion() !== SAFE_VERSION) {
    throw new Error(
      `[FAIL-CLOSED] Safe version mismatch: expected ${SAFE_VERSION}, got ${deployedSafe.getContractVersion()}.`
    );
  }

  const evidence = {
    verifiedAt: new Date().toISOString(),
    chainId: ARC_CHAIN_ID,
    safeAddress,
    safeVersion: deployedSafe.getContractVersion(),
    owners: actualOwners,
    threshold: actualThreshold,
    runtimeBytecodeHash: ethers.keccak256(deployedCode),
    deploymentTxHash: deploymentReceipt?.hash ?? null,
    deploymentBlock: deploymentReceipt?.blockNumber ?? null,
    status: "VERIFIED_2_OF_3",
  };
  const evidencePath = path.resolve(__dirname, "../../reports/evidence/ARC_SECURITY_MULTISIG.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`SAFE VERIFIED: ${safeAddress}`);
  console.log(`Evidence: ${evidencePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
