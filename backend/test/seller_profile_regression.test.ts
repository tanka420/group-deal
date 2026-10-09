import assert from 'node:assert/strict';
import {ethers} from 'ethers';import {store} from '../src/db/store';import {AuthService} from '../src/services/authService';
async function run(){
 const existing=ethers.Wallet.createRandom(),outsider=ethers.Wallet.createRandom();store.db.users.fixture={id:'fixture',email:'fixture@example.test',loginMethod:'EVM_WALLET',roles:['buyer'],activeWallet:existing.address,createdAt:0};store.db.userByWallet[existing.address.toLowerCase()]='fixture';store.save();
 try{for(const wallet of [outsider,existing]){
  const before=JSON.stringify(store.db);assert.throws(()=>AuthService.issueWalletChallenge('fixture','SELLER_PAYOUT',wallet.address),/SELLER_PROFILE_INTENT_REQUIRED/);
  const message='Retired legacy SELLER_PAYOUT API',proofSignature=await outsider.signMessage(message);
  assert.throws(()=>AuthService.setupSellerProfile('fixture',{displayName:'Fixture seller',bio:'Fixture description',payoutWallet:wallet.address,challengeMessage:message,proofSignature}),/SELLER_PROFILE_INTENT_REQUIRED/);
  assert.throws(()=>AuthService.consumeWalletChallenge('fixture','SELLER_PAYOUT',wallet.address,message),/SELLER_PROFILE_INTENT_REQUIRED/);
  assert.equal(JSON.stringify(store.db),before,'Retired payout calls must preserve account/challenge/audit state');
 }console.log('PASS seller profile legacy issuer/consumer retired; target-only and invalid proof leave complete state unchanged.');}finally{store.close()}
}
run().catch(()=>{console.error('FAIL seller profile legacy authority or atomicity regression');process.exitCode=1});
