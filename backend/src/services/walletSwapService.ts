import {WalletFlowError,parseWalletSwapQuote,swapServiceRequest,type WalletIntent} from '../domain/walletQuote';

/** Same preparation endpoint used by pinned App Kit1.15.3 / Swap Kit1.7.0.
 * The response is an unsigned user transaction plus the route service signature.
 * No key or user-controlled-wallet credentials are sent to this endpoint. */
export class WalletSwapService {
 constructor(private readonly request:typeof fetch=fetch){}
 async quote(intent:Extract<WalletIntent,{kind:'SWAP'}>,principal:string){
  const body=swapServiceRequest(intent,principal),startedAt=Date.now();
  try{
   const response=await this.request('https://api.circle.com/v1/stablecoinKits/swap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});
   if(!response.ok){await response.body?.cancel();throw new WalletFlowError(response.status===429?'WALLET_QUOTE_RATE_LIMITED':response.status<500?'WALLET_SWAP_ROUTE_UNAVAILABLE':'WALLET_SWAP_PROVIDER_UNAVAILABLE',response.status===429?429:response.status<500?409:503);}
   const reader=response.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>262144)throw Error();chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(Date.now()-startedAt>20000)throw Error();const bytes=Buffer.concat(chunks.map(c=>Buffer.from(c)));return parseWalletSwapQuote(JSON.parse(bytes.toString('utf8')),intent,principal,Date.now());
  }catch(e){if(e instanceof WalletFlowError)throw e;throw new WalletFlowError('WALLET_SWAP_PROVIDER_UNAVAILABLE',503);}
 }
}
export const walletSwapService=new WalletSwapService();
