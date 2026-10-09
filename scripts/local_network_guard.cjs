const http=require('node:http'),https=require('node:https');
function arcEndpoint(value){try{const hostname=new URL(typeof value==='string'||value instanceof URL?value:(value.protocol||'https:')+'//'+(value.hostname||value.host||'localhost')).hostname.toLowerCase();return hostname==='testnet.arc.io'||hostname.endsWith('.testnet.arc.io');}catch{return false;}}
const denied=()=>new Error('LOCAL_CHECK_NETWORK_GUARD: live Arc RPC is disabled for fixture checks');
const originalFetch=globalThis.fetch;
if(originalFetch)globalThis.fetch=function(input,options){if(arcEndpoint(input?.url||input))return Promise.reject(denied());return originalFetch(input,options);};
for(const transport of [http,https])for(const method of ['request','get']){const original=transport[method];transport[method]=function(...args){if(arcEndpoint(args[0]))throw denied();return original.apply(this,args);};}
module.exports={arcEndpoint};
