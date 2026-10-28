import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

import * as path from "path";
import * as os from "os";

if (!process.env.LOCALAPPDATA) {
  process.env.LOCALAPPDATA = path.join(os.tmpdir(), "groupdeal-hardhat-cache");
}

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const ARC_TESTNET_RPC = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io";
const ARC_TESTNET_ACCOUNTS: string[] = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Read/unsigned preparation only. No live signer is configured by this checkout.
    arcMainnet: {
      url: process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io",
      chainId: 5042,
      accounts: [],
    },
    arcTestnet: {
      url: ARC_TESTNET_RPC,
      chainId: 5042002,
      accounts: ARC_TESTNET_ACCOUNTS,
      gasPrice: 25_000_000_000,
      timeout: 120_000,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
