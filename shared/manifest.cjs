const localManifest = require("./manifests/local.json");
const arcTestnetManifest = require("./manifests/arc-testnet.json");
const arcMainnetManifest = require("./manifests/arc-mainnet.json");

function getManifest(env) {
  const targetEnv = (env || process.env.APP_ENV || process.env.VITE_APP_ENV || "arc-mainnet").toLowerCase();
  if (targetEnv === "arc-mainnet" || targetEnv === "5042") return arcMainnetManifest;
  if (targetEnv === "local" || targetEnv === "hardhat" || targetEnv === "31337") {
    return localManifest;
  }
  if (targetEnv === "arc-testnet" || targetEnv === "arc" || targetEnv === "5042002") {
    return arcTestnetManifest;
  }
  throw new Error(`[Manifest] Unknown or unsupported environment '${targetEnv}'. Must be 'local', 'arc-testnet' or 'arc-mainnet'. Fail-fast.`);
}

function validateEnvironmentOrThrow(expectedEnv, actualChainId) {
  const manifest = getManifest(expectedEnv);
  if (manifest.chainId !== actualChainId) {
    throw new Error(
      `[Security Fail-Fast] Chain ID mismatch for environment '${expectedEnv}'. Expected ${manifest.chainId}, but got ${actualChainId}!`
    );
  }
}

module.exports = {
  getManifest,
  validateEnvironmentOrThrow,
  localManifest,
  arcTestnetManifest,
  arcMainnetManifest,
};
