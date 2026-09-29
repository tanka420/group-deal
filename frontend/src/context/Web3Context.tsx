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

  // Load contract addresses from health check via /api/health
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.hubAddress) setHubAddress(data.hubAddress);
        if (data.usdcAddress) setUsdcAddress(data.usdcAddress);
      })
      .catch((e) => console.warn("Could not load /api/health", e));
  }, []);

  // UI03 Fix: Sync wallet with User account; handle login/logout/switch cleanly
  useEffect(() => {
    if (!user) {
      if (walletMode === "CIRCLE_EMBEDDED") {
        setAccount(null);
        setWalletMode("DISCONNECTED");
        setUsdcBalance("0.00");
      }
      return;
    }

    if (walletMode === "DISCONNECTED" || walletMode === "CIRCLE_EMBEDDED") {
      if (user.circleWallet?.address) {
        setAccount(user.circleWallet.address);
        setWalletMode("CIRCLE_EMBEDDED");
        setChainId(5042002);
      } else if (user.activeWallet) {
        setAccount(user.activeWallet);
      }
    }
  }, [user]);

  const getReadProvider = (): ethers.Provider => {
    if (window.ethereum) {
      return new ethers.BrowserProvider(window.ethereum);
    }
    return new ethers.JsonRpcProvider("https://rpc.testnet.arc.io");
  };

  const getInjectedSigner = async (): Promise<ethers.Signer> => {
    if (!window.ethereum) {
      throw new Error("Không phát hiện ví EVM. Vui lòng cài đặt MetaMask hoặc sử dụng ví nhúng.");
    }
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    return await browserProvider.getSigner();
  };

  /**
   * Helper to relay transaction on behalf of embedded Circle wallet via secure backend API
   */
  const relayTx = async (to: string, data: string, value?: string): Promise<{ txHash: string }> => {
    const token = localStorage.getItem("groupdeal_token");
    if (!token) throw new Error("Chưa đăng nhập. Vui lòng đăng nhập để thực hiện giao dịch.");

    const res = await fetch("/api/wallet/relay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, data, value }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Giao dịch ví nhúng thất bại");
    return { txHash: result.txHash };
  };

  const refreshBalance = async () => {
    if (!account || !usdcAddress) return;
    try {
      const provider = getReadProvider();
      const usdcAbi = ["function balanceOf(address) external view returns (uint256)"];
      const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);
      const bal = await usdcContract.balanceOf(account);
      setUsdcBalance(Number(ethers.formatUnits(bal, 6)).toFixed(2));
    } catch (e) {
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
      throw new Error("Không tìm thấy ví EVM. Vui lòng cài đặt MetaMask hoặc sử dụng Ví Nhúng.");
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
    if (user?.circleWallet?.address) {
      setAccount(user.circleWallet.address);
      setWalletMode("CIRCLE_EMBEDDED");
      setChainId(5042002);
    }
  };

  const claimFaucet = async (): Promise<{ success: boolean; txHash: string }> => {
    if (!account) throw new Error("Ví chưa được kết nối");
    const res = await fetch("/api/faucet/usdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Nhận Test USDC thất bại");
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
    const totalGross = BigInt(params.lockedUnitPriceUSDC) * BigInt(params.quantity);

    if (walletMode === "CIRCLE_EMBEDDED") {
      // 1. Relay Approve USDC
      const usdcInterface = new ethers.Interface([
        "function approve(address spender, uint256 amount) external returns (bool)",
      ]);
      const approveData = usdcInterface.encodeFunctionData("approve", [hubAddress, ethers.MaxUint256]);
      await relayTx(usdcAddress, approveData);

      // 2. Relay commitToBuy
      const hubInterface = new ethers.Interface([
        "function commitToBuy(uint256 campaignId, bytes32 campaignIdentity, uint256 quantity, bool requireEarlySlot, uint256 maxAuthQuantity, uint256 authDeadline, bytes calldata authSignature) external returns (uint256 orderId)",
      ]);
      const commitData = hubInterface.encodeFunctionData("commitToBuy", [
        BigInt(params.campaignId),
        params.campaignIdentity,
        BigInt(params.quantity),
        params.requireEarlySlot,
        BigInt(params.maxAuthQuantity),
        BigInt(params.authDeadline),
        params.authSignature,
      ]);

      const { txHash } = await relayTx(hubAddress, commitData);
      await refreshBalance();
      return { txHash };
    } else {
      // INJECTED Wallet (MetaMask)
      const signer = await getInjectedSigner();
      const usdcAbi = [
        "function allowance(address, address) external view returns (uint256)",
        "function approve(address, uint256) external returns (bool)",
      ];
      const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, signer);
      const allowance = await usdcContract.allowance(await signer.getAddress(), hubAddress);

      if (allowance < totalGross) {
        console.log("[Web3] Phê duyệt hạn mức USDC cho Hub...");
        const approveTx = await usdcContract.approve(hubAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      const hubAbi = [
        "function commitToBuy(uint256 campaignId, bytes32 campaignIdentity, uint256 quantity, bool requireEarlySlot, uint256 maxAuthQuantity, uint256 authDeadline, bytes calldata authSignature) external returns (uint256 orderId)",
      ];
      const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);

      console.log("[Web3] Gửi giao dịch commitToBuy lên Arc...");
      const tx = await hubContract.commitToBuy(
        BigInt(params.campaignId),
        params.campaignIdentity,
        BigInt(params.quantity),
        params.requireEarlySlot,
        BigInt(params.maxAuthQuantity),
        BigInt(params.authDeadline),
        params.authSignature
      );

      const txHash = tx.hash;
      await tx.wait();
      await refreshBalance();
      return { txHash };
    }
  };

  const claimBuyerFundsOnchain = async (campaignId: number, orderIds: number[]) => {
    const hubAbi = ["function claimBuyerFunds(uint256, uint256[]) external returns (uint256)"];

    if (walletMode === "CIRCLE_EMBEDDED") {
      const hubInterface = new ethers.Interface(hubAbi);
      const data = hubInterface.encodeFunctionData("claimBuyerFunds", [
        BigInt(campaignId),
        orderIds.map((id) => BigInt(id)),
      ]);
      const { txHash } = await relayTx(hubAddress, data);
      await refreshBalance();
      return { txHash };
    } else {
      const signer = await getInjectedSigner();
      const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);
      const tx = await hubContract.claimBuyerFunds(
        BigInt(campaignId),
        orderIds.map((id) => BigInt(id))
      );
      const txHash = tx.hash;
      await tx.wait();
      await refreshBalance();
      return { txHash };
    }
  };

  const claimSellerProceedsOnchain = async (campaignId: number, orderIds: number[]) => {
    const hubAbi = ["function claimSellerProceeds(uint256, uint256[]) external returns (uint256)"];

    if (walletMode === "CIRCLE_EMBEDDED") {
      const hubInterface = new ethers.Interface(hubAbi);
      const data = hubInterface.encodeFunctionData("claimSellerProceeds", [
        BigInt(campaignId),
        orderIds.map((id) => BigInt(id)),
      ]);
      const { txHash } = await relayTx(hubAddress, data);
      await refreshBalance();
      return { txHash };
    } else {
      const signer = await getInjectedSigner();
      const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);
      const tx = await hubContract.claimSellerProceeds(
        BigInt(campaignId),
        orderIds.map((id) => BigInt(id))
      );
      const txHash = tx.hash;
      await tx.wait();
      await refreshBalance();
      return { txHash };
    }
  };

  const confirmReceiptOnchain = async (campaignId: number, orderId: number) => {
    const hubAbi = ["function confirmReceipt(uint256, uint256) external"];

    if (walletMode === "CIRCLE_EMBEDDED") {
      const hubInterface = new ethers.Interface(hubAbi);
      const data = hubInterface.encodeFunctionData("confirmReceipt", [BigInt(campaignId), BigInt(orderId)]);
      return await relayTx(hubAddress, data);
    } else {
      const signer = await getInjectedSigner();
      const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);
      const tx = await hubContract.confirmReceipt(BigInt(campaignId), BigInt(orderId));
      const txHash = tx.hash;
      await tx.wait();
      return { txHash };
    }
  };

  const openDisputeOnchain = async (campaignId: number, orderId: number, reason: string) => {
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
    const hubAbi = ["function openDispute(uint256, uint256, bytes32) external"];

    if (walletMode === "CIRCLE_EMBEDDED") {
      const hubInterface = new ethers.Interface(hubAbi);
      const data = hubInterface.encodeFunctionData("openDispute", [
        BigInt(campaignId),
        BigInt(orderId),
        reasonHash,
      ]);
      return await relayTx(hubAddress, data);
    } else {
      const signer = await getInjectedSigner();
      const hubContract = new ethers.Contract(hubAddress, hubAbi, signer);
      const tx = await hubContract.openDispute(BigInt(campaignId), BigInt(orderId), reasonHash);
      const txHash = tx.hash;
      await tx.wait();
      return { txHash };
    }
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
