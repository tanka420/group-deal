const localManifest = require("./manifests/local.json");
const arcTestnetManifest = require("./manifests/arc-testnet.json");

function getManifest(env) {
  const targetEnv = (env || process.env.APP_ENV || process.env.VITE_APP_ENV || "arc-testnet").toLowerCase();
  if (targetEnv === "local" || targetEnv === "hardhat" || targetEnv === "31337") {
    return localManifest;
  }
  if (targetEnv === "arc-testnet" || targetEnv === "arc" || targetEnv === "5042002") {
    return arcTestnetManifest;
  }
  throw new Error(`[Manifest] Unknown or unsupported environment '${targetEnv}'. Must be 'local' or 'arc-testnet'. Fail-fast.`);
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
};
