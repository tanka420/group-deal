import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const requireFromBackend = createRequire(path.resolve(__dirname, "../backend/package.json"));
const { ethers } = requireFromBackend("ethers");
const dotenv = requireFromBackend("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ARC_CHAIN_ID = 5042002;
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const LEGACY_HUB = "0x7d4b958b3e19DA4c5374F70F84297748E5a79F9a";
const EXPECTED = {
  owner: "0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d",
  authorizedSigner: "0xc9691f85f149e71C4e1C14c6E6204128546Eef17",
  operator: "0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead",
  securityAuthority: "0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6",
  safeOwners: [
    "0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d",
    "0xc289b853d90F2C604FD38458B1cE4B991156d18B",
    "0x7366adBf19E511095e7737138498f625D737dB22",
  ],
};

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

async function main() {
  const manifestPath = path.resolve(__dirname, "../shared/manifests/arc-testnet.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const hubAddress = manifest.contracts.GroupDealHub.address;
  const rpcUrl = process.env.ARC_TESTNET_RPC || manifest.rpc.primary;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== ARC_CHAIN_ID || manifest.chainId !== ARC_CHAIN_ID) {
    throw new Error("[VERIFY FAILED] Arc chain ID mismatch.");
  }

  const block = await provider.getBlock("latest");
  if (!block) throw new Error("[VERIFY FAILED] Cannot read latest Arc block.");
  const blockTag = block.number;
  const artifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../contracts/artifacts/contracts/GroupDealHub.sol/GroupDealHub.json"),
      "utf8"
    )
  );
  const hub = new ethers.Contract(hubAddress, artifact.abi, provider);
  const legacyHub = new ethers.Contract(LEGACY_HUB, artifact.abi, provider);
  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const safe = new ethers.Contract(
    EXPECTED.securityAuthority,
    [
      "function getOwners() view returns (address[])",
      "function getThreshold() view returns (uint256)",
      "function VERSION() view returns (string)",
    ],
    provider
  );

  const [
    hubCode,
    owner,
    authorizedSigner,
    operator,
    securityAuthority,
    token,
    nextCampaignId,
    nextOrderId,
    newHubBalance,
    oldEscrow,
    oldHubBalance,
    safeCode,
    safeOwners,
    safeThreshold,
    safeVersion,
    deploymentReceipt,
  ] = await Promise.all([
    provider.getCode(hubAddress, blockTag),
    hub.owner({ blockTag }),
    hub.authorizedSigner({ blockTag }),
    hub.operatorAddress({ blockTag }),
    hub.securityAuthority({ blockTag }),
    hub.usdcToken({ blockTag }),
    hub.nextCampaignId({ blockTag }),
    hub.nextOrderId({ blockTag }),
    usdc.balanceOf(hubAddress, { blockTag }),
    legacyHub.campaignEscrowBalance(1n, { blockTag }),
    usdc.balanceOf(LEGACY_HUB, { blockTag }),
    provider.getCode(EXPECTED.securityAuthority, blockTag),
    safe.getOwners({ blockTag }),
    safe.getThreshold({ blockTag }),
    safe.VERSION({ blockTag }),
    provider.getTransactionReceipt(manifest.contracts.GroupDealHub.txHash),
  ]);

  const actualRoles = { owner, authorizedSigner, operator, securityAuthority };
  for (const [role, expectedAddress] of Object.entries(EXPECTED).filter(([key]) => key !== "safeOwners")) {
    if (!sameAddress((actualRoles as Record<string, string>)[role], expectedAddress as string)) {
      throw new Error(`[VERIFY FAILED] ${role} mismatch.`);
    }
  }
  if (!sameAddress(token, USDC_ADDRESS)) throw new Error("[VERIFY FAILED] USDC mismatch.");
  if (hubCode === "0x" || ethers.keccak256(hubCode) !== manifest.contracts.GroupDealHub.bytecodeHash) {
    throw new Error("[VERIFY FAILED] Hub bytecode/hash mismatch.");
  }
  if (!deploymentReceipt || deploymentReceipt.status !== 1 || deploymentReceipt.blockNumber !== manifest.contracts.GroupDealHub.deploymentBlock) {
    throw new Error("[VERIFY FAILED] Hub deployment receipt mismatch.");
  }
  if (safeCode === "0x" || safeCode.toLowerCase().startsWith("0xef0100")) {
    throw new Error("[VERIFY FAILED] Safe bytecode invalid.");
  }
  const expectedOwners = new Set(EXPECTED.safeOwners.map((address) => address.toLowerCase()));
  const actualOwnerSet = new Set((safeOwners as string[]).map((address) => address.toLowerCase()));
  if (actualOwnerSet.size !== 3 || [...expectedOwners].some((address) => !actualOwnerSet.has(address))) {
    throw new Error("[VERIFY FAILED] Safe owners mismatch.");
  }
  if (safeThreshold !== 2n || safeVersion !== "1.5.0") {
    throw new Error("[VERIFY FAILED] Safe threshold/version mismatch.");
  }
  if (nextCampaignId !== 1n || nextOrderId !== 1n || newHubBalance !== 0n) {
    throw new Error("[VERIFY FAILED] New Hub is not in a clean initial state.");
  }
  if (oldEscrow !== 0n || oldHubBalance !== 0n) {
    throw new Error("[VERIFY FAILED] Legacy Hub cleanup is incomplete.");
  }

  const evidence = {
    verifiedAt: new Date().toISOString(),
    fixedBlock: { number: block.number, hash: block.hash, timestamp: block.timestamp },
    chainId: ARC_CHAIN_ID,
    hub: {
      address: hubAddress,
      deploymentTxHash: deploymentReceipt.hash,
      deploymentBlock: deploymentReceipt.blockNumber,
      runtimeBytecodeHash: ethers.keccak256(hubCode),
      owner,
      authorizedSigner,
      operator,
      securityAuthority,
      usdc: token,
      nextCampaignId: nextCampaignId.toString(),
      nextOrderId: nextOrderId.toString(),
      usdcBalance: newHubBalance.toString(),
    },
    safe: {
      address: EXPECTED.securityAuthority,
      version: safeVersion,
      owners: safeOwners,
      threshold: Number(safeThreshold),
      runtimeBytecodeHash: ethers.keccak256(safeCode),
    },
    legacyCleanup: {
      hub: LEGACY_HUB,
      campaignEscrow: oldEscrow.toString(),
      hubUsdcBalance: oldHubBalance.toString(),
    },
    status: "PASS",
  };
  const evidencePath = path.resolve(__dirname, "../reports/evidence/ARC_CANDIDATE_DEPLOYMENT_VERIFY.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`ARC CANDIDATE VERIFY PASS at block ${block.number}`);
  console.log(`Hub: ${hubAddress}`);
  console.log(`Safe: ${EXPECTED.securityAuthority} (${safeThreshold}-of-${safeOwners.length}, v${safeVersion})`);
  console.log(`Legacy escrow/balance: ${oldEscrow}/${oldHubBalance}`);
  console.log(`Evidence: ${evidencePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
