import {createAppKit} from "@reown/appkit";
import {arbitrumSepolia,baseSepolia,defineChain,sepolia} from "@reown/appkit/networks";
import {EthersAdapter} from "@reown/appkit-adapter-ethers";
import {attachReownRuntime,type ReownRuntime} from "../services/reownRuntime";
import {walletReloadError} from "../services/authPresentation";

export const arcTestnet=defineChain({
 id:5042002,caipNetworkId:"eip155:5042002",chainNamespace:"eip155",name:"Arc Testnet",testnet:true,
 nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
 rpcUrls:{default:{http:["https://rpc.testnet.arc.io"],webSocket:["wss://rpc.testnet.arc.io"]}},
 blockExplorers:{default:{name:"Arc Testnet Explorer",url:"https://testnet.arcscan.app"}},
});
let runtime:Promise<ReownRuntime>|null=null,ownerProject:string|null=null;
export function initializeReown(projectId:string):Promise<ReownRuntime>{
 if(ownerProject&&ownerProject!==projectId)return Promise.reject(walletReloadError());
 if(runtime)return runtime;
 ownerProject=projectId;
 try{
 const app=createAppKit({
  adapters:[new EthersAdapter()],networks:[arcTestnet,sepolia,baseSepolia,arbitrumSepolia],projectId,
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
