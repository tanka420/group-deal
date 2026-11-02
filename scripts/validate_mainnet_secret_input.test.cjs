const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),path=require('node:path');
const {ethers}=require('../backend/node_modules/ethers');
const {validateSecretInput}=require('./validate_mainnet_secret_input.cjs');
const source=require('../shared/manifests/arc-mainnet.json');
const api='LIVE_API_KEY:ISOLATED_FIXTURE:'+crypto.randomBytes(24).toString('hex');
const key='0x'+crypto.randomBytes(32).toString('hex'),address=ethers.computeAddress(key);
const manifest=structuredClone(source);manifest.roles.authorizedSigner.address=address;
test('local input derives only the expected separate signer without exposing secrets',()=>{
 const result=validateSecretInput({circleApiKey:api,signerPrivateKey:key},manifest);
 assert.equal(result.result,'PASS');assert.equal(result.signerAddress,address);assert.equal(result.networkCalls,0);assert.equal(result.signaturesCreated,0);assert.equal(result.circleCredentialVerified,false);
 for(const secret of [api,key,key.slice(2)])assert(!JSON.stringify(result).includes(secret));
});
test('wrong key, role collision, wrong environment and malformed provider key are rejected',()=>{
 assert.equal(validateSecretInput({circleApiKey:api,signerPrivateKey:key},source).code,'SIGNER_ADDRESS_MISMATCH');
 const collision=structuredClone(manifest);collision.roles.owner.address=address;
 assert.equal(validateSecretInput({circleApiKey:api,signerPrivateKey:key},collision).code,'SIGNER_ROLE_COLLISION');
 assert.equal(validateSecretInput({circleApiKey:api,signerPrivateKey:key},{...manifest,chainId:5042002}).code,'EXPECTED_MAINNET_SIGNER_MISSING');
 for(const badApi of ['TEST_API_KEY:'+api,'<YOUR_KEY>',api+'\r\nAuthorization: secret',key])assert.equal(validateSecretInput({circleApiKey:badApi,signerPrivateKey:key},manifest).result,'FAIL');
 for(const badKey of ['secret phrase words','0x'+'00'.repeat(32),key+'\n'])assert.equal(validateSecretInput({circleApiKey:api,signerPrivateKey:badKey},manifest).result,'FAIL');
});
test('CLI never echoes invalid JSON, oversized input, wrong key or accidental argv secrets',()=>{
 for(const [stdin,args]of [[api,[]],[JSON.stringify({circleApiKey:api,signerPrivateKey:key}),[]],[JSON.stringify({secret:api.repeat(300)}),[]],['{}',[api]]]){
  const result=spawnSync(process.execPath,[path.join(__dirname,'validate_mainnet_secret_input.cjs'),...args],{input:stdin,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,1);assert.equal(result.stderr,'');const output=JSON.parse(result.stdout);assert.equal(output.result,'FAIL');
  for(const secret of [api,key,key.slice(2)])assert(!result.stdout.includes(secret));
 }
});
