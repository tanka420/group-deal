import assert from "node:assert/strict";
import { ethers } from "ethers";
import jwt from "jsonwebtoken";
import { config } from "../src/config";
import { store } from "../src/db/store";
import { validateRuntimeSecurity } from "../src/services/runtimeSecurity";
import { authMiddleware } from "../src/middleware/auth";

const signer=ethers.Wallet.createRandom(),operator=ethers.Wallet.createRandom().address;
const runtime={...config,isProduction:false,arcChainId:5042002,jwtSecret:"fixture-session-secret-32-characters",campaignIdentitySecret:"fixture-identity-secret-32-characters",masterEncryptionKey:"fixture-encryption-secret-32-characters",masterEncryptionKeyId:"secure-v2",authorizedSignerPrivateKey:signer.privateKey,operatorAddress:operator};
const environment={JWT_SECRET:runtime.jwtSecret,CAMPAIGN_IDENTITY_SECRET:runtime.campaignIdentitySecret,MASTER_ENCRYPTION_KEY:runtime.masterEncryptionKey,AUTHORIZED_SIGNER_PRIVATE_KEY:runtime.authorizedSignerPrivateKey,OPERATOR_ADDRESS:runtime.operatorAddress};
validateRuntimeSecurity(runtime,environment);
for(const name of Object.keys(environment))assert.throws(()=>validateRuntimeSecurity(runtime,{...environment,[name]:undefined}),/RUNTIME_SECURITY_INVALID/);
assert.throws(()=>validateRuntimeSecurity({...runtime,jwtSecret:"groupdeal-super-secret-jwt-key-2026"},{...environment,JWT_SECRET:"groupdeal-super-secret-jwt-key-2026"}),/non-default/);
assert.throws(()=>validateRuntimeSecurity({...runtime,masterEncryptionKey:"short"},{...environment,MASTER_ENCRYPTION_KEY:"short"}),/32 characters/);
assert.throws(()=>validateRuntimeSecurity({...runtime,masterEncryptionKey:runtime.jwtSecret},{...environment,MASTER_ENCRYPTION_KEY:runtime.jwtSecret}),/distinct/);
assert.throws(()=>validateRuntimeSecurity({...runtime,masterEncryptionKeyId:"constructor"},environment),/key ID/);
assert.throws(()=>validateRuntimeSecurity({...runtime,authorizedSignerPrivateKey:"invalid"},{...environment,AUTHORIZED_SIGNER_PRIVATE_KEY:"invalid"}),error=>error instanceof Error&&!error.message.includes("invalid\"")&&!error.message.includes("privateKey=")&&error.message.includes("missing or invalid"));
assert.throws(()=>validateRuntimeSecurity({...runtime,operatorAddress:signer.address},{...environment,OPERATOR_ADDRESS:signer.address}),/distinct/);
assert.throws(()=>validateRuntimeSecurity(runtime,{...environment,OPERATOR_ADDRESS:ethers.Wallet.createRandom().address}),/non-development/);
assert.throws(()=>validateRuntimeSecurity({...runtime,operatorAddress:"0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"},{...environment,OPERATOR_ADDRESS:"0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"}),/non-development/);
assert.throws(()=>validateRuntimeSecurity({...runtime,operatorAddress:"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"},environment),/non-development/);
assert.throws(()=>validateRuntimeSecurity({...runtime,arcChainId:1},environment),/unsupported chain/);
validateRuntimeSecurity({...runtime,arcChainId:31337},{});
console.log("PASS Arc runtime rejects development/default/missing/reused secrets and invalid signer/operator without leaking key material; explicit local development remains available");

store.db.users.sessionUser={id:"sessionUser",email:"user@fixture.invalid",roles:["buyer"],createdAt:0,activeWallet:null};
store.save();
function request(token:string):{code:number;next:boolean} {
  let code=0,next=false;authMiddleware({originalUrl:'/api/auth/me',method:'GET',headers:{authorization:`Bearer ${token}`}} as any,{status:(value:number)=>{code=value;return {json:()=>{}};}} as any,()=>{next=true;});return {code,next};
}
assert.equal(request(jwt.sign({userId:"sessionUser"},config.jwtSecret,{expiresIn:"1h"})).next,true);
assert.equal(request(jwt.sign({userId:"sessionUser"},config.jwtSecret,{algorithm:"HS384",expiresIn:"1h"})).code,401);
assert.equal(request(jwt.sign({userId:"sessionUser"},config.jwtSecret)).code,401);
assert.equal(request(jwt.sign({userId:{id:"sessionUser"}},config.jwtSecret,{expiresIn:"1h"})).code,401);
assert.equal(request(jwt.sign({userId:"sessionUser",iat:Math.floor(Date.now()/1000)+120},config.jwtSecret,{expiresIn:"1h"})).code,401);
assert.equal(request(jwt.sign({userId:"sessionUser"},config.jwtSecret,{expiresIn:-1})).code,401);
assert.equal(request(jwt.sign({userId:"constructor"},config.jwtSecret,{expiresIn:"1h"})).code,401);
console.log("PASS sessions require HS256, bounded account ID, issued-at/expiry, and reject future/expired claims");
store.close();
