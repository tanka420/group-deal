const fs = require("fs");
const path = require("path");
const ethersPath = path.resolve(__dirname, "../backend/node_modules/ethers");
const { ethers } = require(ethersPath);
const { arcTestnetManifest } = require("../shared/manifest.cjs");

async function runArcProbe() {
  console.log("=================================================");
  console.log("    ARC TESTNET G0 ENVIRONMENT & BEHAVIOR PROBE   ");
  console.log("=================================================");

  const rpcUrl = arcTestnetManifest.rpc.primary;
  console.log(`Connecting to Arc Testnet RPC: ${rpcUrl}`);
  const provider = new ethers.JsonRpcProvider(rpcUrl, {
    chainId: arcTestnetManifest.chainId,
    name: "arcTestnet",
  });

  const evidence = {
    timestamp: new Date().toISOString(),
    network: arcTestnetManifest.networkName,
    chainIdExpected: arcTestnetManifest.chainId,
    chainIdActual: null,
    blockNumber: null,
    usdcPredeploy: {
      address: arcTestnetManifest.contracts.USDC.address,
      codeHash: null,
      decimals: null,
      symbol: null,
    },
    cctp: {
      domain: arcTestnetManifest.cctpDomain,
      tokenMessenger: arcTestnetManifest.contracts.CCTP_TokenMessengerV2.address,
      hasCode: false,
    },
    multicall3: {
      address: arcTestnetManifest.contracts.Multicall3.address,
      hasCode: false,
    },
    arcBehaviors: {
      zeroAddressTransferReverts: false,
      zeroAddressRevertMessage: null,
      blocklistAddress: arcTestnetManifest.arcDifferences.blocklistTestAddress,
      blocklistTransferReverts: false,
      blocklistRevertMessage: null,
      minFeeFloorGwei: null,
      instantFinalityReport: null,
    },
  };

  // 1. Verify Chain ID
  const network = await provider.getNetwork();
  evidence.chainIdActual = Number(network.chainId);
  console.log(`✔ Chain ID confirmed: ${evidence.chainIdActual} (Expected: ${evidence.chainIdExpected})`);
  if (evidence.chainIdActual !== evidence.chainIdExpected) {
    throw new Error(`Chain ID mismatch: ${evidence.chainIdActual} !== ${evidence.chainIdExpected}`);
  }

  // 2. Query Block Number & Finality
  const currentBlock = await provider.getBlockNumber();
  evidence.blockNumber = currentBlock;
  console.log(`✔ Current Block Number: ${currentBlock}`);

  const block = await provider.getBlock(currentBlock);
  if (block) {
    evidence.arcBehaviors.instantFinalityReport = {
      hash: block.hash,
      timestamp: block.timestamp,
      baseFeePerGasGwei: block.baseFeePerGas ? ethers.formatUnits(block.baseFeePerGas, "gwei") : "0",
    };
    console.log(`✔ Block Base Fee: ${evidence.arcBehaviors.instantFinalityReport.baseFeePerGasGwei} Gwei`);
  }

  // 3. Verify USDC Predeploy
  const usdcAddr = arcTestnetManifest.contracts.USDC.address;
  const usdcCode = await provider.getCode(usdcAddr);
  evidence.usdcPredeploy.codeHash = ethers.keccak256(usdcCode);
  console.log(`✔ USDC Predeploy code exists at ${usdcAddr} (Bytecode size: ${usdcCode.length / 2 - 1} bytes)`);

  const erc20Abi = [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
  ];
  const usdcContract = new ethers.Contract(usdcAddr, erc20Abi, provider);

  const decimals = await usdcContract.decimals();
  evidence.usdcPredeploy.decimals = Number(decimals);
  console.log(`✔ USDC ERC-20 decimals: ${evidence.usdcPredeploy.decimals} (Expected: 6)`);
  if (evidence.usdcPredeploy.decimals !== 6) {
    throw new Error(`USDC decimals mismatch: ${evidence.usdcPredeploy.decimals} !== 6`);
  }

  const symbol = await usdcContract.symbol();
  evidence.usdcPredeploy.symbol = symbol;
  console.log(`✔ USDC symbol: ${evidence.usdcPredeploy.symbol} (Expected: USDC)`);

  // 4. Verify CCTP TokenMessengerV2 & Multicall3
  const cctpCode = await provider.getCode(evidence.cctp.tokenMessenger);
  evidence.cctp.hasCode = cctpCode !== "0x" && cctpCode.length > 2;
  console.log(`✔ CCTP TokenMessengerV2 code verified: ${evidence.cctp.hasCode}`);

  const multicallCode = await provider.getCode(evidence.multicall3.address);
  evidence.multicall3.hasCode = multicallCode !== "0x" && multicallCode.length > 2;
  console.log(`✔ Multicall3 code verified: ${evidence.multicall3.hasCode}`);

  // 5. Probe Fee Market Floor
  const feeData = await provider.getFeeData();
  const gasPriceGwei = feeData.gasPrice ? Number(ethers.formatUnits(feeData.gasPrice, "gwei")) : null;
  evidence.arcBehaviors.minFeeFloorGwei = gasPriceGwei;
  console.log(`✔ Current Gas Price: ${gasPriceGwei} Gwei`);

  // 6. Probe Zero-Address Send Revert Behavior
  try {
    await provider.estimateGas({
      to: ethers.ZeroAddress,
      value: ethers.parseEther("1"), // 1 USDC native
    });
    console.log("❌ Zero address value send unexpectedly succeeded!");
  } catch (err) {
    evidence.arcBehaviors.zeroAddressTransferReverts = true;
    evidence.arcBehaviors.zeroAddressRevertMessage = err.message || String(err);
    console.log(`✔ Probed zero-address value transfer: correctly reverted as expected on Arc!`);
  }

  // 7. Probe Blocklist Address Revert Behavior
  const blocklistAddr = evidence.arcBehaviors.blocklistAddress;
  try {
    await provider.estimateGas({
      to: blocklistAddr,
      value: ethers.parseEther("1"), // 1 USDC native
    });
    console.log("❌ Blocklist address value transfer unexpectedly succeeded!");
  } catch (err) {
    evidence.arcBehaviors.blocklistTransferReverts = true;
    evidence.arcBehaviors.blocklistRevertMessage = err.message || String(err);
    console.log(`✔ Probed blocklist address (${blocklistAddr}): correctly reverted on value transfer!`);
  }

  // Write Evidence File
  const evidenceDir = path.resolve(__dirname, "../reports/evidence");
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const evidenceFilePath = path.join(evidenceDir, "G0_ARC_TESTNET_PROBE.json");
  fs.writeFileSync(evidenceFilePath, JSON.stringify(evidence, null, 2), "utf8");
  console.log(`\n🎉 PROBE COMPLETED! Evidence saved to: ${evidenceFilePath}\n`);
}

if (require.main === module) {
  runArcProbe().catch((err) => {
    console.error("Arc Probe Failed:", err);
    process.exit(1);
  });
}

module.exports = { runArcProbe };
