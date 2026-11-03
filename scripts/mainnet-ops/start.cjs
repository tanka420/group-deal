'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function checkEnvironment(){
 if(process.platform!=='linux'||!/^v24\./.test(process.version)||process.env.APP_ENV!=='arc-mainnet'||process.env.NODE_ENV!=='production'||process.env.ARC_CHAIN_ID!=='5042'||process.env.PORT!=='4100'
  ||process.env.PUBLIC_APP_URL!=='https://groupdeal.tech'||process.env.ALLOWED_ORIGINS!=='https://groupdeal.tech'
  ||Object.keys(process.env).some(k=>/^GROUPDEAL_(?:RECOVERY|LOCAL|ENABLE)/.test(k)))throw Error('MAINNET_SERVICE_SCOPE_INVALID');
 const release=JSON.parse(fs.readFileSync(path.join(root,'RELEASE.json')));
 if(release.scope!=='MAINNET_INTERNAL_SERVICE_PREPARATION'||release.chainId!==5042||release.contract.address!=='0x52A893b45C1BeaBdCe04f58705D7812eA2519Ff8')throw Error('MAINNET_SERVICE_RELEASE_INVALID');
 if(fs.realpathSync(path.join(root,'backend/data/arc-mainnet'))!=='/var/lib/groupdeal-mainnet/data')throw Error('MAINNET_SERVICE_STORAGE_INVALID');
 return release;
}
async function main(){
 checkEnvironment();process.umask(0o077);
 const {startServer}=require(path.join(root,'backend/dist/index.js'));
 const runtime=await startServer();let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;void runtime.stop().catch(()=>{process.exitCode=1;});};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
if(require.main===module)main().catch(()=>{console.error('MAINNET_STARTUP_BLOCKED');process.exitCode=1;});
module.exports={checkEnvironment};
