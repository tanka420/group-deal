import type {AppKit} from '@reown/appkit';
import type {Eip1193Provider} from '../context/ExternalWalletContext';
import {ethers} from 'ethers';
import {walletReloadError} from './authPresentation';

export interface ReownSnapshot {address?:string;chainId?:number|string;connected:boolean;provider?:Eip1193Provider}
export interface ReownRuntime {
 snapshot:()=>ReownSnapshot;
 subscribe:(listener:(value:ReownSnapshot)=>void)=>()=>void;
 connect:(signal?:AbortSignal)=>Promise<string>;
 getSigner:()=>Promise<ethers.Signer>;
 getProvider:()=>Eip1193Provider;
 disconnect:()=>Promise<void>;
}

/** Imperative integration keeps the application's React tree mounted. */
export function attachReownRuntime(app:AppKit):ReownRuntime {
 const snapshot=():ReownSnapshot=>{
  const account=app.getAccount('eip155'),provider=app.getWalletProvider() as Eip1193Provider|null;
  const address=account?.address;
  return {address,chainId:app.getChainId(),connected:Boolean(account?.isConnected&&address&&provider?.request),provider:provider?.request?provider:undefined};
 };
 let connecting:Promise<string>|null=null,reloadRequired=false;
 const reloadError=walletReloadError;
 const getProvider=()=>{if(reloadRequired)throw reloadError();const value=snapshot().provider;if(!value)throw new Error('Chưa kết nối ví EVM');return value;};
 const endedError=()=>new Error('WALLET_CONNECTION_ENDED');
 const bounded=async<T>(work:Promise<T>,milliseconds:number,signal?:AbortSignal):Promise<T>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  let abort:()=>void=()=>{};
  try{return await Promise.race([work,new Promise<never>((_resolve,reject)=>{
   timer=setTimeout(()=>reject(reloadError()),milliseconds);
   abort=()=>reject(endedError());
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();
  })]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 };
 return {
  snapshot,
  subscribe(listener){const update=()=>listener(snapshot());const stop=[app.subscribeAccount(update,'eip155'),app.subscribeNetwork(update),app.subscribeProviders(update)];update();return()=>stop.forEach(unsubscribe=>unsubscribe());},
  connect(signal){
   if(connecting)return connecting;
   const own=(async()=>{
    if(signal?.aborted)throw endedError();
    // A timed-out resource import can still open a global SDK modal later.
    // Refuse another attempt in this page rather than letting its cleanup
    // close a newer request, or silently replacing AppKit's controllers.
    if(reloadRequired)throw reloadError();
    const current=snapshot();if(current.connected&&current.address)return ethers.getAddress(current.address);
    const deadline=Date.now()+60_000;
    let cancelled=false,sawOpen=app.getState().open,opened=false,closeRequested=false;
    // Record cancellation when it occurs: a provider result arriving before the
    // next polling tick must not turn a closed request into a sign-in approval.
    const stop=app.subscribeState(state=>{if(state.open)sawOpen=true;else if(sawOpen&&!snapshot().connected)cancelled=true;});
    let opening:ReturnType<AppKit['open']>;
    try{opening=app.open({view:'Connect'});}catch{stop();reloadRequired=true;throw reloadError();}
    const close=async()=>{
     closeRequested=true;
     try{await bounded(app.close(),5_000);}catch{reloadRequired=true;throw reloadError();}
    };
    try{
     await bounded(opening,20_000,signal);opened=true;
     // AppKit 1.8.24 catches UI-import failures and can report open without
     // creating a modal. Use the browser element, not that flag alone.
     if(typeof document!=='undefined'&&(!document.querySelector('w3m-modal')?.isConnected||!customElements.get('w3m-modal'))){reloadRequired=true;throw reloadError();}
     while(Date.now()<deadline){
      if(signal?.aborted)throw endedError();
      if(cancelled)throw new Error('Bạn đã đóng kết nối ví');
      const state=snapshot();
      if(state.connected&&state.address){await close();if(signal?.aborted)throw endedError();return ethers.getAddress(state.address);}
      if(!app.getState().open)throw new Error('Bạn đã đóng kết nối ví');
      await new Promise(resolve=>setTimeout(resolve,200));
     }
     throw new Error('Hết thời gian chờ kết nối ví qua Reown AppKit');
    }catch(error){
     if(!opened){
      reloadRequired=true;
      // This result is never sign-in approval. Retain credentials but close
      // a modal that appears after its owning request has already ended.
      void opening.then(()=>app.close()).catch(()=>{});
      throw signal?.aborted?endedError():reloadError();
     }
     if(!closeRequested&&app.getState().open)await close();
     throw error;
    }finally{stop();}
   })();connecting=own;void own.finally(()=>{if(connecting===own)connecting=null;}).catch(()=>{});return own;
  },
  getSigner:async()=>new ethers.BrowserProvider(getProvider()).getSigner(),
  getProvider,
  disconnect:()=>app.disconnect('eip155'),
 };
}
