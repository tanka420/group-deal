import {expect,type Page} from '@playwright/test';

export type CheckoutRpcRequest={method:string;params?:any[]};

/** Real installed/emitted AppKit and ethers; only HTTP, websocket and injected-wallet
 * boundaries are fixtures. No application or wallet-context module is replaced. */
export async function installCheckoutWallet(page:Page,address:string,rpc:(request:CheckoutRpcRequest)=>unknown){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('fixtureCheckoutRpc',rpc);
  await page.addInitScript(({address})=>{
    if(top!==self)return;
    (window as any).buyWrites=0;
    (window as any).fixtureWalletRequests=[];
    const listeners=new Map<string,Set<(...args:unknown[])=>void>>();
    let connected=false,chain='0x4cef52';
    const emit=(event:string,value:unknown)=>listeners.get(event)?.forEach(listener=>listener(value));
    const provider={
      isMetaMask:true,
      on:(event:string,listener:(...args:unknown[])=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(listener);},
      removeListener:(event:string,listener:(...args:unknown[])=>void)=>listeners.get(event)?.delete(listener),
      request:async({method,params=[]}:{method:string;params?:any[]})=>{
        (window as any).fixtureWalletRequests.push(method);
        if(method==='eth_requestAccounts'){connected=true;emit('accountsChanged',[address]);return[address];}
        if(method==='eth_accounts')return connected?[address]:[];
        if(method==='eth_chainId')return chain;
        if(method==='wallet_getPermissions')return[];
        if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain'){
          if(params[0]?.chainId!=='0x4cef52')throw Error('Checkout fixture only permits Arc Testnet');
          chain=params[0].chainId;emit('chainChanged',chain);return null;
        }
        const result=await (window as any).fixtureCheckoutRpc({method,params});
        if(method==='eth_sendTransaction')(window as any).buyWrites++;
        return result;
      },
    };
    (window as any).ethereum=provider;
    const announce=()=>dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{
      info:{uuid:'df03143e-04fd-4655-bf97-fd63a6a87f68',name:'Fixture Wallet',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',rdns:'test.groupdeal.checkout'},provider,
    }}));
    addEventListener('eip6963:requestProvider',announce);
  },{address});
  await page.routeWebSocket('**/*',ws=>new URL(ws.url()).hostname==='127.0.0.1'?ws.connectToServer():ws.close());
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('https://api.web3modal.org/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/config'))return route.fulfill({json:{features:[]}});
    if(path.endsWith('/origins'))return route.fulfill({json:{allowedOrigins:['http://127.0.0.1:'+process.env.GROUPDEAL_BROWSER_PORT]}});
    if(path.endsWith('/project-limits'))return route.fulfill({json:{planLimits:{tier:'unlimited',isAboveMauLimit:false,isAboveRpcLimit:false}}});
    if(path==='/getWallets')return route.fulfill({json:{data:[],count:0}});
    if(/getAssetImage|getWalletImage/.test(path))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
    return route.abort();
  });
  await page.route('https://pw-auth.circle.com/**',route=>route.fulfill({contentType:'text/html',body:"<script>addEventListener('message',e=>{if(e.source===parent&&e.data.w3s)parent.postMessage({deviceId:'fixture-device'},'*')});parent.postMessage({onFrameReady:true},'*');</script>"}));
  for(const origin of ['https://rpc.testnet.arc.io/**','https://rpc.drpc.testnet.arc.io/**','https://rpc.walletconnect.org/**']){
    await page.route(origin,async route=>{
      const payload=route.request().postDataJSON();
      const reply=async(request:any)=>({jsonrpc:'2.0',id:request.id,result:await rpc(request)});
      return route.fulfill({json:Array.isArray(payload)?await Promise.all(payload.map(reply)):await reply(payload)});
    });
  }
  return{errors};
}

export async function chooseCheckoutWallet(page:Page){
  const modal=page.locator('w3m-modal');
  await expect(modal).toHaveJSProperty('open',true,{timeout:20_000});
  await modal.getByText('Fixture Wallet',{exact:true}).click();
}
