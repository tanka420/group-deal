import {assertDeploymentConfigured} from '../../../shared/network.mjs';
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

  const isArc = providerChainId === 5042 || providerChainId === 5042002;
  const manifestFileName = manifestNameOverride || (providerChainId===5042?"arc-mainnet.json":providerChainId===5042002?"arc-testnet.json":"local.json");

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
  if(providerChainId!==manifest.chainId)throw new Error(`[ManifestValidator REJECTED] Manifest chainId (${manifest.chainId}) does not match provider chainId (${providerChainId})`);
  if(![31337,5042002,5042].includes(providerChainId))throw new Error('[ManifestValidator REJECTED] Unsupported network');
  if((providerChainId===5042)!==(manifest.environment==='arc-mainnet'))throw new Error('[ManifestValidator REJECTED] Environment and chain differ');
  assertDeploymentConfigured(manifest);
  const protocolVersion=manifest.protocolVersion??1;
  if(![1,2].includes(protocolVersion))throw new Error("[ManifestValidator REJECTED] Unsupported protocol version");
  if (!providerOverride && (providerChainId!==config.arcChainId || manifest.contracts?.GroupDealHub?.address?.toLowerCase()!==config.hubAddress.toLowerCase()
    || manifest.contracts?.USDC?.address?.toLowerCase()!==config.usdcAddress.toLowerCase() || manifest.contracts?.GroupDealHub?.deploymentBlock!==config.deploymentBlock || protocolVersion!==config.protocolVersion)) throw new Error("[ManifestValidator REJECTED] Runtime configuration differs from the deployment manifest");

  // Both Arc networks use the native USDC ERC-20 predeploy.
  if (isArc) {
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
    if(providerChainId===5042)await verifyMainnetAuthorities(provider,manifest);

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

/** Canonical role/token/Safe readback is required even in a development process. */
async function verifyMainnetAuthorities(provider:ethers.Provider,manifest:any){
  const hub=manifest.contracts.GroupDealHub,roles=manifest.roles;
  const block=await provider.getBlock('finalized');
  if(!block?.hash||block.number<hub.deploymentBlock||!Number.isSafeInteger(block.timestamp)||Math.abs(Math.floor(Date.now()/1000)-block.timestamp)>120)throw Error('MAINNET_FINALITY_UNAVAILABLE');
  const at={blockTag:block.number};
  const contract=new ethers.Contract(hub.address,['function usdcToken() view returns(address)','function owner() view returns(address)','function authorizedSigner() view returns(address)','function operatorAddress() view returns(address)','function securityAuthority() view returns(address)'],provider);
  const token=new ethers.Contract(manifest.contracts.USDC.address,['function decimals() view returns(uint8)'],provider);
  const safe=new ethers.Contract(roles.securityAuthority.address,['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function VERSION() view returns(string)'],provider);
  const [usdc,owner,signer,operator,security,decimals,safeCode,owners,threshold,safeVersion,receipt]=await Promise.all([
    contract.usdcToken(at),contract.owner(at),contract.authorizedSigner(at),contract.operatorAddress(at),contract.securityAuthority(at),token.decimals(at),
    provider.getCode(roles.securityAuthority.address,block.number),safe.getOwners(at),safe.getThreshold(at),safe.VERSION(at),provider.getTransactionReceipt(hub.txHash)
  ]);
  const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
  if(!same(usdc,manifest.contracts.USDC.address)||!same(owner,roles.owner.address)||!same(signer,roles.authorizedSigner.address)
    ||!same(operator,roles.operator.address)||!same(security,roles.securityAuthority.address)||decimals!==6n||!safeCode||safeCode==='0x'
    ||safeCode.toLowerCase().startsWith('0xef0100')||!same(ethers.keccak256(safeCode),roles.securityAuthority.bytecodeHash)||safeVersion!==roles.securityAuthority.safeVersion
    ||threshold!==BigInt(roles.securityAuthority.threshold)||JSON.stringify([...owners].map(a=>a.toLowerCase()).sort())!==JSON.stringify([...roles.securityAuthority.owners].map(a=>a.toLowerCase()).sort())
    ||receipt?.status!==1||!receipt.contractAddress||!same(receipt.contractAddress,hub.address)||receipt.blockNumber!==hub.deploymentBlock
    ||(await provider.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash||(await provider.getBlock(block.number))?.hash!==block.hash)
    throw Error('MAINNET_DEPLOYMENT_OR_AUTHORITY_MISMATCH');
  if(!same(new ethers.Wallet(config.authorizedSignerPrivateKey).address,roles.authorizedSigner.address)||!same(config.operatorAddress,roles.operator.address))
    throw Error('MAINNET_RUNTIME_AUTHORITY_MISMATCH');
}
