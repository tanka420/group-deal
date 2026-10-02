import React, { createContext, lazy, Suspense, useContext } from "react";
import type { Signer } from "ethers";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface ExternalWalletContextType {
  configured: boolean;
  address?: string;
  chainId?: number | string;
  connected: boolean;
  provider?: Eip1193Provider;
  connect: () => Promise<string>;
  getSigner: () => Promise<Signer>;
  getProvider: () => Eip1193Provider;
  disconnect: () => Promise<void>;
}

const missingReownConfiguration = async (): Promise<never> => {
  throw new Error("Reown AppKit chưa được cấu hình (thiếu VITE_REOWN_PROJECT_ID)");
};

export const disabledExternalWallet: ExternalWalletContextType = {
  configured: false,
  connected: false,
  connect: missingReownConfiguration,
  getSigner: missingReownConfiguration,
  getProvider: () => { throw new Error("Chưa kết nối ví EVM"); },
  disconnect: async () => {},
};

export const ExternalWalletContext = createContext<ExternalWalletContextType>(disabledExternalWallet);
const ReownEnabledProvider = lazy(() => import("./ReownEnabledProvider"));

export const ExternalWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined;
  if (!projectId) {
    return (
      <ExternalWalletContext.Provider value={disabledExternalWallet}>
        {children}
      </ExternalWalletContext.Provider>
    );
  }

  return (
    <Suspense
      fallback={
        <ExternalWalletContext.Provider value={disabledExternalWallet}>
          {children}
        </ExternalWalletContext.Provider>
      }
    >
      <ReownEnabledProvider projectId={projectId}>{children}</ReownEnabledProvider>
    </Suspense>
  );
};

export const useExternalWallet = () => useContext(ExternalWalletContext);
