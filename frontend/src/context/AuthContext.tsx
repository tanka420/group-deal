import React, { createContext, useContext, useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { ethers } from "ethers";
import {readUser,readSession,AppSession} from "../services/appSession";
import {circleDeviceId} from "../services/circleDevice";
import {InitialCircleWallet,readInitialCircleWalletChoices,readInitialCircleWalletAck} from "../services/circleWalletChoice";
import {readAdminLoginChallenge} from '../services/adminLogin';

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
  realm: "APP"|"ADMIN";
  user: User | null;
  token: string | null;
  isLoading: boolean;
  circleReady: boolean;
  circleInitState: "IDLE"|"INITIALIZING"|"READY"|"UNAVAILABLE";
  prepareCircle: () => Promise<void>;
  circleProgress: string | null;
  circleWalletSyncing: boolean;
  circleWalletError: string | null;
  circleWalletChoices: InitialCircleWallet[];
  circleWalletChoiceUnknown: boolean;
  selectInitialCircleWallet: (walletId:string) => Promise<void>;
  retryCircleWallet: () => Promise<void>;
  circleCredentials: CircleCredentials | null;
  requestOtp: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (email: string, code?: string) => Promise<User>;
  executeCircleChallenge: (challengeId: string) => Promise<void>;
  executeCircleMessageChallenge: (challengeId:string) => Promise<string>;
  getSessionEpoch: () => number;
  loginWithWallet: (signer: ethers.Signer, expectedEpoch?:number) => Promise<User>;
  linkExternalWallet: (signer: ethers.Signer, expectedEpoch?:number) => Promise<User>;
  setupSellerProfile: (data: {
    displayName: string;
    bio: string;
    payoutWallet: string;
    signer?: ethers.Signer;
  }) => Promise<User>;
  logout: () => void;
  logoutState: "NONE"|"PENDING"|"CONFIRMED"|"UNCONFIRMED";
  sessionNotice: "UNAVAILABLE"|"ENDED"|null;
  endConfirmedSession: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export const AuthProvider: React.FC<{ children: React.ReactNode;realm?:"APP"|"ADMIN" }> = ({ children,realm='APP' }) => {
  const storageKey=realm==='ADMIN'?'groupdeal_admin_token':'groupdeal_token';
  const authUrl=(url:string)=>realm==='ADMIN'&&url.startsWith('/api/auth/')?url.replace('/api/auth/','/api/admin-auth/'):url;
  const fetch:typeof globalThis.fetch=(input,init)=>globalThis.fetch(typeof input==='string'?authUrl(input):input,init);
  const circleFetch=(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.timeout(25000)});
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(()=>localStorage.getItem(storageKey));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [circleReady, setCircleReady] = useState(false);
  const [circleProgress, setCircleProgress] = useState<string | null>(null);
  const [circleWalletSyncing, setCircleWalletSyncing] = useState(false);
  const [circleWalletError, setCircleWalletError] = useState<string | null>(null);
  const [circleWalletChoices,setCircleWalletChoices]=useState<InitialCircleWallet[]>([]);
  const [circleWalletChoiceUnknown,setCircleWalletChoiceUnknown]=useState(false);
  const circleChoiceFlightRef=useRef<number|null>(null);
  const [circleCredentials, setCircleCredentials] = useState<CircleCredentials | null>(null);
  const circleDeviceRef=useRef<string|null>(null);
  const [circleInitState,setCircleInitState]=useState<AuthContextType["circleInitState"]>("IDLE");
  const circleLifecycle=useRef({active:true,epoch:0});
  const circleInitRef=useRef<Promise<{sdk:W3SSdk;deviceId:string}>|null>(null);
  const [loginAttemptId, setLoginAttemptId] = useState<string | null>(null);
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const circleSyncAttemptRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const loginPromiseRef = useRef<{
    resolve: (result: EmailLoginResult) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const tokenRef=useRef(token),userRef=useRef<User|null>(null),appSessionRef=useRef<AppSession|null>(null);
  const refreshAttemptRef=useRef(0);
  const [logoutState,setLogoutState]=useState<AuthContextType["logoutState"]>("NONE");
  const [sessionNotice,setSessionNotice]=useState<AuthContextType["sessionNotice"]>(null);
  useEffect(()=>{userRef.current=user;},[user]);
  useEffect(()=>()=>{sessionGenerationRef.current++;circleSyncAttemptRef.current++;refreshAttemptRef.current++;loginPromiseRef.current?.reject(new Error("Phiên đăng nhập đã thay đổi"));loginPromiseRef.current=null;},[]);

  const acceptUser=(value:unknown,expectedId?:string)=>{
    const next=readUser(value);if(expectedId&&next.id!==expectedId)throw new Error("AUTH_RESPONSE_INVALID");
    userRef.current=next;setUser(next);return next;
  };
  const discardIssuedSession=(sessionToken:unknown)=>{
    if(typeof sessionToken!=="string"||!sessionToken||sessionToken.length>8192)return;
    void fetch("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionToken}`},body:JSON.stringify({idempotencyKey:crypto.randomUUID()}),signal:AbortSignal.timeout(10_000)}).catch(()=>{});
  };

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

  useLayoutEffect(() => {
    circleLifecycle.current.active = true;
    setCircleInitState("IDLE");
    setCircleReady(false);
    return () => {
      circleLifecycle.current.active = false;
      circleLifecycle.current.epoch++;
      circleInitRef.current = null;
      circleDeviceRef.current = null;
      circleSdkRef.current = null;
    };
  }, []);

  const ensureCircle = useCallback((): Promise<{ sdk: W3SSdk; deviceId: string }> => {
    const appId = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined;
    if (!circleLifecycle.current.active) return Promise.reject(new Error("CIRCLE_INITIALIZATION_ENDED"));
    if (circleSdkRef.current && circleDeviceRef.current) {
      return Promise.resolve({ sdk: circleSdkRef.current, deviceId: circleDeviceRef.current });
    }
    if (circleInitRef.current) return circleInitRef.current;
    if (!appId) {
      setCircleInitState("UNAVAILABLE");
      return Promise.reject(new Error("CIRCLE_UNAVAILABLE"));
    }
    const epoch = circleLifecycle.current.epoch;
    const current = () => circleLifecycle.current.active && circleLifecycle.current.epoch === epoch;
    setCircleInitState("INITIALIZING");
    setCircleReady(false);
    const own = (async () => {
      try {
        const { W3SSdk: CircleWebSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        if (!current()) throw new Error("CIRCLE_INITIALIZATION_ENDED");
        const onLoginComplete: NonNullable<ConstructorParameters<typeof CircleWebSdk>[1]> = (error, result) => {
          if (!current()) return;
          const pending = loginPromiseRef.current;
          loginPromiseRef.current = null;
          if (!pending) return;
          if (error || !result) {
            pending.reject(new Error(error?.message || "Circle OTP verification failed"));
            return;
          }
          pending.resolve(result as EmailLoginResult);
        };
        // Constructor may return a singleton; bind callbacks to this active provider.
        const sdk = new CircleWebSdk({ appSettings: { appId } }, onLoginComplete);
        sdk.updateConfigs({ appSettings: { appId } }, onLoginComplete);
        const id = await circleDeviceId(sdk);
        if (!current()) throw new Error("CIRCLE_INITIALIZATION_ENDED");
        circleSdkRef.current = sdk;
        circleDeviceRef.current = id;
        setCircleReady(true);
        setCircleInitState("READY");
        return { sdk, deviceId: id };
      } catch {
        if (current()) {
          setCircleReady(false);
          setCircleInitState("UNAVAILABLE");
        }
        throw new Error("CIRCLE_UNAVAILABLE");
      } finally {
        if (current()) circleInitRef.current = null;
      }
    })();
    circleInitRef.current = own;
    return own;
  }, []);
  const prepareCircle = useCallback(async () => { await ensureCircle(); }, [ensureCircle]);

  const clearLocal = () => {
    const previousToken=tokenRef.current;
    sessionGenerationRef.current += 1;
    circleSyncAttemptRef.current += 1;
    refreshAttemptRef.current += 1;
    tokenRef.current=null;userRef.current=null;appSessionRef.current=null;
    setToken(null);
    setUser(null);
    setCircleCredentials(null);
    setCircleWalletSyncing(false);
    setCircleWalletError(null);
    setCircleWalletChoices([]);setCircleWalletChoiceUnknown(false);circleChoiceFlightRef.current=null;
    loginPromiseRef.current?.reject(new Error("Đã đăng xuất"));
    loginPromiseRef.current = null;
    setLoginAttemptId(null);
    setIsLoading(false);setCircleProgress(null);
    if(localStorage.getItem(storageKey)===previousToken)localStorage.removeItem(storageKey);
  };

  const endConfirmedSession=()=>{clearLocal();setLogoutState("CONFIRMED");setSessionNotice(null);};
  const logout = () => {
    const previousToken=tokenRef.current,previousId=userRef.current?.id,requestId=crypto.randomUUID();
    clearLocal();setSessionNotice(null);setLogoutState(previousToken?"PENDING":"NONE");
    const generation=sessionGenerationRef.current;
    if(!previousToken)return;
    void fetch("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${previousToken}`},body:JSON.stringify({idempotencyKey:requestId}),signal:AbortSignal.timeout(10_000)}).then(async response=>{
      const ack=await response.json();if(!response.ok||!previousId||ack.userId!==previousId||ack.requestId!==requestId||ack.scope!=="CURRENT"||ack.revoked!==true)throw new Error("AUTH_RESPONSE_INVALID");
      if(generation===sessionGenerationRef.current&&!tokenRef.current)setLogoutState("CONFIRMED");
    }).catch(()=>{if(generation===sessionGenerationRef.current&&!tokenRef.current)setLogoutState("UNCONFIRMED");});
  };

  const refreshUser = async () => {
    const generation = sessionGenerationRef.current,sessionToken=tokenRef.current,attempt=++refreshAttemptRef.current;
    const valid=()=>generation===sessionGenerationRef.current&&sessionToken===tokenRef.current&&localStorage.getItem(storageKey)===sessionToken&&attempt===refreshAttemptRef.current;
    if (!sessionToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await circleFetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },cache:"no-store",
      });
      if (!valid()) return;
      if (res.ok) {
        const data = await res.json();
        if(!valid())return;
        const next=readUser(data.user);if(userRef.current&&next.id!==userRef.current.id)throw new Error("AUTH_RESPONSE_INVALID");
        const session=data.session===undefined?null:readSession(data.session,next.id);
        if(session&&(!session.current||session.state!=="ACTIVE"||!Number.isSafeInteger(data.serverTime)))throw new Error("AUTH_RESPONSE_INVALID");
        appSessionRef.current=session;acceptUser(next);setSessionNotice(null);
      } else if (res.status === 401 || res.status === 403) {
        clearLocal();setSessionNotice("ENDED");setLogoutState("NONE");
      }else{setSessionNotice("UNAVAILABLE");}
    } catch {
      if(valid())setSessionNotice("UNAVAILABLE");
    } finally {
      if(valid())setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, [token]);

  useEffect(()=>{
    const changed=(event:StorageEvent)=>{
      if(event.storageArea!==localStorage||event.key!==storageKey||event.newValue===tokenRef.current)return;
      // Storage events are emitted in other tabs only. Do not remove their new token.
      sessionGenerationRef.current++;circleSyncAttemptRef.current++;refreshAttemptRef.current++;
      loginPromiseRef.current?.reject(new Error("Phiên đăng nhập đã thay đổi"));loginPromiseRef.current=null;
      tokenRef.current=event.newValue;userRef.current=null;appSessionRef.current=null;
      setUser(null);setCircleCredentials(null);setCircleWalletSyncing(false);setCircleWalletError(null);setCircleWalletChoices([]);setCircleWalletChoiceUnknown(false);circleChoiceFlightRef.current=null;setCircleProgress(null);setLoginAttemptId(null);
      setLogoutState("NONE");setSessionNotice(event.newValue?null:"ENDED");setIsLoading(!!event.newValue);setToken(event.newValue);
    };
    window.addEventListener("storage",changed);return()=>window.removeEventListener("storage",changed);
  },[]);

  useEffect(()=>{
    if(!token)return;const sessionToken=token,generation=sessionGenerationRef.current;let lastActivity=0,activityPending=false;
    const valid=()=>tokenRef.current===sessionToken&&localStorage.getItem(storageKey)===sessionToken&&generation===sessionGenerationRef.current;
    const poll=()=>{if(valid()&&appSessionRef.current&&document.visibilityState==="visible")void refreshUser();};
    const activity=()=>{
      if(!valid()||!appSessionRef.current||activityPending||Date.now()-lastActivity<60_000)return;
      lastActivity=Date.now();activityPending=true;
      void circleFetch("/api/auth/session/activity",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionToken}`},body:"{}"}).then(async response=>{
        if(!valid())return;if(response.status===401||response.status===403){clearLocal();setSessionNotice("ENDED");return;}
        if(!response.ok)throw new Error();const data=await response.json();if(!valid())return;
        const id=userRef.current?.id;if(!id)throw new Error();const next=readSession(data.session,id);if(!next.current||next.state!=="ACTIVE"||!Number.isSafeInteger(data.serverTime))throw new Error();appSessionRef.current=next;
      }).catch(()=>{if(valid())setSessionNotice("UNAVAILABLE");}).finally(()=>{activityPending=false;});
    };
    const timer=window.setInterval(poll,60_000);window.addEventListener("focus",poll);window.addEventListener("online",poll);document.addEventListener("visibilitychange",poll);
    document.addEventListener("pointerdown",activity);document.addEventListener("keydown",activity);
    return()=>{clearInterval(timer);window.removeEventListener("focus",poll);window.removeEventListener("online",poll);document.removeEventListener("visibilitychange",poll);document.removeEventListener("pointerdown",activity);document.removeEventListener("keydown",activity);};
  },[token]);

  const requestOtp = async (email: string) => {
    const generation=sessionGenerationRef.current;
    const {sdk,deviceId}=await ensureCircle();
    if(generation!==sessionGenerationRef.current)throw new Error("Phiên đăng nhập đã thay đổi");
    const appId=import.meta.env.VITE_CIRCLE_APP_ID as string;
    const data = await readJson(
      await circleFetch("/api/circle/email/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, deviceId }),
      })
    );
    if(generation!==sessionGenerationRef.current)throw new Error("Phiên đăng nhập đã thay đổi");
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

  const executeCircleMessageChallenge = async(challengeId:string):Promise<string>=>{
    const sdk=circleSdkRef.current,credentials=circleCredentials,generation=sessionGenerationRef.current,currentToken=tokenRef.current;
    if(!sdk||!credentials||!currentToken)throw new Error("WALLET_CIRCLE_REAUTH_REQUIRED");
    sdk.setAuthentication({userToken:credentials.userToken,encryptionKey:credentials.encryptionKey});
    return new Promise<string>((resolve,reject)=>{
      const timeout=window.setTimeout(()=>reject(new Error("WALLET_SIGNATURE_UNCONFIRMED")),120_000);
      try{sdk.execute(challengeId,(error,result)=>{
        clearTimeout(timeout);
        if(generation!==sessionGenerationRef.current||currentToken!==tokenRef.current){reject(new Error("AUTH_SESSION_CHANGED"));return;}
        if(error||result?.status!=="COMPLETE"||result.type!=="SIGN_MESSAGE"||!("data" in result)||!result.data||!/^0x[0-9a-fA-F]{130}$/.test(result.data.signature)){reject(new Error("WALLET_SIGNATURE_UNCONFIRMED"));return;}
        resolve(result.data.signature);
      });}catch{clearTimeout(timeout);reject(new Error("WALLET_SIGNATURE_UNCONFIRMED"));}
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

  const syncCircleWalletInBackground = async (sessionToken:string,credentials:CircleCredentials):Promise<void> => {
    const syncAttempt=++circleSyncAttemptRef.current,generation=sessionGenerationRef.current,expectedId=userRef.current?.id;
    const current=()=>circleLifecycle.current.active&&circleSyncAttemptRef.current===syncAttempt&&generation===sessionGenerationRef.current&&tokenRef.current===sessionToken&&localStorage.getItem(storageKey)===sessionToken&&!!expectedId&&userRef.current?.id===expectedId;
    if(!current())return;setCircleWalletSyncing(true);setCircleWalletError(null);
    try{
      let initialization:any;
      try{initialization=await readJson(await circleFetch("/api/circle/wallet/initialize",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+sessionToken},body:JSON.stringify({userToken:credentials.userToken})}));}
      catch(error){if(!current())return;if(!(error instanceof Error)||error.message!=="CIRCLE_WALLET_SELECTION_REQUIRED")throw error;initialization={};}
      if(!current())return;
      if(initialization.challengeId)circleSdkRef.current?.execute(initialization.challengeId,error=>{if(error&&current())setCircleWalletError("Chưa hoàn tất xác nhận Circle. Thử đồng bộ lại ví.");});
      const deadline=Date.now()+120_000;
      for(let attempt=0;attempt<60&&Date.now()<deadline;attempt++){
        if(!current())return;
        try{
          const response=await readJson(await circleFetch("/api/circle/wallets",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+sessionToken},body:JSON.stringify({userToken:credentials.userToken})}));
          if(!current())return;
          if(response.selectionRequired===true){const wallets=readInitialCircleWalletChoices(response,expectedId!);setCircleWalletChoices(wallets);setCircleWalletChoiceUnknown(false);setCircleWalletError(null);return;}
          if(response.wallets?.length&&response.user){acceptUser(response.user,expectedId);setCircleWalletChoices([]);setCircleWalletChoiceUnknown(false);setCircleWalletError(null);return;}
        }catch(error){if(!current())return;if(error instanceof Error&&error.message==="AUTH_RESPONSE_INVALID")throw error;}
        await new Promise(resolve=>window.setTimeout(resolve,1500));
      }
      if(current())setCircleWalletError("Chưa đồng bộ được ví Arc. Bấm thử lại; không cần đăng xuất hoặc tạo tài khoản mới.");
    }catch{if(current())setCircleWalletError("Chưa đọc được ví Circle. Thử đồng bộ lại hoặc xác thực email lại.");}
    finally{if(current())setCircleWalletSyncing(false);}
  };

  const selectInitialCircleWallet = async (walletId:string):Promise<void> => {
    if(circleChoiceFlightRef.current!==null||circleWalletSyncing||circleWalletChoiceUnknown)throw new Error("CIRCLE_WALLET_SELECTION_UNAVAILABLE");
    const selected=circleWalletChoices.find(w=>w.walletId===walletId),credentials=circleCredentials,sessionToken=tokenRef.current,expectedId=userRef.current?.id,generation=sessionGenerationRef.current;
    if(!selected||!credentials||!sessionToken||!expectedId)throw new Error("CIRCLE_WALLET_SELECTION_UNAVAILABLE");
    const attempt=++circleSyncAttemptRef.current;circleChoiceFlightRef.current=attempt;
    const current=()=>circleLifecycle.current.active&&attempt===circleSyncAttemptRef.current&&generation===sessionGenerationRef.current&&sessionToken===tokenRef.current&&localStorage.getItem(storageKey)===sessionToken&&userRef.current?.id===expectedId;
    if(!current()){circleChoiceFlightRef.current=null;return;}
    setCircleWalletSyncing(true);setCircleWalletError(null);
    try{const response=await readJson(await circleFetch("/api/circle/wallet/select",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+sessionToken},body:JSON.stringify({userToken:credentials.userToken,walletId:selected.walletId})}));if(!current())return;const next=readInitialCircleWalletAck(response,expectedId,selected);acceptUser(next,expectedId);setCircleWalletChoices([]);setCircleWalletChoiceUnknown(false);}
    catch{if(current()){setCircleWalletChoiceUnknown(true);setCircleWalletError("Chưa xác nhận được ví đã chọn. Đọc lại trạng thái trước khi chọn tiếp.");}}
    finally{if(circleChoiceFlightRef.current===attempt)circleChoiceFlightRef.current=null;if(current())setCircleWalletSyncing(false);}
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
    circleSyncAttemptRef.current++;circleChoiceFlightRef.current=null;setCircleWalletChoices([]);setCircleWalletChoiceUnknown(false);setCircleWalletSyncing(false);
    setLogoutState("NONE");setSessionNotice(null);
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
      if(generation!==sessionGenerationRef.current)throw new Error("Phiên đăng nhập đã bị hủy");
      setCircleCredentials(credentials);
      sdk.setAuthentication({
        userToken: credentials.userToken,
        encryptionKey: credentials.encryptionKey,
      });

      setCircleProgress("Đang tạo phiên đăng nhập GroupDeal...");
      const session = await createLocalSession(credentials);
      if (generation !== sessionGenerationRef.current){discardIssuedSession(session.token);throw new Error("Phiên đăng nhập đã bị hủy");}

      const next=readUser(session.user);if(typeof session.token!=="string"||!session.token||session.token.length>8192)throw new Error("AUTH_RESPONSE_INVALID");
      tokenRef.current=session.token;
      setToken(session.token);
      localStorage.setItem(storageKey, session.token);
      acceptUser(next);
      void syncCircleWalletInBackground(session.token, credentials);
      return session.user as User;
    } finally {
      if(generation===sessionGenerationRef.current)setCircleProgress(null);
    }
  };

  const getSessionEpoch=useCallback(()=>{if(!circleLifecycle.current.active)throw new Error("AUTH_SESSION_ENDED");return sessionGenerationRef.current;},[]);

  const loginWithWallet = async (signer: ethers.Signer, expectedEpoch?:number) => {
    if(expectedEpoch!==undefined&&expectedEpoch!==getSessionEpoch())throw new Error("Phiên đăng nhập đã thay đổi");
    const generation = ++sessionGenerationRef.current;
    setLogoutState("NONE");setSessionNotice(null);
    const walletAddress = await signer.getAddress();
    if(generation!==sessionGenerationRef.current)throw new Error("Phiên đăng nhập đã bị hủy");
    const challenge = await readJson(
      await fetch("/api/auth/wallet/login/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      })
    );
    if(generation!==sessionGenerationRef.current)throw new Error("Phiên đăng nhập đã bị hủy");
    if(realm==='ADMIN'){
      readAdminLoginChallenge(challenge,walletAddress,location.origin);
      if(Number((await signer.provider?.getNetwork())?.chainId)!==5042002)throw Error('ADMIN_CHALLENGE_INVALID');
      if(generation!==getSessionEpoch()||document.visibilityState!=='visible')throw Error('AUTH_SESSION_ENDED');
    }
    const signature = await signer.signMessage(challenge.challengeMessage);
    if(realm==='ADMIN'&&generation!==getSessionEpoch())throw Error('AUTH_SESSION_ENDED');
    if(realm==='ADMIN'&&((await signer.getAddress()).toLowerCase()!==walletAddress.toLowerCase()||Number((await signer.provider?.getNetwork())?.chainId)!==5042002||ethers.verifyMessage(challenge.challengeMessage,signature).toLowerCase()!==walletAddress.toLowerCase()||challenge.expiresAt<=Date.now()/1000))throw Error('ADMIN_WALLET_CHANGED');
    if(generation!==sessionGenerationRef.current)throw new Error("Phiên đăng nhập đã bị hủy");
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
    if (generation !== sessionGenerationRef.current){discardIssuedSession(session.token);throw new Error("Phiên đăng nhập đã bị hủy");}
    const next=readUser(session.user);if(typeof session.token!=="string"||!session.token||session.token.length>8192)throw new Error("AUTH_RESPONSE_INVALID");
    circleSyncAttemptRef.current += 1;
    setCircleCredentials(null);
    setCircleWalletSyncing(false);
    setCircleWalletError(null);
    setCircleWalletChoices([]);setCircleWalletChoiceUnknown(false);circleChoiceFlightRef.current=null;
    tokenRef.current=session.token;appSessionRef.current=null;setToken(session.token);
    localStorage.setItem(storageKey, session.token);
    acceptUser(next);
    return session.user as User;
  };

  const linkExternalWallet = async (signer: ethers.Signer, expectedEpoch?:number) => {
    if(expectedEpoch!==undefined&&expectedEpoch!==getSessionEpoch())throw new Error("Phiên đăng nhập đã thay đổi");
    if (!token) throw new Error("Must be logged in to link wallet");
    const generation=sessionGenerationRef.current,expectedId=userRef.current?.id;
    const assertCurrent=()=>{if(generation!==sessionGenerationRef.current||token!==tokenRef.current||!expectedId||userRef.current?.id!==expectedId)throw new Error("Phiên đăng nhập đã thay đổi");};
    assertCurrent();
    const address = await signer.getAddress();
    assertCurrent();
    const chalData = await readJson(
      await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "LINK_WALLET", walletAddress: address }),
      })
    );
    assertCurrent();
    const signature = await signer.signMessage(chalData.challengeMessage);
    assertCurrent();
    const data = await readJson(
      await fetch("/api/auth/wallet/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ walletAddress: address, signature, message: chalData.challengeMessage }),
      })
    );
    if(generation!==sessionGenerationRef.current||token!==tokenRef.current||!expectedId)throw new Error("Phiên đăng nhập đã thay đổi");
    return acceptUser(data.user,expectedId);
  };

  const setupSellerProfile = async (_profileData: { displayName: string; bio: string; payoutWallet: string; signer?: ethers.Signer; }): Promise<User> => {
    throw new Error("SELLER_PROFILE_INTENT_REQUIRED");
  };

  return (
    <AuthContext.Provider
      value={{
        realm,user,
        token,
        isLoading,
        circleReady,circleInitState,prepareCircle,
        circleProgress,
        circleWalletSyncing,
        circleWalletError,
        circleWalletChoices,circleWalletChoiceUnknown,selectInitialCircleWallet,
        retryCircleWallet,
        circleCredentials,
        requestOtp,
        verifyOtp,
        executeCircleChallenge,
        executeCircleMessageChallenge,
        getSessionEpoch,loginWithWallet,
        linkExternalWallet,
        setupSellerProfile,
        logout,
        logoutState,sessionNotice,endConfirmedSession,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
