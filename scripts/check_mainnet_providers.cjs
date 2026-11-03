// Stdin-only credentials, fixed provider GETs or SMTP verify. No wallet/DB/backend imports.
const nodemailer=require('../backend/node_modules/nodemailer');
const publicConfig=require('../shared/mainnet-public.json');
const CIRCLE_URL='https://api.circle.com/v1/w3s/config/entity';
const blockscoutUrl=()=>'https://api.blockscout.com/5042/api/v2/addresses/'+require('../shared/manifests/arc-mainnet.json').roles.owner.address.toLowerCase()+'/tokens?type=ERC-20';
const base={emailsSent:0,transactionsSubmitted:0,signaturesCreated:0,backendActivated:false};
const failed=(code,extra={})=>({...base,result:'FAIL',code,...extra});
function smtpOptions(s){
 if(!s||typeof s!=='object'||Object.keys(s).sort().join(',')!=='SMTP_APP_PASSWORD,SMTP_FROM,SMTP_HOST,SMTP_PORT,SMTP_SECURE,SMTP_USER')throw Error('SMTP_CONFIGURATION_INVALID');
 const host=s.SMTP_HOST,port=Number(s.SMTP_PORT),secure=s.SMTP_SECURE==='true';
 if(typeof host!=='string'||host.length>253||!host.includes('.')||!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/i.test(host)||/^\d+(?:\.\d+){3}$/.test(host)
  ||![465,587].includes(port)||!['true','false'].includes(s.SMTP_SECURE)||secure!==(port===465)
  ||typeof s.SMTP_USER!=='string'||!s.SMTP_USER||s.SMTP_USER.length>320||/[\x00-\x20\x7f]/.test(s.SMTP_USER)
  ||typeof s.SMTP_FROM!=='string'||s.SMTP_FROM.length>320||! /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(s.SMTP_FROM)
  ||typeof s.SMTP_APP_PASSWORD!=='string'||s.SMTP_APP_PASSWORD.length>4096||/[\x00-\x1f\x7f]/.test(s.SMTP_APP_PASSWORD)||!s.SMTP_APP_PASSWORD.replace(/\s+/g,''))throw Error('SMTP_CONFIGURATION_INVALID');
 return {host,port,secure,requireTLS:!secure,auth:{user:s.SMTP_USER,pass:s.SMTP_APP_PASSWORD.replace(/\s+/g,'')},
  tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,servername:host},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000,dnsTimeout:10000,
  logger:false,debug:false,transactionLog:false,disableFileAccess:true,disableUrlAccess:true};
}
async function checkSmtp(settings,verifyConnection,transportFactory=nodemailer.createTransport){
 let options;try{options=smtpOptions(settings);}catch{return failed('SMTP_CONFIGURATION_INVALID');}
 if(!verifyConnection)return {...base,result:'PASS',smtpConfigurationPresent:true,smtpConnectionVerified:false,emailDeliveryVerified:false,networkCalls:0};
 let transport,timer;
 try{
  transport=transportFactory(options);
  await Promise.race([transport.verify(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SMTP_TIMEOUT')),20000);})]);
  return {...base,result:'PASS',smtpConfigurationPresent:true,smtpConnectionVerified:true,emailDeliveryVerified:false,networkCalls:1};
 }catch(error){return failed(error?.code==='EAUTH'?'SMTP_AUTHENTICATION_FAILED':'SMTP_TLS_OR_CONNECTION_FAILED',{smtpConnectionVerified:false,networkCalls:1});}
 finally{clearTimeout(timer);try{transport?.close();}catch{}}
}
async function readJson(response,maxBytes=65536){
 const reader=response.body?.getReader();if(!reader)throw Error();const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Error();chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }finally{try{await reader.cancel();}catch{}}
}
async function checkCircle(apiKey,fetcher=fetch){
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')return failed('CIRCLE_TLS_VALIDATION_DISABLED',{networkCalls:0});
 if(typeof apiKey!=='string'||apiKey.length>4096||!/^LIVE_API_KEY:[^\s:]+:[^\s:]+$/.test(apiKey))return failed('CIRCLE_MAINNET_KEY_FORMAT_INVALID',{networkCalls:0});
 try{
  const response=await fetcher(CIRCLE_URL,{method:'GET',redirect:'error',headers:{accept:'application/json',authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)});
  if(response.status!==200){try{await response.body?.cancel();}catch{}return failed(response.status===401?'CIRCLE_AUTHENTICATION_FAILED':'CIRCLE_CONFIG_READ_UNAVAILABLE',{httpStatus:response.status,networkCalls:1});}
  const body=await readJson(response),appId=body?.data?.appId;
  if(typeof appId!=='string'||! /^[a-f0-9-]{36}$/i.test(appId))return failed('CIRCLE_CONFIG_RESPONSE_INVALID',{httpStatus:200,networkCalls:1});
  if(appId.toLowerCase()!==publicConfig.circleAppId.toLowerCase())return failed('CIRCLE_APP_ID_MISMATCH',{httpStatus:200,networkCalls:1});
  return {...base,result:'PASS',httpStatus:200,networkCalls:1,circleCredentialVerified:true,circleAppIdMatches:true,mainnetKeyPrefixVerified:true,
   arcWalletOperationVerified:false,otpVerified:false,endpoint:CIRCLE_URL};
 }catch{return failed('CIRCLE_READONLY_REQUEST_FAILED',{networkCalls:1});}
}
async function checkBlockscout(apiKey,verifyConnection,fetcher=fetch){
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')return failed('INDEXER_TLS_VALIDATION_DISABLED',{networkCalls:0});
 if(typeof apiKey!=='string'||!/^proapi_[\x21-\x7e]{1,512}$/.test(apiKey))return failed('INDEXER_KEY_FORMAT_INVALID',{networkCalls:0});
 if(!verifyConnection)return {...base,result:'PASS',indexerConfigurationPresent:true,indexerReadVerified:false,networkCalls:0};
 try{
  const endpoint=blockscoutUrl();
  const response=await fetcher(endpoint,{method:'GET',redirect:'error',headers:{accept:'application/json',authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)});
  if(response.status!==200){try{await response.body?.cancel();}catch{}return failed(response.status===401||response.status===402?'INDEXER_AUTHENTICATION_FAILED':'INDEXER_READ_UNAVAILABLE',{httpStatus:response.status,networkCalls:1});}
  const body=await readJson(response,1024*1024);
  if(!Array.isArray(body?.items)||body.items.length>50||!Object.hasOwn(body,'next_page_params')||!body.items.every(r=>r?.token?.type==='ERC-20'&&/^0x[a-f0-9]{40}$/i.test(r.token.address_hash)))return failed('INDEXER_RESPONSE_INVALID',{httpStatus:200,networkCalls:1});
  return {...base,result:'PASS',httpStatus:200,networkCalls:1,indexerConfigurationPresent:true,indexerReadVerified:true,chainId:5042,endpoint,holdingsComparedToRpc:false};
 }catch{return failed('INDEXER_READONLY_REQUEST_FAILED',{networkCalls:1});}
}
module.exports={smtpOptions,checkSmtp,checkCircle,checkBlockscout,CIRCLE_URL,blockscoutUrl};
if(require.main===module){
 (async()=>{
  let result;try{
   if(process.argv.length!==2)throw Error();const chunks=[];let size=0;
   for await(const chunk of process.stdin){size+=chunk.length;if(size>16384)throw Error();chunks.push(chunk);}
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(input?.provider==='circle'&&Object.keys(input).sort().join(',')==='circleApiKey,provider')result=await checkCircle(input.circleApiKey);
   else if(input?.provider==='smtp'&&Object.keys(input).sort().join(',')==='provider,settings,verifyConnection'&&typeof input.verifyConnection==='boolean')result=await checkSmtp(input.settings,input.verifyConnection);
   else if(input?.provider==='blockscout'&&Object.keys(input).sort().join(',')==='apiKey,provider,verifyConnection'&&typeof input.verifyConnection==='boolean')result=await checkBlockscout(input.apiKey,input.verifyConnection);
   else throw Error();
  }catch{result=failed('PROVIDER_INPUT_INVALID');}
  process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.result==='PASS'?0:1;
 })();
}
