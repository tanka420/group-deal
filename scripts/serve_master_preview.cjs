/* Local visual fixture host. Never imports backend/store, keys, or signing code. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const options=process.argv.slice(2),standalone=options.includes('--standalone'),ports=options.filter(value=>value!=='--standalone'),port=Number(ports[0]||4180);
if(ports.length>1||options.filter(value=>value==='--standalone').length>1||!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Use one valid loopback preview port and optional --standalone');
async function main(){
  const root=path.resolve(__dirname,'..'),frontend=path.join(root,'frontend');
  const {masterFixture}=await import(pathToFileURL(path.join(frontend,'e2e/fixtures/master-deal.mjs')).href);
  const {productInventoryFixture}=await import(pathToFileURL(path.join(frontend,'e2e/fixtures/product-inventory.mjs')).href);
  const {emptyCatalog}=await import(pathToFileURL(path.join(frontend,'e2e/fixtures/catalog.mjs')).href);
  const {arcTestnetManifest}=require('../shared/manifest.cjs');
  const data=masterFixture(),actorId='fixture',reject='async()=>{throw new Error("LOCAL_UI_FIXTURE: chain actions disabled")}',no='async()=>{}';
  const auth=`export const AuthProvider=({children})=>children;export const useAuth=()=>({
    user:${JSON.stringify({id:actorId,email:null,roles:['buyer','seller','operator'],loginMethod:'EVM_WALLET',activeWallet:null,sellerProfile:data.seller})},token:"local-fixture-session",isLoading:false,
    circleReady:false,circleInitState:"UNAVAILABLE",circleProgress:null,circleWalletSyncing:false,circleWalletError:null,circleWalletChoices:[],circleWalletChoiceUnknown:false,circleCredentials:null,
    prepareCircle:${reject},selectInitialCircleWallet:${reject},retryCircleWallet:${reject},requestOtp:${reject},verifyOtp:${reject},executeCircleChallenge:${reject},executeCircleMessageChallenge:${reject},getSessionEpoch:()=>0,
    loginWithWallet:${reject},linkExternalWallet:${reject},setupSellerProfile:${reject},logout:()=>{},logoutState:"NONE",sessionNotice:null,endConfirmedSession:()=>{},refreshUser:${no}
  });`;
  const web3=`export const Web3Provider=({children})=>children;export const useWeb3=()=>({
    account:null,chainId:null,hubAddress:"",usdcAddress:"",usdcBalance:null,balanceError:null,balanceLoading:false,isConnecting:false,walletMode:"DISCONNECTED",externalWalletConfigured:false,externalSignerReady:false,
    reconnectExternalWallet:${reject},loginWithExternalWallet:${reject},connectExternalWallet:${reject},getExternalSigner:${reject},switchToCircleWallet:()=>{},createCampaignOnchain:${reject},broadcastPreparedOperation:${reject},recoverCircleOperation:${reject},recordDeliveryOnchain:${reject},commitToBuyOnchain:${reject},claimBuyerFundsOnchain:${reject},claimSellerProceedsOnchain:${reject},confirmReceiptOnchain:${reject},openDisputeOnchain:${reject},claimDeliveryBreachOnchain:${reject},settleUndisputedOrderOnchain:${reject},resolveDisputeOnchain:${reject},refreshBalance:${no}
  });`;
  let upstream='http://127.0.0.1:4173',vite,cacheDirectory;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'LOCAL_UI_FIXTURE: mutations disabled'}));return;}
    if(url.pathname==='/fallback.html'){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'LOCAL_UI_FIXTURE: direct chain tool unavailable'}));return;}
    if(url.pathname.startsWith('/api/')){
      const routes={
        '/api/v1/catalog':emptyCatalog(url.href,arcTestnetManifest.contracts.GroupDealHub.address),
        '/api/campaigns/master':{campaign:data.campaign,seller:data.seller},'/api/campaigns':{campaigns:[data.campaign]},
        '/api/notifications':{notifications:[],unread:0},'/api/transactions':{operations:[],pagination:{nextCursor:null}},
        '/api/seller/campaign-drafts':{drafts:[],pagination:{nextCursor:null}},'/api/seller/campaigns':{campaigns:[]},'/api/seller/orders':{orders:[]},'/api/seller/webhooks':{webhook:null},'/api/products/mine':productInventoryFixture([data.product],actorId),'/api/delivery/resources':{resources:[]},
        '/api/operator/deals':{campaigns:[data.detail.campaign],pagination:{nextCursor:null}},'/api/operator/deals/master':data.detail,
        '/api/operator/disputes':{disputes:[]},'/api/operator/sellers':{sellers:[]},'/api/operator/reconciliation':{report:{status:'UNVERIFIED',perOrderVerified:false}},'/api/operator/audit-logs':{logs:[]},
      };
      res.writeHead(Object.hasOwn(routes,url.pathname)?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify(routes[url.pathname]||{error:'LOCAL_UI_FIXTURE: route unavailable'}));return;
    }
    if(url.pathname==='/src/context/AuthContext.tsx'||url.pathname==='/src/context/Web3Context.tsx'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(url.pathname.includes('AuthContext')?auth:web3);return;}
    try{
      const response=await fetch(upstream+url.pathname+url.search,{signal:AbortSignal.timeout(10000)});
      const type=response.headers.get('content-type')||'application/octet-stream';let bytes=Buffer.from(await response.arrayBuffer());
      if(type.includes('text/html'))bytes=Buffer.from(bytes.toString().replace('<body>','<body><p style="background:#fff4db;color:#945500;padding:8px 16px;margin:0;font:14px system-ui">LOCAL UI FIXTURE · dữ liệu mẫu · không có giao dịch chain hoặc entitlement thật</p>'));
      res.writeHead(response.status,{'Content-Type':type});res.end(bytes);
    }catch{res.writeHead(503,{'Content-Type':'text/plain'});res.end('Local Vite preview unavailable');}
  });
  let closing=false;
  async function close(){if(closing)return;closing=true;await vite?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
  const stop=()=>{void close().then(()=>process.exit(0));};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    if(standalone){
      // Public fixture configuration only. No live wallet connection is exposed by this host.
      process.env.VITE_CIRCLE_APP_ID='e2e-only-circle-app-id';process.env.VITE_REOWN_PROJECT_ID='';
      const {createServer,loadConfigFromFile}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
      const loaded=await loadConfigFromFile({command:'serve',mode:'development'},path.join(frontend,'vite.config.ts'),frontend);
      if(!loaded)throw new Error('Vite configuration unavailable');
      cacheDirectory=path.join(frontend,'node_modules','.vite-master-preview-'+crypto.randomUUID());fs.mkdirSync(cacheDirectory);
      vite=await createServer({...loaded.config,configFile:false,root:frontend,cacheDir:cacheDirectory,logLevel:'warn',server:{...loaded.config.server,host:'127.0.0.1',port:0,strictPort:true,open:false,proxy:undefined,hmr:{server,clientPort:port}}});
      await vite.listen();const address=vite.httpServer.address();if(!address||typeof address==='string')throw new Error('Vite loopback address unavailable');upstream='http://127.0.0.1:'+address.port;
    }
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    console.log(JSON.stringify({scope:'LOCAL_UI_FIXTURE',url:`http://127.0.0.1:${port}/#campaign-master`,pid:process.pid,standalone,cacheDirectory:cacheDirectory?path.relative(root,cacheDirectory).replaceAll('\\','/'):null,chainActions:false,backendData:false}));
    process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{if(chunk.trim()==='STOP_PREVIEW')stop();});
  }catch(error){await close();throw error;}
}
main().catch(()=>{console.error('Local UI fixture failed to start; check the selected loopback port and installed frontend dependencies.');process.exitCode=1;});
