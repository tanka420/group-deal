import { ethers } from "ethers";
import { config } from "../config";

import { HUB_ABI } from "../contracts/hubAbi";
export { HUB_ABI };

export class OnchainService {
  private static providerInstance: ethers.JsonRpcProvider | null = null;

  public static getProvider(): ethers.JsonRpcProvider {
    if (!this.providerInstance) {
      this.providerInstance = new ethers.JsonRpcProvider(config.arcRpcUrl, config.arcChainId, {
        staticNetwork: true,
      });
    }
    return this.providerInstance;
  }

  public static getHubContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
    const p = signerOrProvider || this.getProvider();
    return new ethers.Contract(config.hubAddress, HUB_ABI, p);
  }

  /**
   * Verify an already broadcast transaction hash
   */
  public static async verifyTxReceipt(txHash: string): Promise<ethers.TransactionReceipt> {
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error(`Transaction ${txHash} not yet mined or found on Arc network`);
    }
    if (receipt.status !== 1) {
      throw new Error(`Transaction ${txHash} failed / reverted onchain`);
    }
    return receipt;
  }
}
