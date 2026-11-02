// Local derivation only. Never import backend config, contact a provider or log inputs/errors.
const fs=require('node:fs');
const {ethers}=require('../backend/node_modules/ethers');
function validateSecretInput(input,manifest){
 const fail=code=>({result:'FAIL',code,networkCalls:0,signaturesCreated:0});
 if(manifest?.environment!=='arc-mainnet'||manifest.chainId!==5042||!ethers.isAddress(manifest.roles?.authorizedSigner?.address))return fail('EXPECTED_MAINNET_SIGNER_MISSING');
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='circleApiKey,signerPrivateKey')return fail('SECRET_INPUT_INVALID');
 const api=input.circleApiKey,key=input.signerPrivateKey;
 if(typeof api!=='string'||api!==api.trim()||api.length<16||api.length>4096||!/^[\x21-\x7e]+$/.test(api)
  ||/^(?:TEST|SANDBOX)(?:_|:|-)/i.test(api)||/^(?:0x)?[\da-f]{64}$/i.test(api)||/YOUR_|<|>/i.test(api))return fail('CIRCLE_KEY_FORMAT_INVALID_OR_TEST_KEY');
 if(typeof key!=='string'||!/^(?:0x)?[\da-f]{64}$/i.test(key))return fail('SIGNER_KEY_FORMAT_INVALID');
 let signerAddress;
 try{signerAddress=ethers.computeAddress(key.startsWith('0x')?key:'0x'+key);}catch{return fail('SIGNER_KEY_FORMAT_INVALID');}
 if(signerAddress.toLowerCase()!==manifest.roles.authorizedSigner.address.toLowerCase())return fail('SIGNER_ADDRESS_MISMATCH');
 if(['owner','operator'].some(role=>manifest.roles[role]?.address?.toLowerCase()===signerAddress.toLowerCase()))return fail('SIGNER_ROLE_COLLISION');
 return {result:'PASS',signerAddress,signerMatchesManifest:true,circleKeyPresent:true,circleCredentialVerified:false,networkCalls:0,signaturesCreated:0};
}
module.exports={validateSecretInput};
if(require.main===module){
 (async()=>{
  let output;
  try{
   if(process.argv.length!==2)throw Error();
   const chunks=[];let size=0;
   for await(const chunk of process.stdin){size+=chunk.length;if(size>16384)throw Error();chunks.push(chunk);}
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const manifest=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../shared/manifests/arc-mainnet.json'),'utf8'));
   output=validateSecretInput(input,manifest);
  }catch{output={result:'FAIL',code:'SECRET_INPUT_UNREADABLE',networkCalls:0,signaturesCreated:0};}
  process.stdout.write(JSON.stringify(output)+'\n');
  process.exitCode=output.result==='PASS'?0:1;
 })();
}
