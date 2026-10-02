import React, { useEffect, useMemo, useRef } from "react";
import {
  AppKitProvider,
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import { arbitrumSepolia, baseSepolia, defineChain, sepolia } from "@reown/appkit/networks";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { ethers } from "ethers";
import {
  ExternalWalletContext,
  type Eip1193Provider,
  type ExternalWalletContextType,
} from "./ExternalWalletContext";

export const arcTestnet = defineChain({
  id: 5042002,
  caipNetworkId: "eip155:5042002",
  chainNamespace: "eip155",
  name: "Arc Testnet",
  testnet: true,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"], webSocket: ["wss://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://testnet.arcscan.app" },
  },
});

const ethersAdapter = new EthersAdapter();

const ConnectedExternalWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const account = useAppKitAccount();
  const network = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
  const stateRef = useRef({ address: account.address, walletProvider });

  useEffect(() => {
    stateRef.current = { address: account.address, walletProvider };
  }, [account.address, walletProvider]);

  const getSigner = async () => {
    const provider = stateRef.current.walletProvider;
    if (!provider) throw new Error("Chưa kết nối ví EVM qua Reown AppKit");
    const browserProvider = new ethers.BrowserProvider(provider);
    return browserProvider.getSigner();
  };

  const connect = async () => {
    if (stateRef.current.address && stateRef.current.walletProvider) {
      return ethers.getAddress(stateRef.current.address);
    }
    await open({ view: "Connect" });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (stateRef.current.address && stateRef.current.walletProvider) {
        return ethers.getAddress(stateRef.current.address);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error("Hết thời gian chờ kết nối ví qua Reown AppKit");
  };

  const value = useMemo<ExternalWalletContextType>(
    () => ({
      configured: true,
      address: account.address,
      chainId: network.chainId,
      connected: account.isConnected,
      provider: walletProvider,
      connect,
      getSigner,
      getProvider: () => {
        if (!stateRef.current.walletProvider) throw new Error("Chưa kết nối ví EVM");
        return stateRef.current.walletProvider;
      },
      disconnect: () => disconnect(),
    }),
    [account.address, account.isConnected, network.chainId, walletProvider]
  );

  return <ExternalWalletContext.Provider value={value}>{children}</ExternalWalletContext.Provider>;
};

const ReownEnabledProvider: React.FC<{ children: React.ReactNode; projectId: string }> = ({
  children,
  projectId,
}) => (
  <AppKitProvider
    adapters={[ethersAdapter]}
    networks={[arcTestnet, sepolia, baseSepolia, arbitrumSepolia]}
    projectId={projectId}
    metadata={{
      name: "GroupDeal",
      description: "Mua chung sản phẩm số bằng USDC trên Arc",
      url: window.location.origin,
      icons: [],
    }}
    features={{ email: false, socials: false, analytics: false }}
  >
    <ConnectedExternalWalletProvider>{children}</ConnectedExternalWalletProvider>
  </AppKitProvider>
);

export default ReownEnabledProvider;
