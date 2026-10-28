import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();
const {networkManifest}=require('../../shared/network.mjs') as typeof import('../../shared/network.mjs');
const manifest=networkManifest(process.env.APP_ENV || 'arc-mainnet');
const mainnet=manifest.environment==='arc-mainnet';
function previousEncryptionKeys(): Record<string,string> {
  try {
    const keys=JSON.parse(process.env.MASTER_ENCRYPTION_PREVIOUS_KEYS || "{}");
    if (!keys || Array.isArray(keys) || typeof keys!=="object" || Object.entries(keys).some(([id,key])=>!/^[-a-zA-Z0-9_]{1,64}$/.test(id)||typeof key!=="string"||key.length<32)) throw new Error();
    return keys;
  } catch { throw new Error("Invalid encryption keyring configuration"); }
}

const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
const smtpSecure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const smtpUser = process.env.SMTP_USER || "";
const smtpAppPassword = (process.env.SMTP_APP_PASSWORD || "").replace(/\s+/g, "");
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const smtpConfigured = Boolean(
  smtpHost && Number.isInteger(smtpPort) && smtpPort > 0 && smtpUser && smtpAppPassword && smtpFrom
);

export const config = {
  environment:manifest.environment as string,
  manifestPath:path.resolve(__dirname,`../../shared/manifests/${manifest.environment}.json`),
  manifest,
  runtimeDataDirectory:path.resolve(__dirname,mainnet?'../data/arc-mainnet':'../data'),
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || (mainnet?"4100":"4000"), 10),
  jwtSecret: process.env.JWT_SECRET || "groupdeal-super-secret-jwt-key-2026",
  campaignIdentitySecret:
    process.env.CAMPAIGN_IDENTITY_SECRET || "groupdeal-campaign-identity-salt-2026",
  masterEncryptionKey:
    process.env.MASTER_ENCRYPTION_KEY || "groupdeal-master-aes-key-32chars!", // 32 chars
  masterEncryptionKeyId: process.env.MASTER_ENCRYPTION_KEY_ID || "current-v1",
  previousEncryptionKeys: previousEncryptionKeys(),
  legacyEncryptionKey: process.env.MASTER_ENCRYPTION_LEGACY_KEY || process.env.MASTER_ENCRYPTION_KEY || "groupdeal-master-aes-key-32chars!",
  arcRpcUrl: process.env.ARC_RPC_URL || (!mainnet?process.env.ARC_TESTNET_RPC:undefined) || manifest.rpc.primary,
  arcRpcFallbacks:process.env.ARC_RPC_FALLBACKS!==undefined?process.env.ARC_RPC_FALLBACKS.split(',').map(s=>s.trim()).filter(Boolean):manifest.rpc.fallbacks as string[],
  arcWsUrl: process.env.ARC_WS_URL || manifest.rpc.ws,
  arcChainId: Number(process.env.ARC_CHAIN_ID || manifest.chainId),
  hubAddress: process.env.GROUPDEAL_HUB_ADDRESS || manifest.contracts.GroupDealHub.address,
  usdcAddress: process.env.USDC_ADDRESS || manifest.contracts.USDC.address,
  deploymentBlock: Number(process.env.DEPLOYMENT_BLOCK || manifest.contracts.GroupDealHub.deploymentBlock || 0),
  protocolVersion: manifest.protocolVersion || (mainnet?0:1),
  
  // Signer used to authorize buys via EIP-712
  authorizedSignerPrivateKey:
    process.env.AUTHORIZED_SIGNER_PRIVATE_KEY ||
    (mainnet?"":"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), // Local fixture only
  
  operatorAddress:
    process.env.OPERATOR_ADDRESS || (mainnet?"":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
  
  explorerUrl: process.env.EXPLORER_URL || (manifest.environment==='arc-testnet'?'https://testnet.arcscan.app':manifest.explorerUrl),
  publicAppUrl: process.env.PUBLIC_APP_URL || "",

  // Circle User-Controlled Wallets. The API key never leaves the backend.
  circleApiKey: process.env.CIRCLE_API_KEY || "",
  circleBaseUrl: process.env.CIRCLE_BASE_URL || "https://api.circle.com",
  emailProviderUrl: process.env.EMAIL_PROVIDER_URL || "",
  emailProviderToken: process.env.EMAIL_PROVIDER_TOKEN || "",
  smtpHost,
  smtpPort,
  smtpSecure,
  smtpUser,
  smtpAppPassword,
  smtpFrom,
  smtpConfigured,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

// Fail-fast assertion in production environments (Mitigation for A04)
if (config.isProduction) {
  if (!process.env.JWT_SECRET || config.jwtSecret.includes("groupdeal-super-secret")) {
    throw new Error("[SECURITY CRITICAL] Default or empty JWT_SECRET is not allowed in production!");
  }
  if (!process.env.MASTER_ENCRYPTION_KEY || config.masterEncryptionKey.includes("groupdeal-master-aes")) {
    throw new Error("[SECURITY CRITICAL] Default or empty MASTER_ENCRYPTION_KEY is not allowed in production!");
  }
  if (!process.env.CAMPAIGN_IDENTITY_SECRET || config.campaignIdentitySecret.includes("groupdeal-campaign-identity")) {
    throw new Error("[SECURITY CRITICAL] Default or empty CAMPAIGN_IDENTITY_SECRET is not allowed in production!");
  }
  if (!process.env.AUTHORIZED_SIGNER_PRIVATE_KEY || config.authorizedSignerPrivateKey.toLowerCase().includes("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")) {
    throw new Error("[SECURITY CRITICAL] Hardhat default private key is strictly forbidden for AUTHORIZED_SIGNER in production!");
  }
  if (!process.env.CIRCLE_API_KEY) {
    throw new Error("[SECURITY CRITICAL] CIRCLE_API_KEY is required for production Circle User-Controlled Wallets!");
  }
  if (!process.env.ALLOWED_ORIGINS || config.allowedOrigins.length === 0) {
    throw new Error("[SECURITY CRITICAL] ALLOWED_ORIGINS is required in production!");
  }
  const httpEmailConfigured = Boolean(config.emailProviderUrl && config.emailProviderToken);
  if (!config.smtpConfigured && !httpEmailConfigured) {
    throw new Error(
      "[SECURITY CRITICAL] Gmail SMTP or the legacy HTTP email provider is required in production!"
    );
  }
  if (httpEmailConfigured && !config.emailProviderUrl.startsWith("https://")) {
    throw new Error("[SECURITY CRITICAL] EMAIL_PROVIDER_URL must use HTTPS in production!");
  }
}
