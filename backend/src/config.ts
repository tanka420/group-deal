import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config();

const sharedContractsPath = path.resolve(__dirname, "../../shared/contracts.json");
let contractsConfig: any = {
  chainId: 31337,
  contracts: {
    GroupDealHub: { address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" },
    USDC: { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
  },
};

if (fs.existsSync(sharedContractsPath)) {
  try {
    contractsConfig = JSON.parse(fs.readFileSync(sharedContractsPath, "utf8"));
  } catch (err) {
    console.warn("Could not read shared/contracts.json, using defaults", err);
  }
}

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  jwtSecret: process.env.JWT_SECRET || "groupdeal-super-secret-jwt-key-2026",
  masterEncryptionKey:
    process.env.MASTER_ENCRYPTION_KEY || "groupdeal-master-aes-key-32chars!", // 32 chars
  arcRpcUrl: process.env.ARC_RPC_URL || process.env.ARC_TESTNET_RPC || "http://127.0.0.1:8545",
  arcChainId: parseInt(process.env.ARC_CHAIN_ID || contractsConfig.chainId?.toString() || "31337", 10),
  hubAddress: process.env.GROUPDEAL_HUB_ADDRESS || contractsConfig.contracts.GroupDealHub.address,
  usdcAddress: process.env.USDC_ADDRESS || contractsConfig.contracts.USDC.address,
  
  // Signer used to authorize buys via EIP-712
  authorizedSignerPrivateKey:
    process.env.AUTHORIZED_SIGNER_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Hardhat account 0
  
  operatorAddress:
    process.env.OPERATOR_ADDRESS || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  
  explorerUrl: process.env.EXPLORER_URL || "https://testnet.arcscan.app",
};
