import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

export interface User {
  id: string;
  email: string;
  roles: ("buyer" | "seller" | "operator")[];
  activeWallet: string | null;
  circleWallet?: {
    address: string;
  };
  sellerProfile?: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    verifiedSellerBadge: boolean;
    verifiedRightsBadge: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  requestOtp: (email: string) => Promise<{ success: boolean; message: string; code?: string }>;
  verifyOtp: (email: string, code: string) => Promise<User>;
  linkExternalWallet: (signer: ethers.Signer) => Promise<User>;
  setupSellerProfile: (data: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    signer?: ethers.Signer;
  }) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("groupdeal_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        logout();
      }
    } catch (e) {
      console.warn("Failed to load user session", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  const requestOtp = async (email: string) => {
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send OTP");
    return data;
  };

  const verifyOtp = async (email: string, code: string) => {
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to verify OTP");
    setToken(data.token);
    localStorage.setItem("groupdeal_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const linkExternalWallet = async (signer: ethers.Signer) => {
    if (!token) throw new Error("Must be logged in to link wallet");
    const address = await signer.getAddress();
    const message = `GroupDeal Wallet Link Authentication\nAddress: ${address}\nTimestamp: ${Date.now()}`;
    const signature = await signer.signMessage(message);

    const res = await fetch("/api/auth/wallet/bind", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ walletAddress: address, signature, message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to bind wallet");
    setUser(data.user);
    return data.user;
  };

  const setupSellerProfile = async (profileData: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    signer?: ethers.Signer;
  }) => {
    if (!token) throw new Error("Must be logged in to setup seller profile");
    const challengeMessage = `GroupDeal Seller Payout Wallet Verification\nWallet: ${profileData.payoutWallet}\nTimestamp: ${Date.now()}`;
    let proofSignature: string;

    if (profileData.signer) {
      proofSignature = await profileData.signer.signMessage(challengeMessage);
    } else {
      // Use embedded wallet signer endpoint
      const signRes = await fetch("/api/wallet/sign-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: challengeMessage }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) throw new Error(signData.error || "Failed to sign payout challenge");
      proofSignature = signData.signature;
    }

    const res = await fetch("/api/auth/seller/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        displayName: profileData.displayName,
        bio: profileData.bio,
        payoutWallet: profileData.payoutWallet,
        proofSignature,
        challengeMessage,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to setup seller profile");
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("groupdeal_token");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        requestOtp,
        verifyOtp,
        linkExternalWallet,
        setupSellerProfile,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
