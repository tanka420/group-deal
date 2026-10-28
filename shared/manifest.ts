import localManifest from "./manifests/local.json";
import arcTestnetManifest from "./manifests/arc-testnet.json";
import arcMainnetManifest from "./manifests/arc-mainnet.json";

export type EnvironmentName = "local" | "arc-testnet" | "arc-mainnet";

export interface NetworkManifest {
  protocolVersion?:1|2|null;
  deploymentStatus?:string;
  environment: EnvironmentName;
  networkName: string;
  chainId: number;
  chainIdHex: string;
  rpc: {
    primary: string;
    ws: string;
    fallbacks: string[];
  };
  explorerUrl: string;
  faucetUrl: string;
  cctpDomain: number;
  contracts: {
    USDC: {
      address: string;
      symbol: string;
      businessDecimals: number;
      nativeGasDecimals: number;
      isPredeploy: boolean;
      isMock: boolean;
    };
    GroupDealHub: {
      address: string;
      deploymentBlock: number;
      bytecodeHash?: string;
    };
    [key: string]: any;
  };
  roles?: Record<string,any>;
  arcDifferences?: {
    minBaseFeeGwei: number;
    deterministicFinality: boolean;
    nonDecreasingTimestamps: boolean;
    blocklistTestAddress: string;
    zeroAddressValueTransferForbidden: boolean;
  };
}

export function getManifest(env?: string): NetworkManifest {
  const targetEnv = (env || process.env.APP_ENV || process.env.VITE_APP_ENV || "arc-mainnet").toLowerCase();
  if (targetEnv === "arc-mainnet" || targetEnv === "5042") return arcMainnetManifest as NetworkManifest;
  if (targetEnv === "local" || targetEnv === "hardhat" || targetEnv === "31337") {
    return localManifest as NetworkManifest;
  }
  if (targetEnv === "arc-testnet" || targetEnv === "arc" || targetEnv === "5042002") {
    return arcTestnetManifest as NetworkManifest;
  }
  throw new Error(`[Manifest] Unknown or unsupported environment '${targetEnv}'. Must be 'local', 'arc-testnet' or 'arc-mainnet'. Fail-fast.`);
}

export function validateEnvironmentOrThrow(expectedEnv: EnvironmentName, actualChainId: number) {
  const manifest = getManifest(expectedEnv);
  if (manifest.chainId !== actualChainId) {
    throw new Error(
      `[Security Fail-Fast] Chain ID mismatch for environment '${expectedEnv}'. Expected ${manifest.chainId}, but got ${actualChainId}!`
    );
  }
}
