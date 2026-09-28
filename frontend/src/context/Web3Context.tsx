import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";
import { useAuth } from "./AuthContext";

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
  usdcBalance: string;
  isConnecting: boolean;
  hubAddress: string;
  usdcAddress: string;
  walletMode: "INJECTED" | "CIRCLE_EMBEDDED" | "DISCONNECTED";
  connectInjectedWallet: () => Promise<string>;
  switchToCircleWallet: () => void;
  claimFaucet: () => Promise<{ success: boolean; txHash: string }>;
  commitToBuyOnchain: (params: {
    campaignId: number;
    campaignIdentity: string;
    quantity: number;
    requireEarlySlot: boolean;
    maxAuthQuantity: number;
    authDeadline: number;
    authSignature: string;
    lockedUnitPriceUSDC: string;
  }) => Promise<{ txHash: string }>;
  claimBuyerFundsOnchain: (campaignId: number, orderIds: number[]) => Promise<{ txHash: string }>;
  claimSellerProceedsOnchain: (campaignId: number, orderIds: number[]) => Promise<{ txHash: string }>;
  confirmReceiptOnchain: (campaignId: number, orderId: number) => Promise<{ txHash: string }>;
  openDisputeOnchain: (campaignId: number, orderId: number, reason: string) => Promise<{ txHash: string }>;
  refreshBalance: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType>({} as Web3ContextType);

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [walletMode, setWalletMode] = useState<"INJECTED" | "CIRCLE_EMBEDDED" | "DISCONNECTED">(
    "DISCONNECTED"
  );

  const [hubAddress, setHubAddress] = useState<string>("");
  const [usdcAddress, setUsdcAddress] = useState<string>("");

  // Load contract addresses from health check
  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.hubAddress) setHubAddress(data.hubAddress);
        if (data.usdcAddress) setUsdcAddress(data.usdcAddress);
      })
      .catch((e) => console.warn("Could not load /health", e));
  }, []);

  // Sync wallet with User's Circle Wallet by default when logged in
  useEffect(() => {
    if (user && walletMode === "DISCONNECTED") {
      if (user.circleWallet) {
        setAccount(user.circleWallet.address);
        setWalletMode("CIRCLE_EMBEDDED");
        setChainId(5042002);
      } else if (user.activeWallet) {
        setAccount(user.activeWallet);
      }
    }
  }, [user, walletMode]);

  const getSignerAndProvider = async (): Promise<{
    signer: ethers.Signer;
    provider: ethers.Provider;
  }> => {
    if (walletMode === "CIRCLE_EMBEDDED" && user?.circleWallet?.encryptedPrivateKey) {
      // Connect using Circle User-Controlled EOA key
      const rpcUrl = "http://127.0.0.1:8545"; // or Arc Testnet RPC
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = new ethers.Wallet(user.circleWallet.encryptedPrivateKey, provider);
      return { signer, provider };
    }

    if (window.ethereum) {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      return { signer, provider: browserProvider };
    }

    throw new Error("No wallet available. Please log in or connect MetaMask.");
  };

  const refreshBalance = async () => {
    if (!account || !usdcAddress) return;
    try {
      const { provider } = await getSignerAndProvider();
      const usdcAbi = ["function balanceOf(address) external view returns (uint256)"];
      const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);
      const bal = await usdcContract.balanceOf(account);
      setUsdcBalance(Number(ethers.formatUnits(bal, 6)).toFixed(2));
    } catch (e) {
      // Fallback
      console.warn("Could not fetch balance:", e);
    }
  };

  useEffect(() => {
    refreshBalance();
    const interval = setInterval(refreshBalance, 10000);
    return () => clearInterval(interval);
  }, [account, usdcAddress, walletMode]);

  const connectInjectedWallet = async (): Promise<string> => {
    if (!window.ethereum) {
      throw new Error("No EVM wallet detected. Please install MetaMask or use your Circle Wallet.");
    }
    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      const address = ethers.getAddress(accounts[0]);
      setAccount(address);
      setChainId(Number(network.chainId));
      setWalletMode("INJECTED");
      return address;
    } finally {
      setIsConnecting(false);
    }
  };

  const switchToCircleWallet = () => {
    if (user?.circleWallet) {
      setAccount(user.circleWallet.address);
      setWalletMode("CIRCLE_EMBEDDED");
      setChainId(5042002);
    }
  };

  const claimFaucet = async (): Promise<{ success: boolean; txHash: string }> => {
    if (!account) throw new Error("Wallet not connected");
    const res = await fetch("/api/faucet/usdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Faucet failed");
    await refreshBalance();
    return { success: true, txHash: data.txHash };
  };

  const commitToBuyOnchain = async (params: {
    campaignId: number;
    campaignIdentity: string;
    quantity: number;
    requireEarlySlot: boolean;
    maxAuthQuantity: number;
    authDeadline: number;
    authSignature: string;
    lockedUnitPriceUSDC: string;
  }): Promise<{ txHash: string }> => {
    const { signer } = await getSignerAndProvider();

    // 1. Approve USDC transfer
    const totalGross = BigInt(params.lockedUnitPriceUSDC) * BigInt(params.quantity);
    const usdcAbi = [
      "function allowance(address, address) external view returns (uint256)",
      "function approve(address, uint256) external returns (bool)",
    ];
    const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, signer);
    const allowance = await usdcContract.allowance(await signer.getAddress(), hubAddress);

    if (allowance < totalGross) {
      console.log("[Web3] Approving USDC allowance for Hub...");
      const approveTx = await usdcContract.approve(hubAddress, ethers.MaxUint256);
      await approveTx.wait();
    }

    // 2. Call commitToBuy on GroupDealHub
    const hubAbi = [
      "function commitToBuy(uint256 campaignId, bytes32 campaignIdentity, uint256 quantity, bool requireEarlySlot, uint256 maxAuthQuantity, uint256 authDeadline, bytes calldata authSignature) external returns (uint256 orderId)",
    ];
    const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);

    console.log("[Web3] Submitting commitToBuy transaction on Arc...");
    const tx = await hubContract.commitToBuy(
      BigInt(params.campaignId),
      params.campaignIdentity,
      BigInt(params.quantity),
      params.requireEarlySlot,
      BigInt(params.maxAuthQuantity),
      BigInt(params.authDeadline),
      params.authSignature
    );

    const receipt = await tx.wait();
    await refreshBalance();
    return { txHash: receipt.hash };
  };

  const claimBuyerFundsOnchain = async (campaignId: number, orderIds: number[]) => {
    const { signer } = await getSignerAndProvider();
    const hubAbi = ["function claimBuyerFunds(uint256, uint256[]) external returns (uint256)"];
    const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);

    const tx = await hubContract.claimBuyerFunds(
      BigInt(campaignId),
      orderIds.map((id) => BigInt(id))
    );
    const receipt = await tx.wait();
    await refreshBalance();
    return { txHash: receipt.hash };
  };

  const claimSellerProceedsOnchain = async (campaignId: number, orderIds: number[]) => {
    const { signer } = await getSignerAndProvider();
    const hubAbi = ["function claimSellerProceeds(uint256, uint256[]) external returns (uint256)"];
    const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);

    const tx = await hubContract.claimSellerProceeds(
      BigInt(campaignId),
      orderIds.map((id) => BigInt(id))
    );
    const receipt = await tx.wait();
    await refreshBalance();
    return { txHash: receipt.hash };
  };

  const confirmReceiptOnchain = async (campaignId: number, orderId: number) => {
    const { signer } = await getSignerAndProvider();
    const hubAbi = ["function confirmReceipt(uint256, uint256) external"];
    const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);

    const tx = await hubContract.confirmReceipt(BigInt(campaignId), BigInt(orderId));
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  };

  const openDisputeOnchain = async (campaignId: number, orderId: number, reason: string) => {
    const { signer } = await getSignerAndProvider();
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
    const hubAbi = ["function openDispute(uint256, uint256, bytes32) external"];
    const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);

    const tx = await hubContract.openDispute(BigInt(campaignId), BigInt(orderId), reasonHash);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  };

  return (
    <Web3Context.Provider
      value={{
        account,
        chainId,
        usdcBalance,
        isConnecting,
        hubAddress,
        usdcAddress,
        walletMode,
        connectInjectedWallet,
        switchToCircleWallet,
        claimFaucet,
        commitToBuyOnchain,
        claimBuyerFundsOnchain,
        claimSellerProceedsOnchain,
        confirmReceiptOnchain,
        openDisputeOnchain,
        refreshBalance,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);
declare global {
  interface Window {
    ethereum?: any;
  }
}
