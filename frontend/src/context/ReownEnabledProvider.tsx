import {createAppKit} from "@reown/appkit";
import {arbitrumSepolia,baseSepolia,defineChain,sepolia} from "@reown/appkit/networks";
import {EthersAdapter} from "@reown/appkit-adapter-ethers";
import {attachReownRuntime,type ReownRuntime} from "../services/reownRuntime";
import {walletReloadError} from "../services/authPresentation";
import {ARC_CHAIN_ID,ARC_NETWORK,ARC_CHAIN_NAME,ARC_IS_MAINNET} from '../../../shared/network.mjs';

export const arcTestnet=defineChain({
 id:ARC_CHAIN_ID,caipNetworkId:`eip155:${ARC_CHAIN_ID}`,chainNamespace:"eip155",name:ARC_CHAIN_NAME,testnet:!ARC_IS_MAINNET,
 nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
 rpcUrls:{default:{http:[ARC_NETWORK.rpc.primary],webSocket:[ARC_NETWORK.rpc.ws]}},
 blockExplorers:{default:{name:ARC_CHAIN_NAME+" Explorer",url:ARC_NETWORK.explorerUrl}},
});
let runtime:Promise<ReownRuntime>|null=null,ownerProject:string|null=null;
export function initializeReown(projectId:string):Promise<ReownRuntime>{
 if(ownerProject&&ownerProject!==projectId)return Promise.reject(walletReloadError());
 if(runtime)return runtime;
 ownerProject=projectId;
 try{
 const app=createAppKit({
  adapters:[new EthersAdapter()],networks:ARC_IS_MAINNET?[arcTestnet]:[arcTestnet,sepolia,baseSepolia,arbitrumSepolia],projectId,
  metadata:{name:"GroupDeal",description:"Mua chung sản phẩm số bằng USDC trên Arc",url:window.location.origin,icons:[]},
  themeVariables:{"--w3m-font-family":'"Plus Jakarta Sans Variable", sans-serif'},
  features:{email:false,socials:false,analytics:false,reownAuthentication:false},
 });
 // AppKit owns global controllers: retain this initialization across remounts.
 runtime=app.ready().then(()=>{
  // Cloud settings override local feature flags in AppKit 1.8.24. Refuse to
  // open a signing flow if that configuration adds another auth authority.
  const features=app.getRemoteFeatures();
  if(features?.email||(Array.isArray(features?.socials)&&features.socials.length)||features?.reownAuthentication)throw new Error("REOWN_AUTH_CONFIGURATION");
  return attachReownRuntime(app);
 }).catch(error=>{if(error instanceof Error&&error.message==="REOWN_AUTH_CONFIGURATION")throw error;throw walletReloadError();});
 }catch{runtime=Promise.reject(walletReloadError());}
 return runtime;
}
