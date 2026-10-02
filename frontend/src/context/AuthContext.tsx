import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { ethers } from "ethers";

interface EmailLoginResult {
  userToken: string;
  encryptionKey: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string | null;
  loginMethod: "CIRCLE_EMAIL" | "EVM_WALLET";
  roles: ("buyer" | "seller" | "operator")[];
  activeWallet: string | null;
  circleWallet?: {
    address: string;
    walletId: string;
    blockchain: "ARC-TESTNET";
  };
  sellerProfile?: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    verifiedSellerBadge: boolean;
    verifiedRightsBadge: boolean;
  };
}

export interface CircleCredentials {
  userToken: string;
  encryptionKey: string;
  refreshToken: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  circleReady: boolean;
  circleProgress: string | null;
  circleWalletSyncing: boolean;
  circleWalletError: string | null;
  retryCircleWallet: () => Promise<void>;
  circleCredentials: CircleCredentials | null;
  requestOtp: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (email: string, code?: string) => Promise<User>;
  executeCircleChallenge: (challengeId: string) => Promise<void>;
  loginWithWallet: (signer: ethers.Signer) => Promise<User>;
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

async function circleFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(25_000) });
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("groupdeal_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [circleReady, setCircleReady] = useState(false);
  const [circleProgress, setCircleProgress] = useState<string | null>(null);
  const [circleWalletSyncing, setCircleWalletSyncing] = useState(false);
  const [circleWalletError, setCircleWalletError] = useState<string | null>(null);
  const [circleCredentials, setCircleCredentials] = useState<CircleCredentials | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loginAttemptId, setLoginAttemptId] = useState<string | null>(null);
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const circleSyncAttemptRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const loginPromiseRef = useRef<{
    resolve: (result: EmailLoginResult) => void;
    reject: (error: Error) => void;
  } | null>(null);

  useEffect(() => {
    // The SDK closes its iframe without settling verifyOtp on cancellation.
    // Observe cancellation only; credentials must still come from the SDK.
    const onCircleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://pw-auth.circle.com") return;
      const frame = document.getElementById("sdkIframe") as HTMLIFrameElement | null;
      if (frame?.contentWindow && event.source !== frame.contentWindow) return;
      if (!event.data?.onClose && !event.data?.onError) return;
      loginPromiseRef.current?.reject(new Error(event.data?.onClose
        ? "Bạn đã đóng xác thực Circle. Có thể mở lại để tiếp tục."
        : "Circle không hoàn tất xác thực. Vui lòng thử lại."));
      loginPromiseRef.current = null;
    };
    window.addEventListener("message", onCircleMessage);
    return () => window.removeEventListener("message", onCircleMessage);
  }, []);

  useEffect(() => {
    const appId = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined;
    if (!appId) {
      setCircleReady(false);
      return;
    }

    let cancelled = false;
    void import("@circle-fin/w3s-pw-web-sdk")
      .then(({ W3SSdk: CircleWebSdk }) => {
        const onLoginComplete: NonNullable<ConstructorParameters<typeof CircleWebSdk>[1]> = (
          error,
          result
        ) => {
          const pending = loginPromiseRef.current;
          loginPromiseRef.current = null;
          if (!pending) return;
          if (error || !result) {
            pending.reject(new Error(error?.message || "Circle OTP verification failed"));
            return;
          }
          pending.resolve(result as EmailLoginResult);
        };

        const sdk = new CircleWebSdk({ appSettings: { appId } }, onLoginComplete);
        if (cancelled) return null;
        // W3SSdk is a singleton. On a React remount its constructor returns the
        // original instance, which can still hold the unmounted login callback.
        // Register on the returned instance, not only on the constructor.
        sdk.updateConfigs({ appSettings: { appId } }, onLoginComplete);
        circleSdkRef.current = sdk;
        return sdk.getDeviceId();
      })
      .then((id) => {
        if (!id || cancelled) return;
        setDeviceId(id);
        setCircleReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Circle Web SDK device initialization failed", error);
        setCircleReady(false);
      });

    return () => {
      cancelled = true;
      circleSdkRef.current = null;
    };
  }, []);

  const logout = () => {
    sessionGenerationRef.current += 1;
    circleSyncAttemptRef.current += 1;
    setToken(null);
    setUser(null);
    setCircleCredentials(null);
    setCircleWalletSyncing(false);
    setCircleWalletError(null);
    loginPromiseRef.current?.reject(new Error("Đã đăng xuất"));
    loginPromiseRef.current = null;
    setLoginAttemptId(null);
    localStorage.removeItem("groupdeal_token");
  };

  const refreshUser = async () => {
    const generation = sessionGenerationRef.current;
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await circleFetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (generation !== sessionGenerationRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else if (res.status === 401 || res.status === 403) {
        logout();
      }
    } catch (error) {
      console.warn("Failed to load user session", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, [token]);

  const requestOtp = async (email: string) => {
    const sdk = circleSdkRef.current;
    const appId = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined;
    if (!sdk || !circleReady || !deviceId || !appId) {
      throw new Error("Circle Wallet chưa sẵn sàng. Kiểm tra VITE_CIRCLE_APP_ID và kết nối mạng.");
    }
    const data = await readJson(
      await circleFetch("/api/circle/email/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, deviceId }),
      })
    );
    sdk.updateConfigs({
      appSettings: { appId },
      loginConfigs: {
        deviceToken: data.deviceToken,
        deviceEncryptionKey: data.deviceEncryptionKey,
        otpToken: data.otpToken,
      },
    });
    setLoginAttemptId(data.loginAttemptId);
    return { success: true, message: "OTP đã được Circle gửi qua email." };
  };

  const executeCircleChallenge = async (challengeId: string): Promise<void> => {
    const sdk = circleSdkRef.current;
    if (!sdk || !circleCredentials) {
      throw new Error("Phiên Circle đã hết hạn. Vui lòng xác thực email lại.");
    }
    sdk.setAuthentication({
      userToken: circleCredentials.userToken,
      encryptionKey: circleCredentials.encryptionKey,
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Hết thời gian chờ Circle. Kiểm tra trạng thái giao dịch trước khi thử lại.")), 120_000);
      const callback: NonNullable<Parameters<W3SSdk["execute"]>[1]> = (error, result) => {
        window.clearTimeout(timeout);
        if (error) {
          reject(new Error(error.message));
          return;
        }
        if (!result || result.status !== "COMPLETE") {
          reject(new Error(`Circle challenge ended with status ${result?.status || "UNKNOWN"}`));
          return;
        }
        resolve();
      };
      sdk.execute(challengeId, callback);
    });
  };

  const createLocalSession = async (credentials: CircleCredentials) => {
    if (!loginAttemptId) throw new Error("Circle login attempt không còn hiệu lực");
    return (
    readJson(
      await circleFetch("/api/circle/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken: credentials.userToken, loginAttemptId }),
      })
    ));
  };

  const syncCircleWalletInBackground = async (
    sessionToken: string,
    credentials: CircleCredentials
  ): Promise<void> => {
    const syncAttempt = ++circleSyncAttemptRef.current;
    setCircleWalletSyncing(true);
    setCircleWalletError(null);
    try {
      // Execute initialization in the background, but never depend on its UI
      // callback to discover an already-created wallet. Inventory is authoritative.
      const initialization = await readJson(await circleFetch("/api/circle/wallet/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ userToken: credentials.userToken }),
      }));
      if (circleSyncAttemptRef.current !== syncAttempt) return;
      if (initialization.challengeId) {
        circleSdkRef.current?.execute(initialization.challengeId, (error) => {
          if (error && circleSyncAttemptRef.current === syncAttempt) {
            setCircleWalletError(error.message || "Xác nhận bảo mật Circle chưa hoàn tất");
          }
        });
      }
      const deadline = Date.now() + 120_000;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (circleSyncAttemptRef.current !== syncAttempt || Date.now() >= deadline) break;
        try {
          const walletsResponse = await readJson(
            await circleFetch("/api/circle/wallets", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
              },
              body: JSON.stringify({ userToken: credentials.userToken }),
            })
          );
          if (walletsResponse.wallets?.length && walletsResponse.user) {
            if (circleSyncAttemptRef.current !== syncAttempt) return;
            setUser(walletsResponse.user);
            setCircleWalletError(null);
            return;
          }
        } catch (error) {
          // Circle's wallet inventory can be briefly eventually consistent after
          // a completed creation challenge. Keep the authenticated app session
          // usable while retrying the wallet binding in the background.
          if (attempt === 0 || attempt % 10 === 0) {
            console.warn("Circle wallet background sync is not ready yet");
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (circleSyncAttemptRef.current === syncAttempt) setCircleWalletError("Chưa đồng bộ được ví Arc. Bấm thử lại; không cần đăng xuất hoặc tạo tài khoản mới.");
    } catch (error) {
      if (circleSyncAttemptRef.current === syncAttempt) setCircleWalletError(error instanceof Error ? error.message : "Không thể đồng bộ ví Circle");
    } finally {
      if (circleSyncAttemptRef.current === syncAttempt) setCircleWalletSyncing(false);
    }
  };

  const retryCircleWallet = async () => {
    if (!token || !circleCredentials) {
      setCircleWalletError("Phiên đăng nhập vẫn còn, nhưng phiên ký Circle không được lưu trên máy. Xác thực email lại để đồng bộ/ký.");
      return;
    }
    if (!circleWalletSyncing) await syncCircleWalletInBackground(token, circleCredentials);
  };

  const verifyOtp = async (_email: string, _code?: string) => {
    const generation = ++sessionGenerationRef.current;
    const sdk = circleSdkRef.current;
    if (!sdk) throw new Error("Circle Web SDK chưa sẵn sàng");
    try {
      setCircleProgress("Đang xác thực OTP với Circle...");
      const credentials = await new Promise<CircleCredentials>((resolve, reject) => {
        if (loginPromiseRef.current) { reject(new Error("Một lần xác thực Circle đang chạy")); return; }
        const timeout = window.setTimeout(() => {
          loginPromiseRef.current = null;
          reject(new Error("Hết thời gian xác thực Circle. Kiểm tra cửa sổ OTP và thử lại."));
        }, 120_000);
        loginPromiseRef.current = {
          resolve: (result) => { window.clearTimeout(timeout); resolve(result); },
          reject: (error) => { window.clearTimeout(timeout); reject(error); },
        };
        try { sdk.verifyOtp(); } catch (error) {
          loginPromiseRef.current?.reject(error instanceof Error ? error : new Error("Không thể mở Circle OTP"));
          loginPromiseRef.current = null;
        }
      });
      setCircleCredentials(credentials);
      sdk.setAuthentication({
        userToken: credentials.userToken,
        encryptionKey: credentials.encryptionKey,
      });

      setCircleProgress("Đang tạo phiên đăng nhập GroupDeal...");
      const session = await createLocalSession(credentials);
      if (generation !== sessionGenerationRef.current) throw new Error("Phiên đăng nhập đã bị hủy");

      setToken(session.token);
      localStorage.setItem("groupdeal_token", session.token);
      setUser(session.user);
      void syncCircleWalletInBackground(session.token, credentials);
      return session.user as User;
    } finally {
      setCircleProgress(null);
    }
  };

  const loginWithWallet = async (signer: ethers.Signer) => {
    const generation = ++sessionGenerationRef.current;
    const walletAddress = await signer.getAddress();
    const challenge = await readJson(
      await fetch("/api/auth/wallet/login/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      })
    );
    const signature = await signer.signMessage(challenge.challengeMessage);
    const session = await readJson(
      await fetch("/api/auth/wallet/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          signature,
          message: challenge.challengeMessage,
          nonce: challenge.nonce,
        }),
      })
    );
    if (generation !== sessionGenerationRef.current) throw new Error("Phiên đăng nhập đã bị hủy");
    circleSyncAttemptRef.current += 1;
    setCircleCredentials(null);
    setCircleWalletSyncing(false);
    setCircleWalletError(null);
    setToken(session.token);
    localStorage.setItem("groupdeal_token", session.token);
    setUser(session.user);
    return session.user as User;
  };

  const linkExternalWallet = async (signer: ethers.Signer) => {
    if (!token) throw new Error("Must be logged in to link wallet");
    const address = await signer.getAddress();
    const chalData = await readJson(
      await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "LINK_WALLET", walletAddress: address }),
      })
    );
    const signature = await signer.signMessage(chalData.challengeMessage);
    const data = await readJson(
      await fetch("/api/auth/wallet/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ walletAddress: address, signature, message: chalData.challengeMessage }),
      })
    );
    setUser(data.user);
    return data.user as User;
  };

  const setupSellerProfile = async (profileData: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    signer?: ethers.Signer;
  }) => {
    if (!token) throw new Error("Must be logged in to setup seller profile");
    if (!profileData.signer) {
      throw new Error("Vui lòng kết nối ví bên ngoài để xác nhận quyền sở hữu ví thanh toán.");
    }
    const chalData = await readJson(
      await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "SELLER_PAYOUT", walletAddress: profileData.payoutWallet }),
      })
    );
    const proofSignature = await profileData.signer.signMessage(chalData.challengeMessage);
    const data = await readJson(
      await fetch("/api/auth/seller/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          displayName: profileData.displayName,
          bio: profileData.bio,
          payoutWallet: profileData.payoutWallet,
          proofSignature,
          challengeMessage: chalData.challengeMessage,
        }),
      })
    );
    setUser(data.user);
    return data.user as User;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        circleReady,
        circleProgress,
        circleWalletSyncing,
        circleWalletError,
        retryCircleWallet,
        circleCredentials,
        requestOtp,
        verifyOtp,
        executeCircleChallenge,
        loginWithWallet,
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
