import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Signer } from "ethers";
import type {ReownRuntime,ReownSnapshot} from "../services/reownRuntime";
import {walletReloadError} from "../services/authPresentation";

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
// Loading the wallet never replaces the ancestor of App/AuthProvider.
export const ExternalWalletProvider:React.FC<{children:React.ReactNode}>=({children})=>{
 const projectId=import.meta.env.VITE_REOWN_PROJECT_ID as string|undefined;
 const [snapshot,setSnapshot]=useState<ReownSnapshot>({connected:false});
 const lifecycle=useRef({active:true,epoch:0}),runtime=useRef<ReownRuntime|null>(null),pending=useRef<Promise<ReownRuntime>|null>(null),unsubscribe=useRef<(()=>void)|null>(null);
 const connection=useRef<{controller:AbortController;promise:Promise<string>}|null>(null);
 useLayoutEffect(()=>{lifecycle.current.active=true;return()=>{lifecycle.current.active=false;lifecycle.current.epoch++;connection.current?.controller.abort();connection.current=null;pending.current=null;runtime.current=null;unsubscribe.current?.();unsubscribe.current=null;};},[]);
 const ensure=useCallback(():Promise<ReownRuntime>=>{
  if(!projectId)return missingReownConfiguration();
  if(!lifecycle.current.active)return Promise.reject(new Error("WALLET_CONNECTION_ENDED"));
  if(runtime.current)return Promise.resolve(runtime.current);
  if(pending.current)return pending.current;
  const epoch=lifecycle.current.epoch,current=()=>lifecycle.current.active&&lifecycle.current.epoch===epoch;
  const own=(async()=>{
   let timeout:ReturnType<typeof setTimeout>|undefined;
   try{
    const loaded=await Promise.race([
     import("./ReownEnabledProvider").then(module=>{if(!current())throw new Error("WALLET_CONNECTION_ENDED");return module.initializeReown(projectId);},()=>{throw walletReloadError();}),
     new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error("WALLET_INITIALIZATION_TIMEOUT")),20_000);}),
    ]);
    if(!current())throw new Error("WALLET_CONNECTION_ENDED");
    runtime.current=loaded;unsubscribe.current?.();unsubscribe.current=loaded.subscribe(value=>{if(current())setSnapshot(value);});return loaded;
   }finally{clearTimeout(timeout);if(current())pending.current=null;}
  })();pending.current=own;return own;
 },[projectId]);
 const connect=useCallback(():Promise<string>=>{
  if(connection.current)return connection.current.promise;
  const controller=new AbortController(),epoch=lifecycle.current.epoch;
  const promise=(async()=>{
   const value=await ensure();
   if(controller.signal.aborted||!lifecycle.current.active||lifecycle.current.epoch!==epoch)throw new Error("WALLET_CONNECTION_ENDED");
   return value.connect(controller.signal);
  })();
  const own={controller,promise};connection.current=own;
  void promise.finally(()=>{if(connection.current===own)connection.current=null;}).catch(()=>{});
  return promise;
 },[ensure]);
 const value=useMemo<ExternalWalletContextType>(()=>projectId?{
  configured:true,...snapshot,
  connect,
  getSigner:async()=>{const value=await ensure();if(!lifecycle.current.active)throw new Error("WALLET_CONNECTION_ENDED");return value.getSigner();},
  getProvider:()=>{if(!runtime.current)throw new Error("Chưa kết nối ví EVM");return runtime.current.getProvider();},
  disconnect:async()=>{if(runtime.current)await runtime.current.disconnect();},
 }:disabledExternalWallet,[projectId,snapshot,ensure,connect]);
 return <ExternalWalletContext.Provider value={value}>{children}</ExternalWalletContext.Provider>;
};

export const useExternalWallet = () => useContext(ExternalWalletContext);
