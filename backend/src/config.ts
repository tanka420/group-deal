import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config();

const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
const smtpSecure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const smtpUser = process.env.SMTP_USER || "";
const smtpAppPassword = (process.env.SMTP_APP_PASSWORD || "").replace(/\s+/g, "");
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const smtpConfigured = Boolean(
  smtpHost && Number.isInteger(smtpPort) && smtpPort > 0 && smtpUser && smtpAppPassword && smtpFrom
);

const possiblePaths = [
  path.resolve(__dirname, "../../shared/contracts.json"),
  path.resolve(__dirname, "../../../shared/contracts.json"),
  path.resolve(process.cwd(), "shared/contracts.json"),
];
let contractsConfig: any = {
  chainId: 31337,
  contracts: {
    GroupDealHub: { address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" },
    USDC: { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
  },
};

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    try {
      contractsConfig = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    } catch (err) {
      console.warn(`Could not parse ${p}`, err);
    }
  }
}

export const config = {
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "4000", 10),
  jwtSecret: process.env.JWT_SECRET || "groupdeal-super-secret-jwt-key-2026",
  campaignIdentitySecret:
    process.env.CAMPAIGN_IDENTITY_SECRET || "groupdeal-campaign-identity-salt-2026",
  masterEncryptionKey:
    process.env.MASTER_ENCRYPTION_KEY || "groupdeal-master-aes-key-32chars!", // 32 chars
  arcRpcUrl: process.env.ARC_RPC_URL || process.env.ARC_TESTNET_RPC || "http://127.0.0.1:8545",
  arcWsUrl: process.env.ARC_WS_URL || (process.env.ARC_TESTNET_RPC ? process.env.ARC_TESTNET_RPC.replace(/^http/, "ws") : "wss://rpc.testnet.arc.io"),
  arcChainId: parseInt(process.env.ARC_CHAIN_ID || contractsConfig.chainId?.toString() || "31337", 10),
  hubAddress: process.env.GROUPDEAL_HUB_ADDRESS || contractsConfig.contracts.GroupDealHub.address,
  usdcAddress: process.env.USDC_ADDRESS || contractsConfig.contracts.USDC.address,
  deploymentBlock: parseInt(process.env.DEPLOYMENT_BLOCK || contractsConfig.deploymentBlock?.toString() || "0", 10),
  
  // Signer used to authorize buys via EIP-712
  authorizedSignerPrivateKey:
    process.env.AUTHORIZED_SIGNER_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Hardhat account 0
  
  operatorAddress:
    process.env.OPERATOR_ADDRESS || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  
  explorerUrl: process.env.EXPLORER_URL || "https://testnet.arcscan.app",

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
