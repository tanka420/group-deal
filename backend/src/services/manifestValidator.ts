import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { config } from "../config";
import { ArcReadProvider } from "./arcReadProvider";

export interface ManifestValidationResult {
  valid: boolean;
  environment: string;
  chainId: number;
  hubAddress: string;
  bytecodeHash?: string;
  protocolVersion?:number;
}

export async function validateManifestAndEnvironment(
  providerOverride?: ethers.Provider,
  manifestNameOverride?: string
): Promise<ManifestValidationResult> {
  const provider = providerOverride || new ArcReadProvider();
  try {
  const net = await provider.getNetwork();
  const providerChainId = Number(net.chainId);

  const isArc = providerChainId === 5042002;
  const manifestFileName = manifestNameOverride || (isArc ? "arc-testnet.json" : "local.json");

  const possiblePaths = manifestNameOverride && path.isAbsolute(manifestNameOverride) ? [manifestNameOverride] : [
    path.resolve(__dirname, `../../shared/manifests/${manifestFileName}`),
    path.resolve(__dirname, `../../../shared/manifests/${manifestFileName}`),
    path.resolve(process.cwd(), `shared/manifests/${manifestFileName}`),
  ];

  let manifestPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      manifestPath = p;
      break;
    }
  }

  if (!manifestPath) {
    throw new Error(`[ManifestValidator] Environment manifest file not found: ${manifestFileName}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const protocolVersion=manifest.protocolVersion??1;
  if(![1,2].includes(protocolVersion))throw new Error("[ManifestValidator REJECTED] Unsupported protocol version");
  if (!providerOverride && (providerChainId!==config.arcChainId || manifest.contracts?.GroupDealHub?.address?.toLowerCase()!==config.hubAddress.toLowerCase()
    || manifest.contracts?.USDC?.address?.toLowerCase()!==config.usdcAddress.toLowerCase() || manifest.contracts?.GroupDealHub?.deploymentBlock!==config.deploymentBlock || protocolVersion!==config.protocolVersion)) throw new Error("[ManifestValidator REJECTED] Runtime configuration differs from the deployment manifest");

  // 1. Validate chain ID match
  if (providerChainId !== manifest.chainId) {
    throw new Error(
      `[ManifestValidator REJECTED] Manifest chainId (${manifest.chainId}) does not match provider chainId (${providerChainId})`
    );
  }

  // 2. Arc Testnet specific enforcements
  if (providerChainId === 5042002) {
    const expectedUsdc = "0x3600000000000000000000000000000000000000";
    if (manifest.contracts?.USDC?.address?.toLowerCase() !== expectedUsdc.toLowerCase()) {
      throw new Error(
        `[ManifestValidator REJECTED] Arc Testnet USDC must be ${expectedUsdc}, got ${manifest.contracts?.USDC?.address}`
      );
    }

    // Verify USDC code exists onchain
    const usdcCode = await provider.getCode(expectedUsdc);
    if (!usdcCode || usdcCode === "0x") {
      throw new Error(`[ManifestValidator REJECTED] Arc Predeploy USDC at ${expectedUsdc} has no bytecode on chain!`);
    }

    // Operator cannot be blocklisted address
    const operatorAddr = typeof manifest.roles?.operator === "string"
      ? manifest.roles.operator
      : manifest.roles?.operator?.address;
    if (operatorAddr?.toLowerCase() === "0x70997970c51812dc3a010c7d01b50e0d17dc79c8") {
      throw new Error(`[ManifestValidator REJECTED] Operator cannot be the Arc blocklist test address (0x7099...79C8)`);
    }
  }

  // 3. Validate GroupDealHub contract and bytecode
  const hubAddress = manifest.contracts?.GroupDealHub?.address || config.hubAddress;
  if (!hubAddress || !ethers.isAddress(hubAddress) || hubAddress === ethers.ZeroAddress) {
    if (config.isProduction || isArc) {
      throw new Error(`[ManifestValidator REJECTED] GroupDealHub address is missing or invalid in ${manifest.environment} manifest.`);
    }
  } else {
    const code = await provider.getCode(hubAddress);
    if (!code || code === "0x") {
      throw new Error(`[ManifestValidator REJECTED] GroupDealHub at ${hubAddress} has no deployed bytecode on chain ${providerChainId}!`);
    }

    const onchainBytecodeHash = ethers.keccak256(code);
    const expectedBytecodeHash = manifest.contracts?.GroupDealHub?.bytecodeHash;
    if(isArc&&!ethers.isHexString(expectedBytecodeHash,32))throw new Error("[ManifestValidator REJECTED] Arc requires a pinned runtime bytecode hash");
    if (expectedBytecodeHash && expectedBytecodeHash.length === 66) {
      if (onchainBytecodeHash.toLowerCase() !== expectedBytecodeHash.toLowerCase()) {
        throw new Error(
          `[ManifestValidator REJECTED] Bytecode hash mismatch for GroupDealHub!\n` +
          `Expected: ${expectedBytecodeHash}\n` +
          `Actual onchain: ${onchainBytecodeHash}`
        );
      }
    }
    if(protocolVersion===2) {
      const declaredVersion=await new ethers.Contract(hubAddress,["function protocolVersion() view returns(uint256)"],provider).protocolVersion();
      if(declaredVersion!==2n)throw new Error("[ManifestValidator REJECTED] Protocol version differs from deployed code");
    }

    return {
      valid: true,
      environment: manifest.environment,
      chainId: providerChainId,
      hubAddress,
      bytecodeHash: onchainBytecodeHash,
      protocolVersion,
    };
  }

  return {
    valid: true,
    environment: manifest.environment,
    chainId: providerChainId,
    hubAddress: hubAddress || "",
    protocolVersion,
  };
  } finally {if(!providerOverride)(provider as ethers.JsonRpcProvider).destroy();}
}
