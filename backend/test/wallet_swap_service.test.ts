import assert from 'node:assert/strict';
import {WalletSwapService} from '../src/services/walletSwapService';
const intent={kind:'SWAP' as const,tokenIn:'USDC' as const,tokenOut:'EURC' as const,amount:'1',slippageBps:100},principal='0x'+'12'.repeat(20);
void(async()=>{
 for(const [status,code]of [[429,'WALLET_QUOTE_RATE_LIMITED'],[400,'WALLET_SWAP_ROUTE_UNAVAILABLE'],[503,'WALLET_SWAP_PROVIDER_UNAVAILABLE']] as const){let calls=0;const service=new WalletSwapService((async(url,options)=>{calls++;assert.equal(url,'https://api.circle.com/v1/stablecoinKits/swap');assert.equal(options?.redirect,'error');assert.equal((options?.headers as Record<string,string>).Authorization,undefined);const body=JSON.parse(String(options?.body));assert.equal(body.fromAddress,principal);assert.equal(body.toAddress,principal);assert.equal(body.tokenInChain,'Arc_Testnet');return new Response('private-provider-diagnostic',{status});}) as typeof fetch);await assert.rejects(service.quote(intent,principal),e=>e instanceof Error&&e.message===code);assert.equal(calls,1);}
 const oversized=new WalletSwapService((async()=>new Response('x'.repeat(262145))) as typeof fetch);await assert.rejects(oversized.quote(intent,principal),/WALLET_SWAP_PROVIDER_UNAVAILABLE/);
 const malformed=new WalletSwapService((async()=>new Response('{"fromAddress":"foreign"}')) as typeof fetch);await assert.rejects(malformed.quote(intent,principal),/WALLET_SWAP_QUOTE_INVALID/);
 console.log('PASS swap service bounded response, no credential forwarding, no retry and bounded errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
